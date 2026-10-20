// Kiểm thử hàm hn-push ngoài Supabase: chạy `node tests/push_test.mjs` (smoke.py tự gọi).
// Nạp nguyên index.ts (bỏ dòng import), thay Deno và createClient bằng bản giả, database giả trong bộ nhớ.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC = readFileSync(fileURLToPath(new URL("../supabase/functions/hn-push/index.ts", import.meta.url)), "utf8")
  .replace(/^import .*$/gm, "");
// sched.js của hàm (bản sao) phải giống hệt sched.js của app: hai bên tính tuần học, buổi học, buổi tập cùng một cách
const SCHED_FN = readFileSync(fileURLToPath(new URL("../supabase/functions/hn-push/sched.js", import.meta.url)), "utf8");
const SCHED_APP = readFileSync(fileURLToPath(new URL("../sched.js", import.meta.url)), "utf8");
new Function(SCHED_FN)();   // như `import "./sched.js"` trong index.ts: đặt globalThis.HN_SCHED
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
  const exp = new Function("Deno", "createClient", `${SRC}\nreturn { handle, remindersFor, extraReminders, userSettings };`)(Deno, () => sb);
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

/* ---------- 4. (2.8) lịch học, buổi tập, tổng kết tuần ---------- */
const S = globalThis.HN_SCHED;
ok("2.8 sched.js của hàm giống hệt sched.js của app (sửa một bên thì chép đè sang bên kia)", SCHED_FN === SCHED_APP);
{
  // tuần ISO: đối chiếu các mốc biên (đầu năm, năm có 53 tuần) với lịch tuần ISO chuẩn
  const cases = [["2026-10-18", 42], ["2026-10-19", 43], ["2026-01-01", 1], ["2025-12-29", 1], ["2026-12-28", 53], ["2027-01-03", 53], ["2027-01-04", 1], ["2024-12-30", 1], ["2021-01-03", 53], ["2020-12-31", 53]];
  const bad = cases.filter(([d, w]) => S.isoWeek(d) !== w);
  ok("2.8 tuần ISO đúng ở các ngày biên (53 tuần, qua năm)", !bad.length, JSON.stringify(bad.map(([d]) => [d, S.isoWeek(d)])));
  const c = { days: [1, 3], weeks: [43, 45], absent: ["2026-11-04"] };
  ok("2.8 buổi học: đúng thứ và tuần học", S.classMeets(c, "2026-10-19") && S.classMeets(c, "2026-10-21") && !S.classMeets(c, "2026-10-20") && !S.classMeets(c, "2026-10-26"));
  ok("2.8 buổi học: buổi đã báo vắng thì không nhắc, không ghi tuần = tuần nào cũng học", !S.classMeets(c, "2026-11-04", true) && S.classMeets(c, "2026-11-04") && S.classMeets({ days: [0], weeks: [] }, "2026-10-18"));
}
const U = "u1", item = (id, kind, data, extra = {}) => ({ id, user_id: U, kind, deleted: false, data, updated_at: iso(vn(8, 0, 1)), server_at: iso(vn(8, 0, 1)), ...extra });
const setting = (key, value, at = vn(8, 0, 1)) => item(`s-${key}-${at}`, "setting", { key, value }, { updated_at: iso(at), server_at: iso(at) });
const GT = item("c1", "class", { title: "Giải tích 1", days: [1], start: "07:00", end: "09:00", room: "H1-201", weeks: [43, 44], absent: ["2026-10-26"] });
const PLAN = item("p1", "gymplan", { name: "Kéo đẩy", start: "2026-10-01", until: "", days: [{ name: "Kéo", dows: [1], items: [{ ex: "Hít xà", n: 4, lo: 8 }, { ex: "Chèo tạ", n: 3, lo: 10 }, { ex: "Plank", n: 3, lo: 45, unit: "giây" }] }, { name: "Nghỉ", dows: [2], rest: true, items: [] }] });
const cfg = (last) => [{ id: 1, public_key: "PUB", private_jwk: {}, last_tick: iso(last) }];
const mk = (rows, last) => fakeSb({ tables: { push_subs: [{ ...SUB }], push_config: cfg(last), hn_items: rows } });
{
  // thứ Hai 19/10 (tuần 43), nhắc trước 15 phút: 6:45
  const rows = () => [GT, setting("classRemind", 15)];
  let r = await tick(mk(rows(), vn(6, 40, 19)), vn(6, 44, 19));
  ok("2.8 lớp: 6:44 chưa tới mốc 15 phút thì chưa gửi", r.st === 200 && r.sent.length === 0, JSON.stringify(r.out));
  const sb = mk(rows(), vn(6, 40, 19));
  r = await tick(sb, vn(6, 45, 19));
  const m = r.sent[0] || {};
  ok("2.8 lớp: đúng 6:45 gửi '📚 15 phút nữa: Giải tích 1 · H1-201'", r.sent.length === 1 && m.title === "📚 15 phút nữa: Giải tích 1 · H1-201", JSON.stringify(r.sent));
  ok("2.8 lớp: chạm vào mở tab Lịch đúng ngày", m.url === "./?tab=cal&date=2026-10-19" && /07:00/.test(m.body), JSON.stringify(m));
  ok("2.8 lớp: khóa chống trùng phân biệt loại và ngày", sb.db.push_sent.some(x => x.key.startsWith("cls|c1|2026-10-19|07:00|15|")), JSON.stringify(sb.db.push_sent));
  r = await tick(sb, vn(6, 50, 19));
  ok("2.8 lớp: lần chạy sau không gửi trùng", r.sent.length === 0, JSON.stringify(r.sent));
  r = await tick(mk(rows(), vn(6, 55, 19)), vn(7, 0, 19));
  ok("2.8 lớp: tới giờ vào lớp (7:00) thì thôi nhắc", r.sent.length === 0, JSON.stringify(r.sent));
  r = await tick(mk(rows(), vn(6, 40, 12)), vn(6, 45, 12));
  ok("2.8 lớp: tuần 42 không có trong tuần học thì không nhắc", r.sent.length === 0);
  r = await tick(mk(rows(), vn(6, 40, 26)), vn(6, 45, 26));
  ok("2.8 lớp: buổi đã báo vắng (26/10) thì không nhắc", r.sent.length === 0);
  r = await tick(mk([GT, setting("classRemind", 15, vn(8, 0, 1)), setting("classRemind", 0, vn(9, 0, 1))], vn(6, 40, 19)), vn(6, 45, 19));
  ok("2.8 lớp: cài đặt mới nhất (tắt) thắng bản cũ", r.sent.length === 0);
  r = await tick(mk([GT], vn(6, 40, 19)), vn(6, 45, 19));
  ok("2.8 lớp: mặc định tắt (chưa có classRemind)", r.sent.length === 0);
  r = await tick(mk([{ ...GT, data: { ...GT.data, start: "00:10" } }, setting("classRemind", 30)], vn(23, 35, 18)), vn(23, 40, 18));
  ok("2.8 lớp: giờ biên qua nửa đêm (lớp 0:10 thứ Hai, nhắc 23:40 Chủ nhật)", r.sent.length === 1 && r.sent[0].url === "./?tab=cal&date=2026-10-19", JSON.stringify(r.sent));
}
{
  // buổi tập theo giáo án: nhắc lúc 18:00 nếu hôm nay có buổi mà chưa tập
  const rows = extra => [PLAN, setting("gymRemind", "18:00"), ...extra];
  let r = await tick(mk(rows([]), vn(17, 55, 19)), vn(18, 0, 19));
  const m = r.sent[0] || {};
  ok("2.8 tập: thứ Hai có buổi Kéo chưa tập thì nhắc '💪 Hôm nay: Buổi Kéo · 3 bài'", r.sent.length === 1 && m.title === "💪 Hôm nay: Buổi Kéo · 3 bài" && m.url === "./?gymday=2026-10-19", JSON.stringify(r.sent));
  r = await tick(mk(rows([item("w1", "workout", { date: "2026-10-19", items: [{ ex: "Hít xà", sets: [8] }] })]), vn(17, 55, 19)), vn(18, 0, 19));
  ok("2.8 tập: đã tập hôm nay thì không nhắc", r.sent.length === 0, JSON.stringify(r.sent));
  r = await tick(mk(rows([item("w2", "workout", { date: "2026-10-18", planDate: "2026-10-19", items: [{ ex: "Hít xà", sets: [8] }] })]), vn(17, 55, 19)), vn(18, 0, 19));
  ok("2.8 tập: đã tập trước cho buổi hôm nay (planDate) thì không nhắc", r.sent.length === 0, JSON.stringify(r.sent));
  r = await tick(mk(rows([item("w3", "workout", { date: "2026-10-12", items: [{ ex: "Hít xà", sets: [8] }] })]), vn(17, 55, 19)), vn(18, 0, 19));
  ok("2.8 tập: buổi tập tuần trước không tính là đã tập hôm nay", r.sent.length === 1);
  r = await tick(mk(rows([]), vn(17, 55, 20)), vn(18, 0, 20));
  ok("2.8 tập: ngày nghỉ theo giáo án (thứ Ba) thì không nhắc", r.sent.length === 0);
  r = await tick(mk([PLAN, setting("gymRemind", "")], vn(17, 55, 19)), vn(18, 0, 19));
  ok("2.8 tập: gymRemind rỗng là tắt", r.sent.length === 0);
  const sb = mk(rows([]), vn(17, 55, 19)); await tick(sb, vn(18, 0, 19)); r = await tick(sb, vn(18, 5, 19));
  ok("2.8 tập: không gửi trùng, khóa gym|ngày|giờ", r.sent.length === 0 && sb.db.push_sent.some(x => x.key.startsWith("gym|2026-10-19|18:00|")), JSON.stringify(sb.db.push_sent));
}
{
  // giáo án linh hoạt (mode "rot"): buổi tiếp theo kế sau buổi tập gần nhất, chỉ nhắc khi tuần này chưa đủ perWeek buổi
  const RP = item("r1", "gymplan", { name: "Linh hoạt", start: "2026-08-01", until: "", mode: "rot", perWeek: 3, days: [
    { name: "Kéo", dows: [], items: [{ ex: "Hít xà", n: 4, lo: 8 }] }, { name: "Đẩy", dows: [], items: [{ ex: "Xà kép", n: 4, lo: 8 }, { ex: "Hít đất", n: 3, lo: 15 }] },
    { name: "Chân", dows: [], items: [{ ex: "Squat", n: 4, lo: 12 }] }] });
  const W = (id, date, pdi) => item(id, "workout", { date, planId: "r1", planDate: date, pdi, items: [{ ex: "x", sets: [5] }] });
  const rows = extra => [RP, setting("gymRemind", "18:00"), ...extra];
  let r = await tick(mk(rows([]), vn(17, 55, 19)), vn(18, 0, 19));
  let m = r.sent[0] || {};
  ok("2.8 linh hoạt: chưa tập lần nào thì nhắc Buổi Kéo, kèm tuần này 0/3", r.sent.length === 1 && m.title === "💪 Buổi tiếp theo: Buổi Kéo · 1 bài" && m.body.startsWith("Tuần này đã tập 0/3 buổi") && m.url === "./?gymday=2026-10-19", JSON.stringify(r.sent));
  r = await tick(mk(rows([W("a", "2026-10-17", 0)]), vn(17, 55, 19)), vn(18, 0, 19));
  ok("2.8 linh hoạt: buổi gần nhất là Kéo (thứ Bảy tuần trước) thì thứ Hai nhắc Đẩy", r.sent.length === 1 && r.sent[0].title === "💪 Buổi tiếp theo: Buổi Đẩy · 2 bài" && r.sent[0].body.startsWith("Tuần này đã tập 0/3"), JSON.stringify(r.sent));
  r = await tick(mk(rows([W("a", "2026-10-19", 0)]), vn(17, 55, 22)), vn(18, 0, 22));
  ok("2.8 linh hoạt: nghỉ thứ Ba, thứ Tư không bị tính bỏ lỡ; thứ Năm nhắc buổi kế (Đẩy), tuần này 1/3", r.sent.length === 1 && r.sent[0].title.includes("Buổi Đẩy") && r.sent[0].body.startsWith("Tuần này đã tập 1/3"), JSON.stringify(r.sent));
  r = await tick(mk(rows([W("a", "2026-10-19", 0), W("b", "2026-10-20", 1), W("c", "2026-10-21", 2)]), vn(17, 55, 22)), vn(18, 0, 22));
  ok("2.8 linh hoạt: tuần đã đủ 3 buổi thì không nhắc nữa", r.sent.length === 0, JSON.stringify(r.sent));
  r = await tick(mk(rows([item("q", "workout", { date: "2026-10-22", items: [{ ex: "Hít xà", sets: [8] }] })]), vn(17, 55, 22)), vn(18, 0, 22));
  ok("2.8 linh hoạt: hôm nay đã tập (ghi nhanh, chưa gắn buổi) thì không nhắc", r.sent.length === 0, JSON.stringify(r.sent));
  r = await tick(mk(rows([W("old", "2026-09-10", 1)]), vn(17, 55, 19)), vn(18, 0, 19));
  ok("2.8 linh hoạt: buổi gần nhất cách 40 ngày (Đẩy) vẫn đọc được, nhắc Chân", r.sent.length === 1 && r.sent[0].title.includes("Buổi Chân"), JSON.stringify(r.sent));
  r = await tick(mk(rows([W("a", "2026-10-18", 2)]), vn(17, 55, 19)), vn(18, 0, 19));
  ok("2.8 linh hoạt: hết vòng (Chân) thì quay lại Kéo", r.sent.length === 1 && r.sent[0].title.includes("Buổi Kéo"), JSON.stringify(r.sent));
  const S = globalThis.HN_SCHED;
  ok("2.8 linh hoạt: perWeek trống thì bằng số buổi (tối đa 7); planDay ngày khác hôm nay chưa tập là null",
    S.rotTarget({ data: { mode: "rot", days: RP.data.days } }) === 3 && S.planDay(RP, "2026-10-20", { ws: [], today: "2026-10-19" }) === null && S.planDay(RP, "2026-10-19", { ws: [], today: "2026-10-19" }).next === true);
}
{
  // tổng kết tuần 20:00 Chủ nhật
  let r = await tick(mk([setting("weekRemind", true)], vn(19, 55, 18)), vn(20, 0, 18));
  ok("2.8 tuần: 20:00 Chủ nhật nhắc xem tổng kết, chạm mở sheet tổng kết", r.sent.length === 1 && r.sent[0].title === "📊 Tổng kết tuần" && r.sent[0].url === "./?week=1", JSON.stringify(r.sent));
  r = await tick(mk([setting("weekRemind", true)], vn(19, 55, 19)), vn(20, 0, 19));
  ok("2.8 tuần: thứ Hai 20:00 không nhắc", r.sent.length === 0);
  r = await tick(mk([setting("weekRemind", false)], vn(19, 55, 18)), vn(20, 0, 18));
  ok("2.8 tuần: mặc định, tắt thì không nhắc", r.sent.length === 0);
}
{
  // cron lỡ hơn 20 phút: gom các mốc lỡ như việc (lớp 9:00 nhắc 8:30, cron ngừng 8:20 tới 8:55)
  const cls9 = { ...GT, data: { ...GT.data, start: "09:00", end: "11:00" } };
  let r = await tick(mk([cls9, setting("classRemind", 30)], vn(8, 20, 19)), vn(8, 55, 19));
  ok("2.8 bù: lỡ nhắc lớp thì gửi một thông báo 'Sắp vào lớp' kèm giờ", r.sent.length === 1 && r.sent[0].title === "📚 Sắp vào lớp: Giải tích 1 · H1-201" && /09:00 hôm nay/.test(r.sent[0].body) && r.out.late === 1, JSON.stringify(r.sent));
  r = await tick(mk([cls9, setting("classRemind", 30), task("t1", "Nộp BTL", "2026-10-19", "10:30")], vn(8, 20, 19)), vn(8, 55, 19));
  ok("2.8 bù: lỡ cả nhắc lớp và nhắc việc thì gộp thành một thông báo", r.sent.length === 1 && /2 nhắc nhở/.test(r.sent[0].title) && /Giải tích 1/.test(r.sent[0].body) && /Nộp BTL/.test(r.sent[0].body), JSON.stringify(r.sent));
  r = await tick(mk([cls9, setting("classRemind", 30, vn(8, 40, 19))], vn(8, 20, 19)), vn(8, 55, 19));
  ok("2.8 bù: không bù mốc trước lúc bật nhắc", r.sent.length === 0, JSON.stringify(r.sent));
  r = await tick(mk([GT, setting("classRemind", 30)], vn(6, 20, 19)), vn(7, 5, 19));
  ok("2.8 bù: lớp đã vào học thì không bù", r.sent.length === 0, JSON.stringify(r.sent));
  const sb = mk([PLAN, setting("gymRemind", "18:00")], vn(17, 30, 19));
  r = await tick(sb, vn(19, 0, 19));
  ok("2.8 bù: lỡ nhắc buổi tập (cron ngừng 17:30 tới 19:00) vẫn nhắc trong ngày", r.sent.length === 1 && /Buổi Kéo/.test(r.sent[0].title), JSON.stringify(r.sent));
  r = await tick(sb, vn(19, 5, 19));
  ok("2.8 bù: lần chạy sau không gửi lại", r.sent.length === 0);
}
{
  // database lỗi khi đọc phần nhắc thêm: nhắc việc vẫn chạy
  const sb = mk([task("tA", "Thi Vật lý", "2026-10-18", "15:00")], NOW - 5 * MIN);
  const orig = sb.from; sb.from = t => { const a = orig(t); const inn = a.in; a.in = (c, v) => c === "kind" ? (a.then = (res) => Promise.resolve({ data: null, error: { message: "lỗi giả" } }).then(res), a) : inn(c, v); return a; };
  const r = await tick(sb, NOW);
  ok("2.8: đọc lịch học lỗi thì nhắc việc vẫn gửi, kết quả có extraError", r.sent.length === 1 && r.out.extraError === "lỗi giả", JSON.stringify(r.out));
}

const fails = results.filter(r => !r[0]);
for (const [good, name, extra] of results) console.log(`${good ? "PASS" : "FAIL"} push: ${name}${!good && extra ? "  " + extra : ""}`);
process.exit(fails.length ? 1 : 0);
