"use strict";
/* Ghi nhanh bằng một câu tiếng Việt: "cà phê 30k", "nộp báo cáo thứ 6 5h chiều", "hít đất 20 15 15", "cân nặng 65,5", "đóng tiền nhà 3tr ngày 5 hằng tháng", "cơm 35k, cafe 20k".
   Số tiền đọc bằng findMoney() trong app.js, dùng chung với ô nhập tiền (parseMoney). Bảng câu mẫu: tests/quick_cases.py. */
const CAT_WORDS = {
  nuoc: "ca phe|cafe|coffee|cf|tra sua|tra chanh|tra dao|tra da|ly tra|uong tra|nuoc ep|sinh to|nuoc ngot|nuoc suoi|nuoc|uong nuoc|do uong|highlands|phuc long|starbucks|katinat|the coffee house|bia|ruou|nhau",
  an: "com|pho|bun|mi|mien|hu tieu|banh mi|banh|an sang|an trua|an toi|an vat|bua sang|bua trua|bua toi|lau|nuong|ga ran|kfc|lotte|jollibee|pizza|chao|xoi|com tam|bun bo|oc|che|kem|trai cay|hoa qua|nuoc|nuoc mam|nuoc tuong|sieu thi|di cho|do an|rau|thit|ca|trung|sua chua|snack|grabfood|shopeefood|baemin",
  dilai: "xang|do xang|grab|be bike|be car|gojek|xanh sm|taxi|xe om|gui xe|ve xe|xe buyt|bus|metro|sua xe|rua xe|thay nhot|ve may bay|ve tau|cau duong|bao hiem xe|dang kiem",
  hoc: "sach|tap vo|vo viet|but|photo|in tai lieu|tai lieu|hoc phi|khoa hoc|hoc them|gia su|lop hoc|thi ielts|le phi thi",
  muasam: "mua|ao|quan|giay|dep|tui|shopee|lazada|tiki|tiktok shop|dien thoai|tai nghe|laptop|my pham|do dung|nuoc giat|nuoc rua chen|nuoc hoa",
  giaitri: "phim|cgv|game|karaoke|netflix|spotify|youtube premium|du lich|choi|concert|ve xem",
  hendo: "hen ho|nguoi yeu|ny|qua cho ny|date",
  hoadon: "nap the|nap tien dien thoai|4g|wifi|internet|cuoc mang|cuoc dien thoai|icloud|google one",
  nha: "tien nha|tien phong|thue nha|tien dien|tien nuoc|dien nuoc|chung cu|phi quan ly|gas|sua nha|noi that|do gia dung",
  con: "cho con|cua con|con gai|con trai|tien sua|sua cho be|bim|do choi|hoc phi cho con|truong mam non|nha tre",
  suckhoe: "thuoc|kham|benh vien|nha khoa|nho rang|gym|yoga|vitamin|bao hiem y te|bhyt",
  lamdep: "cat toc|lam toc|nail|spa|goi dau|lam dep|skincare",
  quatang: "dam cuoi|dam ma|dam hoi|mung cuoi|sinh nhat|hieu hi|qua bieu|li xi|qua tang|tang qua|qua cho|mua qua|bieu",
  thucung: "thu cung|cho meo|thuc an cho|meo|pate|cat ve sinh|thu y",
  tietkiem: "tiet kiem|gui tiet kiem|dau tu|chung khoan|mua vang|vang|crypto|co phieu|quy mo",
  luong: "luong|luong thang|tra luong|phu cap|tro cap thuc tap|luong part time|part time",
  thuong: "thuong|tien thuong|hoc bong|bonus",
  giadinh: "me gui|bo gui|ba gui|me cho|bo cho|ba cho|ong ba cho|gia dinh gui|anh chi cho|tien tieu vat|me chuyen|bo chuyen|ba chuyen|ma chuyen|gia dinh chuyen|me ck|bo ck|nha gui",
  kinhdoanh: "ban hang|ban duoc|doanh thu|khach tra|khach chuyen|thu ban",
  dautu: "tien lai|lai suat|co tuc|lai tiet kiem|loi nhuan"
};
const IN_KEYS = ["luong", "thuong", "giadinh", "kinhdoanh", "dautu"];
const EX_ALIAS = [["hit dat", "Chống đẩy"], ["push up", "Chống đẩy"], ["pushup", "Chống đẩy"], ["chong day", "Chống đẩy"], ["hit xa", "Hít xà"], ["pull up", "Hít xà"], ["pullup", "Hít xà"], ["xa kep", "Xà kép"], ["dip", "Xà kép"], ["chay bo", "Chạy bộ"], ["chay", "Chạy bộ"], ["plank", "Plank"], ["squat", "Squat"], ["gap bung", "Gập bụng"], ["dap xe", "Đạp xe"], ["boi", "Bơi"], ["di bo", "Đi bộ"], ["nhay day", "Nhảy dây"]];
// "Mẹ chuyển 2tr", "sếp gửi 500k": người khác đưa tiền cho mình (người đứng trước động từ)
const IN_FROM = /\s(?:(?:me|bo|ba|ma|cha|ong|ong noi|ong ngoai|ba noi|ba ngoai|co|chu|cau|mo|vo|chong|sep|cong ty|khach|khach hang|nguoi yeu|ny|gia dinh)\s(?:chuyen|gui|cho|ck|bank|li xi|mung|tra)|chi\s(?:chuyen|gui|ck|bank|li xi))\s/;
// "Nam trả nợ": người trả đứng trước "trả", không phải "tôi/mình/em…" hay động từ
const NOT_PAYER = /^(?:toi|minh|tao|to|em|anh|chi|di|phai|can|nho|da|se|chua|dang|ve|lai|con|thi|roi|duoc|de|hay|mai|nay)$/;

function nextWeekday(from, dow) { const d = parseYmd(from); let k = (dow - d.getDay() + 7) % 7; return addDays(from, k); }
/* Thứ viết bằng chữ ("thứ sáu", "thứ hai"). Sau norm() "thứ tư" trùng "thứ tự", "thư từ" nên câu có dấu phải đúng chữ có dấu */
const WD_WORD = { hai: [1, "hai"], ba: [2, "ba"], tu: [3, "tư"], nam: [4, "năm"], sau: [5, "sáu"], bay: [6, "bảy"] };
const NUM_WORD = { mot: 1, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10 };
const addMonthsYmd = (s, k) => { const d = parseYmd(s), want = d.getDate(); const n = new Date(d.getFullYear(), d.getMonth() + k, 1); n.setDate(Math.min(want, new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate())); return ymd(n); };
const monthEnd = (s, k = 0) => { const d = parseYmd(s); return ymd(new Date(d.getFullYear(), d.getMonth() + k + 1, 0)); };
const monthDay = (s, k, day) => { const d = parseYmd(s); return ymd(new Date(d.getFullYear(), d.getMonth() + k, day)); };
/* ngày `d` tháng `mo` (1-12) năm `y`; ngày không có thật ("31/11", "30/2") lùi về ngày cuối tháng: hạn sớm một hai ngày còn hơn mất hạn */
const clampYmd = (y, mo, d) => ymd(new Date(y, mo - 1, Math.min(d, new Date(y, mo, 0).getDate())));
/* "15/10" không ghi năm: năm nay, kể cả khi đã qua (tối đa ~6 tháng, ghi bù khoản chi hay việc quá hạn); qua lâu hơn thì là năm sau */
const PAST_OK = 183;
function dayMonth(td, mo, d) {
  const y = parseYmd(td).getFullYear(), a = clampYmd(y, mo, d);
  return a < td && dayDiff(td, a) > PAST_OK ? clampYmd(y + 1, mo, d) : a;
}
/* data.day cho lặp hằng tháng/năm (dương hoặc âm): "ngày 31 hằng tháng" nói vào tháng 11 có hạn đầu 30/11 nhưng tháng 12 vẫn là 31/12 */
const dayOf = (repeat, d) => d >= 1 && d <= 31 && ["month", "year", "lunar-month", "lunar-year"].includes(repeat) ? { day: d } : {};
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const LUNAR_MON = "(\\d{1,2}|gieng|chap)";
const lunarMon = v => v === "gieng" ? 1 : v === "chap" ? 12 : +v;

/* Trả về { kind, data, text } hoặc null.
   Câu có nhiều khoản tiền ngăn bằng dấu phẩy hoặc chấm phẩy ("cơm 35k, cafe 20k") trả về khoản đầu tiên,
   kèm items là cả danh sách (mỗi khoản có src là đoạn câu của nó). Chỗ gọi cũ chỉ đọc kind/data vẫn chạy. */
function parseQuick(input, opts = {}) {
  const raw = String(input || "").normalize("NFC").trim(); if (!raw) return null;
  // tách theo cả "và", "+" nếu mọi đoạn đều là khoản tiền ("cơm 35k và nước 10k", "cơm 35k + nước 10k"), không được thì chỉ tách theo dấu câu
  for (const sep of [/\s*(?:[;\n]|,(?!\d)|\s(?:và|va)\s|(?<=\S)\s*\+\s*(?=\p{L}))\s*/iu, /\s*(?:[;\n]|,(?!\d))\s*/]) {
    const parts = raw.split(sep).filter(Boolean);
    if (parts.length < 2) continue;
    const qs = parts.map(p => parseOne(p, opts));
    if (qs.every(q => q && q.kind === "tx")) {
      const td = opts.today || today(); let date = "";
      // "hôm qua cơm 35k, cafe 20k": ngày nói ở khoản trước áp cho các khoản sau không nói ngày
      qs.forEach((q, i) => { q.src = parts[i]; if (q.dated) date = q.data.date; else if (date) { q.data.date = date; q.text = txText(q.data, td); } });
      return { ...qs[0], items: qs };
    }
  }
  return parseOne(raw, opts);
}

function parseOne(raw, opts) {
  const td = opts.today || today();
  let n = " " + norm(raw).replace(/[,;!?]+(?=\s|$)/g, " ").replace(/\+(?=\d)/g, "+ ").replace(/\s+/g, " ") + " ";
  const used = []; // các đoạn đã hiểu, để bỏ khỏi tiêu đề
  const take = re => { const m = n.match(re); if (m) { used.push(m[0].trim()); n = n.replace(m[0], " "); } return m; };

  /* --- cân nặng --- */
  let m = n.match(/\s(?:can nang|can|nang)\s+(\d{2,3}(?:[.,]\d)?)\s*(?:kg|ky|ki|kilo)?\s/);
  if (m) { const kg = parseFloat(m[1].replace(",", ".")); if (kg > 20 && kg < 300) return { kind: "weight", data: { date: td, kg: Math.round(kg * 10) / 10 }, text: `Cân nặng ${kg.toLocaleString("vi-VN")} kg` }; }

  // dayNum: ngày người dùng nói ("ngày 31", "29/2", "mùng 30 âm"), giữ làm ngày gốc của chuỗi lặp (data.day) dù hạn đầu bị lùi về cuối tháng
  let due = "", dateSet = false, dayNum = 0;
  /* --- lặp lại --- */
  let repeat = "";
  if (take(/\s(?:hang|moi)\s+ngay\s/)) repeat = "day";
  // "2 tuần một lần", "mỗi 2 tuần"; không bắt "thứ 2 tuần sau"
  else if (take(/(?<!thu)\s(?:(?:moi|cu)\s+)?(?:2|hai) tuan(?: (?:mot|1) lan)?(?! (?:sau|toi|nua)\s)\s/)) repeat = "2week";
  else if (take(/\s(?:hang|moi)\s+tuan\s/)) repeat = "week";
  else if (take(/\s(?:hang|moi)\s+thang\s/)) repeat = "month";
  else if (take(/\s(?:hang|moi)\s+nam\s/)) repeat = "year";
  // "đến 30/12", "đến hết tháng 11" sau câu lặp lại: ngày cuối của chuỗi lặp, không phải hạn
  let until = "";
  if (repeat) {
    if ((m = take(/\s(?:cho\s+)?den\s+(?:het\s+)?(?:ngay\s+)?(\d{1,2})\s*[\/\-]\s*(\d{1,2})(?:\s*[\/\-]\s*(\d{2,4}))?\s/)) && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31)
      until = m[3] ? clampYmd(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2], +m[1]) : dayMonth(td, +m[2], +m[1]);
    else if ((m = take(/\s(?:cho\s+)?den\s+(?:het\s+)?thang\s+(\d{1,2})\s/)) && +m[1] >= 1 && +m[1] <= 12)
      until = dayMonth(td, +m[1], 31);
  }

  /* --- âm lịch: "mùng 10 tháng 9 âm", "10/9 âm lịch", "rằm tháng 10", "mùng 1 âm", "giỗ … mùng 10 tháng 3" --- */
  let lunar = null;
  if (typeof LUNAR !== "undefined") {
    const AM = "(?:am lich|am)";
    if ((m = take(new RegExp(`\\s(?:vao\\s+)?(?:ngay|mung|mong)\\s+(\\d{1,2})(?:\\s+thang\\s+${LUNAR_MON})?\\s+${AM}\\s`)))) lunar = { d: +m[1], m: m[2] ? lunarMon(m[2]) : 0 };
    else if ((m = take(new RegExp(`\\s(\\d{1,2})\\s*\\/\\s*(\\d{1,2})\\s+${AM}\\s`)))) lunar = { d: +m[1], m: +m[2] };
    else if ((m = n.match(new RegExp(`\\s(?:vao\\s+)?(?:ngay\\s+)?ram(?:\\s+thang\\s+${LUNAR_MON})?(?:\\s+${AM})?\\s`))) && (m[1] || /rằm/iu.test(raw))) { take(new RegExp(m[0].replace(/\s/g, "\\s"))); lunar = { d: 15, m: m[1] ? lunarMon(m[1]) : 0 }; }
    else if (/giỗ/iu.test(raw) && ((m = take(new RegExp(`\\s(?:vao\\s+)?(?:ngay|mung|mong)\\s+(\\d{1,2})\\s+thang\\s+${LUNAR_MON}\\s`))) || (m = take(/\s(\d{1,2})\s*\/\s*(\d{1,2})\s/)))) lunar = { d: +m[1], m: lunarMon(m[2]) };
    if (lunar && !(lunar.d >= 1 && lunar.d <= 30 && lunar.m >= 0 && lunar.m <= 12)) lunar = null;
    if (lunar) {
      due = LUNAR.next(lunar.d, lunar.m, td); dateSet = !!due; dayNum = lunar.d;
      // giỗ, "hằng năm" theo âm lịch; "rằm hằng tháng" lặp theo tháng âm
      if (repeat === "year" || (!repeat && /giỗ/iu.test(raw) && lunar.m)) repeat = "lunar-year";
      else if (repeat === "month" && !lunar.m) repeat = "lunar-month";
    }
  }

  /* --- ngày --- */
  const W = { "2": 1, "3": 2, "4": 3, "5": 4, "6": 5, "7": 6, "cn": 0, "chu nhat": 0 };
  // "12h đêm", "nửa đêm" là cuối ngày được nói (hạn 23:59), đọc trước phần ngày để "nửa đêm mai" vẫn ra ngày mai
  const midnight = !!take(/\s(?:luc\s+)?nua dem\s/);
  if (lunar) {}
  else if (take(/\s(?:hom qua|hqua|bua qua|toi qua|dem qua|trua qua|chieu qua)\s/)) { due = addDays(td, -1); dateSet = true; }
  else if (take(/\s(?:hom kia|hkia)\s/)) { due = addDays(td, -2); dateSet = true; }
  else if (take(/\s(?:hom nay|toi nay|sang nay|chieu nay|trua nay|dem nay|khuya nay)\s/)) { due = td; dateSet = true; }
  else if (take(/\s(?:ngay mai|sang mai|chieu mai|toi mai|trua mai|dem mai|khuya mai)\s/) || take(/(?<!\s(?:voi|cho|cua|chi|anh|em|ban|co|chu|di|ba|ong|be|ten))\s(?:mai)\s/)) { due = addDays(td, 1); dateSet = true; }
  else if (take(/\s(?:ngay mot|ngay kia)\s/)) { due = addDays(td, 2); dateSet = true; }
  // "3 ngày nữa", "hai hôm nữa", "1 tuần nữa", "2 tháng nữa" (không bắt "thứ 2 tuần sau")
  else if ((m = take(/(?<!thu)\s(\d{1,2}|mot|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi)\s(ngay|hom|tuan|thang)\s(?:nua|sau|toi)\s/))) {
    const k = /\d/.test(m[1]) ? +m[1] : NUM_WORD[m[1]];
    if (k > 0) { due = m[2] === "thang" ? addMonthsYmd(td, k) : addDays(td, m[2] === "tuan" ? 7 * k : k); dateSet = true; }
  }
  // "cuối tuần" (thứ 7; Chủ nhật thì là hôm nay), "đầu tuần sau", "giữa tuần", "cuối tháng", "đầu tháng sau", "giữa tháng"
  else if ((m = take(/\s(cuoi|dau|giua)\s(tuan|thang)(?:\s(nay|sau|toi))?\s/))) {
    const nx = m[3] === "sau" || m[3] === "toi", ws = weekStart(td), dw = parseYmd(td).getDay();
    if (m[2] === "tuan") {
      const off = { dau: 0, giua: 2, cuoi: 5 }[m[1]];
      due = nx ? addDays(ws, 7 + off) : m[1] === "cuoi" && dw === 0 ? td : addDays(ws, off) >= td ? addDays(ws, off) : addDays(ws, 7 + off);
    } else if (m[1] === "cuoi") due = monthEnd(td, nx ? 1 : 0);
    else { const day = m[1] === "dau" ? 1 : 15; due = nx ? monthDay(td, 1, day) : monthDay(td, 0, day) >= td ? monthDay(td, 0, day) : monthDay(td, 1, day); }
    dateSet = true;
  }
  // thứ bằng số hoặc chữ: "thứ 6", "t6", "thứ sáu", "chủ nhật"; theo sau có thể là "tuần sau/tới/này", "này", "tới"
  m = lunar ? null : n.match(/\s(?:(?:vao |moi )?thu\s*([2-7])|(?:vao |moi )?thu\s+(hai|ba|tu|nam|sau|bay)|t([2-7])|(chu nhat|cn))(\s+tuan (?:sau|toi|nay)|\s+(?:toi|nay)(?=\s))?\s/);
  // "thứ tự", "thư từ" sau norm() cũng là "thu tu": câu có dấu thì phải đúng "thứ tư"
  if (m && m[2] && !new RegExp(`(?:^|[^\\p{L}])(?:thứ\\s+${WD_WORD[m[2]][1]}|thu\\s+${m[2]})(?![\\p{L}\\p{M}])`, "iu").test(raw)) m = null;
  if (m) {
    let s = m[0], suf = m[5] || "";
    // "thứ 5 tới" là thứ 5 sắp tới; "thứ 5 tối" (gõ có dấu) là buổi tối, để lại cho phần giờ
    if (/^\s+toi$/.test(suf) && !/tới/iu.test(raw)) { s = s.slice(0, s.length - suf.length - 1) + " "; suf = ""; }
    used.push(s.trim()); n = n.replace(s, " ");
    const dow = W[m[1] || m[3] || m[4]] ?? WD_WORD[m[2]][0];
    // "thứ 2 tuần sau": thứ 2 của tuần kế tiếp (tuần bắt đầu từ thứ 2), không phải thứ 2 gần nhất cộng 7 ngày
    due = /tuan (?:sau|toi)/.test(suf) ? addDays(weekStart(td), 7 + (dow + 6) % 7) : nextWeekday(td, dow);
    if (/^\s+toi$/.test(suf) && due === td) due = addDays(td, 7);   // "chủ nhật tới" nói vào Chủ nhật: tuần sau
    if (repeat === "" && /moi thu/.test(m[0])) repeat = "week"; dateSet = true;
  }
  else if (!lunar && take(/\s(?:tuan sau|tuan toi)\s/)) { due = nextWeekday(addDays(td, 1), 1); dateSet = true; }
  m = lunar ? null : take(/\s(?:ngay\s*)?(\d{1,2})\s*[\/\-]\s*(\d{1,2})(?:\s*[\/\-]\s*(\d{2,4}))?\s/);
  if (lunar) {}
  else if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) {
    due = m[3] ? clampYmd(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2], +m[1]) : dayMonth(td, +m[2], +m[1]); dateSet = true; dayNum = +m[1];
  } else {
    // "ngày 5", "mùng 5", "mồng 8 tháng 11"; "ngày 20 trả góp" vẫn là ngày ("tr" chỉ là đơn vị tiền khi đứng riêng hoặc có số theo sau)
    m = take(new RegExp(`\\s(?:vao\\s+)?(?:ngay|mung|mong)\\s+(\\d{1,2})(?:\\s+thang\\s+(\\d{1,2}))?(?!\\s?(?:${MONEY_UNITS})(?:\\d|\\s|$))\\s`));
    if (m && +m[1] >= 1 && +m[1] <= 31) {
      const d = parseYmd(td), mo = m[2] && +m[2] >= 1 && +m[2] <= 12 ? +m[2] : null;
      if (mo) due = dayMonth(td, mo, +m[1]);
      else { due = clampYmd(d.getFullYear(), d.getMonth() + 1, +m[1]); if (due < td) due = clampYmd(d.getFullYear(), d.getMonth() + 2, +m[1]); }
      dateSet = true; dayNum = +m[1];
    }
  }

  if (repeat && due && due < td && !lunar && typeof nextDue === "function") { const day = dayNum || +due.slice(8); for (let g = 0; due < td && g < 800; g++) due = nextDue(due, repeat, day); }

  /* --- giờ --- */
  let time = "";
  // "8h30", "8 giờ rưỡi", "9h kém 15", "7h tối", "07g00"
  m = take(/\s(?:luc\s+)?(?<h>\d{1,2})\s*(?:h|gio|:)\s*(?<mi>\d{1,2}|ruoi)?\s*(?:phut\s*)?(?:kem\s*(?<kem>\d{1,2})\s*(?:phut\s*)?)?(?<part>sang|trua|chieu|toi|dem|khuya)?\s/)
    || take(/\s(?:luc\s+)?(?<h>\d{1,2})\s*g\s*(?<mi>\d{2})\s*(?<part>sang|trua|chieu|toi|dem)?\s/) || take(/\s(?:luc\s+)?(?<h>\d{1,2})\s*g\s+(?<part>sang|trua|chieu|toi|dem)\s/);
  if (m && +m.groups.h <= 24) {
    const g = m.groups; let h = +g.h, mi = g.mi === "ruoi" ? 30 : g.mi ? +g.mi : 0;
    // buổi nói ở chỗ khác trong câu: "tối nay 8h", "tập gym tối thứ 3 7h", "ăn tối 7h" (chỉ chữ có dấu, vì "toi" cũng là "tôi")
    const pw = raw.match(/(?:^|[^\p{L}])(chiều|chieu|tối|trưa|trua|đêm|khuya)(?![\p{L}\p{M}])/iu);
    const part = g.part || (/(?:toi|chieu|trua) (?:nay|mai)/.test(used.join(" ")) ? used.join(" ").match(/toi|chieu|trua/)[0] : pw ? norm(pw[1]) : "");
    if ((part === "chieu" || part === "toi") && h < 12) h += 12;
    if (part === "trua" && h < 5) h += 12;
    if (part === "dem" && h >= 9 && h < 12) h += 12;
    if (g.kem && +g.kem < 60 && h * 60 + mi >= +g.kem) { const t = h * 60 + mi - +g.kem; h = Math.floor(t / 60); mi = t % 60; }
    // "12h đêm", "0h", "24h": nửa đêm cuối ngày được nói, hạn 23:59 của chính ngày đó (không phải 12 giờ trưa hay sang ngày sau)
    if (!g.kem && !mi && (h === 24 || h === 0 || (h === 12 && (part === "dem" || part === "khuya")))) { h = 23; mi = 59; }
    if (h <= 24 && mi < 60) time = `${pad(h % 24)}:${pad(mi)}`;
  } else if (midnight) time = "23:59";
  else if (/toi (?:nay|mai)/.test(used.join(" "))) time = "20:00";

  /* --- tiền --- */
  let amount = 0;
  const known = (opts.exercises || []).map(e => [norm(e), e]);
  let fm = findMoney(n);
  if (fm && /[\d\s]m$/.test(fm.text) && [...known, ...EX_ALIAS].some(([k]) => n.includes(" " + k + " "))) fm = null; // "bơi 500m" là mét
  if (fm) { amount = fm.amount; used.push(fm.text); n = n.slice(0, fm.start) + " " + n.slice(fm.end); }
  else {
    m = n.match(/\s(?:\+\s)?(\d{1,3}(?:[.,]\d{3})+|\d{4,})(?=\s)/);
    if (m) { amount = +m[1].replace(/[.,]/g, ""); used.push(m[0].trim()); n = n.replace(m[0], " "); }
  }

  /* --- bài tập thể dục --- */
  let exHit = [...known, ...EX_ALIAS].filter(([k]) => n.includes(" " + k + " ") || n.trimStart().startsWith(k + " ")).sort((a, b) => b[0].length - a[0].length)[0];
  // bài chưa biết tên nhưng câu có dạng "Tên bài 4x8": "deadlift 5x5 80kg", "đẩy ngực 3x10" (không có tiền, ngày, giờ)
  // chỉ khi đang bật mục Tập: người không tập thì "in ảnh 4x6" vẫn là việc
  if (!exHit && !amount && !dateSet && !time && !repeat && opts.gym !== false) {
    const mn = raw.match(/^\s*(\p{L}[\p{L}\s'-]{1,40}?)\s+\d{1,2}\s*[x×*]\s*\d{1,3}(?:\s|$)/u);
    if (mn && !/\d/.test(mn[1])) exHit = [norm(mn[1]).trim(), cap(mn[1].trim())];
  }
  if (exHit && !amount) {
    let rest = n.replace(exHit[0], " "), kg = 0, note = "";
    // "40kg", "@40kg": mức tạ; "5km": quãng đường vào ghi chú (số hiệp chỉ ghi phút, lần, giây)
    let mk = rest.match(/\s@?\s?(\d+(?:[.,]\d+)?)\s?(?:kg|ky|ki)\s/);
    if (mk) { kg = +mk[1].replace(",", "."); rest = rest.replace(mk[0], " "); }
    mk = rest.match(/\s(\d+(?:[.,]\d+)?)\s?km\s/);
    if (mk) { note = mk[1] + "km"; rest = rest.replace(mk[0], " "); }
    let sets = [], nset = 0;
    // "3 hiệp": số hiệp, số còn lại là số lần (giây, phút) mỗi hiệp
    mk = rest.match(/\s(\d{1,2})\s?(?:hiep|set|sets|vong)\s/);
    if (mk) { nset = Math.min(+mk[1], 30); rest = rest.replace(mk[0], " "); }
    const mx = rest.match(/(\d+)\s*[x×*]\s*(\d+)/);
    if (mx) sets = Array(Math.min(+mx[1], 30)).fill(+mx[2]);
    else sets = (rest.match(/\d+(?:[.,]\d+)?/g) || []).map(x => Math.round(parseFloat(x.replace(",", ".")))).filter(x => x > 0).slice(0, 30);
    if (nset && sets.length === 1) sets = Array(nset).fill(sets[0]);
    else if (nset && !sets.length) note = [note, `${nset} hiệp`].filter(Boolean).join(", ");
    if (sets.length || note) {
      const data = { ex: exHit[1], sets, date: td }; if (kg > 0) data.kg = kg; if (note) data.note = note;
      return { kind: "workout", data, text: `${exHit[1]}: ${[sets.length ? sets.join(" ") + (/phut/.test(rest) ? " phút" : "") : "", kg > 0 && `${String(kg).replace(".", ",")}kg`, note].filter(Boolean).join(" · ")}` };
    }
  }

  /* --- câu hỏi gốc, bỏ phần đã hiểu để làm tiêu đề --- */
  let title = raw;
  for (const u of used) {
    // bỏ đoạn tương ứng trong câu gốc (so khớp không dấu theo từng ký tự)
    const nr = norm(title); const i = nr.indexOf(u);
    if (i >= 0) title = (title.slice(0, i) + " " + title.slice(i + u.length));
  }
  title = title.replace(/(^|\s)\+\s*\d[\d.,]*\s*(?:k|nghìn|ngàn|tr|triệu|củ|đ|đồng)?(?=\s|$)/i, " ").replace(/^\s*(?:nhắc (?:tôi|mình|em)|nhớ|nhac toi|nho)\s+/i, "").replace(/\s{2,}/g, " ").replace(/^[\s,.\-–:+]+|[\s,.\-–:]+$/g, "").replace(/\s+(?:lúc|vào|ngày)$/i, "").trim();
  // "nộp đơn trước thứ 6", "trước 23h59 nộp bài": hạn đã nằm ở trường ngày giờ, chữ "trước" thừa
  if (dateSet || time) title = title.replace(/\s+(?:trước|truoc)(?:\s+(?:ngày|lúc|hạn))?$/i, "").replace(/^(?:trước|truoc)\s+/i, "").trim();

  // "cơm trưa 35" → 35.000đ khi câu rõ ràng là một khoản chi
  if (!amount && !exHit) {
    // số sau "tháng", "ngày", "lớp"… không phải tiền: "đóng học phí tháng 10"
    const bm = (" " + norm(title) + " ").match(/(?<!\s(?:thang|ngay|mung|mong|tuan|nam|lop|phong|so|tiet|thu|hiep|lan|bai|chuong|trang|quy|ky|tap|buoi|khoa|tang))\s(\d{1,3}(?:[.,]\d)?)\s(?!(?:trang|lan|cai|chiec|ly|coc|chai|lon|nguoi|bai|cau|phut|gio|tieng|km|kg|buoi|hiep|ngay|thang|tuan|nam)\s)/);
    if (bm && !dateSet && !time) {
      const t2 = title.replace(new RegExp("(^|\\s)" + bm[1].replace(".", "\\.") + "(?=\\s|$)"), " ").replace(/\s{2,}/g, " ").trim();
      const nt2 = " " + norm(t2) + " ";
      if (Object.entries(CAT_WORDS).some(([k, w]) => !IN_KEYS.includes(k) && w.split("|").some(ph => ph.length >= 2 && nt2.includes(" " + ph + " ")))) { amount = Math.round(parseFloat(bm[1].replace(",", ".")) * 1000); title = t2; }
    }
  }
  const nt = " " + norm(title) + " ";
  // sổ nợ: mượn, cho mượn, trả nợ, chia tiền (không phải thu chi, trừ phần của mình khi chia tiền)
  if (amount && !repeat) { const dq = debtOf(title, amount, opts, td, dateSet ? due : ""); if (dq) return dq; }
  if (amount) {
    const nr = " " + norm(raw).replace(/\+(?=\d)/g, "+ ") + " ";
    // "vay bạn 500k" (mình vay) là thu; "cho bạn vay", "trả nợ vay" là chi
    // (2.8: "vay bạn 500k" giờ là khoản nợ ở debtOf; còn lại "đi vay 5tr" không rõ ai cho vay. "váy" không phải "vay")
    const borrow = /(?:^|\s)vay\s/.test(nr) && (norm(raw) === raw.toLowerCase() || /(?:^|[^\p{L}])vay(?![\p{L}\p{M}])/iu.test(raw)) && !/\scho\s(?:\S+\s){0,3}vay\s|\stra\s(?:\S+\s){0,2}vay\s|\s(?:no|lai|tien)\svay\s/.test(nr);
    const payer = nt.match(/^\s(?:[a-z]+\s){0,2}?([a-z]+)\stra\s(?:no|lai|tien)\s/);
    const isIn = /^\s*(?:\+|thu (?![2-7]\s|(?:hai|ba|tu|nam|sau|bay)\s)|nhan |duoc |luong|thuong|hoc bong|ban duoc|ban hang|lai |co tuc)/.test(nr) || /\s(?:luong|hoc bong|duoc cho|duoc tra|tien thuong|me gui|bo gui|ba gui|me cho|bo cho|ba cho|khach tra|khach chuyen|ban duoc|tien tieu vat|tien lai|lai suat|co tuc)\s/.test(nr)
      || IN_FROM.test(nr) || /\sban\s(?:\S+\s){0,4}duoc\s/.test(nr) || (payer && !NOT_PAYER.test(payer[1])) || /^\s*\+/.test(raw)
      || /^\s(?:[a-z]+\s)?ban\s(?:[a-z]+\s)?tra\s(?!(?:no|tien)?\s?cho\s)/.test(nr) || /\shoan\s(?:tien|lai|phi|coc)\s/.test(nr) || borrow;
    if (repeat || (dateSet && due > td)) {
      const T = cap(title) || "Khoản phải trả", d = due || td;
      return { kind: "task", data: { title: T, type: "khac", due: d, time, status: "todo", repeat, ...(until ? { until } : {}), ...dayOf(repeat, dayNum), amount, cat: guessCat(title, false, opts), subs: [], note: "" }, text: `Phải trả ${moneyShort(amount)}: ${T} · ${dueText(d, td, lunar)}${time ? " " + time : ""}${repText(repeat, until)}` };
    }
    const cat = guessCat(title, isIn, opts);
    const noteTitle = title.replace(/^\s*(?:\+|thu|nhận|được|chi|mua)\s+/i, (s) => /mua/i.test(s) ? s : "").trim();
    const data = { type: isIn ? "in" : "out", amount, cat, note: noteTitle || title, date: dateSet && due <= td ? due : td };
    return { kind: "tx", data, text: txText(data, td), dated: dateSet && due <= td };
  }

  // câu chỉ có ngày âm ("rằm", "mùng 1 âm"): lấy chính ngày đó làm tên việc, không bỏ câu
  if (!title && lunar && due) title = lunar.d === 15 ? `Rằm${lunar.m ? ` tháng ${lunar.m}` : ""}` : `Mùng ${lunar.d}${lunar.m ? ` tháng ${lunar.m}` : ""} âm`;
  if (!title) return null;
  let type = "khac";
  // "đơn" (giấy tờ) so trên chữ có dấu khi câu gõ có dấu: "đón con" không phải giấy tờ
  const marked = norm(title) !== title.toLowerCase();
  if (/\s(?:thi|kiem tra|kt|giua ky|cuoi ky)\s/.test(nt)) type = "thi";
  else if (marked ? /(?:^|[^\p{L}])(?:đơn|giấy|hồ sơ|xin|ký tên|kí tên|công chứng|thủ tục)(?![\p{L}\p{M}])/iu.test(title) : /\s(?:don|giay|ho so|xin|ky ten|cong chung|thu tuc)\s/.test(nt)) type = "don";
  else if (/\s(?:bai tap|btl|bao cao|do an|assignment|lab|bai tap lon|slide|tieu luan|deadline|nop bai|lam bai)\s/.test(nt)) type = "bai";
  if (repeat && !due) due = td;
  // chỉ có giờ ("họp 15h"): hôm nay, hoặc ngày mai nếu giờ đó đã qua, để việc lên lịch và được nhắc
  if (time && !due) due = td === today() && toMin(time) <= nowMin() ? addDays(td, 1) : td;
  const T = cap(title);
  return { kind: "task", data: { title: T, type, due, time, status: "todo", repeat, ...(until ? { until } : {}), ...dayOf(repeat, dayNum), subs: [], note: "" }, text: `Việc: ${T}${due ? " · " + dueText(due, td, lunar) : ""}${time ? " " + time : ""}${repText(repeat, until)}` };
}

/* ---- sổ nợ (2.8) ----
   Đọc trên tiêu đề đã bỏ số tiền và ngày: "mượn bạn Nam", "cho Nam mượn", "Lan nợ mình", "Nam trả", "trả nợ Hùng", "lẩu chia 4 với Nam Lan".
   Trả nợ chỉ nhận khi sổ nợ có khoản còn nợ của đúng người đó (opts.debts từ openDebts()); không có thì câu đi theo cách hiểu cũ (thu, chi).
   Câu gõ có dấu thì động từ phải đúng dấu: "váy hoa 300k", "trà sữa", "nó trả" không phải vay, trả, nợ. */
const DEBT_ME = "(?:minh|toi|tao|to|em)";
const DEBT_STOP = new Set(["de", "dong", "nop", "mua", "tra", "an", "di", "lam", "hoc", "sua", "dat", "thue", "vi", "luc", "hom", "nha", "nhe", "tien"]);
/* "mượn xe 50k", "mượn sách": mượn đồ vật, không phải nợ tiền một người */
const DEBT_THING = ["xe", "sách", "vở", "bút", "đồ", "máy", "laptop", "điện", "phòng", "áo", "quần", "giày", "dù", "ô", "sạc", "pin", "thẻ", "phim", "đĩa", "ghế"];
/* chữ đầu là đồ vật: câu có dấu so đúng chữ có dấu (tên "Mây", "Điền" vẫn là người), câu không dấu chỉ so vài chữ không trùng tên người */
const debtThing = (who, marked) => { const w = who.split(/\s+/)[0].toLowerCase(); return marked ? DEBT_THING.includes(w) : ["xe", "sach", "laptop", "pin", "phim", "sac", "ghe"].includes(norm(w)); };
const DEBT_N = { doi: 2, hai: 2, ba: 3, bon: 4, tu: 4, nam: 5, sau: 6, bay: 7, tam: 8, chin: 9, muoi: 10 };
const DEBT_VERB = { no: "nợ", muon: "mượn", vay: "vay", tra: "trả", gui: "gửi", chuyen: "chuyển", ck: "ck", cho: "cho", chia: "chia" };
/* đoạn chữ gốc (có dấu) ứng với vị trí [a, b) trên nt = " " + norm(title) + " " (norm giữ nguyên độ dài với chữ tiếng Việt dựng sẵn) */
const debtCut = (title, a, b) => norm(title).length === title.length ? title.slice(Math.max(0, a - 1), Math.max(0, b - 1)) : (" " + norm(title) + " ").slice(a, b);
const debtGrp = (title, m, g) => { const ix = m.indices && (m.indices.groups || {})[g]; return ix ? debtCut(title, ix[0], ix[1]).trim() : ((m.groups || {})[g] || "").trim(); };
/* động từ khớp có đúng chữ có dấu không (câu không dấu thì luôn đúng) */
const debtVerbOk = (title, m) => { const v = m.groups && m.groups.v; return !v || norm(title) === title.toLowerCase() || debtGrp(title, m, "v").toLowerCase() === DEBT_VERB[v]; };
/* tên người: bỏ "của", "tiền" đứng trước, "bạn Nam" → "Nam"; tối đa 3 chữ, gặp chữ chỉ mục đích ("để", "đóng"…) thì phần sau là ghi chú */
function debtWho(s) {
  const words = String(s || "").trim().replace(/^(?:(?:của|cua|tiền|tien)\s+)+/iu, "").split(/\s+/).filter(Boolean);
  let k = 0; while (k < words.length && k < 3 && !(k > 0 && DEBT_STOP.has(norm(words[k])))) k++;
  let who = words.slice(0, k).join(" ");
  if (/^(?:bạn|ban)\s+\S/iu.test(who)) who = who.replace(/^\S+\s+/u, "");
  return { who: who.replace(/[.,;:!?]+$/, ""), note: words.slice(k).join(" ") };
}
function debtOf(title, amount, opts, td, when) {
  const nt = " " + norm(title) + " ", date = when && when <= td ? when : td, due = when && when > td ? when : "";
  const after = d => due ? ` · hẹn trả ${dueLabel(due, td)}` : d < td ? ` · ${dueLabel(d, td)}` : "";
  let m;
  /* chia tiền: "lẩu 600k chia 4", "pizza 300k chia 3 với Nam Lan", "chia đôi tiền taxi 100k", "cơm 200k chia với Nam, Lan" */
  if ((m = nt.match(/\s(?<v>chia)(?:\sdeu)?(?:\s(?<n>\d{1,2}|doi|hai|ba|bon|tu|nam|sau|bay|tam|chin|muoi)(?:\s(?:nguoi|phan|dua|ban))?)?(?:\s(?:voi|cung)\s(?<names>.+))?\s(?<rest>.*)$/d)) && debtVerbOk(title, m)) {
    const n0 = m.groups.n ? (/\d/.test(m.groups.n) ? +m.groups.n : DEBT_N[m.groups.n]) : 0;
    const raw = debtGrp(title, m, "names");
    const names = raw ? raw.split(/[,;&+]|\s(?:và|va)\s/iu.test(raw) ? /\s*(?:[,;&+]|\s(?:và|va)\s)\s*/iu : /\s+/).map(x => x.trim()).filter(Boolean).slice(0, 30) : [];
    const n = Math.max(n0, names.length ? names.length + 1 : 0);
    if (n >= 2 && n <= 50) {
      const note = [debtCut(title, 0, m.index), debtGrp(title, m, "rest")].map(x => x.trim()).filter(Boolean).join(" ").replace(/^(?:tiền|tien)\s+/iu, "");
      const data = { total: amount, n, names, payer: "", note, cat: guessCat(note || "chia tien", false, opts), date };
      const p = typeof splitPlan === "function" ? splitPlan(amount, n, names) : null;
      return { kind: "split", data, text: `Chia ${moneyShort(amount)}${note ? ` ${note}` : ""} cho ${n}${p ? `: chi ${moneyShort(p.mine)}, ${p.debts.map(d => `${d.who} nợ ${moneyShort(d.amount)}`).join(", ")}` : ""}${after(date)}` };
    }
  }
  /* trả nợ: chỉ khi sổ nợ có khoản của đúng người đó, đúng chiều */
  const keyOf = typeof debtKey === "function" ? debtKey : s => norm(s).trim();
  const match = (who, dir) => {
    const q = keyOf(who), open = (opts.debts || []).filter(x => x && x.dir === dir && x.left > 0);
    let keys = [...new Set(open.filter(x => x.key === q).map(x => x.key))];
    // "bạn trả 200k": "bạn" chung chung là người tên "bạn", các khoản chia tiền chưa ghi tên, hoặc người duy nhất đang nợ
    if (!keys.length && q === "ban") { keys = [...new Set(open.filter(x => x.key === "ban" || /^\d+ nguoi$/.test(x.key)).map(x => x.key))]; if (!keys.length) { const one = [...new Set(open.map(x => x.key))]; if (one.length === 1) keys = one; } }
    return keys.length ? { keys, left: open.filter(x => keys.includes(x.key)).reduce((s, x) => s + x.left, 0), who: (open.find(x => x.key === keys[0]) || {}).who || who } : null;
  };
  const pay = (whoRaw, dir) => {
    const who = debtWho(whoRaw).who; if (!who || NOT_PAYER.test(norm(who))) return null;   // "em trả", "anh trả" là mình trả; "anh Nam trả" thì không
    const hit = match(who, dir); if (!hit) return null;
    const rest = hit.left - amount;
    return { kind: "debtpay", data: { who: hit.who, keys: hit.keys, dir, amount }, text: `${dir === "lend" ? `${hit.who} trả nợ` : `Trả nợ ${hit.who}`} ${moneyShort(amount)}${rest > 0 ? `, còn ${moneyShort(rest)}` : rest < 0 ? `, hết nợ (dư ${moneyShort(-rest)})` : ", hết nợ"}` };
  };
  const re = (s, ...v) => new RegExp(String.raw(s, ...v).replace(/ME/g, DEBT_ME), "d");   // re`…`: viết \s như trong regex thường
  let q = null;
  if ((m = nt.match(re`^\s(?:ME\s)?(?:da\s)?(?<v>tra)\s(?:(?:lai|no|tien)\s)*(?:cho\s)?(?<who>.+?)(?:\s(?:no|tien))?\s$`)) && debtVerbOk(title, m)) q = pay(debtGrp(title, m, "who"), "owe");
  if (!q && (m = nt.match(re`^\s(?<who>.+?)\s(?:da\s)?(?<v>tra|gui|chuyen|ck)\s(?:lai\s)?(?:(?:no|tien)\s)*(?:(?:cho\s)?ME\s)?$`)) && debtVerbOk(title, m)) q = pay(debtGrp(title, m, "who"), "lend");
  if (q) return q;
  /* mượn, cho mượn */
  const mk = (whoRaw, dir) => {
    const w = debtWho(whoRaw), who = w.who, note = w.note.replace(/^(?:(?:hẹn|hen)\s+)?(?:trả|tra)(?:\s+(?:lại|lai|nợ|no))?$/iu, "");
    if (!who || /\d/.test(who) || NOT_PAYER.test(norm(who)) || debtThing(who, norm(title) !== title.toLowerCase())) return null;
    const data = { who, amount, dir, date, due, note };
    return { kind: "debt", data, text: `${dir === "lend" ? `${cap(who)} nợ mình` : `Mình nợ ${who}`} ${moneyShort(amount)}${note ? ` · ${note}` : ""}${after(date)}` };
  };
  if ((m = nt.match(re`^\s(?:ME\s)?(?:da\s)?cho\s(?<who>.+?)\s(?<v>muon|vay)(?:\s(?:tien|no))?\s(?<rest>.*)$`)) && debtVerbOk(title, m)) q = mk(`${debtGrp(title, m, "who")} ${debtGrp(title, m, "rest")}`, "lend");
  if (!q && (m = nt.match(re`^\s(?<who>.+?)\s(?:con\s|da\s)?(?<v>no|muon|vay)\s(?:tien\s)?(?:cua\s)?ME\s(?<rest>.*)$`)) && debtVerbOk(title, m) && !NOT_PAYER.test(m.groups.who)) q = mk(`${debtGrp(title, m, "who")} ${debtGrp(title, m, "rest")}`, "lend");
  if (!q && (m = nt.match(re`^\s(?:ME\s)?(?:con\s|da\s|di\s)?(?<v>muon|vay|no)\s(?<who>.+?)\s$`)) && debtVerbOk(title, m)) q = mk(debtGrp(title, m, "who"), "owe");
  return q;
}

/* loại khoản chi / thu, học từ lịch sử */
function guessCat(title, isIn, opts = {}) {
  const nt = " " + norm(title) + " ";
  const hist = (opts.history || []).find(h => norm(h.note) === norm(title) && (h.type === "in") === isIn);
  if (hist) return hist.cat;
  let best = "", bl = 0;
  for (const [k, words] of Object.entries(CAT_WORDS)) {
    if (opts.validCats && !opts.validCats.includes(k)) continue;
    if (IN_KEYS.includes(k) !== isIn) continue;
    for (const ph of words.split("|")) if (nt.includes(" " + ph + " ") && ph.length > bl) { best = k; bl = ph.length; }
  }
  for (const c of opts.customCats || []) if ((c.t === "in") === isIn && nt.includes(" " + norm(c.n) + " ") && norm(c.n).length > bl) { best = c.k; bl = norm(c.n).length; }
  return best || (isIn ? "thukhac" : "khac");
}
function txText(d, td) {
  return `${d.type === "in" ? "Thu" : "Chi"} ${money(d.amount)} · ${(CAT[d.cat] || ["", "Khác"])[1]}${d.note ? " · " + d.note : ""}${d.date && d.date < td ? " · " + dueLabel(d.date, td) : ""}`;
}
/* Đổi một khoản Chi ⇄ Thu, đoán lại loại theo ghi chú */
function quickFlip(q, opts = {}) {
  if (!q || q.kind !== "tx") return q;
  const isIn = q.data.type !== "in";
  const data = { ...q.data, type: isIn ? "in" : "out", cat: guessCat(q.data.note, isIn, opts) };
  return { ...q, data, text: txText(data, opts.today || today()) };
}
function _unused_phrasesOf(words) {
  // tách chuỗi từ khóa thành các cụm 1–3 chữ có nghĩa (dựa trên danh sách viết sẵn, cụm 2 chữ đứng cạnh nhau)
  const w = words.split(" "), out = new Set();
  for (let i = 0; i < w.length; i++) { out.add(w[i]); if (i + 1 < w.length) out.add(w[i] + " " + w[i + 1]); if (i + 2 < w.length) out.add(w[i] + " " + w[i + 1] + " " + w[i + 2]); }
  // bỏ các từ đơn quá chung chung
  ["an", "di", "ve", "xe", "con", "do", "in", "be", "ca", "bo", "me", "ba", "lai", "qua", "hoc", "nha", "tien", "nuoc", "mua", "sua", "dien", "thoai", "lop", "cho", "thu", "tra", "gui", "ban", "hang", "duoc", "thang", "toi", "sang", "trua"].forEach(x => out.delete(x));
  ["an sang", "an trua", "an toi", "an vat", "tra sua", "nuoc ep", "nuoc ngot", "tien nha", "tien phong", "tien dien", "tien nuoc", "dien nuoc", "sua xe", "sua nha", "hoc phi", "hoc them", "lop hoc", "khoa hoc", "ve xe", "gui xe", "xe om", "di cho", "me gui", "bo gui", "ba gui", "me cho", "bo cho", "ban hang", "ban duoc", "tien thuong", "luong thang", "nguoi yeu", "dien thoai", "qua tang", "tra cafe", "ca phe"].forEach(x => out.add(x));
  return out;
}
/* hạn trong câu xem trước: thêm năm nếu khác năm nay, thêm ngày âm nếu câu nói theo âm lịch */
function dueText(d, td, lunar) {
  return dueLabel(d, td) + (d.slice(0, 4) !== td.slice(0, 4) && Math.abs(dayDiff(d, td)) > 2 ? "/" + d.slice(0, 4) : "") + (lunar && typeof LUNAR !== "undefined" ? ` (${LUNAR.text(d)} âm)` : "");
}
const repText = (repeat, until) => repeat ? ` · ↻ ${REPEAT_NAME[repeat] || ""}${until ? " đến " + dm(until) : ""}` : "";
function dueLabel(d, td) {
  const k = dayDiff(d, td);
  if (k === 0) return "hôm nay"; if (k === 1) return "ngày mai"; if (k === -1) return "hôm qua"; if (k === 2) return "ngày mốt";
  return `${DOWL[parseYmd(d).getDay()]} ${dm(d)}`;
}
