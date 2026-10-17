# Hôm Nay

Một app gồm 5 phần: **Hôm nay** (tổng quan), **Việc** (hạn nộp, BTL chia phần, đơn chờ duyệt), **Lịch học**, **Tiền**, **Tập**. Thêm **Giấy tờ**: bấm một dòng là chép MSSV, lớp, email… để dán vào form.

Dữ liệu lưu trên điện thoại, offline vẫn dùng được. Có mạng thì app tự đồng bộ qua Supabase **của bạn**, dùng chung project với app Lưới Thói Quen.

## 1. Database (làm 1 lần, khoảng 1 phút)

1. Mở project Supabase đang dùng cho Lưới Thói Quen.
2. Vào **SQL Editor** → **New query**, dán toàn bộ `setup.sql` → **Run**.
   App này dùng bảng riêng `hn_items`, không đụng dữ liệu thói quen.

## 2. config.js

Mở `config.js`, dán **Project URL** và **anon key**. Hai giá trị này giống hệt trong `config.js` của Lưới Thói Quen. Nếu cần tìm lại: Supabase → Project Settings → API.

Để trống thì app vẫn chạy, chỉ là không đồng bộ giữa hai máy.

## 3. Đưa lên GitHub Pages

1. https://github.com/new → tên repo `hom-nay`, chọn **Public** → **Create repository**.
2. Bấm **uploading an existing file** → kéo thả **tất cả tệp** trong thư mục này → **Commit changes**.
3. **Settings** → **Pages** → Branch `main`, thư mục `/ (root)` → **Save**.
4. Chờ 1–2 phút, link sẽ có dạng `https://<tên-github>.github.io/hom-nay/`.

## 4. Cài lên điện thoại

- **Poco X8 Pro:** mở link bằng Chrome → ⋮ → **Cài đặt ứng dụng**.
- **iPhone 12 Pro:** mở link bằng **Safari** → Chia sẻ → **Thêm vào MH chính**.

Mở app từ icon → nút cài đặt (góc phải trên) → đăng nhập **bằng tài khoản của Lưới Thói Quen**. Làm vậy trên cả hai máy. Dòng cuối trang Hôm nay hiện "Đã đồng bộ lúc …" là xong.

Chấm nhỏ trên nút cài đặt: xanh lá là đã đồng bộ, cam là chưa đăng nhập hoặc đang offline, đỏ là có lỗi (mở ra xem chi tiết).

## Mẹo dùng

- **Tiền:** gõ `35` là 35.000đ, `1,5tr` là 1.500.000đ. Ghi chú gõ lại lần sau sẽ được gợi ý.
- **Tập:** gõ số lần mỗi hiệp `10 8 8` hoặc `4x10`. Nút "Lặp lại bài của buổi trước" điền sẵn các bài, chỉ cần nhập số.
- **Lịch học:** chọn tiết là app tự điền giờ theo lịch BK (tiết 1 = 6:00). Một môn học nhiều buổi thì chọn nhiều thứ.
- **Việc:** chọn "Chờ người khác" cho đơn đã gửi mà thầy cô chưa trả lời. Mục "Phần việc" dùng để chia việc BTL nhóm.
- Trên Android, giữ icon app sẽ hiện lối tắt **Ghi chi tiêu** và **Thêm việc**.
- Nên thỉnh thoảng vào cài đặt → **Xuất file** để giữ bản sao lưu.

## Khi sửa code

Đổi `VERSION` trong `sw.js` (ví dụ `hn-v2`) để điện thoại tải bản mới. Bản mới hiện từ lần mở app thứ hai.

## Cách đồng bộ hoạt động

- Mỗi mục (một việc, một khoản tiền, một buổi tập…) được lưu trên máy trước, rồi gửi lên hàm `hn_push`.
- Hai máy sửa hai mục khác nhau, kể cả lúc offline, đều được giữ. Nếu cùng một mục bị sửa ở cả hai máy, bản sửa sau cùng sẽ thắng.
- Xóa trên máy này thì máy kia cũng mất theo. Ngay sau khi xóa có nút "Hoàn tác".
- Mỗi tài khoản chỉ đọc và ghi được dữ liệu của chính nó (Row Level Security).
