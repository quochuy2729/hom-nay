"use strict";
/* Hôm Nay: việc, lịch học, chi tiêu, tập luyện, giấy tờ. Local-first, đồng bộ qua Supabase của riêng bạn. */

const APP_VERSION = "2.7.0";
const CFG = window.HN_CONFIG || {};
/* Google Fonts nạp với media="print" để không chặn lần vẽ đầu; tải xong thì áp dụng (font có display=swap) */
(() => { const l = document.getElementById("fontcss"); if (!l) return; const on = () => { l.media = "all"; }; if (l.sheet) on(); else l.addEventListener("load", on, { once: true }); })();

/* ================= utils ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const LS = {
  get(k, d) { try { const v = localStorage.getItem("hn-" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("hn-" + k, JSON.stringify(v)); return true; } catch { return false; } },
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

/* Intl.NumberFormat tạo một lần: toLocaleString("vi-VN") tạo lại bộ định dạng mỗi lần gọi, chậm khi vẽ hàng trăm dòng */
const NF0 = new Intl.NumberFormat("vi-VN"), NF1 = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 }), NFK = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 });
const money = n => NF0.format(Math.round(n || 0)) + "đ";
function moneyShort(n) {
  n = Math.round(n || 0); const a = Math.abs(n);
  if (a >= 1e6) return NF1.format(n / 1e6) + "tr";
  if (a >= 1e3) return NFK.format(n / 1e3) + "k";
  return n + "đ";
}
/* ---- bộ đọc số tiền, dùng chung cho ô nhập tiền (parseMoney) và câu ghi nhanh (parseQuick) ----
   Đọc trên chữ đã norm(): "35k", "1,5tr", "2tr5", "12tr500", "2 củ rưỡi", "1 trăm rưỡi", "2 triệu 500 nghìn", "1tr 200k", "50.000đ".
   Chữ số dính ngay sau đơn vị là phần lẻ: 2tr5 = 2,5tr; 2tr45 = 2,45tr; 12tr500 = 12,5tr. "trăm" là trăm nghìn. */
const MONEY_UNIT = { ty: 1e9, trieu: 1e6, tr: 1e6, cu: 1e6, m: 1e6, tram: 1e5, lit: 1e5, xi: 1e5, nghin: 1e3, ngan: 1e3, ng: 1e3, k: 1e3, dong: 1, d: 1, vnd: 1 };
const MONEY_UNITS = "ty|trieu|tr|cu|m|tram(?:\\s(?:nghin|ngan|k))?|lit|xi|nghin|ngan|ng|k|dong|d|vnd";
const MONEY_NUM = "\\d{1,3}(?:[.,]\\d{3})+(?![.,]?\\d)|\\d+(?:[.,]\\d+)?";
// nhóm: 1 số, 2 đơn vị, 3 phần lẻ dính liền, 4 "rưỡi"
const MONEY_PART = `(?:(${MONEY_NUM})\\s?)?(${MONEY_UNITS})(?:(\\d{1,3})|\\s(ruoi))?(?=\\s|$)`;
// phần nối tiếp: "500 nghìn" sau "2 triệu" (đơn vị nhỏ hơn), hoặc "5" đứng riêng sau "2 triệu" (nhóm 5) nếu sau nó không phải từ chỉ số lượng, giờ, ngày
const MONEY_MORE = new RegExp(`\\s(?:${MONEY_PART}|(\\d{1,3})(?=\\s|$)(?!\\s(?:h|g|gio|phut|tieng|ngay|thang|tuan|nam|lan|buoi|nguoi|cai|chiec|ly|coc|chai|lon|hop|goi|ve|kg|km|x|${MONEY_UNITS})(?:\\s|$)))`, "y");
const moneyNum = s => /^\d{1,3}([.,]\d{3})+$/.test(s) ? +s.replace(/[.,]/g, "") : parseFloat(s.replace(",", "."));
function moneyPart(m) {
  const mul = MONEY_UNIT[m[2].split(/\s/)[0]];
  if (m[1] == null && !(mul === 1e5 && m[4])) return null; // chỉ "trăm rưỡi" mới được thiếu số
  const v = m[1] == null ? 1 : moneyNum(m[1]);
  if (!isFinite(v)) return null;
  return { mul, tail: !!(m[3] || m[4]), v: v * mul + (m[3] && mul >= 1e3 ? +m[3] / 10 ** m[3].length * mul : 0) + (m[4] ? mul / 2 : 0) };
}
/* Khoản tiền có đơn vị đầu tiên trong chuỗi đã norm(): { amount, start, end, text } hoặc null */
function findMoney(n) {
  const re = new RegExp(`(?<=^|[\\s+])${MONEY_PART}`, "g");
  for (let m; (m = re.exec(n));) {
    const p = moneyPart(m); if (!p) continue;
    let amount = p.v, end = m.index + m[0].length, mul = p.mul, tail = p.tail;
    for (;;) {
      MONEY_MORE.lastIndex = end; const x = MONEY_MORE.exec(n); if (!x) break;
      if (x[2]) { const q = moneyPart(x); if (!q || q.mul >= mul) break; amount += q.v; mul = q.mul; tail = q.tail; }
      else if (x[5] && !tail && mul >= 1e5) { amount += +x[5] / 10 ** x[5].length * mul; tail = true; }
      else break;
      end += x[0].length;
    }
    // "25 ngàn đồng", "2 triệu đồng": chữ "đồng" sau đơn vị là một phần của số tiền
    const dong = mul >= 1e3 && /^\s(?:dong|vnd)(?=\s|$)/.exec(n.slice(end)); if (dong) end += dong[0].length;
    return { amount: Math.round(amount), start: m.index, end, text: n.slice(m.index, end) };
  }
  return null;
}
/* Ô nhập tiền: "35" → 35.000đ, "35k" → 35.000đ, "1,5tr" → 1.500.000đ, "2tr5" → 2.500.000đ, "2 củ" → 2.000.000đ, "50.000" → 50.000đ */
function parseMoney(s) {
  let n = norm(s).replace(/\s+/g, " ").trim().replace(/\s?(?:dong|d|vnd)$/, ""); // "2tr5đ"; "35đ" vẫn là 35.000đ như "35"
  if (!n) return 0;
  const f = findMoney(n);
  if (f && f.start === 0 && f.end === n.length) return f.amount;
  if (/^\d{1,3}( \d{3})+$/.test(n)) n = n.replace(/ /g, ""); // "1 500 000"
  const m = n.match(/^(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)$/);
  if (!m) return 0;
  if (/^\d{1,3}([.,]\d{3})+$/.test(m[1])) return +m[1].replace(/[.,]/g, "");
  const v = parseFloat(m[1].replace(",", "."));
  return isFinite(v) ? Math.round(v < 1000 ? v * 1000 : v) : 0;
}
/* Số tiền để điền lại vào ô nhập, parseMoney đọc lại ra đúng số cũ: 2.450.000 → "2,45tr", 35.000 → "35k" */
function moneyEdit(n) {
  n = Math.round(+n || 0); if (!n) return "";
  if (n % 1e3) return n.toLocaleString("vi-VN");
  const f = (v, u) => v.toLocaleString("vi-VN", { maximumFractionDigits: 2, useGrouping: false }) + u;
  return Math.abs(n) >= 1e6 && (n / 1e4) % 1 === 0 ? f(n / 1e6, "tr") : f(n / 1e3, "k");
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
  more: ic('<circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none"/>'),
};

/* ================= constants ================= */

/* "lunar-year", "lunar-month": lặp theo âm lịch (giỗ, rằm). Bản 2.6.1 trở về trước không biết các giá trị mới ("year", "lunar-*"):
   việc vẫn hiện bình thường, nhưng đánh dấu xong trên bản cũ sẽ tạo lần sau như hằng tháng (xem analysis.md). */
const REPEATS = [["", "Không"], ["day", "Hằng ngày"], ["week", "Hằng tuần"], ["2week", "2 tuần một lần"], ["month", "Hằng tháng"], ["year", "Hằng năm"], ["lunar-month", "Hằng tháng âm lịch"], ["lunar-year", "Hằng năm âm lịch"]];
const REPEAT_NAME = Object.fromEntries(REPEATS);
/* Ngày gốc của chuỗi lặp (data.day): ngày trong tháng (dương) với hằng tháng/năm, ngày âm với lặp âm lịch.
   Giữ ngày gốc để 31/1 → 28/2 → 31/3 → 30/4 không trôi về 28; việc cũ chưa có `day` thì lấy ngày của hạn hiện tại. */
const DAY_REPEATS = ["month", "year", "lunar-month", "lunar-year"];
const anchorDay = (due, rep) => rep && rep.startsWith("lunar-") ? LUNAR.of(due).d : +String(due).slice(8, 10);
/* Hạn kế tiếp sau `day` của kiểu lặp `rep`; `anchor` là ngày gốc (data.day), thiếu thì lấy ngày của `day` */
function nextDue(day, rep, anchor) {
  if (rep === "day") return addDays(day, 1);
  if (rep === "week") return addDays(day, 7);
  if (rep === "2week") return addDays(day, 14);
  if (rep === "lunar-year" || rep === "lunar-month") {
    const l = LUNAR.of(day), ld = anchor >= 1 && anchor <= 30 ? anchor : l.d;
    return LUNAR.next(ld, rep === "lunar-year" ? l.m : 0, addDays(day, 1)) || addDays(day, rep === "lunar-year" ? 354 : 29);
  }
  const d = parseYmd(day), want = anchor >= 1 && anchor <= 31 ? anchor : d.getDate();
  const n = new Date(d.getFullYear() + (rep === "year" ? 1 : 0), d.getMonth() + (rep === "year" ? 0 : 1), 1);
  n.setDate(Math.min(want, new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate()));
  return ymd(n);
}
/* Việc lặp lại vừa xong → tạo lần kế tiếp (bỏ qua các kỳ đã trôi qua, không tạo trùng). Kiểu lặp lạ (của bản mới hơn) thì không tạo. */
function spawnNext(r) {
  const d = r && r.data; if (!d || !d.repeat || !d.due || !REPEAT_NAME[d.repeat]) return null;
  const anchor = DAY_REPEATS.includes(d.repeat) ? (+d.day || anchorDay(d.due, d.repeat)) : 0;
  const td = today(); let nd = nextDue(d.due, d.repeat, anchor), guard = 0;
  while (nd < td && guard++ < 800) nd = nextDue(nd, d.repeat, anchor);
  if (d.until && nd > d.until) return null;
  const series = d.series || r.id;
  if (all("task").some(x => x.id !== r.id && (x.data.series || x.id) === series && x.data.due === nd)) return null;
  return put("task", { ...d, series, due: nd, ...(anchor ? { day: anchor } : {}), status: "todo", doneAt: null, createdAt: Date.now(), subs: (d.subs || []).map(x => ({ ...x, done: false })) });
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
/* Chưa chọn hồ sơ: người mới (đã hoặc đang thấy màn hình chào) là "other"; máy dùng từ bản cũ, trước khi có hồ sơ, vẫn là sinh viên */
const persona = () => getSetting("persona", "") || (LS.get("onboarded", 0) && !LS.get("welcomed", 0) ? "sv" : "other");
const isStudent = () => ["hs", "sv"].includes(persona());
const mod = k => { const m = getSetting("modules", null); return !m || m[k] !== false; };
/* keepModules: đổi hồ sơ trong Cài đặt thì giữ nguyên các mục đang bật/tắt (không tự tắt Lịch học) */
function applyPersona(p, keepModules) {
  const d = PERSONA_DEFAULTS[p] || PERSONA_DEFAULTS.other;
  batch(() => { setSetting("persona", p); if (!keepModules) setSetting("modules", d.modules); setSetting("hiddenCats", d.hidden); setSetting("tiet", d.tiet); });
}
const taskTypes = () => isStudent()
  ? [["bai", persona() === "hs" ? "Bài tập" : "Bài tập, BTL"], ["don", "Đơn từ, giấy tờ"], ["thi", "Thi, kiểm tra"], ["khac", "Việc khác"]]
  : [["bai", "Công việc"], ["don", "Giấy tờ, thủ tục"], ["thi", "Sự kiện quan trọng"], ["khac", "Việc nhà, cá nhân"]];
const typeName = k => (taskTypes().find(x => x[0] === k) || ["", ""])[1];
const EXERCISES = [
  ["Hít xà", "lần"], ["Xà kép", "lần"], ["Hít đất para", "lần"], ["Chống đẩy", "lần"], ["Treo nâng gối", "lần"],
  ["Plank", "giây"], ["Squat", "lần"], ["Goblet squat", "lần"], ["Lunge", "lần"], ["Romanian deadlift", "lần"], ["Chạy bộ", "phút"],
  ["Hít xà ngửa tay", "lần"], ["Hít xà chậm hạ", "lần"], ["Chèo tạ 1 tay", "lần"], ["Pike push-up", "lần"], ["L-sit", "giây"],
  ["Bulgarian split squat", "lần"], ["RDL 1 chân", "lần"], ["Lunge lùi", "lần"], ["Máy đung đưa", "phút"]
];
const EX_UNIT = Object.fromEntries(EXERCISES);
/* đơn vị của bài: danh sách có sẵn, rồi tới giáo án đã dán (bài lạ như "Wall sit 3x40s" là giây), cuối cùng là "lần" */
const exUnit = name => EX_UNIT[name] || gymUnit(name) || "lần";
const setsPh = ex => ({ "giây": "Giây mỗi hiệp: 60 45 45", "phút": "Số phút: 20" })[exUnit(ex)] || "Số lần mỗi hiệp: 10 8 8 hoặc 4x10";
/* Lần gần nhất tập bài ex (bỏ qua buổi skipId): gộp các hiệp của mọi dòng cùng tên trong buổi đó */
function lastEx(ex, skipId) {
  const s = sessions().find(x => x.id !== skipId && (x.data.items || []).some(i => i.ex === ex && (i.sets || []).length));
  return s ? { date: s.data.date, sets: s.data.items.filter(i => i.ex === ex).flatMap(i => (i.sets || []).map(n => +n || 0)) } : null;
}
/* Xu hướng cân nặng 4 tuần gần nhất (hồi quy tuyến tính, đỡ nhiễu do nước và bữa ăn): kg mỗi tuần, cần ít nhất 3 lần cân cách nhau 10 ngày */
function weightTrend(asc) {
  const last = asc[asc.length - 1]; if (!last) return null;
  const pts = asc.filter(x => dayDiff(last.data.date, x.data.date) <= 28).map(x => [dayDiff(x.data.date, last.data.date), +x.data.kg || 0]);
  if (pts.length < 3 || -pts[0][0] < 10) return null;
  const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length, my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const den = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
  return den ? Math.round(pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0) / den * 7 * 100) / 100 : null;
}
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
/* Chuẩn hóa dữ liệu đọc vào (localStorage, server, file sao lưu): trường số phải là số, ngày/giờ phải đúng dạng.
   Chỉ sửa giá trị sai của trường đang có, không thêm hay đổi tên trường. Chuỗi tự do vẫn phải esc() khi vẽ. */
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/, HM_RE = /^(?:[01]?\d|2[0-3]):[0-5]\d$/;
const nNum = v => typeof v === "number" ? (Number.isFinite(v) ? v : 0) : v === "" || v == null ? v : (Number(String(v).replace(",", ".")) || 0);
/* ngày phải có thật: "2026-11-31", "2027-02-30" (bản cũ ghi nhanh từng tạo ra) thành rỗng */
const nYmd = v => typeof v === "string" && (v === "" || (YMD_RE.test(v) && ymd(parseYmd(v)) === v)) ? v : "";
const nStr = v => typeof v === "string" ? v : v == null ? "" : String(v);
const nHm = v => typeof v === "string" && (v === "" || HM_RE.test(v)) ? v : "";
const nArr = (v, f) => Array.isArray(v) ? v.map(f).filter(x => x !== null) : [];
/* số nguyên trong [lo, hi] (nhận cả chuỗi số), sai thì null */
const nInt = (v, lo, hi) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Number.isInteger(+v) && +v >= lo && +v <= hi ? +v : null;
const NORM = {
  /* day: ngày gốc của chuỗi lặp (1-31, hoặc ngày âm 1-30 với lặp âm lịch), xem nextDue. repeat lạ (bản mới hơn) giữ nguyên, chỉ không lặp */
  task: { due: nYmd, time: nHm, until: nYmd, amount: nNum, dur: nNum, day: v => nInt(v, 1, 31) ?? "", repeat: v => typeof v === "string" ? v.slice(0, 24) : "",
    subs: v => nArr(v, x => x && typeof x === "object" ? x : null) },
  class: { start: nHm, end: nHm, credits: nNum, days: v => nArr(v, d => Number.isInteger(+d) && +d >= 0 && +d <= 6 && d !== "" ? +d : null),
    weeks: v => nArr(v, w => Number.isInteger(+w) && +w >= 1 && +w <= 53 && w !== "" ? +w : null), absent: v => nArr(v, d => YMD_RE.test(d) ? d : null) },
  tx: { amount: nNum, date: nYmd, at: nNum },
  /* planId, planDate: buổi giáo án mà buổi tập này tick vào; items[].pi: chỉ số bài trong buổi giáo án; items[].hs: hiệp thứ mấy (đếm từ 0) của từng số trong sets */
  workout: { date: nYmd, mins: nNum, plan: v => typeof v === "string" && /^[A-Z]$/.test(v) ? v : "",
    planId: v => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : "", planDate: nYmd,
    items: v => nArr(v, i => {
      if (!i || typeof i !== "object") return null;
      const o = { ...i, ex: String(i.ex ?? ""), sets: nArr(i.sets, x => nNum(x) || 0) };
      if ("kg" in i) o.kg = nNum(i.kg);
      if ("pi" in i) { const k = nInt(i.pi, 0, 99); if (k === null) delete o.pi; else o.pi = k; }
      if ("hs" in i) { const hs = Array.isArray(i.hs) ? i.hs.map(h => nInt(h, 0, 99)) : []; if (hs.length === o.sets.length && !hs.includes(null) && new Set(hs).size === hs.length) o.hs = hs; else delete o.hs; }
      return o;
    }) },
  /* giáo án dán vào: một bản ghi chứa mọi buổi. dows: thứ (0 = CN), date: buổi một lần; mỗi bài n hiệp × lo (đến hi) unit, max = tối đa */
  gymplan: { start: nYmd, until: nYmd, name: v => String(v ?? ""), src: v => String(v ?? "").slice(0, 8000),
    days: v => nArr(v, d => d && typeof d === "object" ? { ...d, name: String(d.name ?? ""), date: nYmd(d.date ?? ""), rest: d.rest === true,
      dows: [...new Set(nArr(d.dows, x => nInt(x, 0, 6)))],
      items: nArr(d.items, it => it && typeof it === "object" ? { ...it, ex: String(it.ex ?? ""), n: nInt(it.n, 1, 20) ?? 3, lo: nInt(it.lo, 0, 9999) ?? 0, hi: nInt(it.hi, 0, 9999) ?? 0,
        max: it.max === true, unit: ["lần", "giây", "phút"].includes(it.unit) ? it.unit : "lần", kg: it.kg === "" || it.kg == null ? "" : nNum(it.kg), side: it.side === true, note: String(it.note ?? "") } : null) } : null) },
  weight: { date: nYmd, kg: nNum },
  goal: { target: nNum, saved: nNum, deadline: nYmd },
  /* thẻ giấy tờ: fields là mảng { k, v } chuỗi (dữ liệu hỏng từng làm sập Giấy tờ và Tìm kiếm) */
  doc: { name: nStr, order: nNum, fields: v => nArr(v, f => f && typeof f === "object" && !Array.isArray(f) ? { ...f, k: nStr(f.k), v: nStr(f.v) } : null) }
};
const PERSONA_KEYS = ["hs", "sv", "work", "biz", "other"];
/* Mọi key cài đặt app đang đọc đều có luật: giá trị sai kiểu (file sao lưu, máy khác) từng làm trắng trang vĩnh viễn */
const NORM_SETTING = {
  budget: nNum, credits: nNum, weightGoal: nNum, name: nStr,
  hiddenCats: v => nArr(v, x => typeof x === "string" ? x : null),
  modules: v => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => typeof x === "boolean")) : null,
  persona: v => PERSONA_KEYS.includes(v) ? v : "",
  tiet: v => ["bk", "thpt", "custom"].includes(v) ? v : "",
  gymPlan: v => v && typeof v === "object" ? { on: v.on === true, start: nYmd(v.start) } : null,
  catBudget: v => v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, nNum(x)])) : {},
  tietCustom: v => v && typeof v === "object" ? { ...v, start: nHm(v.start) || "07:00", len: nNum(v.len) || 45, gap: nNum(v.gap) ?? 5 } : null,
  customCats: v => nArr(v, c => c && typeof c === "object" && /^c[0-9a-z]{1,20}$/.test(c.k) ? { ...c, n: String(c.n ?? ""), e: String(c.e ?? ""), t: c.t === "in" ? "in" : "out" } : null)
};
function normalize(kind, data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  const own = (o, k) => typeof k === "string" && Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null;
  const rules = kind === "setting" ? (own(NORM_SETTING, data.key) ? { value: NORM_SETTING[data.key] } : {}) : own(NORM, kind) || {};
  for (const k in rules) if (k in data) data[k] = rules[k](data[k]);
  return data;
}
/* Chỉ mục theo kind: IDX[kind] = Map(id → bản ghi chưa xóa), để all(kind) không phải quét cả db.
   db là Proxy bọc dbRaw: mọi phép gán db[id] = … hay delete db[id] (put, remove, restore, mergeRemote, mergeBackup,
   cả code kiểm thử) đều tự cập nhật chỉ mục và xóa cache getSetting. Không sửa tại chỗ db[id].kind hay db[id].deleted:
   luôn gán bản ghi mới như code hiện có. */
const IDX = new Map(), IDX_ARR = new Map(), SET_CACHE = new Map();
const inIdx = r => !!r && typeof r === "object" && !r.deleted;
function idxDrop(r, id) {
  const m = IDX.get(r.kind);
  if (m && m.delete(id)) IDX_ARR.delete(r.kind);
  if (r.kind === "setting") SET_CACHE.clear();
}
function idxAdd(r, id) {
  let m = IDX.get(r.kind);
  if (!m) IDX.set(r.kind, m = new Map());
  m.set(id, r); IDX_ARR.delete(r.kind);   // id đã có thì Map giữ nguyên vị trí, thứ tự giống Object.values(db) cũ
  if (r.kind === "setting") SET_CACHE.clear();
}
let dbRaw = {}, db;               // id → {id, kind, data, deleted, updated_at}
function loadDb(obj) {
  dbRaw = obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  IDX.clear(); IDX_ARR.clear(); SET_CACHE.clear();
  for (const id in dbRaw) { const r = dbRaw[id]; if (!r) continue; r.data = normalize(r.kind, r.data); if (inIdx(r)) idxAdd(r, id); }
  db = new Proxy(dbRaw, {
    set(t, id, r) {
      const old = t[id]; t[id] = r;
      if (inIdx(old) && !(inIdx(r) && r.kind === old.kind)) idxDrop(old, id);
      if (inIdx(r)) idxAdd(r, id);
      return true;
    },
    deleteProperty(t, id) { if (inIdx(t[id])) idxDrop(t[id], id); delete t[id]; return true; }
  });
}
loadDb(LS.get("db", {}));
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
/* Ghi xuống máy theo đợt: nhiều thay đổi liền nhau chỉ JSON.stringify cả db một lần, khi máy rảnh (chậm nhất 300ms).
   Luôn ghi ngay khi app xuống nền hoặc trang bị đóng (visibilitychange → hidden, pagehide).
   Bộ nhớ đầy thì giữ dữ liệu trong RAM (vẫn đồng bộ lên server được), hiện cảnh báo cố định cho tới khi ghi lại được. */
let persistDirty = false, persistJob = null;
function persist() {
  persistDirty = true;
  if (persistJob) return;
  persistJob = window.requestIdleCallback
    ? { idle: requestIdleCallback(() => flushPersist(), { timeout: 300 }) }
    : { t: setTimeout(() => flushPersist(), 300) };
}
function flushPersist() {
  if (persistJob) {
    if (persistJob.idle != null && window.cancelIdleCallback) cancelIdleCallback(persistJob.idle);
    if (persistJob.t != null) clearTimeout(persistJob.t);
    persistJob = null;
  }
  if (!persistDirty) return true;
  persistDirty = false;
  const ok = LS.set("queue", queue) && LS.set("db", dbRaw);
  if (!ok) persistDirty = true;   // lần ghi sau (thay đổi mới, app xuống nền) thử lại
  storeWarn(!ok);
  return ok;
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushPersist(); });
window.addEventListener("pagehide", () => flushPersist());
function storeWarn(on) {
  let el = $("#storewarn");
  if (!on) { if (el) el.remove(); return; }
  if (el) return;
  el = document.createElement("div"); el.id = "storewarn"; el.className = "storewarn"; el.setAttribute("role", "alert");
  el.innerHTML = `<span>Bộ nhớ trên máy đã đầy nên thay đổi mới chưa được lưu lại. Đừng đóng app: hãy tải bản sao lưu ngay${sync.user ? " (dữ liệu vẫn đang được đồng bộ lên tài khoản)" : ""}.</span><button class="btn" data-act="export">Tải bản sao lưu</button>`;
  document.body.prepend(el);
}
/* Bản ghi chưa xóa của một loại. Trả về bản sao của mảng trong chỉ mục: người gọi sort/push thoải mái. */
function all(kind) {
  let a = IDX_ARR.get(kind);
  if (!a) { const m = IDX.get(kind); a = m ? [...m.values()] : []; IDX_ARR.set(kind, a); }
  return a.slice();
}
/* Gộp nhiều thao tác ghi thành một lần vẽ lại: batch(() => { put(…); put(…); }) */
let batchDepth = 0, batchRender = false;
function batch(fn) {
  batchDepth++;
  try { return fn(); }
  finally { if (!--batchDepth && batchRender) { batchRender = false; render(); } }
}
function changed() { persist(); if (batchDepth) batchRender = true; else render(); scheduleSync(); }
let putSeq = 0;   // tăng mỗi lần put(): form mở từ ghi nhanh dùng để biết đã lưu hay chưa
function put(kind, data, id) {
  putSeq++;
  const prev = id ? db[id] : null;
  id = id || uuid();
  const r = { id, kind: prev ? prev.kind : kind, data, deleted: false, updated_at: stampAfter(prev && prev.updated_at) };
  db[id] = r; queue[id] = r.updated_at;
  changed();
  return r;
}
function remove(id) {
  const r = db[id]; if (!r) return;
  db[id] = { ...r, deleted: true, updated_at: stampAfter(r.updated_at) };
  queue[id] = db[id].updated_at;
  changed();
}
function restore(snapshot) {
  const cur = db[snapshot.id];
  db[snapshot.id] = { ...snapshot, updated_at: stampAfter(cur && cur.updated_at) };
  queue[snapshot.id] = db[snapshot.id].updated_at;
  changed();
}
/* Bản ghi cài đặt mới nhất của một key (cache theo key, tự xóa khi có bản ghi setting nào đổi) */
function settingRec(key) {
  if (SET_CACHE.has(key)) return SET_CACHE.get(key);
  let best = null;
  const m = IDX.get("setting");
  if (m) for (const r of m.values()) if (r.data && r.data.key === key && (!best || Date.parse(r.updated_at) > Date.parse(best.updated_at))) best = r;
  SET_CACHE.set(key, best);
  return best;
}
function getSetting(key, d) {
  const s = settingRec(key);
  return s ? s.data.value : d;
}
function setSetting(key, value) {
  batch(() => {
    const s = all("setting").filter(r => r.data.key === key).sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
    s.slice(1).forEach(r => remove(r.id));
    put("setting", { key, value }, s[0] && s[0].id);
  });
}

/* ================= sync (Supabase) ================= */
const sync = {
  sb: null, user: null, ch: null, state: "local", msg: "", hold: null,
  last: LS.get("last", null), wm: LS.get("wm", "1970-01-01T00:00:00Z"),
  running: false, again: false, t: null
};
/* Thư viện Supabase tải sau lần vẽ đầu (không chặn app khi CDN chậm), có SRI: sha384 của đúng file trong gói npm
   (đã đối chiếu sha256 với data.jsdelivr.com). Đổi phiên bản thì phải tính lại hash và sửa cả SHELL trong sw.js. */
const SB_SRC = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js";
const SB_SRI = "sha384-0w2KAL2YHP6wKOkUDzkCDGgVvfmHnj02DHeQ6XcHOgTfFsGyonKOpShMH1x6nk9o";
function loadSupabase(retry) {
  if (window.supabase && window.supabase.createClient) { initSync(); return; }
  const s = document.createElement("script");
  s.src = SB_SRC + (retry ? "?r=1" : ""); s.integrity = SB_SRI; s.crossOrigin = "anonymous"; s.async = true;
  s.onload = () => initSync();
  // lỗi lần đầu (mạng chập chờn, cache cũ không dùng được cho CORS) thì thử lại một lần, bỏ qua cache của service worker
  s.onerror = () => { if (!retry && navigator.onLine !== false) loadSupabase(true); else initSync(); };
  document.head.appendChild(s);
}
function initSync() {
  if (!CFG.supabaseUrl || !CFG.supabaseAnonKey) { sync.state = "local"; return; }
  if (sync.sb) return;
  if (!window.supabase || !window.supabase.createClient) { sync.state = "error"; sync.msg = "Chưa tải được thư viện Supabase (đang offline?)"; renderSyncBits(); return; }
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
        const owner = LS.get("owner", null);
        if (owner !== u.id) {
          // máy đang có dữ liệu của tài khoản khác (lần trước đăng nhập tài khoản khác): hỏi gộp hay bắt đầu trống, chưa chọn thì không đồng bộ gì.
          // Lần đầu đăng nhập trên máy (chưa có owner) thì gộp như cũ.
          if (owner && Object.values(dbRaw).some(r => r && !r.deleted && r.kind !== "setting")) { sync.hold = u.id; sync.state = "hold"; renderSyncBits(); acctSheet(); return; }
          adoptLocal(u);
        }
        startRealtime(); syncNow();
      } else { sync.hold = null; stopRealtime(); sync.state = "out"; renderSyncBits(); }
    }, 0);
  });
  setInterval(syncNow, 60000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncNow(); });
  window.addEventListener("online", syncNow);
  renderSyncBits();
}
function scheduleSync() { clearTimeout(sync.t); sync.t = setTimeout(syncNow, 700); }
/* Dữ liệu trên máy thuộc về tài khoản u: kéo lại từ đầu và đẩy toàn bộ dữ liệu đang có lên (gộp) */
function adoptLocal(u) {
  sync.wm = "1970-01-01T00:00:00Z"; LS.set("wm", sync.wm);
  for (const id in db) queue[id] = db[id].updated_at;
  persist(); LS.set("owner", u.id); LS.del("skip");
}
/* Bắt đầu trống: xóa dữ liệu trên máy và hàng chờ (gọi sau khi đã tải bản sao lưu), tài khoản u kéo dữ liệu của nó về */
function wipeLocal(u) {
  loadDb({}); queue = {}; persistDirty = true; flushPersist();
  sync.wm = "1970-01-01T00:00:00Z"; LS.set("wm", sync.wm); LS.del("skip"); LS.del("gcAt");
  LS.set("owner", u.id);
}
/* Hỏi khi đăng nhập tài khoản khác với lần trước trên máy này */
function acctSheet() {
  const u = sync.user; if (!u || sync.hold !== u.id) return;
  const c = k => all(k).length, parts = [[c("task"), "việc"], [c("tx"), "khoản tiền"], [c("class"), "môn học"], [c("workout"), "buổi tập"], [c("doc"), "thẻ giấy tờ"]].filter(x => x[0]).map(x => `${x[0]} ${x[1]}`);
  openSheet({
    title: "Dữ liệu trên máy này", color: "var(--cls)",
    html: `<div class="small" style="margin:-4px 0 14px">Bạn vừa đăng nhập <b>${esc(u.email || "")}</b>, khác tài khoản đã dùng lần trước trên máy này. Máy đang có ${esc(parts.join(", ") || "dữ liệu")} của lần trước. Bạn chọn xong thì app mới đồng bộ.</div>
      <div class="chooser acct">
        <button type="button" data-acct="merge"><span class="emo">🔀</span><span>Gộp dữ liệu trên máy vào tài khoản này<span class="d">Mọi mục trên máy được đưa lên ${esc(u.email || "tài khoản này")}.</span></span></button>
        <button type="button" data-acct="fresh"><span class="emo">🧹</span><span>Bắt đầu trống<span class="d">Tải bản sao lưu dữ liệu trên máy về trước, rồi xóa khỏi máy và tải dữ liệu của tài khoản này xuống.</span></span></button>
      </div>`,
    onMount(b) {
      b.addEventListener("click", async e => {
        const x = e.target.closest("[data-acct]"); if (!x || sync.hold !== u.id || sync.user !== u) return;
        if (x.dataset.acct === "merge") { adoptLocal(u); toast("Đã gộp, đang đồng bộ…"); }
        else {
          x.disabled = true;
          const saved = await exportData().catch(() => false);
          x.disabled = false;
          if (!saved) { toast("Chưa tải được bản sao lưu nên chưa xóa gì. Thử lại, hoặc chọn Gộp."); return; }
          if (sync.hold !== u.id || sync.user !== u) return;
          wipeLocal(u); toast("Đã lưu bản sao lưu và làm trống máy, đang tải dữ liệu tài khoản…");
        }
        sync.hold = null; closeSheet(); render(); startRealtime(); syncNow();
      });
    }
  });
}
function mergeRemote(row) {
  if (!row || !row.id || !row.updated_at) return false;
  const ru = Date.parse(row.updated_at);
  const local = db[row.id];
  if (local && Date.parse(local.updated_at) >= ru) return false;
  db[row.id] = { id: row.id, kind: row.kind, data: normalize(row.kind, row.data || {}), deleted: !!row.deleted, updated_at: new Date(ru).toISOString() };
  delete queue[row.id];
  return true;
}
/* Lỗi Supabase thường gặp, đổi sang tiếng Việt (đăng nhập, đồng bộ) */
const ERR_VI = [
  [/Invalid login credentials/i, "Sai email hoặc mật khẩu"],
  [/Email not confirmed/i, "Email chưa được xác nhận. Mở thư xác nhận trong hộp thư rồi đăng nhập lại."],
  [/User already registered|already been registered/i, "Email này đã có tài khoản, hãy bấm Đăng nhập."],
  [/Password should be at least/i, "Mật khẩu cần ít nhất 6 ký tự."],
  [/weak password|known to be weak/i, "Mật khẩu quá dễ đoán, hãy chọn mật khẩu khác."],
  [/rate limit|too many requests/i, "Thử quá nhiều lần, đợi vài phút rồi thử lại."],
  [/Signups not allowed|signup.*disabled/i, "Máy chủ này đã tắt tạo tài khoản mới."],
  [/Unable to validate email|invalid format|email address.*invalid/i, "Email không hợp lệ."],
  [/JWT expired|invalid JWT|refresh token/i, "Phiên đăng nhập đã hết hạn. Hãy đăng xuất rồi đăng nhập lại."],
  [/Failed to fetch|NetworkError|Load failed|network request failed/i, "Không kết nối được máy chủ. Kiểm tra mạng, app sẽ thử lại."],
  [/not signed in/i, "Chưa đăng nhập, hãy đăng nhập lại."],
];
const viErr = msg => { msg = String(msg || ""); const x = ERR_VI.find(([re]) => re.test(msg)); return x ? x[1] : msg; };
/* Lỗi đồng bộ theo mã lỗi (không theo chữ: lỗi bản ghi quá lớn cũng có chữ hn_items trong câu) */
function syncErr(e) {
  const code = String((e && e.code) || ""), msg = String((e && (e.message || e.error_description)) || e || "");
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(code) || (!code && /(?:relation|function)\s.*(?:hn_items|hn_push).*does not exist|Could not find the (?:function|table)/i.test(msg)))
    return "Database chưa có bảng hn_items hoặc hàm hn_push. Hãy chạy setup.sql trong Supabase.";
  if (code === "42501" || /row-level security|permission denied/i.test(msg)) return "Tài khoản chưa có quyền ghi dữ liệu. Hãy chạy lại setup.sql trong Supabase.";
  return viErr(msg);
}
/* lỗi của riêng một dòng dữ liệu (quá lớn, sai dạng): tìm dòng đó, các dòng khác vẫn lên */
const rowErr = e => /^2[23]/.test(String((e && e.code) || ""));
const recName = r => { const d = r.data || {}; return String(d.title || d.note || d.name || d.ex || (d.key ? "Cài đặt " + d.key : "") || ({ task: "Việc", tx: "Khoản tiền", class: "Môn học", workout: "Buổi tập", doc: "Thẻ giấy tờ", gymplan: "Giáo án" }[r.kind] || r.kind)).slice(0, 40); };
async function syncNow() {
  if (!sync.sb || !sync.user) { renderSyncBits(); return; }
  if (sync.hold) { sync.state = "hold"; renderSyncBits(); return; }   // chờ chọn gộp hay bắt đầu trống
  if (!navigator.onLine) { sync.state = "offline"; renderSyncBits(); return; }
  if (sync.running) { sync.again = true; return; }
  sync.running = true; sync.state = "syncing"; renderSyncBits();
  let changed = false;
  try {
    // skip: dòng server từ chối (quá lớn, sai dạng) ở đúng bản đó; sửa mục đó (updated_at đổi) thì thử lại
    const skip = LS.get("skip", {}) || {}, bad = [];
    const ids = Object.keys(queue).filter(id => !(db[id] && skip[id] === db[id].updated_at));
    const asRow = r => ({ id: r.id, kind: r.kind, data: r.data, deleted: !!r.deleted, updated_at: r.updated_at });
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200).map(id => db[id]).filter(Boolean);
      const { error } = await sync.sb.rpc("hn_push", { rows: chunk.map(asRow) });
      if (error && rowErr(error)) {
        // một dòng lỗi không được chặn cả lô mãi mãi: đẩy từng dòng, bỏ dòng lỗi ra
        for (const r of chunk) {
          const { error: e1 } = await sync.sb.rpc("hn_push", { rows: [asRow(r)] });
          if (!e1) { if (queue[r.id] === r.updated_at) delete queue[r.id]; }
          else if (rowErr(e1)) { skip[r.id] = r.updated_at; bad.push([r, e1]); }
          else throw e1;
        }
        LS.set("skip", skip); persist(); continue;
      }
      if (error) throw error;
      for (const r of chunk) if (queue[r.id] === r.updated_at) delete queue[r.id];
      persist();
    }
    for (const id in skip) if (!db[id] || skip[id] !== db[id].updated_at || !(id in queue)) delete skip[id];
    LS.set("skip", skip);
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
    const stuck = Object.keys(skip).map(id => db[id]).filter(Boolean);
    if (stuck.length) {
      const big = bad.some(([, e]) => String(e.code) === "23514") || !bad.length;
      sync.state = "error";
      sync.msg = `${big ? "Mục quá lớn nên chưa đồng bộ được" : "Máy chủ không nhận mục"}: ${stuck.slice(0, 3).map(recName).join(", ")}${stuck.length > 3 ? ` và ${stuck.length - 3} mục khác` : ""}. ${big ? "Hãy rút gọn ghi chú hoặc nội dung của mục đó." : "Hãy sửa lại mục đó."} Các mục khác vẫn đồng bộ bình thường.`;
    }
    gcTombstones();
  } catch (e) {
    sync.state = "error";
    sync.msg = syncErr(e);
  } finally {
    sync.running = false;
    if (changed) { persist(); render(); }
    renderSyncBits();
    if (sync.again) { sync.again = false; setTimeout(syncNow, 300); }
  }
}
/* Dọn bản ghi đã xóa (tombstone) trên máy. Chỉ bỏ bản ghi thỏa cả bốn điều kiện:
   1. đang đăng nhập và dữ liệu trên máy thuộc đúng tài khoản này (hn-owner), vừa đồng bộ xong không lỗi;
   2. không còn trong hàng chờ: lệnh xóa đã được server nhận (queue chỉ mất id khi hn_push thành công với đúng
      updated_at đó, hoặc khi chính server gửi bản này về). Máy chưa từng đăng nhập thì queue giữ mọi id, nên không dọn gì;
   3. bị xóa từ hơn 60 ngày trước (theo updated_at), để máy khác offline lâu vẫn kịp nhận lệnh xóa từ server;
   4. tối đa một lần mỗi ngày.
   Server vẫn giữ tombstone, nên máy khác hay lần kéo lại từ đầu (đổi tài khoản) vẫn biết mục đó đã xóa; kéo về lại thì
   chỉ sinh lại tombstone, không làm sống lại mục cũ. Không có SQL nào xóa tombstone trên server: nếu sau này thêm,
   phải giữ lâu hơn 60 ngày của máy. Trả về số bản ghi đã dọn. */
const GC_DAYS = 60;
function gcTombstones(force) {
  if (!sync.user || LS.get("owner", null) !== sync.user.id) return 0;
  const now = Date.now();
  if (!force && now - (+LS.get("gcAt", 0) || 0) < 864e5) return 0;
  const cut = now - GC_DAYS * 864e5;
  let n = 0;
  for (const id of Object.keys(dbRaw)) {
    const r = dbRaw[id];
    if (r && r.deleted === true && !(id in queue) && Date.parse(r.updated_at) < cut) { delete db[id]; n++; }
  }
  LS.set("gcAt", now);
  if (n) { LS.set("gcN", (+LS.get("gcN", 0) || 0) + n); persist(); }
  return n;
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
    case "wait": return "Đang tải phần đồng bộ…";
    case "out": return "Chưa đăng nhập, dữ liệu chỉ ở máy này";
    case "syncing": return "Đang đồng bộ…";
    case "offline": return "Đang offline, sẽ đồng bộ khi có mạng";
    case "pending": return "Còn thay đổi chưa gửi lên";
    case "hold": return "Chưa đồng bộ: hãy chọn gộp dữ liệu trên máy hay bắt đầu trống";
    case "error": return "Lỗi đồng bộ: " + sync.msg;
    default: return when ? "Đã đồng bộ lúc " + when : "Đã đồng bộ";
  }
}
function syncColor() {
  return { ok: "var(--gym)", syncing: "var(--cls)", wait: "var(--cls)", pending: "var(--warn)", offline: "var(--warn)", error: "var(--danger)", out: "var(--warn)", hold: "var(--warn)" }[sync.state] || "transparent";
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
  calView: LS.get("calView", "month"),
  calMonth: "",
  calSel: "",
  month: today().slice(0, 7),
  gymEx: null,
  gymView: LS.get("gymView", "week") === "month" ? "month" : "week",   // lịch tập: Tuần | Tháng, nhớ theo máy
  gymWk: 0,       // tuần đang xem, tính từ tuần này (-1 = tuần trước)
  gymMonth: "",   // tháng đang xem "YYYY-MM", rỗng = tháng này
  moveId: null,   // việc đang dời bằng cách bấm ô trên lịch tháng (startMovePick)
};
const TABS = [
  ["home", "Hôm nay", I.home, "var(--fg)"],
  ["task", "Việc", I.task, "var(--task)"],
  ["cal", "Lịch", I.cal, "var(--cls)"],
  ["money", "Tiền", I.money, "var(--money)"],
  ["gym", "Tập", I.gym, "var(--gym)"],
];
const tabColor = t => (TABS.find(x => x[0] === t) || TABS[0])[3];
/* Tuần mở mặc định ở dạng Tuần: tối Chủ nhật (từ 18h) tuần này đã học xong, nên mở luôn tuần tới */
function calWeekReset() {
  const n = new Date();
  if (n.getDay() === 0 && n.getHours() >= 18) { ui.calWeek = 1; ui.calDay = 1; }
  else { ui.calWeek = 0; ui.calDay = n.getDay(); }
}
/* Mở dạng Tuần ở đúng tuần (và thứ) của ngày `d` */
function calWeekOf(d) { ui.calWeek = Math.round(dayDiff(weekStart(d), weekStart(today())) / 7); ui.calDay = parseYmd(d).getDay(); }
calWeekReset();

/* ================= data helpers ================= */
const classActive = (c, day) => !(c.data.weeks && c.data.weeks.length) || c.data.weeks.includes(isoWeek(day));
function classesOn(dow, day) {
  return all("class").filter(c => (c.data.days || []).includes(dow) && (!day || classActive(c, day))).sort((a, b) => (toMin(a.data.start) || 0) - (toMin(b.data.start) || 0));
}
const byDue = (a, b) => (a.data.due || "9999") .localeCompare(b.data.due || "9999") || (a.data.time || "99").localeCompare(b.data.time || "99");
/* ngày/tháng, thêm năm khi khác năm nay ("15/10/2027") */
const dmy = s => dm(s) + (String(s).slice(0, 4) !== today().slice(0, 4) ? "/" + String(s).slice(0, 4) : "");
function dueInfo(t) {
  if (!t.due) return { text: "", cls: "" };
  const d = dayDiff(t.due, today());
  const time = t.time ? " " + t.time : "";
  if (t.status === "done") return { text: dmy(t.due), cls: "" };
  if (d < 0) return { text: `Quá hạn ${-d} ngày`, cls: "red" };
  if (d === 0) return { text: "Hôm nay" + time, cls: "red" };
  if (d === 1) return { text: "Ngày mai" + time, cls: "amber" };
  if (d < 7) return { text: `${DOWL[parseYmd(t.due).getDay()]} ${dm(t.due)}${time}`, cls: d <= 3 ? "amber" : "" };
  return { text: dmy(t.due) + time, cls: "" };
}
/* Các khoản hay chi lặp lại trong 60 ngày → ghi nhanh 1 chạm.
   Gộp theo ghi chú + loại (cơm 35k và cơm 40k là một khoản), lấy số tiền hay gặp nhất (bằng nhau thì lấy lần gần nhất).
   Xếp theo số lần, nhân thêm độ hợp giờ: khoản thường ghi quanh giờ này (±2 tiếng) lên trước, sáng cà phê, trưa cơm.
   Khoản ngày nào cũng chỉ ghi một lần mà hôm nay đã ghi rồi thì xuống cuối. Kết quả nhớ theo dữ liệu, ngày và giờ. */
let combosKey = null, combosVal = null;
function combos() {
  const now = new Date(), td = today(), hr = now.getHours();
  const arr = IDX_ARR.get("tx") || (all("tx"), IDX_ARR.get("tx"));
  if (combosKey && combosKey[0] === arr && combosKey[1] === td && combosKey[2] === hr) return combosVal.slice();
  const since = addDays(td, -60), m = {};
  for (const r of arr) {
    const x = r.data; if (x.type === "in" || !x.note || !(x.amount > 0) || (x.date || "") < since) continue;
    const k = `${norm(x.note).trim()}|${x.cat}`;
    const c = m[k] || (m[k] = { note: x.note, cat: x.cat, n: 0, last: 0, amt: new Map(), near: 0, days: new Set(), today: false });
    const at = x.at || Date.parse(r.updated_at) || 0;
    c.n++; c.days.add(x.date); if (x.date === td) c.today = true;
    const a = c.amt.get(x.amount) || { n: 0, last: 0 }; a.n++; a.last = Math.max(a.last, at); c.amt.set(x.amount, a);
    if (at > c.last) { c.last = at; c.note = x.note; }
    if (at) { const d = Math.abs(new Date(at).getHours() - hr); if (Math.min(d, 24 - d) <= 2) c.near++; }
  }
  combosVal = Object.values(m).filter(c => c.n >= 2).map(c => {
    const amount = [...c.amt.entries()].sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last)[0][0];
    const once = c.days.size === c.n;   // chưa bao giờ ghi hai lần một ngày
    const score = c.n * (0.35 + c.near / c.n) * (c.today && once ? 0.15 : 1);
    return { note: c.note, amount, cat: c.cat, n: c.n, last: c.last, score };
  }).sort((a, b) => b.score - a.score || b.last - a.last).slice(0, 6);
  combosKey = [arr, td, hr];
  return combosVal.slice();
}
function quickTx(c) {
  const r = put("tx", { type: "out", amount: c.amount, cat: c.cat, note: c.note, date: today(), at: Date.now() });
  buzz();
  toast(`Đã ghi ${c.note} ${moneyShort(c.amount)}`, { label: "Hoàn tác", fn: () => remove(r.id) });
}
/* Khoản thu chi theo tháng, nhóm một lần cho tới khi có khoản nào đổi (mảng trong chỉ mục đổi thì nhóm lại) */
let txMonthsOf = null, txMonths = null;
function monthTx(month) {
  let arr = IDX_ARR.get("tx");
  if (!arr) { all("tx"); arr = IDX_ARR.get("tx"); }
  if (txMonthsOf !== arr) {
    txMonths = new Map();
    for (const r of arr) { const k = (r.data.date || "").slice(0, 7); let a = txMonths.get(k); if (!a) txMonths.set(k, a = []); a.push(r); }
    txMonthsOf = arr;
  }
  return (txMonths.get(month) || []).slice();
}
/* Khoản chi cố định (tiền nhà, điện nước, internet, khoản phải trả, khoản trùng tên việc lặp lại): mỗi tháng một lần, không ngoại suy theo ngày */
const FIXED_CATS = ["nha", "hoadon"];
const FIXED_NOTE = /\b(tien (nha|phong|tro|dien|nuoc|mang|net|wifi|internet)|thue (nha|phong|tro)|dien nuoc|hoa don|internet|wifi|hoc phi|tra gop|bao hiem)\b/;
function fixedTest() {
  const rep = new Set(all("task").filter(t => t.data.repeat && t.data.title).map(t => norm(t.data.title).trim()));
  return x => { const n = norm(x.note).trim(); return FIXED_CATS.includes(x.cat) || !!x.fromTask || FIXED_NOTE.test(n) || rep.has(n); };
}
function monthForecast(month) {
  const [y, m] = month.split("-").map(Number), daysIn = new Date(y, m, 0).getDate();
  const daysPassed = month === today().slice(0, 7) ? new Date().getDate() : daysIn;
  const fx = fixedTest();
  let fixed = 0, variable = 0;
  monthTx(month).filter(r => r.data.type !== "in" && r.data.cat !== "tietkiem").forEach(r => {
    if (fx(r.data)) fixed += r.data.amount || 0; else variable += r.data.amount || 0;
  });
  const bills = billsLeft(month).reduce((s, t) => s + t.data.amount, 0);
  return { fixed, variable, bills, proj: Math.round(fixed + variable / Math.max(1, daysPassed) * daysIn + bills) };
}
/* Khoản phải trả (việc có số tiền) chưa xong, hạn trong tháng `month` hoặc đã quá hạn, chỉ tính cho tháng hiện tại.
   Đã có khoản chi trong tháng ghi cho việc đó (fromTask) hay trùng tên và số tiền (ghi tay mà quên đánh dấu xong) thì coi là đã trả. */
function billsLeft(month) {
  if (month !== today().slice(0, 7)) return [];
  const end = `${month}-31`, txs = monthTx(month).filter(r => r.data.type !== "in");
  const paid = t => txs.some(r => r.data.fromTask === t.id || (r.data.amount === t.data.amount && norm(r.data.note).trim() === norm(t.data.title).trim()));
  return all("task").filter(t => t.data.status !== "done" && t.data.amount > 0 && t.data.due && t.data.due <= end && t.data.cat !== "tietkiem" && !paid(t));
}
/* Ngân sách còn lại của tháng hiện tại, đã trừ khoản sắp phải trả: { budget, out, bills, left, perDay, daysLeft } hoặc null */
function budgetLeft() {
  const budget = +getSetting("budget", 0) || 0; if (!budget) return null;
  const month = today().slice(0, 7), [y, m] = month.split("-").map(Number);
  const out = sumOut(monthTx(month)), bills = billsLeft(month).reduce((s, t) => s + t.data.amount, 0);
  const daysLeft = new Date(y, m, 0).getDate() - new Date().getDate() + 1, left = budget - out - bills;
  return { budget, out, bills, left, daysLeft, perDay: left > 0 ? left / daysLeft : 0 };
}
/* Chi tuần này (thứ Hai tới hôm nay) và cùng kỳ tuần trước (thứ Hai tới cùng thứ đó), không tính khoản cố định
   (tiền nhà, hóa đơn, khoản phải trả): tiền nhà rơi vào tuần nào thì tuần đó luôn "chi nhiều hơn", so sánh vô nghĩa */
function weekSpend() {
  const td = today(), ws = weekStart(td), pws = addDays(ws, -7), ptd = addDays(td, -7);
  const months = new Set([ws, td, pws, ptd].map(d => d.slice(0, 7)));
  let cur = 0, prev = 0; const fx = fixedTest();
  for (const k of months) for (const r of monthTx(k)) {
    const x = r.data; if (x.type === "in" || x.cat === "tietkiem" || !(x.date >= pws && x.date <= td) || fx(x)) continue;
    if (x.date >= ws && x.date <= td) cur += x.amount || 0; else if (x.date >= pws && x.date <= ptd) prev += x.amount || 0;
  }
  return { cur, prev };
}
const sumOut = list => list.filter(r => r.data.type !== "in" && r.data.cat !== "tietkiem").reduce((s, r) => s + (r.data.amount || 0), 0);
const sumSave = list => list.filter(r => r.data.type !== "in" && r.data.cat === "tietkiem").reduce((s, r) => s + (r.data.amount || 0), 0);
const sumIn = list => list.filter(r => r.data.type === "in").reduce((s, r) => s + (r.data.amount || 0), 0);
const sessions = () => all("workout").sort((a, b) => (b.data.date || "").localeCompare(a.data.date || "") || Date.parse(b.updated_at) - Date.parse(a.updated_at));
const exTotal = (s, ex) => (s.data.items || []).filter(i => i.ex === ex).reduce((t, i) => t + (i.sets || []).reduce((a, b) => a + (+b || 0), 0), 0);

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
/* Vẽ lại cả màn hình. Giữ vị trí cuộn (khi vẫn ở tab cũ) và phần tử đang focus (tìm lại theo id, name, data-*).
   Lỗi khi vẽ (dữ liệu lạ từ máy khác, file sao lưu) không để trang trắng: hiện thông báo kèm nút tải bản sao lưu và tải lại,
   thanh tab vẫn dùng được; lỗi vẫn được báo ra console (reportError) để kiểm thử bắt được. */
let renderedTab = null;
function render() {
  try { renderView(); }
  catch (e) {
    try { window.reportError ? reportError(e) : console.error(e); } catch {}
    const main = $("#main"), nav = $("#nav"); if (!main) return;
    main.innerHTML = `<section class="card crash" role="alert" style="--c:var(--danger)"><div class="card-h"><h2><i></i>Màn hình này đang gặp lỗi</h2></div>
      <div class="small">Dữ liệu của bạn vẫn còn trên máy. Hãy tải bản sao lưu để giữ an toàn, rồi thử tải lại app hoặc chuyển sang tab khác.</div>
      <div class="small mut" style="margin-top:6px;overflow-wrap:anywhere">Chi tiết: ${esc((e && e.message) || e)}</div>
      <div class="btns wrap"><button class="btn" data-act="export">Tải bản sao lưu</button><button class="btn pri" data-act="reload">Tải lại</button></div></section>`;
    try { if (nav) nav.innerHTML = `<div class="nav-in" style="grid-template-columns:repeat(${TABS.length},1fr)">${TABS.map(([k, label, icon, c]) => `<button class="${ui.tab === k ? "on" : ""}" data-tab="${k}" style="--c:${c}">${icon}<span>${label}</span></button>`).join("")}</div>`; } catch {}
  }
}
function renderView() {
  const main = $("#main"), nav = $("#nav");
  if (!main) return;
  rebuildCats();
  const tabs = TABS.filter(t => t[0] !== "gym" || mod("gym"));
  if (!tabs.some(t => t[0] === ui.tab)) ui.tab = "home";
  const ae = document.activeElement;
  const fk = ae && ae !== document.body && (main.contains(ae) || (nav && nav.contains(ae))) ? focusKey(ae) : null;
  const fi = fk ? $$(fk).indexOf(ae) : -1;
  let sel = null; try { if (fk && typeof ae.selectionStart === "number") sel = [ae.selectionStart, ae.selectionEnd]; } catch {}
  const sy = window.scrollY, sameTab = renderedTab === ui.tab;
  const v = { home: viewHome, task: viewTasks, cal: viewCal, money: viewMoney, gym: viewGym }[ui.tab] || viewHome;
  main.innerHTML = v();
  const qi = $("#qIn");
  if (qi) { qi.value = ui.qText || ""; quickPreview(); }
  nav.innerHTML = `<div class="nav-in" style="grid-template-columns:repeat(${tabs.length},1fr)">${tabs.map(([k, label, icon, c]) =>
    `<button class="${ui.tab === k ? "on" : ""}" data-tab="${k}" style="--c:${c}"${ui.tab === k ? ' aria-current="page"' : ""}>${icon}<span>${label}</span></button>`).join("")}</div>`;
  const fab = $("#fab");
  fab.style.setProperty("--c", ui.tab === "home" ? "var(--fg)" : tabColor(ui.tab));
  fab.style.setProperty("--on-c", ui.tab === "home" ? "var(--bg)" : "var(--on-accent)");
  fab.innerHTML = I.plus;
  fab.setAttribute("aria-label", "Thêm");
  a11yEnhance(main);
  if (fk) {
    const el = $$(fk)[fi] || $(fk);
    if (el) try { el.focus({ preventScroll: true }); if (sel && el.setSelectionRange) el.setSelectionRange(sel[0], sel[1]); } catch {}
  }
  if (sameTab && window.scrollY !== sy) window.scrollTo(0, sy);
  renderedTab = ui.tab;
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
  const td = today(), lu = LUNAR.of(td), ho = LUNAR.holiday(td);
  return `${name ? `${g}, ${esc(name)}` : g} · ${lu.d}/${lu.m}${lu.leap ? " nhuận" : ""} âm lịch${ho ? ` · ${esc(ho[0])}` : ""}`;
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
    t.tag && !norm(t.title).includes(norm(t.tag)) && `<span class="chip c-task">${esc(t.tag)}</span>`,   // tên đã có môn (VD bài thi) thì không lặp lại
    t.type && t.type !== "bai" && t.type !== "khac" && `<span class="chip ${t.type === "thi" ? "c-danger" : ""}">${esc(typeName(t.type))}</span>`,
    t.amount > 0 && `<span class="chip c-money">${moneyShort(t.amount)}</span>`,
    due.text && `<span class="${due.cls}">${esc(due.text)}</span>`,
    t.status === "waiting" && `<span class="amber">Chờ: ${esc(t.waitFor || "phản hồi")}</span>`,
    t.repeat && `<span>↻ ${esc(REPEAT_NAME[t.repeat] || "")}</span>`,
    t.due && String(t.repeat || "").startsWith("lunar-") && `<span>${esc(LUNAR.text(t.due))} âm</span>`,
    subs.length && `<span>${subDone}/${subs.length} phần</span>`,
  ].filter(Boolean).join("");
  return `<div class="row tap" data-edit="task" data-id="${r.id}">
    <button class="check ${t.status === "done" ? "on" : t.status === "waiting" ? "wait" : ""}" data-act="toggle-task" data-id="${r.id}" aria-label="Xong"></button>
    <div class="grow"><div class="t" ${t.status === "done" ? 'style="text-decoration:line-through;opacity:.6"' : ""}>${esc(t.title)}</div>${meta ? `<div class="m">${meta}</div>` : ""}</div>
    ${t.status !== "done" ? `<button class="more-btn" data-act="task-more" data-id="${r.id}" aria-label="Dời ngày, thao tác khác">${I.more}</button>` : ""}
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
  const SOON = 7;   // "Sắp tới hạn" nhìn 7 ngày: hạn nộp tuần sau vừa thêm vẫn hiện trên trang Hôm nay
  const urgent = open.filter(t => t.data.status === "todo" && t.data.due && dayDiff(t.data.due, td) <= SOON).sort(byDue);
  const waiting = open.filter(t => t.data.status === "waiting").sort(byDue);
  const laterCount = open.filter(t => t.data.status === "todo" && t.data.due && dayDiff(t.data.due, td) > SOON).length;
  // việc chưa có hạn: hiện vài việc mới nhất dưới thẻ, không để chìm mất (trước đây chỉ có "Còn N việc khác")
  const noDue = open.filter(t => t.data.status === "todo" && !t.data.due).sort((a, b) => (b.data.createdAt || Date.parse(b.updated_at) || 0) - (a.data.createdAt || Date.parse(a.updated_at) || 0));
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

  // chưa có việc nào: chỉ cách thêm bằng một câu (bấm là điền sẵn vào ô ghi nhanh)
  const firstEx = { sv: "nộp BTL thứ 6 23h59", hs: "làm bài tập Toán thứ 6" }[persona()] || "họp 9h sáng thứ 2";
  const todoHtml = urgent.length
    ? urgent.filter(t => !examIds.has(t.id)).slice(0, 6).map(taskRow).join("") || `<div class="empty">Ngoài lịch thi ở trên, không có gì gấp trong 7 ngày tới.</div>`
    : !all("task").length ? `<div class="empty">Chưa có việc nào. Gõ vào ô ở trên, ví dụ <button class="link" data-act="qfill" data-v="${esc(firstEx)}">${esc(firstEx)}</button></div>`
    : `<div class="empty">Không có gì đến hạn trong 7 ngày tới.${laterCount ? ` Còn ${laterCount} việc hạn xa hơn.` : ""}</div>`;
  const overdue = urgent.filter(t => t.data.due < td).length;

  // có việc quá hạn, hạn hôm nay hoặc mai (ngoài lịch thi) thì thẻ Sắp tới hạn lên ngay dưới ô ghi nhanh
  const hot = urgent.some(t => !examIds.has(t.id) && dayDiff(t.data.due, td) <= 1);
  const taskCard = `<section class="card" style="--c:var(--task)">
    <div class="card-h"><h2><i></i>Sắp tới hạn</h2><button class="link" data-tab="task">${open.length ? `Tất cả (${open.length})` : "Mở"}</button></div>
    <div class="list">${todoHtml}</div>
    ${overdue >= 2 ? `<div class="ovd"><span class="red">${overdue} việc quá hạn</span><button class="link" data-act="move-overdue">Dời hết sang hôm nay</button></div>` : ""}
    ${waiting.length ? `<div class="group-h" style="margin:12px 0 2px">Đang chờ người khác <span>${waiting.length}</span></div><div class="list">${waiting.slice(0, 4).map(taskRow).join("")}</div>` : ""}
    ${noDue.length ? `<div class="group-h" style="margin:12px 0 2px" data-nodue>Chưa có hạn <span>${noDue.length}</span></div><div class="list">${noDue.slice(0, 3).map(taskRow).join("")}</div>` : ""}
  </section>`;
  // bấm nút dùng đúng danh sách đang hiện (thứ tự đổi theo giờ); vừa bấm xong thì giữ nguyên thứ tự 10 giây để bấm tiếp không trượt sang nút khác
  const cmb = ui.cmb = ui.cmb && ui.cmbHold > Date.now() ? ui.cmb : combos().slice(0, 4);
  return header(`${DOWL[now.getDay()]}, ${pad(now.getDate())}/${pad(now.getMonth() + 1)}`, greeting()) + `
  <div class="qbox">
    <div class="qin"><span class="q-lead">${I.plus}</span><input id="qIn" type="text" enterkeyhint="done" autocomplete="off" autocapitalize="sentences" placeholder="Gõ nhanh: cà phê 30k, họp 9h mai…" aria-label="Ghi nhanh bằng một câu">
      ${SR ? `<button class="mic" data-act="mic" aria-label="Nói để ghi">${I.mic}</button>` : ""}</div>
    <div class="qprev" id="qPrev"></div>
  </div>
  ${hot ? taskCard : ""}
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
  ${sync.user && pushOK() && (!isIOS || isStandalone()) && Notification.permission === "default" && !LS.get("pushNudge", 0) && open.some(t => t.data.due) ? `<div class="banner nudge"><span>🔔 Bật thông báo để được nhắc trước hạn, kể cả khi tắt app.</span><span style="display:flex;gap:12px;margin-top:6px"><button class="link small" data-act="push-nudge" style="--c:var(--cls)">Bật ngay</button><button class="link small" data-act="push-later" style="--c:var(--mut)">Để sau</button></span></div>` : ""}
  ${hot ? "" : taskCard}
  <section class="card tap" style="--c:var(--money);cursor:pointer" data-tab="money">
    <div class="card-h"><h2><i></i>Chi tiêu</h2><span class="link">Chi tiết</span></div>
    <div class="spendrow">
      <div><div class="small mut">Hôm nay</div><div class="big num">${money(outToday)}</div></div>
      <div style="text-align:right"><div class="small mut">Tháng ${now.getMonth() + 1}</div><div class="num" style="font-weight:600">${money(outMonth)}${budget ? ` <span class="mut small">/ ${moneyShort(budget)}</span>` : ""}</div></div>
    </div>
    ${budget ? `<div class="mbar ${outMonth > budget ? "over" : ""}" style="margin-top:10px"><i style="width:${Math.min(100, outMonth / budget * 100)}%"></i></div>` : ""}
    ${spendLine()}
    ${cmb.length ? `<div class="combos" aria-label="Ghi nhanh">${cmb.map((c, i) => `<button data-act="combo" data-i="${i}">+ ${esc(c.note)} ${esc(moneyShort(c.amount))}</button>`).join("")}</div>` : ""}
  </section>
  ${mod("gym") ? `<section class="card tap" style="--c:var(--gym);cursor:pointer" data-act="gym-day" data-date="${esc(td)}">
    <div class="card-h"><h2><i></i>Tập luyện</h2><button class="link" data-tab="gym">${weekDays.size} buổi tuần này</button></div>
    <div class="small gline" data-hometoday>${gymTodayLine(td)}</div>
    ${weekGrid(ws, weekDays)}
    <div class="small mut" style="margin-top:8px">${last ? `Buổi gần nhất: ${last.data.date === td ? "hôm nay" : dayDiff(td, last.data.date) === 1 ? "hôm qua" : dm(last.data.date)} · ${esc(sessionSummary(last))}` : "Chưa ghi buổi tập nào."}</div>
  </section>` : ""}
  <div class="foot" data-synclabel></div>`;
}
/* Dòng dưới thẻ Chi tiêu: tuần này so với cùng kỳ tuần trước, và mỗi ngày còn tiêu được bao nhiêu (đã trừ khoản sắp phải trả) */
function spendLine() {
  const w = weekSpend(), bl = budgetLeft(), d = w.cur - w.prev;
  // khoản cố định không tính; tuần trước tính tới cùng thứ để so cho công bằng
  const week = w.cur || w.prev ? `Tuần này tiêu <b class="num" style="color:var(--fg)">${esc(moneyShort(w.cur))}</b>${w.prev ? ` (${Math.abs(d) < 1000 ? "bằng tuần trước" : `<span class="${d > 0 ? "red" : "green"}">${d > 0 ? "+" : "−"}${esc(moneyShort(Math.abs(d)))}</span> so với tuần trước`})` : ""}` : "";
  let day = "";
  if (bl) day = bl.left > 0 ? `còn ~<b class="num" style="color:var(--fg)">${esc(moneyShort(bl.perDay))}</b>/ngày${bl.bills ? `, đã trừ ${esc(moneyShort(bl.bills))} sắp trả` : ""}`
    : bl.out > bl.budget ? `<span class="red">vượt ngân sách ${esc(moneyShort(bl.out - bl.budget))}</span>`
    : bl.bills ? `<span class="red">khoản sắp trả ${esc(moneyShort(bl.bills))} sẽ làm vượt ngân sách</span>`
    : `<span class="red">đã tiêu hết ngân sách tháng</span>`;
  const parts = [week, day].filter(Boolean);
  return parts.length ? `<div class="small mut spendline">${parts.join(" · ")}</div>` : "";
}
function weekGrid(ws, doneSet) {
  const td = today();
  return `<div class="week">${[0, 1, 2, 3, 4, 5, 6].map(i => {
    const d = addDays(ws, i);
    return `<div>${DOW[parseYmd(d).getDay()]}<i class="${doneSet.has(d) ? "on" : ""} ${d === td ? "today" : ""}"></i></div>`;
  }).join("")}</div>`;
}
function sessionSummary(s) {
  const by = {}, notes = {};
  for (const it of s.data.items || []) { by[it.ex] = (by[it.ex] || 0) + (it.sets || []).reduce((a, b) => a + (+b || 0), 0); if (it.note && !notes[it.ex]) notes[it.ex] = String(it.note); }
  // bài chưa có hiệp nào (chạy 5km ghi nhanh không có phút): hiện ghi chú thay cho số 0
  const parts = Object.entries(by).map(([ex, n]) => n ? `${ex} ${n} ${exUnit(ex)}` : notes[ex] ? `${ex} (${notes[ex]})` : ex);
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
    body = groups.map(([name, fn, cls], gi) => {
      const list = todo.filter(fn).sort(byDue);
      if (!list.length) return "";
      // nhóm Quá hạn: dời cả nhóm sang hôm nay bằng một chạm (có Hoàn tác)
      const act = gi === 0 ? `<button class="link" data-act="move-overdue" style="--c:var(--danger)">Dời hết sang hôm nay</button>` : "";
      return `<div class="group-h ${cls || ""}${act ? " has-act" : ""}">${name}<span>${act ? `${list.length} · ` : list.length}${act}</span></div><div class="card list">${list.map(taskRow).join("")}</div>`;
    }).join("") || `<div class="card empty">Hết việc rồi. Bấm + để thêm việc mới, ${persona() === "sv" ? "hạn nộp BTL, hoặc đơn đang chờ duyệt" : persona() === "hs" ? "hạn nộp bài, lịch kiểm tra" : "hạn công việc, hóa đơn cần trả, hoặc giấy tờ đang chờ"}.</div>`;
    if (todo.length) body += `<div class="hint tip">Mẹo: giữ lâu một việc hoặc bấm ⋯ để dời ngày, kể cả chọn ngày mới ngay trên lịch.</div>`;
  } else if (f === "waiting") {
    body = waiting.length
      ? `<div class="card list">${waiting.sort(byDue).map(taskRow).join("")}</div><div class="hint" style="margin:0 4px">${isStudent() ? "Đơn từ, email đã gửi mà còn chờ thầy cô hay phòng ban trả lời." : "Email, hồ sơ đã gửi mà còn chờ người khác hay cơ quan trả lời."}</div>`
      : `<div class="card empty">Không có việc nào đang chờ người khác.</div>`;
  } else {
    // vẽ 60 việc một lần cho nhanh, "Xem thêm" để xem tiếp
    const lim = ui.doneN || 60, list = done.sort((a, b) => (b.data.doneAt || 0) - (a.data.doneAt || 0)).slice(0, lim);
    body = list.length ? `<div class="card list">${list.map(taskRow).join("")}</div>${done.length > lim ? `<button class="btn block" data-act="done-more">Xem thêm (còn ${done.length - lim} việc)</button>` : ""}` : `<div class="card empty">Chưa có việc nào xong.</div>`;
  }
  return header("Việc", `${todo.length} cần làm · ${waiting.length} đang chờ`) + `
    <div class="seg">
      <button class="${f === "todo" ? "on" : ""}" data-filter="todo">Cần làm${todo.length ? ` (${todo.length})` : ""}</button>
      <button class="${f === "waiting" ? "on" : ""}" data-filter="waiting">Đang chờ${waiting.length ? ` (${waiting.length})` : ""}</button>
      <button class="${f === "done" ? "on" : ""}" data-filter="done">Đã xong</button>
    </div>${body}`;
}

/* ---------- Lịch tháng (kiểu Google Calendar) ---------- */
function dayEvents(d, byDue, ghosts) {
  const ev = [];
  const h = LUNAR.holiday(d);
  if (h) ev.push({ k: h[1] ? "hol" : "fest", t: h[0], time: "" });
  for (const t of byDue[d] || []) {
    const x = t.data;
    ev.push({ k: x.type === "thi" ? "exam" : x.amount > 0 ? "bill" : "task", t: x.title, time: x.time || "", end: x.dur ? toHM(toMin(x.time || "00:00") + x.dur) : "", id: t.id, done: x.status === "done", sub: [x.amount > 0 && moneyShort(x.amount), x.note && x.type === "thi" ? x.note : ""].filter(Boolean).join(" · ") });
  }
  // lần lặp sau của việc lặp lại: chỉ để xem (mờ), bấm mở việc gốc, không có bản ghi riêng
  for (const t of (ghosts && ghosts[d]) || []) {
    const x = t.data;
    ev.push({ k: x.type === "thi" ? "exam" : x.amount > 0 ? "bill" : "task", ghost: true, t: x.title, time: x.time || "", id: t.id, sub: ["Lần lặp sau", x.amount > 0 && moneyShort(x.amount)].filter(Boolean).join(" · ") });
  }
  if (mod("cal")) classesOn(parseYmd(d).getDay(), d).forEach(c => ev.push({ k: "cls", t: c.data.title, time: c.data.start, end: c.data.end, id: c.id, sub: [c.data.room && "Phòng " + c.data.room, (c.data.absent || []).includes(d) && "Vắng"].filter(Boolean).join(" · ") }));
  const rank = { hol: 0, fest: 0, exam: 1, bill: 2, task: 3, cls: 4 };
  return ev.sort((a, b) => (a.ghost ? 1 : 0) - (b.ghost ? 1 : 0) || (a.time ? 1 : 0) - (b.time ? 1 : 0) || (a.time || "").localeCompare(b.time || "") || rank[a.k] - rank[b.k]);
}
/* Các lần lặp sau (chưa có bản ghi) của việc lặp lại chưa xong, trong khoảng [from, to]: { ngày: [việc gốc] }.
   Bỏ lặp hằng ngày (ô nào cũng có, chỉ làm rối), tôn trọng `until`, không trùng ngày đã có bản ghi cùng chuỗi, giới hạn vòng lặp. */
function repeatGhosts(from, to) {
  const out = {}, tasks = all("task"), real = new Set(tasks.map(t => `${t.data.series || t.id}|${t.data.due}`));
  for (const t of tasks) {
    const x = t.data;
    if (x.status === "done" || !x.due || !x.repeat || x.repeat === "day" || !REPEAT_NAME[x.repeat] || x.due > to) continue;
    const anchor = DAY_REPEATS.includes(x.repeat) ? (+x.day || anchorDay(x.due, x.repeat)) : 0, ser = x.series || t.id;
    let d = x.due;
    for (let g = 0; g < 400; g++) {
      const nd = nextDue(d, x.repeat, anchor); if (!nd || nd <= d) break; d = nd;
      if (d > to || (x.until && d > x.until)) break;
      if (d >= from && !real.has(`${ser}|${d}`)) { (out[d] = out[d] || []).push(t); real.add(`${ser}|${d}`); }
    }
  }
  return out;
}
function viewMonth() {
  const td = today();
  const month = ui.calMonth || td.slice(0, 7), [y, m] = month.split("-").map(Number);
  const first = `${month}-01`, gridStart = weekStart(first);
  const sel = ui.calSel && ui.calSel.slice(0, 7) === month ? ui.calSel : (td.slice(0, 7) === month ? td : first);
  const byDue = {}; all("task").forEach(t => { if (t.data.due) (byDue[t.data.due] = byDue[t.data.due] || []).push(t); });
  const gym = new Set(mod("gym") ? sessions().map(x => x.data.date) : []);
  const spend = {}; all("tx").forEach(r => { if (r.data.type !== "in" && r.data.cat !== "tietkiem") spend[r.data.date] = (spend[r.data.date] || 0) + (r.data.amount || 0); });
  const lastDay = addDays(`${m === 12 ? y + 1 : y}-${pad(m === 12 ? 1 : m + 1)}-01`, -1);
  const weeks = Math.ceil((dayDiff(lastDay, gridStart) + 1) / 7);
  const ghosts = repeatGhosts(gridStart, addDays(gridStart, weeks * 7 - 1));
  // đang dời một việc: bấm ô ngày nào thì việc chuyển sang ngày đó (thay cho kéo thả trên điện thoại)
  const mv = moveTarget();
  let cells = "";
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(gridStart, i), inM = d.slice(0, 7) === month, ev = dayEvents(d, byDue, ghosts), l = LUNAR.of(d);
    // tiết học lặp lại chỉ hiện thành chấm màu; chip chữ dành cho thi, hạn nộp, phải trả, ngày lễ
    const items = ev.filter(e => e.k !== "cls"), dots = ev.filter(e => e.k === "cls");
    const chips = items.length > 2 ? items.slice(0, 1) : items;
    cells += `<button class="mc ${inM ? "" : "out"} ${d === td ? "today" : ""} ${d === sel && !mv ? "sel" : ""} ${mv && mv.data.due === d ? "from" : ""} ${ev.some(e => e.k === "hol") ? "hol" : ""}" data-mday="${d}" aria-label="${mv ? "Dời sang " : ""}${dm(d)}${ev.length ? `, ${ev.length} mục` : ""}">
      <span class="mh"><b class="num">${parseYmd(d).getDate()}</b><i>${l.d === 1 ? `${l.d}/${l.m}` : l.d === 15 ? "Rằm" : l.d}</i></span>
      ${chips.map(e => `<span class="ch k-${e.k} ${e.done ? "done" : ""}${e.ghost ? " ghost" : ""}">${esc(e.t)}</span>`).join("")}${items.length > chips.length ? `<span class="more">+${items.length - chips.length}</span>` : ""}
      ${dots.length ? `<span class="cdots">${dots.slice(0, 5).map(() => "<i></i>").join("")}</span>` : ""}
      ${gym.has(d) ? '<span class="dot"></span>' : ""}</button>`;
  }
  const evSel = dayEvents(sel, byDue, ghosts), lSel = LUNAR.of(sel);
  const agenda = evSel.length ? evSel.map(e => {
    const tag = { hol: "Ngày lễ, nghỉ", fest: "Ngày lễ", exam: isStudent() ? "Thi" : "Quan trọng", bill: "Phải trả", task: "Việc", cls: "Lịch học" }[e.k];
    const open = e.k === "cls" ? `data-cdetail="${e.id}" data-date="${sel}"` : e.id ? `data-edit="task" data-id="${e.id}"` : "";
    return `<div class="ag k-${e.k} ${e.done ? "done" : ""}${e.ghost ? " ghost" : ""} ${open ? "tap" : ""}" ${open}>
      <div class="ag-t num">${e.time ? `${esc(e.time)}${e.end ? `<span>${esc(e.end)}</span>` : ""}` : `<span>Cả ngày</span>`}</div><div class="bar"></div>
      <div class="grow"><div class="t">${esc(e.t)}</div><div class="m">${[tag, e.sub && esc(e.sub)].filter(Boolean).join(" · ")}</div></div>
      ${e.id && e.k !== "cls" && !e.ghost ? `<button class="check ${e.done ? "on" : ""}" data-act="toggle-task" data-id="${e.id}" aria-label="Xong"></button>` : ""}</div>`; }).join("")
    : `<div class="empty">Không có gì trong ngày này. Bấm <b>+</b> để thêm.</div>`;
  const extra = [spend[sel] && `Đã chi ${money(spend[sel])}`, gym.has(sel) && "Có tập luyện"].filter(Boolean).join(" · ");
  return `<div class="month-nav mnav">
      <button data-mmonth="-1" aria-label="Tháng trước">‹</button>
      <div class="wk-mid"><b>Tháng ${m}, ${y}</b><div class="small mut">Năm ${LUNAR.yearName(LUNAR.of(`${month}-15`).y)}${month !== td.slice(0, 7) ? ` · <button class="link small" data-mmonth="0" style="--c:var(--cls)">Hôm nay</button>` : ""}</div></div>
      <button data-mmonth="1" aria-label="Tháng sau">›</button>
    </div>
    ${mv ? `<div class="movebar" role="status"><span>Bấm vào ngày mới cho <b>${esc(mv.data.title)}</b>${mv.data.due ? `<small>Đang ở ${esc(DOW[parseYmd(mv.data.due).getDay()])} ${esc(dm(mv.data.due))}. Đổi tháng bằng nút ‹ ›.</small>` : ""}</span><button class="btn" data-act="move-cancel">Hủy</button></div>` : ""}
    <div class="mgrid${mv ? " moving" : ""}" id="mgrid">${["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map(x => `<div class="mw">${x}</div>`).join("")}${cells}</div>
    <div class="legend">${mod("cal") ? `<span class="lg-cls"><i></i>Học</span>` : ""}<span class="k-exam">${isStudent() ? "Thi" : "Quan trọng"}</span><span class="k-task">Việc</span><span class="k-bill">Phải trả</span><span class="k-hol">Lễ</span>${Object.keys(ghosts).length ? `<span class="k-task ghost">Lần lặp sau</span>` : ""}</div>
    <section class="card" style="--c:var(--cls)">
      <div class="card-h"><h2><i></i>${DOWL[parseYmd(sel).getDay()]}, ${dm(sel)}${sel === td ? " · hôm nay" : ""}</h2><span class="small mut">${lSel.d}/${lSel.m}${lSel.leap ? " nhuận" : ""} âm</span></div>
      ${extra ? `<div class="small mut" style="margin:-4px 0 6px">${extra}</div>` : ""}
      <div class="list">${agenda}</div>
    </section>
    ${mod("cal") ? calActions(all("class")) : ""}`;
}
/* Nút dưới lịch (cả dạng Tháng và Tuần): sinh viên dán TKB/lịch thi MyBK, người khác thêm từng môn */
const calActions = cls => `<div class="btns" style="margin:0 0 12px">${persona() === "sv" ? `<button class="btn" data-act="tkb">Dán thời khóa biểu</button>` : `<button class="btn" data-act="q-class">+ Thêm môn</button>`}${cls.length ? `<button class="btn" data-act="ics">Đưa vào Lịch</button>` : ""}</div>`;

/* Ngày đang chọn trên tab Lịch (ô tháng hoặc thứ trong tuần) */
function calPickDate() {
  const td = today();
  if (!mod("cal") || (ui.calView || "month") === "month") {
    const month = ui.calMonth || td.slice(0, 7);
    return ui.calSel && ui.calSel.slice(0, 7) === month ? ui.calSel : (td.slice(0, 7) === month ? td : `${month}-01`);
  }
  return addDays(addDays(weekStart(td), 7 * (ui.calWeek || 0)), ((ui.calDay ?? new Date().getDay()) + 6) % 7);
}
/* Nút + trên tab Lịch: mặc định thêm việc cho ngày đang chọn, có nút chuyển sang thêm tiết học */
function calAdd(kind = "task", carry = {}) {
  const d = calPickDate();
  if (kind === "class") classForm(null, { days: [parseYmd(d).getDay()], ...(carry.title ? { title: carry.title } : {}) }, { fromDate: d });
  else taskForm(null, { due: d, ...(carry.title ? { title: carry.title } : {}) }, { fromDate: d });
}
const addSwitch = (on, d) => mod("cal") ? `<div class="seg addsw" data-addsw><button type="button" class="${on === "task" ? "on" : ""}" data-k="task">Việc ngày ${dm(d)}</button><button type="button" class="${on === "class" ? "on" : ""}" data-k="class">Tiết học ${DOW[parseYmd(d).getDay()]}</button></div>` : "";
function bindAddSwitch(b, on) {
  const sw = $("[data-addsw]", b); if (!sw) return;
  sw.addEventListener("click", e => { const k = e.target.closest("[data-k]"); if (!k || k.dataset.k === on) return; calAdd(k.dataset.k, { title: $("[name=title]", b).value.trim() }); });
}

/* ---------- Lịch học ---------- */
function viewCal() {
  const view = mod("cal") ? (ui.calView || "month") : "month";
  const seg = mod("cal") ? `<div class="seg"><button class="${view === "month" ? "on" : ""}" data-calview="month">Tháng</button><button class="${view === "week" ? "on" : ""}" data-calview="week">Tuần · thời khóa biểu</button></div>` : "";
  if (view === "month") return header("Lịch", mod("cal") && all("class").length ? "Lịch học, thi, việc và ngày lễ" : "Việc, hạn trả và ngày lễ") + seg + viewMonth();
  return viewWeek(seg);
}
function viewWeek(seg) {
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
  return header("Lịch", allCls.length ? [`${allCls.length} lịch học`, credits && `${credits} tín chỉ`, weeksLeft && `còn ${weeksLeft} tuần`].filter(Boolean).join(" · ") : "Thời khóa biểu học kỳ") + (seg || "") + `
    <div class="month-nav">
      <button data-week="-1" aria-label="Tuần trước">‹</button>
      <div class="wk-mid"><b>Tuần ${wk}${thisWeek ? ' <span class="chip c-cls">Tuần này</span>' : ui.calWeek === 1 ? ' <span class="chip c-cls">Tuần tới</span>' : ""}</b><div class="small mut">${dm(ws)} – ${dm(addDays(ws, 6))}</div>${thisWeek ? "" : `<button class="link small" data-week="0" style="--c:var(--cls)">Về tuần này</button>`}</div>
      <button data-week="1" aria-label="Tuần sau">›</button>
    </div>
    <div class="days">${strip}</div>
    <section class="card" style="--c:var(--cls)">
      <div class="card-h"><h2><i></i>${dayTitle}</h2>${allCls.length ? `<span class="small mut">${sess ? `${sess} buổi · ${(Math.round(mins / 6) / 10).toLocaleString("vi-VN")} giờ cả tuần` : "Cả tuần nghỉ"}</span>` : ""}</div>
      ${list.length ? classRows(list, selDate === td, selDate, clash) : `<div class="empty">${allCls.length ? "Không có tiết." : (persona() === "sv" ? "Chưa có môn nào. Dán thời khóa biểu (MyBK hoặc trang của trường) để nhập cả học kỳ một lần, hoặc bấm + để thêm từng môn." : "Chưa có môn nào. Bấm + để thêm từng môn theo thời khóa biểu.")}</div>`}
    </section>
    ${calActions(allCls)}
    ${allCls.length ? `<div class="group-h">Tất cả lịch học${endDate ? `<span>đến ${dm(endDate)}</span>` : ""}</div><div class="card list">${allCls.sort((a, b) => a.data.title.localeCompare(b.data.title, "vi") || WEEK_ORDER.indexOf((a.data.days || [])[0]) - WEEK_ORDER.indexOf((b.data.days || [])[0])).map(c =>
      `<div class="row tap" data-cdetail="${c.id}" data-date=""><div class="grow"><div class="t">${esc(c.data.title)}${isLab(c.data.title) ? ' <span class="chip c-gym">Thí nghiệm</span>' : ""}${(c.data.absent || []).length ? ` <span class="chip ${absentLevel(c) === "red" ? "c-danger" : ""}">Vắng ${(c.data.absent || []).length}</span>` : ""}</div><div class="m">${[(c.data.days || []).slice().sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b)).map(d => DOW[d]).join(", ") + ` ${esc(c.data.start)}–${esc(c.data.end)}`, c.data.room && esc(c.data.room), c.data.code && esc(c.data.code), esc(occText({ days: c.data.days || [], weeks: c.data.weeks || [] }, td))].filter(Boolean).join(" · ")}</div></div></div>`).join("")}</div>` : ""}`;
}

/* ---------- Tiền ---------- */
/* Danh sách khoản trong tháng chỉ vẽ MONEY_DAYS ngày gần nhất, phần còn lại sau nút "Xem thêm" (giữ render dưới 16ms khi tháng có vài trăm khoản) */
const MONEY_DAYS = 12;
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
  const prevList = monthTx(prevMonth).filter(r => !isCur || +String(r.data.date).slice(8, 10) <= daysPassed), prevOut = sumOut(prevList);
  const prevCat = {};   // cùng kỳ tháng trước theo loại
  prevList.forEach(r => { if (r.data.type !== "in" && r.data.cat !== "tietkiem") prevCat[r.data.cat] = (prevCat[r.data.cat] || 0) + (r.data.amount || 0); });
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
  const fc = isCur && out && daysPassed >= 3 && daysPassed < daysIn ? monthForecast(month) : null, proj = fc ? fc.proj : 0;
  const nowD = new Date(), back = (nowD.getFullYear() - y) * 12 + nowD.getMonth() + 1 - m;
  const endY = back >= 0 && back <= 5 ? nowD.getFullYear() : y, endM = back >= 0 && back <= 5 ? nowD.getMonth() + 1 : m;
  const months6 = Array.from({ length: 6 }, (_, i) => { const d = new Date(endY, endM - 6 + i, 1); const k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; return { k, m: d.getMonth() + 1, v: sumOut(monthTx(k)) }; });
  const fcat = ui.moneyCat && CAT[ui.moneyCat] ? ui.moneyCat : "";   // đang xem riêng một loại (bấm vào dòng trong "Theo loại")
  const shown = fcat ? list.filter(r => r.data.cat === fcat && r.data.type !== "in") : list;
  const byDay = {};
  shown.forEach(r => { (byDay[r.data.date] = byDay[r.data.date] || []).push(r); });
  const bl = isCur ? budgetLeft() : null;
  const dayKeys = Object.keys(byDay).sort().reverse();
  const td = today();

  const budgetLine = budget
    ? `<div class="mbar ${out > budget ? "over" : ""}" style="margin:12px 0 6px"><i style="width:${Math.min(100, out / budget * 100)}%"></i></div>
       <div class="small ${out > budget ? "red" : "mut"}">${out > budget ? `Vượt ngân sách ${money(out - budget)}` : `Còn ${money(budget - out)} trong ngân sách ${esc(moneyShort(budget))}`}${bl && out <= budget
         ? bl.left > 0 ? ` · ~${esc(moneyShort(bl.perDay))}/ngày${bl.bills ? ` sau khi trừ ${esc(moneyShort(bl.bills))} sắp phải trả` : ""}` : bl.bills ? ` · <span class="red">khoản sắp phải trả ${esc(moneyShort(bl.bills))} sẽ làm vượt ngân sách</span>` : "" : ""}</div>`
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
      ${proj ? `<div class="small mut" style="margin-top:6px">Cứ đà này cả tháng chi khoảng <b class="${budget && proj > budget ? "red" : ""}" style="color:${budget && proj > budget ? "" : "var(--fg)"}">${moneyShort(proj)}</b>${budget && proj > budget ? `, vượt ngân sách ${moneyShort(proj - budget)}` : ""}${fc.fixed || fc.bills ? ` (${[fc.fixed && `khoản cố định ${esc(moneyShort(fc.fixed))} chỉ tính một lần`, fc.bills && `đã gồm ${esc(moneyShort(fc.bills))} sắp phải trả`].filter(Boolean).join("; ")})` : ""}</div>` : ""}
      ${cmp != null && out ? `<div class="small mut" style="margin-top:6px">So với ${isCur ? "cùng kỳ " : ""}tháng ${pm.getMonth() + 1}: <b class="${cmp > 0 ? "red" : "green"}">${cmp > 0 ? "+" : ""}${cmp}%</b> (${moneyShort(prevOut)})</div>` : ""}
      ${budget ? `<button class="link small" data-act="budget" style="margin-top:6px">Sửa ngân sách</button>` : ""}
    </section>
    ${isCur && bills.length ? `<section class="card" style="--c:var(--money)"><div class="card-h"><h2><i></i>Sắp phải trả</h2><span class="small mut num">${moneyShort(bills.reduce((s, t) => s + t.data.amount, 0))}</span></div><div class="list">${bills.map(taskRow).join("")}</div></section>` : ""}
    <section class="card" style="--c:var(--money)"><div class="card-h"><h2><i></i>Mục tiêu tiết kiệm</h2><button class="link small" data-act="goal">+ Thêm</button></div>
      ${goals.length ? goals.map(g => { const p = Math.min(100, Math.round((g.data.saved || 0) / Math.max(1, g.data.target) * 100)); return `<div class="goal tap" data-act="goal" data-id="${g.id}"><div class="emo">${esc(g.data.emoji || "🎯")}</div><div class="grow"><div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(g.data.name)}</b><span class="small num ${p >= 100 ? "green" : "mut"}">${p >= 100 ? "Đạt" : p + "%"}</span></div><div class="mbar" style="margin:6px 0 3px"><i style="width:${p}%"></i></div><div class="small mut num">${esc(moneyShort(g.data.saved || 0))} / ${esc(moneyShort(g.data.target))}${goalMeta(g.data)}</div></div></div>`; }).join("")
        : `<div class="empty">Để dành cho laptop, chuyến du lịch hay quỹ khẩn cấp. Bấm + Thêm để bắt đầu.</div>`}
    </section>
    ${months6.some(x => x.v) ? `<section class="card" style="--c:var(--money)"><div class="card-h"><h2><i></i>6 tháng gần đây</h2></div>${monthBars(months6, month)}</section>` : ""}
    ${cats.length ? `<section class="card" style="--c:var(--money)"><div class="card-h"><h2><i></i>Theo loại</h2><button class="link small" data-act="budget">Ngân sách từng loại</button></div>
      <div class="small mut" style="margin:-6px 0 4px">${prevOut ? `Số nhỏ: so với ${isCur ? "cùng kỳ " : ""}tháng ${pm.getMonth() + 1}. ` : ""}Bấm một loại để xem riêng.</div>
      ${cats.map(([k, v]) => { const cb = +catBudget[k] || 0, over = cb && v > cb, dv = v - (prevCat[k] || 0), on = fcat === k;
        const cmpTxt = prevOut && Math.abs(dv) >= 1000 ? `<small class="cmp ${dv > 0 ? "red" : "green"}">${dv > 0 ? "+" : "−"}${esc(moneyShort(Math.abs(dv)))}</small>` : "";
        return `<button type="button" class="cat-row ${on ? "on" : ""}" data-mcat="${esc(k)}" aria-pressed="${on}"><span>${esc((CAT[k] || ["", "Khác", "📦"])[2])} ${esc((CAT[k] || ["", "Khác"])[1])}</span><span class="mbar ${over ? "over" : ""}"><i style="width:${Math.min(100, (cb ? v / cb : v / maxCat) * 100)}%"></i></span><span class="num small ${over ? "red" : ""}">${esc(moneyShort(v))}${cb ? `<span class="mut">/${esc(moneyShort(cb))}</span>` : ""}${cmpTxt}</span></button>`; }).join("")}
    </section>` : ""}
    ${fcat ? (() => { const c = CAT[fcat], tot = sumOut(shown), pv = prevCat[fcat] || 0;
      return `<div class="mfilter" id="mfilter"><div class="grow"><b>${esc(c[2])} ${esc(c[1])}: <span class="num">${esc(money(tot))}</span></b><div class="small mut">${shown.length} khoản${prevOut ? ` · ${isCur ? "cùng kỳ " : ""}tháng ${pm.getMonth() + 1}: ${esc(moneyShort(pv))}` : ""}</div></div><button class="btn" data-act="mcat-clear">Bỏ lọc</button></div>`; })() : ""}
    ${Object.keys(byDay).length ? dayKeys.slice(0, ui.moneyAll === month ? Infinity : MONEY_DAYS).map(d => {
      const rows = byDay[d];
      const label = d === td ? "Hôm nay" : dayDiff(td, d) === 1 ? "Hôm qua" : `${DOWL[parseYmd(d).getDay()]} ${dm(d)}`;
      return `<div class="group-h">${label}<span class="num">−${money(sumOut(rows))}</span></div><div class="card list">${rows.map(r => {
        const c = CAT[r.data.cat] || ["", "Khác", "📦"];
        return `<div class="row tap" data-edit="tx" data-id="${r.id}"><div class="emo">${esc(c[2])}</div><div class="grow"><div class="t">${esc(r.data.note || c[1])}</div>${r.data.note ? `<div class="m">${esc(c[1])}</div>` : ""}</div><div class="amt num ${r.data.type === "in" ? "in" : ""}">${r.data.type === "in" ? "+" : "−"}${money(r.data.amount)}</div></div>`;
      }).join("")}</div>`;
    }).join("") + (ui.moneyAll !== month && dayKeys.length > MONEY_DAYS ? `<button class="btn block" data-act="money-more" style="margin-bottom:12px">Xem thêm ${dayKeys.length - MONEY_DAYS} ngày trước (${dayKeys.slice(MONEY_DAYS).reduce((n, d) => n + byDay[d].length, 0)} khoản)</button>` : "")
      : `<div class="card empty">${fcat ? "Tháng này chưa có khoản nào thuộc loại này." : "Chưa ghi khoản nào trong tháng này. Bấm + để ghi, chỉ mất vài giây."}</div>`}
    ${all("tx").length ? `<div class="btns" style="margin-top:4px"><button class="btn" data-act="csv">Xuất Excel (CSV)</button></div>` : ""}`;
}
/* Nhịp để dành của mục tiêu: còn thiếu bao nhiêu, mỗi tuần (và mỗi tháng) cần góp bao nhiêu để kịp hạn */
function goalPace(g) {
  const left = Math.max(0, (+g.target || 0) - (+g.saved || 0));
  if (!left || !g.deadline) return { left };
  const days = dayDiff(g.deadline, today());
  if (days < 0) return { left, late: true };
  const weeks = Math.max(1, Math.ceil((days + 1) / 7));
  return { left, days, weeks, perWeek: Math.ceil(left / weeks / 1000) * 1000, perMonth: Math.ceil(left / Math.max(1, (days + 1) / 30.4) / 1000) * 1000 };
}
function goalMeta(g) {
  const p = goalPace(g);
  if (!g.deadline || !p.left) return g.deadline ? ` · đến ${esc(dm(g.deadline))}` : "";
  if (p.late) return ` · <span class="red">quá hạn ${esc(dm(g.deadline))}</span>`;
  return ` · ~${esc(moneyShort(p.perWeek))}/tuần đến ${esc(dm(g.deadline))}`;
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
/* Một ô CSV. Chữ tự do (ghi chú, tên bài, danh mục tự tạo) bắt đầu bằng = + - @ tab, CR thì thêm ' để Excel không chạy như công thức;
   cột số (kiểu number) giữ nguyên để Excel vẫn tính được. */
const csvQ = v => { let s = String(v ?? ""); if (typeof v !== "number" && /^[=+\-@\t\r]/.test(s)) s = "'" + s; return `"${s.replace(/"/g, '""')}"`; };
async function exportCsv() {
  const q = csvQ;
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
  const goalKg = +getSetting("weightGoal", 0) || 0, trend = weightTrend(ws12);
  let goalLine = "";
  if (lastW) {
    const kg = +lastW.data.kg || 0, nf = v => v.toLocaleString("vi-VN"), parts = [];
    if (trend != null) parts.push(`Xu hướng 4 tuần: ${trend > 0 ? "+" : ""}${nf(trend)} kg/tuần`);
    if (goalKg) {
      const gap = Math.round((kg - goalKg) * 10) / 10;
      if (Math.abs(gap) < 0.1) parts.push(`Đã đạt mục tiêu ${nf(goalKg)} kg`);
      else {
        parts.push(`Mục tiêu ${nf(goalKg)} kg: còn ${nf(Math.abs(gap))} kg`);
        if (trend && Math.sign(trend) === -Math.sign(gap) && Math.abs(trend) >= 0.05) {
          const d = parseYmd(addDays(lastW.data.date, Math.ceil(Math.abs(gap) / Math.abs(trend) * 7)));
          parts.push(`theo đà này khoảng tháng ${d.getMonth() + 1}/${d.getFullYear()} sẽ đạt`);
        }
      }
    }
    const warn = trend != null && trend < 0 && -trend > kg * 0.01 ? "Giảm hơn 1% cân nặng mỗi tuần dễ mất cơ: ăn thêm một chút, giữ đủ đạm."
      : trend != null && goalKg && goalKg < kg && trend > 0.1 ? "Đang tăng cân: xem lại khẩu phần, nhất là đồ ngọt và nước có đường." : "";
    goalLine = parts.length || warn ? `<div class="small" style="margin-top:6px" data-wgoal>${esc(parts.join(" · "))}${warn ? `<div class="amber" style="margin-top:2px">${esc(warn)}</div>` : ""}</div>` : "";
  }
  const weightCard = `<section class="card" style="--c:var(--gym)">
      <div class="card-h"><h2><i></i>Cân nặng</h2><button class="link small" data-act="weight" style="--c:var(--gym)">+ Ghi</button></div>
      ${lastW ? `<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:10px"><div><span class="big num">${(+lastW.data.kg || 0).toLocaleString("vi-VN")}</span> <span class="mut">kg</span></div>
        <div class="small mut" style="text-align:right">${dm(lastW.data.date)}${delta != null ? `<br>${delta > 0 ? "+" : ""}${delta.toLocaleString("vi-VN")} kg so với ${dm(monthAgo.data.date)}` : ""}</div></div>
        ${goalLine}
        ${ws12.length >= 2 ? spark(ws12.slice(-12).map(x => ({ d: x.data.date, v: +x.data.kg || 0 })), "kg") : ""}
        <div class="small mut" style="margin-top:4px">${ws12.slice(-3).reverse().map(x => `<button class="link small" style="--c:var(--mut);margin-right:10px" data-act="weight" data-id="${x.id}">${dm(x.data.date)}: ${(+x.data.kg || 0).toLocaleString("vi-VN")}kg</button>`).join("")}</div>`
      : `<div class="empty">Ghi cân nặng mỗi tuần để xem xu hướng.</div>`}
    </section>`;
  const prList = exSeen.map(e => { let best = 0, when = ""; sess.forEach(s => (s.data.items || []).filter(i => i.ex === e).forEach(i => (i.sets || []).forEach(n => { if (n > best) { best = n; when = s.data.date; } }))); return { e, best, when }; }).filter(x => x.best);
  return header("Tập luyện", `${weekDays.size} buổi tuần này`) + `
    ${gpCard()}
    ${gymTodayCard(td)}
    ${gymCalCard(td)}
    ${progress}
    ${prList.length ? `<section class="card" style="--c:var(--gym)"><div class="card-h"><h2><i></i>Kỷ lục cá nhân</h2><span class="small mut">1 hiệp tốt nhất</span></div>
      ${prList.map(x => `<div class="cat-row" style="grid-template-columns:1fr auto auto"><span>${esc(x.e)}</span><b class="num">${esc(x.best)} ${esc(exUnit(x.e))}</b><span class="small mut">${esc(dm(x.when))}</span></div>`).join("")}</section>` : ""}
    ${weightCard}
    ${sess.length ? `<div class="group-h">Lịch sử</div><div class="card list">${sess.slice(0, 40).map(s => {
      const notes = (s.data.items || []).filter(i => i && String(i.note || "").trim()).map(i => `${i.ex}: ${String(i.note).trim()}`).join(" · ");
      return `<div class="row tap" data-edit="workout" data-id="${esc(s.id)}"><div class="emo">💪</div><div class="grow"><div class="t">${s.data.date === td ? "Hôm nay" : `${DOWL[parseYmd(s.data.date).getDay()]} ${dm(s.data.date)}`}${s.data.pname ? ` <span class="mut small">· ${esc(s.data.pname)}</span>` : ""}${s.data.mins ? ` <span class="mut small">· ${esc(s.data.mins)} phút</span>` : ""}</div><div class="m">${esc(sessionSummary(s))}</div>${notes ? `<div class="m gnotes">${esc(notes)}</div>` : ""}</div></div>`;
    }).join("")}</div>`
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

/* ---------- Tập: tuần, tháng, sheet ngày ---------- */
/* Lịch tập dạng Tuần hoặc Tháng (ui.gymView, nhớ theo máy bằng LS gymView). Chạm ngày nào (cả quá khứ) cũng mở sheet ngày đó.
   Giáo án chỉ đọc qua hợp đồng gymStatus / gymWorkoutFor / gymMatch / gymTarget / gymTickDefault (phần dán giáo án lo kind gymplan).
   "Đã tập" = ngày có ít nhất một workout (như bản cũ). Tiến độ "6/9 hiệp" lấy từ gymMatch: hiệp thêm và bài ngoài giáo án không tính. */
function gdayHas(d) { return !!(d && !d.rest && Array.isArray(d.items) && d.items.length); }
/* Tiến độ buổi day trong workout w; w = null (chưa tập) thì mọi bài chưa có hiệp nào */
function gdayProg(day, w) {
  if (w) return gymMatch(day, w);
  return { rows: day.items.map((it, k) => ({ k, it, wi: -1, done: [] })), extra: [], done: 0, total: day.items.reduce((a, it) => a + Math.max(0, +it.n || 0), 0) };
}
/* Một ngày: trạng thái (gymStatus), buổi có bài (plan), workout ghi cho buổi đó (w) và tiến độ */
function gdayInfo(ymd, td) {
  const st = gymStatus(ymd, td), plan = gdayHas(st.day) ? st.day : null;
  const w = plan ? gymWorkoutFor(ymd) : null;
  return { ...st, plan, w, prog: plan ? gdayProg(plan, w) : null };
}
function gdayLabel(d) { return `${DOWL[parseYmd(d).getDay()]}, ${dm(d)}`; }
/* Như lastEx nhưng chỉ tính buổi tới ngày `before` (xem lại ngày cũ thì "Lần trước" là trước ngày đó) */
function gdayLast(ex, before, skipId) {
  const s = sessions().find(x => x.id !== skipId && (x.data.date || "") <= before && (x.data.items || []).some(i => i && i.ex === ex && (i.sets || []).length));
  return s ? { date: s.data.date, sets: s.data.items.filter(i => i && i.ex === ex).flatMap(i => (i.sets || []).map(n => +n || 0)) } : null;
}
function gdaySum(ws) { return ws.map(sessionSummary).join(" · "); }
/* Dòng "Hôm nay" trên thẻ Tập luyện ở trang Hôm nay (HTML đã esc) */
function gymTodayLine(td) {
  const x = gdayInfo(td, td);
  if (x.plan) return `Hôm nay: <b>${esc(x.plan.name || "Buổi tập")}</b> · ${esc(x.prog.done)}/${esc(x.prog.total)} hiệp${x.prog.total && x.prog.done >= x.prog.total ? " · xong" : ""}`;
  if (x.ws.length) return `Hôm nay đã tập: ${esc(gdaySum(x.ws))}`;
  if (x.day && x.day.rest) return "Hôm nay nghỉ theo giáo án.";
  return "Hôm nay chưa tập. Chạm để ghi buổi tập.";
}
/* Thẻ "Hôm nay tập" ở tab Tập: chỉ hiện khi hôm nay có giáo án (kể cả ngày nghỉ) hoặc đã tập */
function gymTodayCard(td) {
  const x = gdayInfo(td, td);
  if (!x.day && !x.ws.length) return "";
  let body;
  if (x.plan) {
    const fin = x.prog.total && x.prog.done >= x.prog.total;
    body = `<div class="gt-h"><b>${esc(x.plan.name || "Buổi tập")}</b><span class="chip c-gym num">${esc(x.prog.done)}/${esc(x.prog.total)} hiệp</span></div>
      <div class="small mut">${esc(x.plan.items.map(it => `${it.ex} ${gymTarget(it)}`).join(" · "))}</div>
      <span class="btn pri block gt-go">${fin ? "Xem buổi hôm nay" : x.prog.done ? "Tập tiếp" : "Bắt đầu tập"}</span>`;
  } else body = `<div class="small">${x.day && x.day.rest ? "Hôm nay nghỉ theo giáo án." : ""}${x.ws.length ? `${x.day && x.day.rest ? " " : ""}Đã tập: ${esc(gdaySum(x.ws))}` : ""}</div>`;
  return `<section class="card tap gtoday" style="--c:var(--gym)" data-act="gym-day" data-date="${esc(td)}">
    <div class="card-h"><h2><i></i>Hôm nay tập</h2><span class="small mut">${esc(gdayLabel(td))}</span></div>${body}</section>`;
}
function gymCalCard(td) {
  const month = ui.gymView === "month";
  return `<section class="card gcal" style="--c:var(--gym)">
    <div class="card-h"><h2><i></i>Lịch tập</h2></div>
    <div class="seg" role="group" aria-label="Xem lịch tập"><button class="${month ? "" : "on"}" data-act="gym-view" data-v="week">Tuần</button><button class="${month ? "on" : ""}" data-act="gym-view" data-v="month">Tháng</button></div>
    ${month ? gymMonthHtml(td) : gymWeekHtml(td)}
  </section>`;
}
function gymWeekHtml(td) {
  const off = ui.gymWk || 0, ws = addDays(weekStart(td), 7 * off), we = addDays(ws, 6);
  let n = 0, done = 0, total = 0, rows = "";
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i), x = gdayInfo(d, td);
    if (x.ws.length) n++;
    if (x.prog) { done += x.prog.done; total += x.prog.total; }
    rows += gymWeekRow(d, x, td);
  }
  const sub = [{ 0: "Tuần này", "-1": "Tuần trước", 1: "Tuần sau" }[off] || "", `${n} buổi`, total ? `${done}/${total} hiệp` : ""].filter(Boolean).join(" · ");
  return `<div class="month-nav gnav"><button data-act="gym-prev" aria-label="Tuần trước">‹</button>
      <div class="wk-mid"><b>Tuần ${esc(dm(ws))} - ${esc(dm(we))}</b><div class="small mut">${esc(sub)}</div>${off ? `<button class="link small" data-act="gym-now" style="--c:var(--gym)">Về tuần này</button>` : ""}</div>
      <button data-act="gym-next" aria-label="Tuần sau">›</button></div>
    <div class="gwk">${rows}</div>`;
}
function gymWeekRow(d, x, td) {
  const rest = !x.plan && x.day && x.day.rest;
  const name = x.plan ? x.plan.name || "Buổi tập" : rest ? "Nghỉ" : x.ws.length ? "Buổi tự do" : "Không có bài";
  const m = [];
  if (x.prog) m.push(`${x.prog.done}/${x.prog.total} hiệp`);
  if (x.ws.length) m.push(gdaySum(x.ws));
  x.ws.forEach(w => { if (w.data.planDate && w.data.planDate !== d) m.push(`bù buổi ${dm(w.data.planDate)}`); });
  if (x.st === "made" && x.made) m.push(`đã tập bù ${DOW[parseYmd(x.made.data.date).getDay()]} ${dm(x.made.data.date)}`);
  const tag = x.st === "missed" ? `<span class="chip c-miss">Bỏ lỡ</span>` : x.st === "made" ? `<span class="chip c-gym">Tập bù</span>`
    : x.ws.length ? `<span class="chip c-gym">Đã tập</span>` : d === td && x.plan ? `<span class="chip">Hôm nay</span>` : "";
  const cls = ["gwd", d === td ? "today" : "", x.st === "missed" ? "miss" : "", !x.plan && !x.ws.length && x.st !== "made" ? "none" : ""].filter(Boolean).join(" ");
  return `<button class="${cls}" data-act="gym-day" data-date="${esc(d)}"><span class="gd"><b>${esc(DOW[parseYmd(d).getDay()])}</b><span class="num">${esc(dm(d))}</span></span>
    <span class="grow"><span class="t">${esc(name)}</span>${m.length ? `<span class="m">${esc(m.join(" · "))}</span>` : ""}</span>${tag}</button>`;
}
function gymMonthHtml(td) {
  const month = ui.gymMonth || td.slice(0, 7), [y, mo] = month.split("-").map(Number);
  const gs = weekStart(`${month}-01`), last = addDays(`${mo === 12 ? y + 1 : y}-${pad(mo === 12 ? 1 : mo + 1)}-01`, -1);
  const weeks = Math.ceil((dayDiff(last, gs) + 1) / 7);
  let cells = "", days = 0, mins = 0, sets = 0, plan = 0;
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(gs, i), inM = d.slice(0, 7) === month, x = gdayInfo(d, td), did = x.ws.length > 0;
    if (inM) {
      if (did) days++;
      x.ws.forEach(w => { mins += +w.data.mins || 0; (w.data.items || []).forEach(it => { if (it && Array.isArray(it.sets)) sets += it.sets.length; }); });
      if (x.prog) plan += x.prog.total;
    }
    const k = did ? "done" : x.st === "made" ? "made" : x.st === "missed" ? "miss" : x.st === "planned" ? "plan" : "";
    const word = { done: "đã tập", made: "đã tập bù", miss: "bỏ lỡ", plan: "có bài" }[k] || (x.day && x.day.rest ? "nghỉ" : "");
    const small = x.prog && (did || k === "made") ? `${x.prog.done}/${x.prog.total}` : "";
    const label = [gdayLabel(d), word, x.plan && (x.plan.name || "buổi tập"), small && `${small} hiệp`, d === td && "hôm nay"].filter(Boolean).join(", ");
    cells += `<button class="gmc${k ? " " + k : ""}${inM ? "" : " out"}${d === td ? " today" : ""}" data-act="gym-day" data-date="${esc(d)}" aria-label="${esc(label)}"><b class="num">${esc(parseYmd(d).getDate())}</b>${small ? `<small class="num">${esc(small)}</small>` : ""}</button>`;
  }
  const cur = month === td.slice(0, 7);
  return `<div class="month-nav gnav"><button data-act="gym-prev" aria-label="Tháng trước">‹</button>
      <div class="wk-mid"><b>Tháng ${esc(mo)}, ${esc(y)}</b>${cur ? `<div class="small mut">Tháng này</div>` : `<button class="link small" data-act="gym-now" style="--c:var(--gym)">Về tháng này</button>`}</div>
      <button data-act="gym-next" aria-label="Tháng sau">›</button></div>
    <div class="stats3 gsum" data-gsum><div><b class="num">${esc(days)}</b><span>Buổi</span></div><div><b class="num">${esc(mins)}</b><span>Phút</span></div>
      <div><b class="num">${esc(sets)}${plan ? `<small> / ${esc(plan)}</small>` : ""}</b><span>${plan ? "Hiệp / dự kiến" : "Hiệp đã làm"}</span></div></div>
    <div class="gmon">${["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map(x => `<span class="gmw" aria-hidden="true">${x}</span>`).join("")}${cells}</div>
    <div class="glegend" aria-hidden="true"><span><i class="lg-done"></i>Đã tập</span><span><i class="lg-plan"></i>Có bài</span><span><i class="lg-miss"></i>Bỏ lỡ</span><span><i class="lg-today"></i>Hôm nay</span></div>`;
}
/* Bấm trong tab Tập (data-act bắt đầu bằng "gym-"), gọi từ bộ nghe click chung */
function gymClick(act, el) {
  const td = today();
  if (act === "gym-day") { const d = el.dataset.date || ""; if (YMD_RE.test(d)) gymDaySheet(d); return; }
  if (act === "gym-view") {
    const to = el.dataset.v === "month" ? "month" : "week";
    if (to !== ui.gymView) {   // giữ đúng chỗ đang xem khi đổi dạng
      if (to === "month") { const m = addDays(addDays(weekStart(td), 7 * (ui.gymWk || 0)), 3).slice(0, 7); ui.gymMonth = m === td.slice(0, 7) ? "" : m; }
      else ui.gymWk = ui.gymMonth ? Math.round(dayDiff(weekStart(`${ui.gymMonth}-01`), weekStart(td)) / 7) : 0;
    }
    ui.gymView = to; LS.set("gymView", to); render(); return;
  }
  if (act === "gym-prev" || act === "gym-next") {
    const n = act === "gym-next" ? 1 : -1;
    if (ui.gymView === "month") {
      const [y, m] = (ui.gymMonth || td.slice(0, 7)).split("-").map(Number), d = new Date(y, m - 1 + n, 1), k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      ui.gymMonth = k === td.slice(0, 7) ? "" : k;
    } else ui.gymWk = (ui.gymWk || 0) + n;
    render(); return;
  }
  if (act === "gym-now") { ui.gymWk = 0; ui.gymMonth = ""; render(); }
}
/* Sheet một ngày: bài của giáo án ngày đó, tick từng hiệp, ghi chú bài, ghi chú buổi, hẹn giờ nghỉ.
   Ghi vào một workout của buổi (gymWorkoutFor; ngày không có giáo án thì workout đầu tiên của ngày, giống ghi nhanh):
   lần tick đầu tạo bản ghi, sets chỉ chứa hiệp đã làm (mảng số), hs = hiệp thứ mấy; bỏ hết tick và không còn ghi chú, phút thì xóa bản ghi.
   Mỗi thao tác đọc lại dữ liệu mới nhất (máy khác có thể vừa đồng bộ) rồi tự vẽ lại thân sheet, vì render() không vẽ lại sheet.
   Chạm hiệp = xong với số mục tiêu (gymTickDefault: khoảng 8-10 ghi 8; tối đa thì hỏi số); chạm lại = bỏ tick;
   giữ lâu, chuột phải hoặc "Sửa số" (cho bàn phím) = nhập số ngay trong sheet (không prompt(), không mở sheet lồng). Ngày tương lai chỉ xem. */
const GDAY_FUT = "Chưa tới ngày này: xem trước bài, tới ngày mới tick được.";
function gymDaySheet(ymd) {
  let todayMode = false, edit = null, pick = null, adding = false, want = null, lp = null, swallow = false, gb = null;
  const rt = restTimer();
  const known = [...new Set([...EXERCISES.map(e => e[0]), ...sessions().flatMap(s => (s.data.items || []).map(i => i && i.ex).filter(x => typeof x === "string" && x))])];
  const ctx = () => {
    const td = today(), st = gymStatus(ymd, td), day = gdayHas(st.day) ? st.day : null;
    let w = null;
    if (day) { w = gymWorkoutFor(ymd); if (w && todayMode && w.data.planDate !== ymd) w = null; }
    else w = sessions().find(s => s.data.date === ymd && (!s.data.planDate || s.data.planDate === ymd)) || null;   // buổi bù của ngày khác thì để ở "Buổi khác trong ngày"
    const m = day ? gdayProg(day, w) : null;
    const items = w && Array.isArray(w.data.items) ? w.data.items : [];
    const extra = day ? (w ? m.extra : []) : items.map((_, i) => i).filter(i => items[i] && typeof items[i] === "object");
    return { td, fut: ymd > td, st, day, w, m, extra };
  };
  const rowOf = (c, r) => {
    if (!r) return null;
    if (r[0] === "p") { const row = c.m && c.m.rows.find(x => x.k === +r.slice(1)); return row ? { plan: row } : null; }
    const wi = +r.slice(1), x = c.w && c.extra.includes(wi) ? c.w.data.items[wi] : null;
    return x ? { wi, x } : null;
  };
  const setSel = (r, h) => `[data-ga="set"][data-r="${CSS.escape(r)}"][data-h="${CSS.escape(String(h))}"]`;
  /* ghi: sửa bản sao dữ liệu mới nhất bằng fn; bài không còn hiệp và ghi chú thì bỏ; buổi rỗng hẳn thì xóa bản ghi */
  const apply = (c, fn, redraw = true) => {
    if (c.fut) { toast(GDAY_FUT); draw(); return false; }
    const r = c.w;
    const data = r ? JSON.parse(JSON.stringify(r.data)) : { date: todayMode && c.day ? c.td : ymd, mins: "", items: [], note: "" };
    if (!Array.isArray(data.items)) data.items = [];
    if (c.day) {
      if (!data.planId) data.planId = c.day.planId; if (!data.planDate) data.planDate = ymd; if (!data.pname) data.pname = c.day.name || "";
      // bài đang khớp theo tên (ghi nhanh, sửa từ bản cũ) thì gắn luôn pi để lần sau khớp đúng bài
      c.m.rows.forEach(row => { const x = row.wi >= 0 ? data.items[row.wi] : null; if (x && typeof x === "object" && !Number.isInteger(x.pi)) x.pi = row.k; });
    }
    fn(data);
    const n0 = data.items.length;
    data.items = data.items.filter(i => i && typeof i === "object" && ((Array.isArray(i.sets) && i.sets.length) || String(i.note ?? "").trim()));
    if (!data.items.length && !(+data.mins > 0) && !String(data.note ?? "").trim()) { if (r) remove(r.id); }
    else put("workout", data, r ? r.id : undefined);
    if (redraw || data.items.length !== n0) draw();
    return true;
  };
  const planItem = (data, row) => {
    let wi = row.wi;
    if (wi < 0 || !data.items[wi]) { data.items.push({ ex: row.it.ex, sets: [], kg: row.it.kg || "", pi: row.k, hs: [], tgt: gymTarget(row.it), note: "" }); wi = data.items.length - 1; }
    const x = data.items[wi];
    x.pi = row.k; if (!x.tgt) x.tgt = gymTarget(row.it); if (!(+x.kg) && row.it.kg) x.kg = row.it.kg;
    return x;
  };
  const setPlan = (c, row, done) => apply(c, data => {
    const x = planItem(data, row), byH = new Map();
    done.forEach(d => byH.set(d.h, +d.v || 0));
    const hs = [...byH.keys()].sort((a, b) => a - b);
    x.sets = hs.map(h => byH.get(h)); x.hs = hs;
  });
  const setExtra = (c, wi, sets) => apply(c, data => {
    const x = data.items[wi]; if (!x) return;
    x.sets = sets.map(v => +v || 0);
    if (Array.isArray(x.hs)) x.hs = x.sets.map((_, i) => i);
  });
  const ticked = () => { buzz(12); rt.kick(); };
  const openEdit = (r, h) => { edit = { r, h }; adding = false; want = "[data-num]"; draw(); };
  const tapSet = (r, h) => {
    const c = ctx(), o = rowOf(c, r);
    if (c.fut) { toast(GDAY_FUT); return; }
    if (!o) { edit = null; draw(); return; }
    if (pick === r) { openEdit(r, h); return; }
    edit = null;
    if (o.plan) {
      const row = o.plan;
      if (row.done.some(d => d.h === h)) { setPlan(c, row, row.done.filter(d => d.h !== h)); buzz(8); return; }
      const v = gymTickDefault(row.it);
      if (v == null) { openEdit(r, h); return; }
      setPlan(c, row, [...row.done, { h, v }]); ticked();
    } else {
      const sets = [...(o.x.sets || [])]; if (h >= sets.length) { draw(); return; }
      sets.splice(h, 1); setExtra(c, o.wi, sets); buzz(8);
    }
  };
  const addSet = r => {
    const c = ctx(), o = rowOf(c, r);
    if (c.fut) { toast(GDAY_FUT); return; }
    edit = null;
    if (!o) { draw(); return; }
    if (o.plan) {
      const row = o.plan, h = Math.max(+row.it.n || 0, ...row.done.map(d => d.h + 1));
      const prev = [...row.done].sort((a, b) => a.h - b.h).pop(), v = prev ? prev.v : gymTickDefault(row.it);
      if (v == null) { openEdit(r, h); return; }
      setPlan(c, row, [...row.done, { h, v }]); ticked();
    } else {
      const sets = [...(o.x.sets || [])];
      if (!sets.length) { openEdit(r, 0); return; }
      setExtra(c, o.wi, [...sets, sets[sets.length - 1]]); ticked();
    }
  };
  const saveEdit = () => {
    const inp = $("[data-num]", gb); if (!edit || !inp) return;
    const v = Math.round(parseFloat(String(inp.value).replace(",", ".")) * 10) / 10;
    if (!(v > 0 && v < 10000)) { toast("Nhập số lớn hơn 0"); inp.focus(); return; }
    const { r, h } = edit, c = ctx(), o = rowOf(c, r);
    edit = null; pick = null; want = setSel(r, h);
    if (!o) { draw(); return; }
    if (o.plan) { const was = o.plan.done.some(d => d.h === h); if (setPlan(c, o.plan, [...o.plan.done.filter(d => d.h !== h), { h, v }]) && !was) ticked(); }
    else { const sets = [...(o.x.sets || [])], was = h < sets.length; if (was) sets[h] = v; else sets.push(v); if (setExtra(c, o.wi, sets) && !was) ticked(); }
  };
  const delEdit = () => {
    if (!edit) return;
    const { r, h } = edit, c = ctx(), o = rowOf(c, r);
    edit = null; pick = null; want = setSel(r, h);
    if (!o) { draw(); return; }
    if (o.plan) setPlan(c, o.plan, o.plan.done.filter(d => d.h !== h));
    else { const sets = [...(o.x.sets || [])]; sets.splice(h, 1); setExtra(c, o.wi, sets); }
  };
  const addEx = () => {
    const nm = $("[data-addname]", gb), num = $("[data-addnum]", gb); if (!nm || !num) return;
    const raw = nm.value.trim().slice(0, 60), ex = known.find(k => norm(k) === norm(raw)) || raw;
    const v = Math.round(parseFloat(String(num.value).replace(",", ".")) * 10) / 10;
    if (!ex) { toast("Nhập tên bài"); nm.focus(); return; }
    if (!(v > 0 && v < 10000)) { toast("Nhập số đã làm ở hiệp 1"); num.focus(); return; }
    adding = false; want = '[data-ga="addex"]';
    if (apply(ctx(), data => { data.items.push({ ex, sets: [v], hs: [0], kg: "", note: "" }); })) ticked();
  };
  const noteFor = (r, val) => {
    const c = ctx(), o = rowOf(c, r); if (!o || c.fut) return;
    apply(c, data => { const x = o.plan ? planItem(data, o.plan) : data.items[o.wi]; if (x) x.note = val; }, false);
  };
  const setBtn = (r, h, on, v, label, dis, small) => `<button type="button" class="gset${on ? " on" : ""}" data-ga="set" data-r="${esc(r)}" data-h="${esc(h)}" aria-pressed="${on}"${dis ? ' aria-disabled="true"' : ""} aria-label="${esc(label + (dis ? ", chưa tới ngày" : on ? ". Chạm để bỏ tick, giữ lâu để sửa số" : ""))}"><b class="num">${esc(v)}</b><small>${esc(small || `Hiệp ${h + 1}`)}</small></button>`;
  const editor = (c, r, h) => {
    const o = rowOf(c, r); if (!o) return "";
    const u = o.plan ? o.plan.it.unit || "lần" : exUnit(o.x.ex);
    const cur = o.plan ? (o.plan.done.find(d => d.h === h) || {}).v : (o.x.sets || [])[h];
    const def = cur != null ? cur : o.plan ? gymTickDefault(o.plan.it) : (o.x.sets || []).slice(-1)[0];
    const lb = `Hiệp ${h + 1}: số ${u} đã làm`;
    return `<div class="gedit" data-editor><label class="lbl">${esc(lb)}</label>
      <div class="gedit-r"><input data-num inputmode="decimal" enterkeyhint="done" autocomplete="off" aria-label="${esc(lb)}" value="${def != null ? esc(def) : ""}" placeholder="${esc(u === "lần" ? "Số lần" : u)}">
      <button type="button" class="btn pri" data-ga="numok">Lưu</button><button type="button" class="btn" data-ga="numcancel">Hủy</button></div>
      ${cur != null ? `<button type="button" class="link small" data-ga="numdel" style="--c:var(--danger)">Bỏ tick hiệp này</button>` : ""}</div>`;
  };
  const exBlock = (c, r, ex, tgt, last, pnote, sets, note) => `<div class="gex${pick === r ? " picking" : ""}" data-row="${esc(r)}">
      <div class="gex-h"><b>${esc(ex)}</b>${tgt ? `<span class="chip c-gym">${esc(tgt)}</span>` : ""}</div>
      ${last ? `<div class="small mut">Lần trước (${esc(dm(last.date))}): ${esc(last.sets.join(" "))}</div>` : ""}
      ${pnote ? `<div class="small mut gnote">${esc(pnote)}</div>` : ""}
      ${pick === r ? `<div class="small amber">Chạm vào hiệp cần sửa số.</div>` : ""}
      <div class="gsets" role="group" aria-label="${esc(`Các hiệp: ${ex}`)}">${sets}${c.fut ? "" : `<button type="button" class="gset add" data-ga="add" data-r="${esc(r)}">+ Thêm hiệp</button>`}</div>
      ${edit && edit.r === r ? editor(c, r, edit.h) : ""}
      ${c.fut ? (note ? `<div class="small">Ghi chú: ${esc(note)}</div>` : "")
        : `<div class="gex-f"><input data-exnote data-r="${esc(r)}" placeholder="Ghi chú bài" aria-label="${esc(`Ghi chú bài ${ex}`)}" value="${esc(note || "")}"><button type="button" class="link small" data-ga="pick" data-r="${esc(r)}" style="--c:var(--gym)">${pick === r ? "Thôi sửa" : "Sửa số"}</button></div>`}
    </div>`;
  const lastOf = (c, ex) => ymd >= c.td ? lastEx(ex, c.w && c.w.id) : gdayLast(ex, ymd, c.w && c.w.id);
  const planRow = (c, row) => {
    const it = row.it, r = `p${row.k}`, u = it.unit || "lần", item = row.wi >= 0 && c.w ? c.w.data.items[row.wi] : null;
    const byH = new Map(row.done.map(d => [d.h, d.v])), n = Math.max(+it.n || 0, ...row.done.map(d => d.h + 1)), def = gymTickDefault(it);
    let sets = "";
    // bài một lần theo phút/giây ("Chạy 20 phút"): nút ghi "Xong" thay cho "Hiệp 1"
    const once = n === 1 && u !== "lần";
    for (let h = 0; h < n; h++) {
      const on = byH.has(h), v = on ? byH.get(h) : def == null ? "?" : def;
      sets += setBtn(r, h, on, v, on ? `${once ? "Đã xong" : `Hiệp ${h + 1}`}, đã làm ${v} ${u}` : def == null ? `${once ? "Chạm" : `Hiệp ${h + 1}, chạm`} để nhập số ${u}` : `${once ? "Mục tiêu" : `Hiệp ${h + 1}, mục tiêu`} ${def} ${u}`, c.fut, once ? (on ? "Đã xong" : "Xong") : "");
    }
    return exBlock(c, r, it.ex, gymTarget(it), lastOf(c, it.ex), it.note, sets, item ? item.note : "");
  };
  const extraRow = (c, wi) => {
    const x = c.w.data.items[wi], r = `x${wi}`, ex = String(x.ex ?? ""), u = exUnit(ex), arr = Array.isArray(x.sets) ? x.sets : [];
    const sets = arr.map((v, h) => setBtn(r, h, true, v, `Hiệp ${h + 1}, đã làm ${v} ${u}`, c.fut)).join("");
    const tgt = [x.tgt, +x.kg > 0 ? `${+x.kg}kg` : ""].filter(Boolean).join(" · ");
    return exBlock(c, r, ex, tgt, lastOf(c, ex), "", sets, x.note);
  };
  const body = c => {
    const out = [];
    if (c.day) out.push(`<div class="gday-h"><div class="grow"><b>${esc(c.day.name || "Buổi tập")}</b>${c.day.planName ? `<div class="small mut">${esc(c.day.planName)}</div>` : ""}</div><span class="chip c-gym num" data-gprog>${esc(c.m.done)}/${esc(c.m.total)} hiệp</span></div>`);
    else out.push(`<div class="hint gday-h">${c.st.day && c.st.day.rest ? "Ngày nghỉ theo giáo án." : "Ngày này không có bài trong giáo án."}${c.w || c.fut ? "" : " Thêm bài đã tập bên dưới, hoặc ghi bằng form."}</div>`);
    if (c.fut) out.push(`<div class="gban">${GDAY_FUT}</div>`);
    else if (c.day && c.w && c.w.data.date !== ymd) out.push(`<div class="gban ok">Đã tập bù vào ${esc(gdayLabel(c.w.data.date))}.</div>`);
    else if (c.day && !c.w && ymd < c.td) {
      if (todayMode) out.push(`<div class="gban" data-gtoday>Buổi này sẽ ghi vào hôm nay (${esc(dm(c.td))}). Chạm hiệp để bắt đầu.</div>`);
      else if (c.st.st === "missed") out.push(`<div class="gban miss" data-gmissed>Bỏ lỡ buổi này. Chạm hiệp để ghi bù vào ngày ${esc(dm(ymd))}, hoặc tập ngay hôm nay.<button type="button" class="btn pri block" data-ga="today">Tập buổi này hôm nay</button></div>`);
    }
    if (c.day) c.m.rows.forEach(row => out.push(planRow(c, row)));
    if (c.extra.length) { if (c.day) out.push(`<div class="group-h">Bài thêm ngoài giáo án</div>`); c.extra.forEach(wi => out.push(extraRow(c, wi))); }
    if (!c.fut) out.push(adding ? `<div class="gex gadd"><div class="f"><label class="lbl">Tên bài</label><input data-addname list="gday-ex" placeholder="VD: Chống đẩy" autocomplete="off" aria-label="Tên bài"></div>
        <datalist id="gday-ex">${known.map(e => `<option value="${esc(e)}"></option>`).join("")}</datalist>
        <div class="f"><label class="lbl">Hiệp 1: số lần (giây, phút) đã làm</label><input data-addnum inputmode="decimal" placeholder="10" aria-label="Hiệp 1: số đã làm"></div>
        <div class="btns"><button type="button" class="btn" data-ga="addcancel">Hủy</button><button type="button" class="btn pri" data-ga="addok">Thêm</button></div></div>`
      : `<button type="button" class="btn block gaddex" data-ga="addex">+ Thêm bài</button>`);
    const others = c.st.ws.filter(s => !c.w || s.id !== c.w.id);
    if (others.length) out.push(`<div class="group-h">Buổi khác trong ngày</div><div class="list">${others.map(s => `<div class="row"><div class="grow"><div class="t">${esc(s.data.pname || (s.data.plan ? `Buổi ${s.data.plan}` : "Buổi tập"))}${s.data.mins ? ` <span class="mut small">· ${esc(s.data.mins)} phút</span>` : ""}</div><div class="m">${esc(sessionSummary(s))}</div></div><button type="button" class="btn gother" data-ga="other" data-id="${esc(s.id)}">Sửa</button></div>`).join("")}</div>`);
    if (!c.fut && (c.w || !c.day)) out.push(`<button type="button" class="link small gform" data-ga="form" style="--c:var(--gym)">${c.w ? "Sửa cả buổi (ngày, phút, kg)" : "Ghi bằng form đầy đủ"}</button>`);
    return out.join("");
  };
  function draw() {
    if (!gb || !gb.isConnected) return;
    const a = document.activeElement;
    const keep = want || (a && gb.contains(a) && a.dataset && a.dataset.ga ? `[data-ga="${CSS.escape(a.dataset.ga)}"]${a.dataset.r ? `[data-r="${CSS.escape(a.dataset.r)}"]` : ""}${a.dataset.h ? `[data-h="${CSS.escape(a.dataset.h)}"]` : ""}` : "");
    const field = want === "[data-num]" || want === "[data-addname]";
    want = null;
    gb.innerHTML = body(ctx());
    const el = keep ? $(keep, gb) : null;
    if (el) try { el.focus({ preventScroll: !field }); if (field) el.select(); } catch {}
  }
  const c0 = ctx(), w0 = c0.w;
  openSheet({
    title: `${gdayLabel(ymd)}${ymd === c0.td ? " · hôm nay" : ""}`, color: "var(--gym)",
    html: `<div data-gbody></div>
      ${c0.fut ? "" : `${rt.html}<div class="hint gresthint">Đã chọn mức nghỉ thì sau mỗi lần tick hiệp đồng hồ tự chạy. Chạm lại mức đó để tắt.</div>
      <div class="f"><label>Ghi chú buổi</label><textarea data-snote placeholder="Cảm giác, chỗ cần cải thiện…">${esc(w0 ? w0.data.note || "" : "")}</textarea></div>
      <div class="f gmins"><label>Thời gian (phút)</label><input data-mins inputmode="numeric" placeholder="45" value="${esc(w0 && +w0.data.mins > 0 ? w0.data.mins : "")}"></div>${rt.box}`}`,
    onMount(b) {
      gb = $("[data-gbody]", b); draw();
      if (!c0.fut) rt.bind(b);
      b.addEventListener("click", e => {
        if (swallow) { swallow = false; e.preventDefault(); e.stopPropagation(); return; }   // click ngay sau lần giữ lâu
        const t = e.target.closest && e.target.closest("[data-ga]"); if (!t || !gb.contains(t)) return;
        const ga = t.dataset.ga, r = t.dataset.r || "", h = +t.dataset.h || 0;
        if (ga === "set") return tapSet(r, h);
        if (ga === "add") return addSet(r);
        if (ga === "pick") { pick = pick === r ? null : r; edit = null; draw(); return; }
        if (ga === "numok") return saveEdit();
        if (ga === "numdel") return delEdit();
        if (ga === "numcancel") { if (edit) want = setSel(edit.r, edit.h); edit = null; draw(); return; }
        if (ga === "today") { todayMode = true; want = '[data-ga="set"]'; draw(); return; }
        if (ga === "addex") { adding = true; edit = null; want = "[data-addname]"; draw(); return; }
        if (ga === "addcancel") { adding = false; want = '[data-ga="addex"]'; draw(); return; }
        if (ga === "addok") return addEx();
        if (ga === "form") { const c = ctx(); workoutForm(c.w ? c.w.id : null, c.w ? undefined : { date: ymd }); return; }
        if (ga === "other") { if (db[t.dataset.id] && !db[t.dataset.id].deleted) workoutForm(t.dataset.id); }
      });
      // giữ lâu trên nút hiệp: sửa số. Tự viết vì bộ giữ lâu chung bỏ qua khi đang mở sheet.
      const lpEnd = () => { if (lp) { clearTimeout(lp.t); lp = null; } };
      const longEdit = s => { const c = ctx(); if (c.fut) { toast(GDAY_FUT); return; } buzz(15); openEdit(s.dataset.r, +s.dataset.h || 0); };
      b.addEventListener("pointerdown", e => {
        swallow = false; lpEnd();
        const s = e.button > 0 || !e.target.closest ? null : e.target.closest('.gset[data-ga="set"]'); if (!s) return;
        lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { lp = null; swallow = true; longEdit(s); }, 480) };
      });
      b.addEventListener("pointermove", e => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) lpEnd(); }, { passive: true });
      b.addEventListener("pointerup", lpEnd); b.addEventListener("pointercancel", lpEnd);
      b.closest(".sheet").addEventListener("scroll", lpEnd, { passive: true });
      b.addEventListener("contextmenu", e => {
        const s = e.target.closest && e.target.closest('.gset[data-ga="set"]'); if (!s) return;
        e.preventDefault();
        if (swallow) return;   // Android gửi contextmenu sau khi đã mở bằng giữ lâu
        lpEnd(); swallow = true; longEdit(s);   // chuột phải cũng mở ô sửa số
      });
      b.addEventListener("keydown", e => {
        swallow = false;
        if (e.isComposing) return;
        const t = e.target;
        if (t.matches("[data-num]")) {
          if (e.key === "Enter") { e.preventDefault(); saveEdit(); }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (edit) want = setSel(edit.r, edit.h); edit = null; draw(); }
        } else if (t.matches("[data-addname], [data-addnum]")) {
          if (e.key === "Enter") { e.preventDefault(); if (t.matches("[data-addname]")) $("[data-addnum]", gb).focus(); else addEx(); }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); adding = false; want = '[data-ga="addex"]'; draw(); }
        } else if (t.matches("[data-exnote], [data-mins]") && e.key === "Enter") { e.preventDefault(); t.blur(); }
      });
      b.addEventListener("change", e => {
        const t = e.target;
        if (t.matches("[data-exnote]")) noteFor(t.dataset.r, t.value.trim().slice(0, 300));
        else if (t.matches("[data-snote]")) apply(ctx(), d => { d.note = t.value.trim(); }, false);
        else if (t.matches("[data-mins]")) apply(ctx(), d => { d.mins = parseInt(t.value, 10) > 0 ? Math.min(parseInt(t.value, 10), 1440) : ""; }, false);
      });
    }
  });
}

/* ---------- trợ năng: bàn phím, trình đọc màn hình ---------- */
/* Khóa tìm lại một phần tử sau khi vẽ lại bằng innerHTML: id, hoặc thẻ + name + các data-* dùng để bấm */
const FOCUS_ATTRS = ["name", "data-act", "data-tab", "data-edit", "data-id", "data-mday", "data-mmonth", "data-calview", "data-cdetail", "data-date",
  "data-filter", "data-day", "data-week", "data-month", "data-ex", "data-gomonth", "data-i", "data-v", "data-k", "data-sid", "data-c"];
function focusKey(el) {
  if (!el || !el.tagName || el === document.body) return null;
  if (el.id) return "#" + CSS.escape(el.id);
  const parts = FOCUS_ATTRS.filter(a => el.hasAttribute(a)).map(a => `[${a}="${CSS.escape(el.getAttribute(a))}"]`);
  return parts.length ? el.tagName.toLowerCase() + parts.join("") : null;
}
/* Dòng bấm được là div (.row.tap, .ag, .cls, thẻ trên trang Hôm nay…): thêm role=button, tabindex=0; Enter/Space xử lý ở dưới.
   Công tắc: role=switch + aria-checked. Nhóm chọn (pills, seg): aria-pressed. Ô nhập chưa có nhãn: aria-label lấy từ nhãn gần nhất. */
const TAP_SEL = "[data-edit],[data-cdetail],[data-sid],[data-copy],[data-gomonth],.tap,[data-act]";
const NATIVE_CTRL = /^(BUTTON|A|INPUT|SELECT|TEXTAREA|LABEL|OPTION)$/;
const INNER_CTRL = 'button, a[href], input, select, textarea, [role="switch"]';
function a11yEnhance(root) {
  if (!root) return;
  for (const el of root.querySelectorAll(TAP_SEL)) {
    if (NATIVE_CTRL.test(el.tagName) || el.closest("label")) continue;
    let t = el;
    if (el.querySelector(INNER_CTRL)) {
      // dòng có nút bên trong (nút Xong, nút ghi nhanh…): role=button đặt lên phần chữ, bấm vẫn nổi lên dòng như trước
      if (el.getAttribute("role") === "button") el.removeAttribute("role");
      if (el.getAttribute("tabindex") === "0") el.removeAttribute("tabindex");
      t = [...el.children].find(c => !c.matches(INNER_CTRL) && !c.querySelector(INNER_CTRL) && c.textContent.trim());
      if (!t) continue;
    }
    if (!t.hasAttribute("role")) t.setAttribute("role", "button");
    if (!t.hasAttribute("tabindex")) t.setAttribute("tabindex", "0");
  }
  for (const el of root.querySelectorAll(".switch, .switch-mini")) { el.setAttribute("role", "switch"); el.setAttribute("aria-checked", String(el.classList.contains("on"))); }
  for (const el of root.querySelectorAll("[data-pick] > button, .seg > button")) el.setAttribute("aria-pressed", String(el.classList.contains("on")));
  for (const el of root.querySelectorAll("input, select, textarea")) labelInput(el);
}
function labelInput(el) {
  if (el.type === "hidden" || (el.labels && el.labels.length) || el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby")) return;
  // nhãn đứng trước ô trong cùng khối (tối đa 3 tầng cha, dừng ở .f): <label> hoặc .lbl không chứa ô nhập nào
  let txt = "";
  for (let p = el.parentElement, i = 0; p && i < 3 && !txt; p = p.parentElement, i++) {
    const labs = [...p.querySelectorAll("label, .lbl")].filter(l => !l.querySelector("input, select, textarea") && (l.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING));
    if (labs.length) txt = labs[labs.length - 1].textContent;
    if (p.classList.contains("f") || p.classList.contains("sheet-b")) break;
  }
  txt = (txt || el.getAttribute("placeholder") || (el.hasAttribute("data-ex") ? "Bài tập" : "") || "").replace(/\s+/g, " ").trim().slice(0, 80);
  if (txt) el.setAttribute("aria-label", txt);
}
/* Enter/Space trên phần tử role=button không phải <button> thì bấm như click */
document.addEventListener("keydown", e => {
  if ((e.key !== "Enter" && e.key !== " ") || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
  const el = e.target;
  if (!el || !el.getAttribute || el.getAttribute("role") !== "button" || NATIVE_CTRL.test(el.tagName)) return;
  e.preventDefault();
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
});
/* Công tắc và nhóm chọn đổi class "on" trong bộ nghe của từng form; bộ nghe này nằm trên document nên chạy sau, cập nhật aria theo */
document.addEventListener("click", e => {
  const t = e.target; if (!t || !t.closest) return;
  const sw = t.closest(".switch, .switch-mini");
  if (sw) sw.setAttribute("aria-checked", String(sw.classList.contains("on")));
  const grp = t.closest("[data-pick], .seg");
  if (grp) for (const b of grp.querySelectorAll(":scope > button")) b.setAttribute("aria-pressed", String(b.classList.contains("on")));
});
/* Chỉ trả focus về chỗ cũ sau khi đóng sheet nếu người dùng đang dùng bàn phím (chạm thì không, tránh viền focus thừa) */
let usingKeys = false;
document.addEventListener("keydown", () => { usingKeys = true; }, true);
document.addEventListener("pointerdown", () => { usingKeys = false; }, true);

/* ================= sheet ================= */
/* Sheet là modal: role=dialog, aria-modal, aria-labelledby; nền phía sau inert; Tab vòng trong sheet; Escape đóng;
   đóng thì trả focus về phần tử đã mở (tìm lại theo focusKey nếu phần tử cũ đã bị vẽ lại). */
let sheetEl = null, shadeEl = null, sheetHist = false, sheetOpener = null, sheetObs = null, sheetSeq = 0;
const BG_SEL = ["#main", "#nav", "#fab"];
function setBgInert(on) { for (const s of BG_SEL) { const el = $(s); if (el) el.inert = on; } }
function openSheet({ title, html, color, full, onMount }) {
  if (sheetEl) { sheetEl.remove(); shadeEl.remove(); sheetEl = shadeEl = null; if (sheetObs) { sheetObs.disconnect(); sheetObs = null; } }
  else {
    const ae = document.activeElement, k = ae && ae !== document.body ? focusKey(ae) : null;
    sheetOpener = ae && ae !== document.body ? { el: ae, key: k, i: k ? $$(k).indexOf(ae) : -1 } : null;
  }
  shadeEl = document.createElement("div"); shadeEl.className = "shade";
  sheetEl = document.createElement("div"); sheetEl.className = "sheet" + (full ? " full" : "");
  const hid = "sheet-t" + (++sheetSeq);
  sheetEl.setAttribute("role", "dialog"); sheetEl.setAttribute("aria-modal", "true"); sheetEl.setAttribute("aria-labelledby", hid); sheetEl.tabIndex = -1;
  sheetEl.style.setProperty("--c", color || "var(--fg)");
  if (!color || color === "var(--fg)") sheetEl.style.setProperty("--on-c", "var(--bg)");
  sheetEl.innerHTML = `<div class="sheet-h"><h3 id="${hid}">${esc(title)}</h3><button class="x" data-close>Đóng</button></div><div class="sheet-b">${html}</div>`;
  document.body.append(shadeEl, sheetEl);
  setBgInert(true);
  shadeEl.addEventListener("click", () => closeSheet());
  sheetEl.querySelector("[data-close]").addEventListener("click", () => closeSheet());
  requestAnimationFrame(() => requestAnimationFrame(() => { shadeEl && shadeEl.classList.add("in"); sheetEl && sheetEl.classList.add("in"); }));
  document.body.style.overflow = "hidden";
  if (!sheetHist) { try { history.pushState({ hnSheet: 1 }, ""); sheetHist = true; } catch {} }
  const me = sheetEl;
  if (onMount) onMount(sheetEl.querySelector(".sheet-b"));
  if (sheetEl !== me) return;   // onMount đã mở sheet khác hoặc đã đóng
  a11yEnhance(me);
  // phần tử thêm sau (dòng phần việc, kết quả tìm kiếm, xem trước TKB) cũng được gắn nhãn và role
  let queued = false;
  sheetObs = new MutationObserver(() => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; if (sheetEl === me) a11yEnhance(me); }); });
  sheetObs.observe(me, { childList: true, subtree: true });
  if (!me.contains(document.activeElement)) me.focus({ preventScroll: true });
}
function closeSheet(fromPop) {
  if (!sheetEl) return;
  if (ui.qPending) { const qp = ui.qPending; ui.qPending = null; if (putSeq !== qp.seq) quickReset(qp.rest); }
  const s = sheetEl, sh = shadeEl;
  sheetEl = shadeEl = null;
  if (sheetObs) { sheetObs.disconnect(); sheetObs = null; }
  setBgInert(false);
  document.body.style.overflow = "";
  s.classList.remove("in"); sh.classList.remove("in");
  setTimeout(() => { s.remove(); sh.remove(); }, 260);
  if (sheetHist && !fromPop) { sheetHist = false; try { history.back(); } catch {} }
  else sheetHist = false;
  const op = sheetOpener; sheetOpener = null;
  if (op && usingKeys && (s.contains(document.activeElement) || document.activeElement === document.body)) {
    const el = op.el && op.el.isConnected ? op.el : op.key ? ($$(op.key)[op.i] || $(op.key)) : null;
    if (el) try { el.focus({ preventScroll: true }); } catch {}
  }
}
window.addEventListener("popstate", () => { if (sheetHist) { sheetHist = false; closeSheet(true); } });
/* Bàn phím ảo: iPhone (và Android không thu nhỏ trang) chỉ thu nhỏ visualViewport, nên sheet dính đáy sẽ bị che.
   --kb = phần bị che, CSS đẩy sheet lên đúng chừng đó để nút Lưu ở footer luôn thấy được. */
if (window.visualViewport) {
  const kbFit = () => {
    const vv = window.visualViewport, kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    const v = kb > 60 && vv.scale < 1.01 ? kb : 0;   // bỏ qua chênh lệch nhỏ (thanh địa chỉ co giãn) và lúc phóng to bằng hai ngón
    document.documentElement.style.setProperty("--kb", v + "px");
    document.documentElement.classList.toggle("kb", v > 0);
  };
  visualViewport.addEventListener("resize", kbFit);
  visualViewport.addEventListener("scroll", kbFit);
}
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
document.addEventListener("keydown", e => {
  if (!sheetEl || e.isComposing) return;
  if (e.key === "Escape") { e.preventDefault(); closeSheet(); return; }
  if (e.key !== "Tab") return;
  const f = $$(FOCUSABLE, sheetEl).filter(x => x.getClientRects().length && !x.closest("[hidden]"));
  if (!f.length) { e.preventDefault(); sheetEl.focus(); return; }
  const first = f[0], last = f[f.length - 1], a = document.activeElement;
  if (!sheetEl.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
  else if (e.shiftKey && (a === first || a === sheetEl)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
});

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
  return `<button type="button" class="${on ? "on" : ""}" data-v="${esc(v)}">${esc(label)}</button>`;
}).join("")}</div>`;

/* ---------- trạng thái đang chọn (aria-pressed) ----------
   Nút chọn trong .seg và nhóm pill bật/tắt bằng class "on" ở nhiều chỗ; một bộ theo dõi DOM giữ aria-pressed khớp với class đó. */
const PRESS_SEL = ".seg button, [data-pick] button, [data-rest] button";
function syncPressed(root) {
  const list = root.matches(PRESS_SEL) ? [root] : [...root.querySelectorAll(PRESS_SEL)];
  for (const b of list) { const v = String(b.classList.contains("on")); if (b.getAttribute("aria-pressed") !== v) b.setAttribute("aria-pressed", v); }
}
new MutationObserver(ms => {
  for (const m of ms) {
    if (m.type === "attributes") { if (m.target.matches(PRESS_SEL)) syncPressed(m.target); }
    else m.addedNodes.forEach(n => { if (n.nodeType === 1) syncPressed(n); });
  }
}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });

/* ---------- toast ---------- */
let toastT = null;
function toast(msg, action) {
  let el = $("#toast");
  if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ""}`;
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
function taskForm(id, preset, opts = {}) {
  const r = id ? db[id] : null;
  const t = r ? JSON.parse(JSON.stringify(r.data)) : { title: "", tag: "", type: "bai", due: "", time: "", status: "todo", waitFor: "", note: "", subs: [], ...(preset || {}) };
  const st = { type: t.type || "bai", status: t.status || "todo", repeat: t.repeat || "" };
  let subs = (t.subs || []).map(s => ({ ...s }));
  const tags = [...new Set([...all("task").map(x => x.data.tag), ...all("class").map(x => x.data.title)].filter(Boolean))];
  const td = today(), stu = isStudent();
  // trường ít dùng nằm trong "Thêm chi tiết"; đã có giá trị (khi sửa, hoặc điền sẵn) thì mở sẵn
  const moreOpen = !!(t.tag || (t.status && t.status !== "todo") || t.amount > 0 || t.repeat || (t.subs || []).length || t.note || t.waitFor);
  const subRow = (s, i) => `<div class="sub-row" data-i="${i}">
      <button type="button" class="check ${s.done ? "on" : ""}" data-subcheck aria-label="Xong phần này"></button>
      <input data-subtext value="${esc(s.text)}" placeholder="Phần việc">
      <input data-subwho value="${esc(s.who || "")}" placeholder="Ai làm">
      <button type="button" class="rm" data-subrm aria-label="Bỏ">×</button></div>`;
  openSheet({
    title: r ? "Sửa việc" : opts.fromDate ? (mod("cal") ? "Thêm vào lịch" : `Việc ngày ${dm(opts.fromDate)}`) : "Việc mới", color: "var(--task)",
    html: `${!r && opts.fromDate ? addSwitch("task", opts.fromDate) : ""}
      <div class="f"><input name="title" placeholder="Cần làm gì?" value="${esc(t.title)}" autocomplete="off"></div>
      <div class="f"><label>Loại</label>${pills("type", taskTypes(), st.type)}</div>
      <div class="f"><label>Hạn</label>
        <div class="pills" data-quickdue style="margin-bottom:8px">
          <button type="button" data-d="0">Hôm nay</button><button type="button" data-d="1">Mai</button><button type="button" data-d="3">+3 ngày</button><button type="button" data-d="7">+1 tuần</button><button type="button" data-d="">Không hạn</button>
        </div>
        <div class="f2"><input type="date" name="due" value="${esc(t.due)}" aria-label="Ngày hạn"><input type="time" name="time" value="${esc(t.time)}" aria-label="Giờ hạn"></div>
      </div>
      <details class="more f" ${moreOpen ? "open" : ""}><summary>Thêm chi tiết<small>${stu ? "Môn" : "Nhóm"}, trạng thái, số tiền, lặp lại, ghi chú</small></summary>
      <div class="f"><label>${stu ? "Môn / nhóm" : "Nhóm, dự án"}</label><input name="tag" list="hn-tags" value="${esc(t.tag)}" placeholder="${stu ? "VD: Lịch sử Đảng" : "VD: Dự án A, Nhà cửa"}" autocomplete="off"><datalist id="hn-tags">${tags.map(x => `<option value="${esc(x)}">`).join("")}</datalist></div>
      <div class="f"><label>Trạng thái</label>${pills("status", [["todo", "Cần làm"], ["waiting", "Chờ người khác"], ["done", "Xong"]], st.status)}</div>
      <div class="f2 f"><div><label class="lbl">Số tiền phải trả (nếu có)</label><input name="amount" inputmode="decimal" value="${esc(moneyEdit(t.amount))}" placeholder="VD: 3tr"></div>
        <div><label class="lbl">Ghi vào loại</label><select name="cat">${OUT_CATS.map(([k, n, e]) => `<option value="${esc(k)}" ${(t.cat || "nha") === k ? "selected" : ""}>${esc(e)} ${esc(n)}</option>`).join("")}</select></div></div>
      <div class="f"><label>Lặp lại</label>${pills("repeat", REPEATS, st.repeat)}
        <div data-untilbox ${st.repeat ? "" : "hidden"} style="margin-top:8px"><label class="lbl">Lặp đến ngày (không bắt buộc)</label><input type="date" name="until" value="${esc(t.until || "")}">
        <div class="hint">Đánh dấu xong thì lần kế tiếp tự hiện với hạn mới. Chưa đặt hạn thì lấy hôm nay.<span data-lunarhint></span></div></div></div>
      <div class="f" data-waitbox ${st.status === "waiting" ? "" : "hidden"}><label>Đang chờ ai, việc gì?</label><input name="waitFor" value="${esc(t.waitFor)}" placeholder="${stu ? "VD: Thầy Hưng ký giấy xác nhận" : "VD: Anh Nam duyệt báo giá"}"></div>
      <div class="f"><label>${persona() === "sv" ? "Phần việc (BTL nhóm, chia việc)" : stu ? "Phần việc (bài nhóm, chia việc)" : "Phần việc (chia việc cho người khác)"}</label><div data-subs>${subs.map(subRow).join("")}</div>
        <button type="button" class="btn btn-sm" data-addsub>+ Thêm phần</button></div>
      <div class="f"><label>Ghi chú</label><textarea name="note" placeholder="${stu ? "Link đề, yêu cầu, liên hệ…" : "Link, yêu cầu, liên hệ…"}">${esc(t.note)}</textarea></div>
      </details>
      <div class="btns sheet-foot">${r ? `<button class="btn danger" data-del>Xóa</button>` : ""}<button class="btn pri" data-save>Lưu</button></div>`,
    onMount(b) {
      bindAddSwitch(b, "task");
      // lặp âm lịch: cho thấy ngày âm của hạn đang chọn (giỗ, rằm)
      const lunarHint = () => { const h = $("[data-lunarhint]", b), d = $("[name=due]", b).value || today(); if (h) h.textContent = st.repeat.startsWith("lunar-") && YMD_RE.test(d) ? ` Lặp theo ngày âm ${LUNAR.text(d)} của hạn.` : ""; };
      bindPills(b, st, k => { if (k === "status") $("[data-waitbox]", b).hidden = st.status !== "waiting"; if (k === "repeat") { $("[data-untilbox]", b).hidden = !st.repeat; lunarHint(); } });
      $("[name=due]", b).addEventListener("change", lunarHint); lunarHint();
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
        // ngày gốc của chuỗi lặp: đặt lại khi đổi hạn hoặc kiểu lặp, giữ nguyên khi chỉ sửa chữ (31/1 → 28/2 → 31/3)
        if (DAY_REPEATS.includes(data.repeat) && data.due) { if (!(+t.day > 0) || data.due !== t.due || data.repeat !== t.repeat) data.day = anchorDay(data.due, data.repeat); }
        else delete data.day;
        const becameDone = st.status === "done" && t.status !== "done", undone = t.status === "done" && st.status !== "done";
        const unpaid = undone && id ? autoPaid(id) : [], unSnaps = unpaid.map(x => JSON.parse(JSON.stringify(x)));
        const saved = batch(() => { const x = put("task", data, id); unpaid.forEach(y => remove(y.id)); return x; });
        const sp = becameDone ? spawnNext(saved) : null, paid = becameDone ? payTask(saved) : null;
        closeSheet();
        if (unSnaps.length) toast(`Đã lưu, xóa khoản chi ${moneyShort(unSnaps.reduce((a, x) => a + (+x.data.amount || 0), 0))} đã tự ghi`, { label: "Hoàn tác", fn: () => batch(() => unSnaps.forEach(x => restore(x))) });
        else toast([paid && `Đã ghi chi ${moneyShort(data.amount)}`, sp && `Lần tới: ${dm(sp.data.due)}`].filter(Boolean).join(". ") || (r ? "Đã lưu" : "Đã thêm việc"));
      });
      const del = $("[data-del]", b); if (del) del.addEventListener("click", () => confirmDelete(id, "việc"));
      if (!r) setTimeout(() => $("[name=title]", b).focus(), 280);
    }
  });
}

/* ---------- việc: thao tác nhanh, dời ngày ----------
   Giữ lâu một dòng việc (điện thoại), chuột phải (máy tính) hoặc nút ⋯: sheet "dời sang hôm nay / mai / cuối tuần / tuần sau",
   chọn ngày ngay trên lịch tháng, xong, sửa, xóa. Mọi lần dời đều có Hoàn tác. Chỉ đổi data.due, không thêm trường mới. */
/* Các ngày dời nhanh, bỏ ngày trùng nhau và trùng hạn hiện tại. Thứ 7, Chủ nhật thì "cuối tuần" là thứ 7 tuần sau. */
function postponeTargets(cur) {
  const td = today(), ws = weekStart(td), dw = parseYmd(td).getDay();
  const list = [["Hôm nay", td], ["Ngày mai", addDays(td, 1)], ["Cuối tuần", addDays(ws, dw === 6 || dw === 0 ? 12 : 5)], ["Tuần sau", addDays(ws, 7)]];
  const seen = new Set([cur || ""]);
  return list.filter(([, d]) => !seen.has(d) && seen.add(d));
}
function moveTask(id, d) {
  const r = db[id]; if (!r || r.kind !== "task" || !YMD_RE.test(d || "")) return false;
  if (r.data.due === d) return false;
  const snap = JSON.parse(JSON.stringify(r));
  put("task", { ...r.data, due: d }, id);
  buzz();
  toast(`Đã dời sang ${dueLabel(d, today())}`, { label: "Hoàn tác", fn: () => restore(snap) });
  return true;
}
/* Dời mọi việc quá hạn (Cần làm) sang hôm nay, một lần vẽ lại, Hoàn tác trả lại hạn cũ cho cả nhóm */
function moveOverdue() {
  const td = today(), list = all("task").filter(t => t.data.status === "todo" && t.data.due && t.data.due < td);
  if (!list.length) return 0;
  const snaps = list.map(r => JSON.parse(JSON.stringify(r)));
  batch(() => list.forEach(r => put("task", { ...r.data, due: td }, r.id)));
  buzz();
  toast(`Đã dời ${list.length} việc sang hôm nay`, { label: "Hoàn tác", fn: () => batch(() => snaps.forEach(s => restore(s))) });
  return list.length;
}
/* Chế độ chọn ngày trên lịch tháng: ui.moveId là việc đang dời; bấm ô ngày là dời, Hủy / Escape / đổi tab là thôi */
const moveTarget = () => { const r = ui.moveId && db[ui.moveId]; if (r && !r.deleted && r.kind === "task") return r; ui.moveId = null; return null; };
function startMovePick(id) {
  const r = db[id]; if (!r || r.deleted) return;
  const d = r.data.due || today();
  ui.moveId = id; ui.tab = "cal"; ui.calView = "month"; ui.calMonth = d.slice(0, 7); ui.calSel = d; LS.set("tab", "cal");
  render(); window.scrollTo(0, 0);
}
function taskActions(id) {
  const r = db[id]; if (!r || r.deleted || r.kind !== "task") return;
  const t = r.data, due = dueInfo(t), done = t.status === "done", pt = postponeTargets(t.due);
  const meta =[t.tag && esc(t.tag), due.text && `<span class="${due.cls}">${esc(due.text)}</span>`, t.repeat && `↻ ${esc(REPEAT_NAME[t.repeat] || "")}`].filter(Boolean).join(" · ");
  openSheet({
    title: t.title || "Việc", color: "var(--task)",
    html: `${meta ? `<div class="small mut" style="margin:-4px 0 12px">${meta}</div>` : ""}
      ${done ? "" : `<div class="lbl">Dời sang</div><div class="tacts">${pt.map(([n, d]) =>
        `<button type="button" data-ta="due" data-d="${esc(d)}"><b>${esc(n)}</b><span>${esc(DOW[parseYmd(d).getDay()])} ${esc(dm(d))}</span></button>`).join("")}
        <button type="button" data-ta="pick"${pt.length % 2 ? "" : ' class="wide"'}><b>Chọn trên lịch</b><span>Bấm ô ngày mới</span></button></div>`}
      <div class="tacts tacts-more">
        <button type="button" data-ta="done"><b>${done ? "Chưa xong" : "Xong"}</b></button>
        <button type="button" data-ta="edit"><b>Sửa</b></button>
        <button type="button" data-ta="del" class="danger"><b>Xóa</b></button>
      </div>`,
    onMount(b) {
      b.addEventListener("click", e => {
        const x = e.target.closest("[data-ta]"); if (!x || !db[id]) return;
        const a = x.dataset.ta;
        if (a === "due") { closeSheet(); moveTask(id, x.dataset.d); }
        else if (a === "pick") { closeSheet(); startMovePick(id); }
        else if (a === "done") { closeSheet(); toggleTask(id); }
        else if (a === "edit") taskForm(id);
        else if (a === "del") confirmDelete(id, "việc");
      });
    }
  });
}
/* Giữ lâu (480ms, không xê dịch quá 10px) trên dòng việc thì mở thao tác nhanh. Nhấc tay ra trình duyệt vẫn gửi một click
   (lúc đó rơi vào lớp phủ của sheet và sẽ đóng sheet), nên click ngay sau lần giữ lâu bị bỏ. */
const LP_SEL = '[data-edit="task"][data-id]';
let lp = null, lpSwallow = false;
const lpCancel = () => { if (lp) { clearTimeout(lp.t); lp = null; } };
document.addEventListener("pointerdown", e => {
  lpSwallow = false; lpCancel();
  if (e.button > 0 || sheetEl || !e.target.closest) return;
  const row = e.target.closest(LP_SEL); if (!row || e.target.closest("button, a, input")) return;
  const id = row.dataset.id;
  lp = { x: e.clientX, y: e.clientY, t: setTimeout(() => { lp = null; lpSwallow = true; buzz(15); taskActions(id); }, 480) };
});
document.addEventListener("pointermove", e => { if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 10) lpCancel(); }, { passive: true });
document.addEventListener("pointerup", lpCancel);
document.addEventListener("pointercancel", lpCancel);
window.addEventListener("scroll", lpCancel, { passive: true });
document.addEventListener("contextmenu", e => {
  if (lpSwallow) { e.preventDefault(); return; }   // Android gửi contextmenu sau khi đã mở bằng giữ lâu
  const row = e.target.closest && e.target.closest(LP_SEL); if (!row || sheetEl) return;
  e.preventDefault(); lpCancel(); lpSwallow = true; taskActions(row.dataset.id);   // click (nếu có) sau contextmenu cũng bỏ
});
document.addEventListener("keydown", e => { lpSwallow = false; if (e.key === "Escape" && !sheetEl && ui.moveId) { ui.moveId = null; render(); } }, true);
document.addEventListener("click", e => { if (lpSwallow) { lpSwallow = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);

/* ---------- form: môn học ---------- */
function classForm(id, preset, opts = {}) {
  const r = id ? db[id] : null;
  // giờ mặc định theo kiểu tiết đang dùng: đại học tiết 2-4 (07:00-09:50), phổ thông / tự đặt tiết 1-3
  const tk = getSetting("tiet", "") || (persona() === "hs" ? "thpt" : "bk"), t0 = tk === "bk" ? 2 : 1, hs = persona() === "hs";
  const c = r ? JSON.parse(JSON.stringify(r.data)) : { title: "", code: "", group: "", days: [ui.calDay], start: tietStart(t0), end: tietEnd(t0 + 2), room: "", teacher: "", note: "", ...(preset || {}) };
  const st = { days: (c.days || []).slice() };
  const nT = tk === "thpt" ? 10 : 16, sv = persona() === "sv";
  const tietOpts = n => Array.from({ length: nT }, (_, i) => i + 1).map(i => `<option value="${i}" ${i === n ? "selected" : ""}>Tiết ${i}</option>`).join("");
  // học sinh ít dùng mã môn và tuần học: để trong "Thêm chi tiết"
  const codeRow = `<div class="f2 f"><div><label class="lbl">Mã môn</label><input name="code" value="${esc(c.code)}" placeholder="${hs ? "Không bắt buộc" : "EE3001"}" autocapitalize="characters"></div><div><label class="lbl">${hs ? "Lớp" : "Nhóm / lớp"}</label><input name="group" value="${esc(c.group)}" placeholder="${hs ? "VD: 10A1" : "L01"}" autocapitalize="characters"></div></div>`;
  const weeksRow = `<div class="f"><label>Tuần học (để trống = tuần nào cũng học)</label><input name="weeks" value="${esc(weeksText(c.weeks))}" placeholder="VD: 35-42, 44-50" inputmode="numeric">
        <div class="hint">Số tuần trong năm${sv ? `, như cột "Tuần học" trên MyBK` : ""}. Tuần này là tuần ${isoWeek(today())}.</div></div>`;
  const guessT = (time, isEnd) => { const m = toMin(time); if (m == null) return 1; let best = 1, bd = 1e9; for (let i = 1; i <= nT; i++) { const d = Math.abs(toMin(isEnd ? tietEnd(i) : tietStart(i)) - m); if (d < bd) { bd = d; best = i; } } return best; };
  openSheet({
    title: r ? "Sửa môn học" : opts.fromDate ? "Thêm vào lịch" : "Thêm môn học", color: "var(--cls)",
    html: `${!r && opts.fromDate ? addSwitch("class", opts.fromDate) : ""}
      <div class="f"><input name="title" placeholder="Tên môn" value="${esc(c.title)}" autocomplete="off"></div>
${hs ? "" : codeRow}
      <div class="f"><label>Học vào thứ</label>${pills("days", WEEK_ORDER.map(d => [d, DOW[d]]), st.days, "data-multi data-num")}</div>
      <div class="f"><label>Tiết</label><div class="f2"><select name="t1">${tietOpts(guessT(c.start))}</select><select name="t2">${tietOpts(guessT(c.end, true))}</select></div>
        <div class="f2" style="margin-top:8px"><input type="time" name="start" value="${esc(c.start)}" aria-label="Giờ bắt đầu"><input type="time" name="end" value="${esc(c.end)}" aria-label="Giờ kết thúc"></div>
        <div class="hint">Chọn tiết sẽ tự điền giờ theo ${tietLabel()}. Giờ khác thì sửa trực tiếp.</div></div>
${hs ? "" : weeksRow}
      <div class="f2 f"><div><label class="lbl">Phòng</label><input name="room" value="${esc(c.room)}" placeholder="${hs ? "VD: Phòng 12" : "H6-301"}"></div><div><label class="lbl">${hs ? "Giáo viên" : "Giảng viên"}</label><input name="teacher" value="${esc(c.teacher)}" placeholder="${hs ? "Cô …" : "Thầy …"}"></div></div>
      <div class="f"><label>Ghi chú</label><textarea name="note" placeholder="${sv ? "Link MS Teams, BKeL, cách tính điểm…" : hs ? "Sách vở cần mang, lịch kiểm tra…" : "Link học online, cách tính điểm…"}">${esc(c.note)}</textarea></div>
      ${hs ? `<details class="more f" ${c.code || c.group || (c.weeks || []).length ? "open" : ""}><summary>Thêm chi tiết<small>Mã môn, lớp, tuần học</small></summary>${codeRow}${weeksRow}</details>` : ""}
      <div class="btns sheet-foot">${r ? `<button class="btn danger" data-del>Xóa</button>` : ""}<button class="btn pri" data-save>Lưu</button></div>`,
    onMount(b) {
      bindAddSwitch(b, "class");
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
function txForm(id, preset) {
  const r = id ? db[id] : null;
  const x = r ? JSON.parse(JSON.stringify(r.data)) : { type: "out", amount: 0, cat: "an", note: "", date: today(), ...(preset || {}) };
  const st = { type: x.type || "out", cat: x.cat || "an" };
  const recentNotes = [...new Set(all("tx").sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).map(t => t.data.note).filter(Boolean))].slice(0, 30);
  /* lưới 4 cột: biểu tượng trên, tên dưới (bindPills vẫn đọc data-pick="cat" / data-v như dạng pill) */
  const catPills = () => `<div class="pills catgrid" data-pick="cat" role="group" aria-label="Danh mục">${(st.type === "in" ? IN_CATS : OUT_CATS).map(([k, n, e]) =>
    `<button type="button" class="${st.cat === k ? "on" : ""}" data-v="${esc(k)}"><span class="e" aria-hidden="true">${esc(e)}</span><span class="n">${esc(n)}</span></button>`).join("")}</div>`;
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
      <details class="more f" ${x.date && x.date !== today() ? "open" : ""}><summary>Thêm chi tiết<small data-datesum>Ngày: ${x.date && x.date !== today() ? esc(dm(x.date)) : "hôm nay"}</small></summary>
        <div class="f"><label>Ngày</label><input type="date" name="date" value="${esc(x.date)}"></div></details>
      <div class="btns sheet-foot${r ? " foot3" : ""}">${r ? `<button class="btn danger" data-del>Xóa</button><button class="btn" data-dup aria-label="Ghi thêm khoản này cho hôm nay">Thêm hôm nay</button>` : ""}<button class="btn pri" data-save>Lưu</button></div>`,
    onMount(b) {
      const amt = $("[name=amount]", b), prev = $("[data-preview]", b);
      // khoản cũ, chi lại y như vậy hôm nay (cùng số tiền, loại, ghi chú đang có trong form): một chạm, không sửa khoản cũ
      const dup = $("[data-dup]", b);
      if (dup) dup.addEventListener("click", () => {
        const v = parseMoney(amt.value);
        if (!v) { amt.focus(); toast("Nhập số tiền"); return; }
        const note = $("[name=note]", b).value.trim();
        const nr = put("tx", { type: st.type, amount: v, cat: st.cat, note, date: today(), at: Date.now() });
        if (ui.tab === "money" && ui.month !== today().slice(0, 7)) { ui.month = today().slice(0, 7); render(); }
        closeSheet(); buzz();
        toast(`Đã ghi lại hôm nay: ${note || (CAT[st.cat] || ["", "Khác"])[1]} ${moneyShort(v)}`, { label: "Hoàn tác", fn: () => remove(nr.id) });
      });
      $("[name=date]", b).addEventListener("change", e => { const v = e.target.value; $("[data-datesum]", b).textContent = "Ngày: " + (!v || v === today() ? "hôm nay" : dm(v)); });
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
      <div class="f"><label>Từng loại (không bắt buộc)</label><div class="catb">${OUT_CATS.map(([k, n, e]) => `<label><span>${esc(e)} ${esc(n)}</span><input inputmode="decimal" data-cb="${esc(k)}" value="${esc(moneyEdit(cb[k]))}" placeholder="Không đặt" aria-label="Ngân sách ${esc(n)}"></label>`).join("")}</div>
        <div class="hint">Gõ 1,5tr hoặc 500k. Vượt mức thì thanh của loại đó chuyển đỏ.</div></div>
      <div class="btns sheet-foot">${cur ? `<button class="btn" data-clear>Bỏ ngân sách</button>` : ""}<button class="btn pri" data-save>Lưu</button></div>`,
    onMount(b) {
      const inp = $("[name=b]", b), p = $("[data-p]", b);
      const upd = () => { const v = parseMoney(inp.value); p.textContent = v ? "= " + money(v) + " mỗi tháng" : "Gõ 3tr = 3.000.000đ"; };
      inp.addEventListener("input", upd); upd();
      $("[data-save]", b).addEventListener("click", () => {
        // ô gõ mà không đọc được thì báo, không bỏ âm thầm
        const bad = [inp, ...$$("[data-cb]", b)].find(x => x.value.trim() && !parseMoney(x.value));
        if (bad) { bad.focus(); toast(`Chưa hiểu số tiền "${bad.value.trim()}". Gõ kiểu 1,5tr, 2tr5 hoặc 500k`); return; }
        const o = {}; $$("[data-cb]", b).forEach(x => { const v = parseMoney(x.value); if (v) o[x.dataset.cb] = v; });
        setSetting("budget", parseMoney(inp.value)); setSetting("catBudget", o); closeSheet(); toast("Đã lưu ngân sách");
      });
      const c = $("[data-clear]", b); if (c) c.addEventListener("click", () => { setSetting("budget", 0); closeSheet(); });
      setTimeout(() => inp.focus(), 280);
    }
  });
}

/* ---------- form: buổi tập ---------- */
/* Hẹn giờ nghỉ giữa hiệp, dùng chung cho form buổi tập và sheet ngày. Mức nghỉ nhớ theo máy (LS gymRest).
   Chạm một mức: chọn và chạy ngay; chạm lại mức đang chọn: tắt. kick(): chạy lại từ đầu nếu đã chọn mức (sheet ngày gọi sau mỗi lần tick).
   Hết giờ thì kêu, rung; mức đã chọn vẫn giữ. */
function restTimer() {
  const LV = [[60, "1 phút"], [90, "1 phút 30"], [120, "2 phút"], [180, "3 phút"]];
  const saved = +LS.get("gymRest", 0) || 0;
  let level = LV.some(x => x[0] === saved) ? saved : 0, t = null, actx = null, root = null;
  const html = `<div class="f"><label>Hẹn giờ nghỉ giữa hiệp</label><div class="pills" data-rest style="--c:var(--gym)">${LV.map(([s, l]) => `<button type="button" class="${s === level ? "on" : ""}" data-s="${s}">${l}</button>`).join("")}</div></div>`;
  /* khối đồng hồ đặt ở cuối sheet (con trực tiếp của .sheet-b) để dính đáy màn hình khi đang chạy, cuộn tới bài nào cũng thấy */
  const box = `<div class="rest" data-restbox role="timer" aria-live="off" hidden><span class="small">Nghỉ giữa hiệp</span><b class="num" data-restv>0:00</b><button type="button" class="link" data-reststop style="--c:var(--mut)">Dừng</button></div>`;
  const beep = () => { try { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(actx.destination); g.gain.setValueAtTime(.25, actx.currentTime); o.start(); o.stop(actx.currentTime + .25); setTimeout(() => { try { const o2 = actx.createOscillator(); o2.frequency.value = 1175; o2.connect(g); o2.start(); o2.stop(actx.currentTime + .3); } catch {} }, 320); } catch {} };
  const stop = () => { clearInterval(t); t = null; const bx = root && $("[data-restbox]", root); if (bx) bx.hidden = true; };
  const run = () => {
    if (!level || !root || !document.body.contains(root)) return;
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume && actx.resume(); } catch {}
    stop(); $("[data-restbox]", root).hidden = false;
    const endAt = Date.now() + level * 1000, v = $("[data-restv]", root);
    const step = () => {
      if (!document.body.contains(root)) { stop(); return; }
      const left = Math.max(0, Math.round((endAt - Date.now()) / 1000));
      v.textContent = `${Math.floor(left / 60)}:${pad(left % 60)}`;
      if (!left) { stop(); buzz([220, 120, 220]); beep(); toast("Hết giờ nghỉ, vào hiệp tiếp!"); }
    };
    step(); t = setInterval(step, 250);
  };
  function bind(b) {
    root = b;
    $("[data-rest]", b).addEventListener("click", e => {
      const btn = e.target.closest("button[data-s]"); if (!btn) return;
      const s = +btn.dataset.s;
      level = level === s ? 0 : s; LS.set("gymRest", level);
      $$("[data-rest] button", b).forEach(x => x.classList.toggle("on", +x.dataset.s === level));
      if (level) run(); else stop();
    });
    $("[data-reststop]", b).addEventListener("click", stop);
  }
  return { html, box, bind, kick: run };
}
/* Form ghi/sửa cả buổi. Mỗi dòng bài giữ nguyên các trường gắn với giáo án (pi, hs, tgt) và ghi chú bài;
   đổi tên bài thì bỏ phần gắn giáo án, đổi số hiệp thì đánh lại hs = 0..n-1. Bài chỉ có ghi chú (chưa có hiệp) vẫn được giữ. */
function workoutForm(id, preset) {
  const r = id ? db[id] : null;
  const w = r ? JSON.parse(JSON.stringify(r.data)) : { date: today(), items: [], mins: "", note: "", ...(preset || {}) };
  let items = (w.items || []).filter(i => i && typeof i === "object").map(i => ({ ex: String(i.ex ?? ""), sets: (i.sets || []).join(" "), kg: i.kg || "", note: String(i.note ?? ""), base: i }));
  const lastSess = sessions().find(s => s.id !== id);
  if (!items.length) items = [{ ex: "Hít xà", sets: "", kg: "", note: "", base: null }];
  const known = [...new Set([...EXERCISES.map(e => e[0]), ...sessions().flatMap(s => (s.data.items || []).map(i => i.ex))])];
  const rt = restTimer();
  const exRow = (it, i) => {
    const custom = it.ex && !known.includes(it.ex);
    return `<div class="ex-row" data-i="${i}">
      <div class="hd"><select data-ex>${known.map(e => `<option ${e === it.ex ? "selected" : ""}>${esc(e)}</option>`).join("")}<option value="__new" ${custom ? "selected" : ""}>Bài khác…</option></select>
      <button type="button" class="rm" data-rm aria-label="Bỏ bài">×</button></div>
      <input data-custom placeholder="Tên bài" value="${custom ? esc(it.ex) : ""}" ${custom ? "" : "hidden"} style="margin-bottom:8px">
      <div class="f2"><input data-sets inputmode="text" placeholder="${esc(setsPh(it.ex))}" value="${esc(it.sets)}"><input data-kg inputmode="decimal" placeholder="kg" value="${esc(it.kg)}"></div>
      ${it.base && it.base.tgt ? `<div class="hint">Mục tiêu ${esc(it.base.tgt)}</div>` : ""}
      <input data-note class="ex-note" placeholder="Ghi chú bài" aria-label="Ghi chú bài" value="${esc(it.note)}">
    </div>`;
  };
  openSheet({
    title: `${r ? "Sửa buổi tập" : "Ghi buổi tập"}${w.pname ? ` · ${w.pname}` : ""}`, color: "var(--gym)",
    html: `
      <div class="f2 f"><div><label class="lbl">Ngày</label><input type="date" name="date" value="${esc(w.date)}"></div><div><label class="lbl">Thời gian (phút)</label><input name="mins" inputmode="numeric" value="${esc(w.mins)}" placeholder="45"></div></div>
      ${!r && lastSess ? `<button type="button" class="btn block f" data-repeat style="font-size:var(--fs-sm)">Lặp lại bài của buổi trước (${dm(lastSess.data.date)})</button>` : ""}
      <div data-items>${items.map(exRow).join("")}</div>
      <button type="button" class="btn btn-sm f" data-add>+ Thêm bài</button>
      ${rt.html}
      <div class="f"><label>Ghi chú</label><textarea name="note" placeholder="Cảm giác, chỗ cần cải thiện…">${esc(w.note)}</textarea></div>
      ${rt.box}
      <div class="btns sheet-foot">${r ? `<button class="btn danger" data-del>Xóa</button>` : ""}<button class="btn pri" data-save>Lưu</button></div>`,
    onMount(b) {
      const box = $("[data-items]", b);
      const read = () => $$(".ex-row", box).map(row => {
        const sel = $("[data-ex]", row).value, it = items[+row.dataset.i] || {};
        return { ex: sel === "__new" ? $("[data-custom]", row).value.trim() : sel, sets: $("[data-sets]", row).value, kg: $("[data-kg]", row).value, note: $("[data-note]", row).value, base: it.base || null };
      });
      const redraw = () => { box.innerHTML = items.map(exRow).join(""); };
      box.addEventListener("change", e => {
        if (e.target.matches("[data-ex]")) {
          const row = e.target.closest(".ex-row"), isNew = e.target.value === "__new";
          $("[data-custom]", row).hidden = !isNew; if (isNew) $("[data-custom]", row).focus();
          $("[data-sets]", row).placeholder = setsPh(e.target.value);
        }
      });
      box.addEventListener("click", e => { if (e.target.closest("[data-rm]")) { items = read(); items.splice(+e.target.closest(".ex-row").dataset.i, 1); redraw(); } });
      $("[data-add]", b).addEventListener("click", () => {
        items = read();
        const used = items.map(i => i.ex);
        items.push({ ex: known.find(e => !used.includes(e)) || known[0], sets: "", kg: "", note: "", base: null });
        redraw(); $$("[data-sets]", box).pop().focus();
      });
      rt.bind(b);
      const rep = $("[data-repeat]", b);
      if (rep) rep.addEventListener("click", () => { items = (lastSess.data.items || []).map(i => ({ ex: i.ex, sets: "", kg: i.kg || "", note: "", base: null })); redraw(); rep.remove(); });
      $("[data-save]", b).addEventListener("click", () => {
        const list = read().map(i => {
          const b0 = i.base || {}, sets = parseSets(i.sets), note = String(i.note || "").trim();
          const out = { ...b0, ex: i.ex, sets, kg: parseFloat(String(i.kg).replace(",", ".")) || 0 };
          if (note || "note" in b0) out.note = note;
          if (i.base && norm(b0.ex) !== norm(i.ex)) { delete out.pi; delete out.hs; delete out.tgt; }   // đổi sang bài khác: không còn là bài đó của giáo án
          else if (Array.isArray(b0.hs) && b0.hs.length !== sets.length) out.hs = sets.map((_, k) => k);
          return out;
        }).filter(i => i.ex && (i.sets.length || i.note));
        const note = $("[name=note]", b).value.trim();
        if (!list.length && !note) { toast("Nhập số lần cho ít nhất một bài"); return; }
        const prev = {};
        sessions().filter(x => x.id !== id).forEach(x => (x.data.items || []).forEach(i => (i.sets || []).forEach(n => { if (n > (prev[i.ex] || 0)) prev[i.ex] = n; })));
        const prs = []; list.forEach(i => { if (!i.sets.length) return; const best = Math.max(...i.sets); if (prev[i.ex] && best > prev[i.ex] && !prs.some(p => p.ex === i.ex)) prs.push({ ex: i.ex, best, old: prev[i.ex] }); });
        put("workout", { ...w, date: $("[name=date]", b).value || today(), mins: parseInt($("[name=mins]", b).value, 10) || "", items: list, note }, id);
        closeSheet();
        if (prs.length) { buzz([30, 60, 30]); toast(`Kỷ lục mới: ${prs.map(p => `${p.ex} ${p.best} ${exUnit(p.ex)} (cũ ${p.old})`).join(", ")}`); }
        else toast(r ? "Đã lưu" : "Đã ghi buổi tập");
      });
      const del = $("[data-del]", b); if (del) del.addEventListener("click", () => confirmDelete(id, "buổi tập"));
    }
  });
}

function weightForm(id, preset) {
  const r = id ? db[id] : null;
  const last = all("weight").sort((a, b) => (b.data.date || "").localeCompare(a.data.date || ""))[0];
  const w = r ? { ...r.data } : { date: today(), kg: last ? last.data.kg : "", ...(preset || {}) };
  const goalKg = +getSetting("weightGoal", 0) || 0;
  openSheet({
    title: r ? "Sửa cân nặng" : "Ghi cân nặng", color: "var(--gym)",
    html: `<div class="f"><input class="amount-in num" name="kg" inputmode="decimal" value="${w.kg !== "" ? esc(String(w.kg).replace(".", ",")) : ""}" placeholder="kg" aria-label="Cân nặng (kg)"></div>
      <div class="f"><label>Ngày</label><input type="date" name="date" value="${esc(w.date)}"></div>
      <div class="f"><label>Mục tiêu (kg)</label><input name="goal" inputmode="decimal" value="${goalKg ? esc(String(goalKg).replace(".", ",")) : ""}" placeholder="Không đặt"></div>
      <div class="hint">Cân vào cùng một thời điểm (sáng, trước khi ăn) để so sánh chính xác.</div>
      <div class="btns sheet-foot">${r ? `<button class="btn danger" data-del>Xóa</button>` : ""}<button class="btn pri" data-save>Lưu</button></div>`,
    onMount(b) {
      const inp = $("[name=kg]", b);
      $("[data-save]", b).addEventListener("click", () => {
        const kg = Math.round(parseFloat(inp.value.replace(",", ".")) * 10) / 10;
        if (!(kg > 20 && kg < 300)) { inp.focus(); toast("Nhập cân nặng hợp lệ, VD 65,5"); return; }
        const gIn = $("[name=goal]", b), gRaw = gIn.value.trim(), goal = gRaw ? Math.round(parseFloat(gRaw.replace(",", ".")) * 10) / 10 : 0;
        if (gRaw && !(goal > 20 && goal < 300)) { gIn.focus(); toast("Mục tiêu chưa hợp lệ, VD 70"); return; }
        const date = $("[name=date]", b).value || today();
        const same = !r && all("weight").find(x => x.data.date === date);
        batch(() => { put("weight", { date, kg }, r ? id : same ? same.id : undefined); if (goal !== goalKg) setSetting("weightGoal", goal); });
        closeSheet(); toast(`Đã ghi ${kg.toLocaleString("vi-VN")} kg`);
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
        <div class="card-h"><b style="font-size:var(--fs-md)">${esc(c.data.name || "Không tên")}</b>
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
  const fRow = (f, i) => `<div class="sub-row doc-row" data-i="${i}"><input data-k value="${esc(f.k)}" placeholder="Tên mục"><input data-v value="${esc(f.v)}" placeholder="Nội dung"><button type="button" class="rm" data-rm aria-label="${esc(`Bỏ mục ${f.k || ""}`.trim())}">×</button></div>`;
  openSheet({
    title: r ? "Sửa thông tin" : "Thêm người", full: true, color: "var(--fg)",
    html: `<div class="f"><label>Tên thẻ</label><input name="name" value="${esc(d.name)}" placeholder="VD: Tôi, Nghi, Mẹ"></div>
      <div class="f"><label>Thông tin</label><div data-fields>${fields.map(fRow).join("")}</div>
      <button type="button" class="btn btn-sm" data-add>+ Thêm mục</button></div>
      <div class="hint f">Gợi ý thêm: Ngày sinh, Quê quán, Địa chỉ, Mã BHYT, Số tài khoản nhận học bổng. Dữ liệu chỉ nằm trên máy bạn và Supabase của riêng bạn.</div>
      <div class="btns sheet-foot">${r ? `<button class="btn danger" data-del>Xóa</button>` : ""}<button class="btn pri" data-save>Lưu</button></div>`,
    onMount(b) {
      const box = $("[data-fields]", b);
      const read = () => $$(".sub-row", box).map(row => ({ k: $("[data-k]", row).value.trim(), v: $("[data-v]", row).value.trim() }));
      box.addEventListener("click", e => {
        if (!e.target.closest("[data-rm]")) return;
        fields = read(); const i = +e.target.closest(".sub-row").dataset.i, [gone] = fields.splice(i, 1); box.innerHTML = fields.map(fRow).join("");
        // bỏ nhầm thì Hoàn tác (chỉ trong form, chưa lưu)
        if (gone && (gone.k || gone.v)) toast(`Đã bỏ mục ${gone.k || gone.v}`, { label: "Hoàn tác", fn: () => { if (!box.isConnected) return; fields = read(); fields.splice(Math.min(i, fields.length), 0, gone); box.innerHTML = fields.map(fRow).join(""); } });
      });
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
  const counts = { task: all("task").length, class: all("class").length, tx: all("tx").length, workout: all("workout").length, doc: all("doc").length, weight: all("weight").length, goal: all("goal").length, gymplan: all("gymplan").length };
  const store = storeInfo();
  let syncBox;
  if (!hasCfg) syncBox = `<div class="small mut">Chưa điền <b>config.js</b>, nên dữ liệu chỉ nằm trên máy này. Xem README.md để bật đồng bộ giữa hai điện thoại.</div>`;
  else if (sync.user) syncBox = `<div class="small" style="margin-bottom:10px">Đăng nhập: <b>${esc(sync.user.email || "")}</b></div>${sync.hold ? `<button class="btn block" data-accthold style="margin-bottom:10px">Chọn cách xử lý dữ liệu trên máy</button>` : ""}
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
      <section class="card"><div class="card-h"><h2>Thông báo nhắc hạn</h2></div><div data-pushbox><div class="small mut">Đang kiểm tra…</div></div></section>
      <section class="card"><div class="card-h"><h2>Dành cho bạn</h2></div>
        <div class="f"><label>Bạn đang là</label>${pills("persona", PERSONAS.map(([k, n, e]) => [k, `${e} ${n}`]), persona())}</div>
        <div class="f"><label>Mục hiển thị</label>
          ${[["cal", "Lịch học (thời khóa biểu)"], ["gym", "Tập luyện, cân nặng"], ["doc", "Giấy tờ"]].map(([k, n]) => `<button class="switch ${mod(k) ? "on" : ""}" data-mod="${k}" style="margin-bottom:6px"><span>${n}</span><span class="tg"></span></button>`).join("")}</div>
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
        <div class="small mut" style="margin-bottom:10px">${counts.task} việc · ${counts.class} môn · ${counts.tx} khoản tiền${counts.goal ? ` · ${counts.goal} mục tiêu` : ""} · ${counts.workout} buổi tập${counts.gymplan ? ` · ${counts.gymplan} giáo án` : ""}${counts.weight ? ` · ${counts.weight} lần cân` : ""} · ${counts.doc} thẻ giấy tờ</div>
        <div class="small mut" style="margin:-4px 0 10px" data-store>${esc(store)}</div>
        <div class="small ${lastExpOld ? "amber" : "mut"}" style="margin:-4px 0 10px">${lastExp ? `Lần xuất gần nhất: ${dm(ymd(new Date(lastExp)))}${lastExpOld ? ", đã hơn 30 ngày" : ""}` : "Chưa xuất bản sao lưu nào."}</div>
        <div class="btns wrap" style="margin-top:0"><button class="btn" data-export>Tải bản sao lưu</button><button class="btn" data-importbtn>Khôi phục từ file</button><input type="file" accept="application/json,.json" data-import hidden></div>
        <div class="small mut" style="margin:8px 0 10px">Khôi phục sẽ gộp vào dữ liệu đang có: mục nào sửa sau thì giữ bản đó, không xóa gì trên máy.</div>
        <button class="btn block" data-csv>Xuất chi tiêu ra Excel</button></section>
      <div class="foot">Hôm Nay ${APP_VERSION}</div>`,
    onMount(b) {
      const em = $("[name=email]", b), pw = $("[name=pw]", b);
      const auth = async kind => {
        const email = em.value.trim(), password = pw.value;
        if (!email || password.length < 6) { toast("Nhập email và mật khẩu (ít nhất 6 ký tự)"); return; }
        const fn = kind === "up" ? sync.sb.auth.signUp({ email, password }) : sync.sb.auth.signInWithPassword({ email, password });
        const { data, error } = await fn;
        if (error) { toast(viErr(error.message)); return; }
        if (kind === "up" && !data.session) { toast("Kiểm tra email để xác nhận, hoặc tắt Confirm email trong Supabase"); return; }
        closeSheet(); toast("Đã đăng nhập, đang đồng bộ…");
      };
      const si = $("[data-signin]", b); if (si) si.addEventListener("click", () => auth("in"));
      const su = $("[data-signup]", b); if (su) su.addEventListener("click", () => auth("up"));
      const so = $("[data-signout]", b); if (so) so.addEventListener("click", async () => { await sync.sb.auth.signOut(); closeSheet(); toast("Đã đăng xuất. Dữ liệu vẫn còn trên máy."); });
      const sn = $("[data-syncnow]", b); if (sn) sn.addEventListener("click", () => syncNow());
      const ah = $("[data-accthold]", b); if (ah) ah.addEventListener("click", acctSheet);
      $("[data-savename]", b).addEventListener("click", () => { setSetting("name", $("[name=name]", b).value.trim()); toast("Đã lưu"); });
      $("[data-export]", b).addEventListener("click", exportData);
      $("[data-ics]", b).addEventListener("click", icsSheet);
      $("[data-csv]", b).addEventListener("click", exportCsv);
      $("[data-cats]", b).addEventListener("click", catsSheet);
      renderPushCard($("[data-pushbox]", b));
      const stP = { persona: persona(), tiet: getSetting("tiet", "") || "bk" };
      bindPills(b, stP, (k, v) => {
        if (k === "persona") {
          applyPersona(v, true); settingsSheet();
          // Lịch học giữ nguyên; nếu hồ sơ mới thường dùng khác thì hỏi bằng nút trong thông báo
          const want = (PERSONA_DEFAULTS[v] || PERSONA_DEFAULTS.other).modules.cal;
          const setCal = on => { setSetting("modules", { cal: on, gym: mod("gym"), doc: mod("doc") }); if (sheetEl) settingsSheet(); toast(on ? "Đã bật Lịch học" : "Đã tắt Lịch học"); };
          if (want !== mod("cal")) toast(`Đã đổi hồ sơ, vẫn ${mod("cal") ? "giữ" : "tắt"} Lịch học`, { label: mod("cal") ? "Tắt Lịch học" : "Bật Lịch học", fn: () => setCal(!mod("cal")) });
          else toast("Đã đổi hồ sơ, danh mục đã được chỉnh theo lựa chọn");
        }
        if (k === "tiet") { setSetting("tiet", v); const c = $("[data-tietc]", b); if (c) c.hidden = v !== "custom"; }
      });
      $$("[data-mod]", b).forEach(x => x.addEventListener("click", () => { const m = { cal: mod("cal"), gym: mod("gym"), doc: mod("doc") }; m[x.dataset.mod] = !m[x.dataset.mod]; setSetting("modules", m); x.classList.toggle("on", m[x.dataset.mod]); }));
      const saveTc = () => { const [len, gap] = ($("[name=tc_len]", b).value || "45/5").split(/[\/\s,]+/).map(Number); setSetting("tietCustom", { start: $("[name=tc_start]", b).value || "07:00", len: len > 0 ? len : 45, gap: gap >= 0 ? gap : 5 }); };
      ["tc_start", "tc_len"].forEach(n => { const x = $(`[name=${n}]`, b); if (x) x.addEventListener("change", saveTc); });
      $("[data-theme]", b).addEventListener("click", e => { const x = e.target.closest("[data-v]"); if (!x) return; LS.set("theme", x.dataset.v); applyLook(); $$("[data-theme] button", b).forEach(y => y.classList.toggle("on", y === x)); });
      $("[data-big]", b).addEventListener("click", e => { const on = !LS.get("big", 0); LS.set("big", on ? 1 : 0); applyLook(); e.currentTarget.classList.toggle("on", on); });
      $("[data-importbtn]", b).addEventListener("click", () => $("[data-import]", b).click());
      $("[data-import]", b).addEventListener("change", e => { const f = e.target.files[0]; e.target.value = ""; if (f) importData(f); });
    }
  });
}
/* Dung lượng dữ liệu trên máy (đọc thẳng chuỗi đã lưu, không parse), số mục đã xóa còn giữ để đồng bộ và số mục đã dọn */
function storeInfo() {
  let len = 0; try { len = (localStorage.getItem("hn-db") || "").length + (localStorage.getItem("hn-queue") || "").length; } catch {}
  const kb = len / 1024, size = kb >= 1024 ? `${NF1.format(kb / 1024)} MB` : `${NF0.format(Math.max(1, Math.round(kb)))} KB`;
  let tomb = 0; for (const id in dbRaw) if (dbRaw[id] && dbRaw[id].deleted) tomb++;
  const gcN = +LS.get("gcN", 0) || 0;
  return `Trên máy: khoảng ${size}` + (tomb ? ` · ${NF0.format(tomb)} mục đã xóa (giữ để đồng bộ)` : "")
    + (gcN ? ` · đã tự dọn ${NF0.format(gcN)} mục xóa quá ${GC_DAYS} ngày` : "");
}
/* ---------- sao lưu và khôi phục ---------- */
async function exportData() {
  const rows = Object.values(db).filter(r => !r.deleted);
  const ok = await shareOrDownload(`hom-nay-${today()}.json`, JSON.stringify({ app: "hom-nay", version: 1, exportedAt: new Date().toISOString(), items: rows }, null, 1), "application/json");
  if (ok) { LS.set("lastExport", Date.now()); toast(`Đã tải bản sao lưu (${rows.length} mục)`); }
  return ok;
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/* Gộp bản sao lưu vào db: bản có updated_at mới hơn thắng, không xóa gì đang có.
   Trả về null nếu không phải file của Hôm Nay, ngược lại là số mục mới / cập nhật / giữ bản trên máy / trùng / lỗi. */
function mergeBackup(j) {
  const items = j && j.app === "hom-nay" && Array.isArray(j.items) ? j.items : Array.isArray(j) ? j : null;
  if (!items) return null;
  const st = { added: 0, updated: 0, kept: 0, same: 0, invalid: 0 };
  const maxAt = Date.now() + 864e5, take = [];
  for (const it of items) {
    const at = it && Date.parse(it.updated_at);
    if (!it || typeof it.id !== "string" || !UUID_RE.test(it.id) || typeof it.kind !== "string" || !/^[a-z_]{1,24}$/.test(it.kind)
      || !it.data || typeof it.data !== "object" || Array.isArray(it.data) || !(at > 0) || at > maxAt) { st.invalid++; continue; }
    if (it.deleted) continue;   // bản sao lưu không mang lệnh xóa
    const cur = db[it.id], cu = cur ? Date.parse(cur.updated_at) : 0;
    if (cur && cu === at) { st.same++; continue; }
    if (cur && cu > at) { st.kept++; continue; }
    st[cur ? "updated" : "added"]++;
    take.push({ id: it.id, kind: it.kind, data: normalize(it.kind, structuredClone(it.data)), deleted: false, updated_at: new Date(at).toISOString() });
  }
  for (const r of take) { db[r.id] = r; queue[r.id] = r.updated_at; }
  if (take.length) changed();
  return st;
}
async function importData(file) {
  let j;
  try { j = JSON.parse(await file.text()); } catch { toast("File không đọc được, hãy chọn file .json đã tải từ Hôm Nay"); return; }
  const st = mergeBackup(j);
  if (!st) { toast("Đây không phải bản sao lưu của Hôm Nay"); return; }
  closeSheet();
  toast(`Khôi phục xong: ${st.added} mục mới, ${st.updated} mục cập nhật`
    + (st.kept ? `, ${st.kept} mục trên máy mới hơn nên giữ nguyên` : "")
    + (st.invalid ? `, bỏ qua ${st.invalid} mục lỗi` : ""));
}

/* ---------- ghi nhanh bằng câu ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const QUICK_EX = {
  hs: ["trà sữa 25k", "kiểm tra Toán thứ 5", "học thêm 18h mỗi thứ 3", "mẹ cho 200k", "hít đất 20 15"],
  sv: ["cà phê 30k", "nộp BTL thứ 6 23h59", "tiền phòng 2tr5 ngày 5 hằng tháng", "mẹ gửi 3tr", "hít xà 10 8 8"],
  work: ["cà phê 30k", "họp 9h mai", "nộp báo cáo thứ 6 17h", "tiền nhà 3tr ngày 5 hằng tháng", "lương 15tr", "cân nặng 65,5"],
  biz: ["nhập hàng 2tr", "khách trả 500k", "giao hàng 9h mai", "tiền mặt bằng 5tr ngày 1 hằng tháng", "cà phê 30k"],
  other: ["cà phê 30k", "họp 9h mai", "tiền nhà 3tr ngày 5 hằng tháng", "lương 15tr", "đổ xăng 80k", "cân nặng 65,5"]
};
const KIND_ICON = { tx: "💸", task: "✅", workout: "💪", weight: "⚖️" };
function quickOpts() {
  const known = gpKnown();   // bài có sẵn, bài đã ghi và bài trong giáo án đã dán ("bench press 4x8 40kg")
  const history = all("tx").sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).slice(0, 400).map(r => ({ note: r.data.note || "", cat: r.data.cat, type: r.data.type }));
  return { exercises: known, history, customCats: getSetting("customCats", []) || [], validCats: [...OUT_CATS, ...IN_CATS].map(c => c[0]) };
}
/* Các khoản hiểu được từ ô ghi nhanh (một câu có thể ra nhiều khoản), đã áp nút đổi Chi ⇄ Thu */
function quickList() {
  const v = ($("#qIn") || {}).value || "";
  let q = null; const o = quickOpts();
  try { q = parseQuick(v, o); } catch { q = null; }
  if (!q) return [];
  const flips = ui.qFlip || {};
  return (q.items || [q]).map((x, i) => flips[i] ? quickFlip(x, o) : x);
}
function quickPreview() {
  const el = $("#qPrev"); if (!el) return;
  const v = ($("#qIn") || {}).value || "";
  if (!v.trim()) { el.innerHTML = `<div class="qex">${(QUICK_EX[persona()] || QUICK_EX.other).map(x => `<button data-act="qfill" data-v="${esc(x)}">${esc(x)}</button>`).join("")}</div>`; return; }
  const list = quickList();
  if (!list.length) { el.innerHTML = `<div class="small mut">Chưa hiểu câu này. Thử thêm số tiền (30k) hoặc thời gian (mai 9h).</div>`; return; }
  if (list.some(q => q.kind === "workout") && !mod("gym")) { el.innerHTML = `<div class="small mut">Mục Tập đang tắt trong Cài đặt.</div>`; return; }
  // bấm vào dòng: mở form đã điền sẵn để sửa thêm; nút ⇄ đổi khoản chi thành khoản thu và ngược lại
  el.innerHTML = `<div class="qres"><div class="qitems">${list.map((q, i) => `<div class="qrow">
      <button class="qopen" data-act="qopen" data-i="${i}" title="Mở để sửa chi tiết"><span class="qemo" aria-hidden="true">${esc(q.kind === "tx" && q.data.type === "in" ? "💰" : KIND_ICON[q.kind])}</span><span class="grow">${esc(q.text)}</span><span class="qgo" aria-hidden="true">›</span></button>
      ${q.kind === "tx" ? `<button class="qflip" data-act="qflip" data-i="${i}" aria-label="${q.data.type === "in" ? "Đổi thành khoản chi" : "Đổi thành khoản thu"}">⇄ ${q.data.type === "in" ? "Chi" : "Thu"}</button>` : ""}
    </div>`).join("")}</div><button class="btn pri" data-act="qsave">${list.length > 1 ? `Lưu ${list.length} khoản` : "Lưu"}</button></div>`;
}
function quickReset(text = "") {
  ui.qText = text; ui.qFlip = {};
  const qi = $("#qIn"); if (qi) qi.value = text;
  quickPreview();
}
function quickSave() {
  const list = quickList(); if (!list.length) return;
  const undos = [];
  for (const q of list) {
    if (q.kind === "tx") { const r = put("tx", { ...q.data, at: Date.now() }); undos.push(() => remove(r.id)); }
    else if (q.kind === "task") { const r = put("task", { ...q.data, createdAt: Date.now() }); undos.push(() => remove(r.id)); }
    else if (q.kind === "weight") { const same = all("weight").find(x => x.data.date === q.data.date); const snap = same && JSON.parse(JSON.stringify(same)); const r = put("weight", q.data, same ? same.id : undefined); undos.push(() => snap ? restore(snap) : remove(r.id)); }
    else if (q.kind === "workout") {
      const it = { ex: q.data.ex, sets: q.data.sets, kg: q.data.kg || 0, ...(q.data.note ? { note: q.data.note } : {}) };
      // nối vào buổi của chính ngày đó; buổi tập bù cho ngày khác chỉ dùng khi ngày này không có buổi giáo án
      const same = sessions().filter(x => x.data.date === q.data.date), gd = gymDay(q.data.date);
      const cur = same.find(x => !x.data.planDate || x.data.planDate === q.data.date) || (gd && !gd.rest ? null : same[0]);
      if (cur) { const snap = JSON.parse(JSON.stringify(cur)); put("workout", { ...cur.data, items: [...(cur.data.items || []), it] }, cur.id); undos.push(() => restore(snap)); }
      else { const r = put("workout", { date: q.data.date, mins: "", items: [it], note: "" }); undos.push(() => remove(r.id)); }
    }
  }
  // giữ ô nhập được chọn để ghi tiếp khoản sau
  quickReset(); const qi = $("#qIn"); if (qi) qi.focus();
  buzz(); toast(list.length > 1 ? `Đã ghi ${list.length} khoản` : `Đã ghi: ${list[0].text}`, { label: "Hoàn tác", fn: () => batch(() => undos.reverse().forEach(f => f())) });
}
/* Mở form tương ứng đã điền sẵn. Lưu trong form thì đoạn câu của khoản đó rời khỏi ô ghi nhanh, các khoản khác ở lại;
   đóng form mà không lưu thì ô ghi nhanh giữ nguyên (xem closeSheet). */
function quickOpen(i) {
  const list = quickList(), q = list[i]; if (!q) return;
  ui.qPending = { seq: putSeq, rest: list.length > 1 ? list.filter((_, j) => j !== i).map(x => x.src || "").filter(Boolean).join(", ") : "" };
  if (q.kind === "tx") txForm(null, q.data);
  else if (q.kind === "task") taskForm(null, q.data);
  else if (q.kind === "weight") weightForm(null, q.data);
  else if (q.kind === "workout") workoutForm(null, { date: q.data.date, items: [{ ex: q.data.ex, sets: q.data.sets, kg: q.data.kg || "", note: q.data.note || "" }] });
}
let recog = null;
function startMic(btn) {
  if (!SR) return;
  if (recog) { try { recog.stop(); } catch {} return; }
  recog = new SR(); recog.lang = "vi-VN"; recog.interimResults = true; recog.maxAlternatives = 1;
  btn.classList.add("on"); toast("Đang nghe… nói ví dụ: cà phê ba mươi nghìn");
  recog.onresult = e => { const t = [...e.results].map(r => r[0].transcript).join(" "); quickReset(t); };
  recog.onerror = e => { if (e.error === "not-allowed" || e.error === "service-not-allowed") toast("Chưa cho phép dùng micro. Bật quyền micro cho trình duyệt rồi thử lại."); };
  recog.onend = () => { recog = null; const b = $("[data-act=mic]"); if (b) b.classList.remove("on"); };
  try { recog.start(); } catch { recog = null; btn.classList.remove("on"); }
}
document.addEventListener("input", e => { if (e.target.id === "qIn") { ui.qText = e.target.value; ui.qFlip = {}; quickPreview(); } });
// bấm Lưu hay đổi Chi/Thu khi đang gõ: không rời ô nhập, bàn phím không bị đóng rồi mở lại
document.addEventListener("mousedown", e => { if (e.target.closest && e.target.closest("#qPrev [data-act=qflip], #qPrev [data-act=qsave]") && document.activeElement && document.activeElement.id === "qIn") e.preventDefault(); });
document.addEventListener("keydown", e => { if (e.target.id === "qIn" && e.key === "Enter" && !e.isComposing) { e.preventDefault(); quickSave(); } });

/* ---------- khoản phải trả: việc có số tiền, xong thì tự ghi chi ---------- */
/* Không ghi trùng: việc này đã có khoản chi tự ghi (Xong → bỏ Xong → Xong lại) thì thôi. Mỗi kỳ của việc lặp là một bản ghi riêng. */
const autoPaid = id => all("tx").filter(x => x.data.fromTask === id);
function payTask(r) {
  const d = r && r.data; if (!d || !(d.amount > 0) || autoPaid(r.id).length) return null;
  return put("tx", { type: "out", amount: d.amount, cat: d.cat || "khac", note: d.title, date: today(), at: Date.now(), fromTask: r.id });
}

/* ---------- mục tiêu tiết kiệm ---------- */
function goalForm(id) {
  const r = id ? db[id] : null;
  const g = r ? { ...r.data } : { name: "", emoji: "🎯", target: 0, saved: 0, deadline: "" };
  const pace = goalPace(g), left = pace.left;
  // dòng tóm tắt: mỗi tuần cần góp bao nhiêu để kịp hạn (xa hơn 2 tháng thì kèm số mỗi tháng); quá hạn thì nói rõ
  const paceTxt = !left ? "Đã đạt mục tiêu 🎉"
    : `Còn ${esc(money(left))}` + (pace.late ? `. <span class="red">Đã qua hạn ${esc(dm(g.deadline))}</span>, đổi ngày ở dưới nếu cần.`
    : pace.perWeek ? ` · mỗi tuần cần ~<b style="color:var(--fg)">${esc(moneyShort(pace.perWeek))}</b>${pace.days > 62 ? ` (~${esc(moneyShort(pace.perMonth))}/tháng)` : ""} để kịp ${esc(dm(g.deadline))}` : "");
  openSheet({
    title: r ? `${g.emoji} ${g.name}` : "Mục tiêu tiết kiệm", color: "var(--money)",
    html: `${r ? `<section class="card" style="--c:var(--money)">
        <div style="display:flex;justify-content:space-between;align-items:flex-end"><div><div class="small mut">Đã để dành</div><div class="big num">${money(g.saved || 0)}</div></div><div class="small mut" style="text-align:right">Mục tiêu<br><b class="num" style="color:var(--fg)">${money(g.target)}</b></div></div>
        <div class="mbar" style="margin:10px 0 6px"><i style="width:${Math.min(100, (g.saved || 0) / Math.max(1, g.target) * 100)}%"></i></div>
        <div class="small mut" data-pace>${paceTxt}</div></section>
      <div class="f"><label>Góp thêm</label><input class="amount-in num" name="add" inputmode="decimal" placeholder="0"><div class="pills" data-qa style="margin-top:8px">${pace.perWeek && ![100000, 500000, 1000000].includes(pace.perWeek) ? `<button type="button" data-a="${esc(pace.perWeek)}" data-week>Phần tuần này ${esc(moneyShort(pace.perWeek))}</button>` : ""}<button type="button" data-a="100000">100k</button><button type="button" data-a="500000">500k</button><button type="button" data-a="1000000">1tr</button><button type="button" data-a="-1">Rút ra</button></div></div>
      <label class="opt"><input type="checkbox" name="log" checked><span>Ghi vào Tiền, loại Tiết kiệm<small>Không tính vào số đã chi</small></span></label>
      <div class="btns" style="margin-bottom:14px"><button class="btn pri" data-contrib>Góp</button></div>
      <div class="group-h" style="margin-top:0">Sửa mục tiêu</div>` : ""}
      <div class="f2 f" style="grid-template-columns:64px 1fr"><div><label class="lbl">Biểu tượng</label><input name="emoji" value="${esc(g.emoji)}" maxlength="4" style="text-align:center"></div><div><label class="lbl">Tên</label><input name="name" value="${esc(g.name)}" placeholder="VD: Laptop mới, Du lịch Đà Lạt, Quỹ khẩn cấp"></div></div>
      <div class="f2 f"><div><label class="lbl">Cần bao nhiêu</label><input name="target" inputmode="decimal" value="${esc(moneyEdit(g.target))}" placeholder="VD: 25tr"></div><div><label class="lbl">Đến ngày (không bắt buộc)</label><input type="date" name="deadline" value="${esc(g.deadline)}"></div></div>
      ${r ? "" : `<div class="f"><label class="lbl">Đã có sẵn (không bắt buộc)</label><input name="saved" inputmode="decimal" placeholder="0"></div>`}
      <div class="btns sheet-foot">${r ? `<button class="btn danger" data-del>Xóa</button>` : ""}<button class="btn ${r ? "" : "pri"}" data-save>${r ? "Lưu thay đổi" : "Tạo mục tiêu"}</button></div>`,
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
        const np = goalPace({ ...cur, saved: after });
        toast(after >= cur.target && before < cur.target ? `Hoàn thành mục tiêu ${cur.name}! 🎉` : `${sign > 0 ? "Đã góp" : "Đã rút"} ${moneyShort(v)} · ${Math.round(after / Math.max(1, cur.target) * 100)}%${np.perWeek ? `, mỗi tuần còn cần ~${moneyShort(np.perWeek)}` : ""}`);
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
  const row = (c, isCustom) => `<div class="row"><div class="emo">${esc(c[2])}</div><div class="grow"><div class="t">${esc(c[1])}</div></div>
    ${isCustom ? `<button class="link small" style="--c:var(--danger)" data-rmcat="${esc(c[0])}">Xóa</button>` : c[0] === "khac" || c[0] === "thukhac" ? "" : `<button class="switch-mini ${hidden.has(c[0]) ? "" : "on"}" data-hide="${esc(c[0])}" aria-label="Hiện ${esc(c[1])}"><span></span></button>`}</div>`;
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

/* ---------- thông báo nhắc hạn (Web Push qua Supabase) ---------- */
const pushOK = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const isStandalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
const PUSH_PREFS = [["d1", "Trước 1 ngày", "Việc có giờ"], ["h2", "Trước 2 tiếng", "Việc có giờ"], ["m15", "Trước 15 phút", "Việc có giờ, hợp cho lịch hẹn, lịch thi"], ["eve", "20:00 hôm trước", "Việc không có giờ"], ["morn", "7:00 sáng hôm đó", "Việc không có giờ"]];
const pushPrefs = () => ({ d1: true, h2: true, m15: false, eve: true, morn: true, ...(LS.get("pushPrefs", {}) || {}) });
const ub64 = s => { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
async function pushState() {
  if (!CFG.supabaseUrl) return { st: "nocfg" };
  if (!pushOK()) return { st: isIOS && !isStandalone() ? "ios-install" : "unsupported" };
  if (isIOS && !isStandalone()) return { st: "ios-install" };
  if (!sync.user) return { st: "signin" };
  if (Notification.permission === "denied") return { st: "denied" };
  try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub && Notification.permission === "granted" && LS.get("pushEndpoint", "") === sub.endpoint) return { st: "on", sub }; } catch {}
  return { st: "off" };
}
async function enablePush() {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") { toast(perm === "denied" ? "Bạn đã chặn thông báo. Mở cài đặt trình duyệt để cho phép lại." : "Chưa bật thông báo"); return false; }
  const reg = await navigator.serviceWorker.ready;
  const { data, error } = await sync.sb.functions.invoke("hn-push", { body: { action: "vapid" } });
  if (error || !data || !data.publicKey) throw new Error("Máy chủ thông báo chưa sẵn sàng");
  let sub = await reg.pushManager.getSubscription();
  if (sub && LS.get("pushKey", "") !== data.publicKey) { try { await sub.unsubscribe(); } catch {} sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: ub64(data.publicKey) });
  const j = sub.toJSON();
  const { error: e2 } = await sync.sb.from("push_subs").upsert({ endpoint: j.endpoint, user_id: sync.user.id, p256dh: j.keys.p256dh, auth: j.keys.auth, tz: -new Date().getTimezoneOffset(), prefs: pushPrefs(), ua: navigator.userAgent.slice(0, 160) });
  if (e2) throw new Error(pushSubError(e2));
  LS.set("pushKey", data.publicKey); LS.set("pushEndpoint", j.endpoint);
  return true;
}
/* Lỗi khi lưu đăng ký nhận thông báo: vi phạm ràng buộc push_subs_endpoint_push (23514) là trình duyệt dùng dịch vụ push lạ */
const pushSubError = e => e && e.code === "23514" ? "Trình duyệt này dùng dịch vụ thông báo chưa được hỗ trợ. Hãy dùng Chrome, Safari, Firefox hoặc Edge." : (e && e.message) || "Chưa lưu được đăng ký thông báo";
async function disablePush() {
  try { const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription(); if (sub) { await sync.sb.from("push_subs").delete().eq("endpoint", sub.endpoint); await sub.unsubscribe(); } } catch {}
  LS.del("pushEndpoint");
}
async function renderPushCard(box) {
  if (!box) return;
  const { st } = await pushState();
  const msg = {
    nocfg: "Cần cài đồng bộ (config.js) để máy chủ gửi được thông báo.",
    "ios-install": "Trên iPhone: mở bằng Safari, bấm Chia sẻ → Thêm vào MH chính, rồi mở app từ icon đó để bật thông báo.",
    unsupported: "Trình duyệt này chưa hỗ trợ thông báo. Hãy dùng Chrome trên Android hoặc app đã thêm vào màn hình chính trên iPhone.",
    signin: "Đăng nhập ở mục Đồng bộ phía trên để bật thông báo. Máy chủ cần biết hạn của bạn để nhắc kể cả khi tắt app.",
    denied: "Bạn đã chặn thông báo cho app này. Vào cài đặt trình duyệt hoặc điện thoại để cho phép lại."
  }[st];
  if (msg) { box.innerHTML = `<div class="small mut">${msg}</div>`; return; }
  const p = pushPrefs();
  box.innerHTML = st === "on"
    ? `<div class="small green" style="margin-bottom:8px">Đang bật trên máy này. App nhắc cả khi bạn tắt app.</div>
       ${PUSH_PREFS.map(([k, n, d]) => `<button class="switch ${p[k] ? "on" : ""}" data-pp="${k}"><span>${n}<small>${d}</small></span><span class="tg"></span></button>`).join("")}
       <div class="btns"><button class="btn" data-pushoff>Tắt</button><button class="btn pri" data-pushtest style="--c:var(--cls)">Gửi thử</button></div>
       ${/Android/i.test(navigator.userAgent) ? `<div class="small mut" data-pushhint style="margin-top:10px">Chỉ nghe tiếng mà không thấy thông báo hiện xuống (hay gặp trên Xiaomi, Redmi, POCO, Oppo, Vivo)? Vào Cài đặt điện thoại → Ứng dụng → <b>Chrome</b> (hoặc <b>Hôm Nay</b> nếu đã cài app) → Thông báo, bật <b>Thông báo nổi</b> và <b>Thông báo trên màn hình khóa</b>. Xiaomi còn cần bật <b>Tự khởi động</b> và chọn Tiết kiệm pin là <b>Không hạn chế</b> để nhận nhắc khi tắt app.</div>` : ""}`
    : `<div class="small mut" style="margin-bottom:10px">Nhận thông báo trước hạn nộp, lịch thi và khoản phải trả như app bình thường, kể cả khi không mở app.</div>
       <button class="btn pri block" data-pushon style="--c:var(--cls)">Bật thông báo</button>`;
  const on = $("[data-pushon]", box);
  if (on) on.addEventListener("click", async () => { on.disabled = true; on.textContent = "Đang bật…"; try { if (await enablePush()) { toast("Đã bật thông báo"); buzz(); } } catch (e) { toast("Không bật được: " + (e.message || e)); } renderPushCard(box); });
  const off = $("[data-pushoff]", box);
  if (off) off.addEventListener("click", async () => { await disablePush(); toast("Đã tắt thông báo trên máy này"); renderPushCard(box); });
  const tst = $("[data-pushtest]", box);
  if (tst) tst.addEventListener("click", async () => {
    tst.disabled = true;
    try { const { data, error } = await sync.sb.functions.invoke("hn-push", { body: { action: "test", endpoint: LS.get("pushEndpoint", "") } }); if (error) throw error; toast(data && data.status >= 200 && data.status < 300 ? "Đã gửi, chờ vài giây" : "Gửi chưa được, thử bật lại thông báo"); }
    catch (e) { toast("Gửi chưa được: " + (e.message || e)); }
    tst.disabled = false;
  });
  $$("[data-pp]", box).forEach(x => x.addEventListener("click", async () => {
    const q = pushPrefs(); q[x.dataset.pp] = !q[x.dataset.pp]; LS.set("pushPrefs", q); x.classList.toggle("on", q[x.dataset.pp]);
    try { await sync.sb.from("push_subs").update({ prefs: q }).eq("endpoint", LS.get("pushEndpoint", "")); } catch {}
  }));
}
/* Mở đúng việc khi bấm vào thông báo */
function openFromUrl(u) {
  try {
    const id = new URL(u, location.href).searchParams.get("task"); if (!id) return;
    const go = (n = 0) => { if (db[id] && !db[id].deleted) { ui.tab = "task"; render(); taskForm(id); } else if (n < 10) setTimeout(() => go(n + 1), 600); };
    go();
  } catch {}
}
if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", e => { if (e.data && e.data.openUrl) openFromUrl(e.data.openUrl); });

/* ---------- giao diện (từng máy) ---------- */
function applyLook() {
  const th = LS.get("theme", "auto"), root = document.documentElement;
  if (th === "auto") delete root.dataset.theme; else root.dataset.theme = th;
  root.classList.toggle("big", !!LS.get("big", 0));
}

/* ---------- tìm kiếm ---------- */
/* Chuỗi đã norm() kèm vị trí trong chuỗi gốc của từng ký tự, để tô đúng chữ có dấu khi tìm không dấu */
function normMap(s) {
  s = String(s ?? ""); let n = "", i = 0; const at = [];
  for (const ch of s) { const x = norm(ch); for (let k = 0; k < x.length; k++) at.push([i, i + ch.length]); n += x; i += ch.length; }
  return { n, at };
}
/* esc(s) và bọc phần khớp với các từ tìm (đã norm) trong <mark> */
function hl(s, toks) {
  s = String(s ?? ""); if (!toks || !toks.length) return esc(s);
  const { n, at } = normMap(s), on = new Array(s.length).fill(false);
  for (const t of toks) for (let p = n.indexOf(t); t && p >= 0; p = n.indexOf(t, p + t.length))
    for (let k = p; k < p + t.length; k++) for (let j = at[k][0]; j < at[k][1]; j++) on[j] = true;
  let out = "", m = false;
  for (let j = 0; j < s.length; j++) { if (on[j] !== m) { out += m ? "</mark>" : "<mark>"; m = on[j]; } out += esc(s[j]); }
  return out + (m ? "</mark>" : "");
}
const SEARCH_DATE = /^(\d{1,2})\/(\d{1,2})$/;
function searchSheet() {
  openSheet({
    title: "Tìm kiếm", full: true, color: "var(--fg)",
    html: `<div class="f"><input name="q" type="search" enterkeyhint="search" placeholder="Việc, môn, khoản chi, giấy tờ, ngày 23/10…" autocomplete="off"></div><div data-res class="sres"></div>`,
    onMount(b) {
      const inp = $("[name=q]", b), res = $("[data-res]", b);
      const run = () => {
        // nhiều từ: mỗi từ phải khớp ở một trường bất kỳ ("btl giai tich" tìm được việc có tên BTL và môn Giải tích); "23/10" khớp theo ngày
        const toks = norm(inp.value).trim().split(/\s+/).filter(Boolean);
        if (!toks.length) { res.innerHTML = `<div class="hint">Gõ không dấu cũng được, nhiều từ cũng được, ví dụ "btl giai tich", "tra sua", "23/10", "35k", "mssv".</div>`; return; }
        const dts = toks.map(t => { const m = t.match(SEARCH_DATE); return m ? `${pad(+m[1])}/${pad(+m[2])}` : null; });
        const match = (fields, dates = []) => { const hay = norm(fields.filter(Boolean).join(" \u0001 ")); return toks.every((t, i) => hay.includes(t) || (dts[i] && dates.some(d => d && dm(d) === dts[i]))); };
        const hit = (...f) => match(f);
        const txHits = all("tx").filter(r => match([r.data.note, (CAT[r.data.cat] || [])[1], r.data.amount && moneyShort(r.data.amount), r.data.amount && money(r.data.amount)], [r.data.date])).sort((a, b) => (b.data.date || "").localeCompare(a.data.date || ""));
        const txOut = sumOut(txHits), txIn = sumIn(txHits);
        const groups = [
          ["Việc", all("task").filter(r => match([r.data.title, r.data.tag, r.data.note, r.data.waitFor, r.data.amount > 0 && moneyShort(r.data.amount), ...(r.data.subs || []).map(x => `${x.text} ${x.who}`)], [r.data.due]))
            .sort((a, b) => (a.data.status === "done") - (b.data.status === "done") || byDue(a, b))
            .map(r => ({ id: r.id, k: "task", t: r.data.title, m: [r.data.tag, r.data.status === "done" ? "Đã xong" : dueInfo(r.data).text, r.data.status === "waiting" ? "Đang chờ" : ""].filter(Boolean).join(" · ") }))],
          ["Môn học", all("class").filter(r => hit(r.data.title, r.data.code, r.data.room, r.data.teacher, r.data.note))
            .map(r => ({ id: r.id, k: "class", t: r.data.title, m: [(r.data.days || []).slice().sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b)).map(d => DOW[d]).join(", "), `${r.data.start}–${r.data.end}`, r.data.room && "Phòng " + r.data.room].filter(Boolean).join(" · ") }))],
          [txHits.length ? `Thu chi · ${txOut ? "chi " + money(txOut) : ""}${txOut && txIn ? ", " : ""}${txIn ? "thu " + money(txIn) : ""}` : "Thu chi", txHits.slice(0, 40)
            .map(r => ({ id: r.id, k: "tx", t: `${r.data.note || (CAT[r.data.cat] || [])[1] || "Khác"}`, m: `${dm(r.data.date)}/${String(r.data.date).slice(0, 4)} · ${r.data.type === "in" ? "+" : "−"}${money(r.data.amount)}` }))],
          ["Buổi tập", sessions().filter(r => match([r.data.note, ...(r.data.items || []).map(i => i.ex)], [r.data.date])).slice(0, 20)
            .map(r => ({ id: r.id, k: "workout", t: `Buổi tập ${dm(r.data.date)}`, m: sessionSummary(r) }))],
          ["Giấy tờ", all("doc").flatMap(r => (r.data.fields || []).filter(f => f.v && match([f.k, f.v, r.data.name])).map(f => ({ id: r.id, k: "doc", t: `${f.k}: ${f.v}`, m: r.data.name, copy: f.v, label: f.k })))]
        ].filter(g => g[1].length);
        res.innerHTML = groups.length ? groups.map(([name, rows]) => `<div class="group-h">${esc(name)}<span>${rows.length}</span></div><div class="card list">${rows.map(x =>
          `<div class="row tap" data-sid="${x.id}" data-k="${x.k}"${x.copy ? ` data-copyv="${esc(x.copy)}" data-copyl="${esc(x.label)}"` : ""}><div class="grow"><div class="t">${hl(x.t, toks)}</div>${x.m ? `<div class="m">${hl(x.m, toks)}</div>` : ""}</div>${x.copy ? I.copy.replace("<svg", '<svg style="width:18px;height:18px;color:var(--mut);flex:none"') : ""}</div>`).join("")}</div>`).join("")
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
    html: `<div class="small mut" style="margin:-4px 0 12px">${[(c.days || []).slice().sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b)).map(d => DOW[d]).join(", ") + ` ${esc(c.start)}–${esc(c.end)}`, c.room && "Phòng " + esc(c.room), c.code && esc(c.code) + (c.group ? " · " + esc(c.group) : ""), c.credits ? `${esc(c.credits)} tín chỉ` : "", c.teacher && esc(c.teacher)].filter(Boolean).join(" · ")}</div>
      <div class="stats3" style="margin:0 0 12px">
        <div><b class="num">${hasWeeks ? `${past.length}/${occ.length}` : past.length}</b><span>${hasWeeks ? "Buổi đã qua" : "Buổi, 8 tuần qua"}</span></div>
        <div><b class="num ${lvl}">${ab}${pct != null ? `<small style="font-size:var(--fs-xs);font-weight:600"> · ${pct}%</small>` : ""}</b><span>Buổi vắng</span></div>
        <div><b class="num" style="font-size:var(--fs-md)">${next ? `${DOW[parseYmd(next).getDay()]} ${dm(next)}` : "–"}</b><span>Buổi tới</span></div>
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
  const items = [], unscheduled = [], exams = []; let H = null, HE = null;
  const EXAM_LABEL = { gk: "Kiểm tra giữa kỳ", ck: "Thi cuối kỳ", kt: "Kiểm tra", th: "Thi thực hành", tn: "Thi thí nghiệm", bt: "Bài tập" };
  const dateOf = x => { x = String(x || ""); let m = x.match(/(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`; m = x.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${pad(+m[2])}-${pad(+m[1])}` : ""; };
  const hmOf = x => { const m = String(x || "").match(/(\d{1,2})\s*[:hg]\s*(\d{2})/); return m ? `${pad(+m[1])}:${m[2]}` : ""; };
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
    if (nc.some(c => c === "ngay thi" || c === "loai thi" || c === "gio thi")) { // tiêu đề bảng Lịch thi
      const f = fn => nc.findIndex(fn);
      HE = { subj: f(c => c === "mon hoc" || c === "ma mh" || c.startsWith("ten mon")), name: f(c => c.startsWith("ten mon")), group: f(c => c.startsWith("nhom")), date: f(c => c === "ngay thi"), type: f(c => c === "loai thi"),
             room: f(c => c === "ma phong" || c === "phong" || c === "phong thi"), time: f(c => c.startsWith("gio bat dau") || c === "gio thi"), dur: f(c => c.startsWith("tong so phut") || c.startsWith("thoi gian")) };
      H = null; continue;
    }
    if (nc.includes("ma mh")) { // dòng tiêu đề bảng: đọc theo tên cột
      const f = fn => nc.findIndex(fn);
      H = { code: f(c => c === "ma mh"), name: f(c => c.startsWith("ten mon")), cr: f(c => c === "tin chi"), group: f(c => c.startsWith("nhom")),
            day: f(c => c === "thu"), tiet: f(c => c === "tiet"), time: f(c => c.startsWith("gio hoc")), room: f(c => c === "phong"), weeks: f(c => c.startsWith("tuan")) };
      if (H.day < 0) H = null;
      continue;
    }
    const codeM = line.match(CODE); if (!codeM) continue;
    const code = codeM[1];
    if (HE && HE.date >= 0 && dateOf(cells[HE.date])) { // dòng của bảng Lịch thi
      const subj = cells[HE.subj] || "", t0 = HE.name >= 0 && cells[HE.name] ? cells[HE.name] : subj.replace(code, "").replace(/^[\s\-–:]+/, "").trim();
      const kind = norm(cells[HE.type] || "").trim(), date = dateOf(cells[HE.date]);
      // cột tên môn có mà trống thì để trống (dùng mã môn), đừng đoán nhầm sang ô "Loại thi" (CK, GK)
      let title = t0 || (HE.name >= 0 ? "" : titleOf(cells, code, line));
      if (title && HE.type >= 0 && title === cells[HE.type]) title = "";
      const x = { code, title, label: EXAM_LABEL[kind] || (cells[HE.type] ? `Thi ${cells[HE.type]}` : "Thi"), date, time: hmOf(cells[HE.time]), room: roomOf(cells[HE.room]) || (cells[HE.room] || "").trim(), dur: parseInt(cells[HE.dur], 10) || 0, group: (cells[HE.group] || "").trim() };
      if (!exams.some(e => e.code === x.code && e.date === x.date && e.label === x.label)) exams.push(x);
      continue;
    }
    const dates = [...line.matchAll(/(\d{1,2})\/(\d{1,2})\/(\d{4})|(\d{4})-(\d{2})-(\d{2})(?!\s+\d{1,2}:\d{2})/g)].map(m => m[4] ? Object.assign([m[0], m[6], m[5], m[4]], { index: m.index }) : m);
    if (dates.length) { // dòng lịch thi / kiểm tra
      const title = titleOf(cells, code, line);
      const list = dates.map((m, i) => {
        const seg = line.slice(m.index + m[0].length, i + 1 < dates.length ? dates[i + 1].index : line.length);
        const tm = seg.match(/(\d{1,2})\s*[:hg]\s*(\d{2})/);
        const dm2 = seg.match(/\b(\d{2,3})\s*(?:phút|phut|')/i);
        return { date: `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`, time: tm ? `${pad(+tm[1])}:${tm[2]}` : "", room: roomOf(seg), dur: dm2 ? +dm2[1] : 0 };
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
      <div class="btns sheet-foot"><button class="btn pri" data-imp disabled>Nhập</button></div>`,
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
            `${esc(x.label)}: ${esc(x.title || x.code)}`, meta([`${DOWL[parseYmd(x.date).getDay()]} ${dm(x.date)}/${x.date.slice(0, 4)}`, x.time && (x.dur ? `${x.time}–${toHM(toMin(x.time) + x.dur)}` : x.time), x.room && "Phòng " + esc(x.room), x.dur && `${x.dur} phút`, x.group && esc(x.group), x.date < td && '<span class="mut">Đã qua</span>', x.dup && '<span class="amber">Đã có</span>']))).join("")}</div>
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
        const added = [];
        batch(() => {
        if (wipe) existing.forEach(c => remove(c.id));
        P.items.filter(x => x.on).forEach(x => added.push(put("class", { title: x.title || x.code, code: x.code, group: x.group, credits: x.credits, days: x.days, start: x.start, end: x.end, room: x.room, teacher: "", note: "", weeks: x.weeks }).id));
        P.exams.filter(x => x.on).forEach(x => added.push(put("task", { title: `${x.label} ${x.title || x.code}`, tag: x.title || x.code, type: "thi", due: x.date, time: x.time, dur: x.dur || 0, status: "todo", waitFor: "", note: [x.room && `Phòng ${x.room}`, x.dur && `${x.dur} phút`, x.group && `Nhóm ${x.group}`, x.title && x.code].filter(Boolean).join(" · "), subs: [], createdAt: Date.now() }).id));
        P.unscheduled.filter(x => x.on).forEach(x => added.push(put("task", { title: x.title || x.code, tag: x.title || x.code, type: "bai", due: "", time: "", status: "todo", waitFor: "", note: `${x.code}${x.group ? " · " + x.group : ""} · không có lịch cố định trên TKB`, subs: [], createdAt: Date.now() }).id));
        if (P.items.some(x => x.on) && P.credits) setSetting("credits", P.credits);
        });
        // có lịch học hoặc lịch thi thì ở lại tab Lịch; chỉ có lịch thi thì mở dạng Tháng ở ngày thi gần nhất
        const exOn = P.exams.filter(x => x.on).sort((a, b) => a.date.localeCompare(b.date));
        closeSheet(); ui.tab = P.items.some(x => x.on) || exOn.length ? "cal" : "task"; calWeekReset();
        if (!P.items.some(x => x.on) && exOn.length) { ui.calView = "month"; LS.set("calView", "month"); ui.calMonth = exOn[0].date.slice(0, 7); ui.calSel = exOn[0].date; }
        LS.set("tab", ui.tab); render(); window.scrollTo(0, 0);
        toast(`Đã nhập ${added.length} mục`, { label: "Hoàn tác", fn: () => batch(() => { added.forEach(remove); snaps.forEach(restore); }) });
      });
      setTimeout(() => src.focus(), 280);
    }
  });
}

/* ---------- giáo án tập: dán kiểu TKB, quản lý, xuất ---------- */
/* Giáo án là MỘT bản ghi kind "gymplan" chứa mọi buổi (xem NORM.gymplan): dán một lần, tuần nào cũng có bài đúng thứ,
   lặp tới khi xóa hoặc tới ngày `until`. Phần đã tập vẫn là kind "workout" (sheet ngày ghi), ở đây chỉ đọc.
   Các hàm gym* bên dưới là hợp đồng dùng chung với tab Tập: trả dữ liệu thô (chưa esc), CHỈ ĐỌC, không sửa kết quả.
   Bộ nhớ đệm đổi theo định danh mảng IDX_ARR của "gymplan" và "workout" (mỗi lần ghi, all() tạo mảng mới),
   nên lưới tháng 42 ô gọi gymStatus từng ô vẫn nhanh. `var` để không dính TDZ nếu exUnit được gọi sớm. */
var GP_C;
function gpArr(kind) { return IDX_ARR.get(kind) || (all(kind), IDX_ARR.get(kind)) || []; }
function gpCache() {
  const pa = gpArr("gymplan"), wa = gpArr("workout");
  let c = GP_C;
  if (!c || c.pa !== pa) {
    const key = r => YMD_RE.test((r.data && r.data.start) || "") ? r.data.start : "";
    const plans = pa.slice().sort((a, b) => key(b).localeCompare(key(a)) || Date.parse(b.updated_at) - Date.parse(a.updated_at));
    c = GP_C = { pa, plans, at: new Map(), day: new Map(), unit: null, wa: null, wi: null };
  }
  if (c.wa !== wa) { c.wa = wa; c.wi = null; }
  return c;
}
/* chỉ mục workout theo ngày tập và theo ngày giáo án (planDate), thứ tự như sessions() */
function gpWi() {
  const c = gpCache();
  if (!c.wi) {
    const byDate = new Map(), byPlan = new Map(), add = (m, k, s) => { if (!k) return; const a = m.get(k); if (a) a.push(s); else m.set(k, [s]); };
    for (const s of sessions()) { add(byDate, s.data.date, s); add(byPlan, s.data.planDate, s); }
    c.wi = { byDate, byPlan };
  }
  return c.wi;
}
/** Mọi giáo án chưa xóa, sắp theo ngày bắt đầu giảm dần (trùng thì bản sửa sau trước). Trả mảng mới, bản ghi bên trong chỉ đọc. */
function gymPlans() { return gpCache().plans.slice(); }
/** Giáo án áp dụng cho ngày ymd: start ≤ ymd và (until rỗng hoặc ymd ≤ until); nhiều bản thì start lớn nhất, trùng thì updated_at mới hơn. Không có thì null. */
function gymPlanAt(ymd) {
  const c = gpCache();
  if (!c.at.has(ymd)) c.at.set(ymd, c.plans.find(r => YMD_RE.test(r.data.start || "") && r.data.start <= ymd && (!r.data.until || ymd <= r.data.until)) || null);
  return c.at.get(ymd);
}
/** Buổi giáo án của ngày ymd, hoặc null (không có giáo án, hoặc giáo án không có buổi nào vào thứ đó).
 *  Buổi theo ngày cụ thể (date === ymd) thắng buổi theo thứ. Trả
 *  { planId, planName, ymd, di (chỉ số trong plan.data.days), name, rest, items, once }
 *  rest = true khi là ngày nghỉ hoặc buổi không có bài (lúc đó items = []); items là mảng bài của giáo án
 *  { ex, n, lo, hi, max, unit, kg, side, note } (chỉ đọc); once = buổi một lần theo ngày cụ thể. */
function gymDay(ymd) {
  const c = gpCache();
  if (c.day.has(ymd)) return c.day.get(ymd);
  const p = gymPlanAt(ymd); let out = null;
  if (p) {
    const days = p.data.days || [], dow = parseYmd(ymd).getDay();
    let di = days.findIndex(d => d.date === ymd);
    if (di < 0) di = days.findIndex(d => !d.date && (d.dows || []).includes(dow));
    if (di >= 0) {
      const d = days[di], items = d.rest ? [] : d.items || [];
      out = { planId: p.id, planName: p.data.name || "", ymd, di, name: d.name || (d.rest ? "Nghỉ" : ""), rest: !!d.rest || !items.length, items: d.rest || !items.length ? [] : items, once: !!d.date };
    }
  }
  c.day.set(ymd, out);
  return out;
}
/** Bản ghi workout để tick cho buổi giáo án của ngày planDate: workout có data.planDate === planDate (kể cả tập bù ở ngày khác),
 *  không có thì workout cùng ngày chưa gắn planDate (ghi nhanh, form cũ), không có nữa thì null. */
function gymWorkoutFor(planDate) {
  const wi = gpWi();
  return (wi.byPlan.get(planDate) || [])[0] || (wi.byDate.get(planDate) || []).find(s => !s.data.planDate) || null;
}
/** Trạng thái ngày ymd so với hôm nay td. Trả { day, ws, made, w, st }:
 *  day = gymDay(ymd); ws = các workout có date === ymd (thứ tự như sessions()); made = workout tập bù cho ngày này
 *  ở ngày khác (planDate === ymd, date khác) hoặc null; w = gymWorkoutFor(ymd).
 *  st: "done" có workout và ngày có buổi giáo án | "free" có workout nhưng ngày không có buổi (không giáo án hoặc ngày nghỉ)
 *    | "made" chưa có workout nhưng đã tập bù ở ngày khác | "rest" ngày nghỉ của giáo án | "missed" có buổi, đã qua, chưa tập
 *    | "planned" có buổi, hôm nay hoặc sắp tới, chưa tập | "none" không có gì. */
function gymStatus(ymd, td = today()) {
  const wi = gpWi(), day = gymDay(ymd), ws = (wi.byDate.get(ymd) || []).slice();
  const made = (wi.byPlan.get(ymd) || []).find(s => s.data.date !== ymd) || null;
  const plan = !!day && !day.rest;
  const st = ws.length ? (plan ? "done" : "free") : made ? "made" : !day ? "none" : !plan ? "rest" : ymd < td ? "missed" : "planned";
  return { day, ws, made, w: gymWorkoutFor(ymd), st };
}
/** Ghép buổi giáo án `day` (từ gymDay, có thể null) với bản ghi workout `w` (có thể null). Trả { rows, extra, done, total }:
 *  rows[k] ứng với bài k của day.items: { k, it (bài giáo án), wi (chỉ số trong w.data.items, -1 nếu chưa có), done: [{ h, v }] }
 *    done sắp theo h: h = hiệp thứ mấy (đếm từ 0) lấy từ items[wi].hs, thiếu hs thì 0..n-1 theo thứ tự sets; v = số đã làm (sets[j]).
 *  extra = chỉ số các item của w không ghép được bài nào (bài ngoài giáo án), theo thứ tự trong w; ngày không có buổi thì là mọi item.
 *  done = Σ min(số hiệp đã làm, it.n), total = Σ it.n (hiệp thêm và bài ngoài giáo án không tính).
 *  Cách ghép: item có pi === k (khi w chưa gắn planId hoặc cùng planId với day), rồi item đầu tiên còn lại chưa có pi dùng được
 *  và cùng tên bài (so không dấu, như bài ghi nhanh "hít xà 3x10" hay buổi sửa từ bản cũ). */
function gymMatch(day, w) {
  const items = (w && w.data && w.data.items) || [], plan = day && !day.rest ? day.items || [] : [];
  const usePi = !!day && !(w && w.data && w.data.planId && w.data.planId !== day.planId);
  const tagged = x => usePi && Number.isInteger(x.pi) && x.pi < plan.length;
  const taken = items.map(() => false), rows = plan.map((it, k) => ({ k, it, wi: -1, done: [] }));
  if (usePi) for (const r of rows) { const j = items.findIndex((x, j) => !taken[j] && x.pi === r.k); if (j >= 0) { taken[j] = true; r.wi = j; } }
  for (const r of rows) {
    if (r.wi >= 0) continue;
    const nm = norm(r.it.ex).trim();
    const j = items.findIndex((x, j) => !taken[j] && !tagged(x) && norm(x.ex).trim() === nm);
    if (j >= 0) { taken[j] = true; r.wi = j; }
  }
  let done = 0, total = 0;
  for (const r of rows) {
    if (r.wi >= 0) {
      const x = items[r.wi], s = x.sets || [], hs = Array.isArray(x.hs) && x.hs.length === s.length ? x.hs : null;
      r.done = s.map((v, j) => ({ h: hs ? hs[j] : j, v: +v || 0 })).sort((a, b) => a.h - b.h);
    }
    total += r.it.n || 0; done += Math.min(r.done.length, r.it.n || 0);
  }
  return { rows, extra: items.map((_, j) => j).filter(j => !taken[j]), done, total };
}
const gpKg = v => +v > 0 ? String(Math.round(+v * 100) / 100).replace(".", ",") : "";
/** Liều của một bài giáo án thành chữ: "4 × 8-10 · 8kg", "3 × 45 giây", "4 × tối đa · mỗi bên", "20 phút", "3 hiệp" (chưa có số lần). */
function gymTarget(it, noKg) {
  if (!it) return "";
  const u = it.unit && it.unit !== "lần" ? " " + it.unit : "", n = it.n || 1;
  const reps = it.max ? "tối đa" : it.lo ? `${it.lo}${it.hi > it.lo ? "-" + it.hi : ""}${u}` : "";
  let s = reps ? (n === 1 && u ? reps : `${n} × ${reps}`) : `${n} hiệp`;
  if (!noKg && gpKg(it.kg)) s += ` · ${gpKg(it.kg)}kg`;
  if (it.side) s += " · mỗi bên";
  return s;
}
/** Số ghi vào khi chạm một hiệp: số thấp của mục tiêu (khoảng "8-10" ghi 8). null = phải hỏi số (tối đa, hoặc chưa có số lần). */
function gymTickDefault(it) { return it && !it.max && it.lo > 0 ? it.lo : null; }
/** Đơn vị của bài học từ các giáo án đã dán ("lần" | "giây" | "phút"), "" nếu không có bài đó. Dùng trong exUnit. */
function gymUnit(name) {
  if (!name) return "";
  const c = gpCache();
  if (!c.unit) {
    c.unit = new Map();
    for (const p of c.plans) for (const d of p.data.days || []) for (const it of d.items || []) { const k = norm(it.ex).trim(); if (k && !c.unit.has(k)) c.unit.set(k, it.unit || "lần"); }
  }
  return c.unit.get(norm(name).trim()) || "";
}
/* tên bài đã biết: danh sách có sẵn, bài đã ghi, bài trong giáo án */
function gpKnown() {
  const out = new Set(EXERCISES.map(e => e[0]));
  for (const s of gpArr("workout")) for (const i of s.data.items || []) if (i.ex) out.add(i.ex);
  for (const p of gymPlans()) for (const d of p.data.days || []) for (const it of d.items || []) if (it.ex) out.add(it.ex);
  return [...out];
}

/* ---- đọc giáo án dán vào ----
   Chữ được đọc trên bản norm() cùng độ dài với bản gốc (từng ký tự), nên vị trí tìm thấy dùng thẳng để cắt chữ gốc có dấu. */
const gpNorm = s => [...s].map(c => { const x = norm(c); return x.length === c.length ? x : c.toLowerCase().length === c.length ? c.toLowerCase() : "?".repeat(c.length); }).join("");
const GP_WD = "(?:thu\\s*(?:[2-7]|hai|ba|tu|nam|sau|bay)|t\\s?[2-7]|cn|chu\\s*nhat|monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?![a-z0-9])";
const GP_HEAD_WD = new RegExp(`^${GP_WD}(?:\\s*(?:,|/|&|\\+|\\sva\\s|-|–)\\s*(?:${GP_WD}|[2-7](?![\\w×*])))*`);
const GP_HEAD_DATE = /^(?:ngay\s*)?(\d{1,2})\s*[/.]\s*(\d{1,2})(?:\s*[/.]\s*(\d{4}|\d{2}))?(?![\d.,])(?!\s*(?:kg|km|x|×)(?![a-z]))/;
const GP_HEAD_BUOI = /^(?:buoi|ngay|day|session|workout)\s*(?:so\s*)?(\d{1,2}|[a-g](?![a-z0-9]))(?![0-9])(?!\s*(?:x|×|\*|kg|phut|giay|lan)(?![a-z]))/;
const GP_REST = /^(?:nghi(?: ngoi)?|ngay nghi|rest(?: day)?|off|day off)(?![a-z])/;
const GP_VAL = "(\\d+(?:[.,]\\d+)?)(?:\\s*(?:-|–|~|den|toi)\\s*(\\d+(?:[.,]\\d+)?))?";
const GP_UNIT = "(?:(lan|reps?|cai|giay|sec|s|phut|mins?|p)(?![a-z])|([\"'”″′]))";
const GP_MAX = "(max|toi da|het suc|amrap)(?![a-z])";
const GP_SETW = "(?:hiep|sets?|vong|luot)";
const GP_T0 = new RegExp(`${GP_VAL}\\s*(?:lan|reps?)?\\s*(?:x|×|\\*)\\s*(\\d{1,2})\\s*${GP_SETW}(?![a-z])`, "y");   // 8 lần x 4 hiệp
const GP_T1 = new RegExp(`(\\d{1,2})\\s*(?:${GP_SETW}\\s*)?(?:x|×|\\*|of)\\s*(?:${GP_MAX}|${GP_VAL}(?![\\d.,]|\\s*k[gm](?![a-z]))\\s*${GP_UNIT}?)`, "y");
const GP_T2 = new RegExp(`(\\d{1,2})\\s*${GP_SETW}(?![a-z])(?:\\s*,?\\s*(?:x\\s*)?(?:moi hiep\\s*)?(?:${GP_MAX}|${GP_VAL}(?![\\d.,]|\\s*k[gm](?![a-z]))\\s*${GP_UNIT}?))?`, "y");
const GP_KG = /(?:(?:voi|dung|ta(?: don| tay)?|nang)\s*)?(?:@|\+)?\s*(\d+(?:[.,]\d+)?)\s*kg(?![a-z])/y;
const GP_SIDE = /(?:(?:moi|each|per)\s*(?:ben|chan|tay|side|leg|arm)s?|\/\s*(?:ben|chan|tay))(?![a-z])/y;
const GP_T5 = new RegExp(`${GP_VAL}(?![\\d.,])\\s*${GP_UNIT}`, "y");
const GP_T6 = new RegExp(GP_MAX, "y");
function gpVal(d, a, b, u) {
  let lo = +String(a).replace(",", "."), hi = b ? +String(b).replace(",", ".") : 0;
  let unit = !u ? "" : /^(giay|sec|s|["”″])$/.test(u) ? "giây" : /^(phut|mins?|p|['′])$/.test(u) ? "phút" : "lần";
  if (hi && hi < lo) [lo, hi] = [hi, lo];
  if (unit === "phút" && (lo % 1 || hi % 1)) { unit = "giây"; lo *= 60; hi *= 60; }
  d.lo = Math.round(lo); d.hi = Math.round(hi) > d.lo ? Math.round(hi) : 0;
  if (unit) d.unit = unit;
}
/* đọc liều bắt đầu từ vị trí i của chuỗi đã norm: lần lượt các mẩu 4x8, 4 hiệp, 8kg, mỗi bên, 20 phút, tối đa (thứ tự nào cũng được) */
function gpDose(s, i) {
  const d = { found: false, n: 0, lo: 0, hi: 0, max: false, unit: "", kg: "", side: false, start: -1, end: i };
  const SEP = /[\s,;:@\-–~]*/y;
  for (let g = 0; g < 8; g++) {
    SEP.lastIndex = i; SEP.exec(s); const j = SEP.lastIndex;
    let m = null; const at = re => { re.lastIndex = j; return (m = re.exec(s)); };
    const free = !d.n && !d.lo && !d.max;
    if (free && at(GP_T0)) { gpVal(d, m[1], m[2], "lan"); d.n = +m[3]; }
    else if (free && at(GP_T1)) { d.n = +m[1]; if (m[2]) d.max = true; else gpVal(d, m[3], m[4], m[5] || m[6]); }
    else if (free && at(GP_T2)) { d.n = +m[1]; if (m[2]) d.max = true; else if (m[3]) gpVal(d, m[3], m[4], m[5] || m[6]); }
    else if (d.kg === "" && at(GP_KG)) d.kg = +m[1].replace(",", ".");
    else if (!d.side && at(GP_SIDE)) d.side = true;
    else if (!d.lo && !d.max && at(GP_T5)) gpVal(d, m[1], m[2], m[3] || m[4]);
    else if (!d.lo && !d.max && at(GP_T6)) d.max = true;
    else break;
    if (d.start < 0) d.start = j;
    d.found = true; i = d.end = j + m[0].length;
  }
  return d;
}
const gpTokAt = (s, i) => [GP_T0, GP_T1, GP_T2, GP_KG, GP_SIDE, GP_T5, GP_T6].some(re => { re.lastIndex = i; return re.test(s); });
/* vị trí đầu tiên (đầu một từ) có mẩu liều, -1 nếu không có */
function gpFindTok(s) {
  for (let i = 0; i < s.length; i++) if ((!i || !/[a-z0-9]/.test(s[i - 1])) && s[i] !== " " && gpTokAt(s, i)) return i;
  return -1;
}
/* tách danh sách bài trên một dòng: dấu , ; và + (không tách trong ngoặc, không tách 2,5kg) */
function gpSplit(s) {
  const out = []; let depth = 0, buf = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(" || c === "[") depth++; else if ((c === ")" || c === "]") && depth) depth--;
    const cut = !depth && (c === ";" || (c === "," && !(/\d/.test(s[i - 1] || "") && /\d/.test(s[i + 1] || ""))) || (c === "+" && /^\s*\p{L}/u.test(s.slice(i + 1)) && /[\s\p{L}]$/u.test(buf)));
    if (cut) { out.push(buf); buf = ""; } else buf += c;
  }
  out.push(buf);
  return out.map(x => x.trim()).filter(Boolean);
}
/* bỏ nội dung trong ngoặc (thay bằng dấu cách, giữ nguyên độ dài); trả { outer, parens } */
function gpParens(raw) {
  const parens = []; let outer = "", depth = 0, buf = "";
  for (const c of raw) {
    if (c === "(" || c === "[") { if (depth++ === 0) buf = ""; else buf += c; outer += " ".repeat(c.length); continue; }
    if ((c === ")" || c === "]") && depth) { if (--depth === 0) parens.push(buf.trim()); else buf += c; outer += " ".repeat(c.length); continue; }
    if (depth) { buf += c; outer += " ".repeat(c.length); } else outer += c;
  }
  if (depth && buf.trim()) parens.push(buf.trim());
  return { outer, parens: parens.filter(Boolean) };
}
const gpTrim = s => String(s || "").replace(/\s+/g, " ").replace(/^[\s:\-–\u2014.,;=]+|[\s:\-–\u2014,;=]+$/g, "").trim();
const gpCap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
const GP_NOT_EX = /^(?:moi|cac|tong|tat ca|ban|toi|minh|hay|nen|duoi day|day la|sau do|luu y|ghi chu|chu y|tuan|thang|muc tieu|giao an|lich tap|chuc)(?![a-z])/;
/* một bài: "Chèo tạ 1 tay 3 x 12 @8kg - giữ 1 giây ở trên" → { ex, n, lo, hi, max, unit, kg, side, note, warn }, không hiểu thì null.
   kn: [tên đã norm, tên gốc] sắp tên dài trước. */
function gpItem(pc, kn) {
  const raw = gpTrim(pc); if (!raw) return null;
  const { outer, parens } = gpParens(raw);
  const onm = gpNorm(outer);
  let nameEnd = -1, kHit = null;
  for (const k of kn) {
    if (!k[0] || !onm.startsWith(k[0])) continue;
    const rest = onm.slice(k[0].length), nx = rest.replace(/^\s+/, "");
    if (/^[a-z0-9]/.test(rest) && !/^\d/.test(rest)) continue;   // tên còn dài hơn ("Hít xà rộng tay")
    if (!nx || /^[\d:@\-–,;]/.test(nx) || gpTokAt(onm, k[0].length + rest.length - nx.length)) { nameEnd = k[0].length; kHit = k; break; }
  }
  if (nameEnd < 0) { const i = gpFindTok(onm); nameEnd = i < 0 ? onm.length : i; }
  let dose = gpDose(onm, nameEnd), rest = outer.slice(dose.found ? dose.end : nameEnd);
  const notes = [];
  if (!dose.found) {   // liều nằm trong ngoặc: "Khởi động (5-10 phút)"
    const pi = parens.findIndex(p => { const d = gpDose(gpNorm(p), 0); return d.found && d.start === (gpNorm(p).match(/^[\s,;:@\-–~]*/) || [""])[0].length; });
    if (pi >= 0) { const p = parens.splice(pi, 1)[0], pn = gpNorm(p); dose = gpDose(pn, 0); notes.push(gpTrim(p.slice(dose.end))); }
  }
  // "(14kg)" trong ngoặc là mức tạ khi liều chưa có kg
  if (dose.kg === "") { const ki = parens.findIndex(p => /^@?\s*\d+(?:[.,]\d+)?\s*kg$/.test(gpNorm(p).trim())); if (ki >= 0) dose.kg = +parens.splice(ki, 1)[0].replace(/[^\d.,]/g, "").replace(",", "."); }
  notes.unshift(gpTrim(rest)); notes.push(...parens.map(gpTrim));
  let name = gpTrim(outer.slice(0, nameEnd)), note = notes.filter(Boolean).join("; ");
  if (!name && dose.found && note && !/\d/.test(note)) { name = note; note = ""; }   // "4x8 Hít xà"
  if (!name || !/\p{L}/u.test(name) || name.length > 60) return null;
  const nn = norm(name).trim(), hit = kHit && kHit[0] === nn ? kHit : kn.find(k => k[0] === nn);
  if (hit) name = hit[1];
  else {
    if (GP_NOT_EX.test(nn)) return null;
    if (!dose.found && (/\d/.test(name + note) || name.split(" ").length > 6)) return null;   // có số mà không hiểu: để người dùng thấy ở "Không hiểu, bỏ qua"
    name = gpCap(name);
  }
  const unit = dose.unit || EX_UNIT[name] || gymUnit(name) || "lần";
  let n = dose.n, warn = "";
  if (!dose.found) { n = 3; warn = /\d/.test(note) ? "Chưa hiểu liều, đã giữ trong ghi chú. Tạm để 3 hiệp" : "Chưa có số lần, tạm để 3 hiệp"; }
  else if (!n) {
    if (dose.lo && unit !== "lần") n = 1;   // "20 phút", "Plank 60 giây": một lần
    else { n = 3; warn = dose.lo || dose.max ? "Chưa ghi số hiệp, tạm để 3 hiệp" : "Chưa có số lần, tạm để 3 hiệp"; }
  } else if (!dose.lo && !dose.max) warn = "Chưa có số lần mỗi hiệp";
  if (n > 20) { n = 20; warn = "Tối đa 20 hiệp"; }
  return { ex: name, n: Math.max(1, n), lo: dose.lo, hi: dose.hi, max: dose.max, unit, kg: dose.kg, side: dose.side, note, warn };
}
/* làm sạch một dòng: emoji, markdown (** # > `), bảng |, dấu đầu dòng (- • * 1. 1)) */
function gpClean(line) {
  let s = String(line).normalize("NFC").replace(/(\d)\uFE0F?\u20E3/g, "$1. ")
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]/gu, " ")
    .replace(/\*\*|__|~~|`/g, "").replace(/^\s*#{1,6}\s*/, "").replace(/^\s*>\s*/, "");
  if ((s.match(/\|/g) || []).length >= 2) {
    const cells = s.split("|").map(c => c.trim()).filter(Boolean);
    if (cells.every(c => /^:?-{2,}:?$/.test(c))) return "";
    // dòng tiêu đề cột: | Bài | Hiệp | Lần |
    if (cells.every(c => /^(?:bai(?: tap)?|ten bai|dong tac|hiep|so hiep|sets?|lan|so lan|reps?|lieu|kg|ta|muc tieu|ghi chu|thoi gian|nghi|ngay|thu|buoi)$/.test(norm(c).trim()))) return "";
    const isNum = c => /^\d+(?:\s*[-–]\s*\d+)?\s*(?:s|giây|phút|lần|reps?)?$/i.test(c);
    s = cells.map((c, i) => !i ? c : (isNum(cells[i - 1]) && isNum(c) ? "x" : i === 1 && gpHeadOf(gpNorm(cells[0])) ? ": " : " ") + c).join("");
  }
  s = s.replace(/^\s*(?:[-•*·▪◦●○■□➤►→–\u2014]+\s*|\d{1,2}[.)]\s+)/, "").replace(/\*(?!\s*\d)/g, "");
  return s.replace(/\s+/g, " ").trim();
}
/* dòng tiêu đề ngày trên chữ đã norm: { kind: "wd"|"date"|"buoi", len, ... } hoặc null */
function gpHeadOf(nm) {
  let m = nm.match(GP_HEAD_DATE);
  if (m && +m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12) return { kind: "date", len: m[0].length, d: +m[1], mo: +m[2], y: m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : 0 };
  m = nm.match(GP_HEAD_WD);
  if (m) {
    const dows = [];
    for (const t of m[0].split(/\s*(?:,|\/|&|\+|\sva\s|-|–)\s*/)) { const x = gpDowOf(t); if (x != null && !dows.includes(x)) dows.push(x); }
    if (dows.length) return { kind: "wd", len: m[0].length, dows };
  }
  m = nm.match(GP_HEAD_BUOI);
  if (m) { const b = /\d/.test(m[1]) ? +m[1] : m[1].charCodeAt(0) - 96; if (b >= 1 && b <= 30) return { kind: "buoi", len: m[0].length, buoi: b }; }
  return null;
}
/* danh sách thứ: "T3, T5, T7, CN", "thứ 3 và thứ 5", "t3 t5 cn" → [2, 4, 6, 0]; có chữ khác thì null */
function gpDowList(s) {
  const out = [];
  for (let t of String(s || "").split(/\s*(?:,|\/|&|\+|;|\sva\s|-|–|\.)\s*/)) {
    t = t.trim(); if (!t) continue;
    let x = gpDowOf(t);
    if (x == null) {
      const parts = t.match(/thu\s*(?:[2-7]|hai|ba|tu|nam|sau|bay)(?![a-z0-9])|t\s?[2-7](?![0-9])|cn|chu\s*nhat/g);
      if (!parts || parts.join("").replace(/\s/g, "") !== t.replace(/\s/g, "")) return null;
      for (const q of parts) { x = gpDowOf(q); if (x == null) return null; if (!out.includes(x)) out.push(x); }
      continue;
    }
    if (!out.includes(x)) out.push(x);
  }
  return out.length ? out : null;
}
function gpDowOf(t) {
  t = String(t || "").replace(/\s+/g, "");
  if (/^(?:cn|chunhat|sunday)$/.test(t)) return 0;
  let m = t.match(/^(?:thu|t)?([2-7])$/); if (m) return +m[1] - 1;
  m = t.match(/^thu(hai|ba|tu|nam|sau|bay)$/); if (m) return { hai: 1, ba: 2, tu: 3, nam: 4, sau: 5, bay: 6 }[m[1]];
  const en = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(t);
  return en >= 0 ? en : null;
}
/* năm của "20/10": năm làm ngày gần ngày bắt đầu nhất */
function gpDateOf(h, start) {
  const ref = parseYmd(start); let best = null;
  for (const y of h.y ? [h.y] : [ref.getFullYear() - 1, ref.getFullYear(), ref.getFullYear() + 1]) {
    const d = new Date(y, h.mo - 1, h.d);
    if (d.getMonth() !== h.mo - 1) continue;
    if (!best || Math.abs(d - ref) < Math.abs(best - ref)) best = d;
  }
  return best ? ymd(best) : "";
}
/** Đọc giáo án dán vào. opts: { known: [tên bài], start: ymd (để đoán năm của "20/10") }.
 *  Trả { days, skipped, warns }: days cùng dạng gymplan.data.days ({ name, dows, date, rest, items }) kèm buoi (số của "Buổi n",
 *  0 nếu theo thứ hoặc ngày; buổi theo số có dows = [] để người dùng chọn thứ) và warn: [chuỗi]; mỗi bài có thêm warn ("" nếu ổn).
 *  skipped: các dòng (hoặc mẩu dòng) có chữ mà không hiểu, nguyên văn; warns: cảnh báo chung. Không bao giờ âm thầm bỏ dòng có số. */
function parseGymPlan(text, opts = {}) {
  const kn = [...new Set((opts.known || gpKnown()).filter(Boolean))].map(k => [norm(k).replace(/\s+/g, " ").trim(), k]).sort((a, b) => b[0].length - a[0].length);
  const start = YMD_RE.test(opts.start || "") ? opts.start : today();
  const days = [], skipped = [], warns = [];
  let cur = null, seenHead = false;
  const newDay = o => { const d = { name: "", dows: [], date: "", rest: false, items: [], buoi: 0, warn: [], ...o }; days.push(d); return d; };
  const isKnown = s => { const n = norm(gpTrim(s)).trim(); return kn.some(k => k[0] === n); };
  const addItems = (str, rawLine) => {
    const pieces = gpSplit(str); let prev = null, bad = [];
    for (const pc of pieces) {
      const pn = gpNorm(gpTrim(pc)), last = prev || (cur && cur.items[cur.items.length - 1]) || null;
      // "Bench press: 4 hiệp x 8-10 lần, 40kg": mẩu chỉ có mức tạ (hoặc "mỗi bên") là của bài ngay trước
      const kgOnly = pn.match(/^(?:(?:voi|dung|ta(?: don| tay)?|nang)\s*)?[@+]?\s*(\d+(?:[.,]\d+)?)\s*kg$/);
      if (kgOnly && last) { if (last.kg === "" || last.kg == null) last.kg = +kgOnly[1].replace(",", "."); continue; }
      if (last && /^(?:moi|each|per)\s*(?:ben|chan|tay|side|leg|arm)s?$/.test(pn)) { last.side = true; continue; }
      // "Gập bụng 3x20, nghỉ 60s", "Nghỉ 90 giây giữa các hiệp": thời gian nghỉ là ghi chú của bài, không phải bài "Nghỉ"
      if (/^nghi(?![a-z])/.test(pn) && /\d/.test(pn)) { if (last) last.note = [last.note, gpTrim(pc)].filter(Boolean).join("; "); else bad.push(gpTrim(pc)); continue; }
      // "Hít xà 4x8 - chậm, kiểm soát": mẩu chữ thường, không số ngay sau ghi chú là phần tiếp của ghi chú
      if (prev && prev.note && !/\d/.test(pc) && !isKnown(pc) && /^\p{Ll}/u.test(gpTrim(pc))) { prev.note += ", " + gpTrim(pc); continue; }
      const it = gpItem(pc, kn);
      if (!it) { bad.push(gpTrim(pc)); continue; }
      if (!cur) cur = newDay({ buoi: 1, auto: true });
      cur.items.push(it); prev = it;
    }
    if (bad.length) skipped.push(bad.length === pieces.length ? rawLine : bad.join(", "));
  };
  const lines = String(text || "").slice(0, 20000).split(/\r?\n/).slice(0, 400);
  for (const rawLine of lines) {
    const s = gpClean(rawLine); if (!s || !/[\p{L}\d]/u.test(s)) continue;
    const nm = gpNorm(s), digit = /\d/.test(s), orig = rawLine.trim();
    const h = gpHeadOf(nm);
    if (h) {
      let tail = s.slice(h.len), paren = "";
      const pm = tail.match(/^\s*\(([^)]*)\)/); if (pm) { paren = pm[1].trim(); tail = tail.slice(pm[0].length); }
      tail = tail.replace(/^[\s:\-–\u2014.)]+/, "");
      // tên buổi hay danh sách bài sau tiêu đề
      let name = "", itemsTxt = "";
      const { outer } = gpParens(tail), ci = outer.indexOf(":");
      if (ci >= 0) {
        const b = tail.slice(ci + 1), bn = gpNorm(b), d = gpDose(bn, 0);
        if (d.found && d.start === (bn.match(/^[\s,;:@\-–~]*/) || [""])[0].length) itemsTxt = tail;   // "Hít xà: 4x8"
        else { name = tail.slice(0, ci); itemsTxt = b; }
      } else if (tail && gpSplit(tail).some(p => gpFindTok(gpNorm(gpParens(p).outer)) >= 0 || isKnown(p))) itemsTxt = tail;
      else name = tail;
      name = gpTrim(name);
      const warn = [];
      let o;
      if (h.kind === "date") {
        const date = gpDateOf(h, start);
        if (!date) { skipped.push(orig); continue; }
        const pd = paren ? gpDowOf(norm(paren)) : null;
        if (pd != null && pd !== parseYmd(date).getDay()) warn.push(`Ngày ${dm(date)}/${date.slice(0, 4)} là ${DOWL[parseYmd(date).getDay()]}, không phải ${gpCap(paren)}: app xếp theo ngày`);
        else if (paren && pd == null && !name) name = paren;
        o = { date };
      } else {
        // "Ngày 1 (Thứ 3)", "Buổi 1 (T3)": thứ trong ngoặc được chọn sẵn cho buổi đó
        const pd = h.kind === "buoi" && paren ? gpDowList(gpNorm(paren)) : null;
        if (paren && !name && !pd) name = paren;
        o = h.kind === "wd" ? { dows: h.dows } : { buoi: h.buoi, ...(pd ? { pre: pd } : {}) };
      }
      seenHead = true;
      const rest = GP_REST.test(norm(name).trim()) || (!itemsTxt && GP_REST.test(gpNorm(tail).trim()));
      // gộp tiêu đề lặp lại (bảng mỗi dòng một bài, hoặc dán hai lần)
      let d = o.date ? days.find(x => x.date === o.date) : o.dows ? days.find(x => !x.date && !x.buoi && x.dows.join() === o.dows.join()) : null;
      if (!d && o.dows) {
        const clash = days.filter(x => !x.date && !x.buoi && x.dows.some(v => o.dows.includes(v)));
        if (clash.length) { const left = o.dows.filter(v => !clash.some(x => x.dows.includes(v))); warn.push(`${o.dows.filter(v => !left.includes(v)).map(v => DOWL[v]).join(", ")} đã có buổi ở trên, chỉ dùng buổi đó`); if (left.length) o.dows = left; else d = clash[0]; }
      }
      if (d) { if (name && !d.name) d.name = gpCap(name); d.warn.push(...warn); }
      else d = newDay({ ...o, name: gpCap(name), warn });
      if (rest) d.rest = true;
      cur = d;
      if (itemsTxt) addItems(itemsTxt, orig);
      continue;
    }
    // "Nghỉ: T3, T5, T7, CN": các thứ đó là ngày nghỉ (không thành bài tên "CN"); thứ đã có buổi tập thì giữ buổi tập
    const rl = nm.match(/^(?:ngay\s+)?nghi(?:\s+ngoi)?\s*(?:vao\s+)?[:\-–]?\s*(.+)$/), rdows = rl ? gpDowList(rl[1]) : null;
    if (rdows) {
      const used = new Set(days.filter(x => !x.date && !x.buoi && !x.rest).flatMap(x => x.dows)), free = rdows.filter(x => !used.has(x));
      const old = days.find(x => x.rest && !x.date && !x.buoi && !x.items.length);
      if (old) free.forEach(x => { if (!old.dows.includes(x)) old.dows.push(x); });
      else if (free.length) newDay({ dows: free, rest: true, name: "Nghỉ" });
      seenHead = true; continue;
    }
    if (GP_REST.test(nm) && !digit) {   // "Nghỉ", "Rest day"; câu "nghỉ giữa các hiệp…" không có số thì bỏ qua
      if (!/\b(?:giua|hiep|bai|set)\b/.test(nm)) { if (cur) cur.rest = true; else skipped.push(orig); }
      continue;
    }
    if (!digit && !isKnown(s)) {
      const words = nm.split(" ").length;
      if (/[.!?:]$/.test(s) || words >= 7) continue;   // câu mở đầu, kết của ChatGPT: không có số, bỏ qua
      if (!cur && !seenHead) { skipped.push(orig); continue; }
    }
    if (!cur && !seenHead && digit && (/[.!?:]$/.test(s) || nm.split(" ").length >= 10) && gpFindTok(nm) < 0) { skipped.push(orig); continue; }
    addItems(s, orig);
  }
  const out = [];
  for (const d of days) {
    if (!d.rest && !d.items.length) {
      if (d.buoi) { warns.push(`Buổi ${d.buoi}${d.name ? " " + d.name : ""} chưa có bài nào, đã bỏ`); continue; }
      d.rest = true; d.warn.push("Chưa có bài nào, coi là ngày nghỉ");
    }
    if (d.rest && d.items.length) { d.warn.push("Có ghi Nghỉ nhưng vẫn có bài: app coi là buổi tập"); d.rest = false; }
    delete d.auto; out.push(d);
  }
  if (out.filter(d => d.buoi && !d.rest).length > 7) warns.push("Mỗi tuần chỉ có 7 ngày: hãy bớt số buổi hoặc bỏ bớt buổi");
  return { days: out, skipped, warns };
}

/* ---- sheet: dán giáo án ---- */
const GP_PROMPT = `Soạn giúp mình giáo án tập luyện theo tuần.
Mục tiêu: [ghi mục tiêu, VD giảm mỡ, tăng cơ, khỏe hơn]
Dụng cụ có: [VD xà đơn, xà kép, tạ đơn 8kg, hoặc không có gì]
Số buổi mỗi tuần: [VD 3 buổi], mỗi buổi khoảng [VD 45] phút. Trình độ: [mới tập / đã tập 1 năm].

Trả lời ĐÚNG định dạng dưới đây để mình dán vào app, không dùng bảng, không thêm lời giải thích:
Thứ 2 - Tên buổi
- Tên bài 4x8-10 (ghi chú ngắn)
- Tên bài 3x30s
- Tên bài 4xmax
- Tên bài 3x12 8kg mỗi bên
Thứ 4 - Tên buổi
- ...

Quy ước: mỗi buổi bắt đầu bằng một dòng Thứ 2, Thứ 3... Chủ nhật; mỗi bài một dòng bắt đầu bằng dấu "-".
Ghi số hiệp x số lần (4x8 hoặc 4x8-10); giữ theo giây thì 3x30s; cardio thì 20 phút; làm tối đa thì 4xmax.
Có tạ thì thêm số kg (8kg); tập từng bên thì thêm "mỗi bên"; ghi chú để trong ngoặc; ngày nghỉ ghi "Nghỉ".`;
const gpDmy = s => YMD_RE.test(s || "") ? `${dm(s)}/${s.slice(0, 4)}` : "";
const gpDowsText = (dows, short, sep = ", ") => (dows || []).slice().sort((a, b) => WEEK_ORDER.indexOf(a) - WEEK_ORDER.indexOf(b)).map(x => (short ? DOW : DOWL)[x]).join(sep);
/* giáo án bị ảnh hưởng khi lưu giáo án mới từ ns (đến nu): cut = kết thúc hôm trước ns, còn lại (chưa bắt đầu) thì bỏ */
function gpAffected(ns, nu) {
  return gymPlans().filter(r => YMD_RE.test(r.data.start || "") && r.data.start <= (nu || "9999-12-31") && (r.data.until || "9999-12-31") >= ns)
    .map(r => ({ r, cut: r.data.start < ns }));
}
/* một buổi trong xem trước / quản lý; pick = { i, fixed } thì có hàng chọn thứ */
function gpDayHtml(d, pick, start, until) {
  const dow = d.date ? parseYmd(d.date).getDay() : null;
  const head = d.date ? `${DOWL[dow]} ${gpDmy(d.date)}` : d.buoi ? `Buổi ${d.buoi}` : gpDowsText(d.dows) || "Chưa có thứ";
  const warn = [...(d.warn || [])];
  if (d.date && start && d.date < start) warn.push("Trước ngày bắt đầu nên sẽ không hiện");
  if (d.date && until && d.date > until) warn.push("Sau ngày kết thúc nên sẽ không hiện");
  const nm = d.rest && norm(d.name || "").trim() === "nghi" ? "" : d.name;   // ngày nghỉ tên "Nghỉ" thì khỏi lặp chữ Nghỉ
  return `<div class="gp-day${d.rest ? " gp-rest" : ""}">
    <div class="gp-dh"><b>${esc(head)}</b>${nm ? `<span> · ${esc(nm)}</span>` : ""}<span class="small mut">${d.rest ? "Nghỉ" : d.date ? "Một lần" : `${esc(d.items.length)} bài`}</span></div>
    ${pick && !d.rest ? `<div class="small ${d.dows.length ? "mut" : "amber"}" style="margin:2px 0 6px">${d.dows.length ? `Tập vào ${esc(gpDowsText(d.dows))}` : "Chọn thứ tập buổi này"}</div>
      <div class="gp-dows" role="group" aria-label="${esc(`Chọn thứ cho Buổi ${d.buoi}`)}">${WEEK_ORDER.map(x => { const on = d.dows.includes(x), fx = pick.fixed.has(x);
        return `<button type="button" class="${on ? "on" : ""}" data-gpdow="${x}" data-gpb="${esc(pick.i)}" aria-pressed="${on}" aria-label="${esc(DOWL[x] + (fx ? ", đã có buổi theo thứ" : ""))}"${fx ? " disabled" : ""}>${DOW[x]}</button>`; }).join("")}</div>` : ""}
    ${d.rest ? "" : d.items.map(it => `<div class="gp-ex"><div class="gp-exh"><span class="gp-exn">${esc(it.ex)}</span><span class="chip c-gym">${esc(gymTarget(it))}</span></div>${it.note ? `<div class="small mut">${esc(it.note)}</div>` : ""}${it.warn ? `<div class="small amber">${esc(it.warn)}</div>` : ""}</div>`).join("")}
    ${warn.map(w => `<div class="small amber">${esc(w)}</div>`).join("")}
  </div>`;
}
const GP_DEF_DOWS = { 1: [[1, 3, 5]], 2: [[1], [4]], 3: [[1], [3], [5]], 4: [[1], [2], [4], [5]], 5: [[1], [2], [3], [4], [5]], 6: [[1], [2], [3], [4], [5], [6]], 7: [[1], [2], [3], [4], [5], [6], [0]] };
/* xếp thứ cho các "Buổi n": thứ người dùng đã chọn, còn lại theo mặc định (1 buổi: T2/T4/T6, 3 buổi: T2, T4, T6…), mỗi thứ một buổi */
function gpAssign(bd, fixed, picks) {
  const used = new Set(fixed);
  bd.forEach((d, i) => { if (picks[i]) { d.dows = picks[i].filter(x => !fixed.has(x)); d.dows.forEach(x => used.add(x)); } });
  // thứ ghi sẵn trong ngoặc của tiêu đề ("Ngày 1 (Thứ 3)") đi trước cách xếp mặc định
  bd.forEach((d, i) => { if (!picks[i] && d.pre) { d.dows = d.pre.filter(x => !used.has(x)); d.dows.forEach(x => used.add(x)); } });
  const def = GP_DEF_DOWS[bd.length] || [];
  bd.forEach((d, i) => {
    if (picks[i] || (d.pre && d.dows.length)) return;
    let w = (def[i] || []).filter(x => !used.has(x));
    if (!w.length && def[i]) { const f = WEEK_ORDER.find(x => !used.has(x)); w = f != null ? [f] : []; }
    d.dows = w; w.forEach(x => used.add(x));
  });
}
function gpPasteSheet() {
  const td = today(), ws = weekStart(td);
  const st = { picks: {} }; let P = null, bd = [];
  openSheet({
    title: "Dán giáo án", full: true, color: "var(--gym)",
    html: `<div class="hint" style="margin:-4px 0 10px">Nhờ huấn luyện viên, bạn bè hoặc ChatGPT soạn rồi dán vào đây. Mỗi buổi một dòng tiêu đề (<b>Thứ 2</b>, <b>Buổi 1</b> hoặc ngày <b>20/10</b>), mỗi bài kiểu <b>Hít xà 4x8</b>, <b>Plank 3x45s</b>, <b>Chạy bộ 20 phút</b>. Dán một lần là tuần nào cũng có bài đúng thứ đó.</div>
      <button type="button" class="btn block f gp-ask" data-gpask>${I.copy}<span>Chép câu nhờ ChatGPT soạn</span></button>
      <div class="f"><label for="gp-src">Giáo án</label><textarea id="gp-src" name="gpsrc" rows="7" placeholder="Thứ 2: Hít xà 4x8, Xà kép 3x10, Plank 3x45s&#10;Thứ 4: Goblet squat 4x12 8kg, Lunge 3x10 mỗi chân"></textarea></div>
      <div class="f"><label for="gp-name">Tên giáo án</label><input id="gp-name" name="gpname" maxlength="60" placeholder="${esc(`Giáo án ${dm(td)}`)}"></div>
      <div class="gp-dates"><div><label class="lbl" for="gp-start">Bắt đầu từ</label><input type="date" id="gp-start" name="gpstart" value="${esc(td)}"></div><div><label class="lbl" for="gp-until">Kết thúc</label><input type="date" id="gp-until" name="gpuntil"></div></div>
      <div class="gp-quick" role="group" aria-label="Chọn nhanh ngày bắt đầu"><button type="button" class="btn" data-gpst="${esc(ws)}">Thứ 2 tuần này</button><button type="button" class="btn" data-gpst="${esc(addDays(ws, 7))}">Thứ 2 tuần sau</button></div>
      <div class="hint" style="margin:0 0 12px">Để trống ngày kết thúc thì giáo án lặp mỗi tuần tới khi bạn xóa.</div>
      <div data-gpprev aria-live="polite"></div>
      <div class="btns sheet-foot"><button class="btn pri" data-gpsave disabled>Lưu giáo án</button></div>`,
    onMount(b) {
      const src = $("[name=gpsrc]", b), nameIn = $("[name=gpname]", b), startIn = $("[name=gpstart]", b), untilIn = $("[name=gpuntil]", b);
      const prev = $("[data-gpprev]", b), save = $("[data-gpsave]", b);
      const dates = () => { const s = YMD_RE.test(startIn.value) ? startIn.value : td, u = YMD_RE.test(untilIn.value) ? untilIn.value : ""; return [s, u]; };
      const draw = () => {
        const [ns, nu] = dates();
        nameIn.placeholder = `Giáo án ${dm(ns)}`;
        $$("[data-gpst]", b).forEach(x => { const on = x.dataset.gpst === ns; x.classList.toggle("on", on); x.setAttribute("aria-pressed", String(on)); });
        if (!src.value.trim()) { P = null; prev.innerHTML = ""; save.disabled = true; return; }
        P = parseGymPlan(src.value, { start: ns });
        const fixed = new Set(P.days.filter(d => !d.buoi && !d.date).flatMap(d => d.dows));
        bd = P.days.filter(d => d.buoi && !d.rest);
        gpAssign(bd, fixed, st.picks);
        const train = P.days.filter(d => !d.rest), week = train.filter(d => !d.date), once = train.filter(d => d.date);
        const why = !train.length ? "Chưa đọc được bài nào." : bd.some(d => !d.dows.length) ? `Chọn thứ cho ${bd.filter(d => !d.dows.length).map(d => `Buổi ${d.buoi}`).join(", ")} để lưu.`
          : nu && nu < ns ? "Ngày kết thúc phải sau ngày bắt đầu." : "";
        const aff = gpAffected(ns, nu);
        const exN = train.reduce((t, d) => t + d.items.length, 0);
        prev.innerHTML = !P.days.length && !P.skipped.length ? `<div class="card empty">Chưa đọc được buổi nào. Mỗi buổi cần một dòng tiêu đề như Thứ 2 hoặc Buổi 1, mỗi bài một dòng kiểu Hít xà 4x8.</div>` : `
          ${aff.map(a => `<div class="banner gp-repl">${a.cut ? `Sẽ thay giáo án ${esc(a.r.data.name || "chưa đặt tên")} (kết thúc ngày ${esc(gpDmy(addDays(ns, -1)))})` : `Sẽ bỏ giáo án ${esc(a.r.data.name || "chưa đặt tên")} (định bắt đầu ${esc(gpDmy(a.r.data.start))})`}. Các buổi đã tập vẫn giữ nguyên.</div>`).join("")}
          ${train.length ? `<div class="gp-sum">${[week.length && `${esc(week.reduce((t, d) => t + Math.max(1, d.dows.length), 0))} buổi mỗi tuần`, once.length && `${esc(once.length)} buổi theo ngày`, `${esc(exN)} bài`].filter(Boolean).join(" · ")}</div>` : ""}
          ${P.warns.map(w => `<div class="small amber" style="margin-bottom:8px">${esc(w)}</div>`).join("")}
          ${P.days.map(d => gpDayHtml(d, d.buoi ? { i: bd.indexOf(d), fixed } : null, ns, nu)).join("")}
          ${P.skipped.length ? `<div class="group-h">Không hiểu, bỏ qua<span>${esc(P.skipped.length)}</span></div><div class="card gp-skip">${P.skipped.map(x => `<div>${esc(x)}</div>`).join("")}</div>` : ""}
          ${why ? `<div class="small amber" data-gpwhy style="margin-top:8px">${esc(why)}</div>` : ""}`;
        save.disabled = !!why;
      };
      src.addEventListener("input", draw);
      startIn.addEventListener("input", draw); startIn.addEventListener("change", draw);
      untilIn.addEventListener("input", draw); untilIn.addEventListener("change", draw);
      b.addEventListener("click", e => {
        if (e.target.closest("[data-gpask]")) { copyText(GP_PROMPT, "câu nhờ ChatGPT. Dán vào ChatGPT, điền chỗ [ ] rồi gửi"); return; }
        const q = e.target.closest("[data-gpst]"); if (q) { startIn.value = q.dataset.gpst; draw(); return; }
        const dw = e.target.closest("[data-gpdow]");
        if (dw && !dw.disabled) {
          const i = +dw.dataset.gpb, x = +dw.dataset.gpdow; if (!bd[i]) return;
          bd.forEach((d, j) => { st.picks[j] = d.dows.slice(); });   // chốt cách xếp hiện tại để các buổi khác không tự đổi
          if (st.picks[i].includes(x)) st.picks[i] = st.picks[i].filter(v => v !== x);
          else { bd.forEach((d, j) => { if (j !== i) st.picks[j] = st.picks[j].filter(v => v !== x); }); st.picks[i].push(x); }
          buzz(); draw();
          const nb = $(`[data-gpb="${i}"][data-gpdow="${x}"]`, b); if (nb) nb.focus({ preventScroll: true });
        }
      });
      save.addEventListener("click", () => {
        if (!P || save.disabled) return;
        const [ns, nu] = dates();
        const days = P.days.filter(d => !(d.buoi && (d.rest || !d.dows.length))).map(d => ({
          name: d.name, dows: d.date ? [] : d.dows.slice().sort((a, b2) => a - b2), date: d.date, rest: !!d.rest,
          items: d.rest ? [] : d.items.map(it => ({ ex: it.ex, n: it.n, lo: it.lo, hi: it.hi, max: it.max, unit: it.unit, kg: it.kg, side: it.side, note: it.note })) }));
        const name = nameIn.value.trim().slice(0, 60) || `Giáo án ${dm(ns)}`;
        const aff = gpAffected(ns, nu), snaps = aff.map(a => JSON.parse(JSON.stringify(db[a.r.id])));
        let rec = null;
        batch(() => {
          aff.forEach(a => a.cut ? put("gymplan", { ...a.r.data, until: addDays(ns, -1) }, a.r.id) : remove(a.r.id));
          rec = put("gymplan", { name, start: ns, until: nu, src: src.value.slice(0, 8000), days });
          if (mod("gym") && ui.tab !== "gym") { ui.tab = "gym"; LS.set("tab", "gym"); }
        });
        closeSheet(); buzz(18);
        toast(`Đã lưu giáo án ${name}`, { label: "Hoàn tác", fn: () => batch(() => { remove(rec.id); snaps.forEach(restore); }) });
      });
      setTimeout(() => src.focus(), 280);
    }
  });
}

/* ---- sheet: quản lý giáo án ---- */
function gpManageSheet(id) {
  const td = today(), plans = gymPlans();
  const r = id && db[id] && !db[id].deleted && db[id].kind === "gymplan" ? db[id] : gymPlanAt(td) || plans.filter(p => p.data.start > td).pop() || plans[0];
  if (!r) { gpPasteSheet(); return; }
  const d = r.data, stt = d.start > td ? "Chưa tới ngày bắt đầu" : d.until && d.until < td ? "Đã kết thúc" : "Đang dùng";
  const others = plans.filter(p => p.id !== r.id);
  const days = (d.days || []).slice().sort((a, b) => (a.date ? 1 : 0) - (b.date ? 1 : 0) || (a.date || "").localeCompare(b.date || "") || WEEK_ORDER.indexOf((a.dows || [])[0]) - WEEK_ORDER.indexOf((b.dows || [])[0]));
  openSheet({
    title: "Giáo án", color: "var(--gym)",
    html: `<div class="small mut" style="margin:-4px 0 12px"><span class="chip c-gym">${esc(stt)}</span> Từ ${esc(gpDmy(d.start))}${d.until ? ` đến ${esc(gpDmy(d.until))}` : ", lặp mỗi tuần tới khi xóa"}</div>
      <div class="f"><label for="gp-mname">Tên giáo án</label><input id="gp-mname" name="gpmname" maxlength="60" value="${esc(d.name)}"></div>
      <div class="f"><label for="gp-muntil">Ngày kết thúc</label><div class="gp-urow"><input type="date" id="gp-muntil" name="gpmuntil" value="${esc(d.until)}"><button type="button" class="btn" data-gpnountil>Bỏ ngày kết thúc</button></div>
        <div class="hint">Để trống thì giáo án lặp mỗi tuần tới khi bạn xóa.</div></div>
      <div class="group-h">Các buổi<span>${esc(days.filter(x => !x.rest).length)}</span></div>
      ${days.map(x => gpDayHtml({ ...x, items: x.items || [], dows: x.dows || [] }, null)).join("") || `<div class="card empty">Giáo án này không có buổi nào.</div>`}
      ${others.length ? `<div class="group-h">Giáo án khác<span>${esc(others.length)}</span></div><div class="card list">${others.map(o => `<button type="button" class="row gp-other" data-gpid="${esc(o.id)}"><div class="grow"><div class="t">${esc(o.data.name || "Chưa đặt tên")}</div><div class="m">Từ ${esc(gpDmy(o.data.start))}${o.data.until ? ` đến ${esc(gpDmy(o.data.until))}` : ""}${o.data.until && o.data.until < td ? " · đã kết thúc" : o.data.start > td ? " · chưa tới" : ""}</div></div></button>`).join("")}</div>` : ""}
      <button type="button" class="btn block" data-gppaste style="margin-top:12px">Dán giáo án mới</button>
      <div class="hint">Xóa giáo án không xóa các buổi đã tập.</div>
      <div class="btns sheet-foot"><button class="btn danger" data-gpdel>Xóa giáo án</button><button class="btn pri" data-gpsave>Lưu</button></div>`,
    onMount(b) {
      const un = $("[name=gpmuntil]", b);
      b.addEventListener("click", e => {
        if (e.target.closest("[data-gpnountil]")) { un.value = ""; return; }
        if (e.target.closest("[data-gppaste]")) { gpPasteSheet(); return; }
        const o = e.target.closest("[data-gpid]"); if (o) { gpManageSheet(o.dataset.gpid); return; }
        if (e.target.closest("[data-gpdel]")) {
          const cur = db[r.id]; if (!cur) return;
          const snap = JSON.parse(JSON.stringify(cur));
          remove(r.id); closeSheet();
          toast(`Đã xóa giáo án${cur.data.name ? " " + cur.data.name : ""}. Các buổi đã tập vẫn còn`, { label: "Hoàn tác", fn: () => restore(snap) });
          return;
        }
        if (e.target.closest("[data-gpsave]")) {
          const cur = db[r.id]; if (!cur || cur.deleted) { closeSheet(); return; }
          const u = YMD_RE.test(un.value) ? un.value : "";
          if (u && u < cur.data.start) { un.focus(); toast("Ngày kết thúc phải từ ngày bắt đầu trở đi"); return; }
          put("gymplan", { ...cur.data, name: $("[name=gpmname]", b).value.trim().slice(0, 60) || cur.data.name, until: u }, r.id);
          closeSheet(); toast("Đã lưu giáo án");
        }
      });
    }
  });
}

/* ---- xuất dữ liệu tập: chữ để dán vào ChatGPT, Zalo, gửi HLV; CSV mỗi hiệp một dòng ---- */
const GP_RANGES = [["4w", "4 tuần"], ["3m", "3 tháng"], ["all", "Tất cả"]];
/* buổi giáo án mà workout w tick vào (null = tập tự do) */
function gpDayOfWorkout(w) {
  if (w.data.planDate) return gymDay(w.data.planDate);
  if (!w.data.planId && gymWorkoutFor(w.data.date) === w) { const d = gymDay(w.data.date); return d && !d.rest ? d : null; }
  return null;
}
const gpUnitSuf = u => u && u !== "lần" ? " " + u : "";
/** Dữ liệu xuất cho khoảng range ("4w" = 28 ngày tới hôm nay, "3m" = 91 ngày, "all"). Trả { from, to, text, csv, nW, nSets }. */
function gpExport(range, td = today()) {
  let from = range === "3m" ? addDays(td, -90) : range === "all" ? "" : addDays(td, -27);
  if (!from) {
    const ds = [...gpArr("workout").map(s => s.data.date), ...gymPlans().map(p => p.data.start)].filter(x => YMD_RE.test(x || "") && x <= td).sort();
    from = ds[0] || td;
    if (dayDiff(td, from) > 1500) from = addDays(td, -1500);
  }
  const q = csvQ;
  const csv = [["Ngày", "Thứ", "Buổi", "Giáo án", "Bài", "Hiệp", "Số lần/giây/phút", "Đơn vị", "Kg", "Mục tiêu", "Ghi chú bài", "Ghi chú buổi", "Phút buổi"].map(q).join(",")];
  const blocks = [], plansSeen = new Map();
  let nW = 0, nSets = 0, mins = 0, planned = 0, plannedDone = 0, free = 0;
  for (let d = from, guard = 0; d <= td && guard < 1600; d = addDays(d, 1), guard++) {
    const st = gymStatus(d, td), dw = parseYmd(d).getDay();
    if (st.day && !st.day.rest) {
      const p = db[st.day.planId]; if (p && !plansSeen.has(p.id)) plansSeen.set(p.id, p);
      const own = st.st === "made" || (st.st === "done" && st.ws.some(w => !w.data.planDate || w.data.planDate === d));   // buổi bù cho ngày khác không tính
      if (d < td || own) { planned++; if (own) plannedDone++; }
    }
    for (const w of st.ws.slice().reverse()) {
      const day = gpDayOfWorkout(w), m = gymMatch(day, w), items = w.data.items || [], pd = w.data.planDate;
      if (!day) free++;
      nW++; mins += +w.data.mins || 0;
      const buoi = day ? (day.name || "theo giáo án") : w.data.plan ? `${w.data.plan} (giáo án cũ)` : w.data.pname || "tự do";
      const head = [`${DOWL[dw]} ${gpDmy(d)}`, `Buổi ${buoi}${pd && pd !== d ? ` (tập bù cho ${dm(pd)})` : ""}`, w.data.mins ? `${w.data.mins} phút` : ""].filter(Boolean).join(" · ");
      const lines = [head];
      const row = (it, x, h, v) => { const ex = (x || it).ex || "";
        csv.push([gpDmy(d), DOWL[dw], buoi, day ? day.planName : "", ex, h, v, ex ? (it && it.unit) || exUnit(ex) : "", gpKg((x && x.kg) || (it && it.kg)).replace(",", "."), it ? gymTarget(it, true) : (x && x.tgt) || "", (x && x.note) || "", w.data.note || "", w.data.mins || ""].map(q).join(",")); };
      for (const r of m.rows) {
        const x = r.wi >= 0 ? items[r.wi] : null, u = gpUnitSuf(r.it.unit), kg = gpKg((x && x.kg) || r.it.kg);
        lines.push(`- ${r.it.ex}: dự kiến ${gymTarget(r.it, true)} · ${r.done.length ? `làm ${r.done.map(z => z.v).join(" ")}${u}` : "chưa làm"}${kg ? ` · ${kg}kg` : ""}${x && x.note ? ` · ghi chú: ${x.note}` : ""}`);
        r.done.forEach(z => row(r.it, x, z.h + 1, z.v)); nSets += r.done.length;
        if (x && !r.done.length && x.note) row(r.it, x, "", "");
      }
      for (const j of m.extra) {
        const x = items[j], s = x.sets || [], hs = Array.isArray(x.hs) && x.hs.length === s.length ? x.hs : null, kg = gpKg(x.kg);
        lines.push(`- ${x.ex}${day ? " (ngoài giáo án)" : ""}: ${x.tgt ? `dự kiến ${x.tgt} · ` : ""}${s.length ? `làm ${s.join(" ")}${gpUnitSuf(exUnit(x.ex))}` : "chưa làm"}${kg ? ` · ${kg}kg` : ""}${x.note ? ` · ghi chú: ${x.note}` : ""}`);
        s.forEach((v, k) => row(null, x, (hs ? hs[k] : k) + 1, v)); nSets += s.length;
        if (!s.length && x.note) row(null, x, "", "");
      }
      if (!m.rows.length && !m.extra.length) row(null, { ex: "" }, "", "");
      if (w.data.note) lines.push(`Ghi chú buổi: ${w.data.note}`);
      blocks.push(lines.join("\n"));
    }
    if (st.st === "missed") blocks.push(`${DOWL[dw]} ${gpDmy(d)} · Buổi ${st.day.name || "theo giáo án"}: bỏ lỡ (${st.day.items.map(it => it.ex).join(", ")})`);
  }
  const wts = all("weight").filter(x => x.data.date >= from && x.data.date <= td).sort((a, b) => a.data.date.localeCompare(b.data.date));
  const kgT = x => `${(+x.data.kg || 0).toLocaleString("vi-VN")} kg (${dm(x.data.date)})`;
  const goal = +getSetting("weightGoal", 0) || 0;
  const sum = [
    planned ? `Đã tập ${plannedDone}/${planned} buổi theo giáo án${free ? `, thêm ${free} buổi tự do` : ""}` : `Đã tập ${nW} buổi`,
    `${nSets} hiệp${mins ? `, ${mins} phút` : ""}`,
    wts.length ? (wts.length > 1 ? `Cân nặng: ${kgT(wts[0])} đến ${kgT(wts[wts.length - 1])}` : `Cân nặng: ${kgT(wts[0])}`) : "",
    goal ? `Mục tiêu cân nặng: ${goal.toLocaleString("vi-VN")} kg` : ""
  ].filter(Boolean);
  const plansTxt = [...plansSeen.values()].map(p => `Giáo án: ${p.data.name || "chưa đặt tên"} (từ ${gpDmy(p.data.start)}${p.data.until ? ` đến ${gpDmy(p.data.until)}` : ""}; ${(p.data.days || []).filter(x => !x.rest && !x.date).map(x => `${gpDowsText(x.dows, true, "/")}${x.name ? " " + x.name : ""}`).join(", ") || "theo ngày"})`);
  const text = [`Dữ liệu tập luyện từ ${gpDmy(from)} đến ${gpDmy(td)}`, ...plansTxt, "", blocks.join("\n\n"), "", `Tóm tắt: ${sum.join(". ")}.`].join("\n").replace(/\n{3,}/g, "\n\n");
  return { from, to: td, text, csv: "\ufeff" + csv.join("\r\n"), nW, nSets };
}
function gpExportSheet() {
  let range = "4w", X = null;
  openSheet({
    title: "Xuất dữ liệu tập", color: "var(--gym)",
    html: `<div class="seg" role="group" aria-label="Khoảng thời gian" data-gprange>${GP_RANGES.map(([k, l]) => `<button type="button" class="${k === range ? "on" : ""}" data-r="${k}">${esc(l)}</button>`).join("")}</div>
      <div class="hint" style="margin:-4px 0 10px">Chép rồi dán vào ChatGPT, Zalo hoặc gửi huấn luyện viên để nhờ phân tích. Bảng CSV mở được bằng Excel, Google Sheets.</div>
      <div data-gpxsum class="small" style="margin-bottom:8px"></div>
      <pre class="gp-pre" data-gpxpre tabindex="0" aria-label="Văn bản sẽ chép"></pre>
      <div class="btns sheet-foot"><button class="btn" data-gpcsv>Tải CSV</button><button class="btn pri" data-gpcopy>Chép văn bản</button></div>`,
    onMount(b) {
      const sum = $("[data-gpxsum]", b), pre = $("[data-gpxpre]", b), cp = $("[data-gpcopy]", b), cs = $("[data-gpcsv]", b);
      const draw = () => {
        X = gpExport(range);
        const empty = !X.nW, lab = (GP_RANGES.find(r => r[0] === range) || [])[1];
        cp.disabled = cs.disabled = empty;
        sum.innerHTML = empty ? `<span class="amber">${esc(range === "all" ? "Chưa có buổi tập nào để xuất." : `Chưa có buổi tập nào trong ${lab.toLowerCase()} gần đây. Chọn khoảng dài hơn hoặc ghi buổi tập trước.`)}</span>`
          : `<span class="mut">${esc(`Từ ${gpDmy(X.from)} đến ${gpDmy(X.to)} · ${X.nW} buổi · ${X.nSets} hiệp`)}</span>`;
        pre.hidden = empty; pre.textContent = empty ? "" : X.text;
      };
      $("[data-gprange]", b).addEventListener("click", e => {
        const x = e.target.closest("button[data-r]"); if (!x) return;
        range = x.dataset.r; $$("[data-gprange] button", b).forEach(y => y.classList.toggle("on", y === x)); draw();
      });
      cp.addEventListener("click", () => { if (X && X.nW) copyText(X.text, "dữ liệu tập"); });
      cs.addEventListener("click", async () => { if (X && X.nW && await shareOrDownload(`tap-luyen-${today()}.csv`, X.csv, "text/csv")) toast(`Đã xuất ${X.nSets} hiệp`); });
      draw();
    }
  });
}

/* ---- thẻ Giáo án ở đầu tab Tập ---- */
function gpCard() {
  if (!mod("gym")) return "";
  const td = today(), plans = gymPlans(), cur = gymPlanAt(td), next = cur ? null : plans.filter(p => YMD_RE.test(p.data.start || "") && p.data.start > td).pop() || null;
  const exp = gpArr("workout").length ? `<button class="btn" data-act="gp-export">Xuất dữ liệu tập</button>` : "";
  if (!cur && !next) return `<section class="card gp-card" style="--c:var(--gym)" data-gpcard>
      <div class="card-h"><h2><i></i>Giáo án</h2></div>
      <div class="small mut">Nhờ huấn luyện viên, bạn bè hoặc ChatGPT soạn giáo án rồi dán vào đây. Tuần nào app cũng xếp sẵn bài đúng thứ, bạn chỉ việc tick từng hiệp.</div>
      <div class="gp-acts"><button class="btn pri" data-act="gp-paste">Dán giáo án</button>${plans.length ? `<button class="btn" data-act="gp-manage">Giáo án cũ</button>` : ""}${exp}</div>
    </section>`;
  const p = cur || next, d = p.data, week = (d.days || []).filter(x => !x.rest && !x.date && (x.items || []).length);
  const dows = [...new Set(week.flatMap(x => x.dows || []))];
  return `<section class="card gp-card" style="--c:var(--gym)" data-gpcard>
      <div class="card-h"><h2><i></i>Giáo án</h2><span class="small mut">${cur ? "Đang dùng" : "Sắp tới"}</span></div>
      <div class="gp-name">${esc(d.name || "Chưa đặt tên")}</div>
      <div class="small mut">${esc([`${cur ? "Từ" : "Bắt đầu"} ${gpDmy(d.start)}${d.until ? ` đến ${gpDmy(d.until)}` : ""}`, dows.length && `${dows.length} buổi mỗi tuần (${gpDowsText(dows, true)})`].filter(Boolean).join(" · "))}</div>
      <div class="gp-acts"><button class="btn" data-act="gp-paste">Dán giáo án</button><button class="btn" data-act="gp-manage" data-id="${esc(p.id)}">Quản lý</button>${exp}</div>
    </section>`;
}
/* điều phối data-act="gp-…" từ bộ nghe click chung */
function gpClick(act, el) {
  if (act === "gp-paste") return gpPasteSheet();
  if (act === "gp-manage") return gpManageSheet((el && el.dataset && el.dataset.id) || null);
  if (act === "gp-export") return gpExportSheet();
}

/* ---------- xuất ra app Lịch (.ics) để điện thoại tự nhắc ---------- */
/* RFC 5545 §3.3.11: TEXT phải escape \ ; , và xuống dòng (trong JS phải viết "\\;" mới ra \;) */
const icsEsc = s => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
/* RFC 5545 §3.1: mỗi dòng tối đa 75 octet (không tính CRLF), dòng tiếp bắt đầu bằng một dấu cách.
   Đếm theo byte UTF-8 và cắt theo code point, nên không bao giờ cắt giữa một ký tự có dấu. */
const utf8Len = cp => cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
function icsFold(line) {
  const out = []; let cur = "", n = 0;
  for (const ch of line) {
    const b = utf8Len(ch.codePointAt(0));
    if (n + b > 75) { out.push(cur); cur = " "; n = 1; }
    cur += ch; n += b;
  }
  out.push(cur);
  return out.join("\r\n");
}
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
    if (d.time) ev(`${t.id}@hom-nay`, ["SUMMARY:" + icsEsc(title), "DTSTART:" + icsDT(d.due, d.time), `DURATION:PT${d.dur > 0 ? d.dur : 30}M`, desc && "DESCRIPTION:" + icsEsc(desc), ...alarm("-P1D", title), ...alarm("-PT2H", title)]);
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
    html: `<div class="hint" style="margin:-4px 0 12px">Tạo file lịch (.ics) cho app Lịch trên điện thoại Android hoặc iPhone. Điện thoại sẽ tự nhắc: 15 phút trước giờ học, 1 ngày và 2 tiếng trước hạn nộp, kể cả khi không mở Hôm Nay.</div>
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
  LS.set("welcomed", 1);
  openSheet({
    title: "Chào mừng đến Hôm Nay", color: "var(--fg)",
    html: `<div class="small mut" style="margin:-4px 0 14px">Ghi chi tiêu, việc cần làm, lịch học, tập luyện trong một app. Chỉ cần gõ một câu như "cà phê 30k".</div>
      <div class="f"><label>Bạn đang là</label>${pills("persona", PERSONAS.map(([k, n, e]) => [k, `${e} ${n}`]), "")}</div>
      <div class="f"><label>Tên của bạn</label><input name="name" placeholder="Để chào mỗi sáng" autocomplete="given-name"></div>
      <div class="f"><label>Ngân sách chi tiêu mỗi tháng (không bắt buộc)</label><input name="budget" inputmode="decimal" placeholder="VD: 3tr"></div>
      <button type="button" class="switch f ${LS.get("big", 0) ? "on" : ""}" data-big role="switch" aria-checked="${LS.get("big", 0) ? "true" : "false"}"><span>Chữ to, dễ đọc<small>Bật ngay để thử, đổi lại được trong Cài đặt</small></span><span class="tg"></span></button>
      <div class="steps">
        <div><b>1</b><span>Gõ hoặc nói một câu ở ô trên cùng: "trà sữa 25k", "họp 9h mai", "tiền nhà 3tr ngày 5 hằng tháng".</span></div>
        <div><b>2</b><span>Bấm + nếu muốn nhập chi tiết. Khoản hay chi sẽ thành nút ghi nhanh.</span></div>
        <div><b>3</b><span>Dùng 2 điện thoại? Vào Cài đặt (góc phải trên) để đăng nhập, dữ liệu tự đồng bộ.</span></div>
      </div>
      <div class="btns"><button class="btn" data-later>Để sau</button><button class="btn pri" data-tkb style="--c:var(--cls)">Bắt đầu</button></div>`,
    onMount(b) {
      const stW = { persona: "" };
      // chữ to áp dụng ngay để người dùng thấy khác biệt trước khi bấm Bắt đầu
      $("[data-big]", b).addEventListener("click", e => { const on = !LS.get("big", 0); LS.set("big", on ? 1 : 0); applyLook(); e.currentTarget.classList.toggle("on", on); e.currentTarget.setAttribute("aria-checked", String(on)); });
      bindPills(b, stW, () => { $("[data-tkb]", b).textContent = stW.persona === "sv" ? "Nhập TKB từ MyBK" : stW.persona === "hs" ? "Thêm thời khóa biểu" : "Bắt đầu"; });
      const save = () => {
        applyPersona(stW.persona || "other");   // "Để sau" mà chưa chọn: hồ sơ trung tính, không ngầm coi là sinh viên
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
      <button data-c="task"><span class="emo">✅</span><span>Việc cần làm<span class="d">${persona() === "sv" ? "Bài tập, BTL, đơn từ, thi" : isStudent() ? "Bài tập, kiểm tra, việc nhà" : "Công việc, hóa đơn, việc nhà"}</span></span></button>
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
  if (t.status === "done") {
    // bỏ Xong: khoản chi đã tự ghi lúc đánh dấu xong cũng bỏ theo (Hoàn tác trả lại cả hai)
    t.status = "todo"; t.doneAt = null;
    const paid = autoPaid(id), snaps = paid.map(x => JSON.parse(JSON.stringify(x))), taskSnap = JSON.parse(JSON.stringify(r));
    batch(() => { put("task", t, id); paid.forEach(x => remove(x.id)); });
    if (snaps.length) toast(`Đã bỏ Xong, xóa khoản chi ${moneyShort(snaps.reduce((a, x) => a + (+x.data.amount || 0), 0))} đã tự ghi`, { label: "Hoàn tác", fn: () => batch(() => { restore(taskSnap); snaps.forEach(x => restore(x)); }) });
    return;
  }
  t.status = "done"; t.doneAt = Date.now();
  buzz(18);
  const [sp, paid] = batch(() => { put("task", t, id); return [spawnNext(db[id]), payTask(db[id])]; });
  const msg = [paid ? `Đã trả, ghi chi ${moneyShort(t.amount)}` : "Xong", sp && `lần tới ${DOW[parseYmd(sp.data.due).getDay()]} ${dm(sp.data.due)}`].filter(Boolean).join(", ");
  toast(msg, { label: "Hoàn tác", fn: () => { if (sp) remove(sp.id); if (paid) remove(paid.id); const cur = db[id]; put("task", { ...cur.data, status: wasStatus, doneAt: null }, id); } });
}
document.addEventListener("click", e => {
  if (e.target.closest(".sheet")) return;
  const el = e.target.closest("[data-act],[data-mday],[data-mmonth],[data-calview],[data-cdetail],[data-gomonth],[data-tab],[data-edit],[data-filter],[data-day],[data-week],[data-month],[data-ex],[data-mcat],#fab");
  if (!el) return;
  if (el.id === "fab") {
    ({ home: chooser, task: () => taskForm(null), cal: () => calAdd("task"), money: () => txForm(null), gym: () => workoutForm(null) })[ui.tab]();
    return;
  }
  const act = el.dataset.act;
  if (act === "toggle-task") { e.stopPropagation(); toggleTask(el.dataset.id); return; }
  if (act === "task-more") { e.stopPropagation(); taskActions(el.dataset.id); return; }
  if (act === "move-overdue") { moveOverdue(); return; }
  if (act === "move-cancel") { ui.moveId = null; render(); return; }
  if (act === "docs") return docsSheet();
  if (act === "search") return searchSheet();
  if (act === "qsave") return quickSave();
  if (act === "qopen") return quickOpen(+el.dataset.i);
  if (act === "qflip") { const f = ui.qFlip || (ui.qFlip = {}); f[el.dataset.i] = !f[el.dataset.i]; quickPreview(); buzz(); return; }
  if (act === "push-later") { LS.set("pushNudge", 1); render(); return; }
  if (act === "push-nudge") { LS.set("pushNudge", 1); enablePush().then(okk => { if (okk) { toast("Đã bật thông báo"); buzz(); } render(); }).catch(err => { toast("Không bật được: " + (err.message || err)); render(); }); return; }
  if (act === "qfill") { quickReset(el.dataset.v); const qi = $("#qIn"); if (qi) qi.focus(); return; }
  if (act === "mic") return startMic(el);
  if (act === "goal") return goalForm(el.dataset.id || null);
  if (act === "tkb") return tkbSheet();
  if (act && act.startsWith("gp-")) return gpClick(act, el);
  if (act === "ics") return icsSheet();
  if (act === "q-tx") return txForm(null);
  if (act === "q-task") return taskForm(null);
  if (act === "q-gym") return workoutForm(null);
  if (act === "q-class") return classForm(null);
  if (act === "mday-task") return taskForm(null, { due: el.dataset.d });
  if (act === "combo") { e.stopPropagation(); const c = (ui.cmb || [])[+el.dataset.i]; if (c) { ui.cmbHold = Date.now() + 10000; quickTx(c); } return; }
  if (act === "settings") return settingsSheet();
  if (act === "export") return exportData();
  if (act === "reload") { location.reload(); return; }
  if (act === "budget") return budgetForm();
  if (act === "csv") return exportCsv();
  if (act === "money-more") { ui.moneyAll = ui.month; render(); return; }
  if (act === "done-more") { ui.doneN = (ui.doneN || 60) + 60; render(); return; }
  if (act === "mcat-clear") { ui.moneyCat = ""; render(); return; }
  if (el.dataset.mcat) {
    ui.moneyCat = ui.moneyCat === el.dataset.mcat ? "" : el.dataset.mcat; render();
    // danh sách đã lọc nằm dưới thẻ: cuộn tới phần đầu của nó để thấy ngay kết quả
    const f = $("#mfilter"); if (f && f.getBoundingClientRect().top > innerHeight * 0.6) f.scrollIntoView({ block: "start", behavior: "smooth" });
    return;
  }
  if (act === "weight") return weightForm(el.dataset.id || null);
  if (act && act.startsWith("gym-")) return gymClick(act, el);
  if (el.dataset.tab) { ui.moveId = null; if (el.dataset.tab === "cal" && ui.tab !== "cal") { calWeekReset(); ui.calMonth = ""; ui.calSel = ""; } ui.tab = el.dataset.tab; LS.set("tab", ui.tab); render(); window.scrollTo(0, 0); return; }
  if (el.dataset.edit) {
    const id = el.dataset.id; if (!db[id]) return;
    ({ task: taskForm, class: classForm, tx: txForm, workout: workoutForm })[el.dataset.edit](id);
    return;
  }
  if (el.dataset.filter) { ui.taskFilter = el.dataset.filter; render(); return; }
  if (el.dataset.mday) {
    const d = el.dataset.mday, mv = moveTarget();
    if (d.slice(0, 7) !== (ui.calMonth || today().slice(0, 7))) ui.calMonth = d.slice(0, 7);
    ui.calSel = d;
    if (mv) { ui.moveId = null; if (!moveTask(mv.id, d)) render(); return; }   // đang dời việc: ô vừa bấm là hạn mới
    render(); return;
  }
  if (el.dataset.mmonth != null) { shiftMonth(+el.dataset.mmonth); return; }
  if (el.dataset.calview) {
    const to = el.dataset.calview, from = ui.calView || "month";
    if (to !== "month") ui.moveId = null;
    if (to !== from) {
      const d = calPickDate();
      if (to === "week") { if (ui.calSel || ui.calMonth) calWeekOf(d); else calWeekReset(); }   // chưa chọn ngày nào: theo mặc định (tối CN mở tuần tới)
      else { ui.calSel = d; ui.calMonth = d.slice(0, 7); }
    }
    ui.calView = to; LS.set("calView", ui.calView); render(); return;
  }
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

function shiftMonth(n) {
  const td = today();
  if (n === 0) { ui.calMonth = td.slice(0, 7); ui.calSel = td; render(); return; }
  const [y, m] = (ui.calMonth || td.slice(0, 7)).split("-").map(Number), d = new Date(y, m - 1 + n, 1);
  ui.calMonth = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; ui.calSel = ui.calMonth === td.slice(0, 7) ? td : `${ui.calMonth}-01`; render();
}
/* vuốt ngang trên lịch tháng để đổi tháng */
let swX = null, swY = null;
document.addEventListener("touchstart", e => { if (e.target.closest("#mgrid")) { swX = e.touches[0].clientX; swY = e.touches[0].clientY; } else swX = null; }, { passive: true });
document.addEventListener("touchend", e => {
  if (swX == null) return;
  const dx = e.changedTouches[0].clientX - swX, dy = e.changedTouches[0].clientY - swY; swX = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) shiftMonth(dx < 0 ? 1 : -1);
}, { passive: true });

/* làm mới khi qua ngày mới / mở lại app */
let lastDay = today();
function tick() {
  if (today() !== lastDay) { lastDay = today(); calWeekReset(); ui.month = today().slice(0, 7); }
  if (!sheetEl && (ui.tab === "home" || ui.tab === "cal" || ui.tab === "gym")) render();
}
setInterval(tick, 60000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") tick(); });
/* Tab khác ghi bộ nhớ: nạp lại. Nếu tab này còn thay đổi chưa ghi xuống (persist theo đợt) thì gộp, bản mới hơn thắng. */
window.addEventListener("storage", e => {
  if (e.key !== "hn-db") return;
  const inc = LS.get("db", {}), incQ = LS.get("queue", {});
  if (!persistDirty) { loadDb(inc); queue = incQ; }
  else {
    for (const id in inc) { const r = inc[id], cur = dbRaw[id]; if (r && (!cur || Date.parse(r.updated_at) > Date.parse(cur.updated_at))) db[id] = { ...r, data: normalize(r.kind, r.data) }; }
    queue = { ...incQ, ...queue }; persist();
  }
  render();
});

/* ================= start ================= */
function start() {
  applyLook();
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch {}   // xin trình duyệt đừng tự xóa dữ liệu
  render();
  if (CFG.supabaseUrl && CFG.supabaseAnonKey) { sync.state = "wait"; loadSupabase(); } else sync.state = "local";
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
  if (new URLSearchParams(location.search).get("task")) { const u = location.href; try { history.replaceState(null, "", location.pathname); } catch {} openFromUrl(u); }
  openFromParams(new URLSearchParams(location.search));
}
/* Lối tắt trên icon app (manifest "shortcuts") và chia sẻ chữ từ app khác vào Hôm Nay (manifest "share_target"):
   ?add=tx|task|workout mở form, ?add=quick mở ô ghi nhanh, ?tab=cal mở tab, ?share_text=… điền câu vào ô ghi nhanh */
function openFromParams(qs) {
  const add = qs.get("add"), tab = qs.get("tab");
  const shared = ["share_title", "share_text"].map(k => qs.get(k) || "").filter(Boolean);
  if (!add && !tab && !shared.length && !qs.has("share_url")) return;
  try { history.replaceState(null, "", location.pathname); } catch {}
  const focusQuick = () => setTimeout(() => { const q = $("#qIn"); if (q) { q.focus(); try { q.setSelectionRange(q.value.length, q.value.length); } catch {} } }, 50);
  if (shared.length) {
    // tin nhắn chia sẻ thường kèm đường link: bỏ link, gộp dòng, giữ câu ngắn để ô ghi nhanh còn đọc được
    const text = shared.join(" ").replace(/https?:\/\/\S+/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
    ui.tab = "home"; render(); quickReset(text); focusQuick(); return;
  }
  if (tab && TABS.some(t => t[0] === tab)) { ui.tab = tab; if (tab === "cal") { calWeekReset(); ui.calMonth = ""; ui.calSel = ""; } LS.set("tab", tab); render(); }
  if (add === "quick") { ui.tab = "home"; render(); focusQuick(); return; }
  const f = { tx: txForm, task: taskForm, workout: workoutForm }[add];
  if (f) setTimeout(() => f(null), 50);
}
if (document.readyState === "complete") start(); else document.addEventListener("DOMContentLoaded", start);
