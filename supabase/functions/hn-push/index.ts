// @ts-nocheck
// Hôm Nay: gửi thông báo nhắc hạn (Web Push). Chạy mỗi 5 phút bằng pg_cron, cron gửi kèm header x-hn-secret.
// Khóa VAPID tự tạo ở lần chạy đầu và lưu trong bảng push_config (chỉ hàm này đọc được).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

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
async function deliver(sb, sendPush, sub, payload, vapid) {
  let st = 0;
  try { st = await sendPush(sub, payload, vapid, SUBJECT, { topic: payload.tag }); } catch (e) { st = 0; }
  if (st === 404 || st === 410) await sb.from("push_subs").delete().eq("endpoint", sub.endpoint);
  else if (st >= 200 && st < 300) await sb.from("push_subs").update({ last_ok: new Date().toISOString() }).eq("endpoint", sub.endpoint);
  return st;
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
  // tick: chạy mỗi 5 phút
  const { data: subs, error: e0 } = await sb.from("push_subs").select("*");
  if (e0) return [500, { error: e0.message }];
  if (!subs || !subs.length) return [200, { sent: 0, subs: 0 }];
  const users = [...new Set(subs.map(s => s.user_id))];
  const { data: tasks, error } = await sb.from("hn_items").select("id,user_id,data").eq("kind", "task").eq("deleted", false)
    .in("user_id", users).gte("data->>due", ymdVN(now - 2 * 864e5)).lte("data->>due", ymdVN(now + 2 * 864e5));
  if (error) return [500, { error: error.message }];
  const cands = [];
  for (const t of tasks || []) {
    if (!t.data || t.data.status === "done") continue;
    for (const s of subs.filter(x => x.user_id === t.user_id))
      for (const r of remindersFor(t, s.prefs || {}, s.tz == null ? 420 : s.tz))
        if (r.at <= now && r.at > now - 20 * 60e3) cands.push({ ...r, sub: s, key: `${r.key}|${s.endpoint.slice(-32)}` });
  }
  let sent = 0;
  if (cands.length) {
    const { data: done } = await sb.from("push_sent").select("key").in("key", cands.map(c => c.key));
    const seen = new Set((done || []).map(x => x.key));
    for (const c of cands) {
      if (seen.has(c.key)) continue;
      const { error: e2 } = await sb.from("push_sent").insert({ key: c.key });
      if (e2) continue; // máy khác vừa gửi
      seen.add(c.key);
      const st = await deliver(sb, sendPush, c.sub, c.payload, vapid);
      if (st >= 200 && st < 300) sent++;
    }
  }
  if (new Date(now).getUTCMinutes() < 5) await sb.from("push_sent").delete().lt("sent_at", new Date(now - 14 * 864e5).toISOString());
  return [200, { sent, candidates: cands.length, tasks: (tasks || []).length, subs: subs.length }];
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
