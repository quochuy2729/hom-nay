"use strict";
/* Hôm Nay: việc, lịch học, chi tiêu, tập luyện, giấy tờ. Local-first, đồng bộ qua Supabase của riêng bạn. */

const APP_VERSION = "2.0.0";
const CFG = window.HN_CONFIG || {};

/* ================= utils ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem("hn-" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("hn-" + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem("hn-" + k); } catch {} }
};
function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const x = [...b].map(v => v.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const parseYmd = s => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const dayDiff = (a, b) => Math.round((parseYmd(a) - parseYmd(b)) / 864e5);
const dm = s => { const d = parseYmd(s); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const DOWL = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const toMin = t => { if (!t) return null; const [h, m] = t.split(":").map(Number); return h * 60 + (m || 0); };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const weekStart = s => { const d = parseYmd(s); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return ymd(d); };
/* Tuần ISO trong năm, giống cột "Tuần học" trên MyBK */
function isoWeek(s) {
  const d = parseYmd(s);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 3 - (t.getUTCDay() + 6) % 7);
  const jan4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t - jan4) / 864e5 - 3 + (jan4.getUTCDay() + 6) % 7) / 7);
}
/* ngày của thứ `dow` (0 = CN) trong tuần `w`, lấy năm gần ngày `ref` nhất */
function dateOfWeek(w, dow, ref) {
  const r = parseYmd(ref); let best = null;
  for (const y of [r.getFullYear() - 1, r.getFullYear(), r.getFullYear() + 1]) {
    const jan4 = new Date(y, 0, 4);
    const d = new Date(y, 0, 4 - (jan4.getDay() + 6) % 7 + (w - 1) * 7 + (dow + 6) % 7);
    if (!best || Math.abs(d - r) < Math.abs(best - r)) best = d;
  }
  return ymd(best);
}
/* "35-42, 44" hoặc "35|36|--|38" → [35, 36, 38, …] */
function parseWeeks(s) {
  s = String(s || "").trim(); if (!s) return [];
  const set = new Set();
  if (s.includes("|")) s.split("|").forEach(x => { const n = parseInt(x, 10); if (n >= 1 && n <= 53) set.add(n); });
  else s.replace(/\s*[-–]\s*/g, "-").split(/[,;\s]+/).forEach(part => {
    const m = part.match(/^(\d{1,2})-(\d{1,2})$/);
    if (m) { for (let n = +m[1]; n <= Math.min(+m[2], 53); n++) if (n >= 1) set.add(n); }
    else { const n = parseInt(part, 10); if (n >= 1 && n <= 53) set.add(n); }
  });
  return [...set].sort((a, b) => a - b);
}
function weeksText(arr) {
  if (!arr || !arr.length) return "";
  const out = []; let a = arr[0], p = arr[0];
  for (const n of arr.slice(1).concat([null])) { if (n === p + 1) { p = n; continue; } out.push(a === p ? `${a}` : `${a}-${p}`); a = p = n; }
  return out.join(", ");
}
const buzz = (ms = 12) => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const norm = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
/* Chia sẻ file (iPhone, Android) hoặc tải về nếu máy không hỗ trợ */
async function shareOrDownload(filename, text, type) {
  const blob = new Blob([text], { type });
  try {
    const file = new File([blob], filename, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: filename }); return true; }
  } catch (e) { if (e && e.name === "AbortError") return false; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}

const money = n => Math.round(n || 0).toLocaleString("vi-VN") + "đ";
function moneyShort(n) {
  n = Math.round(n || 0); const a = Math.abs(n);
  if (a >= 1e6) return (n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + "tr";
  if (a >= 1e3) return (n / 1e3).toLocaleString("vi-VN", { maximumFractionDigits: 0 }) + "k";
  return n + "đ";
}
/* "35" → 35.000đ, "35k" → 35.000đ, "1,5tr" → 1.500.000đ, "50.000" → 50.000đ */
function parseMoney(s) {
  s = String(s || "").trim().toLowerCase().replace(/\s+/g, "").replace(/đ|vnd/g, "");
  if (!s) return 0;
  const m = s.match(/^([\d.,]+)(k|ng|nghìn|ngàn|tr|triệu|m)?$/);
  if (!m) return 0;
  let num = m[1], unit = m[2];
  if (unit) {
    const v = parseFloat(num.replace(",", "."));
    if (!isFinite(v)) return 0;
    return Math.round(v * (/^(tr|triệu|m)$/.test(unit) ? 1e6 : 1e3));
  }
  if (/^\d{1,3}([.,]\d{3})+$/.test(num)) return parseInt(num.replace(/[.,]/g, ""), 10);
  const v = parseFloat(num.replace(",", "."));
  if (!isFinite(v)) return 0;
  return Math.round(v < 1000 ? v * 1000 : v);
}
function parseSets(s) {
  s = String(s || "").trim();
  const m = s.match(/^(\d+)\s*[x×*]\s*(\d+)$/i);
  if (m) return Array(Math.min(+m[1], 50)).fill(+m[2]);
  return s.split(/[^\d.]+/).map(Number).filter(n => n > 0);
}
async function copyText(text, label) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const t = document.createElement("textarea"); t.value = text; t.setAttribute("readonly", ""); t.style.position = "fixed"; t.style.opacity = "0";
    document.body.appendChild(t); t.select(); try { document.execCommand("copy"); } catch {} t.remove();
  }
  toast(label ? `Đã chép ${label}` : "Đã chép");
}

const ic = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I = {
  home: ic('<path d="M3.5 10.5 12 3.5l8.5 7V19a1.5 1.5 0 0 1-1.5 1.5h-4.5v-6h-5v6H5A1.5 1.5 0 0 1 3.5 19z"/>'),
  task: ic('<path d="M10 6.5h10M10 12h10M10 17.5h10"/><path d="m3.5 6.5 1.5 1.5 2.8-2.8M3.5 12l1.5 1.5 2.8-2.8M3.5 17.5 5 19l2.8-2.8"/>'),
  cal: ic('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8.5 3v4M15.5 3v4"/>'),
  money: ic('<path d="M4 7.5V17a2.5 2.5 0 0 0 2.5 2.5h12A1.5 1.5 0 0 0 20 18v-8a1.5 1.5 0 0 0-1.5-1.5H6A2 2 0 0 1 4 6.5 2 2 0 0 1 6 4.5h10.5"/><circle cx="16" cy="14" r="1.2" fill="currentColor" stroke="none"/>'),
  gym: ic('<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>'),
  id: ic('<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="11" r="2"/><path d="M5.8 16c.6-1.3 1.8-2 3.2-2s2.6.7 3.2 2M14.5 10h4M14.5 13.5h3"/>'),
  set: ic('<path d="M4 7h9M18 7h2M4 17h3M12 17h8"/><circle cx="15.5" cy="7" r="2.2"/><circle cx="9.5" cy="17" r="2.2"/>'),
  plus: ic('<path d="M12 5v14M5 12h14"/>'),
  mic: ic('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>'),
  search: ic('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  copy: ic('<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>'),
};

/* ================= constants ================= */

const REPEATS = [["", "Không"], ["day", "Hằng ngày"], ["week", "Hằng tuần"], ["2week", "2 tuần một lần"], ["month", "Hằng tháng"]];
const REPEAT_NAME = Object.fromEntries(REPEATS);
function nextDue(day, rep) {
  if (rep === "day") return addDays(day, 1);
  if (rep === "week") return addDays(day, 7);
  if (rep === "2week") return addDays(day, 14);
  const d = parseYmd(day), want = d.getDate();
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  n.setDate(Math.min(want, new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()));
  return ymd(n);
}
/* Việc lặp lại vừa xong → tạo lần kế tiếp (bỏ qua các kỳ đã trôi qua, không tạo trùng) */
function spawnNext(r) {
  const d = r && r.data; if (!d || !d.repeat || !d.due) return null;
  const td = today(); let nd = nextDue(d.due, d.repeat), guard = 0;
  while (nd < td && guard++ < 800) nd = nextDue(nd, d.repeat);
  if (d.until && nd > d.until) return null;
  const series = d.series || r.id;
  if (all("task").some(x => x.id !== r.id && (x.data.series || x.id) === series && x.data.due === nd)) return null;
  return put("task", { ...d, series, due: nd, status: "todo", doneAt: null, createdAt: Date.now(), subs: (d.subs || []).map(x => ({ ...x, done: false })) });
}
const BASE_OUT = [
  ["an", "Ăn uống", "🍜"], ["nuoc", "Cà phê, nước", "🧋"], ["dilai", "Đi lại, xăng", "🛵"], ["muasam", "Mua sắm", "🛍️"],
  ["nha", "Nhà cửa, điện nước", "🏡"], ["hoadon", "Điện thoại, internet", "🧾"], ["hoc", "Học tập", "📚"], ["con", "Con cái", "👶"],
  ["giaitri", "Giải trí, du lịch", "🎮"], ["hendo", "Hẹn hò", "💞"], ["quatang", "Quà, hiếu hỉ", "🎁"], ["suckhoe", "Sức khỏe", "💊"],
  ["lamdep", "Làm đẹp", "💅"], ["thucung", "Thú cưng", "🐾"], ["tietkiem", "Tiết kiệm, đầu tư", "🐷"], ["khac", "Khác", "📦"]
];
const BASE_IN = [["luong", "Lương", "💼"], ["giadinh", "Gia đình cho", "🏠"], ["thuong", "Thưởng, học bổng", "🎓"], ["kinhdoanh", "Kinh doanh, bán hàng", "🏪"], ["dautu", "Lãi, đầu tư", "📈"], ["thukhac", "Thu khác", "💰"]];
let OUT_CATS = BASE_OUT, IN_CATS = BASE_IN;
let CAT = Object.fromEntries([...BASE_OUT, ...BASE_IN].map(c => [c[0], c]));
/* Danh mục: mặc định + tự tạo, bỏ các mục người dùng ẩn. Gọi lại mỗi lần vẽ màn hình. */
function rebuildCats() {
  const custom = (getSetting("customCats", []) || []).map(c => [c.k, c.n, c.e || "🏷️", c.t]);
  const hidden = getSetting("hiddenCats", []) || [];
  const keep = c => !hidden.includes(c[0]);
  OUT_CATS = [...BASE_OUT.slice(0, -1).filter(keep), ...custom.filter(c => c[3] !== "in"), BASE_OUT[BASE_OUT.length - 1]];
  IN_CATS = [...BASE_IN.slice(0, -1).filter(keep), ...custom.filter(c => c[3] === "in"), BASE_IN[BASE_IN.length - 1]];
  CAT = Object.fromEntries([...BASE_OUT, ...BASE_IN, ...custom].map(c => [c[0], c]));
}
/* Ai đang dùng app: chọn ở lần mở đầu tiên, đổi được trong Cài đặt */
const PERSONAS = [["hs", "Học sinh", "🎒"], ["sv", "Sinh viên", "🎓"], ["work", "Đi làm", "💼"], ["biz", "Kinh doanh", "🏪"], ["other", "Khác", "🙂"]];
const PERSONA_DEFAULTS = {
  hs: { modules: { cal: true, gym: true, doc: true }, hidden: ["nha", "con", "luong", "kinhdoanh", "dautu"], tiet: "thpt" },
  sv: { modules: { cal: true, gym: true, doc: true }, hidden: ["con", "kinhdoanh"], tiet: "bk" },
  work: { modules: { cal: false, gym: true, doc: true }, hidden: ["hoc"], tiet: "bk" },
  biz: { modules: { cal: false, gym: true, doc: true }, hidden: ["hoc"], tiet: "bk" },
  other: { modules: { cal: false, gym: true, doc: true }, hidden: [], tiet: "bk" }
};
const persona = () => getSetting("persona", "") || "sv";
const isStudent = () => ["hs", "sv"].includes(persona());
const mod = k => { const m = getSetting("modules", null); return !m || m[k] !== false; };
function applyPersona(p) {
  const d = PERSONA_DEFAULTS[p] || PERSONA_DEFAULTS.other;
  setSetting("persona", p); setSetting("modules", d.modules); setSetting("hiddenCats", d.hidden); setSetting("tiet", d.tiet);
}
const taskTypes = () => isStudent()
  ? [["bai", "Bài tập, BTL"], ["don", "Đơn từ, giấy tờ"], ["thi", "Thi, kiểm tra"], ["khac", "Việc khác"]]
  : [["bai", "Công việc"], ["don", "Giấy tờ, thủ tục"], ["thi", "Sự kiện quan trọng"], ["khac", "Việc nhà, cá nhân"]];
const typeName = k => (taskTypes().find(x => x[0] === k) || ["", ""])[1];
const EXERCISES = [
  ["Hít xà", "lần"], ["Xà kép", "lần"], ["Hít đất para", "lần"], ["Chống đẩy", "lần"], ["Treo nâng gối", "lần"],
  ["Plank", "giây"], ["Squat", "lần"], ["Goblet squat", "lần"], ["Lunge", "lần"], ["Romanian deadlift", "lần"], ["Chạy bộ", "phút"]
];
const EX_UNIT = Object.fromEntries(EXERCISES);
const exUnit = name => EX_UNIT[name] || "lần";
const toHM = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
/* Giờ tiết học: BK (tiết 1 = 6:00, 50 phút), phổ thông (sáng 7:00, chiều 13:00, 45 phút, nghỉ 5 phút), hoặc tự đặt */
const tietBK = (n, end) => toHM((5 + n) * 60 + (end ? 50 : 0));
function tietTime(n, end) {
  const p = getSetting("tiet", "") || (persona() === "hs" ? "thpt" : "bk");
  if (p === "thpt") { const b = n <= 5 ? 420 + (n - 1) * 50 : 780 + (n - 6) * 50; return toHM(b + (end ? 45 : 0)); }
  if (p === "custom") { const c = getSetting("tietCustom", null) || { start: "07:00", len: 45, gap: 5 }; const b = toMin(c.start) + (n - 1) * (+c.len + +c.gap); return toHM(b + (end ? +c.len : 0)); }
  return tietBK(n, end);
}
const tietStart = n => tietTime(n, false), tietEnd = n => tietTime(n, true);
const tietLabel = () => ({ thpt: "giờ phổ thông (tiết 1 = 7:00)", custom: "giờ bạn đặt trong Cài đặt" }[getSetting("tiet", "") || (persona() === "hs" ? "thpt" : "bk")] || "lịch BK (tiết 1 = 6:00)");
const docTemplate = () => isStudent() ? ["Họ tên", isStudent() && persona() === "hs" ? "Lớp" : "MSSV", "Trường", "SĐT", "Email", "Ngày sinh"] : ["Họ tên", "Ngày sinh", "SĐT", "Email", "Địa chỉ", "Biển số xe"];

/* ================= store ================= */
let db = LS.get("db", {});        // id → {id, kind, data, deleted, updated_at}
let queue = LS.get("queue", {});  // id → updated_at chưa lên server
let lastStamp = 0;
function stampAfter(prev) {
  let t = Date.now();
  const p = prev ? Date.parse(prev) : 0;
  if (t <= p) t = p + 1;
  if (t <= lastStamp) t = lastStamp + 1;
  lastStamp = t;
  return new Date(t).toISOString();
}
function persist() { LS.set("db", db); LS.set("queue", queue); }
const all = kind => Object.values(db).filter(r => r.kind === kind && !r.deleted);
function put(kind, data, id) {
  const prev = id ? db[id] : null;
  id = id || uuid();
  const r = { id, kind: prev ? prev.kind : kind, data, deleted: false, updated_at: stampAfter(prev && prev.updated_at) };
  db[id] = r; queue[id] = r.updated_at;
  persist(); render(); scheduleSync();
  return r;
}
function remove(id) {
  const r = db[id]; if (!r) return;
  db[id] = { ...r, deleted: true, updated_at: stampAfter(r.updated_at) };
  queue[id] = db[id].updated_at;
  persist(); render(); scheduleSync();
}
function restore(snapshot) {
  const cur = db[snapshot.id];
  db[snapshot.id] = { ...snapshot, updated_at: stampAfter(cur && cur.updated_at) };
  queue[snapshot.id] = db[snapshot.id].updated_at;
  persist(); render(); scheduleSync();
}
function getSetting(key, d) {
  const s = all("setting").filter(r => r.data.key === key).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))[0];
  return s ? s.data.value : d;
}
function setSetting(key, value) {
  const s = all("setting").filter(r => r.data.key === key).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
  s.slice(1).forEach(r => remove(r.id));
  put("setting", { key, value }, s[0] && s[0].id);
}

/* ================= sync (Supabase) ================= */
const sync = {
  sb: null, user: null, ch: null, state: "local", msg: "",
  last: LS.get("last", null), wm: LS.get("wm", "1970-01-01T00:00:00Z"),
  running: false, again: false, t: null
};
function initSync() {
  if (!CFG.supabaseUrl || !CFG.supabaseAnonKey) { sync.state = "local"; return; }
  if (!window.supabase || !window.supabase.createClient) { sync.state = "error"; sync.msg = "Chưa tải được thư viện Supabase (đang offline?)"; return; }
  sync.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "hn-auth" }
  });
  sync.state = "out";
  sync.sb.auth.onAuthStateChange((ev, session) => {
    const u = session ? session.user : null;
    if ((u && u.id) === (sync.user && sync.user.id)) return;
    sync.user = u;
    setTimeout(() => {
      if (u) {
        if (LS.get("owner", null) !== u.id) {
          // tài khoản mới trên máy này: kéo lại từ đầu và đẩy toàn bộ dữ liệu đang có lên
          sync.wm = "1970-01-01T00:00:00Z"; LS.set("wm", sync.wm);
          for (const id in db) queue[id] = db[id].updated_at;
          persist(); LS.set("owner", u.id);
        }
        startRealtime(); syncNow();
      } else { stopRealtime(); sync.state = "out"; renderSyncBits(); }
    }, 0);
  });
  setInterval(syncNow, 60000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncNow(); });
  window.addEventListener("online", syncNow);
}
function scheduleSync() { clearTimeout(sync.t); sync.t = setTimeout(syncNow, 700); }
function mergeRemote(row) {
  if (!row || !row.id || !row.updated_at) return false;
  const ru = Date.parse(row.updated_at);
  const local = db[row.id];
  if (local && Date.parse(local.updated_at) >= ru) return false;
  db[row.id] = { id: row.id, kind: row.kind, data: row.data || {}, deleted: !!row.deleted, updated_at: new Date(ru).toISOString() };
  delete queue[row.id];
  return true;
}
async function syncNow() {
  if (!sync.sb || !sync.user) { renderSyncBits(); return; }
  if (!navigator.onLine) { sync.state = "offline"; renderSyncBits(); return; }
  if (sync.running) { sync.again = true; return; }
  sync.running = true; sync.state = "syncing"; renderSyncBits();
  let changed = false;
  try {
    const ids = Object.keys(queue);
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200).map(id => db[id]).filter(Boolean);
      const rows = chunk.map(r => ({ id: r.id, kind: r.kind, data: r.data, deleted: !!r.deleted, updated_at: r.updated_at }));
      const { error } = await sync.sb.rpc("hn_push", { rows });
      if (error) throw error;
      for (const r of chunk) if (queue[r.id] === r.updated_at) delete queue[r.id];
      persist();
    }
    let since = new Date(Date.parse(sync.wm) - 10000).toISOString();
    for (let page = 0; page < 100; page++) {
      const { data, error } = await sync.sb.from("hn_items")
        .select("id,kind,data,deleted,updated_at,server_at")
        .gt("server_at", since).order("server_at", { ascending: true }).limit(1000);
      if (error) throw error;
      for (const row of data) if (mergeRemote(row)) changed = true;
      if (data.length) {
        const m = data[data.length - 1].server_at;
        if (Date.parse(m) > Date.parse(sync.wm)) sync.wm = m;
        since = m;
      }
      if (data.length < 1000) break;
    }
    LS.set("wm", sync.wm);
    sync.last = Date.now(); LS.set("last", sync.last);
    sync.state = Object.keys(queue).length ? "pending" : "ok"; sync.msg = "";
  } catch (e) {
    sync.state = "error";
    sync.msg = (e && (e.message || e.error_description)) || String(e);
    if (/hn_push|hn_items|does not exist|schema cache/i.test(sync.msg)) sync.msg = "Database chưa có bảng hn_items. Hãy chạy setup.sql trong Supabase.";
  } finally {
    sync.running = false;
    if (changed) { persist(); render(); }
    renderSyncBits();
    if (sync.again) { sync.again = false; setTimeout(syncNow, 300); }
  }
}
function startRealtime() {
  stopRealtime();
  if (!sync.sb || !sync.user) return;
  try {
    sync.ch = sync.sb.channel("hn-" + sync.user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "hn_items", filter: "user_id=eq." + sync.user.id }, p => {
        if (p.new && mergeRemote(p.new)) { persist(); render(); }
      })
      .subscribe();
  } catch {}
}
function stopRealtime() { if (sync.ch && sync.sb) { try { sync.sb.removeChannel(sync.ch); } catch {} } sync.ch = null; }
function syncLabel() {
  const t = sync.last ? new Date(sync.last) : null;
  const when = t ? `${pad(t.getHours())}:${pad(t.getMinutes())} ${dm(ymd(t))}` : "";
  switch (sync.state) {
    case "local": return "Chỉ lưu trên máy này (chưa cài đồng bộ)";
    case "out": return "Chưa đăng nhập, dữ liệu chỉ ở máy này";
    case "syncing": return "Đang đồng bộ…";
    case "offline": return "Đang offline, sẽ đồng bộ khi có mạng";
    case "pending": return "Còn thay đổi chưa gửi lên";
    case "error": return "Lỗi đồng bộ: " + sync.msg;
    default: return when ? "Đã đồng bộ lúc " + when : "Đã đồng bộ";
  }
}
function syncColor() {
  return { ok: "var(--gym)", syncing: "var(--cls)", pending: "var(--warn)", offline: "var(--warn)", error: "var(--danger)", out: "var(--warn)" }[sync.state] || "transparent";
}
function renderSyncBits() {
  $$(".sync-dot").forEach(b => b.style.setProperty("--dotc", syncColor()));
  $$("[data-synclabel]").forEach(e => { e.textContent = syncLabel(); });
}

/* ================= ui state ================= */
const ui = {
  tab: LS.get("tab", "home"),
  taskFilter: "todo",
  calDay: new Date().getDay(),
  calWeek: 0,
  month: today().slice(0, 7),
  gymEx: null,
};
const TABS = [
  ["home", "Hôm nay", I.home, "var(--fg)"],
  ["task", "Việc", I.task, "var(--task)"],
  ["cal", "Lịch học", I.cal, "var(--cls)"],
  ["money", "Tiền", I.money, "var(--money)"],
  ["gym", "Tập", I.gym, "var(--gym)"],
];
const tabColor = t => (TABS.find(x => x[0] === t) || TABS[0])[3];

/* ================= data helpers ================= */
const classActive = (c, day) => !(c.data.weeks && c.data.weeks.length) || c.data.weeks.includes(isoWeek(day));
function classesOn(dow, day) {
  return all("class").filter(c => (c.data.days || []).includes(dow) && (!day || classActive(c, day))).sort((a, b) => (toMin(a.data.start) || 0) - (toMin(b.data.start) || 0));
}
const byDue = (a, b) => (a.data.due || "9999") .localeCompare(b.data.due || "9999") || (a.data.time || "99").localeCompare(b.data.time || "99");
function dueInfo(t) {
  if (!t.due) return { text: "", cls: "" };
  const d = dayDiff(t.due, today());
  const time = t.time ? " " + t.time : "";
  if (t.status === "done") return { text: dm(t.due), cls: "" };
  if (d < 0) return { text: `Quá hạn ${-d} ngày`, cls: "red" };
  if (d === 0) return { text: "Hôm nay" + time, cls: "red" };
  if (d === 1) return { text: "Ngày mai" + time, cls: "amber" };
  if (d < 7) return { text: `${DOWL[parseYmd(t.due).getDay()]} ${dm(t.due)}${time}`, cls: d <= 3 ? "amber" : "" };
  return { text: dm(t.due) + time, cls: "" };
}
/* Các khoản hay chi lặp lại (cùng ghi chú, số tiền, loại) trong 60 ngày → ghi nhanh 1 chạm */
function combos() {
  const since = addDays(today(), -60), m = {};
  all("tx").forEach(r => {
    const x = r.data; if (x.type === "in" || !x.note || (x.date || "") < since) return;
    const k = `${norm(x.note)}|${x.amount}|${x.cat}`;
    const c = m[k] || (m[k] = { note: x.note, amount: x.amount, cat: x.cat, n: 0, last: 0 });
    c.n++; c.last = Math.max(c.last, x.at || Date.parse(r.updated_at));
  });
  return Object.values(m).filter(c => c.n >= 2).sort((a, b) => b.n - a.n || b.last - a.last).slice(0, 6);
}
function quickTx(c) {
  const r = put("tx", { type: "out", amount: c.amount, cat: c.cat, note: c.note, date: today(), at: Date.now() });
  buzz();
  toast(`Đã ghi ${c.note} ${moneyShort(c.amount)}`, { label: "Hoàn tác", fn: () => remove(r.id) });
}
function monthTx(month) { return all("tx").filter(r => (r.data.date || "").slice(0, 7) === month); }
const sumOut = list => list.filter(r => r.data.type !== "in" && r.data.cat !== "tietkiem").reduce((s, r) => s + (r.data.amount || 0), 0);
const sumSave = list => list.filter(r => r.data.type !== "in" && r.data.cat === "tietkiem").reduce((s, r) => s + (r.data.amount || 0), 0);
const sumIn = list => list.filter(r => r.data.type === "in").reduce((s, r) => s + (r.data.amount || 0), 0);
const sessions = () => all("workout").sort((a, b) => (b.data.date || "").localeCompare(a.data.date || "") || Date.parse(b.updated_at) - Date.parse(a.updated_at));
const exTotal = (s, ex) => (s.data.items || []).filter(i => i.ex === ex).reduce((t, i) => t + (i.sets || []).reduce((a, b) => a + b, 0), 0);

/* ================= render ================= */
function header(title, sub) {
  return `<header class="top">
    <div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div>
    <div class="top-actions">
      <button class="icon-btn" data-act="search" aria-label="Tìm kiếm">${I.search}</button>
      ${mod("doc") ? `<button class="icon-btn" data-act="docs" aria-label="Giấy tờ">${I.id}</button>` : ""}
      <button class="icon-btn sync-dot" data-act="settings" aria-label="Cài đặt">${I.set}</button>
    </div>
  </header>`;
}
function render() {
  const main = $("#main");
  if (!main) return;
  rebuildCats();
  const tabs = TABS.filter(t => (t[0] !== "cal" || mod("cal")) && (t[0] !== "gym" || mod("gym")));
  if (!tabs.some(t => t[0] === ui.tab)) ui.tab = "home";
  const qa = document.activeElement && document.activeElement.id === "qIn" ? document.activeElement.selectionStart : null;
  const v = { home: viewHome, task: viewTasks, cal: viewCal, money: viewMoney, gym: viewGym }[ui.tab] || viewHome;
  main.innerHTML = v();
  const qi = $("#qIn");
  if (qi) { qi.value = ui.qText || ""; quickPreview(); if (qa != null) { qi.focus(); try { qi.setSelectionRange(qa, qa); } catch {} } }
  $("#nav").innerHTML = `<div class="nav-in" style="grid-template-columns:repeat(${tabs.length},1fr)">${tabs.map(([k, label, icon, c]) =>
    `<button class="${ui.tab === k ? "on" : ""}" data-tab="${k}" style="--c:${c}">${icon}<span>${label}</span></button>`).join("")}</div>`;
  const fab = $("#fab");
  fab.style.setProperty("--c", ui.tab === "home" ? "var(--fg)" : tabColor(ui.tab));
  fab.style.setProperty("--on-c", ui.tab === "home" ? "var(--bg)" : "#fff");
  fab.innerHTML = I.plus;
  fab.setAttribute("aria-label", "Thêm");
  renderSyncBits();
  updateBadge();
}
/* Số trên icon app: việc quá hạn và đến hạn hôm nay */
function updateBadge() {
  const td = today();
  const n = all("task").filter(t => t.data.status === "todo" && t.data.due && t.data.due <= td).length;
  try {
    if (n && navigator.setAppBadge) navigator.setAppBadge(n).catch(() => {});
    else if (!n && navigator.clearAppBadge) navigator.clearAppBadge().catch(() => {});
  } catch {}
}

/* ---------- Hôm nay ---------- */
function greeting() {
  const h = new Date().getHours();
  const name = getSetting("name", "");
  const g = h < 11 ? "Chào buổi sáng" : h < 14 ? "Chào buổi trưa" : h < 18 ? "Chào buổi chiều" : "Chào buổi tối";
  return name ? `${g}, ${esc(name)}` : g;
}
function classRows(list, isToday, day, clash) {
  const nm = nowMin();
  let nextMarked = false;
  return list.map(c => {
    const d = c.data, s = toMin(d.start), e = toMin(d.end);
    let state = "", tag = "";
    if (day && !classActive(c, day)) { state = "off"; tag = `<span class="chip">Không học tuần này</span>`; }
    else if (clash && clash.has(c.id)) tag = `<span class="chip c-danger">Trùng giờ</span>`;
    else if (isToday) {
      if (s != null && e != null && nm >= s && nm < e) { state = "now"; tag = `<span class="chip c-gym">Đang học</span>`; }
      else if (e != null && nm >= e) state = "past";
      else if (!nextMarked && s != null && nm < s) { nextMarked = true; const m = s - nm; tag = `<span class="chip c-cls">${m < 60 ? `còn ${m} phút` : `còn ${Math.floor(m / 60)}g${m % 60 ? pad(m % 60) : ""}`}</span>`; }
    }
    const ab = (d.absent || []).length;
    if (ab && !tag) tag = `<span class="chip ${absentLevel(c) === "red" ? "c-danger" : ""}">Vắng ${ab}</span>`;
    if (day && (d.absent || []).includes(day)) tag = `<span class="chip c-danger">Vắng buổi này</span>`;
    return `<div class="cls ${state}" data-cdetail="${c.id}" data-date="${day || (isToday ? today() : "")}">
      <div class="time num">${esc(d.start || "")}<span>${esc(d.end || "")}</span></div>
      <div class="bar"></div>
      <div class="grow">
        <div class="t">${esc(d.title)} ${tag}</div>
        <div class="m">${[d.room && `Phòng ${esc(d.room)}`, d.code && esc(d.code) + (d.group ? " · " + esc(d.group) : ""), d.teacher && esc(d.teacher)].filter(Boolean).join(" · ")}</div>
      </div>
    </div>`;
  }).join("");
}
function taskRow(r) {
  const t = r.data, due = dueInfo(t);
  const subs = t.subs || [];
  const subDone = subs.filter(s => s.done).length;
  const meta = [
    t.tag && `<span class="chip c-task">${esc(t.tag)}</span>`,
    t.type && t.type !== "bai" && t.type !== "khac" && `<span class="chip ${t.type === "thi" ? "c-danger" : ""}">${esc(typeName(t.type))}</span>`,
    t.amount > 0 && `<span class="chip c-money">${moneyShort(t.amount)}</span>`,
    due.text && `<span class="${due.cls}">${esc(due.text)}</span>`,
    t.status === "waiting" && `<span class="amber">Chờ: ${esc(t.waitFor || "phản hồi")}</span>`,
    t.repeat && `<span>↻ ${esc(REPEAT_NAME[t.repeat] || "")}</span>`,
    subs.length && `<span>${subDone}/${subs.length} phần</span>`,
  ].filter(Boolean).join("");
  return `<div class="row tap" data-edit="task" data-id="${r.id}">
    <button class="check ${t.status === "done" ? "on" : t.status === "waiting" ? "wait" : ""}" data-act="toggle-task" data-id="${r.id}" aria-label="Xong"></button>
    <div class="grow"><div class="t" ${t.status === "done" ? 'style="text-decoration:line-through;opacity:.6"' : ""}>${esc(t.title)}</div>${meta ? `<div class="m">${meta}</div>` : ""}</div>
  </div>`;
}
function viewHome() {
  const now = new Date(), td = today();
  const cls = classesOn(now.getDay(), td);
  const tomorrow = classesOn((now.getDay() + 1) % 7, addDays(td, 1));
  const nm = nowMin();
  const doneForToday = cls.every(c => (toMin(c.data.end) || 0) <= nm);
  const evening = now.getHours() >= 17 && doneForToday && tomorrow.length > 0;
  const open = all("task").filter(t => t.data.status !== "done");
  const urgent = open.filter(t => t.data.status === "todo" && t.data.due && dayDiff(t.data.due, td) <= 3).sort(byDue);
  const waiting = open.filter(t => t.data.status === "waiting").sort(byDue);
  const noDueCount = open.filter(t => t.data.status === "todo" && !(t.data.due && dayDiff(t.data.due, td) <= 3)).length;
  const exams = open.filter(t => t.data.type === "thi" && t.data.due && dayDiff(t.data.due, td) >= 0 && dayDiff(t.data.due, td) <= 30).sort(byDue).slice(0, 4);
  const examIds = new Set(exams.map(t => t.id));
  const mtx = monthTx(td.slice(0, 7));
  const outToday = sumOut(mtx.filter(r => r.data.date === td));
  const outMonth = sumOut(mtx);
  const budget = +getSetting("budget", 0) || 0;
  const ws = weekStart(td);
  const sess = sessions();
  const weekDays = new Set(sess.filter(s => s.data.date >= ws && s.data.date <= addDays(ws, 6)).map(s => s.data.date));
  const last = sess[0];

  let classHtml, classTitle = "Lịch học hôm nay";
  if (evening) { classTitle = "Lịch học ngày mai"; classHtml = `<div class="small mut" style="margin-bottom:2px">${cls.length ? "Hôm nay đã học xong." : "Hôm nay không có tiết."} Mai ${DOWL[(now.getDay() + 1) % 7]}:</div>` + classRows(tomorrow, false); }
  else if (cls.length) classHtml = classRows(cls, true);
  else if (!all("class").length) classHtml = `<div class="empty">Chưa có thời khóa biểu. ${persona() === "sv" ? `<button class="link" data-act="tkb" style="--c:var(--cls)">Dán thời khóa biểu</button>` : `<button class="link" data-act="q-class" style="--c:var(--cls)">Thêm môn học</button>`}</div>`;
  else classHtml = `<div class="empty">Hôm nay không có tiết nào.${tomorrow.length ? ` Mai học ${tomorrow.length} môn, bắt đầu ${esc(tomorrow[0].data.start)}.` : ""}</div>`;

  const todoHtml = urgent.length
    ? urgent.filter(t => !examIds.has(t.id)).slice(0, 6).map(taskRow).join("") || `<div class="empty">Ngoài lịch thi ở trên, không có gì gấp trong 3 ngày tới.</div>`
    : `<div class="empty">Không có gì gấp trong 3 ngày tới.${noDueCount ? ` Còn ${noDueCount} việc khác.` : ""}</div>`;

  const cmb = combos().slice(0, 4);
  return header(`${DOWL[now.getDay()]}, ${pad(now.getDate())}/${pad(now.getMonth() + 1)}`, greeting()) + `
  <div class="qbox">
    <div class="qin"><span class="q-lead">${I.plus}</span><input id="qIn" type="text" enterkeyhint="done" autocomplete="off" autocapitalize="sentences" placeholder="Gõ nhanh: cà phê 30k, họp 9h mai…" aria-label="Ghi nhanh bằng một câu">
      ${SR ? `<button class="mic" data-act="mic" aria-label="Nói để ghi">${I.mic}</button>` : ""}</div>
    <div class="qprev" id="qPrev"></div>
  </div>
  <div class="quick" style="grid-template-columns:repeat(${mod("gym") ? 3 : 2},1fr)">
    <button data-act="q-tx" style="--c:var(--money)"><span class="q-ic">${I.money}</span>Ghi chi tiêu</button>
    <button data-act="q-task" style="--c:var(--task)"><span class="q-ic">${I.task}</span>Thêm việc</button>
    ${mod("gym") ? `<button data-act="q-gym" style="--c:var(--gym)"><span class="q-ic">${I.gym}</span>Ghi buổi tập</button>` : ""}
  </div>
  ${mod("cal") ? `<section class="card" style="--c:var(--cls)">
    <div class="card-h"><h2><i></i>${classTitle}</h2><button class="link" data-tab="cal">Cả tuần</button></div>
    ${classHtml}
  </section>` : ""}
  ${exams.length ? `<section class="card" style="--c:var(--danger)">
    <div class="card-h"><h2><i></i>${isStudent() ? "Sắp thi" : "Sắp diễn ra"}</h2><span class="small mut">30 ngày tới</span></div>
    <div class="list">${exams.map(r => { const n = dayDiff(r.data.due, td); return `<div class="row tap" data-edit="task" data-id="${r.id}">
      <div class="count ${n <= 3 ? "hot" : ""}"><b class="num">${n || "Nay"}</b><span>${n ? "ngày" : ""}</span></div>
      <div class="grow"><div class="t">${esc(r.data.title)}</div><div class="m">${DOWL[parseYmd(r.data.due).getDay()]} ${dm(r.data.due)}${r.data.time ? " · " + esc(r.data.time) : ""}${r.data.note ? " · " + esc(r.data.note) : ""}</div></div></div>`; }).join("")}</div>
  </section>` : ""}
  <section class="card" style="--c:var(--task)">
    <div class="card-h"><h2><i></i>Sắp tới hạn</h2><button class="link" data-tab="task">${open.length ? `Tất cả (${open.length})` : "Mở"}</button></div>
    <div class="list">${todoHtml}</div>
    ${waiting.length ? `<div class="group-h" style="margin:12px 0 2px">Đang chờ người khác <span>${waiting.length}</span></div><div class="list">${waiting.slice(0, 4).map(taskRow).join("")}</div>` : ""}
  </section>
  <section class="card tap" style="--c:var(--money);cursor:pointer" data-tab="money">
    <div class="card-h"><h2><i></i>Chi tiêu</h2><span class="link">Chi tiết</span></div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px">
      <div><div class="small mut">Hôm nay</div><div class="big num">${money(outToday)}</div></div>
      <div style="text-align:right"><div class="small mut">Tháng ${now.getMonth() + 1}</div><div class="num" style="font-weight:600">${money(outMonth)}${budget ? ` <span class="mut small">/ ${moneyShort(budget)}</span>` : ""}</div></div>
    </div>
    ${budget ? `<div class="mbar ${outMonth > budget ? "over" : ""}" style="margin-top:10px"><i style="width:${Math.min(100, outMonth / budget * 100)}%"></i></div>` : ""}
    ${cmb.length ? `<div class="combos" aria-label="Ghi nhanh">${cmb.map((c, i) => `<button data-act="combo" data-i="${i}">+ ${esc(c.note)} ${moneyShort(c.amount)}</button>`).join("")}</div>` : ""}
  </section>
  ${mod("gym") ? `<section class="card tap" style="--c:var(--gym);cursor:pointer" data-tab="gym">
    <div class="card-h"><h2><i></i>Tập luyện</h2><span class="link">${weekDays.size} buổi tuần này</span></div>
    ${weekGrid(ws, weekDays)}
    <div class="small mut" style="margin-top:8px">${last ? `Buổi gần nhất: ${last.data.date === td ? "hôm nay" : dayDiff(td, last.data.date) === 1 ? "hôm qua" : dm(last.data.date)} · ${esc(sessionSummary(last))}` : "Chưa ghi buổi tập nào."}</div>
  </section>` : ""}
  <div class="foot" data-synclabel></div>`;
}
function weekGrid(ws, doneSet) {
  const td = today();
  return `<div class="week">${[0, 1, 2, 3, 4, 5, 6].map(i => {
    const d = addDays(ws, i);
    return `<div>${DOW[parseYmd(d).getDay()]}<i class="${doneSet.has(d) ? "on" : ""} ${d === td ? "today" : ""}"></i></div>`;
  }).join("")}</div>`;
}
function sessionSummary(s) {
  const by = {};
  for (const it of s.data.items || []) { by[it.ex] = (by[it.ex] || 0) + (it.sets || []).reduce((a, b) => a + b, 0); }
  const parts = Object.entries(by).map(([ex, n]) => `${ex} ${n}${exUnit(ex) === "lần" ? "" : " " + exUnit(ex)}`);
  return parts.join(" · ") || (s.data.note || "Buổi tập");
}

/* ---------- Việc ---------- */
function viewTasks() {
  const td = today();
  const tasks = all("task");
  const todo = tasks.filter(t => t.data.status === "todo");
  const waiting = tasks.filter(t => t.data.status === "waiting");
  const done = tasks.filter(t => t.data.status === "done");
  const f = ui.taskFilter;
  let body = "";
  if (f === "todo") {
    const groups = [
      ["Quá hạn", t => t.data.due && dayDiff(t.data.due, td) < 0, "red"],
      ["Hôm nay & ngày mai", t => t.data.due && dayDiff(t.data.due, td) >= 0 && dayDiff(t.data.due, td) <= 1],
      ["7 ngày tới", t => t.data.due && dayDiff(t.data.due, td) > 1 && dayDiff(t.data.due, td) <= 7],
      ["Sau đó", t => t.data.due && dayDiff(t.data.due, td) > 7],
      ["Chưa có hạn", t => !t.data.due],
    ];
    body = groups.map(([name, fn, cls]) => {
      const list = todo.filter(fn).sort(byDue);
      if (!list.length) return "";
      return `<div class="group-h ${cls || ""}">${name}<span>${list.length}</span></div><div class="card list">${list.map(taskRow).join("")}</div>`;
    }).join("") || `<div class="card empty">Hết việc rồi. Bấm + để thêm việc mới, hạn nộp BTL, hoặc đơn đang chờ duyệt.</div>`;
  } else if (f === "waiting") {
    body = waiting.length
      ? `<div class="card list">${waiting.sort(byDue).map(taskRow).join("")}</div><div class="hint" style="margin:0 4px">Đơn từ, email đã gửi mà còn chờ thầy cô hay phòng ban trả lời.</div>`
      : `<div class="card empty">Không có việc nào đang chờ người khác.</div>`;
  } else {
    const list = done.sort((a, b) => (b.data.doneAt || 0) - (a.data.doneAt || 0)).slice(0, 60);
    body = list.length ? `<div class="card list">${list.map(taskRow).join("")}</div>` : `<div class="card empty">Chưa có việc nào xong.</div>`;
  }
  return header("Việc", `${todo.length} cần làm · ${waiting.length} đang chờ`) + `
    <div class="seg">
      <button class="${f === "todo" ? "on" : ""}" data-filter="todo">Cần làm${todo.length ? ` (${todo.length})` : ""}</button>
      <button class="${f === "waiting" ? "on" : ""}" data-filter="waiting">Đang chờ${waiting.length ? ` (${waiting.length})` : ""}</button>
      <button class="${f === "done" ? "on" : ""}" data-filter="done">Đã xong</button>
    </div>${body}`;
}

/* ---------- Lịch học ---------- */
function viewCal() {
  const td = today();
  const ws = addDays(weekStart(td), 7 * (ui.calWeek || 0)), wk = isoWeek(ws), thisWeek = !ui.calWeek;
  const dateOf = dow => addDays(ws, (dow + 6) % 7);
  const allCls = all("class");
  const strip = WEEK_ORDER.map(dow => {
    const d = dateOf(dow);
    const has = allCls.some(c => (c.data.days || []).includes(dow) && classActive(c, d));
    return `<button class="${ui.calDay === dow ? "on" : ""} ${d === td ? "today" : ""} ${has ? "has" : ""}" data-day="${dow}">${DOW[dow]}<span class="n">${parseYmd(d).getDate()}</span></button>`;
  }).join("");
  const selDate = dateOf(ui.calDay);
  const list = classesOn(ui.calDay);
  const active = list.filter(c => classActive(c, selDate));
  const clash = new Set();
  conflicts(active.map(c => ({ ...c.data, id: c.id }))).forEach(x => { clash.add(x.a.id); clash.add(x.b.id); });
  let sess = 0, mins = 0;
  WEEK_ORDER.forEach(dow => classesOn(dow, dateOf(dow)).forEach(c => { sess++; mins += Math.max(0, toMin(c.data.end) - toMin(c.data.start)); }));
  const cr = {}; allCls.forEach(c => { if (c.data.code) cr[c.data.code] = Math.max(cr[c.data.code] || 0, +c.data.credits || 0); });
  const credits = Math.max(Object.values(cr).reduce((a, b) => a + b, 0), +getSetting("credits", 0) || 0);
  const lastWeek = Math.max(0, ...allCls.flatMap(c => c.data.weeks || []));
  const endDate = lastWeek ? dateOfWeek(lastWeek, 0, td) : "";
  const weeksLeft = endDate && endDate >= td ? Math.ceil((dayDiff(endDate, td) + 1) / 7) : 0;
  const dayTitle = `${DOWL[ui.calDay]} ${dm(selDate)}${selDate === td ? " (hôm nay)" : ""}`;
  return header("Lịch học", allCls.length ? [`${allCls.length} lịch học`, credits && `${credits} tín chỉ`, weeksLeft && `còn ${weeksLeft} tuần`].filter(Boolean).join(" · ") : "Thời khóa biểu học kỳ") + `
    <div class="month-nav">
      <button data-week="-1" aria-label="Tuần trước">‹</button>
      <div class="wk-mid"><b>Tuần ${wk}${thisWeek ? ' <span class="chip c-cls">Tuần này</span>' : ""}</b><div class="small mut">${dm(ws)} – ${dm(addDays(ws, 6))}</div>${thisWeek ? "" : `<button class="link small" data-week="0" style="--c:var(--cls)">Về tuần này</button>`}</div>
      <button data-week="1" aria-label="Tuần sau">›</button>
    </div>
    <div class="days">${strip}</div>
    <section class="card" style="--c:var(--cls)">
      <div class="card-h"><h2><i></i>${dayTitle}</h2>${allCls.length ? `<span class="small mut">${sess ? `${sess} buổi · ${(Math.round(mins / 6) / 10).toLocaleString("vi-VN")} giờ cả tuần` : "Cả tuần nghỉ"}</span>` : ""}</div>
      ${list.length ? classRows(list, selDate === td, selDate, clash) : `<div class="empty">${allCls.length ? "Không có tiết." : (persona() === "sv" ? "Chưa có môn nào. Dán thời khóa biểu (MyBK hoặc trang của trường) để nhập cả học kỳ một lần, hoặc bấm + để thêm từng môn." : "Chưa có môn nào. Bấm + để thêm từng môn theo thời khóa biểu.")}</div>`}
    </section>
    <div class="btns" style="margin:0 0 12px">${persona() === "sv" ? `<button class="btn" data-act="tkb">Dán thời khóa biểu</button>` : `<button class="btn" data-act="q-class">+ Thêm môn</button>`}${allCls.length ? `<button class="btn" data-act="ics">Đưa vào Lịch</button>` : ""}</div>
    ${allCls.length ? `<div class="group-h">Tất cả lịch học${endDate ? `<span>đến ${dm(endDate)}</span>` : ""}</div><div class="card list">${allCls.sort((a, b) => a.data.title.localeCompare(b.data.title, "vi") || WEEK_ORDER.indexOf((a.data.days || [])[0]) - WEEK_ORDER.indexOf((b.data.days || [])[0])).map(c =>
      `<div class="row tap" data-cdetail="${c.id}" data-date=""><div class="grow"><div class="t">${esc(c.data.title)}${isLab(c.data.title) ? ' <span class="chip c-gym">Thí nghiệm</span>' : ""}${(c.data.absent || []).length ? ` <span class="chip ${absentLevel(c) === "red" ? "c-danger" : ""}">Vắng ${(c.data.absent || []).length}</span>` : ""}</div><div class="m">${[(c.data.days || []).slice().sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b)).map(d => DOW[d]).join(", ") + ` ${esc(c.data.start)}–${esc(c.data.end)}`, c.data.room && esc(c.data.room), c.data.code && esc(c.data.code), esc(occText({ days: c.data.days || [], weeks: c.data.weeks || [] }, td))].filter(Boolean).join(" · ")}</div></div></div>`).join("")}</div>` : ""}`;
}

/* ---------- Tiền ---------- */
function viewMoney() {
  const month = ui.month;
  const [y, m] = month.split("-").map(Number);
  const list = monthTx(month).sort((a, b) => (b.data.date || "").localeCompare(a.data.date || "") || (b.data.at || 0) - (a.data.at || 0));
  const out = sumOut(list), inn = sumIn(list);
  const budget = +getSetting("budget", 0) || 0;
  const isCur = month === today().slice(0, 7);
  const daysIn = new Date(y, m, 0).getDate();
  const daysPassed = isCur ? new Date().getDate() : daysIn;
  const pm = new Date(y, m - 2, 1), prevMonth = `${pm.getFullYear()}-${pad(pm.getMonth() + 1)}`;
  const prevOut = sumOut(monthTx(prevMonth).filter(r => !isCur || +String(r.data.date).slice(8, 10) <= daysPassed));
  const cmp = prevOut ? Math.round((out - prevOut) / prevOut * 100) : null;
  const byCat = {};
  list.filter(r => r.data.type !== "in" && r.data.cat !== "tietkiem").forEach(r => { byCat[r.data.cat] = (byCat[r.data.cat] || 0) + r.data.amount; });
  const saved = sumSave(list);
  const catBudget = getSetting("catBudget", {}) || {};
  Object.keys(catBudget).forEach(k => { if (catBudget[k] > 0 && !(k in byCat) && CAT[k]) byCat[k] = 0; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1] || (catBudget[b[0]] || 0) - (catBudget[a[0]] || 0));
  const maxCat = cats.length ? Math.max(1, cats[0][1]) : 1;
  const bills = all("task").filter(t => t.data.status !== "done" && t.data.amount > 0 && (!t.data.due || t.data.due <= addDays(today(), 31))).sort(byDue).slice(0, 6);
  const goals = all("goal").sort((a, b) => (a.data.saved >= a.data.target) - (b.data.saved >= b.data.target) || (a.data.deadline || "9").localeCompare(b.data.deadline || "9"));
  const proj = isCur && out && daysPassed >= 3 && daysPassed < daysIn ? Math.round(out / daysPassed * daysIn) : 0;
  const nowD = new Date(), back = (nowD.getFullYear() - y) * 12 + nowD.getMonth() + 1 - m;
  const endY = back >= 0 && back <= 5 ? nowD.getFullYear() : y, endM = back >= 0 && back <= 5 ? nowD.getMonth() + 1 : m;
  const months6 = Array.from({ length: 6 }, (_, i) => { const d = new Date(endY, endM - 6 + i, 1); const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; return { k, m: d.getMonth() + 1, v: sumOut(monthTx(k)) }; });
  const byDay = {};
  list.forEach(r => { (byDay[r.data.date] = byDay[r.data.date] || []).push(r); });
  const td = today();

  const budgetLine = budget
    ? `<div class="mbar ${out > budget ? "over" : ""}" style="margin:12px 0 6px"><i style="width:${Math.min(100, out / budget * 100)}%"></i></div>
       <div class="small ${out > budget ? "red" : "mut"}">${out > budget ? `Vượt ngân sách ${money(out - budget)}` : `Còn ${money(budget - out)} trong ngân sách ${moneyShort(budget)}`}${isCur && out <= budget ? ` · ~${moneyShort((budget - out) / Math.max(1, daysIn - daysPassed + 1))}/ngày` : ""}</div>`
    : `<button class="link small" data-act="budget" style="margin-top:8px">Đặt ngân sách tháng</button>`;

  return header("Tiền", list.length ? `${list.length} khoản trong tháng` : "Thu chi cá nhân") + `
    <div class="month-nav">
      <button data-month="-1" aria-label="Tháng trước">‹</button>
      <b>Tháng ${m}/${y}</b>
      <button data-month="1" aria-label="Tháng sau" ${isCur ? 'style="visibility:hidden"' : ""}>›</button>
    </div>
    <section class="card" style="--c:var(--money)">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px">
        <div><div class="small mut">Đã chi</div><div class="big num">${money(out)}</div></div>
        <div style="text-align:right" class="small"><div class="mut">Thu <b class="green num">${money(inn)}</b></div><div class="mut">TB/ngày <b class="num" style="color:var(--fg)">${moneyShort(out / Math.max(1, daysPassed))}</b></div>${saved ? `<div class="mut">Để dành <b class="num" style="color:var(--fg)">${moneyShort(saved)}</b></div>` : ""}</div>
      </div>
      ${budgetLine}
      ${proj ? `<div class="small mut" style="margin-top:6px">Cứ đà này cả tháng chi khoảng <b class="${budget && proj > budget ? "red" : ""}" style="color:${budget && proj > budget ? "" : "var(--fg)"}">${moneyShort(proj)}</b>${budget && proj > budget ? `, vượt ngân sách ${moneyShort(proj - budget)}` : ""}</div>` : ""}
      ${cmp != null && out ? `<div class="small mut" style="margin-top:6px">So với ${isCur ? "cùng kỳ " : ""}tháng ${pm.getMonth() + 1}: <b class="${cmp > 0 ? "red" : "green"}">${cmp > 0 ? "+" : ""}${cmp}%</b> (${moneyShort(prevOut)})</div>` : ""}
      ${budget ? `<button class="link small" data-act="budget" style="margin-top:6px">Sửa ngân sách</button>` : ""}
    </section>
    ${isCur && bills.length ? `<section class="card" style="--c:var(--money)"><div class="card-h"><h2><i></i>Sắp phải trả</h2><span class="small mut num">${moneyShort(bills.reduce((s, t) => s + t.data.amount, 0))}</span></div><div class="list">${bills.map(taskRow).join("")}</div></section>` : ""}
    <section class="card" style="--c:var(--money)"><div class="card-h"><h2><i></i>Mục tiêu tiết kiệm</h2><button class="link small" data-act="goal">+ Thêm</button></div>
      ${goals.length ? goals.map(g => { const p = Math.min(100, Math.round((g.data.saved || 0) / Math.max(1, g.data.target) * 100)); return `<div class="goal tap" data-act="goal" data-id="${g.id}"><div class="emo">${esc(g.data.emoji || "🎯")}</div><div class="grow"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(g.data.name)}</b><span class="small num ${p >= 100 ? "green" : "mut"}">${p >= 100 ? "Đạt" : p + "%"}</span></div><div class="mbar" style="margin:6px 0 3px"><i style="width:${p}%"></i></div><div class="small mut num">${moneyShort(g.data.saved || 0)} / ${moneyShort(g.data.target)}${g.data.deadline ? ` · đến ${dm(g.data.deadline)}` : ""}</div></div></div>`; }).join("")
        : `<div class="empty">Để dành cho laptop, chuyến du lịch hay quỹ khẩn cấp. Bấm + Thêm để bắt đầu.</div>`}
    </section>
    ${months6.some(x => x.v) ? `<section class="card" style="--c:var(--money)"><div class="card-h"><h2><i></i>6 tháng gần đây</h2></div>${monthBars(months6, month)}</section>` : ""}
    ${cats.length ? `<section class="card" style="--c:var(--money)"><div class="card-h"><h2><i></i>Theo loại</h2><button class="link small" data-act="budget">Ngân sách từng loại</button></div>
      ${cats.map(([k, v]) => { const cb = +catBudget[k] || 0, over = cb && v > cb; return `<div class="cat-row"><span>${(CAT[k] || ["", "Khác", "📦"])[2]} ${esc((CAT[k] || ["", "Khác"])[1])}</span><div class="mbar ${over ? "over" : ""}"><i style="width:${Math.min(100, (cb ? v / cb : v / maxCat) * 100)}%"></i></div><span class="num small ${over ? "red" : ""}">${moneyShort(v)}${cb ? `<span class="mut">/${moneyShort(cb)}</span>` : ""}</span></div>`; }).join("")}
    </section>` : ""}
    ${Object.keys(byDay).length ? Object.keys(byDay).sort().reverse().map(d => {
      const rows = byDay[d];
      const label = d === td ? "Hôm nay" : dayDiff(td, d) === 1 ? "Hôm qua" : `${DOWL[parseYmd(d).getDay()]} ${dm(d)}`;
      return `<div class="group-h">${label}<span class="num">−${money(sumOut(rows))}</span></div><div class="card list">${rows.map(r => {
        const c = CAT[r.data.cat] || ["", "Khác", "📦"];
        return `<div class="row tap" data-edit="tx" data-id="${r.id}"><div class="emo">${c[2]}</div><div class="grow"><div class="t">${esc(r.data.note || c[1])}</div>${r.data.note ? `<div class="m">${esc(c[1])}</div>` : ""}</div><div class="amt num ${r.data.type === "in" ? "in" : ""}">${r.data.type === "in" ? "+" : "−"}${money(r.data.amount)}</div></div>`;
      }).join("")}</div>`;
    }).join("") : `<div class="card empty">Chưa ghi khoản nào trong tháng này. Bấm + để ghi, chỉ mất vài giây.</div>`}
    ${all("tx").length ? `<div class="btns" style="margin-top:4px"><button class="btn" data-act="csv">Xuất Excel (CSV)</button></div>` : ""}`;
}
function monthBars(list, sel) {
  const W = 320, H = 132, pt = 22, pb = 22, gap = 14, bw = (W - gap * (list.length + 1)) / list.length;
  const max = Math.max(1, ...list.map(x => x.v));
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Chi tiêu 6 tháng">
    <line x1="0" x2="${W}" y1="${H - pb}" y2="${H - pb}" stroke="var(--line)"/>
    ${list.map((x, i) => { const h = Math.max(x.v ? 3 : 0, (H - pt - pb) * x.v / max), xx = gap + i * (bw + gap), on = x.k === sel;
      return `<g data-gomonth="${x.k}" style="cursor:pointer"><rect x="${xx}" y="${pt}" width="${bw}" height="${H - pt - pb}" fill="transparent"/>
        <rect x="${xx}" y="${H - pb - h}" width="${bw}" height="${h}" rx="5" fill="var(--money)" opacity="${on ? 1 : .35}"/>
        <text x="${xx + bw / 2}" y="${H - pb - h - 6}" text-anchor="middle" font-size="11" font-weight="${on ? 700 : 500}" fill="var(--fg)">${x.v ? moneyShort(x.v) : ""}</text>
        <text x="${xx + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--mut)" font-weight="${on ? 700 : 400}">T${x.m}</text></g>`; }).join("")}
  </svg>`;
}
async function exportCsv() {
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = all("tx").sort((a, b) => (a.data.date || "").localeCompare(b.data.date || "") || (a.data.at || 0) - (b.data.at || 0));
  const lines = [["Ngày", "Loại", "Danh mục", "Ghi chú", "Số tiền (đ)"].map(q).join(",")]
    .concat(rows.map(r => { const d = r.data; return [`${String(d.date).slice(8, 10)}/${String(d.date).slice(5, 7)}/${String(d.date).slice(0, 4)}`, d.type === "in" ? "Thu" : "Chi", (CAT[d.cat] || ["", "Khác"])[1], d.note || "", d.type === "in" ? d.amount : -d.amount].map(q).join(","); }));
  if (await shareOrDownload(`thu-chi-${today()}.csv`, "\ufeff" + lines.join("\r\n"), "text/csv")) toast(`Đã xuất ${rows.length} khoản`);
}

/* ---------- Tập ---------- */
function viewGym() {
  const td = today(), ws = weekStart(td);
  const sess = sessions();
  const weekSess = sess.filter(s => s.data.date >= ws && s.data.date <= addDays(ws, 6));
  const weekDays = new Set(weekSess.map(s => s.data.date));
  const exSeen = [];
  sess.forEach(s => (s.data.items || []).forEach(i => { if (i.ex && !exSeen.includes(i.ex)) exSeen.push(i.ex); }));
  if (!ui.gymEx || !exSeen.includes(ui.gymEx)) ui.gymEx = exSeen[0] || null;
  const ex = ui.gymEx;

  let progress = "";
  if (ex) {
    const withEx = sess.filter(s => exTotal(s, ex) > 0);
    const series = withEx.slice(0, 12).reverse().map(s => ({ d: s.data.date, v: exTotal(s, ex) }));
    let best = 0;
    withEx.forEach(s => (s.data.items || []).filter(i => i.ex === ex).forEach(i => (i.sets || []).forEach(n => { if (n > best) best = n; })));
    const weekTotal = weekSess.reduce((t, s) => t + exTotal(s, ex), 0);
    const unit = exUnit(ex);
    progress = `<section class="card" style="--c:var(--gym)">
      <div class="card-h"><h2><i></i>Tiến bộ</h2></div>
      <div class="ex-pick">${exSeen.map(e => `<button class="${e === ex ? "on" : ""}" data-ex="${esc(e)}">${esc(e)}</button>`).join("")}</div>
      ${spark(series, unit)}
      <div class="stats3">
        <div><b class="num">${series.length ? series[series.length - 1].v : 0}</b><span>Buổi gần nhất (${unit})</span></div>
        <div><b class="num">${best}</b><span>Kỷ lục 1 hiệp</span></div>
        <div><b class="num">${weekTotal}</b><span>Tổng tuần này</span></div>
      </div>
    </section>`;
  }
  const ws12 = all("weight").sort((a, b) => (a.data.date || "").localeCompare(b.data.date || ""));
  const lastW = ws12[ws12.length - 1];
  const monthAgo = lastW ? [...ws12].reverse().find(x => dayDiff(lastW.data.date, x.data.date) >= 25) : null;
  const delta = lastW && monthAgo ? Math.round((lastW.data.kg - monthAgo.data.kg) * 10) / 10 : null;
  const weightCard = `<section class="card" style="--c:var(--gym)">
      <div class="card-h"><h2><i></i>Cân nặng</h2><button class="link small" data-act="weight" style="--c:var(--gym)">+ Ghi</button></div>
      ${lastW ? `<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:10px"><div><span class="big num">${lastW.data.kg.toLocaleString("vi-VN")}</span> <span class="mut">kg</span></div>
        <div class="small mut" style="text-align:right">${dm(lastW.data.date)}${delta != null ? `<br>${delta > 0 ? "+" : ""}${delta.toLocaleString("vi-VN")} kg so với ${dm(monthAgo.data.date)}` : ""}</div></div>
        ${ws12.length >= 2 ? spark(ws12.slice(-12).map(x => ({ d: x.data.date, v: x.data.kg })), "kg") : ""}
        <div class="small mut" style="margin-top:4px">${ws12.slice(-3).reverse().map(x => `<button class="link small" style="--c:var(--mut);margin-right:10px" data-act="weight" data-id="${x.id}">${dm(x.data.date)}: ${x.data.kg.toLocaleString("vi-VN")}kg</button>`).join("")}</div>`
      : `<div class="empty">Ghi cân nặng mỗi tuần để xem xu hướng.</div>`}
    </section>`;
  const prList = exSeen.map(e => { let best = 0, when = ""; sess.forEach(s => (s.data.items || []).filter(i => i.ex === e).forEach(i => (i.sets || []).forEach(n => { if (n > best) { best = n; when = s.data.date; } }))); return { e, best, when }; }).filter(x => x.best);
  return header("Tập luyện", `${weekDays.size} buổi tuần này`) + `
    <section class="card" style="--c:var(--gym)">
      <div class="card-h"><h2><i></i>Tuần này</h2><span class="small mut">${weekDays.size}/7 ngày</span></div>
      ${weekGrid(ws, weekDays)}
    </section>
    ${progress}
    ${prList.length ? `<section class="card" style="--c:var(--gym)"><div class="card-h"><h2><i></i>Kỷ lục cá nhân</h2><span class="small mut">1 hiệp tốt nhất</span></div>
      ${prList.map(x => `<div class="cat-row" style="grid-template-columns:1fr auto auto"><span>${esc(x.e)}</span><b class="num">${x.best} ${exUnit(x.e)}</b><span class="small mut">${dm(x.when)}</span></div>`).join("")}</section>` : ""}
    ${weightCard}
    ${sess.length ? `<div class="group-h">Lịch sử</div><div class="card list">${sess.slice(0, 40).map(s =>
      `<div class="row tap" data-edit="workout" data-id="${s.id}"><div class="emo">💪</div><div class="grow"><div class="t">${s.data.date === td ? "Hôm nay" : `${DOWL[parseYmd(s.data.date).getDay()]} ${dm(s.data.date)}`}${s.data.mins ? ` <span class="mut small">· ${s.data.mins} phút</span>` : ""}</div><div class="m">${esc(sessionSummary(s))}</div></div></div>`).join("")}</div>`
      : `<div class="card empty">Chưa có buổi tập nào. Bấm + để ghi buổi đầu tiên.</div>`}`;
}
function spark(series, unit) {
  if (series.length < 2) return `<div class="empty">Ghi thêm ít nhất 2 buổi có bài này để thấy biểu đồ.</div>`;
  const W = 320, H = 130, px = 14, pt = 24, pb = 22;
  const vals = series.map(s => s.v);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (lo === hi) { lo = Math.max(0, lo - 1); hi = hi + 1; }
  const x = i => px + i * (W - 2 * px) / (series.length - 1);
  const y = v => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  const pts = series.map((s, i) => `${x(i).toFixed(1)},${y(s.v).toFixed(1)}`).join(" ");
  const lastI = series.length - 1;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Tổng ${unit} mỗi buổi">
    <line x1="${px}" x2="${W - px}" y1="${H - pb}" y2="${H - pb}" stroke="var(--line)"/>
    <polyline points="${pts}" fill="none" stroke="var(--gym)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${series.map((s, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(s.v).toFixed(1)}" r="${i === lastI ? 4.5 : 3}" fill="${i === lastI ? "var(--gym)" : "var(--card)"}" stroke="var(--gym)" stroke-width="2"/>`).join("")}
    <text x="${x(lastI).toFixed(1)}" y="${(y(series[lastI].v) - 9).toFixed(1)}" text-anchor="end" font-size="12" font-weight="700" fill="var(--fg)">${series[lastI].v.toLocaleString("vi-VN")}</text>
    <text x="${px}" y="${H - 6}" font-size="11" fill="var(--mut)">${dm(series[0].d)}</text>
    <text x="${W - px}" y="${H - 6}" font-size="11" fill="var(--mut)" text-anchor="end">${dm(series[lastI].d)}</text>
  </svg>`;
}

/* ================= sheet ================= */
let sheetEl = null, shadeEl = null, sheetHist = false;
function openSheet({ title, html, color, full, onMount }) {
  if (sheetEl) { sheetEl.remove(); shadeEl.remove(); sheetEl = shadeEl = null; }
  shadeEl = document.createElement("div"); shadeEl.className = "shade";
  sheetEl = document.createElement("div"); sheetEl.className = "sheet" + (full ? " full" : "");
  sheetEl.setAttribute("role", "dialog"); sheetEl.setAttribute("aria-modal", "true");
  sheetEl.style.setProperty("--c", color || "var(--fg)");
  if (!color || color === "var(--fg)") sheetEl.style.setProperty("--on-c", "var(--bg)");
  sheetEl.innerHTML = `<div class="sheet-h"><h3>${esc(title)}</h3><button class="x" data-close>Đóng</button></div><div class="sheet-b">${html}</div>`;
  document.body.append(shadeEl, sheetEl);
  shadeEl.addEventListener("click", () => closeSheet());
  sheetEl.querySelector("[data-close]").addEventListener("click", () => closeSheet());
  requestAnimationFrame(() => requestAnimationFrame(() => { shadeEl && shadeEl.classList.add("in"); sheetEl && sheetEl.classList.add("in"); }));
  document.body.style.overflow = "hidden";
  if (!sheetHist) { try { history.pushState({ hnSheet: 1 }, ""); sheetHist = true; } catch {} }
  if (onMount) onMount(sheetEl.querySelector(".sheet-b"));
}
function closeSheet(fromPop) {
  if (!sheetEl) return;
  const s = sheetEl, sh = shadeEl;
  sheetEl = shadeEl = null;
  document.body.style.overflow = "";
  s.classList.remove("in"); sh.classList.remove("in");
  setTimeout(() => { s.remove(); sh.remove(); }, 260);
  if (sheetHist && !fromPop) { sheetHist = false; try { history.back(); } catch {} }
  else sheetHist = false;
}
window.addEventListener("popstate", () => { if (sheetHist) { sheetHist = false; closeSheet(true); } });

function bindPills(root, state, onChange) {
  $$("[data-pick]", root).forEach(group => {
    const key = group.dataset.pick, multi = group.hasAttribute("data-multi");
    group.addEventListener("click", e => {
      const b = e.target.closest("button[data-v]"); if (!b) return;
      e.preventDefault();
      let v = b.dataset.v; if (/^-?\d+$/.test(v) && group.hasAttribute("data-num")) v = +v;
      if (multi) {
        const arr = state[key] || (state[key] = []);
        const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v);
        b.classList.toggle("on", arr.includes(v));
      } else {
        state[key] = v;
        $$("button[data-v]", group).forEach(x => x.classList.toggle("on", x === b));
      }
      onChange && onChange(key, v);
    });
  });
}
const pills = (key, opts, cur, extra = "") => `<div class="pills" data-pick="${key}" ${extra}>${opts.map(([v, label]) => {
  const on = Array.isArray(cur) ? cur.includes(v) : cur === v;
  return `<button type="button" class="${on ? "on" : ""}" data-v="${esc(v)}">${label}</button>`;
}).join("")}</div>`;

/* ---------- toast ---------- */
let toastT = null;
function toast(msg, action) {
  let el = $("#toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action.label)}</button>` : ""}`;
  if (action) el.querySelector("button").onclick = () => { action.fn(); el.classList.remove("in"); };
  el.classList.add("in");
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove("in"), action ? 4500 : 1800);
}
function confirmDelete(id, label) {
  const snap = db[id] && JSON.parse(JSON.stringify(db[id]));
  remove(id); closeSheet();
  if (snap) toast(`Đã xóa ${label}`, { label: "Hoàn tác", fn: () => restore(snap) });
}

/* ---------- form: việc ---------- */
function taskForm(id, preset) {
  const r = id ? db[id] : null;
  const t = r ? JSON.parse(JSON.stringify(r.data)) : { title: "", tag: "", type: "bai", due: "", time: "", status: "todo", waitFor: "", note: "", subs: [], ...(preset || {}) };
  const st = { type: t.type || "bai", status: t.status || "todo", repeat: t.repeat || "" };
  let subs = (t.subs || []).map(s => ({ ...s }));
  const tags = [...new Set([...all("task").map(x => x.data.tag), ...all("class").map(x => x.data.title)].filter(Boolean))];
  const td = today();
  const subRow = (s, i) => `<div class="sub-row" data-i="${i}">
      <button type="button" class="check ${s.done ? "on" : ""}" data-subcheck aria-label="Xong phần này"></button>
      <input data-subtext value="${esc(s.text)}" placeholder="Phần việc">
      <input data-subwho value="${esc(s.who || "")}" placeholder="Ai làm">
      <button type="button" class="rm" data-subrm aria-label="Bỏ">×</button></div>`;
  openSheet({
    title: r ? "Sửa việc" : "Việc mới", color: "var(--task)",
    html: `
      <div class="f"><input name="title" placeholder="Cần làm gì?" value="${esc(t.title)}" autocomplete="off"></div>
      <div class="f"><label>Môn / nhóm</label><input name="tag" list="hn-tags" value="${esc(t.tag)}" placeholder="VD: Lịch sử Đảng" autocomplete="off"><datalist id="hn-tags">${tags.map(x => `<option value="${esc(x)}">`).join("")}</datalist></div>
      <div class="f"><label>Loại</label>${pills("type", taskTypes(), st.type)}</div>
      <div class="f"><label>Hạn</label>
        <div class="pills" data-quickdue style="margin-bottom:8px">
          <button type="button" data-d="0">Hôm nay</button><button type="button" data-d="1">Mai</button><button type="button" data-d="3">+3 ngày</button><button type="button" data-d="7">+1 tuần</button><button type="button" data-d="">Không hạn</button>
        </div>
        <div class="f2"><input type="date" name="due" value="${esc(t.due)}" aria-label="Ngày hạn"><input type="time" name="time" value="${esc(t.time)}" aria-label="Giờ hạn"></div>
      </div>
      <div class="f"><label>Trạng thái</label>${pills("status", [["todo", "Cần làm"], ["waiting", "Chờ người khác"], ["done", "Xong"]], st.status)}</div>
      <div class="f2 f"><div><label class="lbl">Số tiền phải trả (nếu có)</label><input name="amount" inputmode="decimal" value="${t.amount ? moneyShort(t.amount) : ""}" placeholder="VD: 3tr"></div>
        <div><label class="lbl">Ghi vào loại</label><select name="cat">${OUT_CATS.map(([k, n, e]) => `<option value="${k}" ${(t.cat || "nha") === k ? "selected" : ""}>${e} ${n}</option>`).join("")}</select></div></div>
      <div class="f"><label>Lặp lại</label>${pills("repeat", REPEATS, st.repeat)}
        <div data-untilbox ${st.repeat ? "" : "hidden"} style="margin-top:8px"><label class="lbl">Lặp đến ngày (không bắt buộc)</label><input type="date" name="until" value="${esc(t.until || "")}">
        <div class="hint">Đánh dấu xong thì lần kế tiếp tự hiện với hạn mới. Chưa đặt hạn thì lấy hôm nay.</div></div></div>
      <div class="f" data-waitbox ${st.status === "waiting" ? "" : "hidden"}><label>Đang chờ ai, việc gì?</label><input name="waitFor" value="${esc(t.waitFor)}" placeholder="VD: Thầy Hưng ký giấy xác nhận"></div>
      <div class="f"><label>Phần việc (BTL nhóm, chia việc)</label><div data-subs>${subs.map(subRow).join("")}</div>
        <button type="button" class="btn" data-addsub style="padding:8px 12px;font-size:14px">+ Thêm phần</button></div>
      <div class="f"><label>Ghi chú</label><textarea name="note" placeholder="Link đề, yêu cầu, liên hệ…">${esc(t.note)}</textarea></div>
      <div class="btns">${r ? `<button class="btn danger" data-del>Xóa</button>` : ""}<button class="btn pri" data-save>Lưu</button></div>`,
    onMount(b) {
      bindPills(b, st, k => { if (k === "status") $("[data-waitbox]", b).hidden = st.status !== "waiting"; if (k === "repeat") $("[data-untilbox]", b).hidden = !st.repeat; });
      $("[data-quickdue]", b).addEventListener("click", e => {
        const btn = e.target.closest("button"); if (!btn) return;
        $("[name=due]", b).value = btn.dataset.d === "" ? "" : addDays(td, +btn.dataset.d);
        if (btn.dataset.d === "") $("[name=time]", b).value = "";
      });
      const box = $("[data-subs]", b);
      const readSubs = () => $$(".sub-row", box).map(row => ({ text: $("[data-subtext]", row).value.trim(), who: $("[data-subwho]", row).value.trim(), done: $("[data-subcheck]", row).classList.contains("on") }));
      box.addEventListener("click", e => {
        if (e.target.closest("[data-subcheck]")) e.target.closest("[data-subcheck]").classList.toggle("on");
        if (e.target.closest("[data-subrm]")) { subs = readSubs(); subs.splice(+e.target.closest(".sub-row").dataset.i, 1); box.innerHTML = subs.map(subRow).join(""); }
      });
      $("[data-addsub]", b).addEventListener("click", () => { subs = readSubs(); subs.push({ text: "", who: "", done: false }); box.innerHTML = subs.map(subRow).join(""); $$("[data-subtext]", box).pop().focus(); });
      $("[data-save]", b).addEventListener("click", () => {
        const title = $("[name=title]", b).value.trim();
        if (!title) { $("[name=title]", b).focus(); toast("Nhập tên việc trước đã"); return; }
        const data = {
          ...t, title, tag: $("[name=tag]", b).value.trim(), type: st.type, status: st.status,
          due: $("[name=due]", b).value, time: $("[name=time]", b).value,
          waitFor: st.status === "waiting" ? $("[name=waitFor]", b).value.trim() : "",
          note: $("[name=note]", b).value.trim(),
          subs: readSubs().filter(s => s.text),
          createdAt: t.createdAt || Date.now(),
          doneAt: st.status === "done" ? (t.status === "done" && t.doneAt ? t.doneAt : Date.now()) : null,
        };
        data.repeat = st.repeat; data.until = st.repeat ? $("[name=until]", b).value : "";
        data.amount = parseMoney($("[name=amount]", b).value); data.cat = data.amount ? $("[name=cat]", b).value : "";
        if (data.repeat && !data.due) data.due = today();
        const saved = put("task", data, id);
        const becameDone = st.status === "done" && t.status !== "done";
        const sp = becameDone ? spawnNext(saved) : null, paid = becameDone ? payTask(saved) : null;
        closeSheet(); toast([paid && `Đã ghi chi ${moneyShort(data.amount)}`, sp && `Lần tới: ${dm(sp.data.due)}`].filter(Boolean).join(". ") || (r ? "Đã lưu" : "Đã thêm việc"));
      });
      const del = $("[data-del]", b); if (del) del.addEventListener("click", () => confirmDelete(id, "việc"));
      if (!r) setTimeout(() => $("[name=title]", b).focus(), 280);
    }
  });
}

/* ---------- form: môn học ---------- */
function classForm(id) {
  const r = id ? db[id] : null;
  const c = r ? JSON.parse(JSON.stringify(r.data)) : { title: "", code: "", group: "", days: [ui.calDay], start: "07:00", end: "09:50", room: "", teacher: "", note: "" };
  const st = { days: (c.days || []).slice() };
  const tietOpts = n => Array.from({ length: 16 }, (_, i) => i + 1).map(i => `<option value="${i}" ${i === n ? "selected" : ""}>Tiết ${i}</option>`).join("");
  const guessT = (time, isEnd) => { const m = toMin(time); if (m == null) return 1; let best = 1, bd = 1e9; for (let i = 1; i <= 16; i++) { const d = Math.abs(toMin(isEnd ? tietEnd(i) : tietStart(i)) - m); if (d < bd) { bd = d; best = i; } } return best; };
  openSheet({
    title: r ? "Sửa môn học" : "Thêm môn học", color: "var(--cls)",
    html: `
      <div class="f"><input name="title" placeholder="Tên môn" value="${esc(c.title)}" autocomplete="off"></div>
      <div class="f2 f"><div><label class="lbl">Mã môn</label><input name="code" value="${esc(c.code)}" placeholder="EE3001" autocapitalize="characters"></div><div><label class="lbl">Nhóm / lớp</label><input name="group" value="${esc(c.group)}" placeholder="L01" autocapitalize="characters"></div></div>
      <div class="f"><label>Học vào thứ</label>${pills("days", WEEK_ORDER.map(d => [d, DOW[d]]), st.days, "data-multi data-num")}</div>
      <div class="f"><label>Tiết</label><div class="f2"><select name="t1">${tietOpts(guessT(c.start))}</select><select name="t2">${tietOpts(guessT(c.end, true))}</select></div>
        <div class="f2" style="margin-top:8px"><input type="time" name="start" value="${esc(c.start)}" aria-label="Giờ bắt đầu"><input type="time" name="end" value="${esc(c.end)}" aria-label="Giờ kết thúc"></div>
        <div class="hint">Chọn tiết sẽ tự điền giờ theo ${tietLabel()}. Giờ khác thì sửa trực tiếp.</div></div>
      <div class="f"><label>Tuần học (để trống = tuần nào cũng học)</label><input name="weeks" value="${esc(weeksText(c.weeks))}" placeholder="VD: 35-42, 44-50" inputmode="numeric">
        <div class="hint">Số tuần trong năm, như cột "Tuần học" trên MyBK. Tuần này là tuần ${isoWeek(today())}.</div></div>
      <div class="f2 f"><div><label class="lbl">Phòng</label><input name="room" value="${esc(c.room)}" placeholder="H6-301"></div><div><label class="lbl">Giảng viên</label><input name="teacher" value="${esc(c.teacher)}" placeholder="Thầy …"></div></div>
      <div class="f"><label>Ghi chú</label><textarea name="note" placeholder="Link MS Teams, BKeL, cách tính điểm…">${esc(c.note)}</textarea></div>
      <div class="btns">${r ? `<button class="btn danger" data-del>Xóa</button>` : ""}<button class="btn pri" data-save>Lưu</button></div>`,
    onMount(b) {
      bindPills(b, st);
      $("[name=t1]", b).addEventListener("change", e => { $("[name=start]", b).value = tietStart(+e.target.value); if (+$("[name=t2]", b).value < +e.target.value) { $("[name=t2]", b).value = e.target.value; $("[name=end]", b).value = tietEnd(+e.target.value); } });
      $("[name=t2]", b).addEventListener("change", e => { $("[name=end]", b).value = tietEnd(+e.target.value); });
      $("[data-save]", b).addEventListener("click", () => {
        const title = $("[name=title]", b).value.trim();
        const start = $("[name=start]", b).value, end = $("[name=end]", b).value;
        if (!title) { $("[name=title]", b).focus(); toast("Nhập tên môn"); return; }
        if (!st.days.length) { toast("Chọn ít nhất một thứ"); return; }
        if (!start || !end || toMin(end) <= toMin(start)) { toast("Giờ kết thúc phải sau giờ bắt đầu"); return; }
        put("class", { ...c, title, code: $("[name=code]", b).value.trim().toUpperCase(), group: $("[name=group]", b).value.trim().toUpperCase(), days: st.days.slice().sort(), start, end, room: $("[name=room]", b).value.trim(), teacher: $("[name=teacher]", b).value.trim(), note: $("[name=note]", b).value.trim(), weeks: parseWeeks($("[name=weeks]", b).value) }, id);
        const saved = Object.values(db).find(x => x.kind === "class" && !x.deleted && x.data.title === title && x.data.start === start && (!id || x.id === id));
        const clash = saved ? conflicts([{ ...saved.data, id: saved.id }, ...all("class").filter(x => x.id !== saved.id).map(x => ({ ...x.data, id: x.id }))]).filter(x => x.a.id === saved.id || x.b.id === saved.id) : [];
        closeSheet();
        if (clash.length) { const o = clash[0].a.id === saved.id ? clash[0].b : clash[0].a; toast(`Đã lưu, nhưng trùng giờ với ${o.title} (${DOW[clash[0].day]})`); }
        else toast(r ? "Đã lưu" : "Đã thêm môn");
      });
      const del = $("[data-del]", b); if (del) del.addEventListener("click", () => confirmDelete(id, "môn"));
      if (!r) setTimeout(() => $("[name=title]", b).focus(), 280);
    }
  });
}

/* ---------- form: chi tiêu ---------- */
function txForm(id) {
  const r = id ? db[id] : null;
  const x = r ? JSON.parse(JSON.stringify(r.data)) : { type: "out", amount: 0, cat: "an", note: "", date: today() };
  const st = { type: x.type || "out", cat: x.cat || "an" };
  const recentNotes = [...new Set(all("tx").sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).map(t => t.data.note).filter(Boolean))].slice(0, 30);
  const catPills = () => pills("cat", (st.type === "in" ? IN_CATS : OUT_CATS).map(([k, n, e]) => [k, `${e} ${n}`]), st.cat);
  const cmb = r ? [] : combos();
  openSheet({
    title: r ? "Sửa khoản" : "Ghi khoản mới", color: "var(--money)",
    html: `
      <div class="seg" data-pick="type">
        <button type="button" class="${st.type === "out" ? "on" : ""}" data-v="out">Chi ra</button>
        <button type="button" class="${st.type === "in" ? "on" : ""}" data-v="in">Thu vào</button>
      </div>
      <div class="f"><input class="amount-in num" name="amount" inputmode="decimal" placeholder="0" value="${x.amount ? esc(x.amount.toLocaleString("vi-VN")) : ""}" autocomplete="off" aria-label="Số tiền">
        <div class="hint" data-preview>Gõ 35 = 35.000đ · 1,5tr = 1.500.000đ</div></div>
      ${cmb.length ? `<div class="f"><label>Hay chi</label><div class="combos" style="margin-top:0" data-combos>${cmb.map((c, i) => `<button type="button" data-i="${i}">${esc(c.note)} ${moneyShort(c.amount)}</button>`).join("")}</div></div>` : ""}
      <div class="pills f" data-quick><button type="button" data-a="20000">20k</button><button type="button" data-a="30000">30k</button><button type="button" data-a="50000">50k</button><button type="button" data-a="100000">100k</button><button type="button" data-a="200000">200k</button></div>
      <div class="f" data-cats>${catPills()}</div>
      <div class="f"><label>Ghi chú</label><input name="note" list="hn-notes" value="${esc(x.note)}" placeholder="VD: cơm trưa căn tin" autocomplete="off"><datalist id="hn-notes">${recentNotes.map(n => `<option value="${esc(n)}">`).join("")}</datalist></div>
      <div class="f"><label>Ngày</label><input type="date" name="date" value="${esc(x.date)}"></div>
      <div class="btns">${r ? `<button class="btn danger" data-del>Xóa</button>` : ""}<button class="btn pri" data-save>Lưu</button></div>`,
    onMount(b) {
      const amt = $("[name=amount]", b), prev = $("[data-preview]", b);
      const upd = () => { const v = parseMoney(amt.value); prev.textContent = v ? "= " + money(v) : "Gõ 35 = 35.000đ · 1,5tr = 1.500.000đ"; };
      amt.addEventListener("input", upd); upd();
      const segBox = $(".seg", b);
      segBox.addEventListener("click", e => {
        const btn = e.target.closest("button[data-v]"); if (!btn) return;
        st.type = btn.dataset.v;
        $$("button", segBox).forEach(x => x.classList.toggle("on", x === btn));
        st.cat = st.type === "in" ? "giadinh" : "an";
        $("[data-cats]", b).innerHTML = catPills(); bindPills($("[data-cats]", b), st);
      });
      bindPills($("[data-cats]", b), st);
      const cb = $("[data-combos]", b);
      if (cb) cb.addEventListener("click", e => {
        const btn = e.target.closest("button[data-i]"); if (!btn) return;
        const c = cmb[+btn.dataset.i];
        amt.value = c.amount.toLocaleString("vi-VN"); upd();
        $("[name=note]", b).value = c.note;
        st.cat = c.cat; $("[data-cats]", b).innerHTML = catPills(); bindPills($("[data-cats]", b), st);
      });
      $("[data-quick]", b).addEventListener("click", e => { const btn = e.target.closest("button"); if (!btn) return; amt.value = (+btn.dataset.a).toLocaleString("vi-VN"); upd(); });
      $("[data-save]", b).addEventListener("click", () => {
        const v = parseMoney(amt.value);
        if (!v) { amt.focus(); toast("Nhập số tiền"); return; }
        const date = $("[name=date]", b).value || today();
        put("tx", { ...x, type: st.type, amount: v, cat: st.cat, note: $("[name=note]", b).value.trim(), date, at: x.at || Date.now() }, id);
        if (date.slice(0, 7) !== ui.month && ui.tab === "money") { ui.month = date.slice(0, 7); render(); }
        closeSheet(); toast(`${st.type === "in" ? "Thu" : "Chi"} ${money(v)}`);
      });
      const del = $("[data-del]", b); if (del) del.addEventListener("click", () => confirmDelete(id, "khoản"));
      if (!r) setTimeout(() => amt.focus(), 280);
    }
  });
}
function budgetForm() {
  const cur = +getSetting("budget", 0) || 0;
  const cb = getSetting("catBudget", {}) || {};
  openSheet({
    title: "Ngân sách mỗi tháng", color: "var(--money)",
    html: `<div class="f"><label>Tổng mỗi tháng</label><input class="amount-in num" name="b" inputmode="decimal" value="${cur ? cur.toLocaleString("vi-VN") : ""}" placeholder="VD: 3tr"><div class="hint" data-p></div></div>
      <div class="f"><label>Từng loại (không bắt buộc)</label><div class="catb">${OUT_CATS.map(([k, n, e]) => `<label><span>${e} ${n}</span><input inputmode="decimal" data-cb="${k}" value="${cb[k] ? moneyShort(cb[k]) : ""}" placeholder="—"></label>`).join("")}</div>
        <div class="hint">Gõ 1,5tr hoặc 500k. Vượt mức thì thanh của loại đó chuyển đỏ.</div></div>
      <div class="btns">${cur ? `<button class="btn" data-clear>Bỏ ngân sách</button>` : ""}<button class="btn pri" data-save>Lưu</button></div>`,
    onMount(b) {
      const inp = $("[name=b]", b), p = $("[data-p]", b);
      const upd = () => { const v = parseMoney(inp.value); p.textContent = v ? "= " + money(v) + " mỗi tháng" : "Gõ 3tr = 3.000.000đ"; };
      inp.addEventListener("input", upd); upd();
      $("[data-save]", b).addEventListener("click", () => {
        const o = {}; $$("[data-cb]", b).forEach(x => { const v = parseMoney(x.value); if (v) o[x.dataset.cb] = v; });
        setSetting("budget", parseMoney(inp.value)); setSetting("catBudget", o); closeSheet(); toast("Đã lưu ngân sách");
      });
      const c = $("[data-clear]", b); if (c) c.addEventListener("click", () => { setSetting("budget", 0); closeSheet(); });
      setTimeout(() => inp.focus(), 280);
    }
  });
}

/* ---------- form: buổi tập ---------- */
function workoutForm(id) {
  const r = id ? db[id] : null;
  const w = r ? JSON.parse(JSON.stringify(r.data)) : { date: today(), items: [], mins: "", note: "" };
  let items = (w.items || []).map(i => ({ ex: i.ex, sets: (i.sets || []).join(" "), kg: i.kg || "" }));
  const lastSess = sessions().find(s => s.id !== id);
  if (!items.length) items = [{ ex: "Hít xà", sets: "", kg: "" }];
  const known = [...new Set([...EXERCISES.map(e => e[0]), ...sessions().flatMap(s => (s.data.items || []).map(i => i.ex))])];
  const exRow = (it, i) => {
    const custom = it.ex && !known.includes(it.ex);
    return `<div class="ex-row" data-i="${i}">
      <div class="hd"><select data-ex>${known.map(e => `<option ${e === it.ex ? "selected" : ""}>${esc(e)}</option>`).join("")}<option value="__new" ${custom ? "selected" : ""}>Bài khác…</option></select>
      <button type="button" class="rm" data-rm aria-label="Bỏ bài">×</button></div>
      <input data-custom placeholder="Tên bài" value="${custom ? esc(it.ex) : ""}" ${custom ? "" : "hidden"} style="margin-bottom:8px">
      <div class="f2"><input data-sets inputmode="text" placeholder="${exUnit(it.ex) === "giây" ? "Giây mỗi hiệp: 60 45 45" : "Số lần mỗi hiệp: 10 8 8 hoặc 4x10"}" value="${esc(it.sets)}"><input data-kg inputmode="decimal" placeholder="kg" value="${esc(it.kg)}"></div>
    </div>`;
  };
  openSheet({
    title: r ? "Sửa buổi tập" : "Ghi buổi tập", color: "var(--gym)",
    html: `
      <div class="f2 f"><div><label class="lbl">Ngày</label><input type="date" name="date" value="${esc(w.date)}"></div><div><label class="lbl">Thời gian (phút)</label><input name="mins" inputmode="numeric" value="${esc(w.mins)}" placeholder="45"></div></div>
      ${!r && lastSess ? `<button type="button" class="btn block f" data-repeat style="font-size:14px">Lặp lại bài của buổi trước (${dm(lastSess.data.date)})</button>` : ""}
      <div data-items>${items.map(exRow).join("")}</div>
      <button type="button" class="btn f" data-add style="padding:8px 12px;font-size:14px">+ Thêm bài</button>
      <div class="f"><label>Hẹn giờ nghỉ giữa hiệp</label><div class="pills" data-rest style="--c:var(--gym)"><button type="button" data-s="60">1 phút</button><button type="button" data-s="90">1 phút 30</button><button type="button" data-s="120">2 phút</button><button type="button" data-s="180">3 phút</button></div>
        <div class="rest" data-restbox hidden><b class="num" data-restv>0:00</b><button type="button" class="link" data-reststop style="--c:var(--mut)">Dừng</button></div></div>
      <div class="f"><label>Ghi chú</label><textarea name="note" placeholder="Cảm giác, chỗ cần cải thiện…">${esc(w.note)}</textarea></div>
      <div class="btns">${r ? `<button class="btn danger" data-del>Xóa</button>` : ""}<button class="btn pri" data-save>Lưu</button></div>`,
    onMount(b) {
      const box = $("[data-items]", b);
      const read = () => $$(".ex-row", box).map(row => {
        const sel = $("[data-ex]", row).value;
        return { ex: sel === "__new" ? $("[data-custom]", row).value.trim() : sel, sets: $("[data-sets]", row).value, kg: $("[data-kg]", row).value };
      });
      const redraw = () => { box.innerHTML = items.map(exRow).join(""); };
      box.addEventListener("change", e => {
        if (e.target.matches("[data-ex]")) {
          const row = e.target.closest(".ex-row"), isNew = e.target.value === "__new";
          $("[data-custom]", row).hidden = !isNew; if (isNew) $("[data-custom]", row).focus();
          $("[data-sets]", row).placeholder = exUnit(e.target.value) === "giây" ? "Giây mỗi hiệp: 60 45 45" : "Số lần mỗi hiệp: 10 8 8 hoặc 4x10";
        }
      });
      box.addEventListener("click", e => { if (e.target.closest("[data-rm]")) { items = read(); items.splice(+e.target.closest(".ex-row").dataset.i, 1); redraw(); } });
      $("[data-add]", b).addEventListener("click", () => {
        items = read();
        const used = items.map(i => i.ex);
        items.push({ ex: known.find(e => !used.includes(e)) || known[0], sets: "", kg: "" });
        redraw(); $$("[data-sets]", box).pop().focus();
      });
      let restT = null, actx = null;
      const restBox = $("[data-restbox]", b), restV = $("[data-restv]", b);
      const beep = () => { try { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(actx.destination); g.gain.setValueAtTime(.25, actx.currentTime); o.start(); o.stop(actx.currentTime + .25); setTimeout(() => { try { const o2 = actx.createOscillator(); o2.frequency.value = 1175; o2.connect(g); o2.start(); o2.stop(actx.currentTime + .3); } catch {} }, 320); } catch {} };
      const stopRest = () => { clearInterval(restT); restT = null; restBox.hidden = true; $$("[data-rest] button", b).forEach(x => x.classList.remove("on")); };
      $("[data-rest]", b).addEventListener("click", e => {
        const btn = e.target.closest("button[data-s]"); if (!btn) return;
        try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume && actx.resume(); } catch {}
        stopRest(); btn.classList.add("on"); restBox.hidden = false;
        const endAt = Date.now() + +btn.dataset.s * 1000;
        const tickR = () => {
          if (!document.body.contains(b)) { stopRest(); return; }
          const left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
          restV.textContent = `${Math.floor(left / 60)}:${pad(left % 60)}`;
          if (!left) { stopRest(); buzz([220, 120, 220]); beep(); toast("Hết giờ nghỉ, vào hiệp tiếp!"); }
        };
        tickR(); restT = setInterval(tickR, 250);
      });
      $("[data-reststop]", b).addEventListener("click", stopRest);
      const rep = $("[data-repeat]", b);
      if (rep) rep.addEventListener("click", () => { items = (lastSess.data.items || []).map(i => ({ ex: i.ex, sets: "", kg: i.kg || "" })); redraw(); rep.remove(); });
      $("[data-save]", b).addEventListener("click", () => {
        const list = read().map(i => ({ ex: i.ex, sets: parseSets(i.sets), kg: parseFloat(String(i.kg).replace(",", ".")) || 0 })).filter(i => i.ex && i.sets.length);
        const note = $("[name=note]", b).value.trim();
        if (!list.length && !note) { toast("Nhập số lần cho ít nhất một bài"); return; }
        const prev = {};
        sessions().filter(x => x.id !== id).forEach(x => (x.data.items || []).forEach(i => (i.sets || []).forEach(n => { if (n > (prev[i.ex] || 0)) prev[i.ex] = n; })));
        const prs = []; list.forEach(i => { const best = Math.max(...i.sets); if (prev[i.ex] && best > prev[i.ex] && !prs.some(p => p.ex === i.ex)) prs.push({ ex: i.ex, best, old: prev[i.ex] }); });
        put("workout", { ...w, date: $("[name=date]", b).value || today(), mins: parseInt($("[name=mins]", b).value, 10) || "", items: list, note }, id);
        closeSheet();
        if (prs.length) { buzz([30, 60, 30]); toast(`Kỷ lục mới: ${prs.map(p => `${p.ex} ${p.best} ${exUnit(p.ex)} (cũ ${p.old})`).join(", ")}`); }
        else toast(r ? "Đã lưu" : "Đã ghi buổi tập");
      });
      const del = $("[data-del]", b); if (del) del.addEventListener("click", () => confirmDelete(id, "buổi tập"));
    }
  });
}

function weightForm(id) {
  const r = id ? db[id] : null;
  const last = all("weight").sort((a, b) => (b.data.date || "").localeCompare(a.data.date || ""))[0];
  const w = r ? { ...r.data } : { date: today(), kg: last ? last.data.kg : "" };
  openSheet({
    title: r ? "Sửa cân nặng" : "Ghi cân nặng", color: "var(--gym)",
    html: `<div class="f"><input class="amount-in num" name="kg" inputmode="decimal" value="${w.kg !== "" ? String(w.kg).replace(".", ",") : ""}" placeholder="kg" aria-label="Cân nặng (kg)"></div>
      <div class="f"><label>Ngày</label><input type="date" name="date" value="${esc(w.date)}"></div>
      <div class="hint">Cân vào cùng một thời điểm (sáng, trước khi ăn) để so sánh chính xác.</div>
      <div class="btns">${r ? `<button class="btn danger" data-del>Xóa</button>` : ""}<button class="btn pri" data-save>Lưu</button></div>`,
    onMount(b) {
      const inp = $("[name=kg]", b);
      $("[data-save]", b).addEventListener("click", () => {
        const kg = Math.round(parseFloat(inp.value.replace(",", ".")) * 10) / 10;
        if (!(kg > 20 && kg < 300)) { inp.focus(); toast("Nhập cân nặng hợp lệ, VD 65,5"); return; }
        const date = $("[name=date]", b).value || today();
        const same = !r && all("weight").find(x => x.data.date === date);
        put("weight", { date, kg }, r ? id : same ? same.id : undefined); closeSheet(); toast(`Đã ghi ${kg.toLocaleString("vi-VN")} kg`);
      });
      const del = $("[data-del]", b); if (del) del.addEventListener("click", () => confirmDelete(id, "cân nặng"));
      setTimeout(() => { inp.focus(); inp.select && inp.select(); }, 280);
    }
  });
}

/* ---------- giấy tờ ---------- */
function docsSheet() {
  const cards = all("doc").sort((a, b) => (a.data.order || 0) - (b.data.order || 0) || (a.data.name || "").localeCompare(b.data.name || "", "vi"));
  openSheet({
    title: "Giấy tờ", full: true, color: "var(--fg)",
    html: `<div class="hint" style="margin:-4px 0 12px">Bấm vào một dòng để chép, dán vào form hay email cho nhanh.</div>
      ${cards.map(c => `<section class="card">
        <div class="card-h"><b style="font-size:16px">${esc(c.data.name || "Không tên")}</b>
          <span style="display:flex;gap:14px"><button class="link small" data-copyall="${c.id}">Chép hết</button><button class="link small" style="--c:var(--mut)" data-editdoc="${c.id}">Sửa</button></span></div>
        ${(c.data.fields || []).filter(f => f.v).map((f, i) => `<div class="field" data-copy="${c.id}" data-i="${(c.data.fields || []).indexOf(f)}"><span class="k">${esc(f.k)}</span><span class="v">${esc(f.v)}</span>${I.copy}</div>`).join("") || `<div class="empty">Chưa có thông tin.</div>`}
      </section>`).join("")}
      <button class="btn block" data-newdoc>+ Thêm người (bạn, người yêu, gia đình…)</button>`,
    onMount(b) {
      b.addEventListener("click", e => {
        const cp = e.target.closest("[data-copy]");
        if (cp) { const f = db[cp.dataset.copy].data.fields[+cp.dataset.i]; copyText(f.v, f.k); return; }
        const ca = e.target.closest("[data-copyall]");
        if (ca) { const d = db[ca.dataset.copyall].data; copyText((d.fields || []).filter(f => f.v).map(f => `${f.k}: ${f.v}`).join("\n"), "tất cả"); return; }
        const ed = e.target.closest("[data-editdoc]");
        if (ed) { docForm(ed.dataset.editdoc); return; }
        if (e.target.closest("[data-newdoc]")) docForm(null);
      });
    }
  });
}
function docForm(id) {
  const r = id ? db[id] : null;
  const d = r ? JSON.parse(JSON.stringify(r.data)) : { name: "", fields: docTemplate().map(k => ({ k, v: "" })), order: all("doc").length };
  let fields = d.fields || [];
  const fRow = (f, i) => `<div class="sub-row" data-i="${i}" style="grid-template-columns:96px 1fr 28px"><input data-k value="${esc(f.k)}" placeholder="Tên mục"><input data-v value="${esc(f.v)}" placeholder="Nội dung"><button type="button" class="rm" data-rm aria-label="Bỏ">×</button></div>`;
  openSheet({
    title: r ? "Sửa thông tin" : "Thêm người", full: true, color: "var(--fg)",
    html: `<div class="f"><label>Tên thẻ</label><input name="name" value="${esc(d.name)}" placeholder="VD: Tôi, Nghi, Mẹ"></div>
      <div class="f"><label>Thông tin</label><div data-fields>${fields.map(fRow).join("")}</div>
      <button type="button" class="btn" data-add style="padding:8px 12px;font-size:14px">+ Thêm mục</button></div>
      <div class="hint f">Gợi ý thêm: Ngày sinh, Quê quán, Địa chỉ, Mã BHYT, Số tài khoản nhận học bổng. Dữ liệu chỉ nằm trên máy bạn và Supabase của riêng bạn.</div>
      <div class="btns">${r ? `<button class="btn danger" data-del>Xóa</button>` : ""}<button class="btn pri" data-save>Lưu</button></div>`,
    onMount(b) {
      const box = $("[data-fields]", b);
      const read = () => $$(".sub-row", box).map(row => ({ k: $("[data-k]", row).value.trim(), v: $("[data-v]", row).value.trim() }));
      box.addEventListener("click", e => { if (e.target.closest("[data-rm]")) { fields = read(); fields.splice(+e.target.closest(".sub-row").dataset.i, 1); box.innerHTML = fields.map(fRow).join(""); } });
      $("[data-add]", b).addEventListener("click", () => { fields = read(); fields.push({ k: "", v: "" }); box.innerHTML = fields.map(fRow).join(""); $$("[data-k]", box).pop().focus(); });
      $("[data-save]", b).addEventListener("click", () => {
        const name = $("[name=name]", b).value.trim();
        if (!name) { $("[name=name]", b).focus(); toast("Đặt tên thẻ"); return; }
        put("doc", { ...d, name, fields: read().filter(f => f.k || f.v) }, id);
        docsSheet();
      });
      const del = $("[data-del]", b);
      if (del) del.addEventListener("click", () => { const snap = JSON.parse(JSON.stringify(db[id])); remove(id); docsSheet(); toast("Đã xóa thẻ", { label: "Hoàn tác", fn: () => { restore(snap); docsSheet(); } }); });
    }
  });
}

/* ---------- cài đặt ---------- */
function settingsSheet() {
  const hasCfg = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
  const lastExp = LS.get("lastExport", 0), lastExpOld = lastExp && Date.now() - lastExp > 30 * 864e5;
  const counts = { task: all("task").length, class: all("class").length, tx: all("tx").length, workout: all("workout").length, doc: all("doc").length, weight: all("weight").length };
  let syncBox;
  if (!hasCfg) syncBox = `<div class="small mut">Chưa điền <b>config.js</b>, nên dữ liệu chỉ nằm trên máy này. Xem README.md để bật đồng bộ giữa hai điện thoại.</div>`;
  else if (sync.user) syncBox = `<div class="small" style="margin-bottom:10px">Đăng nhập: <b>${esc(sync.user.email || "")}</b></div>
      <div class="btns" style="margin-top:0"><button class="btn" data-signout>Đăng xuất</button><button class="btn pri" data-syncnow style="--c:var(--cls)">Đồng bộ ngay</button></div>`;
  else syncBox = `<div class="small mut" style="margin-bottom:10px">Đăng nhập cùng một tài khoản trên mọi điện thoại của bạn để dữ liệu tự đồng bộ. Không đăng nhập thì dữ liệu chỉ nằm trên máy này.</div>
      <div class="f"><input name="email" type="email" autocomplete="username" placeholder="Email"></div>
      <div class="f"><input name="pw" type="password" autocomplete="current-password" placeholder="Mật khẩu"></div>
      <div class="btns" style="margin-top:0"><button class="btn" data-signup>Tạo tài khoản</button><button class="btn pri" data-signin style="--c:var(--cls)">Đăng nhập</button></div>`;
  openSheet({
    title: "Cài đặt", color: "var(--fg)",
    html: `
      <section class="card"><div class="card-h"><h2>Đồng bộ</h2></div>
        <div class="small" data-synclabel style="margin-bottom:10px">${esc(syncLabel())}</div>${syncBox}</section>
      <section class="card"><div class="card-h"><h2>Dành cho bạn</h2></div>
        <div class="f"><label>Bạn đang là</label>${pills("persona", PERSONAS.map(([k, n, e]) => [k, `${e} ${n}`]), persona())}</div>
        <div class="f"><label>Mục hiển thị</label>
          ${[["cal", "Lịch học"], ["gym", "Tập luyện, cân nặng"], ["doc", "Giấy tờ"]].map(([k, n]) => `<button class="switch ${mod(k) ? "on" : ""}" data-mod="${k}" style="margin-bottom:6px"><span>${n}</span><span class="tg"></span></button>`).join("")}</div>
        ${mod("cal") ? `<div class="f"><label>Giờ tiết học</label>${pills("tiet", [["bk", "Đại học (tiết 1 = 6:00)"], ["thpt", "Phổ thông (7:00, 45 phút)"], ["custom", "Tự đặt"]], getSetting("tiet", "") || (persona() === "hs" ? "thpt" : "bk"))}
          <div class="f2" data-tietc style="margin-top:8px" ${(getSetting("tiet", "") || "") === "custom" ? "" : "hidden"}><div><label class="lbl">Tiết 1 bắt đầu</label><input type="time" name="tc_start" value="${esc((getSetting("tietCustom", null) || {}).start || "07:00")}"></div><div><label class="lbl">Phút mỗi tiết / nghỉ</label><input name="tc_len" inputmode="numeric" value="${esc(((getSetting("tietCustom", null) || {}).len || 45) + "/" + ((getSetting("tietCustom", null) || {}).gap ?? 5))}"></div></div></div>` : ""}
        <button class="btn block" data-cats>Danh mục thu chi</button></section>
      <section class="card"><div class="card-h"><h2>Giao diện trên máy này</h2></div>
        <div class="seg" data-theme>${[["auto", "Theo máy"], ["light", "Sáng"], ["dark", "Tối"]].map(([k, n]) => `<button type="button" class="${LS.get("theme", "auto") === k ? "on" : ""}" data-v="${k}">${n}</button>`).join("")}</div>
        <button class="switch ${LS.get("big", 0) ? "on" : ""}" data-big><span>Chữ to, dễ đọc<small>Hợp cho người lớn tuổi hoặc màn hình nhỏ</small></span><span class="tg"></span></button></section>
      <section class="card"><div class="card-h"><h2>Lịch điện thoại</h2></div>
        <div class="small mut" style="margin-bottom:10px">Đưa thời khóa biểu và hạn nộp vào app Lịch để điện thoại tự nhắc, kể cả khi không mở Hôm Nay.</div>
        <button class="btn block" data-ics>Tạo file lịch</button></section>
      <section class="card"><div class="card-h"><h2>Tên hiển thị</h2></div>
        <div style="display:flex;gap:8px"><input name="name" value="${esc(getSetting("name", ""))}" placeholder="Tên để chào buổi sáng"><button class="btn" data-savename>Lưu</button></div></section>
      <section class="card"><div class="card-h"><h2>Sao lưu</h2></div>
        <div class="small mut" style="margin-bottom:10px">${counts.task} việc · ${counts.class} môn · ${counts.tx} khoản tiền · ${counts.workout} buổi tập · ${counts.doc} thẻ giấy tờ</div>
        <div class="small ${lastExpOld ? "amber" : "mut"}" style="margin:-4px 0 10px">${lastExp ? `Lần xuất gần nhất: ${dm(ymd(new Date(lastExp)))}${lastExpOld ? ", đã hơn 30 ngày" : ""}` : "Chưa xuất bản sao lưu nào."}</div>
        <div class="btns" style="margin-top:0"><button class="btn" data-export>Xuất file</button><button class="btn" data-csv>Excel</button><label class="btn" style="cursor:pointer">Nhập file<input type="file" accept="application/json,.json" data-import hidden></label></div></section>
      <div class="foot">Hôm Nay ${APP_VERSION}</div>`,
    onMount(b) {
      const em = $("[name=email]", b), pw = $("[name=pw]", b);
      const auth = async kind => {
        const email = em.value.trim(), password = pw.value;
        if (!email || password.length < 6) { toast("Nhập email và mật khẩu (ít nhất 6 ký tự)"); return; }
        const fn = kind === "up" ? sync.sb.auth.signUp({ email, password }) : sync.sb.auth.signInWithPassword({ email, password });
        const { data, error } = await fn;
        if (error) { toast(error.message === "Invalid login credentials" ? "Sai email hoặc mật khẩu" : error.message); return; }
        if (kind === "up" && !data.session) { toast("Kiểm tra email để xác nhận, hoặc tắt Confirm email trong Supabase"); return; }
        closeSheet(); toast("Đã đăng nhập, đang đồng bộ…");
      };
      const si = $("[data-signin]", b); if (si) si.addEventListener("click", () => auth("in"));
      const su = $("[data-signup]", b); if (su) su.addEventListener("click", () => auth("up"));
      const so = $("[data-signout]", b); if (so) so.addEventListener("click", async () => { await sync.sb.auth.signOut(); closeSheet(); toast("Đã đăng xuất. Dữ liệu vẫn còn trên máy."); });
      const sn = $("[data-syncnow]", b); if (sn) sn.addEventListener("click", () => syncNow());
      $("[data-savename]", b).addEventListener("click", () => { setSetting("name", $("[name=name]", b).value.trim()); toast("Đã lưu"); });
      $("[data-export]", b).addEventListener("click", exportData);
      $("[data-ics]", b).addEventListener("click", icsSheet);
      $("[data-csv]", b).addEventListener("click", exportCsv);
      $("[data-cats]", b).addEventListener("click", catsSheet);
      const stP = { persona: persona(), tiet: getSetting("tiet", "") || "bk" };
      bindPills(b, stP, (k, v) => {
        if (k === "persona") { applyPersona(v); toast("Đã đổi, các mục và danh mục đã được chỉnh theo lựa chọn"); settingsSheet(); }
        if (k === "tiet") { setSetting("tiet", v); const c = $("[data-tietc]", b); if (c) c.hidden = v !== "custom"; }
      });
      $$("[data-mod]", b).forEach(x => x.addEventListener("click", () => { const m = { cal: mod("cal"), gym: mod("gym"), doc: mod("doc") }; m[x.dataset.mod] = !m[x.dataset.mod]; setSetting("modules", m); x.classList.toggle("on", m[x.dataset.mod]); }));
      const saveTc = () => { const [len, gap] = ($("[name=tc_len]", b).value || "45/5").split(/[\/\s,]+/).map(Number); setSetting("tietCustom", { start: $("[name=tc_start]", b).value || "07:00", len: len > 0 ? len : 45, gap: gap >= 0 ? gap : 5 }); };
      ["tc_start", "tc_len"].forEach(n => { const x = $(`[name=${n}]`, b); if (x) x.addEventListener("change", saveTc); });
      $("[data-theme]", b).addEventListener("click", e => { const x = e.target.closest("[data-v]"); if (!x) return; LS.set("theme", x.dataset.v); applyLook(); $$("[data-theme] button", b).forEach(y => y.classList.toggle("on", y === x)); });
      $("[data-big]", b).addEventListener("click", e => { const on = !LS.get("big", 0); LS.set("big", on ? 1 : 0); applyLook(); e.currentTarget.classList.toggle("on", on); });
      $("[data-import]", b).addEventListener("change", e => { if (e.target.files[0]) importData(e.target.files[0]); });
    }
  });
}
async function exportData() {
  const rows = Object.values(db).filter(r => !r.deleted);
  const ok = await shareOrDownload(`hom-nay-${today()}.json`, JSON.stringify({ app: "hom-nay", version: 1, exportedAt: new Date().toISOString(), items: rows }, null, 1), "application/json");
  if (ok) { LS.set("lastExport", Date.now()); toast("Đã xuất file sao lưu"); }
}
async function importData(file) {
  try {
    const j = JSON.parse(await file.text());
    const items = Array.isArray(j.items) ? j.items : [];
    let n = 0;
    for (const it of items) {
      if (!it || !it.id || !it.kind || !it.updated_at) continue;
      const cur = db[it.id];
      if (cur && Date.parse(cur.updated_at) >= Date.parse(it.updated_at)) continue;
      db[it.id] = { id: it.id, kind: it.kind, data: it.data || {}, deleted: !!it.deleted, updated_at: new Date(Date.parse(it.updated_at)).toISOString() };
      queue[it.id] = db[it.id].updated_at; n++;
    }
    persist(); render(); scheduleSync(); closeSheet();
    toast(`Đã nhập ${n} mục`);
  } catch { toast("File không đúng định dạng"); }
}

/* ---------- ghi nhanh bằng câu ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const QUICK_EX = {
  hs: ["trà sữa 25k", "kiểm tra Toán thứ 5", "học thêm 18h mỗi thứ 3", "mẹ cho 200k", "hít đất 20 15"],
  sv: ["cà phê 30k", "nộp BTL thứ 6 23h59", "tiền phòng 2tr5 ngày 5 hằng tháng", "mẹ gửi 3tr", "hít xà 10 8 8"],
  other: ["cà phê 30k", "họp 9h mai", "tiền nhà 3tr ngày 5 hằng tháng", "lương 15tr", "đổ xăng 80k", "cân nặng 65,5"]
};
const KIND_ICON = { tx: "💸", task: "✅", workout: "💪", weight: "⚖️" };
function quickOpts() {
  const known = [...new Set([...EXERCISES.map(e => e[0]), ...sessions().flatMap(s => (s.data.items || []).map(i => i.ex))])];
  const history = all("tx").sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).slice(0, 400).map(r => ({ note: r.data.note || "", cat: r.data.cat, type: r.data.type }));
  return { exercises: known, history, customCats: getSetting("customCats", []) || [], validCats: [...OUT_CATS, ...IN_CATS].map(c => c[0]) };
}
function quickParse() { const v = ($("#qIn") || {}).value || ""; try { return parseQuick(v, quickOpts()); } catch { return null; } }
function quickPreview() {
  const el = $("#qPrev"); if (!el) return;
  const v = ($("#qIn") || {}).value || "";
  if (!v.trim()) { el.innerHTML = `<div class="qex">${(QUICK_EX[persona()] || QUICK_EX.other).map(x => `<button data-act="qfill" data-v="${esc(x)}">${esc(x)}</button>`).join("")}</div>`; return; }
  const q = quickParse();
  if (!q) { el.innerHTML = `<div class="small mut">Chưa hiểu câu này. Thử thêm số tiền (30k) hoặc thời gian (mai 9h).</div>`; return; }
  if ((q.kind === "workout" && !mod("gym")) ) { el.innerHTML = `<div class="small mut">Mục Tập đang tắt trong Cài đặt.</div>`; return; }
  el.innerHTML = `<div class="qres"><span class="emo">${KIND_ICON[q.kind]}</span><span class="grow">${esc(q.text)}</span><button class="btn pri" data-act="qsave">Lưu</button></div>`;
}
function quickSave() {
  const q = quickParse(); if (!q) return;
  let undo = null;
  if (q.kind === "tx") { const r = put("tx", { ...q.data, at: Date.now() }); undo = () => remove(r.id); }
  else if (q.kind === "task") { const r = put("task", { ...q.data, createdAt: Date.now() }); undo = () => remove(r.id); }
  else if (q.kind === "weight") { const same = all("weight").find(x => x.data.date === q.data.date); const snap = same && JSON.parse(JSON.stringify(same)); const r = put("weight", q.data, same ? same.id : undefined); undo = () => snap ? restore(snap) : remove(r.id); }
  else if (q.kind === "workout") {
    const it = { ex: q.data.ex, sets: q.data.sets, kg: 0 };
    const cur = sessions().find(x => x.data.date === q.data.date);
    if (cur) { const snap = JSON.parse(JSON.stringify(cur)); put("workout", { ...cur.data, items: [...(cur.data.items || []), it] }, cur.id); undo = () => restore(snap); }
    else { const r = put("workout", { date: q.data.date, mins: "", items: [it], note: "" }); undo = () => remove(r.id); }
  }
  ui.qText = ""; const qi = $("#qIn"); if (qi) { qi.value = ""; qi.blur(); } quickPreview();
  buzz(); toast(`Đã ghi: ${q.text}`, { label: "Hoàn tác", fn: undo });
}
let recog = null;
function startMic(btn) {
  if (!SR) return;
  if (recog) { try { recog.stop(); } catch {} return; }
  recog = new SR(); recog.lang = "vi-VN"; recog.interimResults = true; recog.maxAlternatives = 1;
  btn.classList.add("on"); toast("Đang nghe… nói ví dụ: cà phê ba mươi nghìn");
  recog.onresult = e => { const t = [...e.results].map(r => r[0].transcript).join(" "); ui.qText = t; const qi = $("#qIn"); if (qi) qi.value = t; quickPreview(); };
  recog.onerror = e => { if (e.error === "not-allowed" || e.error === "service-not-allowed") toast("Chưa cho phép dùng micro. Bật quyền micro cho trình duyệt rồi thử lại."); };
  recog.onend = () => { recog = null; const b = $("[data-act=mic]"); if (b) b.classList.remove("on"); };
  try { recog.start(); } catch { recog = null; btn.classList.remove("on"); }
}
document.addEventListener("input", e => { if (e.target.id === "qIn") { ui.qText = e.target.value; quickPreview(); } });
document.addEventListener("keydown", e => { if (e.target.id === "qIn" && e.key === "Enter" && !e.isComposing) { e.preventDefault(); quickSave(); } });

/* ---------- khoản phải trả: việc có số tiền, xong thì tự ghi chi ---------- */
function payTask(r) {
  const d = r && r.data; if (!d || !(d.amount > 0)) return null;
  return put("tx", { type: "out", amount: d.amount, cat: d.cat || "khac", note: d.title, date: today(), at: Date.now(), fromTask: r.id });
}

/* ---------- mục tiêu tiết kiệm ---------- */
function goalForm(id) {
  const r = id ? db[id] : null;
  const g = r ? { ...r.data } : { name: "", emoji: "🎯", target: 0, saved: 0, deadline: "" };
  const left = Math.max(0, (g.target || 0) - (g.saved || 0));
  const months = g.deadline ? Math.max(1, Math.ceil(dayDiff(g.deadline, today()) / 30.4)) : 0;
  openSheet({
    title: r ? `${g.emoji} ${g.name}` : "Mục tiêu tiết kiệm", color: "var(--money)",
    html: `${r ? `<section class="card" style="--c:var(--money)">
        <div style="display:flex;justify-content:space-between;align-items:flex-end"><div><div class="small mut">Đã để dành</div><div class="big num">${money(g.saved || 0)}</div></div><div class="small mut" style="text-align:right">Mục tiêu<br><b class="num" style="color:var(--fg)">${money(g.target)}</b></div></div>
        <div class="mbar" style="margin:10px 0 6px"><i style="width:${Math.min(100, (g.saved || 0) / Math.max(1, g.target) * 100)}%"></i></div>
        <div class="small mut">${left ? `Còn ${money(left)}${months ? ` · cần khoảng ${moneyShort(left / months)}/tháng đến ${dm(g.deadline)}` : ""}` : "Đã đạt mục tiêu 🎉"}</div></section>
      <div class="f"><label>Góp thêm</label><input class="amount-in num" name="add" inputmode="decimal" placeholder="0"><div class="pills" data-qa style="margin-top:8px"><button type="button" data-a="100000">100k</button><button type="button" data-a="500000">500k</button><button type="button" data-a="1000000">1tr</button><button type="button" data-a="-1">Rút ra</button></div></div>
      <label class="opt"><input type="checkbox" name="log" checked><span>Ghi vào Tiền, loại Tiết kiệm<small>Không tính vào số đã chi</small></span></label>
      <div class="btns" style="margin-bottom:14px"><button class="btn pri" data-contrib>Góp</button></div>
      <div class="group-h" style="margin-top:0">Sửa mục tiêu</div>` : ""}
      <div class="f2 f" style="grid-template-columns:64px 1fr"><div><label class="lbl">Biểu tượng</label><input name="emoji" value="${esc(g.emoji)}" maxlength="4" style="text-align:center"></div><div><label class="lbl">Tên</label><input name="name" value="${esc(g.name)}" placeholder="VD: Laptop mới, Du lịch Đà Lạt, Quỹ khẩn cấp"></div></div>
      <div class="f2 f"><div><label class="lbl">Cần bao nhiêu</label><input name="target" inputmode="decimal" value="${g.target ? moneyShort(g.target) : ""}" placeholder="VD: 25tr"></div><div><label class="lbl">Đến ngày (không bắt buộc)</label><input type="date" name="deadline" value="${esc(g.deadline)}"></div></div>
      ${r ? "" : `<div class="f"><label class="lbl">Đã có sẵn (không bắt buộc)</label><input name="saved" inputmode="decimal" placeholder="0"></div>`}
      <div class="btns">${r ? `<button class="btn danger" data-del>Xóa</button>` : ""}<button class="btn ${r ? "" : "pri"}" data-save>${r ? "Lưu thay đổi" : "Tạo mục tiêu"}</button></div>`,
    onMount(b) {
      let sign = 1;
      const qa = $("[data-qa]", b);
      if (qa) qa.addEventListener("click", e => { const x = e.target.closest("[data-a]"); if (!x) return; if (x.dataset.a === "-1") { sign = -sign; x.classList.toggle("on", sign < 0); $("[data-contrib]", b).textContent = sign < 0 ? "Rút" : "Góp"; return; } $("[name=add]", b).value = (+x.dataset.a).toLocaleString("vi-VN"); });
      const ct = $("[data-contrib]", b);
      if (ct) ct.addEventListener("click", () => {
        const v = parseMoney($("[name=add]", b).value); if (!v) { toast("Nhập số tiền"); return; }
        const cur = db[id].data, before = cur.saved || 0, after = Math.max(0, before + sign * v);
        put("goal", { ...cur, saved: after }, id);
        if ($("[name=log]", b).checked && sign > 0) put("tx", { type: "out", amount: v, cat: "tietkiem", note: `Góp: ${cur.name}`, date: today(), at: Date.now() });
        buzz(); closeSheet();
        toast(after >= cur.target && before < cur.target ? `Hoàn thành mục tiêu ${cur.name}! 🎉` : `${sign > 0 ? "Đã góp" : "Đã rút"} ${moneyShort(v)} · ${Math.round(after / Math.max(1, cur.target) * 100)}%`);
      });
      $("[data-save]", b).addEventListener("click", () => {
        const name = $("[name=name]", b).value.trim(), target = parseMoney($("[name=target]", b).value);
        if (!name) { $("[name=name]", b).focus(); toast("Đặt tên cho mục tiêu"); return; }
        if (!target) { $("[name=target]", b).focus(); toast("Nhập số tiền cần để dành"); return; }
        put("goal", { ...g, name, target, emoji: $("[name=emoji]", b).value.trim() || "🎯", deadline: $("[name=deadline]", b).value, saved: r ? g.saved || 0 : parseMoney(($("[name=saved]", b) || {}).value || "") }, id);
        closeSheet(); toast(r ? "Đã lưu" : "Đã tạo mục tiêu");
      });
      const del = $("[data-del]", b); if (del) del.addEventListener("click", () => confirmDelete(id, "mục tiêu"));
    }
  });
}

/* ---------- danh mục thu chi ---------- */
function catsSheet() {
  const hidden = new Set(getSetting("hiddenCats", []) || []);
  const custom = (getSetting("customCats", []) || []).slice();
  const row = (c, isCustom) => `<div class="row"><div class="emo">${c[2]}</div><div class="grow"><div class="t">${esc(c[1])}</div></div>
    ${isCustom ? `<button class="link small" style="--c:var(--danger)" data-rmcat="${c[0]}">Xóa</button>` : c[0] === "khac" || c[0] === "thukhac" ? "" : `<button class="switch-mini ${hidden.has(c[0]) ? "" : "on"}" data-hide="${c[0]}" aria-label="Hiện ${esc(c[1])}"><span></span></button>`}</div>`;
  openSheet({
    title: "Danh mục thu chi", full: true, color: "var(--money)",
    html: `<div class="hint" style="margin:-4px 0 10px">Tắt các mục không dùng cho gọn. Mục đã tắt vẫn giữ lịch sử cũ.</div>
      <div class="group-h">Chi</div><div class="card list">${BASE_OUT.map(c => row(c, false)).join("")}${custom.filter(c => c.t !== "in").map(c => row([c.k, c.n, c.e], true)).join("")}</div>
      <div class="group-h">Thu</div><div class="card list">${BASE_IN.map(c => row(c, false)).join("")}${custom.filter(c => c.t === "in").map(c => row([c.k, c.n, c.e], true)).join("")}</div>
      <div class="group-h">Thêm danh mục</div>
      <div class="f2 f" style="grid-template-columns:64px 1fr"><input name="ce" value="🏷️" maxlength="4" style="text-align:center" aria-label="Biểu tượng"><input name="cn" placeholder="VD: Nuôi xe, Học tiếng Anh, Cafe làm việc" maxlength="30"></div>
      <div class="seg" data-ct><button type="button" class="on" data-v="out">Khoản chi</button><button type="button" data-v="in">Khoản thu</button></div>
      <button class="btn pri block" data-addcat>Thêm</button>`,
    onMount(b) {
      let t = "out";
      $("[data-ct]", b).addEventListener("click", e => { const x = e.target.closest("[data-v]"); if (!x) return; t = x.dataset.v; $$("[data-ct] button", b).forEach(y => y.classList.toggle("on", y === x)); });
      b.addEventListener("click", e => {
        const h = e.target.closest("[data-hide]");
        if (h) { const k = h.dataset.hide; hidden.has(k) ? hidden.delete(k) : hidden.add(k); setSetting("hiddenCats", [...hidden]); h.classList.toggle("on", !hidden.has(k)); return; }
        const rm = e.target.closest("[data-rmcat]");
        if (rm) { setSetting("customCats", (getSetting("customCats", []) || []).filter(c => c.k !== rm.dataset.rmcat)); catsSheet(); return; }
        if (e.target.closest("[data-addcat]")) {
          const n = $("[name=cn]", b).value.trim(); if (!n) { $("[name=cn]", b).focus(); return; }
          setSetting("customCats", [...(getSetting("customCats", []) || []), { k: "c" + Date.now().toString(36), n, e: $("[name=ce]", b).value.trim() || "🏷️", t }]);
          toast(`Đã thêm ${n}`); catsSheet();
        }
      });
    }
  });
}

/* ---------- giao diện (từng máy) ---------- */
function applyLook() {
  const th = LS.get("theme", "auto"), root = document.documentElement;
  if (th === "auto") delete root.dataset.theme; else root.dataset.theme = th;
  root.classList.toggle("big", !!LS.get("big", 0));
}

/* ---------- tìm kiếm ---------- */
function searchSheet() {
  openSheet({
    title: "Tìm kiếm", full: true, color: "var(--fg)",
    html: `<div class="f"><input name="q" type="search" enterkeyhint="search" placeholder="Việc, môn, khoản chi, giấy tờ…" autocomplete="off"></div><div data-res></div>`,
    onMount(b) {
      const inp = $("[name=q]", b), res = $("[data-res]", b);
      const run = () => {
        const q = norm(inp.value.trim());
        if (!q) { res.innerHTML = `<div class="hint">Gõ không dấu cũng được, ví dụ "may dien", "tra sua", "mssv".</div>`; return; }
        const hit = (...f) => f.some(x => norm(x).includes(q));
        const txHits = all("tx").filter(r => hit(r.data.note, (CAT[r.data.cat] || [])[1])).sort((a, b) => (b.data.date || "").localeCompare(a.data.date || ""));
        const txOut = sumOut(txHits), txIn = sumIn(txHits);
        const groups = [
          ["Việc", all("task").filter(r => hit(r.data.title, r.data.tag, r.data.note, r.data.waitFor, ...(r.data.subs || []).map(x => `${x.text} ${x.who}`)))
            .sort((a, b) => (a.data.status === "done") - (b.data.status === "done") || byDue(a, b))
            .map(r => ({ id: r.id, k: "task", t: r.data.title, m: [r.data.tag, r.data.status === "done" ? "Đã xong" : dueInfo(r.data).text, r.data.status === "waiting" ? "Đang chờ" : ""].filter(Boolean).join(" · ") }))],
          ["Môn học", all("class").filter(r => hit(r.data.title, r.data.code, r.data.room, r.data.teacher, r.data.note))
            .map(r => ({ id: r.id, k: "class", t: r.data.title, m: [(r.data.days || []).slice().sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b)).map(d => DOW[d]).join(", "), `${r.data.start}–${r.data.end}`, r.data.room && "Phòng " + r.data.room].filter(Boolean).join(" · ") }))],
          [txHits.length ? `Thu chi · ${txOut ? "chi " + money(txOut) : ""}${txOut && txIn ? ", " : ""}${txIn ? "thu " + money(txIn) : ""}` : "Thu chi", txHits.slice(0, 40)
            .map(r => ({ id: r.id, k: "tx", t: `${r.data.note || (CAT[r.data.cat] || [])[1] || "Khác"}`, m: `${dm(r.data.date)}/${String(r.data.date).slice(0, 4)} · ${r.data.type === "in" ? "+" : "−"}${money(r.data.amount)}` }))],
          ["Buổi tập", sessions().filter(r => hit(r.data.note, ...(r.data.items || []).map(i => i.ex))).slice(0, 20)
            .map(r => ({ id: r.id, k: "workout", t: `Buổi tập ${dm(r.data.date)}`, m: sessionSummary(r) }))],
          ["Giấy tờ", all("doc").flatMap(r => (r.data.fields || []).filter(f => f.v && (hit(f.k, f.v) || hit(r.data.name))).map(f => ({ id: r.id, k: "doc", t: `${f.k}: ${f.v}`, m: r.data.name, copy: f.v, label: f.k })))]
        ].filter(g => g[1].length);
        res.innerHTML = groups.length ? groups.map(([name, rows]) => `<div class="group-h">${esc(name)}<span>${rows.length}</span></div><div class="card list">${rows.map(x =>
          `<div class="row tap" data-sid="${x.id}" data-k="${x.k}"${x.copy ? ` data-copyv="${esc(x.copy)}" data-copyl="${esc(x.label)}"` : ""}><div class="grow"><div class="t">${esc(x.t)}</div>${x.m ? `<div class="m">${esc(x.m)}</div>` : ""}</div>${x.copy ? I.copy.replace("<svg", '<svg style="width:18px;height:18px;color:var(--mut);flex:none"') : ""}</div>`).join("")}</div>`).join("")
          : `<div class="card empty">Không tìm thấy gì khớp với "${esc(inp.value.trim())}".</div>`;
      };
      inp.addEventListener("input", run); run();
      res.addEventListener("click", e => {
        const el = e.target.closest("[data-sid]"); if (!el || !db[el.dataset.sid]) return;
        if (el.dataset.k === "doc") { copyText(el.dataset.copyv, el.dataset.copyl); return; }
        ({ task: taskForm, class: classForm, tx: txForm, workout: workoutForm })[el.dataset.k](el.dataset.sid);
      });
      setTimeout(() => inp.focus(), 280);
    }
  });
}

/* ---------- nhập thời khóa biểu / lịch thi từ MyBK ---------- */
/* Hai lịch học có trùng giờ không (cùng thứ, giờ chồng nhau, có ít nhất một tuần cùng học) */
function overlaps(a, b) {
  const wa = a.weeks || [], wb = b.weeks || [];
  const weeksMeet = !wa.length || !wb.length || wa.some(w => wb.includes(w));
  return weeksMeet && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end);
}
function conflicts(list) {
  const out = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    for (const d of (a.days || []).filter(d => (b.days || []).includes(d))) if (overlaps(a, b)) out.push({ a, b, day: d });
  }
  return out;
}
/* Các buổi của một lịch học trong học kỳ (có tuần học), hoặc 8 tuần qua và 10 tuần tới nếu không ghi tuần */
function classOcc(c) {
  const d = c.data, td = today(), out = [];
  for (const dow of d.days || []) {
    if (d.weeks && d.weeks.length) d.weeks.forEach(w => out.push(dateOfWeek(w, dow, td)));
    else for (let i = -7; i <= 10; i++) out.push(addDays(weekStart(td), 7 * i + (dow + 6) % 7));
  }
  return [...new Set(out)].sort();
}
function absentLevel(c) {
  const ab = (c.data.absent || []).length; if (!ab || !(c.data.weeks || []).length) return "";
  const pct = ab / Math.max(1, classOcc(c).length);
  return pct >= 0.2 ? "red" : pct >= 0.15 ? "amber" : "";
}
function classDetail(id, date) {
  const r = db[id]; if (!r || r.deleted) return;
  const c = r.data, td = today(), occ = classOcc(r), hasWeeks = !!(c.weeks || []).length;
  const past = occ.filter(x => x <= td), next = occ.find(x => x > td || (x === td && toMin(c.end) > nowMin()));
  const absent = (c.absent || []).slice().sort(), ab = absent.length, pct = hasWeeks ? Math.round(ab / Math.max(1, occ.length) * 100) : null;
  const lvl = absentLevel(r);
  const ctx = date && occ.includes(date) && date <= td ? date : (past.length && past[past.length - 1] === td ? td : "");
  const toggleAbsent = day => { const cur = db[id]; const a = new Set(cur.data.absent || []); a.has(day) ? a.delete(day) : a.add(day); put("class", { ...cur.data, absent: [...a].sort() }, id); buzz(); classDetail(id, date); };
  openSheet({
    title: c.title, color: "var(--cls)",
    html: `<div class="small mut" style="margin:-4px 0 12px">${[(c.days || []).slice().sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b)).map(d => DOW[d]).join(", ") + ` ${esc(c.start)}–${esc(c.end)}`, c.room && "Phòng " + esc(c.room), c.code && esc(c.code) + (c.group ? " · " + esc(c.group) : ""), c.credits ? `${c.credits} tín chỉ` : "", c.teacher && esc(c.teacher)].filter(Boolean).join(" · ")}</div>
      <div class="stats3" style="margin:0 0 12px">
        <div><b class="num">${hasWeeks ? `${past.length}/${occ.length}` : past.length}</b><span>${hasWeeks ? "Buổi đã qua" : "Buổi, 8 tuần qua"}</span></div>
        <div><b class="num ${lvl}">${ab}${pct != null ? `<small style="font-size:12px;font-weight:600"> · ${pct}%</small>` : ""}</b><span>Buổi vắng</span></div>
        <div><b class="num" style="font-size:15px">${next ? `${DOW[parseYmd(next).getDay()]} ${dm(next)}` : "–"}</b><span>Buổi tới</span></div>
      </div>
      ${lvl === "red" ? `<div class="banner" style="background:var(--danger-bg)">Đã vắng ${pct}% số buổi, quá 20%. Kiểm tra quy định chuyên cần trong đề cương môn, có thể bị cấm thi.</div>` : lvl === "amber" ? `<div class="banner">Đã vắng ${pct}% số buổi, gần tới mức 20%.</div>` : ""}
      ${ctx ? `<button class="btn block f ${absent.includes(ctx) ? "" : "danger"}" data-absent="${ctx}">${absent.includes(ctx) ? `Bỏ đánh dấu vắng ${dm(ctx)}` : `Đánh dấu vắng buổi ${ctx === td ? "hôm nay" : dm(ctx)}`}</button>` : ""}
      ${past.length ? `<div class="f"><label>Điểm danh các buổi đã qua <span class="mut">(chạm để đánh dấu vắng)</span></label><div class="att">${past.slice(-24).map(x => `<button type="button" class="${absent.includes(x) ? "on" : ""}" data-absent="${x}">${DOW[parseYmd(x).getDay()]}<b>${dm(x)}</b></button>`).join("")}</div></div>` : ""}
      ${c.note ? `<div class="f"><label>Ghi chú</label><div class="small" style="white-space:pre-wrap">${esc(c.note)}</div></div>` : ""}
      <div class="btns"><button class="btn" data-newtask>+ Việc cho môn này</button><button class="btn pri" data-editcls>Sửa môn</button></div>`,
    onMount(b) {
      b.addEventListener("click", e => {
        const a = e.target.closest("[data-absent]"); if (a) { toggleAbsent(a.dataset.absent); return; }
        if (e.target.closest("[data-editcls]")) classForm(id);
        if (e.target.closest("[data-newtask]")) taskForm(null, { tag: c.title });
      });
    }
  });
}
const isLab = t => /\((TN|Th|TH|BT)\b|thí nghiệm|thực hành/i.test(t || "");
function parseTkb(text) {
  const items = [], unscheduled = [], exams = []; let H = null;
  const CODE = /\b([A-Z]{2,4}\d{3,4}[A-Z]?)\b/;
  const GROUP = /\b((?:CC|L|DT|TN|KSTN|HT|A|B|P)\d{2,3}(?:[-_][A-Z0-9]{1,3})?)\b/;
  const dayFrom = c => { c = String(c || "").trim(); if (/^(CN|Chủ nhật)$/i.test(c)) return 0; const m = c.match(/^(?:Thứ\s*|T)?([2-7])$/i); return m ? +m[1] - 1 : null; };
  const timeOf = x => { const m = String(x || "").match(/(\d{1,2})\s*[:hg]\s*(\d{2})\s*[-–]\s*(\d{1,2})\s*[:hg]\s*(\d{2})/); return m ? [`${pad(+m[1])}:${m[2]}`, `${pad(+m[3])}:${m[4]}`] : null; };
  const tietOf = x => { const m = String(x || "").match(/^\s*(?:tiết\s*)?(\d{1,2})\s*[-–]\s*(\d{1,2})\s*$/i); return m && +m[2] >= +m[1] && +m[2] <= 16 ? [tietBK(+m[1]), tietBK(+m[2], true)] : null; };
  const roomOf = x => { const m = String(x || "").match(/\b([A-H]\d{1,2})\s*[-–]\s*([A-Z0-9]{2,6})\b/); return m ? `${m[1]}-${m[2]}` : ""; };
  const titleOf = (cells, code, line) => {
    let t = "";
    const ci = cells.findIndex(c => c.includes(code));
    if (cells.length >= 4 && ci >= 0) {
      if (/[A-Za-zÀ-ỹ]{3,}/.test(cells[ci].replace(code, ""))) t = cells[ci].replace(code, "").replace(/^[\s\-–:]+/, "");
      else t = cells.slice(ci + 1).find(c => /[A-Za-zÀ-ỹ]{2,}/.test(c) && !/^(?:CC|L|DT|TN|KSTN|HT)\d/.test(c) && !/^(?:Thứ|CN$)/i.test(c)) || "";
    }
    if (!t) { const m = line.slice(line.indexOf(code) + code.length).match(/^[\s\-–:|]*([^\d\t|]+?)(?=\s+(?:\d|(?:CC|L|DT|TN|KSTN|HT|A)\d{2}|Thứ|T[2-7]\b|CN\b|tiết)|\t|$)/i); t = m ? m[1].trim() : ""; }
    return t.replace(/\s{2,}/g, " ").trim();
  };
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, ""); if (!line.trim()) continue;
    const cells = line.split("\t").map(c => c.trim());
    const nc = cells.map(norm);
    if (nc.includes("ma mh")) { // dòng tiêu đề bảng: đọc theo tên cột
      const f = fn => nc.findIndex(fn);
      H = { code: f(c => c === "ma mh"), name: f(c => c.startsWith("ten mon")), cr: f(c => c === "tin chi"), group: f(c => c.startsWith("nhom")),
            day: f(c => c === "thu"), tiet: f(c => c === "tiet"), time: f(c => c.startsWith("gio hoc")), room: f(c => c === "phong"), weeks: f(c => c.startsWith("tuan")) };
      if (H.day < 0) H = null;
      continue;
    }
    const codeM = line.match(CODE); if (!codeM) continue;
    const code = codeM[1];
    const dates = [...line.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})/g)];
    if (dates.length) { // dòng lịch thi / kiểm tra
      const title = titleOf(cells, code, line);
      const list = dates.map((m, i) => {
        const seg = line.slice(m.index + m[0].length, i + 1 < dates.length ? dates[i + 1].index : line.length);
        const tm = seg.match(/(\d{1,2})\s*[:hg]\s*(\d{2})/);
        return { date: `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`, time: tm ? `${pad(+tm[1])}:${tm[2]}` : "", room: roomOf(seg) };
      });
      const labels = list.length >= 2 ? ["Kiểm tra giữa kỳ", "Thi cuối kỳ"] : ["Thi"];
      list.forEach((x, i) => { if (!exams.some(e => e.code === code && e.date === x.date)) exams.push({ code, title, label: labels[i] || "Thi", ...x }); });
      continue;
    }
    let day = null, se = null, room = "", weeks = [], title = "", credits = 0, group = "";
    if (H && cells[H.code] === code) {
      day = dayFrom(cells[H.day]); se = timeOf(cells[H.time]) || tietOf(cells[H.tiet]);
      room = roomOf(cells[H.room]); weeks = parseWeeks(cells[H.weeks]); title = cells[H.name] || titleOf(cells, code, line);
      credits = parseFloat(cells[H.cr]) || 0; group = cells[H.group] && cells[H.group] !== "--" ? cells[H.group] : "";
    } else {
      const tabbed = cells.filter(Boolean).length >= 4;
      se = timeOf(line);
      if (tabbed) {
        const ti = cells.findIndex(c => /^\d{1,2}\s*[-–]\s*\d{1,2}$/.test(c));
        if (ti >= 0 && !se) se = tietOf(cells[ti]);
        const anchor = ti >= 0 ? ti : cells.findIndex(c => /\d{1,2}\s*:\s*\d{2}\s*[-–]/.test(c));
        if (anchor > 0) { let k = anchor - 1; while (k > 0 && cells[k] === "") k--; day = dayFrom(cells[k]); }
      }
      if (day == null) { const m = line.match(/(?:^|[\s,(])(?:Thứ\s*|T)([2-7])(?=$|[\s,)])/i); if (m) day = +m[1] - 1; else if (/(?:^|\s)(CN|Chủ nhật)(?=$|[\s,])/i.test(line)) day = 0; }
      if (!se) { const m = line.match(/tiết\s*(\d{1,2})\s*[-–]\s*(\d{1,2})/i); if (m) se = tietOf(`${m[1]}-${m[2]}`); }
      const wm = line.match(/((?:\d{1,2}|-{1,2})(?:\s*\|\s*(?:\d{1,2}|-{1,2})){2,})/);
      weeks = wm ? parseWeeks(wm[1]) : [];
      room = roomOf(line.replace(/\d{1,2}\s*:\s*\d{2}\s*[-–]\s*\d{1,2}\s*:\s*\d{2}/g, ""));
      group = (line.slice(codeM.index + code.length).match(GROUP) || [])[1] || "";
      title = titleOf(cells, code, line);
    }
    if (day == null || !se || toMin(se[1]) <= toMin(se[0])) {
      if (!unscheduled.some(u => u.code === code && u.group === group)) unscheduled.push({ code, title, credits, group, weeks });
      continue;
    }
    const key = [code, group, se[0], se[1], room, weeks.join(".")].join("|");
    const ex = items.find(x => x.key === key);
    if (ex) { if (!ex.days.includes(day)) ex.days.push(day); if (!ex.title && title) ex.title = title; }
    else items.push({ key, code, group, title, credits, days: [day], start: se[0], end: se[1], room, weeks });
  }
  items.forEach(x => x.days.sort());
  const cr = {}; [...items, ...unscheduled].forEach(x => { cr[x.code] = Math.max(cr[x.code] || 0, x.credits || 0); });
  return { items, unscheduled, exams, credits: Object.values(cr).reduce((a, b) => a + b, 0) };
}
function occText(p, td) {
  if (!p.weeks.length) return "Mọi tuần";
  const sortDays = p.days.slice().sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b));
  if (p.weeks.length <= 3) return "Chỉ " + p.weeks.flatMap(w => sortDays.map(d => `${DOW[d]} ${dm(dateOfWeek(w, d, td))}`)).join(", ");
  return `Tuần ${weeksText(p.weeks)} (${p.weeks.length} tuần)`;
}
function tkbSheet() {
  let P = { items: [], unscheduled: [], exams: [], credits: 0 };
  openSheet({
    title: "Dán thời khóa biểu", full: true, color: "var(--cls)",
    html: `<div class="hint" style="margin:-4px 0 10px">Trên MyBK, mở <b>Thời khóa biểu</b> hoặc <b>Lịch thi</b>, bôi đen từ dòng tiêu đề <b>HỌC KỲ · MÃ MH…</b> đến hết bảng, chép rồi dán vào đây. Bảng có nhiều trang thì dán nối tiếp từng trang.</div>
      <div class="f"><textarea name="src" rows="6" placeholder="Dán thời khóa biểu hoặc lịch thi vào đây"></textarea></div>
      <div data-prev></div>
      <div class="btns"><button class="btn pri" data-imp disabled>Nhập</button></div>`,
    onMount(b) {
      const src = $("[name=src]", b), prev = $("[data-prev]", b), imp = $("[data-imp]", b), td = today();
      const existing = all("class"), tasks = all("task");
      const sameCls = p => existing.some(c => c.data.code === p.code && (c.data.group || "") === p.group && c.data.start === p.start && (c.data.days || []).slice().sort().join() === p.days.join() && (c.data.weeks || []).join() === p.weeks.join());
      const sameUns = u => tasks.some(t => t.data.title === (u.title || u.code));
      const sameExam = x => tasks.some(t => t.data.type === "thi" && t.data.due === x.date && t.data.tag === (x.title || x.code));
      const count = () => {
        const n = P.items.filter(x => x.on).length + P.unscheduled.filter(x => x.on).length + P.exams.filter(x => x.on).length;
        imp.disabled = !n; imp.textContent = n ? `Nhập ${n} mục` : "Nhập";
      };
      const meta = arr => arr.filter(Boolean).join(" · ");
      const draw = () => {
        const wipeWas = !!($("[name=wipe]", b) || {}).checked;
        if (!src.value.trim()) { P = { items: [], unscheduled: [], exams: [], credits: 0 }; prev.innerHTML = ""; count(); return; }
        P = parseTkb(src.value);
        P.items.forEach(x => { x.dup = sameCls(x); x.on = !x.dup; });
        P.unscheduled.forEach(x => { x.dup = sameUns(x); x.on = false; });
        P.exams.forEach(x => { x.dup = sameExam(x); x.on = !x.dup && x.date >= td; });
        const total = P.items.length + P.unscheduled.length + P.exams.length;
        if (!total) { prev.innerHTML = `<div class="card empty">Chưa đọc được môn nào. Hãy chép cả dòng tiêu đề HỌC KỲ · MÃ MH… cùng các dòng bên dưới. Nếu gõ tay: mỗi dòng cần mã môn (VD EE3001), thứ, và giờ học hoặc tiết.</div>`; count(); return; }
        const lastWeek = Math.max(0, ...P.items.flatMap(x => x.weeks));
        const clash = conflicts(P.items);
        const perWeek = P.items.reduce((s, x) => s + x.days.length * (x.weeks.length ? x.weeks.length : 0), 0);
        const row = (g, i, x, t, m) => `<label class="row opt-row"><input type="checkbox" data-g="${g}" data-i="${i}" ${x.on ? "checked" : ""}><div class="grow"><div class="t">${t}</div><div class="m">${m}</div></div></label>`;
        prev.innerHTML = `
          <section class="card" style="--c:var(--cls)"><div class="card-h"><h2><i></i>Tóm tắt</h2></div>
            <div style="font-weight:600">${P.credits ? `${P.credits} tín chỉ · ` : ""}${P.items.length} lịch học${P.unscheduled.length ? ` · ${P.unscheduled.length} môn không có lịch` : ""}${P.exams.length ? ` · ${P.exams.length} lịch thi` : ""}</div>
            ${lastWeek ? `<div class="small mut">Học đến tuần ${lastWeek}, kết thúc ${dm(dateOfWeek(lastWeek, 0, td))}${perWeek ? ` · tổng ${perWeek} buổi` : ""}</div>` : ""}
            ${clash.length ? `<div class="small red" style="margin-top:6px">Trùng giờ: ${clash.map(c => `${esc(c.a.title || c.a.code)} và ${esc(c.b.title || c.b.code)} (${DOW[c.day]})`).join("; ")}</div>` : ""}
          </section>
          ${P.items.length ? `<div class="group-h">Lịch học<span>${P.items.length}</span></div><div class="card list">${P.items.map((x, i) => row("i", i, x,
            `${esc(x.title || x.code)}${isLab(x.title) ? ' <span class="chip c-gym">Thí nghiệm</span>' : ""}${x.weeks.length && x.weeks.length <= 3 ? ' <span class="chip c-cls">Buổi lẻ</span>' : ""}`,
            meta([x.days.slice().sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b)).map(d => DOW[d]).join(", ") + ` ${x.start}–${x.end}`, x.room && esc(x.room), esc(x.code) + (x.group ? " " + esc(x.group) : ""), esc(occText(x, td)), x.dup && '<span class="amber">Đã có</span>']))).join("")}</div>` : ""}
          ${P.exams.length ? `<div class="group-h">Lịch thi, kiểm tra<span>${P.exams.length}</span></div><div class="card list">${P.exams.map((x, i) => row("e", i, x,
            `${esc(x.label)}: ${esc(x.title || x.code)}`, meta([`${DOWL[parseYmd(x.date).getDay()]} ${dm(x.date)}/${x.date.slice(0, 4)}`, x.time, x.room && "Phòng " + esc(x.room), x.date < td && "Đã qua", x.dup && '<span class="amber">Đã có</span>']))).join("")}</div>
            <div class="hint" style="margin:-6px 4px 10px">Lịch thi sẽ thành việc loại "Thi" trong mục Việc, có đếm ngược và nhắc.</div>` : ""}
          ${P.unscheduled.length ? `<div class="group-h">Không có lịch cố định<span>${P.unscheduled.length}</span></div><div class="card list">${P.unscheduled.map((x, i) => row("u", i, x,
            esc(x.title || x.code), meta([esc(x.code) + (x.group ? " " + esc(x.group) : ""), x.credits ? `${x.credits} tín chỉ` : "", x.dup && '<span class="amber">Đã có trong Việc</span>']))).join("")}</div>
            <div class="hint" style="margin:-6px 4px 10px">Đồ án, sinh hoạt sinh viên… Đánh dấu môn nào thì môn đó được thêm vào mục Việc để theo dõi.</div>` : ""}
          ${existing.length && P.items.length ? `<label class="opt"><input type="checkbox" name="wipe" ${wipeWas ? "checked" : ""}><span>Xóa ${existing.length} lịch học đang có trước khi nhập<small>Dùng khi sang học kỳ mới hoặc MyBK vừa cập nhật</small></span></label>` : ""}`;
        count();
      };
      src.addEventListener("input", draw);
      prev.addEventListener("change", e => {
        const g = e.target.dataset.g;
        if (g) { ({ i: P.items, u: P.unscheduled, e: P.exams })[g][+e.target.dataset.i].on = e.target.checked; count(); }
        if (e.target.name === "wipe" && e.target.checked) { P.items.forEach((x, i) => { if (x.dup) { x.on = true; const c = $(`[data-g="i"][data-i="${i}"]`, prev); if (c) c.checked = true; } }); count(); }
      });
      imp.addEventListener("click", () => {
        const wipe = !!($("[name=wipe]", b) || {}).checked;
        const snaps = wipe ? existing.map(c => JSON.parse(JSON.stringify(db[c.id]))) : [];
        if (wipe) existing.forEach(c => remove(c.id));
        const added = [];
        P.items.filter(x => x.on).forEach(x => added.push(put("class", { title: x.title || x.code, code: x.code, group: x.group, credits: x.credits, days: x.days, start: x.start, end: x.end, room: x.room, teacher: "", note: "", weeks: x.weeks }).id));
        P.exams.filter(x => x.on).forEach(x => added.push(put("task", { title: `${x.label} ${x.title || x.code}`, tag: x.title || x.code, type: "thi", due: x.date, time: x.time, status: "todo", waitFor: "", note: x.room ? `Phòng ${x.room}` : "", subs: [], createdAt: Date.now() }).id));
        P.unscheduled.filter(x => x.on).forEach(x => added.push(put("task", { title: x.title || x.code, tag: x.title || x.code, type: "bai", due: "", time: "", status: "todo", waitFor: "", note: `${x.code}${x.group ? " · " + x.group : ""} · không có lịch cố định trên TKB`, subs: [], createdAt: Date.now() }).id));
        if (P.items.some(x => x.on) && P.credits) setSetting("credits", P.credits);
        closeSheet(); ui.tab = P.items.some(x => x.on) ? "cal" : "task"; ui.calWeek = 0; LS.set("tab", ui.tab); render(); window.scrollTo(0, 0);
        toast(`Đã nhập ${added.length} mục`, { label: "Hoàn tác", fn: () => { added.forEach(remove); snaps.forEach(restore); } });
      });
      setTimeout(() => src.focus(), 280);
    }
  });
}

/* ---------- xuất ra app Lịch (.ics) để điện thoại tự nhắc ---------- */
const icsEsc = s => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsFold = line => { const out = []; let s = line; while (s.length > 60) { out.push(s.slice(0, 60)); s = " " + s.slice(60); } out.push(s); return out.join("\r\n"); };
const icsDT = (day, time) => day.replace(/-/g, "") + "T" + String(time || "00:00").replace(":", "") + "00";
function buildIcs({ classes, tasks, until }) {
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Hom Nay//VI", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Hôm Nay"];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const td = today(); let n = 0;
  const alarm = (trig, desc) => ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsEsc(desc), "TRIGGER:" + trig, "END:VALARM"];
  const ev = (uid, lines) => { L.push("BEGIN:VEVENT", "UID:" + uid, "DTSTAMP:" + stamp, ...lines.filter(Boolean), "END:VEVENT"); n++; };
  if (classes) for (const c of all("class")) {
    const d = c.data, dates = [];
    for (const dow of d.days || []) {
      if (d.weeks && d.weeks.length) d.weeks.forEach(w => dates.push(dateOfWeek(w, dow, td)));
      else for (let x = addDays(weekStart(td), (dow + 6) % 7); x <= until; x = addDays(x, 7)) dates.push(x);
    }
    for (const day of [...new Set(dates)].filter(x => x >= td).sort()) {
      if (n >= 800) break;
      ev(`${c.id}-${day}@hom-nay`, ["SUMMARY:" + icsEsc(d.title), "DTSTART:" + icsDT(day, d.start), "DTEND:" + icsDT(day, d.end),
        d.room && "LOCATION:" + icsEsc("Phòng " + d.room),
        "DESCRIPTION:" + icsEsc([d.code && d.code + (d.group ? " · " + d.group : ""), d.teacher, d.note].filter(Boolean).join("\n")),
        ...alarm("-PT15M", d.title + (d.room ? " · " + d.room : ""))]);
    }
  }
  if (tasks) for (const t of all("task").filter(t => t.data.status !== "done" && t.data.due && t.data.due >= td)) {
    const d = t.data, title = (d.type === "thi" ? "Thi: " : "Hạn: ") + d.title;
    const desc = [d.tag, d.note, ...(d.subs || []).map(x => `${x.done ? "✓" : "○"} ${x.text}${x.who ? " (" + x.who + ")" : ""}`)].filter(Boolean).join("\n");
    if (d.time) ev(`${t.id}@hom-nay`, ["SUMMARY:" + icsEsc(title), "DTSTART:" + icsDT(d.due, d.time), "DURATION:PT30M", desc && "DESCRIPTION:" + icsEsc(desc), ...alarm("-P1D", title), ...alarm("-PT2H", title)]);
    else ev(`${t.id}@hom-nay`, ["SUMMARY:" + icsEsc(title), "DTSTART;VALUE=DATE:" + d.due.replace(/-/g, ""), "DTEND;VALUE=DATE:" + addDays(d.due, 1).replace(/-/g, ""), desc && "DESCRIPTION:" + icsEsc(desc), ...alarm("-PT16H", title), ...alarm("PT8H", title)]);
  }
  L.push("END:VCALENDAR");
  return { text: L.map(icsFold).join("\r\n") + "\r\n", count: n };
}
function icsSheet() {
  const nCls = all("class").length, nTask = all("task").filter(t => t.data.status !== "done" && t.data.due && t.data.due >= today()).length;
  const noWeeks = all("class").some(c => !(c.data.weeks || []).length);
  openSheet({
    title: "Đưa vào Lịch điện thoại", color: "var(--cls)",
    html: `<div class="hint" style="margin:-4px 0 12px">Tạo file lịch (.ics) cho app Lịch trên iPhone hoặc Xiaomi. Điện thoại sẽ tự nhắc: 15 phút trước giờ học, 1 ngày và 2 tiếng trước hạn nộp, kể cả khi không mở Hôm Nay.</div>
      <label class="opt"><input type="checkbox" name="c" ${nCls ? "checked" : "disabled"}><span>Thời khóa biểu<small>${nCls ? `${nCls} môn, từ hôm nay` : "Chưa có môn nào"}</small></span></label>
      <label class="opt"><input type="checkbox" name="t" ${nTask ? "checked" : "disabled"}><span>Hạn nộp, lịch thi<small>${nTask ? `${nTask} việc có hạn` : "Chưa có việc nào có hạn"}</small></span></label>
      ${nCls && noWeeks ? `<div class="f"><label>Môn không ghi tuần học thì lặp đến ngày</label><input type="date" name="until" value="${addDays(today(), 7 * 15)}"></div>` : ""}
      <div class="btns">${isIOS ? `<button class="btn" data-share>Chia sẻ file</button>` : ""}<button class="btn pri" data-go>${isIOS ? "Mở bằng app Lịch" : "Tạo file lịch"}</button></div>
      <div class="hint">${isIOS ? "Nếu iPhone không hiện bảng thêm lịch, mở link app bằng Safari (không phải icon ngoài màn hình) rồi làm lại." : "Mở file vừa tải bằng app Lịch của Xiaomi hoặc Google Lịch."} Nhập lại lần nữa có thể tạo sự kiện trùng, nên xóa lịch cũ trước khi cập nhật.</div>`,
    onMount(b) {
      const make = () => {
        const classes = !!($("[name=c]", b) || {}).checked, tasks = !!($("[name=t]", b) || {}).checked;
        return buildIcs({ classes, tasks, until: ($("[name=until]", b) || {}).value || addDays(today(), 7 * 15) });
      };
      const sh = $("[data-share]", b);
      if (sh) sh.addEventListener("click", async () => { const { text, count } = make(); if (!count) return toast("Không có gì để đưa vào lịch"); if (await shareOrDownload("hom-nay.ics", text, "text/calendar")) toast(`Đã tạo ${count} sự kiện`); });
      $("[data-go]", b).addEventListener("click", async () => {
        const classes = !!($("[name=c]", b) || {}).checked, tasks = !!($("[name=t]", b) || {}).checked;
        const until = ($("[name=until]", b) || {}).value || addDays(today(), 7 * 15);
        const { text, count } = buildIcs({ classes, tasks, until });
        if (!count) { toast("Không có gì để đưa vào lịch"); return; }
        if (isIOS) { try { location.href = "data:text/calendar;charset=utf-8," + encodeURIComponent(text); return; } catch {} }
        if (await shareOrDownload("hom-nay.ics", text, "text/calendar")) toast(`Đã tạo ${count} sự kiện`);
      });
    }
  });
}

function welcomeSheet() {
  openSheet({
    title: "Chào mừng đến Hôm Nay", color: "var(--fg)",
    html: `<div class="small mut" style="margin:-4px 0 14px">Ghi chi tiêu, việc cần làm, lịch học, tập luyện trong một app. Chỉ cần gõ một câu như "cà phê 30k".</div>
      <div class="f"><label>Bạn đang là</label>${pills("persona", PERSONAS.map(([k, n, e]) => [k, `${e} ${n}`]), "")}</div>
      <div class="f"><label>Tên của bạn</label><input name="name" placeholder="Để chào mỗi sáng" autocomplete="given-name"></div>
      <div class="f"><label>Ngân sách chi tiêu mỗi tháng (không bắt buộc)</label><input name="budget" inputmode="decimal" placeholder="VD: 3tr"></div>
      <div class="steps">
        <div><b>1</b><span>Gõ hoặc nói một câu ở ô trên cùng: "trà sữa 25k", "họp 9h mai", "tiền nhà 3tr ngày 5 hằng tháng".</span></div>
        <div><b>2</b><span>Bấm + nếu muốn nhập chi tiết. Khoản hay chi sẽ thành nút ghi nhanh.</span></div>
        <div><b>3</b><span>Dùng 2 điện thoại? Vào Cài đặt (góc phải trên) để đăng nhập, dữ liệu tự đồng bộ.</span></div>
      </div>
      <div class="btns"><button class="btn" data-later>Để sau</button><button class="btn pri" data-tkb style="--c:var(--cls)">Bắt đầu</button></div>`,
    onMount(b) {
      const stW = { persona: "" };
      bindPills(b, stW, () => { $("[data-tkb]", b).textContent = stW.persona === "sv" ? "Nhập TKB từ MyBK" : stW.persona === "hs" ? "Thêm thời khóa biểu" : "Bắt đầu"; });
      const save = () => {
        if (stW.persona) applyPersona(stW.persona);
        const n = $("[name=name]", b).value.trim(), bg = parseMoney($("[name=budget]", b).value);
        if (n) setSetting("name", n); if (bg) setSetting("budget", bg);
        LS.set("onboarded", 1);
      };
      $("[data-later]", b).addEventListener("click", () => { save(); closeSheet(); });
      $("[data-tkb]", b).addEventListener("click", () => { save(); if (stW.persona === "sv") tkbSheet(); else if (stW.persona === "hs") classForm(null); else { closeSheet(); setTimeout(() => { const q = $("#qIn"); if (q) q.focus(); }, 300); } });
    }
  });
}
function chooser() {
  openSheet({
    title: "Thêm nhanh", color: "var(--fg)",
    html: `<div class="chooser">
      <button data-c="tx"><span class="emo">💸</span><span>Ghi chi tiêu<span class="d">Vài giây là xong</span></span></button>
      <button data-c="task"><span class="emo">✅</span><span>Việc cần làm<span class="d">${isStudent() ? "Bài tập, BTL, đơn từ, thi" : "Công việc, hóa đơn, việc nhà"}</span></span></button>
      ${mod("gym") ? `<button data-c="workout"><span class="emo">💪</span><span>Buổi tập<span class="d">Ghi số lần mỗi hiệp</span></span></button>` : ""}
      ${mod("cal") ? `<button data-c="class"><span class="emo">📅</span><span>Môn học<span class="d">Thêm vào thời khóa biểu</span></span></button>` : ""}
      <button data-c="goal"><span class="emo">🐷</span><span>Mục tiêu tiết kiệm<span class="d">Để dành cho điều bạn muốn</span></span></button>
    </div>`,
    onMount(b) {
      b.addEventListener("click", e => {
        const c = e.target.closest("[data-c]"); if (!c) return;
        ({ tx: txForm, task: taskForm, workout: workoutForm, class: classForm, goal: () => goalForm(null) })[c.dataset.c]();
      });
    }
  });
}

/* ================= events ================= */
function toggleTask(id) {
  const r = db[id]; if (!r) return;
  const t = { ...r.data };
  const wasStatus = t.status;
  if (t.status === "done") { t.status = "todo"; t.doneAt = null; }
  else { t.status = "done"; t.doneAt = Date.now(); }
  put("task", t, id);
  if (t.status !== "done") return;
  buzz(18);
  const sp = spawnNext(db[id]), paid = payTask(db[id]);
  const msg = [paid ? `Đã trả, ghi chi ${moneyShort(t.amount)}` : "Xong", sp && `lần tới ${DOW[parseYmd(sp.data.due).getDay()]} ${dm(sp.data.due)}`].filter(Boolean).join(", ");
  toast(msg, { label: "Hoàn tác", fn: () => { if (sp) remove(sp.id); if (paid) remove(paid.id); const cur = db[id]; put("task", { ...cur.data, status: wasStatus, doneAt: null }, id); } });
}
document.addEventListener("click", e => {
  if (e.target.closest(".sheet")) return;
  const el = e.target.closest("[data-act],[data-cdetail],[data-gomonth],[data-tab],[data-edit],[data-filter],[data-day],[data-week],[data-month],[data-ex],#fab");
  if (!el) return;
  if (el.id === "fab") {
    ({ home: chooser, task: () => taskForm(null), cal: () => classForm(null), money: () => txForm(null), gym: () => workoutForm(null) })[ui.tab]();
    return;
  }
  const act = el.dataset.act;
  if (act === "toggle-task") { e.stopPropagation(); toggleTask(el.dataset.id); return; }
  if (act === "docs") return docsSheet();
  if (act === "search") return searchSheet();
  if (act === "qsave") return quickSave();
  if (act === "qfill") { const qi = $("#qIn"); if (qi) { qi.value = el.dataset.v; ui.qText = el.dataset.v; quickPreview(); qi.focus(); } return; }
  if (act === "mic") return startMic(el);
  if (act === "goal") return goalForm(el.dataset.id || null);
  if (act === "tkb") return tkbSheet();
  if (act === "ics") return icsSheet();
  if (act === "q-tx") return txForm(null);
  if (act === "q-task") return taskForm(null);
  if (act === "q-gym") return workoutForm(null);
  if (act === "q-class") return classForm(null);
  if (act === "combo") { e.stopPropagation(); const c = combos()[+el.dataset.i]; if (c) quickTx(c); return; }
  if (act === "settings") return settingsSheet();
  if (act === "budget") return budgetForm();
  if (act === "csv") return exportCsv();
  if (act === "weight") return weightForm(el.dataset.id || null);
  if (el.dataset.tab) { if (el.dataset.tab === "cal" && ui.tab !== "cal") { ui.calWeek = 0; ui.calDay = new Date().getDay(); } ui.tab = el.dataset.tab; LS.set("tab", ui.tab); render(); window.scrollTo(0, 0); return; }
  if (el.dataset.edit) {
    const id = el.dataset.id; if (!db[id]) return;
    ({ task: taskForm, class: classForm, tx: txForm, workout: workoutForm })[el.dataset.edit](id);
    return;
  }
  if (el.dataset.filter) { ui.taskFilter = el.dataset.filter; render(); return; }
  if (el.dataset.cdetail) return classDetail(el.dataset.cdetail, el.dataset.date);
  if (el.dataset.gomonth) { ui.month = el.dataset.gomonth; render(); return; }
  if (el.dataset.day) { ui.calDay = +el.dataset.day; render(); return; }
  if (el.dataset.week != null) { const v = +el.dataset.week; ui.calWeek = v === 0 ? 0 : (ui.calWeek || 0) + v; if (!ui.calWeek) ui.calDay = new Date().getDay(); render(); return; }
  if (el.dataset.month) {
    const [y, m] = ui.month.split("-").map(Number);
    const d = new Date(y, m - 1 + +el.dataset.month, 1);
    ui.month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; render(); return;
  }
  if (el.dataset.ex) { ui.gymEx = el.dataset.ex; render(); return; }
});

/* làm mới khi qua ngày mới / mở lại app */
let lastDay = today();
function tick() {
  if (today() !== lastDay) { lastDay = today(); ui.calDay = new Date().getDay(); ui.month = today().slice(0, 7); }
  if (!sheetEl && (ui.tab === "home" || ui.tab === "cal")) render();
}
setInterval(tick, 60000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tick(); });
window.addEventListener("storage", e => { if (e.key === "hn-db") { db = LS.get("db", {}); queue = LS.get("queue", {}); render(); } });

/* ================= start ================= */
function start() {
  applyLook();
  render();
  initSync();
  renderSyncBits();
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js").then(reg => {
      reg.addEventListener("updatefound", () => {
        const w = reg.installing; if (!w) return;
        w.addEventListener("statechange", () => { if (w.state === "activated" && hadController) toast("Đã có bản cập nhật mới", { label: "Tải lại", fn: () => location.reload() }); });
      });
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
    }).catch(() => {});
  }
  // lối tắt từ icon (giữ icon app trên Android): ?add=tx | task | workout
  setTimeout(() => {
    if (!LS.get("onboarded", 0) && !Object.keys(db).length && !sync.user && !sheetEl) welcomeSheet();
    else if (Object.keys(db).length) LS.set("onboarded", 1);
  }, 1500);
  const add = new URLSearchParams(location.search).get("add");
  if (add) {
    try { history.replaceState(null, "", location.pathname); } catch {}
    const f = { tx: txForm, task: taskForm, workout: workoutForm }[add];
    if (f) setTimeout(() => f(null), 50);
  }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
