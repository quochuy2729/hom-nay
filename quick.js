"use strict";
/* Ghi nhanh bằng một câu tiếng Việt: "cà phê 30k", "nộp báo cáo thứ 6 5h chiều", "hít đất 20 15 15", "cân nặng 65,5", "đóng tiền nhà 3tr ngày 5 hằng tháng". */
const CAT_WORDS = {
  nuoc: "ca phe|cafe|coffee|cf|tra sua|tra chanh|tra dao|tra da|ly tra|uong tra|nuoc ep|sinh to|nuoc ngot|nuoc suoi|highlands|phuc long|starbucks|katinat|the coffee house|bia|ruou|nhau",
  an: "com|pho|bun|mi|mien|hu tieu|banh mi|banh|an sang|an trua|an toi|an vat|bua sang|bua trua|bua toi|lau|nuong|ga ran|kfc|lotte|jollibee|pizza|chao|xoi|com tam|bun bo|oc|che|kem|trai cay|sieu thi|di cho|do an|rau|thit|ca|trung|sua chua|snack|grabfood|shopeefood|baemin",
  dilai: "xang|do xang|grab|be bike|be car|gojek|xanh sm|taxi|xe om|gui xe|ve xe|xe buyt|bus|metro|sua xe|rua xe|thay nhot|ve may bay|ve tau|cau duong|bao hiem xe|dang kiem",
  hoc: "sach|tap vo|vo viet|but|photo|in tai lieu|tai lieu|hoc phi|khoa hoc|hoc them|gia su|lop hoc|thi ielts|le phi thi",
  muasam: "mua|ao|quan|giay|dep|tui|shopee|lazada|tiki|tiktok shop|dien thoai|tai nghe|laptop|my pham|do dung",
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
  giadinh: "me gui|bo gui|ba gui|me cho|bo cho|ba cho|ong ba cho|gia dinh gui|anh chi cho|tien tieu vat",
  kinhdoanh: "ban hang|ban duoc|doanh thu|khach tra|khach chuyen|thu ban",
  dautu: "tien lai|lai suat|co tuc|lai tiet kiem|loi nhuan"
};
const IN_KEYS = ["luong", "thuong", "giadinh", "kinhdoanh", "dautu"];
const EX_ALIAS = [["hit dat", "Chống đẩy"], ["push up", "Chống đẩy"], ["pushup", "Chống đẩy"], ["chong day", "Chống đẩy"], ["hit xa", "Hít xà"], ["pull up", "Hít xà"], ["pullup", "Hít xà"], ["xa kep", "Xà kép"], ["dip", "Xà kép"], ["chay bo", "Chạy bộ"], ["chay", "Chạy bộ"], ["plank", "Plank"], ["squat", "Squat"], ["gap bung", "Gập bụng"], ["dap xe", "Đạp xe"], ["boi", "Bơi"], ["di bo", "Đi bộ"], ["nhay day", "Nhảy dây"]];
const UNIT_MUL = { k: 1e3, nghin: 1e3, ngan: 1e3, ng: 1e3, tr: 1e6, trieu: 1e6, cu: 1e6, m: 1e6, lit: 1e5, xi: 1e5, d: 1, dong: 1, vnd: 1 };

function nextWeekday(from, dow) { const d = parseYmd(from); let k = (dow - d.getDay() + 7) % 7; return addDays(from, k); }

/* Trả về { kind, data, text } hoặc null */
function parseQuick(input, opts = {}) {
  const raw = String(input || "").normalize("NFC").trim(); if (!raw) return null;
  const td = opts.today || today();
  let n = " " + norm(raw).replace(/[,;!?]+(?=\s|$)/g, " ").replace(/\+(?=\d)/g, "+ ").replace(/\s+/g, " ") + " ";
  const used = []; // các đoạn đã hiểu, để bỏ khỏi tiêu đề
  const take = re => { const m = n.match(re); if (m) { used.push(m[0].trim()); n = n.replace(m[0], " "); } return m; };

  /* --- cân nặng --- */
  let m = n.match(/\s(?:can nang|can|nang)\s+(\d{2,3}(?:[.,]\d)?)\s*(?:kg|ky|ki|kilo)?\s/);
  if (m) { const kg = parseFloat(m[1].replace(",", ".")); if (kg > 20 && kg < 300) return { kind: "weight", data: { date: td, kg: Math.round(kg * 10) / 10 }, text: `Cân nặng ${kg.toLocaleString("vi-VN")} kg` }; }

  /* --- lặp lại --- */
  let repeat = "";
  if (take(/\s(?:hang|moi|hằng)\s+ngay\s/)) repeat = "day";
  else if (take(/\s2 tuan(?: mot lan| 1 lan)?\s/)) repeat = "2week";
  else if (take(/\s(?:hang|moi)\s+tuan\s/)) repeat = "week";
  else if (take(/\s(?:hang|moi)\s+thang\s/)) repeat = "month";

  /* --- ngày --- */
  let due = "", dateSet = false;
  const W = { "2": 1, "3": 2, "4": 3, "5": 4, "6": 5, "7": 6, "cn": 0, "chu nhat": 0 };
  if (take(/\s(?:hom qua)\s/)) { due = addDays(td, -1); dateSet = true; }
  else if (take(/\s(?:hom nay|toi nay|sang nay|chieu nay|trua nay)\s/)) { due = td; dateSet = true; }
  else if (take(/\s(?:ngay mai|sang mai|chieu mai|toi mai|trua mai)\s/) || take(/(?<!\s(?:voi|cho|cua|chi|anh|em|ban|co|chu|di|ba|ong|be|ten))\s(?:mai)\s/)) { due = addDays(td, 1); dateSet = true; }
  else if (take(/\s(?:ngay mot|ngay kia)\s/)) { due = addDays(td, 2); dateSet = true; }
  m = take(/\s(?:(?:vao |moi )?thu\s*([2-7])|t([2-7])|(chu nhat|cn))(\s+tuan (?:sau|toi))?\s/);
  if (m) { const dow = W[m[1] || m[2] || m[3]]; due = nextWeekday(td, dow); if (m[4]) due = addDays(due, due === td ? 7 : 7); if (repeat === "" && /moi thu/.test(m[0])) repeat = "week"; dateSet = true; }
  else if (take(/\s(?:tuan sau|tuan toi)\s/)) { due = nextWeekday(addDays(td, 1), 1); dateSet = true; }
  m = take(/\s(?:ngay\s*)?(\d{1,2})\s*[\/\-]\s*(\d{1,2})(?:\s*[\/\-]\s*(\d{2,4}))?\s/);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) {
    let y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : parseYmd(td).getFullYear();
    due = `${y}-${pad(+m[2])}-${pad(+m[1])}`; if (!m[3] && due < td) due = `${y + 1}-${pad(+m[2])}-${pad(+m[1])}`; dateSet = true;
  } else {
    m = take(/\s(?:vao\s+)?ngay\s+(\d{1,2})(?!\s*(?:k|tr|nghin|ngan|trieu|d\b))\s/);
    if (m && +m[1] >= 1 && +m[1] <= 31) { const d = parseYmd(td); let c = new Date(d.getFullYear(), d.getMonth(), +m[1]); if (ymd(c) < td) c = new Date(d.getFullYear(), d.getMonth() + 1, +m[1]); due = ymd(c); dateSet = true; }
  }

  /* --- giờ --- */
  let time = "";
  m = take(/\s(?:luc\s+)?(\d{1,2})\s*(?:h|gio|:)\s*(\d{1,2})?\s*(?:phut\s*)?(sang|trua|chieu|toi|dem)?\s/) || take(/\s(?:luc\s+)?(\d{1,2})\s*g\s*(\d{2})\s*(sang|trua|chieu|toi|dem)?\s/) || take(/\s(?:luc\s+)?(\d{1,2})\s*g()\s+(sang|trua|chieu|toi|dem)\s/);
  if (m && +m[1] <= 24) {
    let h = +m[1]; const mi = m[2] ? +m[2] : 0, part = m[3] || (/(?:toi|chieu|trua) (?:nay|mai)/.test(used.join(" ")) ? used.join(" ").match(/toi|chieu|trua/)[0] : "");
    if ((part === "chieu" || part === "toi") && h < 12) h += 12;
    if (part === "trua" && h < 5) h += 12;
    if (part === "dem" && h >= 9 && h < 12) h += 12;
    if (h <= 24 && mi < 60) time = `${pad(h % 24)}:${pad(mi)}`;
  } else if (/toi (?:nay|mai)/.test(used.join(" "))) time = "20:00";

  /* --- tiền --- */
  let amount = 0;
  m = n.match(/\s(?:\+\s)?(\d+(?:[.,]\d+)*)\s*(k|nghin|ngan|ng|tr|trieu|cu|m|lit|xi|d|dong|vnd)(?:\s?(\d)(?=\s))?(\s+ruoi)?(?=\s)/);
  if (m) {
    const mul = UNIT_MUL[m[2]];
    const num = /^\d{1,3}([.,]\d{3})+$/.test(m[1]) ? +m[1].replace(/[.,]/g, "") : parseFloat(m[1].replace(",", "."));
    amount = Math.round(num * mul + (m[3] && mul >= 1e5 ? +m[3] / 10 * mul : 0) + (m[4] ? mul / 2 : 0));
    used.push(m[0].trim()); n = n.replace(m[0], " ");
  } else {
    m = n.match(/\s(?:\+\s)?(\d{1,3}(?:[.,]\d{3})+|\d{4,})(?=\s)/);
    if (m) { amount = +m[1].replace(/[.,]/g, ""); used.push(m[0].trim()); n = n.replace(m[0], " "); }
  }

  /* --- bài tập thể dục --- */
  const known = (opts.exercises || []).map(e => [norm(e), e]);
  const exHit = [...known, ...EX_ALIAS].filter(([k]) => n.includes(" " + k + " ") || n.trimStart().startsWith(k + " ")).sort((a, b) => b[0].length - a[0].length)[0];
  if (exHit && !amount) {
    const rest = n.replace(exHit[0], " ");
    let sets = [];
    const mx = rest.match(/(\d+)\s*[x×*]\s*(\d+)/);
    if (mx) sets = Array(Math.min(+mx[1], 30)).fill(+mx[2]);
    else sets = (rest.match(/\d+(?:[.,]\d+)?/g) || []).map(x => Math.round(parseFloat(x.replace(",", ".")))).filter(x => x > 0).slice(0, 30);
    if (sets.length) return { kind: "workout", data: { ex: exHit[1], sets, date: td }, text: `${exHit[1]}: ${sets.join(" ")}${/phut|km/.test(rest) ? (/km/.test(rest) ? " km" : " phút") : ""}` };
  }

  /* --- câu hỏi gốc, bỏ phần đã hiểu để làm tiêu đề --- */
  let title = raw;
  for (const u of used) {
    // bỏ đoạn tương ứng trong câu gốc (so khớp không dấu theo từng ký tự)
    const nr = norm(title); const i = nr.indexOf(u);
    if (i >= 0) title = (title.slice(0, i) + " " + title.slice(i + u.length));
  }
  title = title.replace(/(^|\s)\+\s*\d[\d.,]*\s*(?:k|nghìn|ngàn|tr|triệu|củ|đ|đồng)?(?=\s|$)/i, " ").replace(/^\s*(?:nhắc (?:tôi|mình|em)|nhớ|nhac toi|nho)\s+/i, "").replace(/\s{2,}/g, " ").replace(/^[\s,.\-–:]+|[\s,.\-–:]+$/g, "").replace(/\s+(?:lúc|vào|ngày)$/i, "").trim();
  let nt = " " + norm(title) + " ";

  /* --- loại khoản chi / thu, học từ lịch sử --- */
  const guessCat = (isIn) => {
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
  };
  // "cơm trưa 35" → 35.000đ khi câu rõ ràng là một khoản chi
  if (!amount && !exHit) {
    const bm = (" " + norm(title) + " ").match(/\s(\d{1,3}(?:[.,]\d)?)\s/);
    if (bm && !dateSet && !time) {
      const t2 = title.replace(new RegExp("(^|\\s)" + bm[1].replace(".", "\\.") + "(?=\\s|$)"), " ").replace(/\s{2,}/g, " ").trim();
      const nt2 = " " + norm(t2) + " ";
      if (Object.entries(CAT_WORDS).some(([k, w]) => !IN_KEYS.includes(k) && w.split("|").some(ph => ph.length >= 2 && nt2.includes(" " + ph + " ")))) { amount = Math.round(parseFloat(bm[1].replace(",", ".")) * 1000); title = t2; }
    }
  }
  if (amount) {
    const nr = " " + norm(raw).replace(/\+(?=\d)/g, "+ ") + " ";
    const isIn = /^\s*(?:\+|thu |nhan |duoc |luong|thuong|hoc bong|ban duoc|ban hang|lai |co tuc)/.test(nr) || /\s(?:luong|hoc bong|duoc cho|duoc tra|tien thuong|me gui|bo gui|ba gui|me cho|bo cho|ba cho|khach tra|khach chuyen|ban duoc|tien tieu vat|tien lai|lai suat|co tuc)\s/.test(nr) || /^\s*\+/.test(raw);
    if (repeat || (dateSet && due > td)) {
      return { kind: "task", data: { title: title || "Khoản phải trả", type: "khac", due: due || td, time, status: "todo", repeat, amount, cat: guessCat(false), subs: [], note: "" }, text: `Phải trả ${moneyShort(amount)}: ${title || "Khoản phải trả"} · ${dueLabel(due || td, td)}${time ? " " + time : ""}${repeat ? " · ↻ " + REPEAT_NAME[repeat] : ""}` };
    }
    nt = " " + norm(title) + " ";
    const cat = guessCat(isIn);
    const noteTitle = title.replace(/^\s*(?:\+|thu|nhận|được|chi|mua)\s+/i, (s) => /mua/i.test(s) ? s : "").trim();
    return { kind: "tx", data: { type: isIn ? "in" : "out", amount, cat, note: noteTitle || title, date: dateSet && due <= td ? due : td }, text: `${isIn ? "Thu" : "Chi"} ${money(amount)} · ${(CAT[cat] || ["", "Khác"])[1]}${noteTitle ? " · " + noteTitle : ""}${dateSet && due && due < td ? " · " + dueLabel(due, td) : ""}` };
  }

  if (!title) return null;
  let type = "khac";
  if (/\s(?:thi|kiem tra|kt|giua ky|cuoi ky)\s/.test(nt)) type = "thi";
  else if (/\s(?:don|giay|ho so|xin|ky ten|cong chung|thu tuc)\s/.test(nt)) type = "don";
  else if (/\s(?:bai tap|btl|bao cao|do an|assignment|lab|bai tap lon|slide|tieu luan|deadline|nop bai|lam bai)\s/.test(nt)) type = "bai";
  if (repeat && !due) due = td;
  const T = title.charAt(0).toUpperCase() + title.slice(1);
  return { kind: "task", data: { title: T, type, due, time, status: "todo", repeat, subs: [], note: "" }, text: `Việc: ${T}${due ? " · " + dueLabel(due, td) : ""}${time ? " " + time : ""}${repeat ? " · ↻ " + REPEAT_NAME[repeat] : ""}` };
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
function dueLabel(d, td) {
  const k = dayDiff(d, td);
  if (k === 0) return "hôm nay"; if (k === 1) return "ngày mai"; if (k === -1) return "hôm qua"; if (k === 2) return "ngày mốt";
  return `${DOWL[parseYmd(d).getDay()]} ${dm(d)}`;
}
