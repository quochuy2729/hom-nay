# Đặc tả Tập 2.6 (chủ app đã duyệt 19/10/2026)

Repo: D:\App_Convenience\hom-nay (đọc CLAUDE.md trước, mọi quy tắc trong đó là bắt buộc). Bản đang chạy 2.5.0.

## Lời gốc của chủ app
"tôi muốn chỗ tập luyện có thể coi được tuần trước luôn và cũng có chế độ coi cả tháng. và bỏ dùng giáo án này đi vì đó là giáo án chỉ của riếng tôi người khác không xài hãy thiết kết thêm tính năng giống đọc thời khóa biểu bách khoa vậy để kêu ai thiết kế bài tập thì dán vào bài tập sẽ nằm sẵn trong ngày đó. làm thì tick vào có tick 1 rep 2 rep 3 rep luôn và cũng có chỗ ghi chú về bài tập. Có nút xuất dữ liệu tập để gửi ai phân tích."

## Quyết định của chủ app
1. **Tick theo HIỆP.** Mỗi bài có nút Hiệp 1, Hiệp 2, Hiệp 3… Chạm = xong hiệp đó với đúng số lần mục tiêu. Làm ít/nhiều hơn thì giữ lâu (hoặc cách tương đương dễ dùng) để sửa số. Chạm lại hiệp đã xong = bỏ tick. Mục tiêu "max/tối đa" thì khi tick phải hỏi số.
2. **Giáo án dán vào hoạt động như THỜI KHÓA BIỂU:** dán một lần là tuần nào cũng có bài đúng thứ đó, **lặp vô hạn cho tới khi xóa giáo án** (có thể đặt ngày kết thúc tùy chọn). "Thứ 2…CN" gắn theo thứ. "Buổi 1, Buổi 2…" thì người dùng chọn các thứ để xếp vào khi xem trước. Ngày cụ thể ("20/10") là buổi một lần. Dán giáo án mới thì giáo án cũ kết thúc từ hôm trước ngày bắt đầu của giáo án mới (lịch sử đã tập giữ nguyên); xem trước phải nói rõ "sẽ thay giáo án X".
3. **Giáo án 5 buổi A-E cứng trong code: XÓA HẲN**, kể cả phần mẹo và cách ăn ("Cả giáo án và cách ăn"). Không để lại mẫu.
4. **Xuất dữ liệu tập: Chữ + CSV.** Nút chính chép văn bản để dán vào ChatGPT/Zalo/gửi HLV; nút phụ tải CSV (mỗi hiệp một dòng, có BOM, dùng `shareOrDownload` như `exportCsv`). Chọn khoảng: 4 tuần (mặc định), 3 tháng, tất cả.
5. Mặc định (chủ app không phản đối): ngày có giáo án đã qua mà chưa tập hiện "bỏ lỡ"; sheet ngày đó có nút "Tập buổi này hôm nay".

## Tính năng
### (a) Xem tuần trước và cả tháng (tab Tập)
- Thẻ lịch có công tắc **Tuần | Tháng** (nhớ theo máy bằng LS). Tuần: ‹ ›, tiêu đề "Tuần 13/10 - 19/10", nút "Về tuần này"; danh sách 7 ngày: tên buổi dự kiến, tiến độ "6/9 hiệp", tóm tắt đã tập. Tháng: lưới T2-CN, ‹ ›, mỗi ô: đã tập (tô `--gym`), có giáo án chưa tới (viền), bỏ lỡ (viền đứt nhạt), hôm nay (vòng); đầu thẻ tổng tháng: số buổi, phút, hiệp đã làm / dự kiến. Chạm ngày nào (cả quá khứ) mở sheet ngày đó.
- "Đã tập" = ngày có ít nhất một bản ghi `workout` (giữ đúng quy tắc hiện tại để dữ liệu cũ không đổi).
- 320px, vùng bấm ≥ 44px, sáng và tối.
### (b) Bỏ giáo án cứng
- Xóa `GYM_PLAN, PLAN_WEEK, planOf, planOn, planTarget, planAdvice, planNext, planWeek, planPreset, planCard, planGuide`, dòng "Buổi tiếp theo" ở Hôm nay, `plan-*` trong bộ nghe click, `ui.planPick`, phần plan trong `workoutForm`, CSS `.plan-*` không còn dùng. Giữ `lastEx`, `EXERCISES` (các bài mới thêm ở 2.5.0 vẫn giữ), toàn bộ cân nặng + mục tiêu cân nặng + xu hướng.
- Dữ liệu cũ: bản ghi `workout` có `plan: "A"…` giữ nguyên, giữ luật `NORM.workout.plan`; setting `gymPlan` giữ luật NORM_SETTING, app thôi đọc. Không xóa dữ liệu của người dùng.
### (c) Dán giáo án (mẫu: `tkbSheet`/`parseTkb`)
- Nút "Dán giáo án" ở tab Tập → sheet: hướng dẫn, nút "Chép câu nhờ ChatGPT soạn" (câu mẫu yêu cầu đúng định dạng), ô dán, xem trước cập nhật khi gõ, chọn ngày bắt đầu (mặc định thứ 2 tuần này hoặc hôm nay), ngày kết thúc tùy chọn, nút "Lưu giáo án".
- Định dạng dễ dãi: tiêu đề ngày (`Thứ 2`, `T2`, `Thứ hai`, `CN`, `Chủ nhật`, `20/10`, `Buổi 1`, `Ngày 1`, `Day 1`, kèm tên buổi sau `:`/`-`); bài cùng dòng sau `:` (cách bởi `,` `;` `+`) hoặc các dòng dưới (`-`, `•`, `*`, `1.`, `1)`); liều: `4x8`, `4 x 8-10`, `4 hiệp 8 lần`, `4 sets x 8 reps`, `3x30s`, `3x30 giây`, `20 phút`, `4xmax`, `4 x tối đa`, `8kg`, `@8kg`, `mỗi bên/mỗi chân`; ngoặc hoặc ` - ` sau liều = ghi chú bài; `Nghỉ/Rest/Off` = ngày nghỉ; bỏ markdown (`**`, `#`, `|`), emoji, câu mở đầu/kết của ChatGPT; tên bài so không dấu với `EXERCISES` + bài đã ghi.
- Dòng có tên bài không có liều: nhận, 3 hiệp, số lần trống, cảnh báo vàng. Dòng có liều mà chưa có tiêu đề ngày: gom vào "Buổi 1". Dòng không hiểu: liệt kê "Không hiểu, bỏ qua" nguyên văn. Không bao giờ âm thầm bỏ dòng có số.
- Ví dụ bắt buộc đọc đúng (đưa vào kiểm thử):
  - A: `Thứ 2: Hít xà 4x8, Xà kép 3x10, Plank 3x45s` / `Thứ 4: Goblet squat 4x12 8kg, Lunge 3x10 mỗi chân` / `Thứ 6: Hít đất para 3x15; Máy đung đưa 20 phút`
  - B: `**Buổi 1 - Kéo**` / `1. Hít xà: 4 hiệp x tối đa (chừa 1-2 lần)` / `2. Chèo tạ 1 tay 3 x 12 @8kg - giữ 1 giây ở trên` / `**Buổi 2 - Đẩy**` / `- Xà kép 4x6-10` / `- Pike push-up 3x8`
  - C: `20/10: Hít xà 5x5, Squat 3x15` / `22/10 (Thứ 4)` / `- Plank 3x60s` / `- Chạy bộ 25 phút`
- Lưu xong toast có Hoàn tác; quản lý giáo án đang dùng (xem, đổi tên, đặt ngày kết thúc, Xóa giáo án). Xóa giáo án không đụng `workout` đã tập.
### (d) Tick từng hiệp
- Sheet ngày (mở từ lưới tuần/tháng, thẻ "Hôm nay tập" ở tab Tập, thẻ Tập ở Hôm nay): mỗi bài: tên, liều ("4 × 8-10 · 8kg"), "Lần trước: 8 8 7", hàng nút Hiệp 1..n (≥ 44px, ghi số mục tiêu), "+ Thêm hiệp", "+ Thêm bài" ngoài giáo án, ghi chú của người soạn (chữ mờ) và ô "Ghi chú bài" của người tập; ghi chú buổi; hẹn giờ nghỉ (có sẵn trong workoutForm) tự chạy sau mỗi tick nếu đã chọn mức nghỉ.
- Đã tập vẫn lưu là kind `workout` như cũ: lần tick đầu tạo một `workout` của ngày đó; `items[].sets` chỉ chứa các hiệp đã làm (để kỷ lục, tiến bộ, `sessionSummary`, ghi nhanh và bản app cũ đều đúng); thêm `items[].note`. Bỏ hết tick và không có ghi chú thì xóa bản ghi đó. Ngày tương lai: xem được, không tick được. Quá khứ: tick bù được.
### (e) Ghi chú bài: `items[].note`, có trong sheet ngày và `workoutForm`, hiện ở lịch sử và xuất dữ liệu, qua `esc()`.
### (f) Xuất dữ liệu tập: xem quyết định 4. Văn bản: mỗi buổi một khối (ngày, thứ, tên buổi, phút, từng bài "dự kiến 4×8 · làm 8 8 7 6 · 8kg · ghi chú"), buổi bỏ lỡ, ghi chú buổi, cuối là tóm tắt (số buổi/dự kiến, cân nặng đầu-cuối, mục tiêu cân). Không có dữ liệu thì khóa nút kèm câu giải thích.

## Ràng buộc kỹ thuật đã biết
- Server `hn_items` và `mergeBackup` nhận kind mới bất kỳ (`^[a-z_]{1,24}$`). Bản app cũ coi MỌI `workout` là đã tập, nên phần "dự kiến" KHÔNG được lưu bằng kind `workout`.
- Ghi nhanh "hít xà 3x10" nối vào `workout` đầu tiên của ngày; phải vẫn đúng.
- `NORM.workout.items` đã giữ trường lạ (`...i`); trường số/ngày mới phải thêm luật NORM.
- Không tăng `APP_VERSION` / `VERSION` trong worktree; lead tăng một lần khi gộp (2.6.0, hn-v18).
- `tests/smoke.py` khối "giáo án tập 5 buổi/tuần, mục tiêu cân nặng": bỏ phần giáo án, GIỮ các kiểm tra cân nặng.
