-- Cantin AI v2.3 NO LOGIN
-- Chạy 1 lần trong Supabase > SQL Editor > New query > Run.
-- Sau khi chạy, web có thể đọc/ghi dữ liệu mà không cần nhập PIN.
-- Lưu ý: ai có link web đều có thể truy cập dữ liệu.

create or replace function public.cantin_read_store_public()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select data
  from public.cantin_app_store
  where id = 'main'
  limit 1;
$$;

create or replace function public.cantin_write_store_public(p_data jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cantin_app_store (id, data, updated_at)
  values ('main', p_data, now())
  on conflict (id)
  do update set
    data = excluded.data,
    updated_at = now();

  return true;
end;
$$;

grant execute on function public.cantin_read_store_public() to anon, authenticated;
grant execute on function public.cantin_write_store_public(jsonb) to anon, authenticated;
