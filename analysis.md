# Phân tích Hôm Nay (bản 2.2.1, 18/10/2026)

Tài liệu này mô tả app đang như thế nào, chỗ nào còn yếu và nên làm gì tiếp. Danh sách việc ở cuối được xếp theo mức ưu tiên, mỗi việc có tiêu chí "xong khi" để kiểm tra. Quy tắc làm việc nằm trong `CLAUDE.md`.

## 1. Hiện trạng

**Tính năng đã có**
- **Hôm nay:** lời chào kèm âm lịch, ô ghi nhanh bằng câu (có giọng nói vi-VN), việc gấp, lịch học trong ngày, chi tiêu, chuỗi tập, gợi ý bật thông báo.
- **Việc:**
  - loại việc, hạn ngày và giờ, trạng thái "chờ người khác", phần việc chia cho ai;
  - lặp lại có ngày kết thúc;
  - việc có số tiền thành khoản phải trả: đánh dấu xong là tự ghi chi.
- **Lịch:**
  - dạng tháng kiểu Google Calendar: chip màu theo loại, âm lịch, ngày lễ VN, chương trình cho ngày đang chọn;
  - dạng tuần (thời khóa biểu): tuần ISO giống MyBK, đánh dấu vắng, cảnh báo trùng giờ;
  - nút + mặc định thêm việc cho ngày đang chọn, có nút chuyển sang thêm tiết học.
- **Nhập MyBK:** đọc theo tiêu đề cột cho cả Thời khóa biểu và Lịch thi (GK/CK, phòng, giờ "07g00", số phút); xuất `.ics`.
- **Tiền:**
  - thu chi theo danh mục, có danh mục riêng;
  - ngân sách tháng, mục tiêu tiết kiệm;
  - biểu đồ 6 tháng, xuất CSV.
- **Tập:** buổi tập, bài tập có đơn vị, cân nặng.
- **Giấy tờ:** thông tin hay phải điền (MSSV, SĐT…).
- **Chung:** bốn hồ sơ người dùng ảnh hưởng chữ, danh mục và module. Chế độ sáng, tối, chữ to. Badge số việc gấp.
- **Thông báo đẩy (2.2):**
  - Edge Function `hn-push` chạy mỗi 5 phút;
  - việc có giờ: nhắc trước 1 ngày, 2 tiếng, 15 phút;
  - việc không có giờ: 20:00 hôm trước và 7:00 sáng hôm đó.

**Kiến trúc**
- **Local-first:**
  - toàn bộ dữ liệu là một object `db` nằm trong localStorage;
  - mỗi lần `put()`, app ghi lại cả `db` vào localStorage và vẽ lại cả màn hình bằng `innerHTML`.
- **Đồng bộ:**
  - quy tắc bản mới hơn thắng, tính theo từng bản ghi dựa trên `updated_at` do điện thoại tạo;
  - đẩy lên bằng RPC `hn_push`; kéo về các dòng có `server_at > wm`;
  - nhận thay đổi ngay qua Supabase Realtime, thêm một lần đồng bộ định kỳ mỗi 60 giây.
- **Thông báo:**
  - pg_cron gọi `net.http_post` tới hàm mà không gửi khóa (vì vậy hàm đã tắt JWT verification);
  - hàm đọc `hn_items` bằng service role, tự tạo khóa VAPID và lưu ở `push_config`;
  - mỗi lần gửi ghi một dòng vào `push_sent` để không gửi trùng.

## 2. Điểm yếu và rủi ro

### Hiệu năng
1. **Mỗi lần thay đổi, app vẽ lại toàn bộ màn hình.** Cái giá:
   - mất vị trí cuộn và con trỏ trong ô nhập (đã vá riêng cho ô ghi nhanh);
   - ở các tab nhiều dữ liệu, máy yếu sẽ thấy giật.
2. **`all(kind)` lọc toàn bộ `db` mỗi lần gọi, và một lần `render()` gọi nó hàng chục lần.** Thêm vào đó:
   - `getSetting()` lọc và sắp xếp tất cả bản ghi cài đặt mỗi lần gọi;
   - `dayEvents()` chạy cho cả 42 ô trong lịch tháng.
   Sau 1–2 năm dùng (vài nghìn khoản chi), phần này sẽ chậm rõ.
3. **`persist()` gọi `JSON.stringify` cả `db` sau mỗi thay đổi.** localStorage chỉ chứa được khoảng 5MB. Bản ghi đã xóa (tombstone) không bao giờ bị dọn, nên dung lượng chỉ tăng.
4. **Toàn bộ code nằm trong `app.js` khoảng 175KB, tải và parse cùng lúc khi mở app,** kể cả những phần ít dùng (nhập MyBK, ICS, thông báo).

### Đồng bộ và dữ liệu
5. **Hai máy sửa hai trường khác nhau của cùng một bản ghi thì một bên bị mất.** Lý do: app ghi đè cả object `data`, không gộp theo trường.
6. **`updated_at` lấy theo đồng hồ của điện thoại.** Máy nào chạy nhanh giờ sẽ luôn thắng khi có xung đột.
7. **Gói miễn phí của Supabase có thể tạm dừng project sau khoảng 7 ngày không hoạt động.** Khi đó đồng bộ và thông báo đều ngừng. Chưa kiểm chứng việc pg_cron gọi mỗi 5 phút có được tính là "hoạt động" hay không.
8. **Không có sao lưu hay khôi phục toàn bộ dữ liệu ra file (JSON).** Hiện chỉ xuất được CSV phần chi tiêu.

### Thông báo
9. **Chưa thử trên máy thật.** Cần kiểm tra trên Poco X8 Pro (Chrome) và iPhone 12 Pro (iOS 16.4+, phải mở app từ icon ngoài màn hình chính).
10. **Lịch học chưa có nhắc đẩy, mới chỉ nhắc qua file `.ics`.** Bài thi đã được nhắc vì nó là một việc.
11. **Hàm đang chạy trên Supabase cũ hơn file `index.ts` trong repo.** Bản trong repo báo lỗi rõ hơn khi đọc `push_config` thất bại. Cần deploy lại.
12. **Ai cũng gọi được `tick`.** Việc này không làm lộ dữ liệu, nhưng có thể bị gọi liên tục làm tốn quota. Nên thêm một khóa bí mật dùng chung, giữ trong Supabase Vault, và cron gửi kèm khóa đó.
13. **Khung gửi là 20 phút.** Nếu cron trễ hơn thế (ví dụ project vừa được đánh thức), mốc nhắc bị bỏ qua mà không báo lại.

### Giao diện và trợ năng
14. **Một số dòng bấm được đang là `div`, chưa phải `button`, nên không dùng được bằng bàn phím hay trình đọc màn hình.** Ví dụ: dòng trong chương trình ngày (`.ag`), một số thẻ (`.tap`).
15. **Chuyển từ dạng Tháng sang dạng Tuần không nhảy tới tuần của ngày đang chọn.** Lịch tuần luôn mở ở tuần hiện tại.
16. **Không có trạng thái "đang tải" lúc đăng nhập lần đầu và kéo dữ liệu về,** nên người dùng tưởng app bị trống.
17. **Đã sửa ở 2.2.1:** toast ẩn bằng `opacity: 0` vẫn chặn bấm ở giữa màn hình. Lỗi thấy rõ nhất ở nút "+ Việc ngày này" cũ. Cần rà các phần tử `position: fixed` khác xem có lỗi tương tự không.

### Chất lượng code
18. **Kiểm thử mới có `tests/smoke.py` (22 kiểm tra).** Các kiểm thử chi tiết trước đây cho bộ đọc MyBK, câu ghi nhanh (49 câu) và âm lịch chưa được đưa vào repo.
19. **Có đoạn code thừa,** ví dụ `ev.filter(e => e.k !== "fest" || true)` trong `viewMonth`. Một số hàm rất dài: `tkbSheet`, `settingsSheet`, `taskForm`.
20. **Chưa có Content-Security-Policy.** Mọi chỗ chèn dữ liệu người dùng vào `innerHTML` đều phải đi qua `esc()`. Cần rà lại toàn bộ, nhất là chip trên lịch, kết quả tìm kiếm và xem trước nhập MyBK.

## 3. Việc nên làm (theo thứ tự)

### P0: an toàn dữ liệu và độ tin cậy
- [ ] **Sao lưu và khôi phục JSON.** Thêm vào Cài đặt: "Tải bản sao lưu" và "Khôi phục từ file".
  - Khôi phục theo kiểu gộp: bản ghi mới hơn thắng, không xóa dữ liệu đang có.
  - *Xong khi:* xuất rồi nhập lại vào một máy trống thì được đúng dữ liệu cũ; nhập hai lần không sinh bản trùng.
- [ ] **Deploy lại `hn-push` từ repo và bảo vệ `tick` bằng khóa bí mật.**
  - Lưu khóa trong Vault; cron đọc khóa qua `vault.decrypted_secrets` và gửi trong header.
  - *Xong khi:* gọi `tick` không có header thì nhận 401; cron vẫn chạy được (`select * from cron.job_run_details order by start_time desc limit 5`).
- [ ] **Bù mốc nhắc bị lỡ.** Nếu một mốc đã trễ quá 20 phút nhưng việc vẫn chưa tới hạn, gửi một thông báo gộp kiểu "Bạn có N việc sắp đến hạn" thay vì bỏ qua.
  - *Xong khi:* kiểm thử giả lập cron trễ 1 tiếng vẫn nhận đúng một thông báo.
- [ ] **Giữ project Supabase không bị tạm dừng.** Tìm hiểu cách tính "không hoạt động" của gói miễn phí. Nếu cần, thêm một GitHub Action chạy hằng ngày gọi API REST (đọc 1 dòng).
  - *Xong khi:* có tài liệu hoặc kiểm chứng rõ ràng, ghi lại trong README.

### P1: hiệu năng
- [ ] **Chỉ mục theo `kind`.** Giữ `byKind = Map(kind → mảng)` và cập nhật trong `put/remove/restore/mergeRemote`. `all(kind)` trả về mảng có sẵn. Cache `getSetting` theo key.
  - *Xong khi:* với 5.000 khoản chi và 500 việc giả lập, `render()` ở tab Tiền và tab Lịch dưới 16ms trên Chromium (đo bằng `performance.now()` trong `tests/`).
- [ ] **Ghi xuống bộ nhớ theo đợt.** Gộp các lần `persist()` lại (dùng `requestIdleCallback` hoặc 300ms), và luôn ghi ngay khi `visibilitychange` chuyển sang hidden.
- [ ] **Dọn tombstone.** Xóa hẳn bản ghi `deleted` đã được server xác nhận quá 60 ngày, ở cả máy lẫn server. Phía server dùng một job pg_cron.
- [ ] **Cân nhắc chuyển `db` sang IndexedDB** khi dữ liệu vượt khoảng 2MB. Giữ nguyên API `put/all`.
- [ ] **Giữ vị trí cuộn và focus khi vẽ lại.** Cách tối thiểu: lưu `scrollY` cùng phần tử đang focus (theo `name` hoặc `data-*`) rồi khôi phục sau `render()`.

### P2: trải nghiệm
- [ ] **Nhắc đẩy cho lịch học,** tùy chọn "trước 15 phút vào lớp". Hàm `hn-push` cần đọc thêm `kind='class'` và tính buổi học theo `days`, `weeks`, `absent`.
- [ ] **Chuyển Tháng → Tuần thì mở đúng tuần của ngày đang chọn.**
- [ ] **Đổi các dòng bấm được (`.ag`, `.tap`) thành `<button>`** hoặc thêm `role="button" tabindex="0"` và xử lý phím Enter/Space.
- [ ] **Màn hình "Đang tải dữ liệu từ tài khoản…"** khi đăng nhập lần đầu.
- [ ] **Kéo thả việc giữa các ngày trên lịch tháng** (giữ lâu rồi kéo, trên điện thoại).
- [ ] **Widget "việc hôm nay" qua `shortcuts` trong manifest,** cho phép mở thẳng form thêm việc hoặc thêm chi.

### P3: dọn code
- [ ] **Tách `app.js` thành các ES module** (`store.js`, `sync.js`, `views/*.js`, `forms/*.js`, `mybk.js`, `push.js`). Vẫn không dùng bundler: `<script type="module">`.
  - Cập nhật `SHELL` trong `sw.js`.
  - *Xong khi:* `tests/smoke.py` vẫn PASS và app chạy offline sau lần mở đầu.
- [ ] **Đưa kiểm thử chi tiết vào `tests/`:** bộ đọc MyBK (dùng bảng TKB và Lịch thi mẫu), `parseQuick` (bộ câu mẫu), `LUNAR` (Tết 2024–2027, tháng 6 nhuận 2025).
- [ ] **Rà toàn bộ chỗ dùng `innerHTML` để chắc dữ liệu người dùng đều qua `esc()`.** Thêm CSP bằng thẻ `<meta>`, chỉ cho phép `self`, `cdn.jsdelivr.net` và `*.supabase.co`.

## 4. Cách kiểm tra một thay đổi

1. Chạy `node -e "new Function(require('fs').readFileSync('app.js','utf8'))"` để bắt lỗi cú pháp.
2. Chạy `python3 tests/smoke.py`: tất cả phải PASS, không có lỗi `pageerror`.
3. Chụp màn hình ở 393px và 320px, cả sáng lẫn tối, rồi tự xem lại.
4. Tăng `APP_VERSION` và `VERSION` trong `sw.js`, rồi đẩy lên `main`.
5. Mở bản đang chạy, xem phiên bản ở cuối Cài đặt.
