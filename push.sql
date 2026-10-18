-- Hôm Nay: thông báo nhắc hạn. Chạy một lần trong Supabase → SQL Editor.
create table if not exists public.push_subs (
  endpoint   text primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  tz         int  not null default 420,
  prefs      jsonb not null default '{}'::jsonb,
  ua         text,
  created_at timestamptz not null default now(),
  last_ok    timestamptz
);
alter table public.push_subs enable row level security;
drop policy if exists "push_subs_own" on public.push_subs;
create policy "push_subs_own" on public.push_subs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.push_subs to authenticated;

-- Nhật ký đã gửi (chống gửi trùng) và khóa VAPID: chỉ hàm hn-push (service role) đọc/ghi.
create table if not exists public.push_sent (key text primary key, sent_at timestamptz not null default now());
create table if not exists public.push_config (id int primary key, public_key text not null, private_jwk jsonb not null);
-- Giờ chạy tick gần nhất: nhận ra cron bị ngừng/trễ (ví dụ project vừa được đánh thức) để gửi bù một thông báo gộp.
alter table public.push_config add column if not exists last_tick timestamptz;
alter table public.push_sent enable row level security;
alter table public.push_config enable row level security;
revoke all on public.push_sent, public.push_config from anon, authenticated;

-- Cho hàm hn-push (service_role) đọc/ghi các bảng này.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.push_subs, public.push_sent, public.push_config to service_role;
grant select on public.hn_items to service_role;

-- Khóa bí mật cho action "tick": tạo ngẫu nhiên ngay trong database, cất trong Vault, không ai phải chép hay nhìn thấy.
-- Chạy lại không đổi khóa. Muốn đổi khóa: select vault.update_secret(id, encode(extensions.gen_random_bytes(32), 'hex')) from vault.secrets where name = 'hn_push_secret';
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'hn_push_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'hn_push_secret', 'Khóa để pg_cron gọi hn-push tick');
  end if;
end $$;

-- Hàm hn-push hỏi "khóa này đúng không" mà không đọc khóa ra: true / false / null (Vault chưa có khóa).
create or replace function public.hn_push_secret_ok(k text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'hn_push_secret' limit 1) = k;
$$;
revoke all on function public.hn_push_secret_ok(text) from public, anon, authenticated;
grant execute on function public.hn_push_secret_ok(text) to service_role;

-- Chạy hàm hn-push mỗi 5 phút, gửi kèm khóa trong header x-hn-secret (đọc từ Vault lúc chạy).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.unschedule(jobid) from cron.job where jobname = 'hn-push-tick';
select cron.schedule('hn-push-tick', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://iqzhkvwybnsxyclxhjcs.supabase.co/functions/v1/hn-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-hn-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'hn_push_secret')
    ),
    body := '{"action": "tick"}'::jsonb
  );
$$);
