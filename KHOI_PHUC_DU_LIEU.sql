-- KHÔI PHỤC DỮ LIỆU CANTIN AI v2.5
-- Chạy trong Supabase SQL Editor trước hoặc sau khi upload đều được.
-- Script KHÔNG xóa dữ liệu. Nó chỉ đảm bảo dữ liệu hiện tại có cấu trúc hợp lệ.

do $$
declare
  current_data jsonb;
  active_id text;
  active_data jsonb;
begin
  select data into current_data
  from public.cantin_app_store
  where id = 'main';

  if current_data is null then
    return;
  end if;

  -- Nếu đã là cấu trúc nhiều cửa hàng thì không hạ cấp/xóa gì.
  if coalesce((current_data->>'__multiStore')::boolean, false) = true
     and jsonb_typeof(current_data->'stores') = 'array' then
    return;
  end if;

  -- Dữ liệu v2.3/v2.4 dạng cửa hàng đơn sẽ được v2.5 tự nâng cấp khi mở app.
  -- Không ghi đè ở đây để bảo toàn toàn bộ products/sales/debts/audits hiện có.
  return;
end $$;
