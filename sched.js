/* Hôm Nay: lịch dùng chung cho app (app.js) và hàm nhắc đẩy hn-push (Edge Function).
   Một thuật toán cho cả hai bên: tuần học (tuần ISO như cột "Tuần học" trên MyBK), buổi học có diễn ra không (thứ, tuần, buổi vắng),
   buổi tập theo giáo án dán vào (gymDay), theo thứ hoặc linh hoạt (xoay vòng). Chỉ làm việc với chuỗi ngày "YYYY-MM-DD", không phụ thuộc múi giờ của máy chạy.

   BẢN SAO: supabase/functions/hn-push/sched.js phải giống hệt tệp này (hàm deploy riêng thư mục của nó).
   Sửa tệp này thì chép đè sang đó; tests/push_test.mjs báo lỗi nếu hai bản khác nhau.

   Viết kiểu script thường (không export) để app nạp bằng <script defer>, còn Deno nạp bằng `import "./sched.js"`:
   cả hai đọc qua globalThis.HN_SCHED. */
(function (root) {
  "use strict";
  const pad = n => String(n).padStart(2, "0");
  const YMD = /^\d{4}-\d{2}-\d{2}$/;
  const parseYmd = s => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
  const dow = s => parseYmd(s).getDay();
  /* Tuần ISO trong năm, giống cột "Tuần học" trên MyBK */
  function isoWeek(s) {
    const d = parseYmd(s);
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() + 3 - (t.getUTCDay() + 6) % 7);
    const jan4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((t - jan4) / 864e5 - 3 + (jan4.getUTCDay() + 6) % 7) / 7);
  }
  /* Môn có học trong tuần của ngày `day` không: không ghi tuần học = tuần nào cũng học. c = data của bản ghi class */
  const classActive = (c, day) => !(c && Array.isArray(c.weeks) && c.weeks.length) || c.weeks.includes(isoWeek(day));
  /* Buổi học có diễn ra vào ngày `day`: đúng thứ, đúng tuần học. absent = true thì bỏ cả buổi đã đánh dấu vắng */
  function classMeets(c, day, absent) {
    if (!c || !YMD.test(day || "") || !(c.days || []).includes(dow(day)) || !classActive(c, day)) return false;
    return !(absent && Array.isArray(c.absent) && c.absent.includes(day));
  }
  /* Giáo án: sắp theo ngày bắt đầu giảm dần, trùng thì bản sửa sau trước (bản ghi { id, data, updated_at }) */
  function sortPlans(list) {
    const key = r => YMD.test((r && r.data && r.data.start) || "") ? r.data.start : "";
    return (list || []).filter(r => r && r.data).slice().sort((a, b) => key(b).localeCompare(key(a)) || Date.parse(b.updated_at) - Date.parse(a.updated_at));
  }
  /* Giáo án áp dụng cho ngày `day` trong danh sách đã sortPlans: start ≤ day và (until rỗng hoặc day ≤ until), không có thì null */
  const planAt = (sorted, day) => (sorted || []).find(r => YMD.test(r.data.start || "") && r.data.start <= day && (!r.data.until || day <= r.data.until)) || null;
  /* Buổi thứ di của giáo án p, gắn vào ngày `day`: { planId, planName, ymd, di, name, rest, items, once, rot, next };
     rest = ngày nghỉ hoặc buổi không có bài (items = []) */
  function dayAt(p, di, day, next) {
    const d = ((p && p.data && p.data.days) || [])[di];
    if (!d) return null;
    const items = d.rest ? [] : d.items || [];
    return { planId: p.id, planName: p.data.name || "", ymd: day, di, name: d.name || (d.rest ? "Nghỉ" : ""), rest: !!d.rest || !items.length, items: d.rest || !items.length ? [] : items,
      once: !!d.date, rot: isRot(p) && !d.date, next: !!next };
  }
  /* Giáo án linh hoạt (mode "rot"): các buổi xoay vòng theo thứ tự, không gắn thứ; nghỉ ngày nào cũng được, buổi tiếp theo
     là buổi kế sau buổi tập gần nhất. Giáo án cũ (không có mode) gắn theo thứ như thời khóa biểu. */
  const isRot = p => !!(p && p.data && p.data.mode === "rot");
  /* Thứ tự xoay vòng: chỉ số các buổi có bài, không theo ngày cụ thể, đúng thứ tự trong giáo án */
  const rotSeq = p => ((p && p.data && p.data.days) || []).map((d, i) => d && !d.rest && !d.date && Array.isArray(d.items) && d.items.length ? i : -1).filter(i => i >= 0);
  /* Số buổi mỗi tuần của giáo án linh hoạt: perWeek, không ghi thì bằng số buổi (tối đa 7) */
  const rotTarget = p => { const n = +(p && p.data && p.data.perWeek); return Number.isInteger(n) && n >= 1 && n <= 7 ? n : Math.max(1, Math.min(7, rotSeq(p).length)); };
  /* Buổi đã tập của giáo án p trong danh sách workout ws (đã gắn planId và chỉ số buổi pdi hợp lệ) */
  const rotDone = (p, ws) => (ws || []).filter(s => s && s.data && s.data.planId === p.id && Number.isInteger(s.data.pdi) && YMD.test(s.data.date || ""));
  /* Chỉ số buổi tiếp theo cho ngày `day`: kế sau buổi tập gần nhất TRƯỚC ngày đó (chưa tập lần nào thì buổi đầu) */
  function rotNext(p, ws, day) {
    const seq = rotSeq(p); if (!seq.length) return -1;
    let last = null;
    for (const s of rotDone(p, ws)) if (s.data.date < day && seq.includes(s.data.pdi) && (!last || s.data.date > last.data.date)) last = s;
    return last ? seq[(seq.indexOf(last.data.pdi) + 1) % seq.length] : seq[0];
  }
  /* Số ngày đã tập (có ít nhất một workout bất kỳ) trong tuần thứ Hai - Chủ nhật chứa ngày `day` */
  function weekDone(ws, day) {
    const mon = addDays(day, -((dow(day) + 6) % 7)), sun = addDays(mon, 6), set = new Set();
    for (const s of ws || []) { const d = s && s.data && s.data.date; if (YMD.test(d || "") && d >= mon && d <= sun) set.add(d); }
    return set.size;
  }
  /* Buổi giáo án của ngày `day` trong giáo án p (đã chọn bằng planAt), hoặc null. Buổi theo ngày cụ thể thắng mọi cách khác.
     Giáo án theo thứ: buổi có thứ đó. Giáo án linh hoạt cần ctx = { ws (danh sách workout), today }: ngày đã tập buổi nào
     (workout cùng ngày có pdi) thì là buổi đó; hôm nay chưa tập thì là buổi tiếp theo (next = true); còn lại null (không có "bỏ lỡ").
     Trả như dayAt */
  function planDay(p, day, ctx) {
    if (!p) return null;
    const days = (p.data && p.data.days) || [];
    let di = days.findIndex(d => d && d.date === day);
    if (di >= 0) return dayAt(p, di, day);
    if (isRot(p)) {
      const seq = rotSeq(p), ws = ctx && ctx.ws;
      const own = rotDone(p, ws).find(s => s.data.date === day && seq.includes(s.data.pdi));
      if (own) return dayAt(p, own.data.pdi, day);
      if (ctx && day === ctx.today) { di = rotNext(p, ws, day); return di >= 0 ? dayAt(p, di, day, true) : null; }
      return null;
    }
    const w = dow(day);
    di = days.findIndex(d => d && !d.date && (d.dows || []).includes(w));
    return di >= 0 ? dayAt(p, di, day) : null;
  }
  /* Bản ghi workout đã tick cho buổi giáo án của ngày planDate (danh sách workout bất kỳ thứ tự):
     workout có planDate === ngày đó (kể cả tập bù ở ngày khác), không có thì workout cùng ngày chưa gắn planDate, không có nữa thì null */
  function workoutFor(list, planDate) {
    const ws = (list || []).filter(s => s && s.data);
    return ws.find(s => s.data.planDate === planDate) || ws.find(s => s.data.date === planDate && !s.data.planDate) || null;
  }
  root.HN_SCHED = { pad, parseYmd, ymd, addDays, isoWeek, classActive, classMeets, sortPlans, planAt, planDay, dayAt, isRot, rotSeq, rotTarget, rotNext, weekDone, workoutFor };
})(typeof globalThis !== "undefined" ? globalThis : this);
