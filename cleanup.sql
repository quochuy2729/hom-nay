-- Hôm Nay: dọn bản ghi đã xóa (tombstone) trên server và thu hồi quyền xóa trực tiếp. Bản 2.8.0.
-- Chạy trong Supabase → SQL Editor → Run (sau setup.sql). Chạy lại nhiều lần không lỗi.
--
-- Vì sao giữ 90 ngày: điện thoại tự dọn tombstone sau 60 ngày (gcTombstones trong app.js), nên server phải giữ lâu hơn
-- để máy offline lâu (tới 90 ngày) vẫn nhận được lệnh xóa khi kéo về. Máy offline hơn 90 ngày thì mục đã xóa có thể
-- còn trên máy đó (không sống lại trên server trừ khi sửa mục đó trên máy đó).
-- Tính theo server_at (lúc server nhận lệnh xóa), không theo updated_at (giờ của điện thoại, có thể lệch).

create extension if not exists pg_cron;

-- Mỗi ngày 3:17 sáng giờ Việt Nam (20:17 UTC) xóa hẳn các dòng deleted = true đã nhận quá 90 ngày.
select cron.unschedule(jobid) from cron.job where jobname = 'hn-items-gc';
select cron.schedule('hn-items-gc', '17 20 * * *', $$
  delete from public.hn_items where deleted = true and server_at < now() - interval '90 days';
$$);

-- App không bao giờ xóa thẳng dòng trong hn_items: xóa là ghi deleted = true qua RPC hn_push (insert ... on conflict do update,
-- cần insert, update, select). Thu hồi delete để một phiên đăng nhập bị lộ không xóa hẳn được dữ liệu (kể cả tombstone
-- mà máy khác cần để biết mục đã xóa). Job pg_cron ở trên chạy bằng quyền postgres nên vẫn xóa được.
revoke delete on public.hn_items from anon, authenticated;

-- Kiểm tra sau khi chạy:
--   select jobname, schedule from cron.job where jobname = 'hn-items-gc';
--   select has_table_privilege('authenticated', 'public.hn_items', 'delete');   -- phải là false
--   select count(*) from public.hn_items where deleted and server_at < now() - interval '90 days';   -- số dòng sẽ dọn lần tới
