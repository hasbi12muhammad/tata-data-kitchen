-- ── delete_production ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_production(
  p_user_id       uuid,
  p_production_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipe_id     uuid;
  v_batches       numeric;
  v_total_cost    numeric;
  v_current_stock numeric;
  v_current_avg   numeric;
  v_new_stock     numeric;
  v_new_avg       numeric;
  v_ri            record;
BEGIN
  SELECT recipe_id, batches, total_cost
    INTO v_recipe_id, v_batches, v_total_cost
    FROM public.productions
   WHERE id = p_production_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production not found';
  END IF;

  SELECT stock, avg_price
    INTO v_current_stock, v_current_avg
    FROM public.recipes
   WHERE id = v_recipe_id AND user_id = p_user_id;

  v_new_stock := v_current_stock - v_batches;

  IF v_new_stock > 0 THEN
    v_new_avg := GREATEST(0, (v_current_stock * v_current_avg - v_total_cost) / v_new_stock);
  ELSE
    v_new_avg := 0;
  END IF;

  UPDATE public.recipes
     SET stock     = v_new_stock,
         avg_price = v_new_avg
   WHERE id = v_recipe_id AND user_id = p_user_id;

  FOR v_ri IN
    SELECT ri.item_id, ri.quantity_used
      FROM public.recipe_items ri
     WHERE ri.recipe_id = v_recipe_id AND ri.item_id IS NOT NULL
  LOOP
    UPDATE public.items
       SET stock = stock + (v_ri.quantity_used * v_batches)
     WHERE id = v_ri.item_id AND user_id = p_user_id;
  END LOOP;

  DELETE FROM public.productions
   WHERE id = p_production_id AND user_id = p_user_id;
END;
$$;

-- ── update_production ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_production(
  p_user_id       uuid,
  p_production_id uuid,
  p_batches       numeric,
  p_total_cost    numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recipe_id     uuid;
  v_old_batches   numeric;
  v_old_cost      numeric;
  v_current_stock numeric;
  v_current_avg   numeric;
  v_new_stock     numeric;
  v_new_avg       numeric;
  v_ri            record;
BEGIN
  SELECT recipe_id, batches, total_cost
    INTO v_recipe_id, v_old_batches, v_old_cost
    FROM public.productions
   WHERE id = p_production_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production not found';
  END IF;

  SELECT stock, avg_price
    INTO v_current_stock, v_current_avg
    FROM public.recipes
   WHERE id = v_recipe_id AND user_id = p_user_id;

  v_new_stock := v_current_stock - v_old_batches + p_batches;

  IF v_new_stock > 0 THEN
    v_new_avg := GREATEST(0, (v_current_stock * v_current_avg - v_old_cost + p_total_cost) / v_new_stock);
  ELSE
    v_new_avg := 0;
  END IF;

  UPDATE public.recipes
     SET stock     = v_new_stock,
         avg_price = v_new_avg
   WHERE id = v_recipe_id AND user_id = p_user_id;

  FOR v_ri IN
    SELECT ri.item_id, ri.quantity_used
      FROM public.recipe_items ri
     WHERE ri.recipe_id = v_recipe_id AND ri.item_id IS NOT NULL
  LOOP
    UPDATE public.items
       SET stock = stock + (v_ri.quantity_used * (v_old_batches - p_batches))
     WHERE id = v_ri.item_id AND user_id = p_user_id;
  END LOOP;

  UPDATE public.productions
     SET batches    = p_batches,
         total_cost = p_total_cost
   WHERE id = p_production_id AND user_id = p_user_id;
END;
$$;
