-- Delete a purchase: reduces stock and recalculates weighted avg price from remaining purchases.
CREATE OR REPLACE FUNCTION public.delete_purchase(
  p_purchase_id uuid,
  p_user_id     uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item_id  uuid;
  v_quantity numeric;
  v_old_avg  numeric;
  v_new_avg  numeric;
BEGIN
  -- Fetch purchase to be deleted
  SELECT item_id, quantity
    INTO v_item_id, v_quantity
    FROM public.purchases
   WHERE id = p_purchase_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase not found';
  END IF;

  -- Delete the record
  DELETE FROM public.purchases
   WHERE id = p_purchase_id AND user_id = p_user_id;

  -- Reduce stock by deleted quantity
  UPDATE public.items
     SET stock = stock - v_quantity
   WHERE id = v_item_id AND user_id = p_user_id;

  -- Save current avg before recalculating
  SELECT avg_price INTO v_old_avg
    FROM public.items
   WHERE id = v_item_id AND user_id = p_user_id;

  -- Recalculate avg_price from all remaining purchases for this item
  SELECT SUM(total_price) / NULLIF(SUM(quantity), 0) INTO v_new_avg
    FROM public.purchases
   WHERE item_id = v_item_id AND user_id = p_user_id;

  UPDATE public.items
     SET prev_avg_price = v_old_avg,
         avg_price      = COALESCE(v_new_avg, 0)
   WHERE id = v_item_id AND user_id = p_user_id;
END;
$$;
