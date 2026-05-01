-- Update an existing purchase: adjusts stock delta and recalculates weighted avg price.
CREATE OR REPLACE FUNCTION public.update_purchase(
  p_purchase_id uuid,
  p_user_id     uuid,
  p_quantity    numeric,
  p_total_price numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item_id       uuid;
  v_old_quantity  numeric;
  v_old_avg       numeric;
  v_new_avg       numeric;
BEGIN
  SELECT item_id, quantity INTO v_item_id, v_old_quantity
    FROM public.purchases
   WHERE id = p_purchase_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase not found';
  END IF;

  -- Update purchase record (price_per_unit is generated, omit it)
  UPDATE public.purchases
     SET quantity    = p_quantity,
         total_price = p_total_price
   WHERE id = p_purchase_id AND user_id = p_user_id;

  -- Adjust item stock by the quantity delta
  UPDATE public.items
     SET stock = stock + (p_quantity - v_old_quantity)
   WHERE id = v_item_id AND user_id = p_user_id;

  -- Recalculate avg_price as weighted average across ALL purchases for this item
  SELECT SUM(total_price) / NULLIF(SUM(quantity), 0) INTO v_new_avg
    FROM public.purchases
   WHERE item_id = v_item_id AND user_id = p_user_id;

  SELECT avg_price INTO v_old_avg
    FROM public.items
   WHERE id = v_item_id AND user_id = p_user_id;

  UPDATE public.items
     SET prev_avg_price = v_old_avg,
         avg_price      = COALESCE(v_new_avg, 0)
   WHERE id = v_item_id AND user_id = p_user_id;
END;
$$;
