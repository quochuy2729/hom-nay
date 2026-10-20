# Đặc tả 2.9.0: Lịch Tuần | Tháng trong tab Việc và trên Hôm nay

Trạng thái: **chủ app đã duyệt (20/10/2026), kèm 4 bổ sung ở cuối**. Làm trên nhánh `claude/hn-2.9` tách từ `main` (đang là 2.8.0, `hn-v21`). Mọi quy tắc trong `CLAUDE.md` là bắt buộc.

## Lời gốc của chủ app
"ở chức năng việc tôi muốn nó cũng có 1 cái lịch để coi ngày nào việc đó còn ngày nào hết việc đó. và ở mục hôm nay thì sẽ có thêm chức năng lịch luôn sẽ thấy được trên lịch hôm nay là việc và tập hay lịch có gì. chỉ cần thấy chấm màu kiểu giống ở lịch nhưng ví dụ đỏ là việc cần làm xanh là lịch xanh lá là tập."

## Quyết định của chủ app
1. Tab Việc có **lịch chuyển được Tuần | Tháng**. Bấm một ngày thì danh sách bên dưới chỉ còn việc của ngày đó.
2. Ô ngày ghi **số việc còn lại**. Ngày có việc mà đã xong hết thì có **dấu ✓ xanh lá**. Ngày không có việc thì để trống.
3. Trang Hôm nay có **lịch nhỏ chuyển được Tuần | Tháng**. Bấm một ngày thì mở **tab Lịch đúng ngày đó**.
4. Màu chấm trên lịch nhỏ (cả Tuần lẫn Tháng):
   - Việc: **tím** (màu Việc của app, `--task`). Ngày có việc **quá hạn** thì chấm **đỏ** (`--danger`).
   - Lịch học: **xanh dương** (`--cls`).
   - Tập: **xanh lá** (`--gym`).
   - Tiền và nợ không có chấm riêng.
5. Thẻ Tập luyện trên Hôm nay **bỏ hàng 7 chấm** (`weekGrid`), vì lịch nhỏ đã có chấm tập.
6. Làm trực tiếp ở máy này. Xong thì mở PR, **hỏi chủ app trước khi gộp vào `main`**.

## (a) Thẻ "Lịch việc" trong tab Việc

**Vị trí:** ngay dưới hàng nút *Cần làm / Đang chờ / Đã xong*, hiện ở cả ba mục.

**Đầu thẻ:**
- Công tắc **Tuần | Tháng** (giống lịch nhỏ trên Hôm nay). Máy nhớ dạng đang chọn bằng khóa LS `taskCalView`, mặc định là **Tháng**.
- Nút ‹ › để đổi tuần hoặc tháng, tiêu đề "Tuần 19/10 - 25/10" hoặc "Tháng 10, 2026".
- Nút "Tuần này" / "Tháng này", chỉ hiện khi đang xem tuần hoặc tháng khác.
- Nút thu gọn/mở. Máy nhớ lựa chọn bằng khóa LS `taskCalOff`, mặc định là mở. Khi thu gọn chỉ còn đầu thẻ và dòng tóm tắt.
- Tuần hoặc tháng đang xem chỉ lưu trong `ui`, mở lại app thì về tuần này hoặc tháng này. Đổi dạng thì giữ đúng chỗ đang xem, cùng cách với lịch nhỏ trên Hôm nay. Nếu đang chọn một ngày thì đổi dạng mở đúng tuần hoặc tháng chứa ngày đó và giữ lọc.

**Lưới:** dạng Tháng là lưới tháng 7 cột T2 tới CN (5 hoặc 6 hàng), dạng Tuần là một hàng 7 ô của tuần đang xem; cả hai có hàng tên thứ. Ô cao ít nhất 44px và dùng tốt ở 320px, kể cả khi bật chữ to. Mỗi ô có số ngày và **một** trong ba trạng thái:
- **Còn việc:** hiện một con số, bằng số việc có hạn ngày đó mà chưa xong (status `todo` hoặc `waiting`; việc "Đang chờ" vẫn tính là còn).
  - Ngày đã qua: số màu đỏ (`--danger`), nghĩa là quá hạn.
  - Hôm nay và ngày tới: số màu tím (`--task`).
- **Hết việc:** ngày có việc và tất cả đã xong thì hiện dấu ✓ xanh lá (`--gym`).
- **Không có việc:** chỉ có số ngày.

Ngoài ra:
- Hôm nay có vòng tròn. Ngày ngoài tháng thì mờ (dạng Tháng). Ngày đang chọn có viền đậm.
- **Lần lặp sau** của việc lặp (lấy từ `repeatGhosts`, đã bỏ lặp hằng ngày) hiện một chấm tím mờ dưới số ngày. Chấm này không tính vào số và không làm thành ✓.
- Khoản phải trả (việc có số tiền) và lịch thi là việc, nên được tính. Khoản nợ trong Sổ nợ không tính.
- Trình đọc màn hình đọc được từng ô, ví dụ "Thứ Năm 22/10: còn 2 việc", "Thứ Hai 12/10: đã xong hết 3 việc", "Thứ Ba 13/10: quá hạn 1 việc".

**Dòng tóm tắt dưới lưới,** tính cho khoảng đang xem: "Tháng 10: 12 việc, đã xong 8, còn 4 (1 quá hạn)" hoặc "Tuần này: 5 việc, đã xong 2, còn 3". Nếu có việc chưa có hạn thì thêm "· 3 việc chưa có hạn". Không có việc nào thì ghi "Tháng 10 chưa có việc nào có hạn." hoặc "Tuần này chưa có việc nào có hạn."

**Bấm một ngày:**
- Ô đó được chọn.
- Danh sách bên dưới (thay cho nội dung của mục đang chọn) đổi thành nhóm **"Việc ngày Thứ Năm 22/10"**:
  - việc chưa xong lên trước, việc đã xong xuống sau (gạch ngang);
  - mỗi dòng vẫn là `taskRow`, nên vẫn tick, sửa và dời (⋯, giữ lâu) như thường.
- Đầu nhóm có nút **Bỏ lọc** và **+ Thêm việc ngày này**. Nút thêm mở `taskForm` với hạn là ngày đó.
- Ngày không có việc: "Ngày này không có việc nào." kèm nút + Thêm việc.
- Bấm lại đúng ngày đang chọn thì bỏ lọc. Đổi tuần, đổi tháng hoặc đổi sang mục khác cũng tự bỏ lọc (riêng đổi dạng Tuần | Tháng thì giữ lọc, xem trên).
- Ngày đang lọc chỉ lưu trong `ui`, tải lại app thì mất.
- Đang lọc mà tick xong một việc lặp thì lần mới (ngày khác) không hiện trong nhóm; số trên lưới tự cập nhật.

**Hiệu năng:** tính một lần cho cả khoảng đang xem (gom việc theo `due` như `viewMonth`). Bài đo tab Việc với khoảng 6.400 bản ghi không được chậm hơn rõ rệt so với 2.8.0.

## (b) Lịch nhỏ trên Hôm nay (Tuần | Tháng)

**Vị trí:** ngay dưới ô ghi nhanh, trên thẻ "Tuần qua" (thẻ này chỉ có từ tối Chủ nhật tới thứ Hai) và trên thẻ "Sắp tới hạn".

**Công tắc Tuần | Tháng** ở đầu thẻ (kiểu nút `.seg` như lịch tập). Máy nhớ dạng đang chọn bằng khóa LS `homeCalView`, mặc định là **Tuần**.

**Dạng Tuần:**
- 7 ô từ T2 tới CN của tuần đang xem. Mỗi ô có tên thứ, số ngày và tối đa 3 chấm xếp ngang theo thứ tự việc, học, tập.
- Nút ‹ › để đổi tuần, nút "Tuần này" khi đang xem tuần khác.

**Dạng Tháng:**
- Lưới T2 tới CN của tháng đang xem (5 hoặc 6 hàng, có hàng tên thứ). Mỗi ô có số ngày và tối đa 3 chấm, cùng quy tắc với dạng Tuần.
- Nút ‹ › để đổi tháng, tiêu đề "Tháng 10, 2026", nút "Tháng này" khi đang xem tháng khác. Ngày ngoài tháng thì mờ và không có chấm.

**Chung cho cả hai dạng:**
- Tuần hoặc tháng đang xem chỉ lưu trong `ui`, mở lại app thì về tuần này hoặc tháng này.
- Đổi dạng thì giữ đúng chỗ đang xem: từ Tuần sang Tháng mở tháng chứa tuần đó, từ Tháng sang Tuần mở tuần đầu của tháng đó (hoặc tuần này nếu là tháng này).
- Hôm nay có vòng tròn, ngày đã qua hơi mờ.
- Ô rộng ít nhất 40px, cao ít nhất 44px. Tổng chiều rộng vừa 320px, không cuộn ngang, kể cả chữ to.
- Tính một lần cho cả khoảng đang xem (tối đa 42 ngày): gom việc theo `due`, buổi tập theo ngày, gọi `classesOn` và `gymStatus` từng ngày.

**Bấm một ô:** mở tab Lịch dạng **Tháng** và chọn sẵn ngày đó (`ui.tab = "cal"`, `ui.calView = "month"`, `ui.calMonth`, `ui.calSel`). Lịch theo ngày bên dưới hiện đầy đủ chi tiết.

**Các chấm:**
- **Việc**, tính từ bản ghi `task` có `due` đúng ngày đó và chưa xong (gồm hạn nộp, lịch thi, khoản phải trả, lần lặp đã có bản ghi). Lần lặp sau chưa có bản ghi thì không tính.
  - Ngày đã qua còn việc chưa xong: chấm đỏ (`--danger`), nghĩa là quá hạn.
  - Hôm nay và ngày tới có việc chưa xong: chấm tím (`--task`).
  - Mọi việc đã xong: không có chấm việc.
- **Học** (chấm xanh dương `--cls`): ngày có tiết theo thời khóa biểu, đúng tuần học, bỏ buổi đã báo vắng (`classesOn`). Chỉ hiện khi bật mục Lịch học.
- **Tập** (chấm xanh lá `--gym`), chỉ hiện khi bật mục Tập:
  - Chấm đặc: ngày đã tập (có `workout`).
  - Chấm viền: ngày có buổi theo giáo án mà chưa tập, chỉ từ hôm nay trở đi (`gymStatus` là `planned`).
  - Giáo án Linh hoạt: chỉ hôm nay có chấm viền, và chỉ khi tuần này chưa đủ số buổi (`gymRotWeek`).

**Chú thích** nhỏ dưới lịch: "● Việc ● Học ● Tập". Mục nào đang tắt thì bỏ khỏi chú thích. Có việc quá hạn trong khoảng đang xem thì thêm "● Quá hạn".

**Trình đọc màn hình** đọc được từng ô, ví dụ "Thứ Năm 22/10: 2 việc, có lịch học, đã tập" hoặc "Thứ Ba 13/10: 1 việc quá hạn".

**Thẻ Tập luyện trên Hôm nay:** bỏ `weekGrid(ws, weekDays)`, giữ dòng `gymTodayLine` và dòng "Buổi gần nhất". Hàm `weekGrid` nếu không còn ai gọi thì xóa luôn, cùng CSS không còn dùng.

## Kỹ thuật
- Không thêm trường dữ liệu mới. Chỉ thêm ba khóa LS: `taskCalOff` (thẻ Lịch việc thu gọn), `taskCalView` (Lịch việc đang ở Tuần hay Tháng) và `homeCalView` (lịch nhỏ trên Hôm nay đang ở Tuần hay Tháng).
- Mọi chữ và số chèn vào HTML đều qua `esc()`. Phần tử bấm được là `<button>`. Màu chỉ dùng biến CSS, có chế độ tối (khai báo ở cả hai chỗ).
- Bộ nghe click chung: thêm `data-act` cho đổi tháng, chọn ngày, bỏ lọc, thêm việc, thu gọn, đổi Tuần/Tháng, đổi tuần, đổi tháng và mở ngày.
- Phiên bản **2.9.0**, `hn-v22`.
- Cập nhật tài liệu:
  - README: mục "Mới trong bản 2.9.0", giọng gần gũi.
  - CLAUDE.md: khóa LS mới, các hàm mới.
  - analysis.md: mục "Đợt 2.9.0" ghi quyết định, đánh đổi và rủi ro.

## Kiểm thử (`tests/smoke.py`, giờ giả CN 18/10/2026)
- **Lưới việc:**
  - số trong ô đúng, việc "Đang chờ" có tính;
  - dấu ✓ khi đã xong hết, ngày trống không có gì;
  - số quá hạn màu đỏ, số ngày tới màu tím;
  - chấm lần lặp mờ không tính vào số;
  - dòng tóm tắt đúng.
- **Lọc theo ngày:**
  - bấm ngày thì danh sách chỉ còn việc ngày đó, chưa xong trước, đã xong sau;
  - tick trong nhóm thì số trên lưới đổi;
  - Bỏ lọc, bấm lại cùng ngày, đổi tháng và đổi mục đều bỏ lọc;
  - + Thêm việc ngày này mở form có hạn đúng ngày.
- **Lịch việc Tuần | Tháng:** mặc định Tháng; bấm Tuần ra một hàng 7 ô cùng quy tắc số, ✓, quá hạn; tải lại vẫn là Tuần; ‹ › đổi tuần, nút "Tuần này"; đổi dạng giữ đúng chỗ, đang lọc một ngày thì giữ lọc; tóm tắt theo tuần đúng.
- **Thu gọn:** thu gọn rồi tải lại vẫn thu gọn.
- **Lịch nhỏ trên Hôm nay:**
  - đủ ba loại chấm;
  - chấm việc tím, quá hạn đỏ;
  - chấm tập đặc khi đã tập, viền khi có giáo án theo thứ;
  - giáo án Linh hoạt chỉ có chấm viền hôm nay khi tuần chưa đủ buổi;
  - tắt Lịch học hoặc Tập thì mất chấm và mất chú thích tương ứng;
  - mặc định Tuần; bấm Tháng thì ra lưới tháng có chấm, tải lại vẫn là Tháng;
  - ‹ › đổi tuần (dạng Tuần) và đổi tháng (dạng Tháng), nút "Tuần này" / "Tháng này";
  - đổi dạng giữ đúng chỗ đang xem;
  - bấm ô (ở cả hai dạng) mở tab Lịch dạng Tháng đúng ngày, kể cả khi tab Lịch đang ở dạng Tuần;
  - nhãn cho trình đọc màn hình đúng.
- **Thẻ Tập luyện:** không còn hàng 7 chấm.
- **XSS:** tên việc độc không thành thẻ HTML ở lưới việc, nhóm lọc và nhãn của lịch nhỏ (cả hai dạng).
- **Màn hình:** chụp ảnh 393px và 320px, sáng và tối, chữ to, cho thẻ Lịch việc (Tháng, Tuần, thu gọn, đang lọc) và lịch nhỏ trên Hôm nay (Tuần và Tháng). Không tràn ngang, vùng bấm từ 44px, không có gạch ngang dài.
- **Hiệu năng:** bài đo tab Việc và Hôm nay với dữ liệu lớn.
- **Bài cũ:** mọi bài cũ vẫn qua, không có `pageerror`. Bài nào đang kiểm tra `weekGrid` thì sửa cho đúng quyết định 5.

## Quy trình
1. Làm trên `claude/hn-2.9`. Chạy `node` kiểm tra cú pháp, `tests/smoke.py` và `tests/push_test.mjs`, rồi chụp ảnh và tự xem lại.
2. Commit, push nhánh, mở PR vào `main`. **Không gộp** cho tới khi chủ app đồng ý.
3. Báo lại: link PR, số bài qua, ảnh chụp, những gì chưa kiểm chứng.

## Bổ sung (chủ app chọn "làm hết")
1. **Thu gọn lịch nhỏ trên Hôm nay:** nút thu gọn/mở ở đầu thẻ như Lịch việc, khóa LS `homeCalOff`, mặc định mở. Thu gọn thì chỉ còn đầu thẻ (tiêu đề, công tắc Tuần | Tháng ẩn đi) và một dòng ngắn: "Tuần này: 4 việc, 3 buổi học, đã tập 2".
2. **Vuốt ngang để đổi tuần/tháng** trên cả hai lịch mới (giống tab Lịch): vuốt trái là tuần/tháng sau, vuốt phải là trước. Chỉ tính khi vuốt ngang rõ ràng (dùng chung ngưỡng với tab Lịch: ngang > 60px và gấp 1,5 lần dọc), không chặn cuộn dọc, không ăn vào lúc bấm ô.
3. **Ngày nghỉ lễ** (`LUNAR.holiday(d)` có cờ nghỉ, như ô `.hol` của tab Lịch) có số ngày màu đỏ trên cả hai lịch mới; nhãn trình đọc màn hình thêm tên ngày lễ.
4. **Dấu riêng cho lịch thi** (việc `type: "thi"` chưa xong): hình thoi nhỏ màu đỏ (`--danger`), khác hình tròn của chấm quá hạn, trên cả lịch nhỏ Hôm nay (thêm vào hàng chấm, tối đa 4 dấu: việc, thi, học, tập) và ô của Lịch việc (cạnh số). Chú thích ghi "◆ Thi" (người không phải học sinh, sinh viên: "◆ Quan trọng", như tab Lịch). Ngày thi vẫn tính vào số việc và chấm việc như cũ.
