# CLAUDE.md: Hôm Nay

PWA tiếng Việt, một trang, không có bước build. Dùng cho học sinh, sinh viên, người đi làm: việc và hạn nộp, lịch học và lịch thi (nhập từ MyBK), lịch tháng có âm lịch, chi tiêu, tập luyện, giấy tờ.
Dữ liệu lưu trên máy (localStorage) và đồng bộ qua Supabase riêng của chủ app. Bản đang chạy: https://quochuy2729.github.io/hom-nay/ (GitHub Pages, nhánh `main`, thư mục gốc).

Đọc `analysis.md` để biết kiến trúc, các điểm yếu và việc nên làm tiếp.

## Quy tắc bắt buộc

- **Không ghi đè, không in ra, không commit thay đổi `config.js`.** File trên GitHub chứa URL và anon key thật. Nếu bản trên máy trống thì cứ để trống.
- **Không dùng framework, bundler hay npm cho app.** Giữ JS thuần, chạy thẳng từ file. Thư viện ngoài duy nhất là `@supabase/supabase-js@2.45.4` (UMD, tải bằng `defer` trong `index.html`).
- **Mỗi lần sửa file app phải tăng phiên bản ở hai chỗ:**
  - `APP_VERSION` ở đầu `app.js` (semver);
  - `VERSION` trong `sw.js` (`hn-vN`, tăng N lên 1).
  Nếu quên, điện thoại vẫn dùng bản cũ trong cache.
- **Thêm file mới mà app cần thì phải thêm vào mảng `SHELL` trong `sw.js`.** File cùng origin trong `SHELL` là bắt buộc (cài bằng `addAll`): đường dẫn sai hay file không tồn tại sẽ làm mọi lần cập nhật thất bại.
- **Giao diện chỉ dùng tiếng Việt, có dấu đầy đủ, giọng gần gũi.** Không dùng gạch ngang dài (—) trong chữ hiển thị.
- **Không đổi tên các trường dữ liệu đã có** (`kind`, `data.*`). Máy khác và bản cũ vẫn đang đọc chúng. Muốn đổi thì phải viết đoạn chuyển đổi khi đọc vào.
- **Mọi dữ liệu chèn vào HTML phải qua `esc()`, kể cả số, giờ, emoji và tên danh mục** (dữ liệu có thể đến từ file sao lưu hay máy khác). Trường mới kiểu số, ngày hoặc giờ thì thêm luật vào `NORM` / `NORM_SETTING` (hàm `normalize`).
- **`index.html` có Content-Security-Policy.** Không dùng script inline hay `onclick=` trong HTML. Thêm nguồn ngoài mới (CDN, API) thì phải thêm vào thẻ meta CSP.
- **Màu dùng biến CSS** (`--fg`, `--bg`, `--card`, `--task`, `--cls`, `--money`, `--gym`…), không viết mã màu cứng. Chế độ tối được khai báo hai lần: trong `:root:not([data-theme="light"])` ở `@media (prefers-color-scheme: dark)` và trong `:root[data-theme="dark"]`.
- **Giao diện phải dùng tốt ở chiều rộng 320px.** Vùng bấm tối thiểu 44px. Phần tử ẩn bằng `opacity: 0` phải kèm `pointer-events: none`, vì đã có lỗi toast ẩn chặn bấm giữa nút.

## Cấu trúc

| File | Vai trò |
|---|---|
| `index.html` | Khung trang, nạp `config.js` → `sched.js` → `app.js` → `quick.js` → `lunar.js` (đều `defer`). supabase-js do `app.js` tải sau lần vẽ đầu (`loadSupabase`, có SRI); Google Fonts `media="print"` rồi đổi sang `all` |
| `app.js` (~330KB) | Toàn bộ app: tiện ích, kho dữ liệu, đồng bộ, các màn hình, form, nhập MyBK, dán giáo án tập, ICS, thông báo |
| `quick.js` | `parseQuick(câu)`: hiểu câu tiếng Việt kiểu "cơm trưa 35k", "nộp BTL thứ 6 23h59", "3tr5 tiền nhà mùng 5 hằng tháng" |
| `sched.js` | (2.8) Lịch dùng chung cho app và hàm `hn-push`: `HN_SCHED.isoWeek`, `classActive`, `classMeets` (thứ, tuần học, buổi vắng), `sortPlans`/`planAt`/`planDay` (buổi giáo án, `gymDay` của app gọi hàm này), `workoutFor`. Script thường gán `globalThis.HN_SCHED`. **Bản sao** ở `supabase/functions/hn-push/sched.js` phải giống hệt: sửa một bên thì chép đè sang bên kia (`push_test.mjs` kiểm tra) |
| `lunar.js` | `LUNAR.of(ymd)` (âm lịch, thuật toán Hồ Ngọc Đức), `LUNAR.holiday(ymd)` (ngày lễ VN) |
| `styles.css` | Toàn bộ giao diện, sáng và tối |
| `sw.js` | Service worker: cache shell (stale-while-revalidate), nhận `push`, xử lý `notificationclick` |
| `setup.sql` | Bảng `hn_items` + RPC `hn_push` + realtime (chạy 1 lần trong Supabase SQL Editor) |
| `cleanup.sql` | (2.8) Job pg_cron xóa hẳn tombstone (`deleted = true`) nhận quá 90 ngày trong `hn_items`, thu hồi quyền `delete` trực tiếp. Chủ app tự chạy |
| `push.sql` | Bảng `push_subs`, `push_sent`, `push_config`, quyền cho `service_role`, lịch pg_cron 5 phút gọi hàm `hn-push` |
| `supabase/functions/hn-push/index.ts` | Edge Function gửi Web Push (VAPID + aes128gcm tự viết bằng WebCrypto, không thư viện). Nhắc việc theo `push_subs.prefs` của từng máy; từ 2.8 nhắc thêm lịch học, buổi tập, tổng kết tuần theo cài đặt đồng bộ (`classRemind`, `gymRemind`, `weekRemind`), đọc `class`, `gymplan`, `setting`, `workout` trong `hn_items` |
| `tests/smoke.py` | Kiểm thử Playwright, chặn Supabase, giả lập giờ 18/10/2026 Asia/Ho_Chi_Minh |
| `tests/push_test.mjs` | Kiểm thử hàm `hn-push` bằng Node (nạp nguyên `index.ts`, Supabase giả trong bộ nhớ). `smoke.py` tự gọi |

Trong `app.js`, mỗi phần bắt đầu bằng dòng `/* ---------- tên phần ---------- */`. Tìm theo dòng này để nhảy tới đúng chỗ, ví dụ "Lịch tháng", "form: việc", "nhập thời khóa biểu", "Tập: tuần, tháng, sheet ngày", "giáo án tập: dán kiểu TKB, quản lý, xuất", "thông báo nhắc hạn".

## Mô hình dữ liệu

`db[id] = { id, kind, data, deleted, updated_at }`, lưu ở `localStorage["hn-db"]`. Những thay đổi chưa đẩy lên server nằm ở `hn-queue`; mục máy chủ từ chối (lỗi 22xxx/23xxx, ví dụ quá 256KB) nằm ở `hn-skip` để không chặn cả lô. `hn-owner` nhớ tài khoản sở hữu dữ liệu trên máy: đăng nhập tài khoản khác thì app hỏi gộp hay bắt đầu trống (`acctSheet`), chưa chọn thì không đẩy, không kéo. Máy chỉ có cài đặt (không có dữ liệu khác) thì không hỏi mà bỏ cài đặt trên máy, lấy của tài khoản mới (2.8). `hn-skip` được thử lại khi mở app, tối đa 6 giờ một lần (`hn-skipAt`). `hn-repFix` nhớ các việc lặp đã tự sửa hạn lệch do máy 2.6.1 (`repairRepeats`, chỉ sửa một lần).

- Ghi dữ liệu chỉ qua `put(kind, data, id?)`, `remove(id)` và `restore(snapshot)`. Ba hàm này tự lưu, tự vẽ lại (`render()`) và tự hẹn đồng bộ. Nhiều lần ghi liền nhau thì bọc trong `batch(() => …)` để chỉ vẽ lại một lần.
- `db` là Proxy có chỉ mục theo kind: gán bản ghi mới (`db[id] = {...}`), đừng sửa tại chỗ `kind`/`deleted`. `persist()` ghi theo đợt (rảnh hoặc 300ms, ngay khi app xuống nền); cần ghi ngay thì gọi `flushPersist()`.
- Phần tử bấm được mới: dùng `<button>`, hoặc `div` có `data-act`/`data-edit`/`.tap` (`a11yEnhance` tự thêm `role=button`, `tabindex`, nhãn ô nhập).
- Đọc dữ liệu bằng `all(kind)`. Cài đặt đọc ghi bằng `getSetting(key, mặc_định)` và `setSetting(key, value)`, vì cài đặt cũng là bản ghi `kind: "setting"` nên đồng bộ được giữa các máy.
- Các loại `kind`:
  - `task`: `title, tag, type (bai|don|thi|khac), due, time, status (todo|waiting|done), amount, cat, repeat, day, until, subs[], note, movedAt`. `movedAt` (2.8) = lúc dời hạn về sau gần nhất (ms), tổng kết tuần đếm "việc dời". Việc có `amount` lặp lại: xong thì tạo kỳ ngay sau (không nhảy qua kỳ đã lỡ); việc không có tiền thì vẫn nhảy tới kỳ sắp tới. `repeat` ∈ `"" | day | week | 2week | month | year | lunar-month | lunar-year` (ba giá trị cuối từ 2.7.0; bản 2.6.1 hiểu nhầm chúng là hằng tháng). `day` = ngày gốc của chuỗi lặp theo tháng/năm (dương 1-31 hoặc ngày âm), để 31/1 → 28/2 → 31/3 không trôi; thiếu thì lấy ngày của `due`. Âm lịch đổi qua `LUNAR.toSolar` / `LUNAR.next` trong `lunar.js`.
  - `class`: `title, code, group, days[], start, end, weeks[], room, teacher, credits, absent…`
  - `tx`: `type (in|out), amount, cat, note, date, at, group` (`group` từ 2.8: id chung với các khoản nợ của cùng một lần chia tiền)
  - `debt` (2.8, sổ nợ): `who, amount, dir (owe = mình nợ | lend = người ta nợ mình), date, due (hẹn trả), note, paid (đã trả bao nhiêu, trả một phần được), paidAt (ngày trả gần nhất), group`. **Không phải thu chi**: mượn, cho mượn, trả nợ không ghi `tx`, không vào ngân sách hay `billsLeft`. Chia tiền: phần của mình là `tx` chi, phần người khác là `debt lend` (hoặc `debt owe` cho người trả hộ), cùng `group`. Người gộp theo `debtKey(who)` (không dấu, bỏ "bạn/anh/chị…" trước tên); "3 người" là phần chưa ghi tên. Đọc qua `debtPeople()`, `debtLeft()`, trả bằng `debtPay()`
  - `workout` (đã tập): `date, mins, items[{ex, sets[], kg, pi, hs[], tgt, note}], note, planId, planDate, pname`. `sets` luôn là mảng SỐ, chỉ chứa các hiệp đã làm (bản cũ và kỷ lục đọc trường này). `pi` = chỉ số bài trong buổi giáo án, `hs` = hiệp thứ mấy của từng số trong `sets`, `planDate` = ngày của buổi dự kiến (khác `date` khi tập bù). Trường cũ `plan` (`A`-`E`, giáo án cứng đã bỏ ở 2.6) vẫn giữ luật NORM, không ghi mới.
  - `gymplan` (giáo án dán vào, kiểu thời khóa biểu): `name, start, until, src, days[{name, dows[], date, rest, items[{ex, n, lo, hi, max, unit, kg, side, note}]}]`. Một bản ghi chứa mọi buổi; lặp theo thứ (`dows`, 0 = CN) tới `until` (rỗng = mãi mãi), `date` = buổi một lần. Phần "dự kiến" KHÔNG được lưu bằng kind `workout` (bản cũ coi mọi `workout` là đã tập). Đọc qua các hàm `gym*` ở phần "giáo án tập" (`gymDay`, `gymStatus`, `gymMatch`…), có bộ nhớ đệm theo `IDX_ARR`.
  - `weight`, `goal`, `doc`, `setting` (cài đặt tập: `weightGoal`; `gymPlan {on, start}` là của giáo án cứng cũ, còn luật NORM nhưng app không đọc nữa)
  - Cài đặt mới ở 2.8 (đều có luật `NORM_SETTING`): `weekHide` (thứ Hai của tuần đã ẩn thẻ Tuần qua), `classRemind` (0 | 10 | 15 | 30 phút trước giờ vào lớp, 0 = tắt), `gymRemind` ("HH:MM" hoặc "" = tắt), `weekRemind` (true = nhắc 20:00 Chủ nhật). Ba cài đặt nhắc là của tài khoản (mọi máy), khác `pushPrefs` của nhắc việc là theo từng máy.
- Đồng bộ dùng quy tắc bản có `updated_at` mới hơn thì thắng, tính theo từng bản ghi. Khi đẩy lên, app gọi RPC `hn_push(rows)`. Khi kéo về, app lấy các dòng có `server_at > wm` rồi nhận thêm thay đổi qua realtime.
- Giao diện vẽ lại toàn bộ: `render()` gán `main.innerHTML = view()`; lỗi khi vẽ thì hiện banner có nút Tải bản sao lưu thay vì trắng trang, nên vẫn phải thêm luật NORM cho mọi cài đặt/trường mới để dữ liệu rác không làm hỏng màn hình. Mọi thao tác bấm đi qua một bộ nghe `click` chung trên `document`, phân loại theo `data-act`, `data-tab`, `data-edit`, `data-mday`… (tìm `document.addEventListener("click"`).
- Form mở bằng `openSheet({ title, html, color, onMount })`. Thông báo ngắn dùng `toast(msg, { label, fn })`.
- Hồ sơ người dùng (`persona`) gồm `hs | sv | work | biz | other`. `mod("cal")` cho biết người dùng có bật Lịch học không. Chữ hiển thị đổi theo `isStudent()`.

## Chạy và kiểm thử

```bash
python3 -m http.server 8000          # mở http://localhost:8000
pip install playwright && python3 tests/smoke.py
node -e "new Function(require('fs').readFileSync('app.js','utf8'))"   # kiểm tra cú pháp nhanh
```

- Mỗi khi sửa giao diện, thêm một kiểm thử vào `tests/smoke.py`, chạy lại cho tới khi tất cả PASS và không còn lỗi `pageerror`.
- Chụp ảnh màn hình ở 393px và 320px, cả chế độ sáng lẫn tối, rồi tự xem lại.
- Hàm `toast` tự ẩn bằng `setTimeout`. Trong kiểm thử phải gọi `pg.clock.run_for(…)` để toast biến mất.

## Triển khai

- Đẩy lên `main` là GitHub Pages tự cập nhật sau khoảng 1 phút. Muốn kiểm tra, mở trang và xem phiên bản ở cuối Cài đặt.
- Hàm `hn-push` (Supabase project `iqzhkvwybnsxyclxhjcs`):
  - deploy bằng `supabase functions deploy hn-push --no-verify-jwt` (gửi kèm `sched.js` cùng thư mục);
  - hàm phải tắt JWT verification vì pg_cron gọi hàm mà không gửi khóa.
  - Muốn thử thì POST `{"action":"vapid"}`: kết quả phải trả về `publicKey`. POST `{"action":"tick"}` không kèm header thì phải nhận 401; cron gửi header `x-hn-secret` (khóa `hn_push_secret` trong Vault) và nhận `{sent, late, candidates, missed, tasks, reminders, subs}` (`reminders` = số mốc nhắc lịch học, buổi tập, tổng kết tuần quanh lúc chạy; đọc phần đó lỗi thì có thêm `extraError`, nhắc việc vẫn chạy) (`late` là số thông báo bù cho mốc bị lỡ khi cron ngừng hơn 20 phút, dựa vào `push_config.last_tick`).
  - Đổi gì liên quan tới khóa thì chạy `push.sql` trước, deploy sau.
  - Không có Supabase CLI cài sẵn: dùng `npx supabase …` (đăng nhập bằng `npx supabase login` trong một terminal thật, ô `!` không dùng được).
- SQL mới viết theo kiểu chạy lại nhiều lần không lỗi (`if not exists`, `drop policy if exists`). Bảng mới phải `grant` cho `service_role` nếu Edge Function cần đọc, vì project này không tự cấp quyền mặc định.
