-- CANTIN AI v2.8 - ĐỒNG BỘ CÔNG NỢ CHÍNH XÁC TỪ VIDEO 08/08/2026
-- 36 người, tổng còn nợ = 4.412.000 đ.
-- Chỉ thay phần debts của cửa hàng hiện tại; không đụng products, sales, tồn kho, nhập kho, kiểm kho.

do $$
declare
  v_root jsonb;
  v_store jsonb;
  v_targets jsonb := '[{"name": "Đang", "balance": 1103000}, {"name": "Vương", "balance": 474000}, {"name": "Phóng", "balance": 460000}, {"name": "Chú Bình", "balance": 192000}, {"name": "Linh TĐT", "balance": 169000}, {"name": "Đức Anh TT63", "balance": 168000}, {"name": "Hưởng", "balance": 164000}, {"name": "Đức TP67", "balance": 159000}, {"name": "Trung công tác", "balance": 156000}, {"name": "M. Linh", "balance": 152000}, {"name": "Sơn DT", "balance": 150000}, {"name": "Cảnh PCN", "balance": 142000}, {"name": "Đinh Thành 67", "balance": 138000}, {"name": "Chú Quang", "balance": 120000}, {"name": "Đông PCN", "balance": 120000}, {"name": "Lâm KT", "balance": 78000}, {"name": "Thắng", "balance": 60000}, {"name": "Tường VB", "balance": 54000}, {"name": "Văn đội xe", "balance": 54000}, {"name": "Tuấn 714", "balance": 52000}, {"name": "Hải XM", "balance": 51000}, {"name": "Hòa VB", "balance": 43000}, {"name": "Nguyên PCN", "balance": 42000}, {"name": "Chất", "balance": 36000}, {"name": "Hùng Tác Chiến", "balance": 30000}, {"name": "Hùng TP63", "balance": 30000}, {"name": "Toàn 714", "balance": 15000}, {"name": "Cả", "balance": 0}, {"name": "Đồng VB", "balance": 0}, {"name": "Đức bự", "balance": 0}, {"name": "Khương", "balance": 0}, {"name": "Liêm", "balance": 0}, {"name": "Long 714", "balance": 0}, {"name": "Phú 67", "balance": 0}, {"name": "Quang TT", "balance": 0}, {"name": "Quỳnh 67", "balance": 0}]'::jsonb;
  v_new_debts jsonb := '[]'::jsonb;
  v_t jsonb;
  v_c jsonb;
  v_customer_id text;
  v_name text;
  v_balance numeric;
  v_active_id text;
  v_idx integer := 0;
  v_i integer;
  v_found boolean := false;
begin
  select data into v_root
  from public.cantin_app_store
  where id='main'
  for update;

  if v_root is null then
    raise exception 'Không tìm thấy dữ liệu cửa hàng main';
  end if;

  if coalesce((v_root->>'__multiStore')::boolean,false)
     and jsonb_typeof(v_root->'stores')='array'
     and jsonb_array_length(v_root->'stores')>0 then
    v_active_id := v_root->>'activeStoreId';
    for v_i in 0..jsonb_array_length(v_root->'stores')-1 loop
      if v_root->'stores'->v_i->>'id'=v_active_id then v_idx:=v_i; v_found:=true; exit; end if;
    end loop;
    if not v_found then v_idx:=0; end if;
    v_store := coalesce(v_root->'stores'->v_idx->'data','{}'::jsonb);
  else
    v_store := v_root;
  end if;

  if jsonb_typeof(v_store->'customers') <> 'array' then
    raise exception 'Danh sách customers không hợp lệ';
  end if;

  for v_t in select * from jsonb_array_elements(v_targets)
  loop
    v_name := v_t->>'name';
    v_balance := (v_t->>'balance')::numeric;

    select c into v_c
    from jsonb_array_elements(v_store->'customers') c
    where lower(trim(c->>'name')) = lower(trim(v_name))
    limit 1;

    if v_c is null then
      raise exception 'Không tìm thấy khách hàng: %', v_name;
    end if;

    v_customer_id := v_c->>'id';

    if v_balance > 0 then
      v_new_debts := v_new_debts || jsonb_build_array(
        jsonb_build_object(
          'id','video-' || md5(v_customer_id || '-2026-08-08'),
          'customerId',v_customer_id,
          'amount',v_balance,
          'paid',0,
          'balance',v_balance,
          'note','Số dư công nợ chuẩn theo video 08/08/2026',
          'createdAt','2026-08-08T01:23:30.000Z',
          'payments','[]'::jsonb,
          'source','video_exact_2026_08_08'
        )
      );
    end if;
  end loop;

  v_store := jsonb_set(v_store,'{debts}',v_new_debts,true);
  v_store := jsonb_set(v_store,'{meta,videoDebtSyncVersion}','"video-exact-2026-08-08"'::jsonb,true);
  v_store := jsonb_set(v_store,'{meta,videoDebtTotal}','4412000'::jsonb,true);

  if coalesce((v_root->>'__multiStore')::boolean,false) then
    v_root := jsonb_set(v_root,array['stores',v_idx::text,'data'],v_store,true);
  else
    v_root := v_store;
  end if;

  update public.cantin_app_store set data=v_root,updated_at=now() where id='main';
end $$;

-- KIỂM TRA: phải ra 36 khách và tổng nợ 4.412.000
with d as (
  select data from public.cantin_app_store where id='main'
), s as (
  select case
    when coalesce((data->>'__multiStore')::boolean,false)
    then (select x->'data' from jsonb_array_elements(data->'stores') x where x->>'id'=data->>'activeStoreId' limit 1)
    else data end as store
  from d
)
select
  jsonb_array_length(store->'customers') as so_khach,
  jsonb_array_length(store->'debts') as so_khoan_con_no,
  (select coalesce(sum((x->>'balance')::numeric),0) from jsonb_array_elements(store->'debts') x) as tong_con_no
from s;
