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
    ("chạy bộ 5km", {"kind": "workout", "ex": "Chạy bộ", "sets": [], "note": "5km"}),
    ("cân nặng 65,5", {"kind": "weight", "kg": 65.5, "date": T}),
    # --- mùng / mồng ---
    ("họp lớp mồng 5", {"kind": "task", "title": "Họp lớp", "due": "2026-11-05"}),
    ("tiền điện mùng 5 hằng tháng 500k", {"kind": "task", "amount": 500000, "due": "2026-11-05", "repeat": "month", "cat": "nha"}),
    ("3tr5 tiền nhà mùng 5 hằng tháng", {"kind": "task", "amount": 3500000, "due": "2026-11-05", "repeat": "month", "title": "Tiền nhà"}),
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
    # --- luồng 1: thứ viết bằng chữ (giọng nói hay ra kiểu này) ---
    ("nộp bài thứ sáu", {"kind": "task", "title": "Nộp bài", "due": "2026-10-23"}),
    ("Thứ Sáu nộp bài", {"kind": "task", "title": "Nộp bài", "due": "2026-10-23"}),
    ("học bài thứ bảy", {"kind": "task", "title": "Học bài", "due": "2026-10-24"}),
    ("họp thứ hai tuần sau", {"kind": "task", "title": "Họp", "due": "2026-10-19", "repeat": ""}),
    ("thứ tư tuần này họp", {"kind": "task", "title": "Họp", "due": "2026-10-21"}),
    ("đặt vé 10h sáng thứ năm", {"kind": "task", "title": "Đặt vé", "due": "2026-10-22", "time": "10:00"}),
    ("thứ 5 tới thi giữa kỳ", {"kind": "task", "title": "Thi giữa kỳ", "type": "thi", "due": "2026-10-22"}),
    ("chủ nhật tới đi chùa", {"kind": "task", "title": "Đi chùa", "due": "2026-10-25"}),
    ("thứ sáu đóng tiền nhà 3tr", {"kind": "task", "amount": 3000000, "due": "2026-10-23"}),
    ("sắp xếp thứ tự bài", {"kind": "task", "title": "Sắp xếp thứ tự bài", "due": ""}),
    ("gửi thư từ cho mẹ", {"kind": "task", "title": "Gửi thư từ cho mẹ", "due": ""}),
    # --- luồng 1: khoảng ngày tương đối ---
    ("nộp báo cáo 3 ngày nữa", {"kind": "task", "title": "Nộp báo cáo", "due": "2026-10-21"}),
    ("gặp khách 2 hôm nữa", {"kind": "task", "title": "Gặp khách", "due": "2026-10-20"}),
    ("thi 1 tuần nữa", {"kind": "task", "title": "Thi", "type": "thi", "due": "2026-10-25"}),
    ("gia hạn visa hai tháng nữa", {"kind": "task", "title": "Gia hạn visa", "due": "2026-12-18"}),
    ("đi chơi cuối tuần", {"kind": "task", "title": "Đi chơi", "due": T}),
    ("đá bóng cuối tuần sau", {"kind": "task", "title": "Đá bóng", "due": "2026-10-24"}),
    ("đầu tuần sau họp", {"kind": "task", "title": "Họp", "due": "2026-10-19"}),
    ("trả tiền điện cuối tháng", {"kind": "task", "title": "Trả tiền điện", "due": "2026-10-31"}),
    ("đi khám đầu tháng sau", {"kind": "task", "title": "Đi khám", "due": "2026-11-01"}),
    ("giữa tháng nộp thuế", {"kind": "task", "title": "Nộp thuế", "due": "2026-11-15"}),
    # --- luồng 1: giờ rưỡi, giờ kém, buổi nói ở chỗ khác ---
    ("họp 8 giờ rưỡi", {"kind": "task", "title": "Họp", "time": "08:30", "due": "2026-10-19"}),
    ("họp 8h rưỡi sáng mai", {"kind": "task", "title": "Họp", "time": "08:30", "due": "2026-10-19"}),
    ("đón con 9h kém 15", {"kind": "task", "title": "Đón con", "time": "08:45"}),
    ("ăn tối 7h", {"kind": "task", "title": "Ăn tối", "time": "19:00", "due": T}),
    ("thứ 6 tối 8h đi nhậu", {"kind": "task", "due": "2026-10-23", "time": "20:00"}),
    ("nhắc tôi họp 8h", {"kind": "task", "title": "Họp", "time": "08:00"}),
    # --- luồng 1: chữ "trước" thừa khi đã có hạn ---
    ("nộp đơn trước thứ 6", {"kind": "task", "title": "Nộp đơn", "due": "2026-10-23"}),
    ("trả sách thư viện trước ngày 25", {"kind": "task", "title": "Trả sách thư viện", "due": "2026-10-25"}),
    ("nộp bài trước 23h59 thứ 6", {"kind": "task", "title": "Nộp bài", "due": "2026-10-23", "time": "23:59"}),
    # --- 2.7.0: "12h đêm", "0h", "nửa đêm" là hạn 23:59 của chính ngày được nói ---
    ("nộp bài 12h đêm", {"kind": "task", "title": "Nộp bài", "due": T, "time": "23:59"}),
    ("nộp 12 giờ đêm nay", {"kind": "task", "title": "Nộp", "due": T, "time": "23:59"}),
    ("nộp BTL 12h đêm thứ 6", {"kind": "task", "title": "Nộp BTL", "due": "2026-10-23", "time": "23:59"}),
    ("nộp báo cáo 0h thứ 6", {"kind": "task", "title": "Nộp báo cáo", "due": "2026-10-23", "time": "23:59"}),
    ("nộp bài nửa đêm mai", {"kind": "task", "title": "Nộp bài", "due": "2026-10-19", "time": "23:59"}),
    ("12h khuya nay nộp bài", {"kind": "task", "title": "Nộp bài", "due": T, "time": "23:59"}),
    ("2h đêm mai xem bóng đá", {"kind": "task", "title": "Xem bóng đá", "due": "2026-10-19", "time": "02:00"}),
    ("ăn trưa 12h", {"kind": "task", "title": "Ăn trưa", "time": "12:00", "due": "2026-10-19"}),
    # --- 2.7.0: ngày dd/mm đã qua (trong 6 tháng) vẫn là năm nay ---
    ("17/10 cơm 30k", {"kind": "tx", "type": "out", "amount": 30000, "date": "2026-10-17", "note": "cơm"}),
    ("15/10 ăn lẩu 300k", {"kind": "tx", "amount": 300000, "date": "2026-10-15", "cat": "an"}),
    ("nộp đơn phúc khảo 15/10", {"kind": "task", "title": "Nộp đơn phúc khảo", "type": "don", "due": "2026-10-15"}),
    ("đi khám 10/3", {"kind": "task", "title": "Đi khám", "due": "2027-03-10"}),
    ("họp lớp ngày 5 tháng 9", {"kind": "task", "title": "Họp lớp", "due": "2026-09-05"}),
    ("sinh nhật mẹ 25/10 hằng năm", {"kind": "task", "title": "Sinh nhật mẹ", "due": "2026-10-25", "repeat": "year"}),
    ("sinh nhật bố 15/10 hằng năm", {"kind": "task", "due": "2027-10-15", "repeat": "year"}),
    ("tiền nhà 3tr 5/10 hằng tháng", {"kind": "task", "amount": 3000000, "due": "2026-11-05", "repeat": "month", "title": "Tiền nhà"}),
    # --- 2.7.0: ngày không có thật lùi về ngày cuối tháng (hạn sớm hơn còn hơn mất hạn) ---
    ("ngày 31/11 nộp bài", {"kind": "task", "title": "Nộp bài", "due": "2026-11-30"}),
    ("30/2 nộp thuế", {"kind": "task", "title": "Nộp thuế", "due": "2027-02-28"}),
    ("họp mùng 31 tháng 11", {"kind": "task", "title": "Họp", "due": "2026-11-30"}),
    # --- 2.7.0: bài tập: tên lạ dạng NxM, kg, "N hiệp", km vào ghi chú ---
    ("bench press 4x8 40kg", {"kind": "workout", "ex": "Bench press", "sets": [8, 8, 8, 8], "kg": 40}),
    ("deadlift 5x5 80kg", {"kind": "workout", "ex": "Deadlift", "sets": [5, 5, 5, 5, 5], "kg": 80}),
    ("đẩy ngực 3x10", {"kind": "workout", "ex": "Đẩy ngực", "sets": [10, 10, 10]}),
    ("squat 4x12 40kg", {"kind": "workout", "ex": "Squat", "sets": [12, 12, 12, 12], "kg": 40}),
    ("plank 60s 3 hiệp", {"kind": "workout", "ex": "Plank", "sets": [60, 60, 60]}),
    ("hít xà 3 hiệp 8 lần", {"kind": "workout", "ex": "Hít xà", "sets": [8, 8, 8]}),
    ("chạy 5km 30 phút", {"kind": "workout", "ex": "Chạy bộ", "sets": [30], "note": "5km"}),
    # --- 2.7.0: tiền ---
    ("cơm 35k + nước 10k", {"items": [{"kind": "tx", "amount": 35000, "note": "cơm"}, {"kind": "tx", "amount": 10000, "note": "nước", "cat": "nuoc"}]}),
    ("nước 10k", {"kind": "tx", "amount": 10000, "cat": "nuoc"}),
    ("ăn sáng 25 ngàn đồng", {"kind": "tx", "amount": 25000, "note": "ăn sáng"}),
    # 2.8: "bạn trả 200k" vẫn là thu khi sổ nợ không có ai nợ mình (có thì là trả nợ, xem DEBT_CTX)
    ("bạn trả 200k", {"kind": "tx", "type": "in", "amount": 200000}),
    ("hoàn tiền shopee 120k", {"kind": "tx", "type": "in", "amount": 120000}),
    # 2.8 đổi nghĩa có chủ đích: mượn, cho mượn là khoản nợ, không phải thu chi (trước là thu / chi)
    ("vay bạn 500k", {"kind": "debt", "dir": "owe", "who": "bạn", "amount": 500000}),
    ("cho bạn vay 500k", {"kind": "debt", "dir": "lend", "who": "bạn", "amount": 500000}),
    ("trả nợ vay 1tr", {"kind": "tx", "type": "out", "amount": 1000000}),
    ("đóng học phí tháng 10", {"kind": "task", "title": "Đóng học phí tháng 10", "amount": ""}),
    ("tiền phòng 2tr hằng tháng ngày 5", {"kind": "task", "title": "Tiền phòng", "amount": 2000000, "repeat": "month"}),
    # --- 2.7.0: loại việc, lặp tới ngày ---
    ("đón con 16h30", {"kind": "task", "title": "Đón con", "type": "khac", "time": "16:30"}),
    ("nop don xin nghi thu 2", {"kind": "task", "type": "don"}),
    ("họp nhóm 20h hằng tuần đến 30/12", {"kind": "task", "title": "Họp nhóm", "repeat": "week", "until": "2026-12-30", "due": T, "time": "20:00"}),
    ("tập yoga hằng ngày đến hết tháng 11", {"kind": "task", "title": "Tập yoga", "repeat": "day", "until": "2026-11-30"}),
    # --- 2.7.0: âm lịch (hôm nay 18/10/2026 là 9/9 âm) ---
    ("giỗ ông nội mùng 10 tháng 9 âm", {"kind": "task", "title": "Giỗ ông nội", "due": "2026-10-19", "repeat": "lunar-year"}),
    ("giỗ bà mùng 10 tháng 3", {"kind": "task", "title": "Giỗ bà", "due": "2027-04-16", "repeat": "lunar-year"}),
    ("rằm tháng 10 mua hoa quả", {"kind": "task", "title": "Mua hoa quả", "due": "2026-11-23", "repeat": "", "amount": ""}),
    ("mùng 1 âm đi chùa", {"kind": "task", "title": "Đi chùa", "due": "2026-11-09"}),
    ("rằm thắp hương", {"kind": "task", "title": "Thắp hương", "due": "2026-10-24"}),
    ("10/9 âm lịch họp họ hằng năm", {"kind": "task", "title": "Họp họ", "due": "2026-10-19", "repeat": "lunar-year"}),
    ("mua ram laptop 1tr2", {"kind": "tx", "amount": 1200000}),
    # --- 2.7.0 kiểm tra: ngày gốc của chuỗi lặp (data.day) giữ đúng ngày người dùng nói, kể cả khi hạn đầu bị lùi về cuối tháng ---
    ("tiền nhà 3tr 31/11 hằng tháng", {"kind": "task", "due": "2026-11-30", "repeat": "month", "day": 31}),
    ("sinh nhật 29/2 hằng năm", {"kind": "task", "title": "Sinh nhật", "due": "2027-02-28", "repeat": "year", "day": 29}),
    ("giỗ bà mùng 30 tháng 10 âm", {"kind": "task", "title": "Giỗ bà", "due": "2026-12-08", "repeat": "lunar-year", "day": 30}),
    ("rằm hằng tháng thắp hương", {"kind": "task", "title": "Thắp hương", "due": "2026-10-24", "repeat": "lunar-month", "day": 15}),
    ("trả góp ngày 31 hằng tháng 1tr", {"kind": "task", "due": "2026-10-31", "repeat": "month", "day": 31, "amount": 1000000}),
    ("tiền nhà 3tr hằng tháng", {"kind": "task", "repeat": "month", "day": ""}),
    ("họp lớp 12h đêm thứ 6", {"kind": "task", "title": "Họp lớp", "due": "2026-10-23", "time": "23:59"}),
    ("rằm", {"kind": "task", "title": "Rằm", "due": "2026-10-24"}),
    ("mùng 1 âm", {"kind": "task", "title": "Mùng 1 âm", "due": "2026-11-09"}),
    # --- 2.8: sổ nợ, chia tiền (sổ nợ trống) ---
    ("mượn bạn Nam 200k", {"kind": "debt", "dir": "owe", "who": "Nam", "amount": 200000, "date": T}),
    ("vay mẹ 2tr", {"kind": "debt", "dir": "owe", "who": "mẹ", "amount": 2000000}),
    ("nợ Hùng 50k", {"kind": "debt", "dir": "owe", "who": "Hùng", "amount": 50000}),
    ("cho Nam mượn 200k", {"kind": "debt", "dir": "lend", "who": "Nam", "amount": 200000}),
    ("Lan nợ mình 100k", {"kind": "debt", "dir": "lend", "who": "Lan", "amount": 100000}),
    ("Nam mượn mình 300k", {"kind": "debt", "dir": "lend", "who": "Nam", "amount": 300000}),
    ("mượn chị Lan 2tr", {"kind": "debt", "dir": "owe", "who": "chị Lan"}),
    ("mượn Nam 2tr để đóng học phí", {"kind": "debt", "who": "Nam", "note": "để đóng học phí", "amount": 2000000}),
    ("cho Nam mượn 200k thứ 6 trả", {"kind": "debt", "dir": "lend", "who": "Nam", "date": T, "due": "2026-10-23", "note": ""}),
    ("hôm qua mượn Hùng 100k", {"kind": "debt", "dir": "owe", "date": "2026-10-17", "due": ""}),
    ("lẩu 600k chia 4", {"kind": "split", "total": 600000, "n": 4, "names": [], "note": "lẩu", "cat": "an"}),
    ("pizza 300k chia 3 với Nam Lan", {"kind": "split", "total": 300000, "n": 3, "names": ["Nam", "Lan"], "note": "pizza"}),
    ("cơm 200k chia với Nam, Lan", {"kind": "split", "n": 3, "names": ["Nam", "Lan"]}),
    ("chia đôi tiền taxi 100k", {"kind": "split", "n": 2, "note": "taxi", "cat": "dilai"}),
    ("hôm qua lẩu 600k chia 4", {"kind": "split", "date": "2026-10-17"}),
    # không có khoản nợ cùng người thì trả nợ giữ cách hiểu cũ
    ("Nam trả 200k", {"kind": "tx"}),
    ("trả Hùng 50k", {"kind": "tx", "type": "out"}),
    # không phải nợ: động từ khác dấu, đồ vật, chính mình
    ("váy hoa 300k", {"kind": "tx", "type": "out", "note": "váy hoa"}),
    ("trà sữa 25k", {"kind": "tx", "type": "out", "cat": "nuoc"}),
    ("nó trả 200k", {"kind": "tx"}),
    ("mượn xe 50k", {"kind": "tx"}),
    ("em nợ 50k", {"kind": "tx"}),
    # --- 2.8 sửa lỗi ghi nhanh ---
    ("lớp 12 đóng quỹ 50k", {"kind": "tx", "type": "out", "amount": 50000, "note": "lớp 12 đóng quỹ"}),
    ("đóng tiền điện 500k", {"kind": "tx", "type": "out", "amount": 500000}),
    ("in ảnh 4x6", {"kind": "task", "title": "In ảnh 4x6"}),    # bật Tập vẫn là việc (không có chữ của tập luyện)
    ("đẩy ngực 3x10 40kg", {"kind": "workout", "ex": "Đẩy ngực", "sets": [10, 10, 10], "kg": 40}),
    ("1/3 cơm 30k", {"kind": "tx", "type": "out", "amount": 30000, "date": "2026-03-01", "note": "cơm"}),
    ("trà sữa 1/3 25k", {"kind": "tx", "date": "2026-03-01"}),
    ("cơm 30k 25/10", {"kind": "tx", "date": "2025-10-25"}),     # khoản chi dd/mm không nói hạn: lần gần nhất đã qua
    ("trả tiền điện 500k 25/10", {"kind": "task", "due": "2026-10-25", "amount": 500000}),
    ("học phí 5tr 30/10", {"kind": "task", "due": "2026-10-30", "amount": 5000000}),   # khoản cố định vẫn là phải trả
    ("nộp quỹ 50k 1/3", {"kind": "task", "due": "2027-03-01"}),
    ("cơm 30k ngày 25/10/2026", {"kind": "task", "due": "2026-10-25"}),   # có năm thì giữ như cũ
    # quyết định cũ giữ nguyên
    ("họp 0h thứ 7", {"kind": "task", "due": "2026-10-24", "time": "23:59"}),
    ("giỗ ông 10/9", {"kind": "task", "repeat": "lunar-year", "due": "2026-10-19"}),
]

# Câu cần sổ nợ có sẵn (opts.debts như openDebts()): trả nợ thì đánh dấu đã trả, không ghi thu chi
DEBTS = [{"key": "nam", "who": "Nam", "dir": "lend", "left": 300000}, {"key": "hung", "who": "Hùng", "dir": "owe", "left": 50000},
         {"key": "3 nguoi", "who": "3 người", "dir": "lend", "left": 450000}]
DEBT_CTX = [
    ("Nam trả 200k", {"kind": "debtpay", "dir": "lend", "keys": ["nam"], "amount": 200000}),
    ("anh Nam trả nợ 100k", {"kind": "debtpay", "dir": "lend", "keys": ["nam"]}),
    ("Nam gửi lại 100k", {"kind": "debtpay", "keys": ["nam"]}),
    ("trả Hùng 50k", {"kind": "debtpay", "dir": "owe", "keys": ["hung"], "amount": 50000}),
    ("trả nợ Hùng 50k", {"kind": "debtpay", "dir": "owe", "keys": ["hung"]}),
    ("bạn trả 150k", {"kind": "debtpay", "dir": "lend", "keys": ["3 nguoi"]}),
    ("Lan trả 100k", {"kind": "tx"}),               # Lan không nợ: như cũ
    ("trả Nam 50k", {"kind": "tx", "type": "out"}),  # mình không nợ Nam (Nam nợ mình)
    ("em trả nợ 200k", {"kind": "tx", "type": "out"}),
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
    got = pg.evaluate("""([cases, debts]) => cases.map(s => { const q = parseQuick(s, { ...quickOpts(), debts }); return q && { kind: q.kind, data: q.data }; })""",
                      [[s for s, _ in DEBT_CTX], DEBTS])
    for (s, exp), g in zip(DEBT_CTX, got):
        err = match(exp, g)
        ok(f"ghi nhanh (có sổ nợ): {s!r}", not err, err)
