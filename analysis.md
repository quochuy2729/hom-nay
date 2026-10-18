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
7. **Gói miễn phí của Supabase tạm dừng project sau 7 ngày ít hoạt động** (tài liệu chính thức: tính "vài request mỗi ngày" từ Dashboard hoặc API, có email cảnh báo trước một tuần). Khi đó đồng bộ và thông báo đều ngừng. Tài liệu không nói pg_cron có được tính hay không. Kết luận và nguồn: README, mục "Supabase gói miễn phí có bị tạm dừng không?".
8. **Đã sửa ở 2.3.0:** sao lưu và khôi phục JSON. Trước đó đã có nút "Xuất file / Nhập file" nhưng nhập không kiểm tra dữ liệu (id không phải uuid sẽ làm hỏng cả lô `hn_push`, ngày sai làm dừng giữa chừng khi `db` đã bị sửa một nửa), và chọn lại cùng một file lần hai thì không có gì xảy ra vì ô chọn file không được xóa giá trị.

### Thông báo
9. **Chưa thử trên máy thật.** Ngày 18/10/2026 `push_subs` vẫn trống (cron trả `subs: 0`): chưa máy nào bật thông báo, nên hiện tại chưa ai nhận được nhắc. Cần kiểm tra trên Poco X8 Pro (Chrome) và iPhone 12 Pro (iOS 16.4+, phải mở app từ icon ngoài màn hình chính).
10. **Lịch học chưa có nhắc đẩy, mới chỉ nhắc qua file `.ics`.** Bài thi đã được nhắc vì nó là một việc.
11. **Trước 18/10/2026 repo không có `supabase/functions/hn-push/index.ts`.** Đã tải đúng bản đang chạy về bằng `supabase functions download` và commit làm mốc (`a5f22cd`). Bản này đã có thông báo lỗi `push_config: …`. Mọi thay đổi sau đó chỉ có hiệu lực khi deploy lại.
12. **Đã sửa và deploy 18/10/2026:** `tick` cần header `x-hn-secret`. Trước đó ai cũng gọi được, kể cả gửi body trống (mặc định là tick).
13. **Đã sửa và deploy 18/10/2026:** khung gửi vẫn là 20 phút, nhưng mốc rơi vào lúc cron ngừng được gom lại thành một thông báo bù.

### Giao diện và trợ năng
14. **Một số dòng bấm được đang là `div`, chưa phải `button`, nên không dùng được bằng bàn phím hay trình đọc màn hình.** Ví dụ: dòng trong chương trình ngày (`.ag`), một số thẻ (`.tap`).
15. **Chuyển từ dạng Tháng sang dạng Tuần không nhảy tới tuần của ngày đang chọn.** Lịch tuần luôn mở ở tuần hiện tại.
16. **Không có trạng thái "đang tải" lúc đăng nhập lần đầu và kéo dữ liệu về,** nên người dùng tưởng app bị trống.
17. **Đã sửa ở 2.2.1:** toast ẩn bằng `opacity: 0` vẫn chặn bấm ở giữa màn hình. Lỗi thấy rõ nhất ở nút "+ Việc ngày này" cũ. Cần rà các phần tử `position: fixed` khác xem có lỗi tương tự không. **Ở 2.3.1:** phát hiện nút `+` (`.fab`, cố định ở 76px từ đáy) che phần cuối trang vì `.app` chỉ chừa 96px, nên nút bên phải hàng cuối (ví dụ "Đưa vào Lịch") bị che gần một nửa. Đã tăng lên 148px; `tests/smoke.py` kiểm tra khoảng cách giữa FAB và hàng nút dưới lịch.

### Chất lượng code
18. **Kiểm thử mới có `tests/smoke.py` (22 kiểm tra).** Các kiểm thử chi tiết trước đây cho bộ đọc MyBK, câu ghi nhanh (49 câu) và âm lịch chưa được đưa vào repo.
19. **Có đoạn code thừa,** ví dụ `ev.filter(e => e.k !== "fest" || true)` trong `viewMonth`. Một số hàm rất dài: `tkbSheet`, `settingsSheet`, `taskForm`.
20. **Chưa có Content-Security-Policy.** Mọi chỗ chèn dữ liệu người dùng vào `innerHTML` đều phải đi qua `esc()`. Cần rà lại toàn bộ, nhất là chip trên lịch, kết quả tìm kiếm và xem trước nhập MyBK.

## 3. Việc nên làm (theo thứ tự)

### P0: an toàn dữ liệu và độ tin cậy
- [x] **Sao lưu và khôi phục JSON.** Thêm vào Cài đặt: "Tải bản sao lưu" và "Khôi phục từ file".
  - Khôi phục theo kiểu gộp: bản ghi mới hơn thắng, không xóa dữ liệu đang có.
  - *Xong khi:* xuất rồi nhập lại vào một máy trống thì được đúng dữ liệu cũ; nhập hai lần không sinh bản trùng.
  - *Đã làm (2.3.0):* `mergeBackup(json)` kiểm tra hết rồi mới ghi; giữ nguyên `id` và `updated_at` của bản sao lưu nên nhập lại không sinh bản trùng và server (`hn_push` chỉ nhận bản mới hơn) xử lý giống hệt máy. Kiểm thử trong `tests/smoke.py` (mục "sao lưu và khôi phục JSON").
  - *Đánh đổi:* file sao lưu không chứa bản đã xóa và khi nhập cũng bỏ qua lệnh xóa, đúng yêu cầu "không xóa dữ liệu đang có". Hệ quả: mục bị xóa trên máy *sau* lúc sao lưu thì vẫn bị xóa sau khi khôi phục (bản xóa mới hơn thắng). Nếu sau này cần "lấy lại mục đã xóa" thì phải làm riêng (ví dụ một nút trong màn hình khôi phục cho phép ưu tiên bản sao lưu), không nên nới quy tắc gộp.
  - Cài đặt (`kind: setting`) cũng được gộp; nếu hai máy có hai bản ghi khác `id` cho cùng một key thì `getSetting` lấy bản mới nhất, `setSetting` lần sau tự dọn bản thừa.
- [x] **Deploy lại `hn-push` từ repo và bảo vệ `tick` bằng khóa bí mật.** *(đã chạy `push.sql` và deploy ngày 18/10/2026: gọi `tick` không có header nhận 401; cron lúc 08:25 UTC nhận 200)*
  - Lưu khóa trong Vault; cron đọc khóa qua `vault.decrypted_secrets` và gửi trong header.
  - *Xong khi:* gọi `tick` không có header thì nhận 401; cron vẫn chạy được (`select * from cron.job_run_details order by start_time desc limit 5`).
  - *Đã làm:*
    - `push.sql` tự tạo khóa ngẫu nhiên 32 byte trong Vault (`hn_push_secret`) bằng `gen_random_bytes`, nên không ai phải chép hay nhìn thấy khóa. Chạy lại thì giữ nguyên khóa cũ.
    - Cron đọc `vault.decrypted_secrets` ngay lúc chạy và gửi trong header.
    - Hàm không đọc khóa ra mà gọi RPC `hn_push_secret_ok(k)`, chỉ `service_role` được gọi. Kết quả: `true`, `false`, hoặc `null` khi Vault chưa có khóa (khi đó trả 503 kèm hướng dẫn).
    - Thiếu header thì trả 401 ngay, không đụng database: người gọi bừa không tốn truy vấn nào. Action lạ thì trả 400. `vapid` và `test` vẫn như cũ (`test` đã đòi JWT của người dùng).
    - Kiểm thử: `tests/push_test.mjs` nạp nguyên `index.ts` vào Node với Supabase giả. `smoke.py` tự gọi file này.
  - *Đánh đổi:* chọn hỏi database thay vì đặt thêm Edge Function secret (`supabase secrets set`), để khóa chỉ nằm một chỗ (Vault) và đổi khóa không cần deploy lại. Cái giá là mỗi lần `tick` hợp lệ tốn thêm 1 RPC, không đáng kể ở mức 5 phút một lần.
  - *Thứ tự bắt buộc:* chạy `push.sql` **trước**, deploy **sau**. Deploy trước thì cron cũ chưa gửi header nên bị 401, và Vault chưa có khóa thì hàm trả 503.
- [x] **Bù mốc nhắc bị lỡ.** *(đã deploy 18/10/2026)* Nếu một mốc đã trễ quá 20 phút nhưng việc vẫn chưa tới hạn, gửi một thông báo gộp kiểu "Bạn có N việc sắp đến hạn" thay vì bỏ qua.
  - *Xong khi:* kiểm thử giả lập cron trễ 1 tiếng vẫn nhận đúng một thông báo.
  - *Đã làm:*
    - Cột mới `push_config.last_tick`. Mỗi lần tick, hàm đọc giá trị cũ rồi ghi giờ hiện tại.
    - Mốc "lỡ" là mốc rơi vào `(last_tick, now − 20 phút]`, tức đúng lúc cron không chạy. Mốc thuộc khung 20 phút gần nhất vẫn gửi như cũ.
    - Chỉ bù khi đủ cả ba điều kiện:
      - việc có từ trước mốc đó (`data.createdAt`, nếu không có thì lấy `server_at`);
      - việc chưa tới hạn (việc không có giờ thì tính tới 23:59);
      - việc không vừa được nhắc bình thường trong lần tick này.
    - Mỗi mốc lỡ được ghi vào `push_sent` như mốc thường, nên lần sau không gửi lại. Mỗi máy nhận một thông báo: lỡ một việc thì giữ tiêu đề của việc và mở đúng việc đó, lỡ nhiều việc thì báo "⏰ Bạn có N việc sắp đến hạn" kèm tối đa 3 tên.
    - Kết quả tick có thêm `late` (số thông báo bù đã gửi) và `missed` (số mốc lỡ tìm thấy).
    - Kiểm thử: 14 trường hợp trong `tests/push_test.mjs`, gồm cron trễ 1 tiếng, lỡ một việc, đúng lúc có mốc thường, chưa có `last_tick`, chưa chạy SQL thêm cột, cron chạy đều.
  - *Đánh đổi:*
    - Chưa có `last_tick` (lần chạy đầu) thì không bù, để tránh gửi hàng loạt thông báo cũ ngay sau khi deploy.
    - Chỉ nhìn lại tối đa 2 ngày, khớp với khoảng ngày mà truy vấn `hn_items` đang lấy.
    - Database chưa có cột `last_tick` thì hàm vẫn chạy như cũ, chỉ không bù.
    - Không dùng `server_at` làm mốc chính vì khi project vừa thức dậy, các thay đổi còn chờ trên điện thoại sẽ đẩy lên cùng lúc, `server_at` của chúng thành giờ thức dậy, và mốc lỡ sẽ bị loại oan.
- [x] **Giữ project Supabase không bị tạm dừng.** Tìm hiểu cách tính "không hoạt động" của gói miễn phí. Nếu cần, thêm một GitHub Action chạy hằng ngày gọi API REST (đọc 1 dòng).
  - *Xong khi:* có tài liệu hoặc kiểm chứng rõ ràng, ghi lại trong README.
  - *Kết luận (18/10/2026):* chưa thêm GitHub Action.
    - App gọi REST API mỗi 60 giây khi đang mở, project dùng chung với Lưới Thói Quen, và `hn-push` gọi REST API mỗi 5 phút. Cả ba đều là kiểu "request API" mà tài liệu nêu.
    - Supabase báo trước một tuần qua email.
    - Action ở repo public tự bị tắt sau 60 ngày không có commit, nên cũng không phải giải pháp "đặt rồi quên".
  - *Rủi ro còn lại:* chưa kiểm chứng request từ Edge Function có được tính hay không.
    - Nếu chủ app nghỉ dùng cả hai app hơn một tuần mà Supabase không tính các request đó, project sẽ bị dừng. Khi đó Hôm Nay vẫn chạy trên máy, nhưng thông báo ngừng.
    - Tín hiệu để xử lý là email cảnh báo. Cách làm đã ghi sẵn trong README.

### P0b: lỗi nghiêm trọng tìm thấy khi đánh giá ngày 18/10/2026 (chi tiết ở mục 5)
- [x] **Bịt XSS lưu trữ.** *(2.3.2)* Đã tái hiện: tạo danh mục tên `<img src=x onerror=alert(1)>` thì script chạy, rồi đồng bộ sang mọi máy. Một file sao lưu độc cũng làm được điều tương tự qua `workout.mins/sets`, `weight.kg`, `task.time`, `class.start/end/credits`, `customCats`.
  - Escape mọi chỗ nội suy, kể cả nhãn trong `pills()` (`app.js` khoảng dòng 1010).
  - Thêm `normalize(kind, data)` chạy trong `mergeRemote`, `mergeBackup` và lúc nạp `db`: ép số cho các trường số, kiểm tra định dạng giờ (`HH:MM`) và ngày (`YYYY-MM-DD`).
  - Thêm CSP bằng `<meta>`.
  - *Xong khi:* kiểm thử nạp một file sao lưu độc, đi qua mọi tab và form, và không có script nào chạy.
  - *Đã làm (2.3.2):* ba lớp, mỗi lớp tự đứng được.
    - **Escape khi vẽ:** sửa 15 chỗ (giờ trong chương trình ngày, emoji và tên danh mục, `pills()`, phút tập, cân nặng, tín chỉ); `exTotal` và `sessionSummary` ép số.
    - **`normalize(kind, data)`** chạy lúc nạp `db`, trong `mergeRemote` và `mergeBackup`. Hàm chỉ sửa giá trị sai của trường đang có (số → số, ngày → `YYYY-MM-DD`, giờ → `HH:MM`, khóa danh mục tự tạo → `c[0-9a-z]+`) và không bump `updated_at`, nên không sinh đồng bộ thừa.
    - **CSP `<meta>`** trong `index.html`.
  - *Kiểm thử:* phát hiện thẻ bị chèn vào DOM bằng `MutationObserver`, không dựa vào `onerror`, nên vẫn bắt được lỗi escape khi đã có CSP. Có 4 đường: giao diện, file sao lưu, ghi thẳng vào `db`, dữ liệu cũ trong localStorage. Thêm kiểm tra không có vi phạm CSP và vẫn tải được supabase-js từ jsdelivr.
  - *Đánh đổi:* CSP để `style-src 'unsafe-inline'` vì giao diện dùng nhiều `style="..."` trong HTML sinh ra. Điều này không mở đường cho script.
- [x] **Bộ nhớ đầy thì không được mất dữ liệu.** *(2.3.3)* Hiện `LS.set` nuốt lỗi, nên việc vừa thêm vẫn hiện trên màn hình nhưng biến mất sau khi reload và không bao giờ lên server.
  - `LS.set` trả về đúng/sai.
  - Khi gặp `QuotaExceededError` thì hiện banner "Bộ nhớ đầy, hãy Tải bản sao lưu".
  - Gọi `navigator.storage.persist()`.
  - *Đã làm (2.3.3):*
    - `LS.set` trả về đúng/sai. `persist()` ghi `queue` trước rồi mới tới `db`, để hàng chờ đồng bộ có nhiều khả năng còn lại sau khi reload.
    - Ghi không được thì hiện banner `#storewarn` (`role=alert`, nằm trên cùng, không tự ẩn) kèm nút "Tải bản sao lưu" (`data-act=export`). Dữ liệu vẫn giữ trong RAM và vẫn đồng bộ lên server; lần ghi sau thành công thì banner tự ẩn.
    - `start()` xin `navigator.storage.persist()`.
  - *Còn lại:* chưa tự giải phóng chỗ trống. Cách bền vững là dọn tombstone (P1) và chuyển sang IndexedDB.
- [x] **Cập nhật service worker an toàn.** *(2.3.4)* `sw.js` bỏ qua lỗi tải từng file khi cài rồi xóa cache cũ, nên chỉ cần một file lỗi 500 lúc cài là app trắng trang khi offline.
  - Dùng `cache.addAll` bắt buộc cho các file cùng origin.
  - Chỉ cho phép lỗi với CDN và fonts.
  - *Đã làm (2.3.4):*
    - File cùng origin cài bằng `addAll`: một file lỗi là cả lần cài thất bại, cache dở dang bị xóa, SW cũ tiếp tục chạy và trình duyệt tự thử lại lần sau.
    - Thư viện CDN vẫn tải theo kiểu cố gắng.
    - `fetch` không thấy file trong cache hiện tại thì tìm tiếp trong mọi cache.
  - *Kiểm thử:* `smoke.py` chép repo sang thư mục tạm, cài SW, phát hành bản mới mà `app.js` trả 500, rồi kiểm tra cache cũ còn và offline vẫn chạy. Bản mới bình thường thì cài được và cache cũ bị dọn.
- [x] **Phía server:** *(code xong ở 2.3.5; chờ chạy `push.sql`, `setup.sql` và deploy hàm. Tắt đăng ký tài khoản mới là việc của chủ app trong Dashboard)* chỉ cho `push_subs.endpoint` là URL của dịch vụ push thật (FCM, Apple, Mozilla, Windows), vì hiện hàm sẽ POST tới URL bất kỳ. Tắt đăng ký tài khoản mới trong Supabase Auth nếu app chỉ dùng một mình. Giới hạn kích thước `hn_items.data`.
  - *Đã làm (2.3.5):*
    - `hn-push` có `pushEndpointOk()`: chỉ chấp nhận https tới `fcm.googleapis.com`, `*.push.apple.com`, `updates.push.services.mozilla.com`, `*.notify.windows.com`, không có port hay user. Endpoint lạ thì xóa đăng ký và không gửi.
    - Ràng buộc `push_subs_endpoint_push` trong `push.sql` dùng cùng danh sách đó (`not valid`).
    - Ràng buộc `hn_items_data_size` trong `setup.sql`: mỗi bản ghi dưới 256KB.
    - App báo lỗi `23514` khi bật thông báo bằng câu tiếng Việt.
  - *Đánh đổi:* một bản ghi vượt 256KB sẽ làm cả lô `hn_push` chứa nó thất bại, và lần nào đồng bộ cũng báo lỗi cho tới khi bản ghi đó được sửa. Thực tế khó xảy ra (256KB tương đương khoảng một quyển sách chữ thường), nhưng nếu gặp thì đây là chỗ đầu tiên cần xem.

### P1: hiệu năng
- [ ] **Chỉ mục theo `kind`.** Giữ `byKind = Map(kind → mảng)` và cập nhật trong `put/remove/restore/mergeRemote`. `all(kind)` trả về mảng có sẵn. Cache `getSetting` theo key.
  - *Xong khi:* với 5.000 khoản chi và 500 việc giả lập, `render()` ở tab Tiền và tab Lịch dưới 16ms trên Chromium (đo bằng `performance.now()` trong `tests/`).
- [ ] **Ghi xuống bộ nhớ theo đợt.** Gộp các lần `persist()` lại (dùng `requestIdleCallback` hoặc 300ms), và luôn ghi ngay khi `visibilitychange` chuyển sang hidden.
- [ ] **Dọn tombstone.** Xóa hẳn bản ghi `deleted` đã được server xác nhận quá 60 ngày, ở cả máy lẫn server. Phía server dùng một job pg_cron.
- [ ] **Cân nhắc chuyển `db` sang IndexedDB** khi dữ liệu vượt khoảng 2MB. Giữ nguyên API `put/all`.
- [ ] **Giữ vị trí cuộn và focus khi vẽ lại.** Cách tối thiểu: lưu `scrollY` cùng phần tử đang focus (theo `name` hoặc `data-*`) rồi khôi phục sau `render()`.

### P2: trải nghiệm
- [ ] **Nhắc đẩy cho lịch học,** tùy chọn "trước 15 phút vào lớp". Hàm `hn-push` cần đọc thêm `kind='class'` và tính buổi học theo `days`, `weeks`, `absent`.
- [x] **Chuyển Tháng → Tuần thì mở đúng tuần của ngày đang chọn.** *(nhóm 4, `calWeekOf`)*
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

## 5. Đánh giá 18/10/2026 (bản 2.3.1, ba góc nhìn)

Ba lượt đánh giá độc lập: thiết kế UX/UI, kỹ thuật frontend, trải nghiệm người dùng. Cả ba đều chạy app thật bằng Playwright, đo số liệu và chụp ảnh. Ảnh và script nằm trong scratchpad của phiên, không đưa vào repo. Những điểm đã có trong mục 2 không lặp lại ở đây.

**Điểm (/10):**

| Góc nhìn | Điểm |
|---|---|
| Thiết kế | thị giác 6, bố cục di động 6,5, nhất quán 5,5, cảm giác cao cấp 5 |
| Kỹ thuật | hiệu năng 5, trợ năng 4, PWA/offline 6, bảo mật 4, code 6 |
| Trải nghiệm | lần đầu 6, hằng ngày 7, ghi nhanh 6, chữ 7,5, giữ chân 5,5 |

### Nghiêm trọng (an toàn): xem P0b
XSS lưu trữ, mất dữ liệu khi bộ nhớ đầy, service worker cập nhật hỏng, endpoint push tùy ý.

### Ghi nhanh và nhập tiền (ảnh hưởng hằng ngày)
- **`parseMoney` không hiểu "2tr5", "1tr2", "2 củ".** Kết quả là 0, nên form chi tiêu báo "Nhập số tiền", còn ngân sách từng loại bị bỏ âm thầm. Trong khi đó câu gợi ý trên trang Hôm nay lại dạy người dùng gõ "2tr5". Sửa: dùng chung bộ đọc số tiền với `parseQuick`. *(đã sửa: `findMoney()` trong `app.js` dùng chung cho `parseMoney` và `parseQuick`; ngân sách gõ sai thì báo; form việc và ngân sách điền lại số không làm tròn qua `moneyEdit()`)*
- **`parseQuick` hiểu sai** (thử khoảng 90 câu): *(đã sửa cả 9 điểm, khóa bằng 85 câu mẫu trong `tests/quick_cases.py`)*
  - "mùng 5" không được nhận là ngày;
  - "thứ 2 tuần sau" bị bắt nhầm thành "lặp 2 tuần";
  - "ngày 20 trả góp", vì lookahead coi chữ "trả" là đơn vị "tr";
  - "12tr500" không được nhận là tiền;
  - "1 trăm rưỡi" ra 1.000đ;
  - "mẹ chuyển", "bán … được", "X trả nợ" bị ghi thành chi thay vì thu;
  - "tối qua", "hqua", "hôm kia" không được nhận là ngày;
  - việc chỉ có giờ thì không có ngày, nên không lên lịch và không được nhắc;
  - "a, b" không được tách thành 2 khoản.
- **Dòng xem trước chỉ có nút Lưu.** Nên bấm vào dòng để mở form đã điền sẵn, có nút đổi nhanh Chi ⇄ Thu, và giữ chọn ô nhập sau khi lưu. *(đã sửa)*
- *Ghi chú khi sửa (nhóm 2):*
  - Chữ số dính sau đơn vị là phần lẻ: 2tr5 = 2,5tr, 2tr45 = 2,45tr, 12tr500 = 12,5tr. "trăm" là trăm nghìn. Số đứng riêng sau "triệu" ("2 triệu 5") chỉ được cộng khi chữ sau nó không phải từ chỉ số lượng, giờ, ngày.
  - `parseQuick` vẫn trả về một đối tượng; câu nhiều khoản trả khoản đầu kèm `items` (cả danh sách), nên chỗ gọi cũ chỉ đọc `kind/data` không vỡ. Chỉ tách khi mọi đoạn đều là khoản tiền, để tên việc có dấu phẩy không bị cắt. "và" chỉ dùng để tách khi cả hai bên đều có tiền.
  - "X chuyển/gửi/cho" chỉ tính là thu khi X là người thân, sếp, khách… ("tôi chuyển mẹ" vẫn là chi). "X trả nợ" là thu khi X không phải tôi/mình/em/anh.
  - Bấm dòng xem trước thì đoạn câu đó rời ô ghi nhanh ngay lúc mở form (không đợi lưu). Đánh đổi: đóng form không lưu thì mất đoạn đó, đổi lại không phải sửa hàm lưu của từng form.
  - Nút Lưu ở dòng xem trước trong chế độ tối trước đây là chữ trắng trên nền sáng; đã gán `--c/--on-c` riêng.
  - Còn để nguyên: "lít/xị" vẫn là 100k ("2 lít xăng" thành 200k), "35đ" ở ô ghi nhanh là 35đ còn ở ô nhập tiền là 35.000đ như trước.

### Thiết kế
- **Tương phản không đạt WCAG:**
  - chữ trắng trên `--gym` ở chế độ tối 1,88, trên `--money` 2,04, trên `--task` 2,97; ở chế độ sáng `--money` 3,01;
  - chip `money` 2,74; chữ `--warn` 3,01;
  - viền vòng đánh dấu xong 1,25.
  - Sửa: thêm token `--on-accent` (tối `#111216`); làm đậm màu nhấn ở chế độ sáng, ví dụ `--money: #A35A00`, `--gym: #0B7F3E`, `--cls: #1A66D6`.
  - *(đã sửa)* `--on-accent` (sáng `#FFF`, tối `#111216`), `--ring` (sáng `#868B98`, tối `#6B7180`); chế độ sáng `--money`/`--warn` `#A35A00`, `--gym` `#0B7F3E`, `--cls` `#1A66D6`, `--danger` `#C9282E`, `--mut` `#626777`. Số đo sau: chữ trên nền màu nhấn ≥ 5,04 (sáng) và ≥ 6,3 (tối); chip `money` 4,76; `--warn` 5,22; viền vòng 3,41 / 3,45. `smoke.py` đo bằng `getComputedStyle` ở sáng, tối theo máy và tối chọn tay.
- **Vùng bấm dưới 44px:** `.check` 24px (thao tác chính), `.icon-btn` 38px, mũi tên tháng 36px, `.seg` cao 34px, `.link` cao 19px. *(đã sửa: tất cả ≥ 44px ở 320px; `.check` vẫn hiện vòng 24px bằng `::before`, `.icon-btn` vẽ ô bằng `::before`, `.link` dùng lề âm để không làm dòng cao thêm)*
- **Trạng thái "đang chọn" bị ngược:** pill đang chọn trông nhạt hơn pill chưa chọn; ô đang chọn của `.seg` ở chế độ tối có tương phản 1,13. *(đã sửa: `.seg` đang chọn đảo màu `--fg`/`--bg`, pill đang chọn tô đặc màu nhấn; `aria-pressed` tự khớp với class `on`)*
- **Form việc và form chi tiêu dài, nút Lưu nằm dưới đáy màn hình.** Sửa: footer dính đáy; các trường ít dùng cho vào nút "Thêm chi tiết"; danh mục chi tiêu dạng lưới 4 cột. *(đã sửa: `.sheet-foot` dính đáy, tôn trọng safe-area; bàn phím ảo được bù bằng biến `--kb` tính từ `visualViewport`; `<details class="more">` mở sẵn khi trường bên trong đã có giá trị; `.catgrid` 4 cột vừa 320px. Đánh đổi: ngày của khoản chi nằm trong "Thêm chi tiết", dòng tóm tắt ghi "Ngày: hôm nay" để không bị quên)*
- **Lịch tháng bị tiết học lặp lại lấn át:** 6 trên 7 tên môn bị cắt, chữ 9,5px. Sửa: tiết học chỉ hiện thành chấm màu, chip dành cho thi và hạn nộp. *(đã sửa: chấm `.cdots`, tối đa 2 chip rồi "+n", chữ trong lưới ≥ 11px)*
- **Trang Hôm nay:** việc gấp đầu tiên nằm ở khoảng y=690 và có 3 lối thêm trùng nhau. Tiêu đề thẻ viết hoa có dấu khó đọc. App dùng tới 11 cỡ chữ. *(đã sửa: bỏ viết hoa; thang 6 cỡ `--fs-xs…--fs-xxl` = 11/13/15/18/22/32px, ô nhập giữ 16px; bỏ hàng 3 nút thêm nhanh vì trùng ô gõ nhanh và nút +. Chưa đổi thứ tự thẻ để đẩy việc gấp lên cao)*

### Trải nghiệm
- **"Sắp tới hạn" chỉ nhìn 3 ngày,** nên hạn nộp 5 ngày nữa vừa thêm thì biến mất khỏi trang Hôm nay. *(đã sửa: 7 ngày)*
- **Lịch tuần vào tối Chủ nhật vẫn mở tuần đã qua;** chuyển từ Tháng sang Tuần cũng không theo ngày đang chọn. *(đã sửa: `calWeekReset()` mở tuần tới từ 18h Chủ nhật; `calWeekOf(d)` khi đổi Tháng → Tuần, và Tuần → Tháng chọn lại đúng ngày)*
- **Dự báo chi cả tháng tính cả tiền nhà, tiền điện,** nên báo "vượt ngân sách" sai. *(đã sửa: `monthForecast()` tính riêng khoản cố định (loại Nhà cửa, Điện thoại/internet, khoản trả từ việc, ghi chú kiểu tiền nhà/điện/nước/internet/học phí/trả góp, trùng tên việc lặp lại), chỉ ngoại suy phần còn lại. Đánh đổi: nhận diện theo từ khóa nên khoản cố định ghi chú lạ vẫn bị ngoại suy)*
- **Lần đầu dùng:** *(đã sửa cả ba: "Để sau" lưu hồ sơ `other`, máy cũ chưa có hồ sơ vẫn là sinh viên; chữ trong form việc và tab Việc đổi theo `isStudent()`; form môn học của học sinh dùng giờ phổ thông tiết 1-3 và chữ không nhắc MyBK)*
  - bấm "Để sau" thì app ngầm chọn Sinh viên;
  - người đi làm vẫn thấy "Môn / nhóm", "BTL";
  - học sinh vào form môn học có giờ của Bách khoa.
- **Đổi hồ sơ trong Cài đặt thì Lịch học tự tắt,** không hỏi trước. *(đã sửa: giữ nguyên các mục đang bật, thông báo có nút "Tắt/Bật Lịch học" khi hồ sơ mới thường dùng khác)*
- **Dán Lịch thi xong thì bị đẩy sang tab Việc;** dòng bài thi lặp tên môn ba lần. *(đã sửa: ở lại tab Lịch, chỉ có lịch thi thì mở dạng Tháng ở ngày thi gần nhất; chip môn ẩn khi tên việc đã chứa tên môn; ghi chú không lặp mã môn khi tên môn trống; bộ đọc Lịch thi không còn lấy nhầm "CK" làm tên môn)*
- **`placeholder="—"` ở ô ngân sách từng loại** dùng đúng ký tự gạch ngang dài mà quy tắc cấm. *(đã sửa: "Không đặt"; kiểm thử quét mọi màn hình và sheet không còn "—")*

### Kỹ thuật khác
- **Hiệu năng** (5.834 bản ghi, CPU chậm 4x):

  | Thao tác | Thời gian |
  |---|---|
  | `render()` tab Việc | 862ms |
  | `render()` Lịch tháng | 766ms |
  | `applyPersona` | 1,1 giây |

  Nguyên nhân: `getSetting` được gọi 95 lần và `db` bị quét toàn bộ 97 lần mỗi lần vẽ. Khởi động không phải nút cổ chai (script chỉ 26ms với dữ liệu nhỏ), khác với điểm 4 ở mục 2. Hướng sửa là P1 "Chỉ mục theo kind" cộng thêm `batch()`.
- **Lần vẽ đầu tiên chờ supabase-js và Google Fonts từ CDN:** CDN chậm 3 giây thì nội dung đầu tiên hiện sau 3 giây. Script CDN không có SRI.
- **Sheet chưa phải modal:** không đóng bằng Escape, Tab thoát ra nền phía sau, không trả focus về chỗ cũ. Thiếu `aria-pressed`, `role=switch`, nhãn cho ô nhập. Có 18 dòng bấm được nhưng là `div`.
- **ICS (`app.js` khoảng dòng 2012):** trong JS phải viết `"\\;"` mới ra `\;`, còn code đang viết `"\;"` nên chỉ ra `;`, nghĩa là dấu chấm phẩy không được escape. Dòng lại được gập theo số ký tự thay vì 75 byte như RFC 5545.

### Thứ tự đề xuất
1. **P0b:** XSS, bộ nhớ đầy, service worker.
2. **Bộ đọc tiền và ngày:** sửa rồi khóa lại bằng bộ câu kiểm thử.
3. **Token màu đạt WCAG và vùng bấm 44px:** khoảng 20 dòng CSS.
4. **Form gọn có nút Lưu dính đáy;** "Sắp tới hạn" nhìn 7 ngày.
5. **P1 hiệu năng.**

## 4. Cách kiểm tra một thay đổi

1. Chạy `node -e "new Function(require('fs').readFileSync('app.js','utf8'))"` để bắt lỗi cú pháp.
2. Chạy `python3 tests/smoke.py`: tất cả phải PASS, không có lỗi `pageerror`.
3. Chụp màn hình ở 393px và 320px, cả sáng lẫn tối, rồi tự xem lại.
4. Tăng `APP_VERSION` và `VERSION` trong `sw.js`, rồi đẩy lên `main`.
5. Mở bản đang chạy, xem phiên bản ở cuối Cài đặt.
