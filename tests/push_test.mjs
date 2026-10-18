// Kiểm thử hàm hn-push ngoài Supabase: chạy `node tests/push_test.mjs` (smoke.py tự gọi).
// Nạp nguyên index.ts (bỏ dòng import), thay Deno và createClient bằng bản giả, database giả trong bộ nhớ.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = readFileSync(fileURLToPath(new URL("../supabase/functions/hn-push/index.ts", import.meta.url)), "utf8")
  .replace(/^import .*$/m, "");
const results = [];
const ok = (name, cond, extra = "") => results.push([!!cond, name, extra]);

/* ---------- Supabase giả ---------- */
function fakeSb({ secret = "khoa-dung", tables = {} } = {}) {
  const db = { push_subs: [], push_sent: [], push_config: [{ id: 1, public_key: "PUB", private_jwk: {} }], hn_items: [], ...tables };
  const log = [];
  const col = (r, c) => c.includes("->>") ? (r[c.split("->>")[0]] || {})[c.split("->>")[1]] : r[c];
  const from = table => {
    const st = { op: "select", f: [], row: null, single: false, cols: null };
    const run = () => {
      log.push({ table, op: st.op });
      const rows = db[table] || (db[table] = []);
      const hit = rows.filter(r => st.f.every(fn => fn(r)));
      if (st.op === "insert") {
        if (table === "push_sent" && rows.some(r => r.key === st.row.key)) return { error: { message: "duplicate key" } };
        rows.push({ sent_at: new Date().toISOString(), ...st.row }); return { error: null };
      }
      if (st.op === "update") { hit.forEach(r => Object.assign(r, st.row)); return { error: null }; }
      if (st.op === "delete") { db[table] = rows.filter(r => !hit.includes(r)); return { error: null }; }
      if (st.cols && table === "push_config" && st.cols.includes("last_tick") && db.noLastTick) return { data: null, error: { message: "column push_config.last_tick does not exist" } };
      return { data: st.single ? hit[0] || null : hit, error: null };
    };
    const api = {
      select(c) { st.cols = c || null; return api; }, insert(r) { st.op = "insert"; st.row = r; return api; },
      update(r) { st.op = "update"; st.row = r; return api; }, delete() { st.op = "delete"; return api; },
      eq(c, v) { st.f.push(r => col(r, c) === v); return api; }, in(c, vs) { st.f.push(r => vs.includes(col(r, c))); return api; },
      gte(c, v) { st.f.push(r => col(r, c) >= v); return api; }, lte(c, v) { st.f.push(r => col(r, c) <= v); return api; },
      lt(c, v) { st.f.push(r => col(r, c) < v); return api; }, maybeSingle() { st.single = true; return api; },
      then(res, rej) { return Promise.resolve().then(run).then(res, rej); }
    };
    return api;
  };
  const rpc = async (name, args) => {
    log.push({ rpc: name, args });
    if (name === "hn_push_secret_ok") return { data: secret == null ? null : args.k === secret, error: null };
    return { data: null, error: { message: `không có hàm ${name}` } };
  };
  return { db, log, from, rpc, auth: { getUser: async () => ({ data: { user: null } }) } };
}

/* ---------- nạp index.ts ---------- */
function load(sb) {
  let handler = null;
  const Deno = { env: { get: () => "x" }, serve: fn => { handler = fn; } };
  const exp = new Function("Deno", "createClient", `${SRC}\nreturn { handle, remindersFor };`)(Deno, () => sb);
  const call = (body, headers = {}) => handler(new Request("https://x.supabase.co/functions/v1/hn-push", {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: body === undefined ? "" : JSON.stringify(body)
  })).then(async r => [r.status, await r.json()]);
  return { ...exp, call };
}

/* ---------- 1. tick cần khóa bí mật ---------- */
{
  const sb = fakeSb(); const fn = load(sb);
  let [st, out] = await fn.call({ action: "tick" });
  ok("tick: không có header thì 401", st === 401, JSON.stringify(out));
  ok("tick: không có header thì không đọc database", !sb.log.some(x => x.table === "push_subs" || x.table === "hn_items" || x.rpc), JSON.stringify(sb.log));
  [st] = await fn.call(undefined);
  ok("tick: body trống (mặc định là tick) cũng 401", st === 401);
  [st] = await fn.call({ action: "tick" }, { "x-hn-secret": "khoa-sai" });
  ok("tick: sai khóa thì 401", st === 401);
  [st, out] = await fn.call({ action: "tick" }, { "x-hn-secret": "khoa-dung" });
  ok("tick: đúng khóa thì chạy (200)", st === 200 && "sent" in out, JSON.stringify(out));
  [st, out] = await fn.call({ action: "vapid" });
  ok("vapid: không cần khóa, vẫn trả publicKey", st === 200 && out.publicKey === "PUB", JSON.stringify(out));
  [st] = await fn.call({ action: "xoa-het" }, { "x-hn-secret": "khoa-dung" });
  ok("action lạ thì 400", st === 400);
}
{
  const sb = fakeSb({ secret: null }); const fn = load(sb);
  const [st, out] = await fn.call({ action: "tick" }, { "x-hn-secret": "gi-cung-duoc" });
  ok("tick: Vault chưa có khóa thì 503 kèm hướng dẫn", st === 503 && /push\.sql/.test(out.error || ""), JSON.stringify(out));
}

const fails = results.filter(r => !r[0]);
for (const [good, name, extra] of results) console.log(`${good ? "PASS" : "FAIL"} push: ${name}${!good && extra ? "  " + extra : ""}`);
process.exit(fails.length ? 1 : 0);
