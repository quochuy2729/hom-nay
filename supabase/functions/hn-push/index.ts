// @ts-nocheck
// Hôm Nay: gửi thông báo nhắc hạn (Web Push). Chạy mỗi 5 phút bằng pg_cron, cron gửi kèm header x-hn-secret.
// Khóa VAPID tự tạo ở lần chạy đầu và lưu trong bảng push_config (chỉ hàm này đọc được).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
// Lịch dùng chung với app (tuần học, buổi học, buổi tập theo giáo án): bản sao giống hệt sched.js ở gốc repo, nạp vào globalThis.HN_SCHED.
import "./sched.js";

// Web Push không cần thư viện: VAPID (RFC 8292) + mã hoá aes128gcm (RFC 8291), chỉ dùng WebCrypto.
const te = new TextEncoder();
const b64u = buf => { let s = ""; for (const b of new Uint8Array(buf)) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const ub64 = s => { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const bin = atob(s); return Uint8Array.from(bin, c => c.charCodeAt(0)); };
const concat = (...arrs) => { const out = new Uint8Array(arrs.reduce((n, a) => n + a.length, 0)); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };
async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, len * 8));
}
/* Tạo cặp khóa VAPID: trả về { publicKey (base64url, 65 byte), privateJwk } */
async function generateVapid() {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return { publicKey: b64u(await crypto.subtle.exportKey("raw", kp.publicKey)), privateJwk: await crypto.subtle.exportKey("jwk", kp.privateKey) };
}
async function vapidAuth(endpoint, vapid, subject) {
  const aud = new URL(endpoint).origin;
  const header = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey("jwk", vapid.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${vapid.publicKey}`;
}
/* RFC 8291: mã hoá nội dung cho một subscription. salt/asKeys chỉ truyền vào khi kiểm thử. */
async function encryptPayload(sub, payload, test = {}) {
  const uaPublic = ub64(sub.p256dh), authSecret = ub64(sub.auth);
  const asKeys = test.asKeys || await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", asKeys.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, asKeys.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(te.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const salt = test.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, te.encode("Content-Encoding: nonce\0"), 12);
  const body = typeof payload === "string" ? te.encode(payload) : payload;
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, concat(body, new Uint8Array([2]))));
  const head = new Uint8Array(21 + asPublic.length);
  head.set(salt, 0); new DataView(head.buffer).setUint32(16, 4096); head[20] = asPublic.length; head.set(asPublic, 21);
  return concat(head, ct);
}
/* Gửi; trả về mã HTTP (201 = OK, 404/410 = subscription hết hạn) */
async function sendPush(sub, payload, vapid, subject, opts = {}) {
  const body = await encryptPayload(sub, JSON.stringify(payload));
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: { Authorization: await vapidAuth(sub.endpoint, vapid, subject), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: String(opts.ttl || 86400), Urgency: opts.urgency || "high", Topic: opts.topic ? String(opts.topic).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) : undefined },
    body
  });
  return res.status;
}

// Tính các mốc nhắc cho một việc. tz = phút lệch so với UTC (Việt Nam = 420).
// prefs: { d1, h2, m15, eve, morn } (bỏ trống = mặc định: d1, h2, eve, morn bật; m15 tắt)
const fmtMoney = n => n >= 1e6 ? `${(Math.round(n / 1e5) / 10).toString().replace(".", ",")}tr` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : `${n}đ`;
function remindersFor(task, prefs = {}, tz = 420) {
  const d = task.data || {};
  if (!d.due || d.status === "done" || !/^\d{4}-\d{2}-\d{2}$/.test(d.due)) return [];
  const [y, m, dd] = d.due.split("-").map(Number);
  const at = (h, mi, dayOff = 0) => Date.UTC(y, m - 1, dd + dayOff, h, mi) - tz * 60000;
  const kind = d.type === "thi" ? "exam" : d.amount > 0 ? "bill" : "task";
  const title = (kind === "exam" ? "📝 " : kind === "bill" ? "💸 Phải trả: " : "⏰ ") + (d.title || "Việc");
  const extra = [d.amount > 0 && fmtMoney(d.amount), kind === "exam" && d.note ? String(d.note).split(" · ")[0] : ""].filter(Boolean).join(" · ");
  const mk = (code, when, body) => ({ key: `${task.id}|${code}|${d.due}|${d.time || ""}`, at: when, payload: { title, body: body + (extra ? ` · ${extra}` : ""), tag: `${task.id}-${code}`, url: `./?task=${task.id}` } });
  const out = [];
  if (d.time && /^\d{1,2}:\d{2}$/.test(d.time)) {
    const [hh, mi] = d.time.split(":").map(Number), t0 = at(hh, mi);
    if (prefs.d1 !== false) out.push(mk("d1", t0 - 864e5, `Còn 1 ngày · ${d.time} ngày mai`));
    if (prefs.h2 !== false) out.push(mk("h2", t0 - 2 * 3600e3, `Còn 2 tiếng · ${d.time} hôm nay`));
    if (prefs.m15) out.push(mk("m15", t0 - 15 * 60e3, `Còn 15 phút · ${d.time}`));
  } else {
    if (prefs.eve !== false) out.push(mk("eve", at(20, 0, -1), kind === "bill" ? "Hạn trả vào ngày mai" : "Đến hạn vào ngày mai"));
    if (prefs.morn !== false) out.push(mk("morn", at(7, 0, 0), kind === "bill" ? "Hôm nay là hạn trả" : "Hôm nay là hạn"));
  }
  return out;
}

// Logic chính của hàm hn-push, tách riêng để kiểm thử được ngoài Supabase.
const SUBJECT = "https://quochuy2729.github.io/hom-nay/";
const ymdVN = ms => new Date(ms + 7 * 3600e3).toISOString().slice(0, 10);
async function vapidKeys(sb, generateVapid) {
  const { data, error: e1 } = await sb.from("push_config").select("public_key, private_jwk").eq("id", 1).maybeSingle();
  if (e1) throw new Error(`push_config: ${e1.message}`);
  if (data && data.public_key) return { publicKey: data.public_key, privateJwk: data.private_jwk };
  const v = await generateVapid();
  const { error } = await sb.from("push_config").insert({ id: 1, public_key: v.publicKey, private_jwk: v.privateJwk });
  if (error) {
    const { data: d2, error: e2 } = await sb.from("push_config").select("public_key, private_jwk").eq("id", 1).maybeSingle();
    if (!d2) throw new Error(`push_config: ${(e2 || error).message}`);
    return { publicKey: d2.public_key, privateJwk: d2.private_jwk };
  }
  return v;
}
// Chỉ gửi tới dịch vụ push của trình duyệt: Chrome/Android (FCM), Safari (Apple), Firefox (Mozilla), Edge (Windows).
// push_subs do người dùng tự ghi, nên không được để hàm POST tới địa chỉ bất kỳ.
const PUSH_HOST = /^(fcm\.googleapis\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com)$/;
function pushEndpointOk(u) {
  try { const x = new URL(u); return x.protocol === "https:" && !x.port && !x.username && PUSH_HOST.test(x.hostname); } catch (_) { return false; }
}
async function deliver(sb, sendPush, sub, payload, vapid) {
  if (!pushEndpointOk(sub.endpoint)) { await sb.from("push_subs").delete().eq("endpoint", sub.endpoint); return 0; }
  let st = 0;
  try { st = await sendPush(sub, payload, vapid, SUBJECT, { topic: payload.tag }); } catch (e) { st = 0; }
  if (st === 404 || st === 410) await sb.from("push_subs").delete().eq("endpoint", sub.endpoint);
  else if (st >= 200 && st < 300) await sb.from("push_subs").update({ last_ok: new Date().toISOString() }).eq("endpoint", sub.endpoint);
  return st;
}
const WINDOW = 20 * 60e3; // mốc nhắc trong 20 phút qua thì gửi bình thường
// Đọc last_tick rồi ghi giờ hiện tại. Database chưa có cột last_tick (chưa chạy lại push.sql) thì trả null: không bù, vẫn chạy.
async function swapLastTick(sb, now) {
  const { data, error } = await sb.from("push_config").select("last_tick").eq("id", 1).maybeSingle();
  if (error) return null;
  await sb.from("push_config").update({ last_tick: new Date(now).toISOString() }).eq("id", 1);
  return data && data.last_tick ? Date.parse(data.last_tick) : null;
}
// Lúc hết hạn của việc (việc không có giờ: 23:59 ngày hạn), theo múi giờ của máy nhận.
function dueAt(d, tz) {
  const [y, m, dd] = d.due.split("-").map(Number);
  const [hh, mi] = /^\d{1,2}:\d{2}$/.test(d.time || "") ? d.time.split(":").map(Number) : [23, 59];
  return Date.UTC(y, m - 1, dd, hh, mi) - tz * 60000;
}
function whenText(d, tz, now) {
  const day = ms => new Date(ms + tz * 60000).toISOString().slice(0, 10);
  const due = dueAt(d, tz), dd = day(due);
  const rel = dd === day(now) ? "hôm nay" : dd === day(now + 864e5) ? "ngày mai" : `${dd.slice(8)}/${dd.slice(5, 7)}`;
  return d.time ? `${d.time} ${rel}` : rel;
}
// Một thông báo cho các mốc bị lỡ: một mục thì giữ tiêu đề của mục đó, nhiều mục thì gộp.
// Mục là việc (c.task) hoặc nhắc lịch học, buổi tập, tổng kết tuần (c.ref, c.until = lúc hết ý nghĩa, c.late = { title, body, name }).
function latePayload(list, tz, now) {
  const until = c => c.task ? dueAt(c.task.data, tz) : c.until;
  list.sort((a, b) => until(a) - until(b));
  if (list.length === 1) {
    const c = list[0];
    if (!c.task) return { title: c.late.title, body: c.late.body, tag: `${c.payload.tag}-late`, url: c.payload.url };
    const d = c.task.data;
    return { title: c.payload.title, body: `${d.amount > 0 ? "Hạn trả" : "Hạn"} ${whenText(d, tz, now)}`, tag: `${c.task.id}-late`, url: `./?task=${c.task.id}` };
  }
  const tasksOnly = list.every(c => c.task);
  const names = list.slice(0, 3).map(c => c.task ? `${c.task.data.title || "Việc"} (${whenText(c.task.data, tz, now)})` : c.late.name).join(", ");
  return { title: tasksOnly ? `⏰ Bạn có ${list.length} việc sắp đến hạn` : `🔔 Bạn có ${list.length} nhắc nhở bị lỡ`, body: names + (list.length > 3 ? ` và ${list.length - 3} ${tasksOnly ? "việc" : "mục"} khác` : ""), tag: "late", url: "./" };
}

// ---- Nhắc lịch học, buổi tập, tổng kết tuần (2.8). Giờ theo Asia/Ho_Chi_Minh (UTC+7, không đổi giờ mùa hè). ----
// Cài đặt (kind "setting", đồng bộ giữa các máy): classRemind = 0 | 10 | 15 | 30 phút trước giờ vào lớp; gymRemind = "HH:MM" | "";
// weekRemind = true thì 20:00 Chủ nhật nhắc xem tổng kết tuần. Tính buổi học, buổi tập bằng sched.js (cùng thuật toán với app).
const SCHED = globalThis.HN_SCHED;
const VN = 420;
const vnAt = (day, hm) => { const [y, m, d] = day.split("-").map(Number), [h, mi] = String(hm).split(":").map(Number); return Date.UTC(y, m - 1, d, h, mi) - VN * 60000; };
const HM = /^(?:[01]?\d|2[0-3]):[0-5]\d$/;
// Cài đặt mới nhất của từng khóa: { classRemind: { value, at }, … } (at = lúc server nhận bản ghi, để không bù mốc trước khi bật)
function userSettings(rows) {
  const out = {};
  for (const r of rows) {
    const k = r.data && r.data.key; if (!["classRemind", "gymRemind", "weekRemind"].includes(k)) continue;
    const at = Date.parse(r.updated_at) || 0;
    if (!out[k] || at > out[k].upd) out[k] = { value: r.data.value, upd: at, at: Math.max(at, Date.parse(r.server_at) || 0) };
  }
  return out;
}
// Các mốc nhắc thêm của một người dùng quanh lúc now. Mỗi mốc: { key, at, born, until, ref, payload, late }
function extraReminders({ classes = [], plans = [], workouts = [], settings = {} }, now) {
  const out = [], today = ymdVN(now), days = [SCHED.addDays(today, -1), today, SCHED.addDays(today, 1)];
  const rel = d => d === today ? "hôm nay" : d === SCHED.addDays(today, 1) ? "ngày mai" : `${d.slice(8)}/${d.slice(5, 7)}`;
  const N = settings.classRemind ? +settings.classRemind.value : 0;
  if ([10, 15, 30].includes(N)) for (const c of classes) {
    const x = c.data || {}; if (!HM.test(x.start || "")) continue;
    for (const d of days) {
      if (!SCHED.classMeets(x, d, true)) continue;   // đúng thứ, đúng tuần học, không phải buổi đã báo vắng
      const start = vnAt(d, x.start), title = x.title || "Lớp học", room = x.room ? ` · ${x.room}` : "";
      out.push({ key: `cls|${c.id}|${d}|${x.start}|${N}`, at: start - N * 60e3, born: Math.max(Date.parse(c.server_at) || 0, settings.classRemind.at), until: start, ref: `cls-${c.id}-${d}`,
        payload: { title: `📚 ${N} phút nữa: ${title}${room}`, body: `Vào lớp lúc ${x.start}${x.end ? ` đến ${x.end}` : ""}${x.teacher ? ` · ${x.teacher}` : ""}`, tag: `cls-${c.id}-${d}`, url: `./?tab=cal&date=${d}` },
        late: { title: `📚 Sắp vào lớp: ${title}${room}`, body: `Vào lớp lúc ${x.start} ${rel(d)}`, name: `${title} (${x.start} ${rel(d)})` } });
    }
  }
  const G = settings.gymRemind && HM.test(settings.gymRemind.value || "") ? settings.gymRemind.value : "";
  if (G && plans.length) {
    const sorted = SCHED.sortPlans(plans);
    for (const d of days.slice(0, 2)) {
      const p = SCHED.planAt(sorted, d);
      // giáo án linh hoạt: chỉ có buổi tiếp theo của hôm nay; ngày đã tập trong ngày thì thôi; tuần đã đủ buổi thì không nhắc (nghỉ cũng được)
      const day = SCHED.planDay(p, d, { ws: workouts, today });
      if (!day || day.rest || SCHED.workoutFor(workouts, d)) continue;   // không có buổi, ngày nghỉ, hoặc đã tập (kể cả tập bù cho buổi này)
      const name = day.name ? (/^buổi\s/i.test(day.name) ? day.name : `Buổi ${day.name}`) : "Buổi tập";
      const ex = day.items.slice(0, 4).map(it => it.ex).filter(Boolean).join(", ");
      if (day.next) {
        if (workouts.some(w => w.data && w.data.date === d)) continue;
        const done = SCHED.weekDone(workouts, d), target = SCHED.rotTarget(p);
        if (done >= target) continue;
        out.push({ key: `gym|${d}|${G}`, at: vnAt(d, G), born: Math.max(Date.parse(p.server_at) || 0, settings.gymRemind.at), until: vnAt(d, "23:59"), ref: `gym-${d}`,
          payload: { title: `💪 Buổi tiếp theo: ${name} · ${day.items.length} bài`, body: `Tuần này đã tập ${done}/${target} buổi · ${ex}`, tag: `gym-${d}`, url: `./?gymday=${d}` },
          late: { title: `💪 Buổi tiếp theo: ${name} · ${day.items.length} bài`, body: `Tuần này đã tập ${done}/${target} buổi`, name: `${name} (${rel(d)})` } });
        continue;
      }
      out.push({ key: `gym|${d}|${G}`, at: vnAt(d, G), born: Math.max(Date.parse(p.server_at) || 0, settings.gymRemind.at), until: vnAt(d, "23:59"), ref: `gym-${d}`,
        payload: { title: `💪 Hôm nay: ${name} · ${day.items.length} bài`, body: ex, tag: `gym-${d}`, url: `./?gymday=${d}` },
        late: { title: `💪 ${d === today ? "Hôm nay" : rel(d)}: ${name} · ${day.items.length} bài`, body: "Chưa tập buổi này", name: `${name} (${rel(d)})` } });
    }
  }
  if (settings.weekRemind && settings.weekRemind.value === true) for (const d of days.slice(0, 2)) {
    if (SCHED.parseYmd(d).getDay() !== 0) continue;   // 20:00 Chủ nhật
    out.push({ key: `week|${d}`, at: vnAt(d, "20:00"), born: settings.weekRemind.at, until: vnAt(SCHED.addDays(d, 1), "23:59"), ref: `week-${d}`,
      payload: { title: "📊 Tổng kết tuần", body: "Xem tuần qua: chi tiêu, việc đã xong và buổi tập.", tag: `week-${d}`, url: "./?week=1" },
      late: { title: "📊 Tổng kết tuần", body: "Xem tuần qua: chi tiêu, việc đã xong và buổi tập.", name: "Tổng kết tuần" } });
  }
  return out;
}
// Đọc lịch học, giáo án, cài đặt và buổi tập gần đây của các người dùng; lỗi thì bỏ qua phần nhắc thêm (nhắc việc vẫn chạy)
async function loadExtra(sb, users, now) {
  const by = new Map(users.map(u => [u, { classes: [], plans: [], workouts: [], settings: {} }]));
  const { data: rows, error } = await sb.from("hn_items").select("id,user_id,kind,data,updated_at,server_at").eq("deleted", false).in("user_id", users).in("kind", ["class", "gymplan", "setting"]);
  if (error) return { by, error: error.message };
  const sets = new Map();
  for (const r of rows || []) {
    const u = by.get(r.user_id); if (!u || !r.data) continue;
    if (r.kind === "class") u.classes.push(r); else if (r.kind === "gymplan") u.plans.push(r);
    else { const a = sets.get(r.user_id) || []; a.push(r); sets.set(r.user_id, a); }
  }
  for (const [u, a] of sets) by.get(u).settings = userSettings(a);
  if ([...by.values()].some(u => u.plans.length && u.settings.gymRemind)) {
    // giáo án linh hoạt cần buổi tập gần nhất (để biết buổi tiếp theo) và cả tuần này (đủ buổi chưa): đọc 60 ngày
    const rot = [...by.values()].some(u => u.settings.gymRemind && u.plans.some(p => SCHED.isRot(p)));
    const { data: ws, error: e2 } = await sb.from("hn_items").select("id,user_id,data").eq("kind", "workout").eq("deleted", false).in("user_id", users)
      .gte("data->>date", ymdVN(now - (rot ? 60 : 3) * 864e5)).lte("data->>date", ymdVN(now + 864e5));
    if (e2) return { by, error: e2.message };
    for (const w of ws || []) { const u = by.get(w.user_id); if (u && w.data) u.workouts.push(w); }
    // tập bù: buổi tập ngày khác có planDate là hôm nay (ít gặp, đọc riêng)
    const { data: ws2 } = await sb.from("hn_items").select("id,user_id,data").eq("kind", "workout").eq("deleted", false).in("user_id", users)
      .gte("data->>planDate", ymdVN(now - 864e5)).lte("data->>planDate", ymdVN(now));
    for (const w of ws2 || []) { const u = by.get(w.user_id); if (u && w.data && !u.workouts.some(x => x.id === w.id)) u.workouts.push(w); }
  }
  return { by, error: "" };
}
// Khóa bí mật cho tick nằm trong Vault (tên hn_push_secret, tạo bằng push.sql). Hàm không đọc khóa ra,
// chỉ hỏi database "khóa này đúng không": true / false / null (Vault chưa có khóa).
async function secretOk(sb, key) {
  if (!key) return false;
  const { data, error } = await sb.rpc("hn_push_secret_ok", { k: key });
  if (error) throw new Error(`hn_push_secret_ok: ${error.message}`);
  return data;
}
async function handle({ body, token, secret, sb, sendPush, generateVapid, remindersFor, now = Date.now() }) {
  const action = (body && body.action) || "tick";
  if (!["tick", "vapid", "test"].includes(action)) return [400, { error: `Không có action "${action}"` }];
  if (action === "tick") {
    const ok = await secretOk(sb, secret);
    if (ok === null) return [503, { error: "Vault chưa có khóa hn_push_secret: chạy lại push.sql" }];
    if (ok !== true) return [401, { error: "Thiếu hoặc sai header x-hn-secret" }];
  }
  const vapid = await vapidKeys(sb, generateVapid);
  if (action === "vapid") return [200, { publicKey: vapid.publicKey }];
  if (action === "test") {
    if (!token) return [401, { error: "Chưa đăng nhập" }];
    const { data: u } = await sb.auth.getUser(token);
    if (!u || !u.user) return [401, { error: "Phiên đăng nhập hết hạn" }];
    const { data: subs } = await sb.from("push_subs").select("*").eq("user_id", u.user.id).eq("endpoint", body.endpoint || "");
    if (!subs || !subs.length) return [404, { error: "Máy này chưa đăng ký nhận thông báo" }];
    const st = await deliver(sb, sendPush, subs[0], { title: "🔔 Hôm Nay", body: "Thông báo đã hoạt động. App sẽ nhắc bạn trước hạn nộp, lịch thi và khoản phải trả.", tag: "test", url: "./" }, vapid);
    return [200, { status: st }];
  }
  // tick: chạy mỗi 5 phút. Lần chạy trước (last_tick) dùng để nhận ra cron bị ngừng/trễ và bù mốc nhắc bị lỡ.
  const lastTick = await swapLastTick(sb, now);
  const { data: subs, error: e0 } = await sb.from("push_subs").select("*");
  if (e0) return [500, { error: e0.message }];
  if (!subs || !subs.length) return [200, { sent: 0, subs: 0 }];
  const users = [...new Set(subs.map(s => s.user_id))];
  const { data: tasks, error } = await sb.from("hn_items").select("id,user_id,data,server_at").eq("kind", "task").eq("deleted", false)
    .in("user_id", users).gte("data->>due", ymdVN(now - 2 * 864e5)).lte("data->>due", ymdVN(now + 2 * 864e5));
  if (error) return [500, { error: error.message }];
  // Mốc "lỡ": rơi vào lúc cron không chạy, tức (last_tick, now - WINDOW]. Chỉ bù khi việc có từ trước mốc đó và chưa tới hạn.
  const missFrom = lastTick ? Math.max(lastTick, now - 2 * 864e5) : now;
  const cands = [], missed = [];
  for (const t of tasks || []) {
    if (!t.data || t.data.status === "done") continue;
    const born = Number(t.data.createdAt) || Date.parse(t.server_at) || 0;
    for (const s of subs.filter(x => x.user_id === t.user_id)) {
      const tz = s.tz == null ? 420 : s.tz;
      for (const r of remindersFor(t, s.prefs || {}, tz)) {
        const c = { ...r, task: t, sub: s, tz, key: `${r.key}|${s.endpoint.slice(-32)}` };
        if (r.at <= now && r.at > now - WINDOW) cands.push(c);
        else if (r.at > missFrom && r.at <= now - WINDOW && r.at >= born && dueAt(t.data, tz) > now) missed.push(c);
      }
    }
  }
  // lịch học, buổi tập, tổng kết tuần: theo cài đặt của từng người dùng, gửi tới mọi máy của người đó
  const extra = await loadExtra(sb, users, now);
  let reminders = 0;
  for (const u of users) {
    const list = extraReminders(extra.by.get(u) || {}, now); reminders += list.length;
    for (const s of subs.filter(x => x.user_id === u)) {
      const tz = s.tz == null ? 420 : s.tz;
      for (const r of list) {
        const c = { ...r, sub: s, tz, key: `${r.key}|${s.endpoint.slice(-32)}` };
        if (r.until <= now) continue;   // lớp đã vào, ngày đã qua: nhắc không còn ý nghĩa
        if (r.at <= now && r.at > now - WINDOW) cands.push(c);
        else if (r.at > missFrom && r.at <= now - WINDOW && r.at >= r.born) missed.push(c);
      }
    }
  }
  const refOf = c => c.task ? c.task.id : c.ref;
  let sent = 0, late = 0;
  const all = [...cands, ...missed];
  if (all.length) {
    const { data: done } = await sb.from("push_sent").select("key").in("key", all.map(c => c.key));
    const seen = new Set((done || []).map(x => x.key));
    const recent = new Set(cands.map(c => `${c.sub.endpoint}|${refOf(c)}`)); // việc (mục) đã có nhắc thường trong 20 phút qua
    for (const c of cands) {
      if (seen.has(c.key)) continue;
      const { error: e2 } = await sb.from("push_sent").insert({ key: c.key });
      if (e2) continue; // máy khác vừa gửi
      seen.add(c.key);
      const st = await deliver(sb, sendPush, c.sub, c.payload, vapid);
      if (st >= 200 && st < 300) sent++;
    }
    // Mốc lỡ: đánh dấu từng mốc đã xử lý, rồi gửi một thông báo gộp cho mỗi máy.
    const bySub = new Map();
    for (const c of missed) {
      if (seen.has(c.key)) continue;
      const { error: e3 } = await sb.from("push_sent").insert({ key: c.key });
      if (e3) continue;
      seen.add(c.key);
      if (recent.has(`${c.sub.endpoint}|${refOf(c)}`)) continue;
      const g = bySub.get(c.sub.endpoint) || { sub: c.sub, tz: c.tz, tasks: new Map() };
      if (!g.tasks.has(refOf(c))) g.tasks.set(refOf(c), c);
      bySub.set(c.sub.endpoint, g);
    }
    for (const g of bySub.values()) {
      const st = await deliver(sb, sendPush, g.sub, latePayload([...g.tasks.values()], g.tz, now), vapid);
      if (st >= 200 && st < 300) late++;
    }
  }
  if (new Date(now).getUTCMinutes() < 5) await sb.from("push_sent").delete().lt("sent_at", new Date(now - 14 * 864e5).toISOString());
  return [200, { sent, late, candidates: cands.length, missed: missed.length, tasks: (tasks || []).length, reminders, subs: subs.length, ...(extra.error ? { extraError: extra.error } : {}) }];
}

const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY"), { auth: { persistSession: false, autoRefreshToken: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let body = {};
  try { body = await req.json(); } catch (_) {}
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "") || null;
  const secret = req.headers.get("x-hn-secret") || null;
  try {
    const [status, out] = await handle({ body, token, secret, sb, sendPush, generateVapid, remindersFor });
    return new Response(JSON.stringify(out), { status, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
