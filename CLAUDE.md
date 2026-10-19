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
| `index.html` | Khung trang, nạp `config.js` → `app.js` → `quick.js` → `lunar.js` (đều `defer`). supabase-js do `app.js` tải sau lần vẽ đầu (`loadSupabase`, có SRI); Google Fonts `media="print"` rồi đổi sang `all` |
| `app.js` (~330KB) | Toàn bộ app: tiện ích, kho dữ liệu, đồng bộ, các màn hình, form, nhập MyBK, dán giáo án tập, ICS, thông báo |
| `quick.js` | `parseQuick(câu)`: hiểu câu tiếng Việt kiểu "cơm trưa 35k", "nộp BTL thứ 6 23h59", "3tr5 tiền nhà mùng 5 hằng tháng" |
| `lunar.js` | `LUNAR.of(ymd)` (âm lịch, thuật toán Hồ Ngọc Đức), `LUNAR.holiday(ymd)` (ngày lễ VN) |
| `styles.css` | Toàn bộ giao diện, sáng và tối |
| `sw.js` | Service worker: cache shell (stale-while-revalidate), nhận `push`, xử lý `notificationclick` |
| `setup.sql` | Bảng `hn_items` + RPC `hn_push` + realtime (chạy 1 lần trong Supabase SQL Editor) |
| `push.sql` | Bảng `push_subs`, `push_sent`, `push_config`, quyền cho `service_role`, lịch pg_cron 5 phút gọi hàm `hn-push` |
| `supabase/functions/hn-push/index.ts` | Edge Function gửi Web Push (VAPID + aes128gcm tự viết bằng WebCrypto, không thư viện) |
| `tests/smoke.py` | Kiểm thử Playwright, chặn Supabase, giả lập giờ 18/10/2026 Asia/Ho_Chi_Minh |
| `tests/push_test.mjs` | Kiểm thử hàm `hn-push` bằng Node (nạp nguyên `index.ts`, Supabase giả trong bộ nhớ). `smoke.py` tự gọi |

Trong `app.js`, mỗi phần bắt đầu bằng dòng `/* ---------- tên phần ---------- */`. Tìm theo dòng này để nhảy tới đúng chỗ, ví dụ "Lịch tháng", "form: việc", "nhập thời khóa biểu", "Tập: tuần, tháng, sheet ngày", "giáo án tập: dán kiểu TKB, quản lý, xuất", "thông báo nhắc hạn".

## Mô hình dữ liệu

`db[id] = { id, kind, data, deleted, updated_at }`, lưu ở `localStorage["hn-db"]`. Những thay đổi chưa đẩy lên server nằm ở `hn-queue`.

- Ghi dữ liệu chỉ qua `put(kind, data, id?)`, `remove(id)` và `restore(snapshot)`. Ba hàm này tự lưu, tự vẽ lại (`render()`) và tự hẹn đồng bộ. Nhiều lần ghi liền nhau thì bọc trong `batch(() => …)` để chỉ vẽ lại một lần.
- `db` là Proxy có chỉ mục theo kind: gán bản ghi mới (`db[id] = {...}`), đừng sửa tại chỗ `kind`/`deleted`. `persist()` ghi theo đợt (rảnh hoặc 300ms, ngay khi app xuống nền); cần ghi ngay thì gọi `flushPersist()`.
- Phần tử bấm được mới: dùng `<button>`, hoặc `div` có `data-act`/`data-edit`/`.tap` (`a11yEnhance` tự thêm `role=button`, `tabindex`, nhãn ô nhập).
- Đọc dữ liệu bằng `all(kind)`. Cài đặt đọc ghi bằng `getSetting(key, mặc_định)` và `setSetting(key, value)`, vì cài đặt cũng là bản ghi `kind: "setting"` nên đồng bộ được giữa các máy.
- Các loại `kind`:
  - `task`: `title, tag, type (bai|don|thi|khac), due, time, status (todo|waiting|done), amount, cat, repeat, until, subs[], note`
  - `class`: `title, code, group, days[], start, end, weeks[], room, teacher, credits, absent…`
  - `tx`: `type (in|out), amount, cat, note, date, at`
  - `workout` (đã tập): `date, mins, items[{ex, sets[], kg, pi, hs[], tgt, note}], note, planId, planDate, pname`. `sets` luôn là mảng SỐ, chỉ chứa các hiệp đã làm (bản cũ và kỷ lục đọc trường này). `pi` = chỉ số bài trong buổi giáo án, `hs` = hiệp thứ mấy của từng số trong `sets`, `planDate` = ngày của buổi dự kiến (khác `date` khi tập bù). Trường cũ `plan` (`A`-`E`, giáo án cứng đã bỏ ở 2.6) vẫn giữ luật NORM, không ghi mới.
  - `gymplan` (giáo án dán vào, kiểu thời khóa biểu): `name, start, until, src, days[{name, dows[], date, rest, items[{ex, n, lo, hi, max, unit, kg, side, note}]}]`. Một bản ghi chứa mọi buổi; lặp theo thứ (`dows`, 0 = CN) tới `until` (rỗng = mãi mãi), `date` = buổi một lần. Phần "dự kiến" KHÔNG được lưu bằng kind `workout` (bản cũ coi mọi `workout` là đã tập). Đọc qua các hàm `gym*` ở phần "giáo án tập" (`gymDay`, `gymStatus`, `gymMatch`…), có bộ nhớ đệm theo `IDX_ARR`.
  - `weight`, `goal`, `doc`, `setting` (cài đặt tập: `weightGoal`; `gymPlan {on, start}` là của giáo án cứng cũ, còn luật NORM nhưng app không đọc nữa)
- Đồng bộ dùng quy tắc bản có `updated_at` mới hơn thì thắng, tính theo từng bản ghi. Khi đẩy lên, app gọi RPC `hn_push(rows)`. Khi kéo về, app lấy các dòng có `server_at > wm` rồi nhận thêm thay đổi qua realtime.
- Giao diện vẽ lại toàn bộ: `render()` gán `main.innerHTML = view()`. Mọi thao tác bấm đi qua một bộ nghe `click` chung trên `document`, phân loại theo `data-act`, `data-tab`, `data-edit`, `data-mday`… (tìm `document.addEventListener("click"`).
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
  - deploy bằng `supabase functions deploy hn-push --no-verify-jwt`;
  - hàm phải tắt JWT verification vì pg_cron gọi hàm mà không gửi khóa.
  - Muốn thử thì POST `{"action":"vapid"}`: kết quả phải trả về `publicKey`. POST `{"action":"tick"}` không kèm header thì phải nhận 401; cron gửi header `x-hn-secret` (khóa `hn_push_secret` trong Vault) và nhận `{sent, late, candidates, missed, tasks, subs}` (`late` là số thông báo bù cho mốc bị lỡ khi cron ngừng hơn 20 phút, dựa vào `push_config.last_tick`).
  - Đổi gì liên quan tới khóa thì chạy `push.sql` trước, deploy sau.
  - Không có Supabase CLI cài sẵn: dùng `npx supabase …` (đăng nhập bằng `npx supabase login` trong một terminal thật, ô `!` không dùng được).
- SQL mới viết theo kiểu chạy lại nhiều lần không lỗi (`if not exists`, `drop policy if exists`). Bảng mới phải `grant` cho `service_role` nếu Edge Function cần đọc, vì project này không tự cấp quyền mặc định.
