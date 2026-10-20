-- Hôm Nay: chạy toàn bộ tệp này một lần trong Supabase → SQL Editor → Run.
-- Chạy lại nhiều lần không lỗi. Project hiện chỉ dùng cho Hôm Nay (phần của app Lưới Thói Quen đã xóa ngày 18/10/2026).

create table if not exists public.hn_items (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind        text not null,
  data        jsonb not null default '{}'::jsonb,
  deleted     boolean not null default false,
  updated_at  timestamptz not null,               -- giờ sửa trên điện thoại (bản mới hơn thắng)
  server_at   timestamptz not null default now()  -- giờ server nhận, để máy khác kéo về
);
create index if not exists hn_items_user_server_at on public.hn_items (user_id, server_at);
-- Mỗi bản ghi tối đa 256KB, để không ai dùng database làm kho chứa tùy ý. Chạy lại không lỗi.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'hn_items_data_size') then
    alter table public.hn_items add constraint hn_items_data_size check (pg_column_size(data) < 262144) not valid;
  end if;
end $$;

alter table public.hn_items enable row level security;
drop policy if exists "hn_items_own" on public.hn_items;
create policy "hn_items_own" on public.hn_items
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Gửi nhiều thay đổi một lần; chỉ ghi đè khi bản gửi lên mới hơn bản trên server.
create or replace function public.hn_push(rows jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  insert into public.hn_items as t (id, user_id, kind, data, deleted, updated_at, server_at)
  select (r->>'id')::uuid,
         auth.uid(),
         r->>'kind',
         coalesce(r->'data', '{}'::jsonb),
         coalesce((r->>'deleted')::boolean, false),
         (r->>'updated_at')::timestamptz,
         clock_timestamp()
  from jsonb_array_elements(rows) as r
  on conflict (id) do update
    set kind = excluded.kind,
        data = excluded.data,
        deleted = excluded.deleted,
        updated_at = excluded.updated_at,
        server_at = clock_timestamp()
    where t.user_id = auth.uid()
      and t.updated_at < excluded.updated_at;
end;
$$;

revoke all on function public.hn_push(jsonb) from public, anon;
grant execute on function public.hn_push(jsonb) to authenticated;
-- Không cấp delete: app xóa bằng cách ghi deleted = true qua hn_push. Dọn tombstone cũ do job trong cleanup.sql (2.8).
grant select, insert, update on public.hn_items to authenticated;
revoke delete on public.hn_items from anon, authenticated;

-- Realtime: máy kia thấy thay đổi gần như ngay lập tức.
do $$
begin
  alter publication supabase_realtime add table public.hn_items;
exception when duplicate_object then null;
          when undefined_object then null;
end $$;
