"""Bảng câu mẫu cho bộ đọc tiền (parseMoney) và ô ghi nhanh (parseQuick).
smoke.py gọi run(pg, ok) trên một trang đã cài giờ giả: Chủ nhật 18/10/2026 13:05, Asia/Ho_Chi_Minh.
Mỗi dòng QUICK: câu gõ vào, và các trường mong đợi. "kind" so với kết quả, các khóa khác so với data.
"items" là danh sách khi một câu tách thành nhiều khoản. Câu cũ đang chạy đúng cũng nằm ở đây để không lùi."""

MONEY = [
    ("35", 35000), ("35k", 35000), ("1,5tr", 1500000), ("1.5tr", 1500000), ("50.000", 50000), ("50.000đ", 50000),
    ("1.200.000", 1200000), ("1500", 1500), ("3tr", 3000000), ("", 0), ("abc", 0),
    ("2tr5", 2500000), ("1tr2", 1200000), ("12tr500", 12500000), ("2,45tr", 2450000), ("35k5", 35500),
    ("2 củ", 2000000), ("2 củ rưỡi", 2500000), ("1 trăm rưỡi", 150000), ("2 trăm", 200000), ("trăm rưỡi", 150000),
    ("500 nghìn", 500000), ("500 ngàn", 500000), ("2 triệu 5", 2500000), ("2 triệu 500 nghìn", 2500000),
    ("1tr 200k", 1200000), ("1 tỷ", 1000000000), ("2 TR", 2000000), ("2 tr 5", 2500000),
]

T = "2026-10-18"
QUICK = [
    # --- câu cũ, đang đúng ---
    ("cơm trưa 35k", {"kind": "tx", "type": "out", "amount": 35000, "cat": "an", "note": "cơm trưa", "date": T}),
    ("cà phê 30k", {"kind": "tx", "type": "out", "amount": 30000, "cat": "nuoc"}),
    ("trà sữa 25k", {"kind": "tx", "type": "out", "amount": 25000, "cat": "nuoc"}),
    ("đổ xăng 80k", {"kind": "tx", "type": "out", "amount": 80000, "cat": "dilai"}),
    ("đi chợ 150k", {"kind": "tx", "type": "out", "amount": 150000, "cat": "an"}),
    ("grab 45.000", {"kind": "tx", "type": "out", "amount": 45000, "cat": "dilai"}),
    ("cơm trưa 35", {"kind": "tx", "type": "out", "amount": 35000, "note": "cơm trưa"}),
    ("1,5tr học phí", {"kind": "tx", "type": "out", "amount": 1500000, "cat": "hoc", "note": "học phí"}),
    ("cafe 1tr2", {"kind": "tx", "amount": 1200000}),
    ("ăn sáng 30k hôm qua", {"kind": "tx", "amount": 30000, "date": "2026-10-17"}),
    ("chuyển khoản tiền nhà 3tr", {"kind": "tx", "type": "out", "amount": 3000000, "cat": "nha"}),
    ("mẹ gửi 3tr", {"kind": "tx", "type": "in", "amount": 3000000, "cat": "giadinh"}),
    ("mẹ cho 200k", {"kind": "tx", "type": "in", "amount": 200000, "cat": "giadinh"}),
    ("lương 15tr", {"kind": "tx", "type": "in", "amount": 15000000, "cat": "luong"}),
    ("lương tháng 10 15tr", {"kind": "tx", "type": "in", "amount": 15000000, "note": "lương tháng 10"}),
    ("+500k thưởng", {"kind": "tx", "type": "in", "amount": 500000, "cat": "thuong", "note": "thưởng"}),
    ("tiền phòng 2tr5 ngày 5 hằng tháng", {"kind": "task", "amount": 2500000, "due": "2026-11-05", "repeat": "month", "cat": "nha"}),
    ("tiền nhà 3tr ngày 5 hằng tháng", {"kind": "task", "amount": 3000000, "due": "2026-11-05", "repeat": "month"}),
    ("netflix 70k hằng tháng", {"kind": "task", "amount": 70000, "due": T, "repeat": "month"}),
    ("nộp BTL thứ 6 23h59", {"kind": "task", "title": "Nộp BTL", "type": "bai", "due": "2026-10-23", "time": "23:59"}),
    ("nộp báo cáo thứ 6 5h chiều", {"kind": "task", "type": "bai", "due": "2026-10-23", "time": "17:00"}),
    ("kiểm tra Toán thứ 5", {"kind": "task", "title": "Kiểm tra Toán", "type": "thi", "due": "2026-10-22"}),
    ("học thêm 18h mỗi thứ 3", {"kind": "task", "due": "2026-10-20", "time": "18:00", "repeat": "week"}),
    ("họp 9h mai", {"kind": "task", "title": "Họp", "due": "2026-10-19", "time": "09:00"}),
    ("gặp cô Lan mai 10h", {"kind": "task", "title": "Gặp cô Lan", "due": "2026-10-19", "time": "10:00"}),
    ("gọi điện cho mẹ tối nay", {"kind": "task", "due": T, "time": "20:00"}),
    ("chiều nay 3h đá bóng", {"kind": "task", "title": "Đá bóng", "due": T, "time": "15:00"}),
    ("thi cuối kỳ 25/12", {"kind": "task", "type": "thi", "due": "2026-12-25"}),
    ("nộp đơn xin nghỉ 20/10 9h", {"kind": "task", "type": "don", "due": "2026-10-20", "time": "09:00"}),
    ("sinh nhật Lan 25/10", {"kind": "task", "title": "Sinh nhật Lan", "due": "2026-10-25"}),
    ("đi khám răng thứ 7 lúc 8h sáng", {"kind": "task", "due": "2026-10-24", "time": "08:00"}),
    ("họp nhóm 8h tối thứ 4", {"kind": "task", "due": "2026-10-21", "time": "20:00"}),
    ("học tiếng Anh 2 tuần 1 lần", {"kind": "task", "title": "Học tiếng Anh", "repeat": "2week", "due": T}),
    ("hít xà 10 8 8", {"kind": "workout", "ex": "Hít xà", "sets": [10, 8, 8]}),
    ("hít đất 20 15", {"kind": "workout", "ex": "Chống đẩy", "sets": [20, 15]}),
    ("chạy bộ 5km", {"kind": "workout", "ex": "Chạy bộ", "sets": [5]}),
    ("cân nặng 65,5", {"kind": "weight", "kg": 65.5, "date": T}),
    # --- mùng / mồng ---
    ("họp lớp mồng 5", {"kind": "task", "title": "Họp lớp", "due": "2026-11-05"}),
    ("tiền điện mùng 5 hằng tháng 500k", {"kind": "task", "amount": 500000, "due": "2026-11-05", "repeat": "month", "cat": "nha"}),
    ("3tr5 tiền nhà mùng 5 hằng tháng", {"kind": "task", "amount": 3500000, "due": "2026-11-05", "repeat": "month", "title": "tiền nhà"}),
    ("đám cưới Hùng mùng 8 tháng 11", {"kind": "task", "title": "Đám cưới Hùng", "due": "2026-11-08"}),
    ("mùng 1 đi chùa", {"kind": "task", "title": "Đi chùa", "due": "2026-11-01"}),
    # --- tuần sau ---
    ("nộp hồ sơ thứ 2 tuần sau", {"kind": "task", "title": "Nộp hồ sơ", "due": "2026-10-19", "repeat": ""}),
    ("đi bơi thứ 6 tuần sau", {"kind": "task", "due": "2026-10-23", "repeat": ""}),
    ("họp chủ nhật tuần sau", {"kind": "task", "due": "2026-10-25", "repeat": ""}),
    # --- "tr" không phải lúc nào cũng là triệu ---
    ("ngày 20 trả góp", {"kind": "task", "title": "Trả góp", "due": "2026-10-20"}),
    ("ngày 20 trả góp 1tr2", {"kind": "task", "amount": 1200000, "due": "2026-10-20"}),
    ("trả tiền điện ngày 25", {"kind": "task", "due": "2026-10-25"}),
    # --- cách viết số tiền ---
    ("mua laptop 12tr500", {"kind": "tx", "type": "out", "amount": 12500000, "note": "mua laptop"}),
    ("ăn lẩu 1 trăm rưỡi", {"kind": "tx", "type": "out", "amount": 150000, "cat": "an", "note": "ăn lẩu"}),
    ("tiền phòng 2 củ", {"kind": "tx", "amount": 2000000, "cat": "nha"}),
    ("đóng học phí 2 triệu 500 nghìn", {"kind": "tx", "amount": 2500000, "cat": "hoc"}),
    ("sửa xe 1tr 200k", {"kind": "tx", "amount": 1200000, "cat": "dilai"}),
    # --- thu nhập ---
    ("mẹ chuyển 2tr", {"kind": "tx", "type": "in", "amount": 2000000, "cat": "giadinh"}),
    ("bán sách được 200k", {"kind": "tx", "type": "in", "amount": 200000}),
    ("Nam trả nợ 500k", {"kind": "tx", "type": "in", "amount": 500000, "note": "Nam trả nợ"}),
    ("trả nợ Nam 500k", {"kind": "tx", "type": "out", "amount": 500000}),
    ("bố chuyển tiền tiêu 1tr", {"kind": "tx", "type": "in", "amount": 1000000, "cat": "giadinh"}),
    ("mua quà cho mẹ 300k", {"kind": "tx", "type": "out", "amount": 300000}),
    # --- hôm qua, hôm kia ---
    ("tối qua ăn lẩu 200k", {"kind": "tx", "amount": 200000, "date": "2026-10-17", "note": "ăn lẩu"}),
    ("hqua đổ xăng 50k", {"kind": "tx", "amount": 50000, "date": "2026-10-17", "cat": "dilai"}),
    ("hôm qua cafe 25k", {"kind": "tx", "amount": 25000, "date": "2026-10-17"}),
    ("hôm kia mua áo 300k", {"kind": "tx", "amount": 300000, "date": "2026-10-16", "cat": "muasam"}),
    # --- việc chỉ có giờ: hôm nay, hoặc mai nếu giờ đã qua ---
    ("họp 15h", {"kind": "task", "title": "Họp", "due": T, "time": "15:00"}),
    ("họp 9h", {"kind": "task", "title": "Họp", "due": "2026-10-19", "time": "09:00"}),
    ("gọi khách 8h tối", {"kind": "task", "due": T, "time": "20:00"}),
    # --- nhiều khoản trong một câu ---
    ("cơm 35k, cafe 20k", {"items": [{"kind": "tx", "amount": 35000, "cat": "an", "note": "cơm"}, {"kind": "tx", "amount": 20000, "cat": "nuoc", "note": "cafe"}]}),
    ("cơm 35k; nước 10k; gửi xe 5k", {"items": [{"kind": "tx", "amount": 35000}, {"kind": "tx", "amount": 10000}, {"kind": "tx", "amount": 5000, "cat": "dilai"}]}),
    ("hôm qua cơm 35k, cafe 20k", {"items": [{"kind": "tx", "date": "2026-10-17"}, {"kind": "tx", "date": "2026-10-17", "amount": 20000}]}),
    ("cơm, nước 50k", {"kind": "tx", "amount": 50000}),
    ("cơm 35k và nước 10k", {"items": [{"kind": "tx", "amount": 35000, "note": "cơm"}, {"kind": "tx", "amount": 10000, "note": "nước"}]}),
    ("cơm và nước 50k", {"kind": "tx", "amount": 50000, "note": "cơm và nước"}),
    # --- câu dễ hiểu nhầm ---
    ("anh Nam trả nợ 200k", {"kind": "tx", "type": "in", "amount": 200000}),
    ("em trả nợ 200k", {"kind": "tx", "type": "out", "amount": 200000}),
    ("hôm nay trả nợ 300k", {"kind": "tx", "type": "out", "amount": 300000}),
    ("chi trả học phí 5tr", {"kind": "tx", "type": "out", "amount": 5000000, "cat": "hoc"}),
    ("đi gửi xe 5k", {"kind": "tx", "type": "out", "amount": 5000, "cat": "dilai"}),
    ("tôi chuyển mẹ 1tr", {"kind": "tx", "type": "out", "amount": 1000000}),
    ("bơi 500m", {"kind": "workout", "ex": "Bơi", "sets": [500]}),
    ("đọc 100 trang sách", {"kind": "task", "title": "Đọc 100 trang sách"}),
    ("thứ 7 tuần này đi chơi", {"kind": "task", "title": "Đi chơi", "due": "2026-10-24"}),
    ("ngày 5 đi học", {"kind": "task", "title": "Đi học", "due": "2026-11-05"}),
    ("1 triệu 2 tiền điện", {"kind": "tx", "amount": 1200000, "cat": "nha", "note": "tiền điện"}),
    ("học phí 2tr 2 lần", {"kind": "tx", "amount": 2000000}),
    ("1,5tr học phí, 200k sách", {"items": [{"kind": "tx", "amount": 1500000}, {"kind": "tx", "amount": 200000}]}),
]

JS = """cases => cases.map(s => {
  const q = parseQuick(s, quickOpts());
  const one = r => r && { kind: r.kind, data: r.data };
  return q && { ...one(q), items: q.items ? q.items.map(one) : null };
})"""


def match(exp, got):
    """Trả về chuỗi lỗi, hoặc "" nếu khớp."""
    if not got: return "không hiểu câu"
    errs = []
    for k, v in exp.items():
        g = got.get("kind") if k == "kind" else (got.get("data") or {}).get(k, "")
        if g is None: g = ""
        if g != v: errs.append(f"{k}={g!r} (cần {v!r})")
    return ", ".join(errs)


def run(pg, ok):
    got = pg.evaluate("list => list.map(s => parseMoney(s))", [s for s, _ in MONEY])
    for (s, want), g in zip(MONEY, got):
        ok(f"tiền: parseMoney({s!r}) = {want:,}".replace(",", "."), g == want, f"ra {g}")
    got = pg.evaluate(JS, [s for s, _ in QUICK])
    for (s, exp), g in zip(QUICK, got):
        if "items" in exp:
            items = (g or {}).get("items") or []
            err = f"ra {len(items)} khoản (cần {len(exp['items'])})" if len(items) != len(exp["items"]) else \
                "; ".join(f"#{i + 1}: {e}" for i, e in enumerate(match(x, y) for x, y in zip(exp["items"], items)) if e)
        else:
            err = match(exp, g) or ("bị tách thành nhiều khoản" if g and g.get("items") and len(g["items"]) > 1 else "")
        ok(f"ghi nhanh: {s!r}", not err, err)
