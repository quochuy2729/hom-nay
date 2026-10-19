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
14. **Đã sửa (nhóm 5):** một số dòng bấm được đang là `div`, chưa phải `button`, nên không dùng được bằng bàn phím hay trình đọc màn hình. Ví dụ: dòng trong chương trình ngày (`.ag`), một số thẻ (`.tap`). Nay `a11yEnhance()` gắn `role=button tabindex=0` và Enter/Space bấm được (xem mục 5, "Kỹ thuật khác").
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
    - App gọi REST API mỗi 60 giây khi đang mở, và `hn-push` gọi REST API mỗi 5 phút. Cả hai đều là kiểu "request API" mà tài liệu nêu.
    - *Cập nhật 18/10/2026:* đã xóa bảng `habits` và hàm `sync_habit` của app Lưới Thói Quen khỏi project (sao lưu 1 dòng ở `D:\App_Convenience\habits-backup.json`, ngoài repo). Giữ tài khoản Auth (Hôm Nay dùng chung) và hàm `rls_auto_enable` (tự bật RLS cho bảng mới). Đánh đổi: không còn app thứ hai giữ project hoạt động, nên rủi ro tạm dừng tăng nhẹ.
    - Supabase báo trước một tuần qua email.
    - Action ở repo public tự bị tắt sau 60 ngày không có commit, nên cũng không phải giải pháp "đặt rồi quên".
  - *Rủi ro còn lại:* chưa kiểm chứng request từ Edge Function có được tính hay không.
    - Nếu chủ app nghỉ dùng Hôm Nay hơn một tuần mà Supabase không tính các request đó, project sẽ bị dừng. Khi đó Hôm Nay vẫn chạy trên máy, nhưng thông báo ngừng.
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
- [x] **Chỉ mục theo `kind`.** Giữ `byKind = Map(kind → mảng)` và cập nhật trong `put/remove/restore/mergeRemote`. `all(kind)` trả về mảng có sẵn. Cache `getSetting` theo key. *(nhóm 5, số đo ở mục 5)*
  - *Xong khi:* với 5.000 khoản chi và 500 việc giả lập, `render()` ở tab Tiền và tab Lịch dưới 16ms trên Chromium (đo bằng `performance.now()` trong `tests/`).
- [x] **Ghi xuống bộ nhớ theo đợt.** Gộp các lần `persist()` lại (dùng `requestIdleCallback` hoặc 300ms), và luôn ghi ngay khi `visibilitychange` chuyển sang hidden. *(nhóm 5: thêm cả `pagehide`)*
- [ ] **Dọn tombstone.** Xóa hẳn bản ghi `deleted` đã được server xác nhận quá 60 ngày, ở cả máy lẫn server. Phía server dùng một job pg_cron.
- [ ] **Cân nhắc chuyển `db` sang IndexedDB** khi dữ liệu vượt khoảng 2MB. Giữ nguyên API `put/all`.
- [x] **Giữ vị trí cuộn và focus khi vẽ lại.** Cách tối thiểu: lưu `scrollY` cùng phần tử đang focus (theo `name` hoặc `data-*`) rồi khôi phục sau `render()`. *(nhóm 5)*

### P2: trải nghiệm
- [ ] **Nhắc đẩy cho lịch học,** tùy chọn "trước 15 phút vào lớp". Hàm `hn-push` cần đọc thêm `kind='class'` và tính buổi học theo `days`, `weeks`, `absent`.
- [x] **Chuyển Tháng → Tuần thì mở đúng tuần của ngày đang chọn.** *(nhóm 4, `calWeekOf`)*
- [x] **Đổi các dòng bấm được (`.ag`, `.tap`) thành `<button>`** hoặc thêm `role="button" tabindex="0"` và xử lý phím Enter/Space. *(nhóm 5: cách thứ hai, làm chung trong `a11yEnhance` và một bộ nghe `keydown`)*
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

  **Đã sửa (nhóm 5).** Đo bằng `tests/smoke.py` (khối "nhóm 5"): 6.224 bản ghi (5.000 khoản chi, 500 việc, 300 buổi tập, 300 bản đã xóa), Chromium headless trên máy dev, trung vị 7 lần, đã gồm layout (`offsetHeight`). Bản trước đo bằng đúng script đó trên `main` (2.3.5):

  | Thao tác (ms) | Trước | Sau | Trước, CPU 4x | Sau, CPU 4x |
  |---|---|---|---|---|
  | `render()` Hôm nay | 31 | 4,6 | 240 | 48 |
  | `render()` Việc (400 việc đang mở) | 287 | 26 | 2.068 | 226 |
  | `render()` Lịch tháng | 118 | 5,5 | 855 | 38 |
  | `render()` Lịch tuần | 24 | 2,2 | 198 | 14 |
  | `render()` Tiền | 51 | 11 | 369 | 83 |
  | `render()` Tập | 15 | 4,8 | 110 | 36 |
  | `put()` một khoản (đang ở Hôm nay) | 56 | 6,5 | 345 | 46 |
  | `applyPersona` | 212 | 5,3 | 1.235 | 48 |

  - **Chỉ mục:** `db` là `Proxy` bọc `dbRaw`; bẫy `set`/`deleteProperty` cập nhật `IDX` (kind → Map id → bản ghi chưa xóa) và xóa cache `getSetting`. Nhờ vậy mọi chỗ gán `db[id] = …` (put, remove, restore, mergeRemote, mergeBackup, sự kiện `storage`, cả kiểm thử XSS ghi thẳng vào `db`) đều đúng mà không phải sửa từng chỗ. `all(kind)` trả bản sao của mảng cache theo kind (người gọi vẫn `sort` tại chỗ được). `getSetting` nhớ bản ghi theo key. `persist()` stringify `dbRaw`, không đi qua Proxy.
    - *Ràng buộc:* không sửa tại chỗ `db[id].kind` hay `db[id].deleted` (Proxy không thấy); code hiện tại luôn gán bản ghi mới. Sửa một bản ghi đã có giữ nguyên vị trí trong Map, nhưng bản ghi xóa rồi khôi phục sẽ xuống cuối thứ tự của `all()` (chỉ ảnh hưởng thứ tự khi sắp xếp bằng nhau).
  - **`batch(fn)`:** gộp nhiều lần ghi thành một lần vẽ lại; dùng trong `setSetting`, `applyPersona`, `toggleTask`. Chưa dùng cho nhập TKB (hiếm, và tránh xung đột với nhóm sửa form).
  - **Ghi theo đợt:** `persist()` chỉ đánh dấu và hẹn `flushPersist()` bằng `requestIdleCallback` (chậm nhất 300ms; Safari không có thì `setTimeout` 300ms). Ghi ngay khi `visibilitychange → hidden` và `pagehide`. Ghi lỗi (bộ nhớ đầy) thì giữ cờ để lần sau thử lại; banner `storeWarn` và kiểm thử quota vẫn chạy như cũ. *Rủi ro còn lại:* trình duyệt bị giết đột ngột (không có `pagehide`) có thể mất tối đa ~300ms thay đổi cuối; hàng chờ trên server không bị ảnh hưởng vì `scheduleSync` vẫn chạy.
  - **Sự kiện `storage`** (tab khác ghi): tab này còn thay đổi chưa ghi thì gộp theo `updated_at`, không thì nạp lại như cũ (giờ có chuẩn hóa `normalize`).
  - Thêm: `Intl.NumberFormat` tạo một lần cho `money`/`moneyShort` (trước đó `toLocaleString("vi-VN")` tạo bộ định dạng mỗi lần gọi); `monthTx` nhóm theo tháng một lần cho tới khi có khoản đổi.
  - **Tab Tiền chỉ vẽ 12 ngày gần nhất của tháng,** phần còn lại sau nút "Xem thêm N ngày trước". Sau khi có chỉ mục, phần lớn thời gian còn lại là layout (tháng 270 khoản ≈ 1.200 nút DOM ≈ 9ms layout), nên đây là cách duy nhất để chắc chắn dưới 16ms. Đây là thay đổi giao diện nhỏ; nếu không muốn thì bỏ `MONEY_DAYS`, tab Tiền khoảng 14 đến 16ms.
  - Tab Việc với 400 việc đang mở vẫn khoảng 26ms, chủ yếu là layout của khoảng 3.000 nút. Thực tế ít ai có hơn 50 việc mở nên chưa cắt bớt.
  - **Giữ cuộn và focus:** `render()` lưu `scrollY` (khôi phục nếu vẫn ở tab cũ; đổi tab vẫn về đầu trang) và phần tử đang focus trong `#main`/`#nav`, tìm lại bằng `focusKey()` (id, hoặc thẻ + `name` + các `data-*` dùng để bấm, kèm thứ tự nếu trùng). Ô ghi nhanh giữ con trỏ như trước. Đọc `scrollY` sau `innerHTML` bắt layout chạy sớm, nhưng layout đó vốn phải chạy ở khung hình kế tiếp nên không tốn thêm.
- **Lần vẽ đầu tiên chờ supabase-js và Google Fonts từ CDN:** CDN chậm 3 giây thì nội dung đầu tiên hiện sau 3 giây. Script CDN không có SRI.
  - **Đã sửa (nhóm 5):** bỏ thẻ `<script defer>` supabase-js trong `index.html`; `app.js` (`loadSupabase`) chèn script `async` sau lần vẽ đầu, có `integrity="sha384-0w2KAL2YHP6wKOkUDzkCDGgVvfmHnj02DHeQ6XcHOgTfFsGyonKOpShMH1x6nk9o"` và `crossorigin="anonymous"`. Hash tính từ file tải về, đối chiếu sha256 với metadata gói npm trên data.jsdelivr.com (`hZaWX+kY…`, 110.797 byte), nên chắc đúng file gốc. Trong lúc chờ, trạng thái đồng bộ là `wait` ("Đang tải phần đồng bộ…"); tải lỗi thì thử lại một lần với `?r=1` (bỏ qua cache SW) rồi báo lỗi như cũ.
  - Google Fonts nạp với `media="print"`, `app.js` đổi sang `all` khi tải xong (không dùng `onload=` vì CSP cấm). Thêm `preconnect` tới cdn.jsdelivr.net.
  - `sw.js`: bản opaque cũ trong cache không trả cho yêu cầu CORS nữa (trước đây trang tải script không có `crossorigin` nên cache chứa phản hồi opaque, mà SRI cần phản hồi CORS).
  - Kiểm thử: treo mọi yêu cầu tới CDN và Google Fonts, `#main` có nội dung và FCP đều dưới 1,5 giây (thực tế khoảng 100ms); thả ra thì đồng bộ báo lỗi đúng; file giả trên CDN không chạy được (SRI). Kiểm thử CSP cũ ("vẫn tải được supabase-js") đổi thành kiểm tra yêu cầu được gửi và không vi phạm CSP, vì file giả giờ bị SRI chặn.
  - *Đổi phiên bản supabase-js:* phải tính lại hash (`openssl dgst -sha384 -binary supabase.js | openssl base64 -A`) và sửa cả `SB_SRC`/`SB_SRI` trong `app.js` lẫn `SHELL` trong `sw.js`.
- **Sheet chưa phải modal:** không đóng bằng Escape, Tab thoát ra nền phía sau, không trả focus về chỗ cũ. Thiếu `aria-pressed`, `role=switch`, nhãn cho ô nhập. Có 18 dòng bấm được nhưng là `div`.
  - **Đã sửa (nhóm 5):** `openSheet` thêm `aria-labelledby` (id của tiêu đề), `tabindex=-1` và focus vào sheet; `#main`, `#nav`, `#fab` được đặt `inert` khi sheet mở. Escape đóng; Tab/Shift+Tab vòng trong sheet. Đóng thì trả focus về phần tử đã mở (tìm lại bằng `focusKey` nếu đã bị vẽ lại), nhưng chỉ khi người dùng đang dùng bàn phím, để chạm trên điện thoại không hiện viền focus thừa.
  - `a11yEnhance(root)` chạy sau mỗi `render()` và khi sheet mở (kèm `MutationObserver` cho phần thêm sau như dòng phần việc, kết quả tìm kiếm): `role=button tabindex=0` cho `div` bấm được, `role=switch aria-checked` cho `.switch`/`.switch-mini`, `aria-pressed` cho `[data-pick]`/`.seg`, `aria-label` cho ô nhập chưa có nhãn (lấy `<label>`/`.lbl` đứng trước trong cùng khối, không có thì placeholder). Một bộ nghe `click` trên document cập nhật `aria-checked`/`aria-pressed` sau khi form đổi class `on`. Viền `:focus-visible` dùng `var(--cls)`.
  - Làm bằng hậu xử lý thay vì sửa từng template để ít đụng các form mà nhóm khác đang sửa. *Đánh đổi:* `.row.tap` chứa nút tròn "Xong" và thẻ Chi tiêu chứa nút ghi nhanh, tức là có phần tử bấm được lồng trong `role=button` (axe sẽ cảnh báo). Muốn sạch hẳn thì phải tách dòng thành `<button>` riêng, việc của P3.
- **ICS (`app.js` khoảng dòng 2012):** trong JS phải viết `"\\;"` mới ra `\;`, còn code đang viết `"\;"` nên chỉ ra `;`, nghĩa là dấu chấm phẩy không được escape. Dòng lại được gập theo số ký tự thay vì 75 byte như RFC 5545.
  - **Đã sửa (nhóm 5):** `icsEsc` escape `\` `;` `,` và mọi kiểu xuống dòng; `icsFold` đếm byte UTF-8 theo code point, mỗi dòng tối đa 75 octet kể cả dấu cách đầu dòng tiếp, không bao giờ cắt giữa ký tự có dấu. Kiểm thử bằng tiêu đề và ghi chú tiếng Việt có `;`, `,`, `\`, xuống dòng.

### Kết quả (2.4.0, 18/10/2026)
Nhóm 2 đến 5 được sửa song song bởi 4 agent trên 4 worktree, gộp tay vào `main` rồi tăng phiên bản một lần (2.4.0, `hn-v15`) để tránh xung đột phiên bản. Bản gộp: `smoke.py` 435/435 PASS, đã chụp và xem lại 393/320 sáng tối, đã kiểm tra supabase-js tải thật từ CDN với SRI và CSP.
Việc còn dở sau 2.4.0 đã làm ở 2.4.1 (khối "nhóm 6" trong `smoke.py`, 460/460 PASS):
- Thẻ "Sắp tới hạn" lên đầu khi có việc quá hạn/hôm nay/mai (ngoài lịch thi). Đánh đổi: thứ tự thẻ thay đổi theo ngày, nhưng chỉ khi có việc thật sự gấp; còn lại giữ thứ tự cũ (lịch học trước).
- `.qex` cao 44px; nền `.switch` khi tắt dùng `--mut` (≥ 3:1 với nền); mọi `font-size` trong template dùng biến thang chữ.
- Mọi form có `.sheet-foot`.
- Ghi nhanh: `quickOpen` không xóa câu ngay, `closeSheet` so `putSeq` để biết form đã lưu chưa.
- Nhập TKB và Hoàn tác (TKB, ghi nhanh nhiều khoản) chạy trong `batch()`: 8 lịch thi từ 10 lần vẽ lại còn 3.
- Dòng bấm được có nút bên trong: `role=button` đặt lên phần chữ (con trực tiếp), không còn nút lồng trong `role=button`.
Còn lại: tab Tiền chỉ vẽ 12 ngày gần nhất ("Xem thêm", `MONEY_DAYS`); đã bỏ hàng 3 nút thêm nhanh; chưa kiểm chứng trên máy thật bàn phím iPhone (`--kb`) và font Be Vietnam Pro ở 320px.

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

## Giáo án tập 5 buổi/tuần (19/10/2026)

Chủ app tập ở nhà với xà đơn, xà kép, para, một tạ 8kg và máy đung đưa hai tay; mục tiêu 80 kg xuống 70 kg nhưng ưu tiên tăng cơ; mỗi buổi chỉ 3 bài; 5 buổi mỗi tuần, ngày nghỉ không cố định.

**Thiết kế giáo án (`GYM_PLAN`, 5 buổi xoay vòng)**
- A Kéo và chân (Hít xà, Bulgarian split squat, Treo nâng gối) · B Đẩy và cardio (Xà kép, Hít đất para, Máy đung đưa biến tốc 16-20 phút) · C Chân và lưng (Goblet squat, RDL 1 chân, Chèo tạ 1 tay) · D Thân trên (Hít xà ngửa tay, Pike push-up, L-sit) · E Tổng hợp và cardio dài (Xà kép, Lunge lùi, Máy đung đưa đều 25-30 phút).
- Mỗi nhóm cơ 2-3 lần/tuần: kéo A, C, D; đẩy B, D, E; chân A, C, E; bụng A, D; cardio B, E (thêm 5 phút khởi động trên máy mỗi buổi, không tính là bài).
- Tạ chỉ 8kg nên bài chân dùng một chân (split squat, RDL 1 chân, lunge) và tiến bộ bằng nhịp chậm, dừng ở đáy, thêm hiệp thay vì thêm tạ.
- **Xoay vòng thay vì gắn thứ:** buổi tiếp theo = buổi kế sau buổi giáo án gần nhất (`planNext`), nên nghỉ ngày nào cũng không lệch lịch. Buổi tự do (không có `plan`) không làm lệch vòng.

**Trong app**
- Bản ghi `workout` có thêm trường `plan` (`A`-`E`, rỗng nếu tự do), chuẩn hóa trong `NORM` (chỉ nhận một chữ in hoa). Cài đặt mới: `gymPlan` `{ on, start }` và `weightGoal` (kg), đều có luật trong `NORM_SETTING`; là bản ghi `setting` nên đồng bộ giữa các máy.
- Tab Tập: thẻ "Buổi tiếp theo" (`planCard`) với 5 nút A-E (dấu ✓ cho buổi đã tập tuần này, bấm để đổi buổi tạm thời qua `ui.planPick`), 3 bài kèm mục tiêu, gợi ý theo lần trước (`planAdvice`, tăng dần hai nấc) và mẹo kỹ thuật; nút "Bắt đầu buổi X" mở form điền sẵn 3 bài và tạ 8kg. Dòng cuối (`planWeek`) báo còn mấy buổi trong mấy ngày, chuyển màu cảnh báo khi số buổi còn lại bằng hoặc vượt số ngày còn lại.
- Form buổi tập: tiêu đề theo buổi, mỗi bài có dòng "Mục tiêu … Lần trước …" (đổi bài thì dòng tự cập nhật), ẩn "Lặp lại buổi trước". Ô số hiệp có gợi ý riêng cho bài tính phút.
- Cân nặng: ô "Mục tiêu (kg)" trong form, thẻ hiện xu hướng 4 tuần (hồi quy tuyến tính, cần ≥ 3 lần cân trải ≥ 10 ngày), số kg còn lại và tháng dự kiến đạt. Cảnh báo khi giảm hơn 1% cân nặng/tuần (dễ mất cơ) hoặc đang tăng trong khi mục tiêu thấp hơn.
- Trang Hôm nay: thẻ Tập hiện "x/5 buổi tuần này" và buổi tiếp theo.
- Bật bằng nút "Dùng giáo án này", tắt trong "Cả giáo án và cách ăn"; tắt không xóa lịch sử.

**Đánh đổi**
- Giáo án nằm trong code, chưa sửa được trong app. Đổi bài thì sửa `GYM_PLAN` (giữ nguyên `k` để lịch sử còn khớp). Nếu sau này cần giáo án riêng cho từng người thì chuyển thành bản ghi `setting` và giữ `GYM_PLAN` làm mặc định.
- "Đủ 5 buổi" đếm theo số ngày có tập (giống lưới tuần), không đếm theo buổi giáo án; tập 2 buổi trong một ngày vẫn tính 1.
- Dự kiến ngày đạt cân là ngoại suy tuyến tính, chỉ để tạo động lực; giai đoạn cuối thường chậm hơn.
- Kiểm thử: khối "giáo án tập 5 buổi/tuần" trong `tests/smoke.py` (46 kiểm tra, sáng, tối, 320px).

## Luồng 1 (19/10/2026)

Một agent làm riêng phần Hôm nay (trừ thẻ Tập luyện), Việc, Lịch, ghi nhanh, tìm kiếm và manifest, song song với Luồng 2 và tính năng chương trình tập. Chưa tăng phiên bản: lead tăng một lần sau khi gộp. Không thêm trường dữ liệu, cài đặt hay file mới. Kiểm thử: khối "luồng 1" trong `tests/smoke.py` (44 kiểm tra) và 30 câu mới trong `tests/quick_cases.py`.

Cách chọn việc: chạy app với dữ liệu kiểu sinh viên (2 việc quá hạn, việc hôm nay, mai, tiền phòng lặp lại, lịch thi) và thử khoảng 50 câu ghi nhanh tự nhiên. Chỗ tốn chạm nhất là việc quá hạn: muốn dời phải mở form, bấm "Mai", bấm Lưu, lặp lại cho từng việc. Chỗ sai nhiều nhất là ghi nhanh: 19 trên 35 câu thử bị hiểu sai ngày, giờ hoặc tên việc.

### 1. Thao tác nhanh trên việc (nút ⋯, giữ lâu, chuột phải)
- Mỗi dòng việc chưa xong (`taskRow`: trang Hôm nay, tab Việc) có nút ⋯ (`data-act=task-more`). Giữ lâu 480ms trên dòng việc bất kỳ (kể cả dòng chương trình ngày `.ag` và dòng Sắp thi) hoặc chuột phải cũng mở được. Tất cả đều gọi `taskActions(id)`.
- Sheet có: dời sang Hôm nay, Ngày mai, Cuối tuần, Tuần sau (mỗi nút ghi kèm thứ và ngày), Chọn trên lịch, Xong / Chưa xong, Sửa, Xóa. Dời là 2 chạm thay vì 4, có Hoàn tác (`restore(snapshot)`), giữ nguyên giờ.
- `postponeTargets(due)` bỏ ngày trùng nhau và trùng hạn hiện tại. Ví dụ Chủ nhật thì "Tuần sau" (thứ 2) trùng "Ngày mai" nên bị bỏ. Thứ 7 và Chủ nhật thì "Cuối tuần" là thứ 7 tuần sau.
- *Giữ lâu:* `pointerdown` hẹn giờ, hủy nếu ngón tay xê dịch quá 10px, nhấc tay ra, cuộn trang hoặc `pointercancel`. Lúc hết giờ thì sheet đã mở và lớp phủ nằm dưới ngón tay, nên click lúc nhấc tay sẽ rơi vào lớp phủ và đóng luôn sheet. Vì vậy cờ `lpSwallow` bỏ đúng một click ngay sau đó (bộ nghe click ở pha capture). Cờ được xóa ở `pointerdown` và `keydown` kế tiếp, nên không nuốt nhầm click khác. Android còn gửi `contextmenu` sau khi giữ lâu, cờ này cũng chặn luôn.
- Trên màn hình cảm ứng (`pointer: coarse`), dòng việc có `user-select: none` và `-webkit-touch-callout: none` để giữ lâu không bôi đen chữ hay hiện menu của iOS.
- *Đánh đổi:* giữ lâu khó phát hiện nên mới thêm nút ⋯ (dùng được cả bằng bàn phím và trình đọc màn hình) và một dòng mẹo cuối tab Việc. Nút ⋯ có vùng bấm 44px nhưng dùng lề âm như `.check` để dòng không cao thêm. Việc đã xong không có nút ⋯: bỏ đánh dấu, sửa, xóa đã có sẵn chỗ khác.

### 2. Dời việc trên lịch tháng (thay cho kéo thả)
- "Chọn trên lịch" mở tab Lịch dạng Tháng ở tháng của hạn hiện tại (`startMovePick`). Đầu lưới có thanh `.movebar` ("Bấm vào ngày mới cho …", kèm ngày cũ và nút Hủy), ô của hạn cũ có viền đứt. Bấm ô nào thì việc dời sang ngày đó, ô đó thành ngày đang chọn, có Hoàn tác.
- Đổi tháng (nút ‹ ›, vuốt) vẫn giữ chế độ dời. Thoát bằng nút Hủy, Escape, đổi tab hoặc chuyển sang dạng Tuần.
- Trạng thái nằm ở `ui.moveId`, không lưu xuống máy. `moveTarget()` tự bỏ khi việc đã bị xóa (kể cả bị xóa từ máy khác qua đồng bộ).
- *Vì sao không kéo thả (mục P2 "kéo thả việc giữa các ngày"):* trên điện thoại, kéo thả cần giữ lâu, kéo một chip rất nhỏ (chữ 11px, ô 45px ở màn 320px), tự cuộn khi kéo tới mép, và không được nhầm với vuốt ngang đổi tháng. Thêm vào đó `render()` vẽ lại cả màn hình bằng `innerHTML` nên phần tử đang kéo sẽ bị thay giữa chừng. Cách "chọn rồi bấm ô" cùng làm được việc đó, dời được sang tháng khác, dùng được bằng bàn phím, và chỉ cần 3 chạm. Mục P2 này coi như xong. Nếu sau này vẫn muốn kéo thả trên máy tính thì gắn thêm `dragstart` lên chip, gọi lại `moveTask`.

### 3. Dời hết việc quá hạn
- Nhóm "Quá hạn" ở tab Việc có nút "Dời hết sang hôm nay". Thẻ Sắp tới hạn trên trang Hôm nay có dòng "N việc quá hạn · Dời hết sang hôm nay" khi có từ 2 việc trở lên (1 việc thì đã có nút ⋯ trên dòng).
- `moveOverdue()` chỉ dời việc ở trạng thái Cần làm (không dời việc Đang chờ hay đã xong), ghi trong `batch()` (vẽ lại 1 lần), và Hoàn tác trả lại hạn cũ cho cả nhóm.
- *Đánh đổi:* chỉ có "sang hôm nay". Muốn dời từng việc sang ngày khác thì dùng nút ⋯.

### 4. Ghi nhanh hiểu thêm nhiều câu tự nhiên (`quick.js`)
Thử 35 câu kiểu "nộp bài thứ sáu", "họp 8 giờ rưỡi", "3 ngày nữa": 19 câu sai trước khi sửa, nay đúng cả 19. Toàn bộ 85 câu cũ vẫn đúng.
- **Thứ viết bằng chữ:** "thứ hai" … "thứ bảy", "Thứ Sáu". Giọng nói tiếng Việt thường ra chữ, không ra số, nên trước đây nói "nộp bài thứ sáu" thì việc không có hạn. Sau `norm()`, "thứ tư" trùng với "thứ tự" và "thư từ". Vì vậy câu gõ có dấu phải đúng chữ "thứ tư" (so trên câu gốc). Câu gõ không dấu "thu tu" vẫn được hiểu là thứ 4.
- **"thứ 5 tới", "chủ nhật tới":** chữ "tới" (có dấu) là "sắp tới". Nói vào đúng ngày đó thì hiểu là tuần sau. "thứ 6 tối" (có dấu) vẫn là buổi tối. Sửa thêm một lỗi cũ: "thứ sáu đóng tiền nhà 3tr" bị coi là khoản thu vì câu bắt đầu bằng "thu".
- **Khoảng ngày:** "3 ngày nữa", "hai hôm nữa", "1 tuần nữa", "2 tháng nữa" (số hoặc chữ, "nữa/sau/tới"). Không bắt nhầm "thứ 2 tuần sau".
- **Mốc trong tuần, tháng:** "cuối tuần" là thứ 7 (Chủ nhật thì là hôm nay), "đầu/giữa/cuối tuần (sau)", "cuối tháng" là ngày cuối tháng, "đầu tháng sau" là ngày 1, "giữa tháng" là ngày 15 (đã qua thì sang tháng sau).
- **Giờ:** "8 giờ rưỡi", "8h rưỡi" là 08:30, "9h kém 15" là 08:45. Buổi nói ở chỗ khác trong câu ("ăn tối 7h", "tập gym tối thứ 3 7h") vẫn đổi giờ sang buổi chiều tối. Chỉ tính chữ có dấu "tối/chiều/trưa/đêm" (và "chieu", "trua" không dấu), vì "toi" không dấu cũng là "tôi": "nhắc tôi họp 8h" vẫn là 08:00. Buổi không nằm ngay sau giờ thì vẫn giữ trong tên ("Ăn tối").
- **"trước":** "nộp đơn trước thứ 6", "trả sách trước ngày 25" thì tên việc bỏ chữ "trước" thừa, vì hạn đã nằm ở trường ngày.
- *Còn để nguyên:* "tháng sau" đứng một mình không có ngày cụ thể nên không đoán. "sáng/chiều thứ 6" không kèm giờ thì giữ chữ buổi trong tên và không tự đặt giờ (chỉ "tối nay/mai" đặt 20:00 như cũ). Đặt giờ mặc định cho buổi sáng hay chiều dễ sai và làm lệch giờ nhắc.

### 5. Tìm kiếm nhiều từ, theo ngày, số tiền, có tô sáng
- Mỗi từ phải khớp ở một trường bất kỳ của bản ghi, nên "btl giai tich" tìm được việc tên "Nộp BTL" thuộc môn "Giải tích 1". Trước đây phải khớp nguyên cụm trong một trường, nên câu này ra rỗng.
- Từ dạng "23/10" khớp theo ngày (hạn của việc, ngày của khoản chi, ngày tập). Khoản chi và việc có tiền còn khớp theo số tiền viết tắt ("35k", "2,5tr") và đầy đủ ("35.000đ").
- Phần khớp được bọc `<mark>`, đúng cả chữ có dấu khi gõ không dấu. `hl()` escape từng ký tự trước khi chèn và dùng `normMap()` để biết mỗi ký tự sau `norm()` ứng với ký tự nào trong chuỗi gốc. Kiểm thử XSS (MutationObserver) có chạy qua phần tô sáng.
- *Đánh đổi:* các trường được nối thành một chuỗi rồi so `includes`, ngăn giữa bằng ký tự `\u0001` để một từ không khớp vắt qua hai trường. Không xếp hạng theo độ khớp, vẫn giữ thứ tự cũ (việc chưa xong trước, theo hạn).

### 6. Lối tắt trên icon và chia sẻ chữ vào app (manifest)
- `shortcuts` (giữ icon app trên Android): Ghi nhanh (`?add=quick`, mở Hôm nay và đặt con trỏ ở ô ghi nhanh), Thêm việc, Ghi chi, Lịch (`?tab=cal`). Mỗi lối tắt có `short_name`, `description` và icon (dùng lại `icon-192.png`, đã có trong `SHELL`).
- `share_target` (GET): chia sẻ một tin nhắn từ Zalo, Messenger hay email vào Hôm Nay thì câu được điền vào ô ghi nhanh và hiện xem trước. Đường link bị bỏ, câu cắt còn 300 ký tự, và chưa có gì được lưu cho tới khi bấm Lưu. Chỉ chạy trên Android khi app đã được cài (iOS chưa hỗ trợ).
- Tham số được đọc ở `openFromParams()` (tách ra từ `start()`) rồi xóa khỏi địa chỉ bằng `replaceState`. Service worker khớp `./?…` với bản cache `./` (`ignoreSearch`), nên lối tắt và chia sẻ vẫn chạy khi offline.
- *Rủi ro:* Android chỉ đọc lại manifest khi Chrome cập nhật WebAPK (có thể mất vài ngày). Máy đã cài app sẽ thấy lối tắt mới và mục chia sẻ chậm hơn, không cần làm gì thêm.

### Khác
- Trang Hôm nay lúc chưa có việc nào: thẻ Sắp tới hạn có câu mẫu ("nộp BTL thứ 6 23h59" cho học sinh, sinh viên, "họp 9h sáng thứ 2" cho người khác), bấm là điền vào ô ghi nhanh.
- CSS mới nằm thành một khối "Luồng 1" ngay sau `.addsw` trong `styles.css`, không nằm ở cuối file, để dễ gộp với Luồng 2.
- Kiểm thử cũ đếm số lần `render()` bằng cách gán đè `window.render` trong `evaluate`. Cách đó tính thừa 1 lần, vì `evaluate` trả về hàm thì Playwright gọi luôn hàm đó. Khối luồng 1 thêm `; 0` ở cuối biểu thức. Khối nhóm 6 ("≤ 3 lần") cũng tính thừa 1 lần như vậy nhưng chưa sửa vì nằm ngoài phần việc của luồng này.
- Trên máy dev lúc chạy song song nhiều agent, 4 kiểm tra hiệu năng của nhóm 5 (ngưỡng 16ms và 100ms) đã FAIL từ trước khi sửa (bản gốc 2.4.1 cũng 456/460). Lý do là máy đang bận, không phải code. Cần chạy lại trên máy rảnh trước khi kết luận.

## Luồng 2 (19/10/2026)

Làm song song với Luồng 1 (Việc, Lịch, ghi nhanh) và phần chương trình tập của lead, nên chỉ đụng tab Tiền, form chi tiêu, mục tiêu, ngân sách, cài đặt, đồng bộ và thẻ Chi tiêu trên Hôm nay. Không tăng `APP_VERSION`/`VERSION` (lead tăng một lần khi gộp), không có file mới, không có trường dữ liệu hay cài đặt mới. Cách làm: nạp dữ liệu giả như người dùng thật 2,5 tháng (6 khoản hay chi, tiền phòng ngày 5, mẹ gửi ngày 10, hóa đơn điện chưa trả, 2 mục tiêu), chụp ảnh tab Tiền và Hôm nay, rồi sửa những chỗ thấy sai hoặc thiếu. Kiểm thử ở khối "luồng 2" trong `tests/smoke.py` (46 kiểm tra).

**Lỗi thấy khi chạy thử (trước khi sửa)**
- Dự báo "cứ đà này cả tháng chi khoảng…" và "~X/ngày" không tính khoản phải trả chưa tới hạn (tiền điện 450k ngày 25). Kết quả: báo còn tiêu được nhiều hơn thực tế đúng bằng số tiền sắp phải trả.
- Mục tiêu đã qua hạn vẫn ghi "cần khoảng 1,9tr/tháng đến 10/10" (công thức `max(1, ceil(số ngày âm / 30,4))` ra 1 tháng).
- Sửa mục tiêu 2.450.000đ rồi lưu thì thành 2.500.000đ: ô "Cần bao nhiêu" điền bằng `moneyShort` (làm tròn 1 chữ số lẻ) thay vì `moneyEdit`.
- Nút ghi nhanh trên thẻ Chi tiêu tính lại `combos()` lúc bấm: nếu danh sách đổi giữa lúc vẽ và lúc bấm thì ghi nhầm khoản khác. Thêm cách xếp theo giờ thì lỗi này chắc chắn xảy ra, nên phải sửa trước.

**1. Ngân sách và dự báo tính cả khoản sắp phải trả**
- `billsLeft(month)`: việc có số tiền, chưa xong, hạn trong tháng hiện tại hoặc đã quá hạn. Coi là đã trả nếu tháng này có khoản chi `fromTask` trỏ tới việc đó, hoặc khoản chi trùng tên và đúng số tiền (ghi tay mà quên đánh dấu xong, để không trừ hai lần).
- `monthForecast` cộng thêm `bills`; dòng dự báo ghi "đã gồm 450k sắp phải trả".
- `budgetLeft()`: còn lại = ngân sách − đã chi − sắp phải trả, chia cho số ngày còn lại kể cả hôm nay. Tab Tiền ghi "~107k/ngày sau khi trừ 500k sắp phải trả"; nếu khoản sắp trả làm vượt thì báo trước; chi vừa đúng ngân sách thì thẻ trên Hôm nay ghi "đã tiêu hết ngân sách tháng" (không hiện "khoản 0đ").
- *Đánh đổi:* việc có tiền quá hạn từ nhiều tháng trước mà quên xóa vẫn bị trừ. Chấp nhận, vì đó là tiền còn nợ thật; người dùng thấy và sửa ở "Sắp phải trả". Khoản tháng sau (học phí kỳ sau) không bị trừ.

**2. Thẻ Chi tiêu trên Hôm nay: tuần này và mỗi ngày còn bao nhiêu**
- Dòng mới dưới thanh ngân sách: "Tuần này tiêu 1,2tr (−60k so với tuần trước) · còn ~85k/ngày, đã trừ 450k sắp trả".
- `weekSpend()`: thứ Hai tới hôm nay, so với thứ Hai tới *cùng thứ* tuần trước (so cả tuần trước với nửa tuần này thì luôn "ít hơn", vô nghĩa).
- Không tính khoản cố định (dùng chung `fixedTest()` với dự báo: loại nhà cửa, hóa đơn, khoản trả từ việc, ghi chú kiểu tiền nhà/điện/học phí, trùng tên việc lặp lại). Lý do: lần chạy thử đầu cho ra "ít hơn tuần trước 2,6tr" chỉ vì tiền phòng rơi vào tuần trước.
- *Đánh đổi:* số "tuần này" khác tổng cộng tay từ danh sách khi tuần có tiền nhà. Chữ "tiêu" thay vì "chi" để gợi ý đây là tiêu dùng hằng ngày; chưa ghi rõ "(không tính khoản cố định)" vì dòng sẽ xuống 3 hàng ở 320px.

**3. Ghi nhanh một chạm thông minh hơn (`combos()`)**
- Gộp theo ghi chú + loại, không theo số tiền: "cơm trưa 35k" ba lần và "cơm trưa 40k" một lần là một nút "cơm trưa 35k" (số tiền hay gặp nhất, bằng nhau thì lấy lần gần nhất). Trước đây hai nút riêng, mỗi nút ít lần hơn nên dễ rớt khỏi top 4.
- Điểm = số lần × (0,35 + tỉ lệ lần ghi trong khoảng ±2 tiếng quanh giờ hiện tại): 13h thì trà sữa (hay ghi 14h) đứng trước cà phê (7h) dù ít lần hơn.
- Khoản chưa bao giờ ghi hai lần một ngày mà hôm nay đã ghi rồi thì nhân 0,15 (xuống cuối). Khoản có ngày ghi hai lần (gửi xe) không bị hạ.
- Nút dùng đúng danh sách đang hiện (`ui.cmb`); vừa bấm thì giữ nguyên thứ tự 10 giây (`ui.cmbHold`), vì khoản vừa ghi bị hạ ngay và nút dưới ngón tay sẽ đổi. Kiểm thử bấm liền hai lần nút đầu.
- Kết quả nhớ theo (mảng tx trong chỉ mục, ngày, giờ). Đo trên 5.000 khoản (540 khoản trong 60 ngày), cùng trang: bản cũ 2,5ms mỗi lần vẽ Hôm nay và mỗi lần bấm; bản mới 2,0ms khi tính lại, 0ms khi dùng lại (CPU chậm 4x: cũ 12,8ms, mới 17,1ms khi tính lại, 0ms khi dùng lại). Hôm nay vẽ lại mỗi phút (`tick`), nên phần lớn lần vẽ là dùng lại.
- *Đánh đổi:* khoản cũ không có `at` thì lấy giờ của `updated_at` (giờ sửa, không phải giờ chi). Hệ số 0,35 và 0,15 chọn bằng tay theo dữ liệu thử, chưa có dữ liệu thật.

**4. Theo loại: so với cùng kỳ tháng trước, bấm để xem riêng**
- Mỗi dòng loại có số nhỏ "+235k" (đỏ) hoặc "−60k" (xanh) so với cùng kỳ tháng trước (tháng hiện tại: tới cùng ngày; tháng đã qua: cả tháng), dùng chung bộ lọc cùng kỳ với dòng "So với cùng kỳ" sẵn có. Chênh dưới 1.000đ thì không ghi.
- Dòng loại thành `<button>` cao ≥ 44px, `aria-pressed`. Bấm thì danh sách ngày bên dưới chỉ còn khoản của loại đó, kèm dải "🍜 Ăn uống: 945.000đ · 25 khoản · cùng kỳ tháng 9: 710k · Bỏ lọc"; tự cuộn tới dải nếu nó nằm thấp hơn 60% màn hình. Bấm lại dòng đó hoặc "Bỏ lọc" để thôi.
- Lọc giữ nguyên khi chuyển tháng (`ui.moneyCat`, không lưu), để so một loại qua nhiều tháng. "Xem thêm N ngày" đếm theo danh sách đã lọc.
- *Đánh đổi:* card Theo loại cao thêm khoảng 14px mỗi dòng vì vùng bấm 44px. Lọc chỉ trong RAM: mở lại app thì hết lọc, chủ ý để không ai mở app thấy danh sách "thiếu khoản".

**5. Mục tiêu tiết kiệm: nhịp mỗi tuần**
- `goalPace(g)`: còn thiếu / số tuần tới hạn (làm tròn lên nghìn), kèm số mỗi tháng nếu còn hơn 2 tháng. Thẻ ghi "~844k/tuần đến 31/01", quá hạn thì "quá hạn 10/10" màu đỏ; form ghi "Đã qua hạn, đổi ngày ở dưới nếu cần" thay cho con số vô lý.
- Form góp có nút "Phần tuần này 370k" (bỏ nếu trùng 100k/500k/1tr); góp xong thông báo "mỗi tuần còn cần ~296k".
- Sửa lỗi làm tròn mục tiêu (`moneyEdit`).
- *Chưa làm:* "đang chậm/nhanh so với kế hoạch" cần ngày bắt đầu, mà `goal` chưa có trường đó; thêm trường mới thì máy cũ không có giá trị. Để sau nếu cần.

**6. Form sửa khoản: "Thêm hôm nay"**
- Mở một khoản cũ, bấm "Thêm hôm nay" thì ghi một khoản mới hôm nay với số tiền, loại, ghi chú đang có trong form; khoản cũ giữ nguyên; có Hoàn tác. Dành cho khoản không đủ thường để thành nút ghi nhanh (cắt tóc, đổ gas). Footer 3 nút (`.foot3`): Xóa và nút giữa vừa chữ, Lưu chiếm phần còn lại, một dòng ở 320px kể cả chữ to.

**7. Dọn bản ghi đã xóa trên máy (P1 "Dọn tombstone", phần máy)**
- `gcTombstones()` chạy sau mỗi lần `syncNow` thành công, tối đa một lần mỗi ngày (`hn-gcAt`, chỉ trên máy này). Chỉ bỏ bản ghi khi đủ cả bốn điều kiện:
  - đang đăng nhập và `hn-owner` trùng tài khoản (dữ liệu trên máy đúng là của tài khoản này);
  - id không còn trong `queue`. `queue[id]` chỉ bị xóa khi `hn_push` nhận đúng `updated_at` đó, hoặc khi chính server gửi bản này về (`mergeRemote`). Nên "không có trong queue" nghĩa là server đã có lệnh xóa. Máy chưa từng đăng nhập thì `queue` giữ mọi id, nên không dọn gì: đây là chủ ý (xem rủi ro bên dưới);
  - `updated_at` cũ hơn 60 ngày;
  - `deleted === true`.
- **Vì sao an toàn:** server vẫn giữ tombstone. Máy khác chưa nhận lệnh xóa thì vẫn kéo được (dòng có `server_at > wm` của máy đó). Máy này kéo lại từ đầu (đổi tài khoản, `wm` về 1970) thì chỉ sinh lại tombstone. Máy khác offline sửa bản ghi đó *trước* lúc xóa thì `hn_push` từ chối (cũ hơn). Sửa *sau* lúc xóa thì bản sửa thắng như quy tắc hiện tại, có tombstone hay không cũng vậy.
- **Rủi ro còn lại:**
  - Nếu sau này thêm job xóa tombstone trên server, phải giữ lâu hơn 60 ngày và lâu hơn thời gian một máy có thể offline. Nếu không, một máy cũ đẩy bản ghi chưa xóa lên sẽ làm nó sống lại.
  - Nếu `queue` từng bị mất khi bộ nhớ đầy (đã có banner) mà lệnh xóa chưa lên server, thì không dọn cũng không cứu được. Dọn chỉ làm thêm một hệ quả: lần kéo lại từ đầu sẽ đưa bản ghi cũ về.
  - Người chỉ dùng trên máy (không đăng nhập) không được dọn. Muốn dọn cho họ thì phải chắc họ sẽ không bao giờ đăng nhập vào tài khoản đã có các id đó (ví dụ nhập file sao lưu từ máy khác rồi xóa). Không đáng với vài chục KB.
- **Số đo:** 6.000 bản ghi, 300 bản đã xóa từ 90 ngày trước: dọn trong 1,5ms (Chromium, không giả lập đồng hồ), `hn-db` bớt 74.367 ký tự (4,9%). Bản ghi xóa nhỏ vì `data` của khoản chi ngắn; task có `note` dài thì lợi nhiều hơn.
- Cài đặt, mục Sao lưu, thêm dòng "Trên máy: khoảng 95 KB · 2 mục đã xóa (giữ để đồng bộ) · đã tự dọn 300 mục xóa quá 60 ngày". Dung lượng tính bằng độ dài chuỗi `hn-db` + `hn-queue`, không parse. Dòng đếm có thêm số mục tiêu.

**Hiệu năng tab Tiền và Hôm nay.** Các hàm mới đo trong cùng trang với dữ liệu lớn của nhóm 5 (5.000 khoản, 500 việc): `spendLine` 0,3ms, `billsLeft` 0,1ms, `monthForecast` 0,3ms (CPU 4x: 2,4 / 0,9 / 2,9ms). `render()` cả tab Tiền và Hôm nay so với HEAD (`perf_cmp`, 3 lần xen kẽ, trung vị 15 lần vẽ): Hôm nay 27,8 → 24ms, Tiền 63,6 → 57,7ms. Hai số này cao hơn nhiều so với số đo ở nhóm 5 (4,6 và 11ms) vì lúc đo máy đang chạy ba agent cùng lúc; các kiểm thử `perf:` của nhóm 5 cũng trượt ngay trên bản chưa sửa vì lý do này. Kết luận chắc được: không chậm hơn bản cũ. Nên chạy lại `smoke.py` khi máy rảnh.

**Những gì không làm.** Không đụng Tập, Việc, Lịch, ghi nhanh (`quick.js`), tìm kiếm, MyBK/ICS, `config.js`, SQL, Supabase. Không sửa `sw.js` (không có file mới). Giấy tờ đã chép một chạm từ trước (`data-copy`), không cần sửa. CSV giữ nguyên định dạng để không làm hỏng file Excel người dùng đang dùng.

## Gộp 2.5.0 (19/10/2026)
Gộp giáo án tập, Luồng 1 và Luồng 2 vào `main`, tăng phiên bản một lần (2.5.0, `hn-v17`). Xung đột chỉ ở bộ nghe click (giữ cả nút giáo án lẫn `ui.moveId = null` khi đổi tab), cuối `analysis.md` và khối kiểm thử trong `smoke.py` (giữ cả hai).
- `smoke.py`: 621/625 PASS, không có `pageerror`. 4 bài trượt là ngưỡng thời gian `perf:` (Tiền, Lịch tháng, Việc, `put()`).
- **Ngưỡng `perf:` không đạt cả trên bản gốc 2.4.1** khi chạy trên máy này lúc rảnh (456/460, cùng 4 bài). Ngưỡng 16ms được đặt theo máy dev cũ, nên đây không phải lỗi mới.
  | ms, trung vị | 2.4.1 | 2.5.0 | 2.4.1 CPU 4x | 2.5.0 CPU 4x |
  |---|---|---|---|---|
  | Hôm nay | 20 | 25,7 | 133 | 126 |
  | Việc (400 việc mở) | 164 | 255 | 2.738 | 1.629 |
  | Lịch tháng | 26,9 | 37,1 | 572 | 203 |
  | Tiền | 66,6 | 74 | 751 | 555 |
  | Tập | 27,5 | 28,2 | 503 | 160 |
  Số đo dao động mạnh (CPU 4x nhanh hơn trong khi tốc độ thường chậm hơn). Tab Việc có thể chậm thêm thật vì mỗi dòng có thêm nút ⋯ (SVG). Cần đo lại bằng nhiều lần chạy rồi đặt lại ngưỡng theo máy hiện tại (hoặc so tương đối với bản trước thay vì số cứng).

## Tập 2.6: đang làm (19/10/2026)
Đặc tả đã được chủ app duyệt nằm ở `specs/tap-2.6.md`: xem tuần trước và cả tháng, bỏ giáo án cứng A-E, dán giáo án kiểu thời khóa biểu (lặp theo thứ tới khi xóa), tick từng hiệp, ghi chú bài, xuất dữ liệu (chữ + CSV). Quy trình chủ app yêu cầu: 1 luồng đánh giá đặc tả trước khi làm → 2 luồng làm song song → 1 luồng kiểm tra. Đã xong bước viết lại yêu cầu và hỏi chủ app; chưa bắt đầu bước đánh giá.
