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
- **Tập:** gõ số lần mỗi hiệp `10 8 8` hoặc `4x10`. Nút "Lặp lại bài của buổi trước" điền sẵn các bài, chỉ cần nhập số.
- **Lịch học:** chọn tiết là app tự điền giờ theo lịch BK (tiết 1 = 6:00). Một môn học nhiều buổi thì chọn nhiều thứ.
- **Việc:** chọn "Chờ người khác" cho đơn đã gửi mà thầy cô chưa trả lời. Mục "Phần việc" dùng để chia việc BTL nhóm.
- Trên Android, giữ icon app sẽ hiện lối tắt **Ghi chi tiêu** và **Thêm việc**.
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
1. App đồng bộ mỗi 60 giây khi đang mở, mỗi lần đều gọi REST API. Project này dùng chung với Lưới Thói Quen. Chỉ cần mở một trong hai app vài ngày một lần là đúng kiểu "vài request mỗi ngày" mà tài liệu nêu.
2. Hàm `hn-push` cứ 5 phút lại đọc `push_subs`, `push_config`, `hn_items` qua REST API của chính project (đi qua API gateway như một app bình thường), nên nhiều khả năng cũng được tính. Điểm này chưa kiểm chứng.
3. Nếu sắp bị dừng, Supabase báo trước một tuần qua email, đủ thời gian xử lý.
4. GitHub Action cũng có điểm yếu: ở repo public, workflow chạy theo lịch tự bị tắt sau 60 ngày repo không có commit ([GitHub Docs](https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows#schedule)). Ngoài ra phải cất URL và anon key vào Secrets của repo.

**Khi nào cần làm thêm:** nếu nhận được email cảnh báo tạm dừng từ Supabase, nghĩa là (1) và (2) không đủ. Lúc đó thêm `.github/workflows/keepalive.yml` chạy hằng ngày, gọi `GET $SUPABASE_URL/rest/v1/hn_items?select=id&limit=1` với header `apikey` lấy từ Secrets. Bảng có RLS nên request này trả về mảng rỗng, không lộ dữ liệu, nhưng vẫn là một request API thật.

## Cách đồng bộ hoạt động

- Mỗi mục (một việc, một khoản tiền, một buổi tập…) được lưu trên máy trước, rồi gửi lên hàm `hn_push`.
- Hai máy sửa hai mục khác nhau, kể cả lúc offline, đều được giữ. Nếu cùng một mục bị sửa ở cả hai máy, bản sửa sau cùng sẽ thắng.
- Xóa trên máy này thì máy kia cũng mất theo. Ngay sau khi xóa có nút "Hoàn tác".
- Mỗi tài khoản chỉ đọc và ghi được dữ liệu của chính nó (Row Level Security).
