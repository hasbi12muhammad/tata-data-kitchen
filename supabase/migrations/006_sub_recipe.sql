-- supabase/migrations/006_sub_recipe.sql

-- ── 1. Extend recipes ──────────────────────────────────────────────────────
ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS is_ingredient boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unit          text     CHECK (unit IN ('gr','ml','pcs','kg','liter')),
  ADD COLUMN IF NOT EXISTS stock         numeric(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_price     numeric(15,4) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'unit_required_for_ingredient'
       AND conrelid = 'public.recipes'::regclass
  ) THEN
    ALTER TABLE public.recipes
      ADD CONSTRAINT unit_required_for_ingredient
        CHECK (NOT is_ingredient OR unit IS NOT NULL);
  END IF;
END;
$$;

-- ── 2. Extend recipe_items ────────────────────────────────────────────────
ALTER TABLE public.recipe_items
  ADD COLUMN IF NOT EXISTS sub_recipe_id uuid REFERENCES public.recipes(id) ON DELETE RESTRICT;

ALTER TABLE public.recipe_items
  ALTER COLUMN item_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'one_ingredient_source'
       AND conrelid = 'public.recipe_items'::regclass
  ) THEN
    ALTER TABLE public.recipe_items
      ADD CONSTRAINT one_ingredient_source
        CHECK ((item_id IS NOT NULL) != (sub_recipe_id IS NOT NULL));
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'no_self_reference'
       AND conrelid = 'public.recipe_items'::regclass
  ) THEN
    ALTER TABLE public.recipe_items
      ADD CONSTRAINT no_self_reference
        CHECK (sub_recipe_id IS DISTINCT FROM recipe_id);
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS recipe_items_unique_sub_recipe
  ON public.recipe_items (recipe_id, sub_recipe_id)
  WHERE sub_recipe_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS recipe_items_sub_recipe_idx
  ON public.recipe_items (sub_recipe_id)
  WHERE sub_recipe_id IS NOT NULL;

-- ── 3. Tabel productions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.productions (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipe_id   uuid        NOT NULL REFERENCES public.recipes(id) ON DELETE RESTRICT,
  batches     numeric(15,4) NOT NULL CHECK (batches > 0),
  total_cost  numeric(15,2) NOT NULL CHECK (total_cost >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.productions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_productions" ON public.productions;
CREATE POLICY "users_own_productions" ON public.productions
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS productions_user_created_idx
  ON public.productions (user_id, created_at DESC);

-- ── 4. RPC: produce_sub_recipe ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.produce_sub_recipe(
  p_user_id    uuid,
  p_recipe_id  uuid,
  p_batches    numeric,
  p_total_cost numeric,
  p_created_at timestamptz DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_stock numeric;
  v_current_avg   numeric;
  v_new_stock     numeric;
  v_new_avg       numeric;
  v_ri            record;
BEGIN
  SELECT stock, avg_price
    INTO v_current_stock, v_current_avg
    FROM public.recipes
   WHERE id = p_recipe_id AND user_id = p_user_id AND is_ingredient = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sub-recipe not found or not marked as ingredient';
  END IF;

  v_new_stock := v_current_stock + p_batches;

  IF v_new_stock > 0 THEN
    v_new_avg := (v_current_stock * v_current_avg + p_total_cost) / v_new_stock;
  ELSE
    v_new_avg := CASE WHEN p_batches > 0 THEN p_total_cost / p_batches ELSE 0 END;
  END IF;

  UPDATE public.recipes
     SET stock     = v_new_stock,
         avg_price = v_new_avg
   WHERE id = p_recipe_id AND user_id = p_user_id;

  FOR v_ri IN
    SELECT ri.item_id, ri.quantity_used
      FROM public.recipe_items ri
     WHERE ri.recipe_id = p_recipe_id AND ri.item_id IS NOT NULL
  LOOP
    UPDATE public.items
       SET stock = stock - (v_ri.quantity_used * p_batches)
     WHERE id = v_ri.item_id AND user_id = p_user_id;
  END LOOP;

  INSERT INTO public.productions (user_id, recipe_id, batches, total_cost, created_at)
  VALUES (p_user_id, p_recipe_id, p_batches, p_total_cost, COALESCE(p_created_at, now()));
END;
$$;

-- ── 5. RPC: deduct_sub_recipe_stock ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.deduct_sub_recipe_stock(
  p_user_id   uuid,
  p_recipe_id uuid,
  p_quantity  numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.recipes
     SET stock = stock - p_quantity
   WHERE id = p_recipe_id AND user_id = p_user_id;
END;
$$;
