# Hôm Nay

Một app gồm 5 phần: **Hôm nay** (tổng quan), **Việc** (hạn nộp, BTL chia phần, đơn chờ duyệt), **Lịch học**, **Tiền**, **Tập**. Thêm **Giấy tờ**: bấm một dòng là chép MSSV, lớp, email… để dán vào form.

Dữ liệu lưu trên điện thoại, offline vẫn dùng được. Có mạng thì app tự đồng bộ qua project Supabase **của riêng bạn** (project `iqzhkvwybnsxyclxhjcs`, chỉ dùng cho Hôm Nay).

## 1. Database (làm 1 lần, khoảng 1 phút)

1. Mở project Supabase của Hôm Nay (hoặc tạo project mới ở https://supabase.com/dashboard).
2. Vào **SQL Editor** → **New query**, dán toàn bộ `setup.sql` → **Run**. Muốn có thông báo nhắc hạn thì chạy thêm `push.sql` (xem mục thông báo bên dưới).

## 2. config.js

Mở `config.js`, dán **Project URL** và **anon key**. Lấy ở Supabase → Project Settings → API.

Để trống thì app vẫn chạy, chỉ là không đồng bộ giữa hai máy.

## 3. Đưa lên GitHub Pages

1. https://github.com/new → tên repo `hom-nay`, chọn **Public** → **Create repository**.
2. Bấm **uploading an existing file** → kéo thả **tất cả tệp** trong thư mục này → **Commit changes**.
3. **Settings** → **Pages** → Branch `main`, thư mục `/ (root)` → **Save**.
4. Chờ 1–2 phút, link sẽ có dạng `https://<tên-github>.github.io/hom-nay/`.

## 4. Cài lên điện thoại

- **Poco X8 Pro:** mở link bằng Chrome → ⋮ → **Cài đặt ứng dụng**.
- **iPhone 12 Pro:** mở link bằng **Safari** → Chia sẻ → **Thêm vào MH chính**.

Mở app từ icon → nút cài đặt (góc phải trên) → đăng nhập (lần đầu thì bấm **Tạo tài khoản**). Dùng cùng một tài khoản trên cả hai máy. Dòng cuối trang Hôm nay hiện "Đã đồng bộ lúc …" là xong.

Chấm nhỏ trên nút cài đặt: xanh lá là đã đồng bộ, cam là chưa đăng nhập hoặc đang offline, đỏ là có lỗi (mở ra xem chi tiết).

## Mới trong bản 2.9.0

- **Lịch việc** (tab Việc, ngay dưới Cần làm / Đang chờ / Đã xong): xem theo **Tuần** hoặc **Tháng**.
  - Mỗi ngày ghi số việc còn phải làm (tính cả việc đang chờ). Số đỏ là ngày đã qua mà còn việc, tức quá hạn. Ngày có việc mà đã xong hết thì có dấu ✓ xanh lá.
  - Hình thoi đỏ là ngày thi, chấm mờ là lần lặp sau của việc lặp lại.
  - Bấm một ngày thì danh sách bên dưới chỉ còn việc của ngày đó (chưa xong trước, đã xong sau), vẫn tick, sửa, dời như thường. Có nút **Bỏ lọc** và **+ Thêm việc ngày này**.
  - Dòng dưới lịch tóm tắt: "Tháng 10: 8 việc, đã xong 2, còn 6 (1 quá hạn)".
- **Lịch trên trang Hôm nay** (ngay dưới ô ghi nhanh), cũng chuyển được **Tuần | Tháng**:
  - Chấm tím là có việc, chấm đỏ là việc quá hạn, hình thoi đỏ là ngày thi, chấm xanh dương là có lịch học, chấm xanh lá là đã tập (chấm viền là có buổi tập theo giáo án mà chưa tập).
  - Bấm một ngày là mở tab Lịch đúng ngày đó để xem chi tiết.
  - Thẻ Tập luyện trên Hôm nay bỏ hàng 7 ô tập trong tuần, vì lịch mới đã có chấm tập.
- Cả hai lịch: vuốt ngang để sang tuần hoặc tháng khác, ngày nghỉ lễ có số đỏ, bấm **Thu gọn** nếu muốn gọn màn hình (máy nhớ lựa chọn).

## Mới trong bản 2.8.0

- **Giáo án linh hoạt: nghỉ ngày nào cũng được** (tab Tập → **Dán giáo án**, mặc định):
  - Dán giáo án dạng "Buổi 1, Buổi 2…" (hay cả "Thứ 2, Thứ 4…") là các buổi xoay vòng theo thứ tự. Hôm nào mở app tập thì thẻ **Buổi tiếp theo** đã xếp sẵn buổi kế sau buổi bạn tập gần nhất. Hôm nào nghỉ thì thôi, không có ngày "bỏ lỡ", mai vẫn là buổi đó.
  - Chọn **Mỗi tuần tập** mấy buổi: thẻ báo "Tuần này 2/5 buổi. Còn 3 buổi trong 4 ngày: được nghỉ thêm 1 ngày", chuyển màu khi bắt đầu gấp.
  - Muốn tập buổi khác thì chọn ở hàng **Buổi 1, Buổi 2…** trong sheet ngày (trước khi tick hiệp). Quên ghi hôm qua thì mở ngày đó trên lịch tập để ghi bù.
  - Thích kiểu cũ (buổi nào gắn thứ đó, không tập đúng ngày là bỏ lỡ) thì chọn **Cố định theo thứ** khi dán, hoặc đổi trong **Quản lý**. Giáo án đã dán từ trước vẫn là cố định theo thứ, vào Quản lý để chuyển sang linh hoạt.
  - Nút **Chép câu nhờ ChatGPT soạn** giờ nhờ soạn theo "Buổi 1, Buổi 2…", không cần ghi ngày nghỉ.
  - Nhắc buổi tập (Cài đặt → Thông báo) với giáo án linh hoạt: nhắc buổi tiếp theo vào giờ bạn đặt, chỉ khi tuần này chưa đủ buổi và hôm nay chưa tập.
  - Lưu ý: máy còn bản 2.6 đến 2.7 không hiện được giáo án linh hoạt (không thấy buổi nào), hãy cập nhật mọi máy.
- **Sổ nợ và chia tiền nhóm** (tab Tiền, thẻ **Sổ nợ**):
  - Ghi ai nợ mình, mình nợ ai. Bấm vào một người để xem từng khoản, bấm **Đã trả** (trả một phần thì bấm **Trả một phần** rồi gõ số), lỡ tay thì **Hoàn tác**.
  - **Chép lời nhắc** để dán Zalo, Messenger: "Nhắc nhẹ: bạn còn nợ mình 150k tiền lẩu 18/10 nha".
  - Mượn, cho mượn và trả nợ **không tính vào chi tiêu hay ngân sách** (tiền chỉ đổi chỗ). Riêng chia tiền thì phần của bạn là một khoản chi bình thường.
  - Khoản có hẹn trả hiện trên lịch tháng, khoản bạn nợ có hẹn thì hiện cả ở **Sắp phải trả**. Tìm kiếm, sao lưu đều có; Cài đặt có thêm **Xuất sổ nợ ra Excel**.
  - Gõ nhanh ở trang Hôm nay:
    - "mượn bạn Nam 200k", "vay mẹ 2tr", "nợ Hùng 50k": mình nợ.
    - "cho Nam mượn 200k thứ 6", "Lan nợ mình 100k": người ta nợ mình (thứ 6 là ngày hẹn trả).
    - "Nam trả 200k", "trả Hùng 50k": đánh dấu đã trả, nếu sổ nợ đang có khoản của người đó.
    - "lẩu 600k chia 4": ghi chi 150k và 3 người nợ bạn 450k. "pizza 300k chia 3 với Nam Lan": Nam, Lan mỗi người nợ 100k.
  - **Thay đổi so với 2.7.0:** "vay bạn 500k" giờ là khoản mình nợ, "cho bạn vay 500k" là khoản người ta nợ mình (trước là khoản thu, khoản chi). "bạn trả 200k", "Nam trả 200k" chỉ thành trả nợ khi sổ nợ có khoản tương ứng, không có thì vẫn hiểu như cũ.
- **Tổng kết tuần:** từ 18:00 Chủ nhật tới hết thứ Hai, trang Hôm nay có thẻ **Tuần qua**: chi tiêu so với tuần trước và 3 loại chi nhiều nhất, việc xong, trễ hạn, dời, buổi tập so với giáo án, kỷ lục mới, cân nặng, nợ còn lại, buổi vắng (học sinh, sinh viên). Bấm **Xem chi tiết** để xem các tuần trước, **Chép văn bản** để dán Zalo hay ChatGPT. Không thích thì bấm **Ẩn**.
- **Nhắc thêm qua thông báo** (Cài đặt → Thông báo, áp dụng cho mọi máy của bạn, mặc định tắt):
  - Trước giờ vào lớp 10, 15 hoặc 30 phút: "📚 15 phút nữa: Giải tích 1 · H1-201". Tuần không học và buổi đã báo vắng thì không nhắc.
  - Ngày có buổi tập trong giáo án mà chưa tập, nhắc đúng giờ bạn chọn: "💪 Hôm nay: Buổi Kéo · 3 bài".
  - 20:00 Chủ nhật nhắc xem tổng kết tuần.
  - **Phần này cần chủ app cập nhật máy chủ** (deploy lại hàm `hn-push`, xem mục bên dưới). Chưa deploy thì app vẫn chạy, chỉ là chưa có các nhắc mới.
- **Sửa lỗi:**
  - Khoản phải trả (tiền nhà, điện) lỡ nhiều kỳ: đánh dấu xong thì kỳ kế tiếp hiện ngay (vẫn quá hạn nếu đã qua), không còn nhảy thẳng tới kỳ sắp tới làm mất khoản nợ.
  - Việc lặp hằng năm, âm lịch bị máy còn 2.6.1 đặt lệch sang tháng sau thì tự sửa lại đúng ngày (một lần).
  - Máy chỉ có cài đặt (chưa có dữ liệu gì) đăng nhập tài khoản khác: lấy cài đặt của tài khoản đó, không đè cài đặt của máy lên.
  - Mục máy chủ từng từ chối được thử lại tự động khi mở app (tối đa 6 giờ một lần).
  - Ghi nhanh: "lớp 12 đóng quỹ 50k" ra 50k (trước ra 12đ); "in ảnh 4x6" không còn thành buổi tập; "1/3 cơm 30k" gõ ngày 20/10 là khoản chi ngày 1/3 đã qua (trước thành khoản phải trả năm sau); "váy hoa 300k" là khoản chi (trước thành khoản thu vì giống "vay").

### Chủ app làm tay cho 2.8.0 (không bắt buộc để app chạy)

1. **Nhắc lịch học, buổi tập, tổng kết tuần:** không cần đổi SQL (`push.sql` giữ nguyên). Trong một terminal thật, ở thư mục repo:
   ```bash
   npx supabase login
   npx supabase functions deploy hn-push --no-verify-jwt
   ```
   (chưa link project thì thêm `--project-ref iqzhkvwybnsxyclxhjcs`).
   Thư mục `supabase/functions/hn-push/` giờ có thêm `sched.js` (bản sao của `sched.js` ở gốc repo), lệnh deploy tự gửi kèm. Thử lại: POST `{"action":"vapid"}` phải trả `publicKey`; POST `{"action":"tick"}` không có header phải là 401. Sau đó bật thử "Nhắc trước giờ vào lớp" trong Cài đặt.
2. **Dọn bản ghi đã xóa trên server:** chạy `cleanup.sql` trong SQL Editor. Tệp này tạo job pg_cron mỗi ngày xóa hẳn các dòng `deleted = true` đã nhận quá 90 ngày (điện thoại tự dọn sau 60 ngày nên server giữ lâu hơn), và thu hồi quyền `delete` trực tiếp trên `hn_items` (app không dùng quyền này). `setup.sql` cũng đã bỏ quyền `delete`, chạy lại không cấp lại.

## Mới trong bản 2.7.0

- **Ghi bù thu chi cho ngày đã qua** (tab Tiền): thẻ **Lịch chi tiêu** hiện tổng chi từng ngày trong tháng, ô viền đứt là ngày chưa ghi khoản nào. Bấm một ngày (hoặc nút + cạnh tiêu đề ngày) để xem và sửa các khoản của ngày đó, gõ nhanh "cơm 35k + nước 10k" hay bấm **+ Ghi chi** / **+ Ghi thu** cho đúng ngày đó. Bấm ‹ để ghi bù cho tháng trước. Form ghi khoản có nút ngày **Hôm nay / Hôm qua / Hôm kia / Ngày khác**.
- **Ghi nhanh hiểu đúng hơn:**
  - "nộp bài 12h đêm thứ 6" là 23:59 thứ 6 (trước bị hiểu thành 12 giờ trưa).
  - "17/10 cơm 30k" ghi thành khoản chi ngày 17/10 (trước thành khoản phải trả năm sau). Hạn ở năm khác thì hiện kèm năm.
  - **Âm lịch:** "giỗ ông mùng 10 tháng 9 âm", "rằm tháng 10", "rằm hằng tháng", "mùng 1 đi chùa âm lịch"; có lặp **Hằng năm âm lịch** và **Hằng tháng âm lịch**, tính cả tháng nhuận.
  - "cơm 35k + nước 10k" ghi 2 khoản; "bạn trả 200k", "hoàn tiền 120k", "vay bạn 500k" là khoản thu; "họp nhóm 20h hằng tuần đến 30/12" lặp tới 30/12.
  - Tập: hiểu bài trong giáo án đã dán, "40kg", "3 hiệp", "chạy 5km 30 phút".
  - Ngày không có thật như "31/11" lùi về ngày cuối tháng.
- **Việc lặp hằng tháng giữ đúng ngày:** 31/1 → 28/2 → 31/3 → 30/4 (trước bị trôi về 28). Có thêm lặp **Hằng năm** (29/2 cũng đúng).
- **Hôm nay** hiện vài việc chưa có hạn. **Lịch tháng** hiện các lần lặp sau dạng mờ (tiền phòng tháng sau, tháng sau nữa).
- **Chữ to** rõ hơn và bật được ngay ở màn chào. Nút nào cũng đủ to để bấm (44px), thông báo nhỏ ở dưới màn hình không còn bị ép hẹp.
- **Tập:** giáo án HLV viết kiểu thường ("Bench press: 4 hiệp x 8-10 lần, 40kg", "Nghỉ: T3, T5, T7", "nghỉ 60s", "Buổi 1 (T3)") đọc đúng hơn. Đồng hồ nghỉ luôn nằm trong tầm mắt khi tick hiệp.
- **An toàn dữ liệu:**
  - Bấm Xong, bỏ Xong rồi Xong lại một khoản phải trả không còn ghi chi hai lần; bỏ Xong thì xóa khoản chi đã tự ghi (có Hoàn tác).
  - Dữ liệu lỗi từ file sao lưu hay máy khác không còn làm app trắng trang.
  - Đăng nhập tài khoản khác trên cùng máy: app hỏi **gộp dữ liệu trên máy** hay **bắt đầu trống** (tự tải bản sao lưu trước).
  - Lỗi đồng bộ báo rõ bằng tiếng Việt; một mục quá lớn không còn chặn cả lô.
  - File CSV mở bằng Excel an toàn hơn (ghi chú bắt đầu bằng = không thành công thức).
- **Học sinh:** form môn học gọn hơn, câu mẫu không còn "BTL".
- Icon nhỏ của thông báo trên Android không còn là ô vuông trắng.
- **Lưu ý:** hãy cập nhật mọi máy lên 2.7.0. Máy còn bản cũ mà đánh dấu xong việc lặp hằng năm hoặc âm lịch thì lần sau bị đặt sau 1 tháng.

## Mới trong bản 2.6.1

- **Thông báo trên Xiaomi, Redmi, POCO, Oppo, Vivo:** nếu chỉ nghe tiếng mà không thấy thông báo hiện xuống, thẻ Thông báo trong Cài đặt (trên Android) chỉ cách bật **Thông báo nổi**, thông báo trên màn hình khóa, Tự khởi động và bỏ hạn chế pin.

## Mới trong bản 2.6.0

- **Dán giáo án** (tab Tập → **Dán giáo án**): nhờ HLV hay ChatGPT soạn bài, dán vào là bài nằm sẵn đúng ngày, tuần nào cũng lặp lại tới khi bạn xóa giáo án (đặt ngày kết thúc nếu muốn). Giống dán thời khóa biểu MyBK.
  - Hiểu `Thứ 2: Hít xà 4x8, Plank 3x45s`, `Buổi 1 - Kéo` rồi các dòng `1. Hít xà: 4 hiệp x tối đa`, hay ngày cụ thể `20/10: Squat 3x15`. Liều kiểu `4x8-10`, `3x30 giây`, `20 phút`, `@8kg`, `mỗi chân`; chữ trong ngoặc là ghi chú.
  - Nút **Chép câu nhờ ChatGPT soạn** chép sẵn câu dặn đúng định dạng. Xem trước hiện ngay khi dán: buổi nào vào thứ mấy, bài thiếu số lần (vàng), dòng không hiểu.
  - "Buổi 1, Buổi 2…" thì chọn thứ ngay trong xem trước. Ngày bắt đầu mặc định là hôm nay, có nút nhanh Thứ 2 tuần này / tuần sau.
  - Dán giáo án mới thì giáo án cũ tự kết thúc từ hôm trước, lịch sử đã tập giữ nguyên. **Quản lý** để đổi tên, đặt ngày kết thúc hay xóa giáo án (có Hoàn tác).
- **Tick từng hiệp:** chạm một ngày để mở buổi của ngày đó. Mỗi bài có nút Hiệp 1, Hiệp 2… ghi sẵn số lần mục tiêu: chạm là xong hiệp đó, chạm lại là bỏ tick. Làm ít hay nhiều hơn thì **giữ lâu** (hoặc **Sửa số**) để gõ đúng số. Bài "tối đa" thì app hỏi số. Có **+ Thêm hiệp**, **+ Thêm bài**, chọn mức nghỉ một lần là hẹn giờ nghỉ tự chạy sau mỗi hiệp.
- **Ghi chú bài:** mỗi bài có ô ghi chú riêng (đau vai, đổi tạ…), hiện cả trong lịch sử và khi xuất.
- **Xem tuần trước và cả tháng:** lịch tập có công tắc **Tuần | Tháng**. Tuần có ‹ › và **Về tuần này**; tháng tô ngày đã tập, viền ngày có bài sắp tới, viền đứt ngày bỏ lỡ, kèm tổng số buổi, phút và hiệp của tháng. Ngày bỏ lỡ có nút **Tập buổi này hôm nay**. Ngày đã qua vẫn tick bù được.
- **Xuất dữ liệu tập** (4 tuần, 3 tháng hoặc tất cả): **Chép văn bản** để dán vào ChatGPT, Zalo hay gửi HLV phân tích; hoặc **Tải CSV** (mỗi hiệp một dòng) để mở bằng Excel.
- **Bỏ giáo án 5 buổi A-E cài sẵn** (cùng phần cách ăn): đó là giáo án riêng của chủ app. Các buổi đã tập theo giáo án cũ vẫn còn nguyên trong lịch sử. Cân nặng và mục tiêu cân giữ như cũ.

## Mới trong bản 2.5.0

- **Giáo án tập 5 buổi/tuần** (đã bỏ ở 2.6.0, thay bằng Dán giáo án) (tab Tập → **Dùng giáo án này**): dành cho xà đơn, xà kép, para, tạ 8kg và máy chạy đung đưa. Có 5 buổi A đến E xoay vòng, mỗi buổi 3 bài. Ngày nghỉ chọn tùy ý: app nhớ buổi tiếp theo, chỉ cần đủ 5 buổi mỗi tuần.
  - Thẻ **Buổi tiếp theo** hiện 3 bài kèm mục tiêu (số hiệp, số lần), mẹo tập đúng và gợi ý dựa trên lần trước ("đã chạm đỉnh, lần này làm khó hơn"). Bấm A đến E để đổi sang buổi khác.
  - **Bắt đầu buổi** mở form đã điền sẵn 3 bài và tạ 8kg, chỉ cần gõ số lần.
  - Báo tuần này còn mấy buổi trong mấy ngày, chuyển màu khi bắt đầu gấp. Trang Hôm nay cũng hiện buổi tiếp theo.
  - Mục **Cả giáo án và cách ăn**: toàn bộ 5 buổi, cách tăng dần, cách ăn để giảm mỡ mà vẫn tăng cơ.
- **Mục tiêu cân nặng:** đặt trong form ghi cân. Thẻ Cân nặng hiện xu hướng 4 tuần (kg/tuần), còn bao nhiêu kg và tháng dự kiến đạt. Cảnh báo khi giảm quá nhanh (dễ mất cơ) hoặc đang tăng.
- **Việc:** nút ⋯ (hoặc giữ lâu một dòng) để dời sang hôm nay, ngày mai, cuối tuần, tuần sau, hay **chọn ngày trên lịch tháng**, có Hoàn tác. Việc quá hạn có nút **Dời hết sang hôm nay**.
- **Ghi nhanh hiểu thêm:** "thứ sáu" (khi nói bằng giọng), "thứ 5 tới", "3 ngày nữa", "cuối tháng", "8 giờ rưỡi", "9h kém 15", "ăn tối 7h" (19:00).
- **Tìm kiếm** khớp nhiều từ ở nhiều trường ("btl giai tich"), tìm theo ngày ("23/10") và số tiền ("35k"), tô sáng chỗ khớp.
- **Tiền:**
  - Còn bao nhiêu mỗi ngày và dự báo cả tháng đã trừ các khoản sắp phải trả trong tháng.
  - Thẻ Chi tiêu so tuần này với cùng kỳ tuần trước.
  - Nút ghi nhanh xếp theo giờ bạn hay ghi, bấm là ghi đúng khoản đang thấy.
  - Mỗi loại chi so với cùng kỳ tháng trước, bấm vào loại để lọc danh sách.
  - Mục tiêu tiết kiệm hiện cần để dành bao nhiêu mỗi tuần.
  - Nút **Thêm hôm nay** trong form sửa khoản chi: chép khoản đó sang hôm nay.
- **Lối tắt trên icon** (Android: giữ icon app): Ghi nhanh, Thêm việc, Ghi chi, Lịch. Chia sẻ chữ từ app khác vào Hôm Nay thì chữ đó điền vào ô ghi nhanh.
- Tự dọn các mục đã xóa quá 60 ngày (khi đã đồng bộ) cho nhẹ bộ nhớ. Cài đặt → Sao lưu hiện dung lượng đang dùng.

## Mới trong bản 2.4.1

- Có việc quá hạn, hạn hôm nay hoặc mai thì thẻ **Sắp tới hạn** lên ngay dưới ô ghi nhanh.
- Bấm dòng xem trước của ô ghi nhanh rồi đóng form mà không lưu thì câu vừa gõ vẫn còn nguyên.
- Mọi form (môn học, ngân sách, buổi tập, cân nặng, giấy tờ, mục tiêu, dán thời khóa biểu) đều có nút Lưu nằm cố định ở đáy.
- Câu mẫu dưới ô ghi nhanh dễ bấm hơn, công tắc đang tắt nhìn rõ hơn, nhập thời khóa biểu nhanh hơn.

## Mới trong bản 2.4.0

- **Ghi nhanh hiểu nhiều cách gõ hơn:** "2tr5", "12tr500", "2 củ", "1 trăm rưỡi", "mùng 5", "thứ 2 tuần sau", "tối qua", "hôm kia". "Mẹ chuyển 2tr", "bán sách được 200k" được ghi là khoản thu. "Cơm 35k, cafe 20k" tách thành 2 khoản. Việc chỉ có giờ ("họp 15h") tự gán hôm nay hoặc ngày mai để được nhắc. Bấm vào dòng xem trước để mở form đã điền sẵn, nút ⇄ đổi nhanh Chi/Thu.
- **Dễ nhìn, dễ bấm hơn:** màu chữ và nút đạt chuẩn tương phản ở cả chế độ sáng lẫn tối, mọi nút bấm rộng ít nhất 44px, ô đang chọn nổi rõ. Lịch tháng hiện tiết học thành chấm màu, chừa chỗ cho lịch thi và hạn nộp.
- **Form gọn hơn:** nút Lưu luôn nằm ở đáy (kể cả khi bàn phím mở), trường ít dùng nằm trong "Thêm chi tiết", danh mục chi tiêu dạng lưới.
- "Sắp tới hạn" nhìn 7 ngày. Lịch tuần tối Chủ nhật mở tuần tới. Dự báo chi cả tháng không còn tính trùng tiền nhà, tiền điện. Đổi hồ sơ không tự tắt Lịch học. Dán lịch thi xong vẫn ở tab Lịch.
- **Nhanh hơn nhiều khi có nhiều dữ liệu** (vẽ lại nhanh gấp 5 đến 20 lần với khoảng 6.000 bản ghi), giữ vị trí cuộn khi dữ liệu đổi, mở app không phải chờ thư viện và font tải xong.
- Dùng được bằng bàn phím: Escape đóng form, Tab không chạy ra phía sau. File lịch (.ics) giữ đúng dấu chấm phẩy và tiếng Việt có dấu.

## Mới trong bản 2.3.4

- Cập nhật app an toàn hơn: nếu tải bản mới bị lỗi giữa chừng, app giữ nguyên bản cũ để vẫn mở được khi không có mạng, lần sau tự thử lại.

## Mới trong bản 2.3.3

- Khi bộ nhớ trên máy đầy, app hiện cảnh báo ở trên cùng kèm nút **Tải bản sao lưu**, thay vì âm thầm không lưu. Dữ liệu vẫn được giữ và đồng bộ lên tài khoản nếu đang đăng nhập.

## Mới trong bản 2.3.2

- Sửa lỗi bảo mật: tên danh mục tự tạo, file sao lưu hoặc dữ liệu đồng bộ từ máy khác có thể chèn mã vào app. Giờ mọi dữ liệu đều được kiểm tra khi đọc vào và escape khi hiển thị, kèm Content-Security-Policy chặn mã lạ.

## Mới trong bản 2.3.1

- Tab Lịch: nút **Dán thời khóa biểu** có ngay ở dạng Tháng (dạng mặc định), không cần chuyển sang dạng Tuần nữa. Dán được cả Thời khóa biểu lẫn Lịch thi MyBK.
- Sửa lỗi nút **+** che mất nút ở cuối trang (ví dụ "Đưa vào Lịch").

## Mới trong bản 2.3.0

- Cài đặt → Sao lưu: **Tải bản sao lưu** và **Khôi phục từ file**. Khôi phục gộp vào dữ liệu đang có, mục nào sửa sau thì giữ bản đó, nhập hai lần không sinh bản trùng. File hỏng hoặc không phải của Hôm Nay thì app báo và không đụng vào dữ liệu.

## Mới trong bản 2.2.1

- Tab Lịch: nút **+** (màu xanh) mặc định thêm việc cho ngày đang chọn; trong form có nút chuyển sang **Tiết học** (giữ nguyên tên đã gõ).
- Sửa lỗi bấm giữa nút không ăn (thông báo nhỏ đã ẩn vẫn che lên).
- Thêm `CLAUDE.md`, `analysis.md` và `tests/smoke.py` để sửa app bằng Claude Code.

## Mới trong bản 2.2: thông báo nhắc hạn

- **Thông báo đẩy như app thường**, kể cả khi đã tắt app: hạn nộp, lịch thi và khoản phải trả. Việc có giờ: nhắc trước 1 ngày, trước 2 tiếng (tùy chọn thêm trước 15 phút). Việc không có giờ: 20:00 hôm trước và 7:00 sáng hôm đó.
- Bật trong Cài đặt → **Thông báo nhắc hạn** (cần đăng nhập đồng bộ). Có nút **Gửi thử**, bật/tắt từng mốc nhắc. Chạm vào thông báo là mở đúng việc đó.
- iPhone: phải mở app từ icon ngoài màn hình chính (iOS 16.4 trở lên) thì mới bật được.
- Phía máy chủ: hàm `hn-push` (Supabase Edge Function, trong thư mục `supabase/functions/hn-push`) chạy mỗi 5 phút bằng pg_cron, cấu hình trong `push.sql`. Không dùng dịch vụ bên ngoài, khóa VAPID tự tạo và chỉ nằm trong database của bạn.
- Nếu cron bị ngừng hơn 20 phút (ví dụ project vừa được đánh thức), các mốc nhắc bị lỡ của việc chưa tới hạn được gom thành **một** thông báo, kiểu "⏰ Bạn có 2 việc sắp đến hạn".
- `tick` (lệnh cron gọi mỗi 5 phút) cần header `x-hn-secret`. Khóa này do `push.sql` tự tạo trong Supabase Vault, cron đọc từ Vault khi chạy, không cần chép đi đâu. Khi cập nhật: chạy lại `push.sql` trong SQL Editor **trước**, rồi mới `npx supabase functions deploy hn-push --no-verify-jwt`.

## Mới trong bản 2.1

- **Lịch tháng kiểu Google Calendar** (tab Lịch): lịch học, lịch thi, việc, khoản phải trả, buổi tập đều nằm trên một bảng tháng. Chạm vào một ngày để xem chi tiết và đánh dấu xong, vuốt ngang để đổi tháng, có nút "+ Việc ngày này". Dạng Tuần (thời khóa biểu) vẫn còn, chuyển qua lại bằng nút ở trên.
- **Âm lịch và ngày lễ Việt Nam:** mỗi ô có ngày âm (mùng 1, Rằm), tô đỏ ngày nghỉ (Tết Dương lịch, Tết Nguyên đán, Giỗ Tổ, 30/4, 1/5, 2/9) và ghi các ngày lễ khác (20/10, 20/11, Trung thu, Vu Lan…). Trang Hôm nay có ngày âm lịch.
- **Lịch thi MyBK:** dán bảng Lịch thi (Môn học, Ngày thi, Loại thi GK/CK, Mã phòng, Giờ bắt đầu, Tổng số phút) là app tạo bài thi có giờ bắt đầu, kết thúc, phòng và nhóm. Bài thi đã qua thì mặc định không nhập.
- Tab Lịch có cho cả người đi làm (việc, hạn trả, ngày lễ), không cần bật Lịch học.

## Mới trong bản 2.0: cho mọi người

- **Gõ hoặc nói một câu là ghi xong** (ô trên cùng trang Hôm nay, nút micro để nói):
  - `cà phê 30k`, `trà sữa 25k hôm qua`, `cơm trưa 35` → khoản chi, tự đoán loại.
  - `lương 15tr`, `mẹ gửi 3tr`, `+500k bán hàng` → khoản thu.
  - `nộp báo cáo thứ 6 5h chiều`, `họp nhóm mai 9h`, `nhắc tôi gọi mẹ tối nay` → việc có hạn và giờ.
  - `tiền nhà 3tr ngày 5 hằng tháng`, `Netflix 70k hằng tháng ngày 15` → khoản phải trả định kỳ.
  - `hít đất 20 15 15`, `chạy bộ 30 phút` → buổi tập. `cân nặng 65,5` → cân nặng.
  - Hiểu cả `3tr5`, `12 triệu rưỡi`, `1 lít` (100k), `1 củ` (1tr). Học theo lịch sử: khoản nào bạn từng xếp loại thì lần sau tự xếp đúng.
- **Dành cho ai cũng được:** lần đầu chọn Học sinh, Sinh viên, Đi làm, Kinh doanh hoặc Khác. App tự bật các mục phù hợp, đổi chữ (Bài tập ↔ Công việc, Sắp thi ↔ Sắp diễn ra), mẫu giấy tờ và câu ví dụ. Có thể bật/tắt Lịch học, Tập luyện, Giấy tờ.
- **Khoản phải trả:** việc có số tiền (tiền nhà, điện, học phí…). Đánh dấu đã trả là tự ghi vào chi tiêu, việc lặp lại thì tự tạo kỳ sau. Tab Tiền có thẻ "Sắp phải trả".
- **Mục tiêu tiết kiệm:** đặt số tiền và hạn, góp hoặc rút dần. App tính mỗi tháng cần bao nhiêu. Tiền để dành không bị tính là đã chi.
- **Danh mục thu chi:** thêm 16 loại chi (nhà cửa, con cái, quà hiếu hỉ, thú cưng, tiết kiệm…) và 6 loại thu (kinh doanh, đầu tư…). Có thể tự tạo danh mục riêng và ẩn mục không dùng.
- **Giao diện:** chọn Theo máy, Sáng hoặc Tối. Có chế độ **chữ to** cho người lớn tuổi. Giờ tiết học theo Đại học, Phổ thông hoặc tự đặt.

## Mới trong bản 1.2

- **Việc lặp lại:** hằng ngày, hằng tuần, 2 tuần, hằng tháng, có thể đặt ngày kết thúc. Đánh dấu xong thì lần kế tiếp tự hiện. Lỡ trễ nhiều kỳ thì nhảy tới kỳ sắp tới, không tạo dồn.
- **Điểm danh:** chạm vào một buổi học để mở chi tiết môn. Đánh dấu vắng hôm nay hoặc bất kỳ buổi đã qua, xem số buổi vắng và %. Từ 15% hiện cảnh báo vàng, từ 20% cảnh báo đỏ.
- **Tiền:** ngân sách riêng từng loại (vượt là thanh chuyển đỏ), biểu đồ 6 tháng (chạm cột để xem tháng đó), dự báo chi cả tháng, xuất Excel (CSV) để mở bằng Excel hoặc Google Sheets.
- **Tập:** báo **kỷ lục mới** khi lưu buổi tập, bảng kỷ lục cá nhân từng bài, theo dõi cân nặng kèm biểu đồ và chênh lệch so với khoảng 1 tháng trước.
- **Lần đầu mở app:** hướng dẫn nhanh, nhập tên, ngân sách và TKB ngay.
- Đã kiểm tra trên màn hình nhỏ 320px và chế độ tối.

## Mới trong bản 1.1

- **Nhập từ MyBK:** tab Lịch học → *Nhập từ MyBK*. Trên MyBK, bôi đen bảng Thời khóa biểu từ dòng tiêu đề `HỌC KỲ · MÃ MH…` đến hết, chép rồi dán vào. App đọc thứ, giờ, phòng, **tuần học**, tín chỉ, xem trước rồi mới nhập. Bảng nhiều trang thì dán nối tiếp. Đồ án, sinh hoạt không có lịch có thể thêm vào mục Việc. Dán bảng **Lịch thi** thì app tạo việc loại "Thi".
- **Xem theo tuần:** nút ‹ › ở tab Lịch học. Môn học cách tuần (thí nghiệm, thực hành) chỉ hiện đúng tuần có học. Tuần nghỉ, tuần thi giữa kỳ được ghi rõ.
- **Báo trùng giờ** khi nhập hoặc thêm môn.
- **Đưa vào Lịch điện thoại:** tạo file .ics để iPhone hoặc Xiaomi tự nhắc 15 phút trước giờ học, 1 ngày và 2 tiếng trước hạn nộp.
- **Sắp thi:** đếm ngược các bài thi trong 30 ngày tới ngay trên trang Hôm nay.
- **Ghi nhanh chi tiêu:** khoản chi lặp lại từ 2 lần trở lên hiện thành nút, chạm 1 lần là ghi, có Hoàn tác.
- **Tìm kiếm** (kính lúp): tìm việc, môn, khoản chi, giấy tờ, gõ không dấu cũng được. Tìm một khoản chi thì có luôn tổng tiền.
- **Buổi tối** tự hiện lịch học ngày mai. **Hẹn giờ nghỉ** giữa hiệp khi ghi buổi tập.
- Chi tiêu tháng này so với cùng kỳ tháng trước. Badge đếm việc đến hạn trên icon app. Có nhắc khi đã hơn 30 ngày chưa sao lưu.
- Khi có bản mới, app báo "Đã có bản cập nhật mới", bấm Tải lại là xong.

## Mẹo dùng

- **Tiền:** gõ `35` là 35.000đ, `1,5tr` là 1.500.000đ. Ghi chú gõ lại lần sau sẽ được gợi ý.
- **Tập:** gõ số lần mỗi hiệp `10 8 8` hoặc `4x10`. Nút "Lặp lại bài của buổi trước" điền sẵn các bài, chỉ cần nhập số. Có giáo án thì chạm vào ngày trên lịch tập rồi chạm nút Hiệp ngay sau mỗi hiệp; giữ lâu để sửa số. Muốn ai xem giúp thì bấm **Xuất dữ liệu tập** → **Chép văn bản**.
- **Lịch học:** chọn tiết là app tự điền giờ theo lịch BK (tiết 1 = 6:00). Một môn học nhiều buổi thì chọn nhiều thứ.
- **Việc:** chọn "Chờ người khác" cho đơn đã gửi mà thầy cô chưa trả lời. Mục "Phần việc" dùng để chia việc BTL nhóm.
- Trên Android, giữ icon app sẽ hiện lối tắt **Ghi nhanh**, **Thêm việc**, **Ghi chi** và **Lịch**.
- Không thấy tính năng mới: mở app chờ vài giây rồi bấm **Tải lại** ở thông báo "Đã có bản cập nhật mới", hoặc đóng hẳn app rồi mở lại. Số phiên bản nằm ở cuối Cài đặt.
- Nên thỉnh thoảng vào cài đặt → **Tải bản sao lưu** để giữ một file JSON. **Khôi phục từ file** sẽ gộp vào dữ liệu đang có (mục sửa sau thắng, không xóa gì), nhập lại nhiều lần cũng không bị trùng.

## Khi sửa code

Đổi `VERSION` trong `sw.js` (ví dụ `hn-v2`) để điện thoại tải bản mới. Bản mới hiện từ lần mở app thứ hai.

## Supabase gói miễn phí có bị tạm dừng không?

Tra cứu ngày 18/10/2026.

**Chính sách (tài liệu chính thức):**
- Project gói Free bị tạm dừng nếu có quá ít "hoạt động database của người dùng" trong 7 ngày.
- Theo Supabase, chỉ cần vài request mỗi ngày trong tuần trước là đủ. Có hai cách tạo hoạt động: mở project trong Dashboard, hoặc gọi API, kể cả request từ app đang kết nối.
- Chủ project nhận email cảnh báo khoảng một tuần trước khi bị dừng, và một email nữa khi đã dừng.
- Project đã dừng có thể bật lại bằng nút "Resume project" trong Dashboard. Thời hạn bật lại chưa thống nhất: trang tài liệu chỗ ghi 90 ngày, chỗ ghi 1 năm.
- Nguồn: [Supabase Docs: Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing).

**Chưa có nguồn chính thức:** pg_cron hoặc hoạt động bên trong database có được tính hay không. Một collaborator trên diễn đàn Supabase cho rằng không, vì Postgres luôn có việc chạy nền, và gọi API từ bên ngoài mới chắc ([thảo luận #13121](https://github.com/orgs/supabase/discussions/13121)). Đó chỉ là ý kiến cá nhân, không phải quy định.

**Với Hôm Nay, mình chưa thêm GitHub Action giữ project chạy**, vì:
1. App đồng bộ mỗi 60 giây khi đang mở, mỗi lần đều gọi REST API. Chỉ cần mở app vài ngày một lần là đúng kiểu "vài request mỗi ngày" mà tài liệu nêu. (Từ 18/10/2026 project chỉ còn Hôm Nay: phần của app Lưới Thói Quen đã được xóa, nên không còn app thứ hai giữ project hoạt động.)
2. Hàm `hn-push` cứ 5 phút lại đọc `push_subs`, `push_config`, `hn_items` qua REST API của chính project (đi qua API gateway như một app bình thường), nên nhiều khả năng cũng được tính. Điểm này chưa kiểm chứng.
3. Nếu sắp bị dừng, Supabase báo trước một tuần qua email, đủ thời gian xử lý.
4. GitHub Action cũng có điểm yếu: ở repo public, workflow chạy theo lịch tự bị tắt sau 60 ngày repo không có commit ([GitHub Docs](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#schedule)). Ngoài ra phải cất URL và anon key vào Secrets của repo.

**Khi nào cần làm thêm:** nếu nhận được email cảnh báo tạm dừng từ Supabase, nghĩa là (1) và (2) không đủ. Lúc đó thêm `.github/workflows/keepalive.yml` chạy hằng ngày, gọi `GET $SUPABASE_URL/rest/v1/hn_items?select=id&limit=1` với header `apikey` lấy từ Secrets. Bảng có RLS nên request này trả về mảng rỗng, không lộ dữ liệu, nhưng vẫn là một request API thật.

## Cách đồng bộ hoạt động

- Mỗi mục (một việc, một khoản tiền, một buổi tập…) được lưu trên máy trước, rồi gửi lên hàm `hn_push`.
- Hai máy sửa hai mục khác nhau, kể cả lúc offline, đều được giữ. Nếu cùng một mục bị sửa ở cả hai máy, bản sửa sau cùng sẽ thắng.
- Xóa trên máy này thì máy kia cũng mất theo. Ngay sau khi xóa có nút "Hoàn tác".
- Mỗi tài khoản chỉ đọc và ghi được dữ liệu của chính nó (Row Level Security).
