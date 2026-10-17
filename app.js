"use strict";
/* Hôm Nay: việc, lịch học, chi tiêu, tập luyện, giấy tờ. Local-first, đồng bộ qua Supabase của riêng bạn. */

const APP_VERSION = "1.0.0";
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
  copy: ic('<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>'),
};

/* ================= constants ================= */
const TASK_TYPES = [["bai", "Bài tập / BTL"], ["don", "Đơn từ, giấy tờ"], ["thi", "Thi, kiểm tra"], ["khac", "Việc khác"]];
const TYPE_NAME = Object.fromEntries(TASK_TYPES);
const OUT_CATS = [
  ["an", "Ăn uống", "🍜"], ["nuoc", "Cà phê, nước", "🧋"], ["dilai", "Đi lại, xăng", "🛵"], ["hoc", "Học tập", "📚"],
  ["muasam", "Mua sắm", "🛍️"], ["giaitri", "Giải trí", "🎮"], ["hendo", "Hẹn hò", "💞"], ["hoadon", "Hóa đơn, 4G", "🧾"],
  ["suckhoe", "Sức khỏe", "💊"], ["khac", "Khác", "📦"]
];
const IN_CATS = [["giadinh", "Gia đình gửi", "🏠"], ["luong", "Lương, thực tập", "💼"], ["thuong", "Học bổng, thưởng", "🎓"], ["thukhac", "Thu khác", "💰"]];
const CAT = Object.fromEntries([...OUT_CATS, ...IN_CATS].map(c => [c[0], c]));
const EXERCISES = [
  ["Hít xà", "lần"], ["Xà kép", "lần"], ["Hít đất para", "lần"], ["Chống đẩy", "lần"], ["Treo nâng gối", "lần"],
  ["Plank", "giây"], ["Squat", "lần"], ["Goblet squat", "lần"], ["Lunge", "lần"], ["Romanian deadlift", "lần"], ["Chạy bộ", "phút"]
];
const EX_UNIT = Object.fromEntries(EXERCISES);
const exUnit = name => EX_UNIT[name] || "lần";
/* Giờ tiết học BK: tiết n bắt đầu (5+n):00, kết thúc (5+n):50 */
const tietStart = n => `${pad(5 + n)}:00`;
const tietEnd = n => `${pad(5 + n)}:50`;
const DOC_TEMPLATE = ["Họ tên", "MSSV", "Lớp", "Ngành", "SĐT", "Email"];

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
function classesOn(dow) {
  return all("class").filter(c => (c.data.days || []).includes(dow)).sort((a, b) => (toMin(a.data.start) || 0) - (toMin(b.data.start) || 0));
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
function monthTx(month) { return all("tx").filter(r => (r.data.date || "").slice(0, 7) === month); }
const sumOut = list => list.filter(r => r.data.type !== "in").reduce((s, r) => s + (r.data.amount || 0), 0);
const sumIn = list => list.filter(r => r.data.type === "in").reduce((s, r) => s + (r.data.amount || 0), 0);
const sessions = () => all("workout").sort((a, b) => (b.data.date || "").localeCompare(a.data.date || "") || Date.parse(b.updated_at) - Date.parse(a.updated_at));
const exTotal = (s, ex) => (s.data.items || []).filter(i => i.ex === ex).reduce((t, i) => t + (i.sets || []).reduce((a, b) => a + b, 0), 0);

/* ================= render ================= */
function header(title, sub) {
  return `<header class="top">
    <div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ""}</div>
    <div class="top-actions">
      <button class="icon-btn" data-act="docs" aria-label="Giấy tờ">${I.id}</button>
      <button class="icon-btn sync-dot" data-act="settings" aria-label="Cài đặt">${I.set}</button>
    </div>
  </header>`;
}
function render() {
  const main = $("#main");
  if (!main) return;
  const v = { home: viewHome, task: viewTasks, cal: viewCal, money: viewMoney, gym: viewGym }[ui.tab] || viewHome;
  main.innerHTML = v();
  $("#nav").innerHTML = `<div class="nav-in">${TABS.map(([k, label, icon, c]) =>
    `<button class="${ui.tab === k ? "on" : ""}" data-tab="${k}" style="--c:${c}">${icon}<span>${label}</span></button>`).join("")}</div>`;
  const fab = $("#fab");
  fab.style.setProperty("--c", ui.tab === "home" ? "var(--fg)" : tabColor(ui.tab));
  fab.style.setProperty("--on-c", ui.tab === "home" ? "var(--bg)" : "#fff");
  fab.innerHTML = I.plus;
  fab.setAttribute("aria-label", "Thêm");
  renderSyncBits();
}

/* ---------- Hôm nay ---------- */
function greeting() {
  const h = new Date().getHours();
  const name = getSetting("name", "");
  const g = h < 11 ? "Chào buổi sáng" : h < 14 ? "Chào buổi trưa" : h < 18 ? "Chào buổi chiều" : "Chào buổi tối";
  return name ? `${g}, ${esc(name)}` : g;
}
function classRows(list, isToday) {
  const nm = nowMin();
  let nextMarked = false;
  return list.map(c => {
    const d = c.data, s = toMin(d.start), e = toMin(d.end);
    let state = "", tag = "";
    if (isToday) {
      if (s != null && e != null && nm >= s && nm < e) { state = "now"; tag = `<span class="chip c-gym">Đang học</span>`; }
      else if (e != null && nm >= e) state = "past";
      else if (!nextMarked && s != null && nm < s) { nextMarked = true; const m = s - nm; tag = `<span class="chip c-cls">${m < 60 ? `còn ${m} phút` : `còn ${Math.floor(m / 60)}g${m % 60 ? pad(m % 60) : ""}`}</span>`; }
    }
    return `<div class="cls ${state}" data-edit="class" data-id="${c.id}">
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
    t.type && t.type !== "bai" && t.type !== "khac" && `<span class="chip ${t.type === "thi" ? "c-danger" : ""}">${esc(TYPE_NAME[t.type])}</span>`,
    due.text && `<span class="${due.cls}">${esc(due.text)}</span>`,
    t.status === "waiting" && `<span class="amber">Chờ: ${esc(t.waitFor || "phản hồi")}</span>`,
    subs.length && `<span>${subDone}/${subs.length} phần</span>`,
  ].filter(Boolean).join("");
  return `<div class="row tap" data-edit="task" data-id="${r.id}">
    <button class="check ${t.status === "done" ? "on" : t.status === "waiting" ? "wait" : ""}" data-act="toggle-task" data-id="${r.id}" aria-label="Xong"></button>
    <div class="grow"><div class="t" ${t.status === "done" ? 'style="text-decoration:line-through;opacity:.6"' : ""}>${esc(t.title)}</div>${meta ? `<div class="m">${meta}</div>` : ""}</div>
  </div>`;
}
function viewHome() {
  const now = new Date(), td = today();
  const cls = classesOn(now.getDay());
  const tomorrow = classesOn((now.getDay() + 1) % 7);
  const open = all("task").filter(t => t.data.status !== "done");
  const urgent = open.filter(t => t.data.status === "todo" && t.data.due && dayDiff(t.data.due, td) <= 3).sort(byDue);
  const waiting = open.filter(t => t.data.status === "waiting").sort(byDue);
  const noDueCount = open.filter(t => t.data.status === "todo" && !(t.data.due && dayDiff(t.data.due, td) <= 3)).length;
  const mtx = monthTx(td.slice(0, 7));
  const outToday = sumOut(mtx.filter(r => r.data.date === td));
  const outMonth = sumOut(mtx);
  const budget = +getSetting("budget", 0) || 0;
  const ws = weekStart(td);
  const sess = sessions();
  const weekDays = new Set(sess.filter(s => s.data.date >= ws && s.data.date <= addDays(ws, 6)).map(s => s.data.date));
  const last = sess[0];

  let classHtml;
  if (cls.length) classHtml = classRows(cls, true);
  else if (!all("class").length) classHtml = `<div class="empty">Chưa có thời khóa biểu. Vào tab Lịch học để thêm.</div>`;
  else classHtml = `<div class="empty">Hôm nay không có tiết nào.${tomorrow.length ? ` Mai học ${tomorrow.length} môn, bắt đầu ${esc(tomorrow[0].data.start)}.` : ""}</div>`;

  const todoHtml = urgent.length
    ? urgent.slice(0, 6).map(taskRow).join("")
    : `<div class="empty">Không có gì gấp trong 3 ngày tới.${noDueCount ? ` Còn ${noDueCount} việc khác.` : ""}</div>`;

  return header(`${DOWL[now.getDay()]}, ${pad(now.getDate())}/${pad(now.getMonth() + 1)}`, greeting()) + `
  <section class="card" style="--c:var(--cls)">
    <div class="card-h"><h2><i></i>Lịch học hôm nay</h2><button class="link" data-tab="cal">Cả tuần</button></div>
    ${classHtml}
  </section>
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
  </section>
  <section class="card tap" style="--c:var(--gym);cursor:pointer" data-tab="gym">
    <div class="card-h"><h2><i></i>Tập luyện</h2><span class="link">${weekDays.size} buổi tuần này</span></div>
    ${weekGrid(ws, weekDays)}
    <div class="small mut" style="margin-top:8px">${last ? `Buổi gần nhất: ${last.data.date === td ? "hôm nay" : dayDiff(td, last.data.date) === 1 ? "hôm qua" : dm(last.data.date)} · ${esc(sessionSummary(last))}` : "Chưa ghi buổi tập nào."}</div>
  </section>
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
  const td = today(), ws = weekStart(td), tdDow = new Date().getDay();
  const allCls = all("class");
  const strip = WEEK_ORDER.map((dow, i) => {
    const d = addDays(ws, i);
    const has = allCls.some(c => (c.data.days || []).includes(dow));
    return `<button class="${ui.calDay === dow ? "on" : ""} ${dow === tdDow ? "today" : ""} ${has ? "has" : ""}" data-day="${dow}">${DOW[dow]}<span class="n">${parseYmd(d).getDate()}</span></button>`;
  }).join("");
  const list = classesOn(ui.calDay);
  const weekCount = allCls.reduce((s, c) => s + (c.data.days || []).length, 0);
  return header("Lịch học", allCls.length ? `${allCls.length} môn · ${weekCount} buổi mỗi tuần` : "Thời khóa biểu học kỳ") + `
    <div class="days">${strip}</div>
    <section class="card" style="--c:var(--cls)">
      <div class="card-h"><h2><i></i>${DOWL[ui.calDay]}${ui.calDay === tdDow ? " (hôm nay)" : ""}</h2></div>
      ${list.length ? classRows(list, ui.calDay === tdDow) : `<div class="empty">${allCls.length ? "Không có tiết." : "Chưa có môn nào. Bấm + để thêm từng môn theo thời khóa biểu."}</div>`}
    </section>
    ${allCls.length ? `<div class="group-h">Tất cả các môn</div><div class="card list">${allCls.sort((a, b) => a.data.title.localeCompare(b.data.title, "vi")).map(c =>
      `<div class="row tap" data-edit="class" data-id="${c.id}"><div class="grow"><div class="t">${esc(c.data.title)}</div><div class="m">${[(c.data.days || []).slice().sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b)).map(d => DOW[d]).join(", "), `${esc(c.data.start)}–${esc(c.data.end)}`, c.data.code && esc(c.data.code)].filter(Boolean).join(" · ")}</div></div></div>`).join("")}</div>` : ""}`;
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
  const byCat = {};
  list.filter(r => r.data.type !== "in").forEach(r => { byCat[r.data.cat] = (byCat[r.data.cat] || 0) + r.data.amount; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const maxCat = cats.length ? cats[0][1] : 1;
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
        <div style="text-align:right" class="small"><div class="mut">Thu <b class="green num">${money(inn)}</b></div><div class="mut">TB/ngày <b class="num" style="color:var(--fg)">${moneyShort(out / Math.max(1, daysPassed))}</b></div></div>
      </div>
      ${budgetLine}
      ${budget ? `<button class="link small" data-act="budget" style="margin-top:6px">Sửa ngân sách</button>` : ""}
    </section>
    ${cats.length ? `<section class="card" style="--c:var(--money)"><div class="card-h"><h2><i></i>Theo loại</h2></div>
      ${cats.map(([k, v]) => `<div class="cat-row"><span>${(CAT[k] || ["", "Khác", "📦"])[2]} ${esc((CAT[k] || ["", "Khác"])[1])}</span><div class="mbar"><i style="width:${v / maxCat * 100}%"></i></div><span class="num small">${moneyShort(v)}</span></div>`).join("")}
    </section>` : ""}
    ${Object.keys(byDay).length ? Object.keys(byDay).sort().reverse().map(d => {
      const rows = byDay[d];
      const label = d === td ? "Hôm nay" : dayDiff(td, d) === 1 ? "Hôm qua" : `${DOWL[parseYmd(d).getDay()]} ${dm(d)}`;
      return `<div class="group-h">${label}<span class="num">−${money(sumOut(rows))}</span></div><div class="card list">${rows.map(r => {
        const c = CAT[r.data.cat] || ["", "Khác", "📦"];
        return `<div class="row tap" data-edit="tx" data-id="${r.id}"><div class="emo">${c[2]}</div><div class="grow"><div class="t">${esc(r.data.note || c[1])}</div>${r.data.note ? `<div class="m">${esc(c[1])}</div>` : ""}</div><div class="amt num ${r.data.type === "in" ? "in" : ""}">${r.data.type === "in" ? "+" : "−"}${money(r.data.amount)}</div></div>`;
      }).join("")}</div>`;
    }).join("") : `<div class="card empty">Chưa ghi khoản nào trong tháng này. Bấm + để ghi, chỉ mất vài giây.</div>`}`;
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
  return header("Tập luyện", `${weekDays.size} buổi tuần này`) + `
    <section class="card" style="--c:var(--gym)">
      <div class="card-h"><h2><i></i>Tuần này</h2><span class="small mut">${weekDays.size}/7 ngày</span></div>
      ${weekGrid(ws, weekDays)}
    </section>
    ${progress}
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
    <text x="${x(lastI).toFixed(1)}" y="${(y(series[lastI].v) - 9).toFixed(1)}" text-anchor="end" font-size="12" font-weight="700" fill="var(--fg)">${series[lastI].v}</text>
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
  const st = { type: t.type || "bai", status: t.status || "todo" };
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
      <div class="f"><label>Loại</label>${pills("type", TASK_TYPES, st.type)}</div>
      <div class="f"><label>Hạn</label>
        <div class="pills" data-quickdue style="margin-bottom:8px">
          <button type="button" data-d="0">Hôm nay</button><button type="button" data-d="1">Mai</button><button type="button" data-d="3">+3 ngày</button><button type="button" data-d="7">+1 tuần</button><button type="button" data-d="">Không hạn</button>
        </div>
        <div class="f2"><input type="date" name="due" value="${esc(t.due)}" aria-label="Ngày hạn"><input type="time" name="time" value="${esc(t.time)}" aria-label="Giờ hạn"></div>
      </div>
      <div class="f"><label>Trạng thái</label>${pills("status", [["todo", "Cần làm"], ["waiting", "Chờ người khác"], ["done", "Xong"]], st.status)}</div>
      <div class="f" data-waitbox ${st.status === "waiting" ? "" : "hidden"}><label>Đang chờ ai, việc gì?</label><input name="waitFor" value="${esc(t.waitFor)}" placeholder="VD: Thầy Hưng ký giấy xác nhận"></div>
      <div class="f"><label>Phần việc (BTL nhóm, chia việc)</label><div data-subs>${subs.map(subRow).join("")}</div>
        <button type="button" class="btn" data-addsub style="padding:8px 12px;font-size:14px">+ Thêm phần</button></div>
      <div class="f"><label>Ghi chú</label><textarea name="note" placeholder="Link đề, yêu cầu, liên hệ…">${esc(t.note)}</textarea></div>
      <div class="btns">${r ? `<button class="btn danger" data-del>Xóa</button>` : ""}<button class="btn pri" data-save>Lưu</button></div>`,
    onMount(b) {
      bindPills(b, st, k => { if (k === "status") $("[data-waitbox]", b).hidden = st.status !== "waiting"; });
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
        put("task", data, id); closeSheet(); toast(r ? "Đã lưu" : "Đã thêm việc");
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
  const guessT = (time, isEnd) => { const m = toMin(time); if (m == null) return 1; return Math.min(16, Math.max(1, Math.floor(m / 60) - 5)); };
  openSheet({
    title: r ? "Sửa môn học" : "Thêm môn học", color: "var(--cls)",
    html: `
      <div class="f"><input name="title" placeholder="Tên môn" value="${esc(c.title)}" autocomplete="off"></div>
      <div class="f2 f"><div><label class="lbl">Mã môn</label><input name="code" value="${esc(c.code)}" placeholder="EE3001" autocapitalize="characters"></div><div><label class="lbl">Nhóm / lớp</label><input name="group" value="${esc(c.group)}" placeholder="L01" autocapitalize="characters"></div></div>
      <div class="f"><label>Học vào thứ</label>${pills("days", WEEK_ORDER.map(d => [d, DOW[d]]), st.days, "data-multi data-num")}</div>
      <div class="f"><label>Tiết</label><div class="f2"><select name="t1">${tietOpts(guessT(c.start))}</select><select name="t2">${tietOpts(guessT(c.end, true))}</select></div>
        <div class="f2" style="margin-top:8px"><input type="time" name="start" value="${esc(c.start)}" aria-label="Giờ bắt đầu"><input type="time" name="end" value="${esc(c.end)}" aria-label="Giờ kết thúc"></div>
        <div class="hint">Chọn tiết sẽ tự điền giờ theo lịch BK (tiết 1 = 6:00). Giờ khác thì sửa trực tiếp.</div></div>
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
        put("class", { ...c, title, code: $("[name=code]", b).value.trim().toUpperCase(), group: $("[name=group]", b).value.trim().toUpperCase(), days: st.days.slice().sort(), start, end, room: $("[name=room]", b).value.trim(), teacher: $("[name=teacher]", b).value.trim(), note: $("[name=note]", b).value.trim() }, id);
        closeSheet(); toast(r ? "Đã lưu" : "Đã thêm môn");
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
  openSheet({
    title: r ? "Sửa khoản" : "Ghi khoản mới", color: "var(--money)",
    html: `
      <div class="seg" data-pick="type">
        <button type="button" class="${st.type === "out" ? "on" : ""}" data-v="out">Chi ra</button>
        <button type="button" class="${st.type === "in" ? "on" : ""}" data-v="in">Thu vào</button>
      </div>
      <div class="f"><input class="amount-in num" name="amount" inputmode="decimal" placeholder="0" value="${x.amount ? esc(x.amount.toLocaleString("vi-VN")) : ""}" autocomplete="off" aria-label="Số tiền">
        <div class="hint" data-preview>Gõ 35 = 35.000đ · 1,5tr = 1.500.000đ</div></div>
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
  openSheet({
    title: "Ngân sách mỗi tháng", color: "var(--money)",
    html: `<div class="f"><input class="amount-in num" name="b" inputmode="decimal" value="${cur ? cur.toLocaleString("vi-VN") : ""}" placeholder="VD: 3tr"><div class="hint" data-p></div></div>
      <div class="btns">${cur ? `<button class="btn" data-clear>Bỏ ngân sách</button>` : ""}<button class="btn pri" data-save>Lưu</button></div>`,
    onMount(b) {
      const inp = $("[name=b]", b), p = $("[data-p]", b);
      const upd = () => { const v = parseMoney(inp.value); p.textContent = v ? "= " + money(v) + " mỗi tháng" : "Gõ 3tr = 3.000.000đ"; };
      inp.addEventListener("input", upd); upd();
      $("[data-save]", b).addEventListener("click", () => { setSetting("budget", parseMoney(inp.value)); closeSheet(); });
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
      const rep = $("[data-repeat]", b);
      if (rep) rep.addEventListener("click", () => { items = (lastSess.data.items || []).map(i => ({ ex: i.ex, sets: "", kg: i.kg || "" })); redraw(); rep.remove(); });
      $("[data-save]", b).addEventListener("click", () => {
        const list = read().map(i => ({ ex: i.ex, sets: parseSets(i.sets), kg: parseFloat(String(i.kg).replace(",", ".")) || 0 })).filter(i => i.ex && i.sets.length);
        const note = $("[name=note]", b).value.trim();
        if (!list.length && !note) { toast("Nhập số lần cho ít nhất một bài"); return; }
        put("workout", { ...w, date: $("[name=date]", b).value || today(), mins: parseInt($("[name=mins]", b).value, 10) || "", items: list, note }, id);
        closeSheet(); toast(r ? "Đã lưu" : "Đã ghi buổi tập");
      });
      const del = $("[data-del]", b); if (del) del.addEventListener("click", () => confirmDelete(id, "buổi tập"));
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
  const d = r ? JSON.parse(JSON.stringify(r.data)) : { name: "", fields: DOC_TEMPLATE.map(k => ({ k, v: "" })), order: all("doc").length };
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
  const counts = { task: all("task").length, class: all("class").length, tx: all("tx").length, workout: all("workout").length, doc: all("doc").length };
  let syncBox;
  if (!hasCfg) syncBox = `<div class="small mut">Chưa điền <b>config.js</b>, nên dữ liệu chỉ nằm trên máy này. Xem README.md để bật đồng bộ giữa hai điện thoại.</div>`;
  else if (sync.user) syncBox = `<div class="small" style="margin-bottom:10px">Đăng nhập: <b>${esc(sync.user.email || "")}</b></div>
      <div class="btns" style="margin-top:0"><button class="btn" data-signout>Đăng xuất</button><button class="btn pri" data-syncnow style="--c:var(--cls)">Đồng bộ ngay</button></div>`;
  else syncBox = `<div class="small mut" style="margin-bottom:10px">Đăng nhập cùng tài khoản trên cả hai điện thoại. Có thể dùng tài khoản của app Lưới Thói Quen.</div>
      <div class="f"><input name="email" type="email" autocomplete="username" placeholder="Email"></div>
      <div class="f"><input name="pw" type="password" autocomplete="current-password" placeholder="Mật khẩu"></div>
      <div class="btns" style="margin-top:0"><button class="btn" data-signup>Tạo tài khoản</button><button class="btn pri" data-signin style="--c:var(--cls)">Đăng nhập</button></div>`;
  openSheet({
    title: "Cài đặt", color: "var(--fg)",
    html: `
      <section class="card"><div class="card-h"><h2>Đồng bộ</h2></div>
        <div class="small" data-synclabel style="margin-bottom:10px">${esc(syncLabel())}</div>${syncBox}</section>
      <section class="card"><div class="card-h"><h2>Tên hiển thị</h2></div>
        <div style="display:flex;gap:8px"><input name="name" value="${esc(getSetting("name", ""))}" placeholder="Tên để chào buổi sáng"><button class="btn" data-savename>Lưu</button></div></section>
      <section class="card"><div class="card-h"><h2>Sao lưu</h2></div>
        <div class="small mut" style="margin-bottom:10px">${counts.task} việc · ${counts.class} môn · ${counts.tx} khoản tiền · ${counts.workout} buổi tập · ${counts.doc} thẻ giấy tờ</div>
        <div class="btns" style="margin-top:0"><button class="btn" data-export>Xuất file</button><label class="btn" style="cursor:pointer">Nhập file<input type="file" accept="application/json,.json" data-import hidden></label></div></section>
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
      $("[data-import]", b).addEventListener("change", e => { if (e.target.files[0]) importData(e.target.files[0]); });
    }
  });
}
function exportData() {
  const rows = Object.values(db).filter(r => !r.deleted);
  const blob = new Blob([JSON.stringify({ app: "hom-nay", version: 1, exportedAt: new Date().toISOString(), items: rows }, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `hom-nay-${today()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
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

function chooser() {
  openSheet({
    title: "Thêm nhanh", color: "var(--fg)",
    html: `<div class="chooser">
      <button data-c="tx"><span class="emo">💸</span><span>Ghi chi tiêu<span class="d">Vài giây là xong</span></span></button>
      <button data-c="task"><span class="emo">✅</span><span>Việc, hạn nộp<span class="d">Bài tập, BTL, đơn từ, thi</span></span></button>
      <button data-c="workout"><span class="emo">💪</span><span>Buổi tập<span class="d">Ghi số lần mỗi hiệp</span></span></button>
      <button data-c="class"><span class="emo">📅</span><span>Môn học<span class="d">Thêm vào thời khóa biểu</span></span></button>
    </div>`,
    onMount(b) {
      b.addEventListener("click", e => {
        const c = e.target.closest("[data-c]"); if (!c) return;
        ({ tx: txForm, task: taskForm, workout: workoutForm, class: classForm })[c.dataset.c]();
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
  if (t.status === "done") toast("Xong một việc", { label: "Hoàn tác", fn: () => { const cur = db[id]; put("task", { ...cur.data, status: wasStatus, doneAt: null }, id); } });
}
document.addEventListener("click", e => {
  if (e.target.closest(".sheet")) return;
  const el = e.target.closest("[data-act],[data-tab],[data-edit],[data-filter],[data-day],[data-month],[data-ex],#fab");
  if (!el) return;
  if (el.id === "fab") {
    ({ home: chooser, task: () => taskForm(null), cal: () => classForm(null), money: () => txForm(null), gym: () => workoutForm(null) })[ui.tab]();
    return;
  }
  const act = el.dataset.act;
  if (act === "toggle-task") { e.stopPropagation(); toggleTask(el.dataset.id); return; }
  if (act === "docs") return docsSheet();
  if (act === "settings") return settingsSheet();
  if (act === "budget") return budgetForm();
  if (el.dataset.tab) { ui.tab = el.dataset.tab; LS.set("tab", ui.tab); render(); window.scrollTo(0, 0); return; }
  if (el.dataset.edit) {
    const id = el.dataset.id; if (!db[id]) return;
    ({ task: taskForm, class: classForm, tx: txForm, workout: workoutForm })[el.dataset.edit](id);
    return;
  }
  if (el.dataset.filter) { ui.taskFilter = el.dataset.filter; render(); return; }
  if (el.dataset.day) { ui.calDay = +el.dataset.day; render(); return; }
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
  render();
  initSync();
  renderSyncBits();
  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("sw.js").catch(() => {});
  // lối tắt từ icon (giữ icon app trên Android): ?add=tx | task | workout
  const add = new URLSearchParams(location.search).get("add");
  if (add) {
    try { history.replaceState(null, "", location.pathname); } catch {}
    const f = { tx: txForm, task: taskForm, workout: workoutForm }[add];
    if (f) setTimeout(() => f(null), 50);
  }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
