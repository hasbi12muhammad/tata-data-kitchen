-- Fix: price_per_unit is a generated column, cannot be inserted explicitly.
-- Update record_purchase to omit it from INSERT; the DB computes it automatically.

create or replace function public.record_purchase(
  p_user_id        uuid,
  p_item_id        uuid,
  p_quantity       numeric,
  p_total_price    numeric,
  p_price_per_unit numeric  -- still used for weighted avg calc
) returns void
language plpgsql
security definer
as $$
declare
  v_current_stock     numeric;
  v_current_avg_price numeric;
  v_new_avg_price     numeric;
  v_new_stock         numeric;
begin
  select stock, avg_price
    into v_current_stock, v_current_avg_price
    from public.items
   where id = p_item_id and user_id = p_user_id;

  if not found then
    raise exception 'Item not found';
  end if;

  -- Weighted average: (old_stock * old_price + new_qty * new_price) / (old_stock + new_qty)
  v_new_stock := v_current_stock + p_quantity;
  if v_new_stock > 0 then
    v_new_avg_price := (v_current_stock * v_current_avg_price + p_quantity * p_price_per_unit) / v_new_stock;
  else
    v_new_avg_price := p_price_per_unit;
  end if;

  update public.items
     set avg_price = v_new_avg_price,
         stock     = v_new_stock
   where id = p_item_id and user_id = p_user_id;

  -- price_per_unit is a generated column — omit from INSERT, DB computes it automatically
  insert into public.purchases (user_id, item_id, quantity, total_price)
  values (p_user_id, p_item_id, p_quantity, p_total_price);
end;
$$;
