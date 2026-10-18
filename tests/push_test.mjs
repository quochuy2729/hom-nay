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
      const out = structuredClone(hit);   // như Supabase thật: trả bản sao, không phải chính dòng trong bảng
      return { data: st.single ? out[0] || null : out, error: null };
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

/* ---------- 2. bù mốc nhắc bị lỡ khi cron trễ ---------- */
// Giờ giả lập: 18/10/2026 13:05 giờ Việt Nam. vn(h, m, ngày) → mili giây UTC.
const vn = (h, m, d = 18) => Date.UTC(2026, 9, d, h - 7, m);
const NOW = vn(13, 5), MIN = 60e3;
const iso = ms => new Date(ms).toISOString();
const SUB = { endpoint: "https://fcm.googleapis.com/fcm/send/may-1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", user_id: "u1", p256dh: "x", auth: "y", tz: 420, prefs: { m15: true } };
const task = (id, title, due, time, extra = {}) => ({ id, user_id: "u1", kind: "task", deleted: false, server_at: iso(vn(9, 0, 16)),
  data: { title, due, time, status: "todo", type: "bai", createdAt: vn(9, 0, 16), ...extra } });
async function tick(sb, now) {
  const sent = [];
  const fn = load(sb);
  const [st, out] = await fn.handle({ body: { action: "tick" }, secret: "khoa-dung", sb, now,
    sendPush: async (sub, payload) => { sent.push({ to: sub.endpoint, ...payload }); return 201; },
    generateVapid: async () => ({ publicKey: "PUB", privateJwk: {} }), remindersFor: fn.remindersFor });
  return { st, out, sent };
}
{
  // cron ngừng từ 11:55 (project bị tạm dừng), chạy lại lúc 13:05: trễ hơn 1 tiếng
  const sb = fakeSb({ tables: { push_subs: [{ ...SUB }], push_config: [{ id: 1, public_key: "PUB", private_jwk: {}, last_tick: iso(NOW - 70 * MIN) }], hn_items: [
    task("t1", "Nộp BTL Giải tích", "2026-10-18", "14:00"),            // mốc 2 tiếng 12:00: lỡ
    task("t3", "Họp nhóm đồ án", "2026-10-18", "14:30"),               // mốc 2 tiếng 12:30: lỡ
    task("t2", "Đóng học phí", "2026-10-18", "", { amount: 5e6 }),     // mốc 7:00 sáng: trước lúc cron ngừng, không bù
    task("t4", "Nộp đơn", "2026-10-18", "12:55"),                       // mốc 15 phút 12:40 lỡ, nhưng đã quá hạn: không bù
    task("t6", "Gọi thầy", "2026-10-18", "14:20", { createdAt: NOW - 10 * MIN }),  // tạo sau mốc 12:20: không phải "lỡ"
    task("t7", "Đã xong rồi", "2026-10-18", "14:10", { status: "done" })
  ] } });
  const r = await tick(sb, NOW);
  ok("bù: cron trễ 1 tiếng thì nhận đúng một thông báo", r.st === 200 && r.sent.length === 1, JSON.stringify(r.sent));
  const m = r.sent[0] || {};
  ok("bù: thông báo gộp ghi số việc", /2 việc/.test(m.title || ""), m.title);
  ok("bù: gộp đúng việc chưa tới hạn đã lỡ nhắc", /Nộp BTL Giải tích/.test(m.body) && /Họp nhóm đồ án/.test(m.body), m.body);
  ok("bù: không gộp việc quá hạn, việc tạo sau mốc, việc đã xong, mốc trước lúc cron ngừng",
     !/Nộp đơn|Gọi thầy|Đã xong|học phí/.test(m.body), m.body);
  ok("bù: kết quả có trường late", r.out.late === 1, JSON.stringify(r.out));
  ok("bù: ghi last_tick sau mỗi lần chạy", sb.db.push_config[0].last_tick === iso(NOW));
  const again = await tick(sb, NOW + 5 * MIN);
  ok("bù: lần chạy kế tiếp không gửi lại", again.sent.length === 0, JSON.stringify(again.sent));
}
{
  // chỉ lỡ một việc: thông báo mang tên việc, chạm vào mở đúng việc đó
  const sb = fakeSb({ tables: { push_subs: [{ ...SUB }], push_config: [{ id: 1, public_key: "PUB", private_jwk: {}, last_tick: iso(NOW - 70 * MIN) }],
    hn_items: [task("t1", "Nộp BTL Giải tích", "2026-10-18", "14:00")] } });
  const r = await tick(sb, NOW); const m = r.sent[0] || {};
  ok("bù: lỡ một việc thì tiêu đề là tên việc, body có giờ hạn", r.sent.length === 1 && /Nộp BTL Giải tích/.test(m.title) && /14:00 hôm nay/.test(m.body), JSON.stringify(m));
  ok("bù: chạm vào mở đúng việc", m.url === "./?task=t1", m.url);
}
{
  // cron trễ đúng 1 tiếng nhưng 20 phút gần nhất vẫn có mốc thường: gửi mốc thường, không gộp trùng việc đó
  const sb = fakeSb({ tables: { push_subs: [{ ...SUB }], push_config: [{ id: 1, public_key: "PUB", private_jwk: {}, last_tick: iso(vn(12, 5, 17)) }],
    hn_items: [task("tA", "Thi Vật lý", "2026-10-18", "15:00")] } });   // mốc 1 ngày (hôm qua 15:00) lỡ, mốc 2 tiếng 13:00 đang tới
  const r = await tick(sb, NOW);
  ok("bù: việc vừa có nhắc thường thì không nằm trong thông báo gộp", r.sent.length === 1 && /2 tiếng/.test(r.sent[0].body), JSON.stringify(r.sent));
  ok("bù: mốc lỡ vẫn được đánh dấu đã xử lý", sb.db.push_sent.some(x => x.key.startsWith("tA|d1|")), JSON.stringify(sb.db.push_sent));
}
{
  // lần chạy đầu tiên (chưa có last_tick) và database chưa có cột last_tick: không bù, vẫn chạy bình thường
  const mk = () => ({ push_subs: [{ ...SUB }], hn_items: [task("t1", "Nộp BTL Giải tích", "2026-10-18", "14:00")] });
  const first = await tick(fakeSb({ tables: mk() }), NOW);
  ok("bù: chưa có last_tick thì không gửi bù", first.st === 200 && first.sent.length === 0, JSON.stringify(first));
  const sbOld = fakeSb({ tables: mk() }); sbOld.db.noLastTick = true;
  const old = await tick(sbOld, NOW);
  ok("bù: chưa chạy SQL thêm cột last_tick thì tick vẫn chạy", old.st === 200 && old.sent.length === 0, JSON.stringify(old.out));
}
{
  // cron chạy đều (5 phút trước): không có gì để bù
  const sb = fakeSb({ tables: { push_subs: [{ ...SUB }], push_config: [{ id: 1, public_key: "PUB", private_jwk: {}, last_tick: iso(NOW - 5 * MIN) }],
    hn_items: [task("t1", "Nộp BTL Giải tích", "2026-10-18", "14:00")] } });
  const r = await tick(sb, NOW);
  ok("bù: cron chạy đều thì không gửi bù", r.sent.length === 0, JSON.stringify(r.sent));
}

/* ---------- 3. chỉ gửi tới dịch vụ push thật (chống dùng hàm để POST tới địa chỉ bất kỳ) ---------- */
{
  const evil = { ...SUB, endpoint: "https://evil.example/hook-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };
  const fcm = { ...SUB, endpoint: "https://fcm.googleapis.com/fcm/send/cccccccccccccccccccccccccccccccc" };
  const sb = fakeSb({ tables: { push_subs: [evil, fcm], push_config: [{ id: 1, public_key: "PUB", private_jwk: {}, last_tick: iso(NOW - 5 * MIN) }],
    hn_items: [task("tA", "Thi Vật lý", "2026-10-18", "15:00")] } });   // mốc 2 tiếng 13:00 đang tới
  const r = await tick(sb, NOW);
  ok("endpoint: không gửi tới địa chỉ lạ", !r.sent.some(m => m.to.startsWith("https://evil.example")), JSON.stringify(r.sent.map(m => m.to)));
  ok("endpoint: vẫn gửi tới FCM", r.sent.some(m => m.to.startsWith("https://fcm.googleapis.com/")));
  ok("endpoint: đăng ký địa chỉ lạ bị xóa", !sb.db.push_subs.some(x => x.endpoint === evil.endpoint));
  const fn = load(sb);
  const allowed = ["https://fcm.googleapis.com/fcm/send/x", "https://web.push.apple.com/QK", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://wns2-sg2p.notify.windows.com/w/?token=x"];
  const denied = ["http://fcm.googleapis.com/x", "https://fcm.googleapis.com.evil.example/x", "https://evilpush.apple.com.example/x", "https://169.254.169.254/latest", "https://localhost/x"];
  const check = new Function("Deno", "createClient", `${SRC}\nreturn pushEndpointOk;`)({ env: { get: () => "x" }, serve() {} }, () => sb);
  ok("endpoint: nhận đúng các dịch vụ push thật", allowed.every(check), allowed.filter(u => !check(u)).join(", "));
  ok("endpoint: từ chối http, tên miền giả, IP nội bộ", !denied.some(check), denied.filter(check).join(", "));
}

const fails = results.filter(r => !r[0]);
for (const [good, name, extra] of results) console.log(`${good ? "PASS" : "FAIL"} push: ${name}${!good && extra ? "  " + extra : ""}`);
process.exit(fails.length ? 1 : 0);
