-- Fix: migration 004 re-introduced the generated column bug.
-- price_per_unit is GENERATED ALWAYS (total_price / quantity) — cannot be inserted explicitly.
-- Keep p_price_per_unit param for weighted-avg calc; omit from INSERT.

CREATE OR REPLACE FUNCTION public.record_purchase(
  p_user_id        uuid,
  p_item_id        uuid,
  p_quantity       numeric,
  p_total_price    numeric,
  p_price_per_unit numeric,
  p_created_at     timestamptz DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_stock     numeric;
  v_current_avg_price numeric;
  v_new_avg_price     numeric;
  v_new_stock         numeric;
BEGIN
  SELECT stock, avg_price
    INTO v_current_stock, v_current_avg_price
    FROM public.items
   WHERE id = p_item_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found';
  END IF;

  v_new_stock := v_current_stock + p_quantity;
  IF v_new_stock > 0 THEN
    v_new_avg_price := (v_current_stock * v_current_avg_price + p_quantity * p_price_per_unit) / v_new_stock;
  ELSE
    v_new_avg_price := p_price_per_unit;
  END IF;

  UPDATE public.items
     SET avg_price = v_new_avg_price,
         stock     = v_new_stock
   WHERE id = p_item_id AND user_id = p_user_id;

  -- price_per_unit is GENERATED ALWAYS (total_price / quantity) — omit from INSERT
  INSERT INTO public.purchases (user_id, item_id, quantity, total_price, created_at)
  VALUES (p_user_id, p_item_id, p_quantity, p_total_price, COALESCE(p_created_at, now()));
END;
$$;
