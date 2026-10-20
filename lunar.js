"use strict";
/* Âm lịch Việt Nam (thuật toán Hồ Ngọc Đức, múi giờ +7) và ngày lễ */
const LUNAR = (() => {
  const PI = Math.PI, TZ = 7;
  function jdFromDate(dd, mm, yy) {
    const a = Math.floor((14 - mm) / 12), y = yy + 4800 - a, m = mm + 12 * a - 3;
    let jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
    if (jd < 2299161) jd = dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
    return jd;
  }
  function newMoon(k) {
    const T = k / 1236.85, T2 = T * T, T3 = T2 * T, dr = PI / 180;
    let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
    Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
    const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
    const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
    const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
    let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
    C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
    C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr);
    C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
    C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
    C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
    C1 = C1 + 0.0010 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
    const deltat = T < -11 ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3 : -0.000278 + 0.000265 * T + 0.000262 * T2;
    return Jd1 + C1 - deltat;
  }
  function sunLongitude(jdn) {
    const T = (jdn - 2451545.0) / 36525, T2 = T * T, dr = PI / 180;
    const M = 357.52910 + 35999.05030 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
    const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
    let DL = (1.914600 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
    DL += (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.000290 * Math.sin(dr * 3 * M);
    let L = (L0 + DL) * dr; L -= PI * 2 * Math.floor(L / (PI * 2));
    return L;
  }
  const newMoonDay = k => Math.floor(newMoon(k) + 0.5 + TZ / 24);
  const sunLong = day => Math.floor(sunLongitude(day - 0.5 - TZ / 24) / PI * 6);
  function month11(yy) {
    const off = jdFromDate(31, 12, yy) - 2415021, k = Math.floor(off / 29.530588853);
    let nm = newMoonDay(k); if (sunLong(nm) >= 9) nm = newMoonDay(k - 1); return nm;
  }
  function leapOffset(a11) {
    const k = Math.floor((a11 - 2415021.076998695) / 29.530588853 + 0.5);
    let last = 0, i = 1, arc = sunLong(newMoonDay(k + i));
    do { last = arc; i++; arc = sunLong(newMoonDay(k + i)); } while (arc !== last && i < 14);
    return i - 1;
  }
  const cache = new Map();
  /* "YYYY-MM-DD" → { d, m, y, leap } */
  function of(s) {
    if (cache.has(s)) return cache.get(s);
    const [yy, mm, dd] = s.split("-").map(Number);
    const dayNumber = jdFromDate(dd, mm, yy), k = Math.floor((dayNumber - 2415021.076998695) / 29.530588853);
    let monthStart = newMoonDay(k + 1); if (monthStart > dayNumber) monthStart = newMoonDay(k);
    let a11 = month11(yy), b11 = a11, ly;
    if (a11 >= monthStart) { ly = yy; a11 = month11(yy - 1); } else { ly = yy + 1; b11 = month11(yy + 1); }
    const ld = dayNumber - monthStart + 1, diff = Math.floor((monthStart - a11) / 29);
    let leap = 0, lm = diff + 11;
    if (b11 - a11 > 365) { const lo = leapOffset(a11); if (diff >= lo) { lm = diff + 10; if (diff === lo) leap = 1; } }
    if (lm > 12) lm -= 12;
    if (lm >= 11 && diff < 4) ly -= 1;
    const r = { d: ld, m: lm, y: ly, leap: !!leap };
    cache.set(s, r); return r;
  }
  const CAN = ["Canh", "Tân", "Nhâm", "Quý", "Giáp", "Ất", "Bính", "Đinh", "Mậu", "Kỷ"], CHI = ["Thân", "Dậu", "Tuất", "Hợi", "Tý", "Sửu", "Dần", "Mão", "Thìn", "Tỵ", "Ngọ", "Mùi"];
  const yearName = y => `${CAN[y % 10]} ${CHI[y % 12]}`;
  const SOLAR = { "01-01": ["Tết Dương lịch", 1], "02-14": ["Lễ Tình nhân", 0], "03-08": ["Quốc tế Phụ nữ", 0], "04-30": ["Giải phóng miền Nam", 1], "05-01": ["Quốc tế Lao động", 1], "06-01": ["Quốc tế Thiếu nhi", 0], "09-02": ["Quốc khánh", 1], "10-20": ["Phụ nữ Việt Nam", 0], "11-20": ["Nhà giáo Việt Nam", 0], "12-24": ["Đêm Giáng sinh", 0], "12-25": ["Giáng sinh", 0] };
  const LUN = { "1-1": ["Tết Nguyên đán", 1], "1-2": ["Mùng 2 Tết", 1], "1-3": ["Mùng 3 Tết", 1], "1-15": ["Rằm tháng Giêng", 0], "3-10": ["Giỗ Tổ Hùng Vương", 1], "4-15": ["Phật đản", 0], "5-5": ["Tết Đoan ngọ", 0], "7-15": ["Vu Lan", 0], "8-15": ["Trung thu", 0], "12-23": ["Ông Công Ông Táo", 0] };
  /* Ngày lễ của một ngày: [tên, có phải ngày nghỉ] hoặc null */
  function holiday(s) {
    const sol = SOLAR[s.slice(5)]; if (sol) return sol;
    const l = of(s); if (l.leap) return null;
    const lu = LUN[`${l.m}-${l.d}`]; if (lu) return lu;
    if (l.m === 12 && l.d >= 29) { const n = of(addDays(s, 1)); if (n.m === 1 && n.d === 1 && !n.leap) return ["Giao thừa", 1]; }
    return null;
  }
  const text = s => { const l = of(s); return `${l.d}/${l.m}${l.leap ? " nhuận" : ""}`; };
  function jdToYmd(jd) {
    let b = 0, c = jd + 32082;
    if (jd > 2299160) { const a = jd + 32044; b = Math.floor((4 * a + 3) / 146097); c = a - Math.floor(b * 146097 / 4); }
    const d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor(1461 * d / 4), m = Math.floor((5 * e + 2) / 153);
    const day = e - Math.floor((153 * m + 2) / 5) + 1, month = m + 3 - 12 * Math.floor(m / 10), year = b * 100 + d - 4800 + Math.floor(m / 10);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  /* Âm → dương: ngày ld tháng lm năm ly (âm), leap = tháng nhuận. Ngày không có thật (30 của tháng thiếu, tháng nhuận không có) thì "" */
  function toSolar(ld, lm, ly, leap) {
    if (!(ld >= 1 && ld <= 30 && lm >= 1 && lm <= 12 && ly > 1900 && ly < 2200)) return "";
    let a11, b11;
    if (lm < 11) { a11 = month11(ly - 1); b11 = month11(ly); } else { a11 = month11(ly); b11 = month11(ly + 1); }
    const k = Math.floor(0.5 + (a11 - 2415021.076998695) / 29.530588853);
    let off = lm - 11; if (off < 0) off += 12;
    if (b11 - a11 > 365) {
      const lo = leapOffset(a11); let lmLeap = lo - 2; if (lmLeap < 0) lmLeap += 12;
      if (leap && lm !== lmLeap) return "";
      if (leap || off >= lo) off += 1;
    } else if (leap) return "";
    const s = jdToYmd(newMoonDay(k + off) + ld - 1), l = of(s);
    return l.d === ld && l.m === lm && l.leap === !!leap ? s : "";
  }
  /* Lần tới (từ ngày `from` trở đi, tính cả `from`) của ngày ld tháng lm âm lịch, lm = 0 là tháng nào cũng được.
     Có tháng cụ thể (giỗ) thì theo tháng thường, không theo tháng nhuận; lm = 0 (rằm, mùng 1 hằng tháng) thì tháng nhuận cũng tính,
     nằm sau tháng thường cùng số. Ngày 30 mà tháng đó thiếu thì lấy ngày 29. */
  function next(ld, lm, from) {
    if (!(ld >= 1 && ld <= 30)) return "";
    const l0 = of(from);
    let y = l0.y, m = lm || l0.m;
    if (lm && lm < l0.m) y++;
    for (let i = 0; i < 30; i++) {
      for (const lp of lm ? [false] : [false, true]) {
        const s = toSolar(ld, m, y, lp) || (ld === 30 ? toSolar(29, m, y, lp) : "");
        if (s && s >= from) return s;
      }
      if (lm) y++; else if (++m > 12) { m = 1; y++; }
    }
    return "";
  }
  return { of, holiday, text, yearName, toSolar, next };
})();
