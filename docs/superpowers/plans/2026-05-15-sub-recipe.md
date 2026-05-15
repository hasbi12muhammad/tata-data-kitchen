# Sub-Recipe (Semi-Finished Good) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the sub-recipe / semi-finished good feature from tata-data-dapur to tata-data-kitchen, enabling recipes to be used as ingredients in other recipes, with production tracking on the Purchases page and automatic stock deduction on sale.

**Architecture:** Surgical patch — add new fields/hooks/UI sections without touching existing logic. Eight files modified, two created. No test infrastructure exists in this project; use `npm run build` (TypeScript compile) as the verification gate after each task.

**Tech Stack:** Next.js 15, TypeScript, Supabase (PostgreSQL + RPC), TanStack Query v5, Tailwind CSS, Lucide React

---

## File Map

| Action | File |
|---|---|
| Create | `supabase/migrations/006_sub_recipe.sql` |
| Create | `supabase/migrations/007_production_crud.sql` |
| Modify | `src/types/index.ts` |
| Modify | `src/hooks/useRecipes.ts` |
| Modify | `src/hooks/usePurchases.ts` |
| Modify | `src/hooks/useSales.ts` |
| Modify | `src/app/recipes/page.tsx` |
| Modify | `src/app/purchases/page.tsx` |
| Modify | `src/app/sales/page.tsx` |

---

## Task 1: Database Migrations

**Files:**
- Create: `supabase/migrations/006_sub_recipe.sql`
- Create: `supabase/migrations/007_production_crud.sql`

- [ ] **Step 1: Create 006_sub_recipe.sql**

Create file `supabase/migrations/006_sub_recipe.sql` with this exact content:

```sql
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
```

- [ ] **Step 2: Create 007_production_crud.sql**

Create file `supabase/migrations/007_production_crud.sql` with this exact content:

```sql
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
```

- [ ] **Step 3: Apply migrations to Supabase**

Go to your Supabase project dashboard → SQL Editor, and run each file in order:
1. Run content of `006_sub_recipe.sql`
2. Run content of `007_production_crud.sql`

Expected: no errors, tables and RPCs created.

- [ ] **Step 4: Commit**

```bash
git -C /home/gbk/Project/tata-data-kitchen add supabase/migrations/006_sub_recipe.sql supabase/migrations/007_production_crud.sql
git -C /home/gbk/Project/tata-data-kitchen commit -m "feat: add sub-recipe migrations (006 + 007)"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Update Recipe interface**

In `src/types/index.ts`, replace the `Recipe` interface:

```ts
// BEFORE:
export interface Recipe {
  id: string;
  user_id: string;
  name: string;
  hpp: number;
  prev_hpp: number;
  created_at: string;
  recipe_items?: RecipeItem[];
}

// AFTER:
export interface Recipe {
  id: string;
  user_id: string;
  name: string;
  hpp: number;
  prev_hpp: number;
  is_ingredient: boolean;
  unit?: "gr" | "ml" | "pcs" | "kg" | "liter";
  stock: number;
  avg_price: number;
  created_at: string;
  recipe_items?: RecipeItem[];
}
```

- [ ] **Step 2: Update RecipeItem interface**

Replace the `RecipeItem` interface:

```ts
// BEFORE:
export interface RecipeItem {
  id: string;
  recipe_id: string;
  item_id: string;
  quantity_used: number;
  item?: Item;
}

// AFTER:
export interface RecipeItem {
  id: string;
  recipe_id: string;
  item_id?: string | null;
  sub_recipe_id?: string | null;
  quantity_used: number;
  item?: Item;
  sub_recipe?: Recipe;
}
```

- [ ] **Step 3: Add Production interface**

After the `RecipeItem` interface, add:

```ts
export interface Production {
  id: string;
  user_id: string;
  recipe_id: string;
  batches: number;
  total_cost: number;
  created_at: string;
  recipe?: Recipe;
}
```

- [ ] **Step 4: Verify types compile**

```bash
cd /home/gbk/Project/tata-data-kitchen && npx tsc --noEmit 2>&1 | head -30
```

Expected: errors only in hook/page files that use the old type shapes — not in `types/index.ts` itself.

- [ ] **Step 5: Commit**

```bash
git -C /home/gbk/Project/tata-data-kitchen add src/types/index.ts
git -C /home/gbk/Project/tata-data-kitchen commit -m "feat: extend Recipe, RecipeItem types; add Production type"
```

---

## Task 3: useRecipes Hook

**Files:**
- Modify: `src/hooks/useRecipes.ts`

- [ ] **Step 1: Replace calcHPP with recursive exported version**

In `src/hooks/useRecipes.ts`, replace the existing `function calcHPP` (currently private, at bottom) with this exported version at the **top** of the file (before `useRecipes`):

```ts
export function calcHPP(items: RecipeItem[], usePrev: boolean): number {
  return items.reduce((sum, ri) => {
    if (ri.sub_recipe_id && ri.sub_recipe) {
      const subItems = ri.sub_recipe.recipe_items ?? [];
      const subHPP = calcHPP(subItems, usePrev);
      return sum + subHPP * ri.quantity_used;
    }
    const item = ri.item;
    const price = usePrev
      ? (item?.prev_avg_price || item?.avg_price || 0)
      : (item?.avg_price ?? 0);
    return sum + price * ri.quantity_used;
  }, 0);
}
```

Delete the old private `function calcHPP` at the bottom of the file.

- [ ] **Step 2: Update useRecipes query to include sub_recipe**

Replace the `queryFn` inside `useRecipes`:

```ts
queryFn: async () => {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("recipes")
    .select(
      `*, recipe_items!recipe_id(
        *,
        item:items(name, unit, avg_price, prev_avg_price),
        sub_recipe:recipes!sub_recipe_id(
          id, name, unit, stock, avg_price, is_ingredient,
          recipe_items!recipe_id(
            quantity_used, item_id,
            item:items(name, unit, avg_price, prev_avg_price)
          )
        )
      )`
    )
    .order("name");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    is_ingredient: r.is_ingredient ?? false,
    stock: r.stock ?? 0,
    avg_price: r.avg_price ?? 0,
    hpp: calcHPP(r.recipe_items ?? [], false),
    prev_hpp: calcHPP(r.recipe_items ?? [], true),
  }));
},
```

- [ ] **Step 3: Update useCreateRecipe to support is_ingredient + sub_recipe_id**

Replace the `mutationFn` in `useCreateRecipe`:

```ts
mutationFn: async (payload: {
  name: string;
  is_ingredient?: boolean;
  unit?: string | null;
  items: Array<{
    item_id?: string | null;
    sub_recipe_id?: string | null;
    quantity_used: number;
  }>;
}) => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: recipe, error: re } = await supabase
    .from("recipes")
    .insert({
      name: payload.name,
      user_id: user!.id,
      is_ingredient: payload.is_ingredient ?? false,
      unit: payload.unit ?? null,
    })
    .select()
    .single();
  if (re) throw re;

  const { error: rie } = await supabase.from("recipe_items").insert(
    payload.items.map((i) => ({
      recipe_id: recipe.id,
      item_id: i.item_id ?? null,
      sub_recipe_id: i.sub_recipe_id ?? null,
      quantity_used: i.quantity_used,
    }))
  );
  if (rie) throw rie;
},
```

- [ ] **Step 4: Update useUpdateRecipe to support is_ingredient + sub_recipe_id**

Replace the `mutationFn` in `useUpdateRecipe`:

```ts
mutationFn: async (payload: {
  id: string;
  name: string;
  is_ingredient?: boolean;
  unit?: string | null;
  items: Array<{
    item_id?: string | null;
    sub_recipe_id?: string | null;
    quantity_used: number;
  }>;
}) => {
  const supabase = createClient();
  const { error: re } = await supabase
    .from("recipes")
    .update({
      name: payload.name,
      is_ingredient: payload.is_ingredient ?? false,
      unit: payload.unit ?? null,
    })
    .eq("id", payload.id);
  if (re) throw re;

  const { error: de } = await supabase
    .from("recipe_items")
    .delete()
    .eq("recipe_id", payload.id);
  if (de) throw de;

  const { error: ie } = await supabase.from("recipe_items").insert(
    payload.items.map((i) => ({
      recipe_id: payload.id,
      item_id: i.item_id ?? null,
      sub_recipe_id: i.sub_recipe_id ?? null,
      quantity_used: i.quantity_used,
    }))
  );
  if (ie) throw ie;
},
```

- [ ] **Step 5: Verify types compile**

```bash
cd /home/gbk/Project/tata-data-kitchen && npx tsc --noEmit 2>&1 | head -30
```

Expected: errors only in page files (recipes/page.tsx) — not in the hook file itself.

- [ ] **Step 6: Commit**

```bash
git -C /home/gbk/Project/tata-data-kitchen add src/hooks/useRecipes.ts
git -C /home/gbk/Project/tata-data-kitchen commit -m "feat: recursive calcHPP, sub_recipe query, create/update support is_ingredient"
```

---

## Task 4: usePurchases Hook — Production Hooks

**Files:**
- Modify: `src/hooks/usePurchases.ts`

- [ ] **Step 1: Add Production import**

At the top of `src/hooks/usePurchases.ts`, update the import from `@/types`:

```ts
// BEFORE:
import { Purchase } from "@/types";

// AFTER:
import { Purchase, Production } from "@/types";
```

- [ ] **Step 2: Append 4 production hooks to end of file**

Add these four functions at the end of `src/hooks/usePurchases.ts`:

```ts
export function useProductions() {
  return useQuery<Production[]>({
    queryKey: ["productions"],
    queryFn: async (): Promise<Production[]> => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("productions")
        .select("*, recipe:recipes(name, unit)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useProduceSubRecipe() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (p: {
      recipe_id: string;
      batches: number;
      total_cost: number;
      date?: string;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.rpc("produce_sub_recipe", {
        p_user_id: user!.id,
        p_recipe_id: p.recipe_id,
        p_batches: p.batches,
        p_total_cost: p.total_cost,
        ...(p.date ? { p_created_at: new Date(p.date).toISOString() } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["productions"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["recipes"] });
      toast.success("Production recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteProduction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.rpc("delete_production", {
        p_production_id: id,
        p_user_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["productions"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["recipes"] });
      toast.success("Production deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateProduction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; batches: number; total_cost: number }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.rpc("update_production", {
        p_production_id: p.id,
        p_user_id: user!.id,
        p_batches: p.batches,
        p_total_cost: p.total_cost,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["productions"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["recipes"] });
      toast.success("Production updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
```

- [ ] **Step 3: Verify compile**

```bash
cd /home/gbk/Project/tata-data-kitchen && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors in `usePurchases.ts`.

- [ ] **Step 4: Commit**

```bash
git -C /home/gbk/Project/tata-data-kitchen add src/hooks/usePurchases.ts
git -C /home/gbk/Project/tata-data-kitchen commit -m "feat: add production hooks (useProductions, useProduceSubRecipe, useDeleteProduction, useUpdateProduction)"
```

---

## Task 5: useSales Hook — Sub-Recipe Stock Deduction

**Files:**
- Modify: `src/hooks/useSales.ts`

- [ ] **Step 1: Update useCreateSale mutationFn signature**

In `src/hooks/useSales.ts`, replace the `mutationFn` inside `useCreateSale`:

```ts
mutationFn: async (p: {
  recipe_id: string;
  quantity_sold: number;
  selling_price: number;
  hpp_at_sale: number;
  category_id?: string | null;
  date?: string;
  sub_recipe_deductions?: Array<{
    sub_recipe_id: string;
    quantity: number;
  }>;
}) => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profit = p.selling_price - p.hpp_at_sale;
  const { date, sub_recipe_deductions, ...rest } = p;
  const { error } = await supabase.from("sales").insert({
    ...rest,
    profit,
    user_id: user!.id,
    ...(date ? { created_at: new Date(date).toISOString() } : {}),
  });
  if (error) throw error;

  if (sub_recipe_deductions?.length) {
    for (const d of sub_recipe_deductions) {
      const { error: deductError } = await supabase.rpc("deduct_sub_recipe_stock", {
        p_user_id: user!.id,
        p_recipe_id: d.sub_recipe_id,
        p_quantity: d.quantity,
      });
      if (deductError) throw deductError;
    }
  }
},
```

- [ ] **Step 2: Add recipes invalidation to useCreateSale onSuccess**

In the `onSuccess` of `useCreateSale`, add:

```ts
onSuccess: () => {
  qc.invalidateQueries({ queryKey: ["sales"] });
  qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  qc.invalidateQueries({ queryKey: ["recipes"] });  // ← add this line
  toast.success("Sale recorded");
},
```

- [ ] **Step 3: Verify compile**

```bash
cd /home/gbk/Project/tata-data-kitchen && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors in `useSales.ts` (sales page will still have an error until Task 8).

- [ ] **Step 4: Commit**

```bash
git -C /home/gbk/Project/tata-data-kitchen add src/hooks/useSales.ts
git -C /home/gbk/Project/tata-data-kitchen commit -m "feat: deduct sub-recipe stock on sale creation"
```

---

## Task 6: Recipes Page

**Files:**
- Modify: `src/app/recipes/page.tsx`

- [ ] **Step 1: Update BomRow interface**

Find and replace the `BomRow` interface near the top of `src/app/recipes/page.tsx`:

```ts
// BEFORE:
interface BomRow {
  item_id: string;
  quantity_used: string;
}

// AFTER:
interface BomRow {
  item_id: string;
  sub_recipe_id: string;
  quantity_used: string;
}
```

- [ ] **Step 2: Add is_ingredient and unit state**

After the existing `useState` declarations for `name`, `rows`, add two new state variables:

```ts
const [isIngredient, setIsIngredient] = useState(false);
const [unit, setUnit] = useState<Recipe["unit"]>("pcs");
```

- [ ] **Step 3: Update openCreate to reset new fields**

Add reset for new fields in `openCreate`:

```ts
function openCreate() {
  setEditing(null);
  setName("");
  setIsIngredient(false);
  setUnit("pcs");
  setRows([{ item_id: "", sub_recipe_id: "", quantity_used: "" }]);
  setModalOpen(true);
}
```

- [ ] **Step 4: Update openEdit to populate new fields**

Replace `openEdit`:

```ts
function openEdit(recipe: Recipe) {
  setEditing(recipe);
  setName(recipe.name);
  setIsIngredient(recipe.is_ingredient ?? false);
  setUnit(recipe.unit ?? "pcs");
  setRows(
    (recipe.recipe_items ?? []).map((ri) => ({
      item_id: ri.item_id ?? "",
      sub_recipe_id: ri.sub_recipe_id ?? "",
      quantity_used: String(ri.quantity_used),
    })),
  );
  setModalOpen(true);
}
```

- [ ] **Step 5: Update addRow to include sub_recipe_id**

Replace `addRow`:

```ts
function addRow() {
  setRows((r) => [...r, { item_id: "", sub_recipe_id: "", quantity_used: "" }]);
}
```

- [ ] **Step 6: Update updateRow to handle sub_recipe_id**

Replace `updateRow`:

```ts
function updateRow(i: number, field: keyof BomRow, val: string) {
  setRows((r) =>
    r.map((row, idx) => {
      if (idx !== i) return row;
      if (field === "item_id") return { ...row, item_id: val, sub_recipe_id: "" };
      if (field === "sub_recipe_id") return { ...row, sub_recipe_id: val, item_id: "" };
      return { ...row, [field]: val };
    }),
  );
}
```

- [ ] **Step 7: Update calcPreviewHPP to support sub-recipe**

Replace `calcPreviewHPP`:

```ts
function calcPreviewHPP(): number {
  return rows.reduce((sum, row) => {
    const qty = Number(row.quantity_used);
    if (row.sub_recipe_id) {
      const sr = recipes?.find((r) => r.id === row.sub_recipe_id);
      return sum + (sr?.hpp ?? 0) * qty;
    }
    const item = items?.find((i) => i.id === row.item_id);
    return sum + (item?.avg_price ?? 0) * qty;
  }, 0);
}
```

- [ ] **Step 8: Update handleSubmit to pass is_ingredient, unit, sub_recipe_id**

Replace `handleSubmit`:

```ts
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  const validRows = rows.filter(
    (r) => (r.item_id || r.sub_recipe_id) && Number(r.quantity_used) > 0,
  );
  if (!name.trim() || validRows.length === 0) return;
  const bomItems = validRows.map((r) => ({
    item_id: r.item_id || null,
    sub_recipe_id: r.sub_recipe_id || null,
    quantity_used: Number(r.quantity_used),
  }));
  if (editing) {
    await updateRecipe.mutateAsync({
      id: editing.id,
      name: name.trim(),
      is_ingredient: isIngredient,
      unit: isIngredient ? unit : null,
      items: bomItems,
    });
  } else {
    await createRecipe.mutateAsync({
      name: name.trim(),
      is_ingredient: isIngredient,
      unit: isIngredient ? unit : null,
      items: bomItems,
    });
  }
  setModalOpen(false);
  setEditing(null);
  setName("");
  setRows([{ item_id: "", sub_recipe_id: "", quantity_used: "" }]);
}
```

- [ ] **Step 9: Update recipe card to show badge + stock**

In the recipe card JSX, replace the recipe name display inside `CardHeader`:

```tsx
<div className="flex-1">
  <h3 className="font-semibold text-[#2C1810] text-sm">
    {recipe.name}
    {recipe.is_ingredient && (
      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700">
        Semi-Finished
      </span>
    )}
  </h3>
  {recipe.is_ingredient && (
    <p className="text-xs text-amber-700 mt-0.5">
      Stock: <span className="font-semibold">{recipe.stock} {recipe.unit}</span>
    </p>
  )}
</div>
```

- [ ] **Step 10: Update BOM item list to show sub_recipe name**

In the `CardBody` BOM items list, replace the item name span:

```tsx
<span>{ri.item?.name ?? ri.sub_recipe?.name ?? "—"}</span>
<span className="tabular-nums text-[#B88D6A]">
  {ri.quantity_used} {ri.item?.unit ?? ri.sub_recipe?.unit}
</span>
```

- [ ] **Step 11: Add is_ingredient checkbox + unit dropdown to modal form**

After the `<Input label="Recipe Name" ...>` field in the modal form, add:

```tsx
{/* is_ingredient checkbox + unit */}
<label className="flex items-center gap-2 cursor-pointer">
  <input
    type="checkbox"
    checked={isIngredient}
    onChange={(e) => setIsIngredient(e.target.checked)}
    className="w-4 h-4 rounded accent-[#A05035]"
  />
  <span className="text-sm font-medium text-[#4A3728]">
    Make Semi-Finished Good
  </span>
</label>
{isIngredient && (
  <Select
    label="Unit"
    value={unit ?? "pcs"}
    onChange={(e) => setUnit(e.target.value as Recipe["unit"])}
    required
  >
    {(["gr", "ml", "pcs", "kg", "liter"] as const).map((u) => (
      <option key={u} value={u}>{u}</option>
    ))}
  </Select>
)}
```

- [ ] **Step 12: Update BOM dropdown to have optgroup for sub-recipes**

Replace the entire BOM row select element with:

```tsx
{(() => {
  const subRecipeOptions = (recipes ?? []).filter(
    (r) =>
      r.is_ingredient &&
      r.id !== editing?.id &&
      !(r.recipe_items ?? []).some(
        (ri) => ri.sub_recipe_id === editing?.id
      )
  );

  return rows.map((row, i) => (
    <div key={i} className="flex gap-2 items-start">
      <div className="flex-1">
        <Select
          value={row.sub_recipe_id ? `sr:${row.sub_recipe_id}` : row.item_id}
          onChange={(e) => {
            const val = e.target.value;
            if (val.startsWith("sr:")) {
              updateRow(i, "sub_recipe_id", val.slice(3));
            } else {
              updateRow(i, "item_id", val);
            }
          }}
          required
        >
          <option value="">Select ingredient...</option>
          {(items ?? []).length > 0 && (
            <optgroup label="── Raw Materials ──">
              {(items ?? []).map((it) => (
                <option key={it.id} value={it.id}>
                  {it.name} ({it.unit})
                </option>
              ))}
            </optgroup>
          )}
          {subRecipeOptions.length > 0 && (
            <optgroup label="── Semi-Finished Goods ──">
              {subRecipeOptions.map((r) => (
                <option key={r.id} value={`sr:${r.id}`}>
                  {r.name} ({r.unit})
                </option>
              ))}
            </optgroup>
          )}
        </Select>
      </div>
      <div className="w-28">
        <Input
          type="number"
          min="0.001"
          step="0.001"
          placeholder="Qty"
          value={row.quantity_used}
          onChange={(e) => updateRow(i, "quantity_used", e.target.value)}
        />
      </div>
      {rows.length > 1 && (
        <button
          type="button"
          onClick={() => removeRow(i)}
          className="mt-1 p-2 rounded text-[#D9CCAF] hover:text-red-500 cursor-pointer"
          aria-label="Remove row"
        >
          <Minus className="w-4 h-4" />
        </button>
      )}
    </div>
  ));
})()}
```

- [ ] **Step 13: Verify compile**

```bash
cd /home/gbk/Project/tata-data-kitchen && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors in `recipes/page.tsx`.

- [ ] **Step 14: Commit**

```bash
git -C /home/gbk/Project/tata-data-kitchen add src/app/recipes/page.tsx
git -C /home/gbk/Project/tata-data-kitchen commit -m "feat: recipes page — is_ingredient flag, unit, sub-recipe BOM optgroup"
```

---

## Task 7: Purchases Page — Productions Tab

**Files:**
- Modify: `src/app/purchases/page.tsx`

- [ ] **Step 1: Add production hook imports**

At the top of `src/app/purchases/page.tsx`, update the `usePurchases` import to include the 4 new hooks:

```ts
import {
  useCreatePurchase,
  useDeletePurchase,
  usePurchases,
  useUpdatePurchase,
  useProduceSubRecipe,
  useProductions,
  useDeleteProduction,
  useUpdateProduction,
} from "@/hooks/usePurchases";
```

- [ ] **Step 2: Add useRecipes import**

Add import for `useRecipes`:

```ts
import { useRecipes } from "@/hooks/useRecipes";
```

- [ ] **Step 3: Add Production type import**

Update the type import:

```ts
// BEFORE:
import { Purchase } from "@/types";

// AFTER:
import { Purchase, Production } from "@/types";
```

- [ ] **Step 4: Add hook calls inside the component**

In `PurchasesPage()`, after the existing hook calls, add:

```ts
const { data: subRecipes } = useRecipes();
const produceSubRecipe = useProduceSubRecipe();
const { data: productions } = useProductions();
const deleteProduction = useDeleteProduction();
const updateProduction = useUpdateProduction();
```

- [ ] **Step 5: Add production state variables**

After the existing modal state variables, add:

```ts
const [editingProduction, setEditingProduction] = useState<Production | null>(null);
const [prodBatches, setProdBatches] = useState("");
const [prodTotalCost, setProdTotalCost] = useState("");
const [activeTab, setActiveTab] = useState<"purchases" | "productions">("purchases");
const [isProduction, setIsProduction] = useState(false);
const [subRecipeId, setSubRecipeId] = useState("");

const [prodSearch, setProdSearch] = useState("");
const [prodFilterDateFrom, setProdFilterDateFrom] = useState("");
const [prodFilterDateTo, setProdFilterDateTo] = useState("");
const [prodFilterSheetOpen, setProdFilterSheetOpen] = useState(false);
const [pendingProdDateFrom, setPendingProdDateFrom] = useState("");
const [pendingProdDateTo, setPendingProdDateTo] = useState("");
```

- [ ] **Step 6: Update openCreate to reset production state**

Replace `openCreate`:

```ts
function openCreate() {
  setEditing(null);
  setItemId("");
  setQuantity("");
  setTotalPrice("");
  setDate(new Date().toISOString().slice(0, 10));
  setIsProduction(false);
  setSubRecipeId("");
  setModalOpen(true);
}
```

- [ ] **Step 7: Add filteredProductions memo**

After the existing `filtered` memo, add:

```ts
const filteredProductions = useMemo(() => {
  let rows = productions ?? [];
  if (prodSearch) {
    const q = prodSearch.toLowerCase();
    rows = rows.filter((p: any) => (p.recipe?.name ?? "").toLowerCase().includes(q));
  }
  if (prodFilterDateFrom) {
    const from = new Date(prodFilterDateFrom);
    from.setHours(0, 0, 0, 0);
    rows = rows.filter((p: any) => new Date(p.created_at) >= from);
  }
  if (prodFilterDateTo) {
    const to = new Date(prodFilterDateTo);
    to.setHours(23, 59, 59, 999);
    rows = rows.filter((p: any) => new Date(p.created_at) <= to);
  }
  return [...rows].sort((a: any, b: any) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}, [productions, prodSearch, prodFilterDateFrom, prodFilterDateTo]);

const hasProdFilters = prodSearch || prodFilterDateFrom || prodFilterDateTo;
```

- [ ] **Step 8: Update handleSubmit to handle production mode**

Replace `handleSubmit`:

```ts
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  if (!quantity || !totalPrice) return;
  if (Number(quantity) <= 0) return;
  if (Number(totalPrice) < 0) return;

  if (editing) {
    await updatePurchase.mutateAsync({
      id: editing.id,
      quantity: Number(quantity),
      total_price: Number(totalPrice),
    });
  } else if (isProduction) {
    if (!subRecipeId) return;
    await produceSubRecipe.mutateAsync({
      recipe_id: subRecipeId,
      batches: Number(quantity),
      total_cost: Number(totalPrice),
      date,
    });
    setSubRecipeId("");
    setIsProduction(false);
  } else {
    if (!itemId) return;
    await createPurchase.mutateAsync({
      item_id: itemId,
      quantity: Number(quantity),
      total_price: Number(totalPrice),
      date,
    });
  }
  setModalOpen(false);
  setEditing(null);
  setItemId("");
  setQuantity("");
  setTotalPrice("");
  setDate(new Date().toISOString().slice(0, 10));
}
```

- [ ] **Step 9: Add tab switcher to Card JSX**

Inside `<Card>`, add the tab switcher as the **first child** (before the existing filter sheet):

```tsx
{/* Tab switcher */}
<div className="flex border-b border-[#E5DACA]">
  <button
    onClick={() => setActiveTab("purchases")}
    className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
      activeTab === "purchases"
        ? "text-[#A05035] border-b-2 border-[#A05035]"
        : "text-[#7C6352] hover:text-[#2C1810]"
    }`}
  >
    Purchases {purchases?.length ? `(${purchases.length})` : ""}
  </button>
  <button
    onClick={() => setActiveTab("productions")}
    className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
      activeTab === "productions"
        ? "text-amber-600 border-b-2 border-amber-600"
        : "text-[#7C6352] hover:text-[#2C1810]"
    }`}
  >
    Productions {productions?.length ? `(${productions.length})` : ""}
  </button>
</div>
```

- [ ] **Step 10: Wrap existing purchases content in activeTab === "purchases" conditional**

Wrap everything inside `<Card>` after the tab switcher (the filter sheet, search bar, and CardBody) with:

```tsx
{activeTab === "purchases" && (<>
  {/* ... existing purchases filter sheet, search bar, table ... */}
</>)}
```

- [ ] **Step 11: Add Productions tab content**

After the purchases conditional block, add:

```tsx
{activeTab === "productions" && (
  <>
    {/* Production filter bottom sheet */}
    {prodFilterSheetOpen && (
      <>
        <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setProdFilterSheetOpen(false)} />
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#FBF8F2] rounded-t-2xl shadow-xl p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[#2C1810]">Filter Productions</span>
            <button onClick={() => setProdFilterSheetOpen(false)} className="text-[#B88D6A] hover:text-[#7C6352]">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-[#7C6352] mb-1 block">From date</label>
              <input
                type="date"
                className={`${cls} w-full`}
                value={pendingProdDateFrom}
                onChange={(e) => setPendingProdDateFrom(e.target.value)}
                max={pendingProdDateTo || undefined}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-[#7C6352] mb-1 block">To date</label>
              <input
                type="date"
                className={`${cls} w-full`}
                value={pendingProdDateTo}
                onChange={(e) => setPendingProdDateTo(e.target.value)}
                min={pendingProdDateFrom || undefined}
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => { setPendingProdDateFrom(""); setPendingProdDateTo(""); }}
              className="flex-1 h-9 rounded-lg border border-[#D9CCAF] text-sm text-[#7C6352] font-medium hover:bg-[#EDE4CF] transition-colors"
            >
              Reset
            </button>
            <button
              onClick={() => {
                setProdFilterDateFrom(pendingProdDateFrom);
                setProdFilterDateTo(pendingProdDateTo);
                setProdFilterSheetOpen(false);
              }}
              className="flex-1 h-9 rounded-lg bg-[#A05035] text-sm text-white font-medium hover:bg-[#8B4530] transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      </>
    )}
    <CardBody className="p-0">
      {!(productions ?? []).length ? (
        <EmptyState
          icon={ShoppingCart}
          title="No productions yet"
          description="Record semi-finished good production runs here."
          action={
            <Button size="sm" onClick={() => { setIsProduction(true); setModalOpen(true); }}>
              <Plus className="w-4 h-4" /> Record Production
            </Button>
          }
        />
      ) : (
        <>
          <div className="px-4 py-3 border-b border-[#E5DACA] space-y-2">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#B88D6A]" />
                <input
                  className={`${cls} w-full pl-8`}
                  placeholder="Search products..."
                  value={prodSearch}
                  onChange={(e) => setProdSearch(e.target.value)}
                />
                {prodSearch && (
                  <button onClick={() => setProdSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#B88D6A] hover:text-[#7C6352]">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                onClick={() => { setPendingProdDateFrom(prodFilterDateFrom); setPendingProdDateTo(prodFilterDateTo); setProdFilterSheetOpen(true); }}
                className={`relative h-9 px-3 rounded-lg border text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  (prodFilterDateFrom || prodFilterDateTo)
                    ? "border-[#A05035] bg-[#A05035]/10 text-[#A05035]"
                    : "border-[#D9CCAF] bg-[#FBF8F2] text-[#7C6352] hover:bg-[#EDE4CF]"
                }`}
              >
                <Filter className="w-3.5 h-3.5" />
                Filter
                {(prodFilterDateFrom || prodFilterDateTo) && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#A05035] text-white text-[10px] flex items-center justify-center font-bold">
                    {[prodFilterDateFrom, prodFilterDateTo].filter(Boolean).length}
                  </span>
                )}
              </button>
            </div>
            <div className="flex items-center justify-between text-xs text-[#B88D6A]">
              <span>{filteredProductions.length} results{(productions?.length ?? 0) > filteredProductions.length && ` of ${productions?.length}`}</span>
              {hasProdFilters && (
                <button
                  onClick={() => { setProdSearch(""); setProdFilterDateFrom(""); setProdFilterDateTo(""); setPendingProdDateFrom(""); setPendingProdDateTo(""); }}
                  className="text-[#A05035] hover:underline font-medium"
                >
                  Reset all
                </button>
              )}
            </div>
          </div>
          <div className="divide-y divide-[#EDE4CF]">
            {filteredProductions.length === 0 ? (
              <div className="py-10 text-center text-sm text-[#B88D6A]">No results for this filter</div>
            ) : filteredProductions.map((prod: any) => (
              <div key={prod.id} className="flex items-center justify-between px-4 py-3 hover:bg-[#F5EFE0] transition-colors gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#2C1810]">{prod.recipe?.name ?? "—"}</p>
                  <span className="text-xs text-[#B88D6A]">
                    {prod.batches} {prod.recipe?.unit} · {format(new Date(prod.created_at), "dd MMM yyyy")}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-sm font-semibold text-amber-700 tabular-nums">
                    {formatCurrency(prod.total_cost)}
                  </span>
                  <button
                    onClick={() => { setEditingProduction(prod); setProdBatches(String(prod.batches)); setProdTotalCost(String(prod.total_cost)); }}
                    className="p-1.5 rounded-lg text-[#B88D6A] hover:text-[#A05035] hover:bg-[#EDE4CF] transition-colors"
                    aria-label="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => { if (confirm("Delete this production run?")) deleteProduction.mutate(prod.id); }}
                    className="p-1.5 rounded-lg text-[#B88D6A] hover:text-red-500 hover:bg-red-50 transition-colors"
                    aria-label="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </CardBody>
  </>
)}
```

- [ ] **Step 12: Add Purchase/Production toggle to modal**

In the create modal (when `!editing`), replace the existing item `<Select>` with a toggle + conditional:

```tsx
{!editing && (
  <>
    {/* Toggle purchase vs production */}
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => { setIsProduction(false); setSubRecipeId(""); setItemId(""); }}
        className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
          !isProduction
            ? "bg-[#A05035] text-white border-[#A05035]"
            : "bg-[#FBF8F2] text-[#7C6352] border-[#D9CCAF]"
        }`}
      >
        Purchase
      </button>
      <button
        type="button"
        onClick={() => { setIsProduction(true); setItemId(""); }}
        className={`flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
          isProduction
            ? "bg-amber-600 text-white border-amber-600"
            : "bg-[#FBF8F2] text-[#7C6352] border-[#D9CCAF]"
        }`}
      >
        Production
      </button>
    </div>

    {!isProduction ? (
      <Select
        label="Item"
        value={itemId}
        onChange={(e) => setItemId(e.target.value)}
        required
      >
        <option value="">Select item...</option>
        {items?.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name} ({i.unit})
          </option>
        ))}
      </Select>
    ) : (
      <Select
        label="Semi-Finished Good"
        value={subRecipeId}
        onChange={(e) => setSubRecipeId(e.target.value)}
        required
      >
        <option value="">Select product...</option>
        {(subRecipes ?? [])
          .filter((r) => r.is_ingredient)
          .map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.unit})
            </option>
          ))}
      </Select>
    )}
  </>
)}
```

- [ ] **Step 13: Update modal labels to be context-aware**

Update the quantity and total price input labels:

```tsx
<Input
  label={isProduction ? "Batches Produced" : "Quantity"}
  ...
/>
<Input
  label={isProduction ? "Total Production Cost ($)" : "Total Price ($)"}
  ...
/>
```

- [ ] **Step 14: Add HPP preview for production mode**

After the total price input, add production HPP preview:

```tsx
{isProduction && subRecipeId && (() => {
  const sr = (subRecipes ?? []).find((r) => r.id === subRecipeId);
  if (!sr) return null;
  const hppPerUnit = sr.hpp;
  const suggestedCost = hppPerUnit * (Number(quantity) || 1);
  return (
    <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5">
      <p className="text-xs text-amber-700 font-medium">
        HPP per {sr.unit}: <span className="font-bold">{formatCurrency(hppPerUnit)}</span>
        {quantity && (
          <> · Estimated cost: <span className="font-bold">{formatCurrency(suggestedCost)}</span></>
        )}
      </p>
    </div>
  );
})()}
```

- [ ] **Step 15: Add Edit Production modal**

After the existing Purchase modal closing `</Modal>` tag, add:

```tsx
<Modal
  open={!!editingProduction}
  onClose={() => setEditingProduction(null)}
  title="Edit Production"
  size="sm"
>
  <form
    onSubmit={async (e) => {
      e.preventDefault();
      if (!editingProduction) return;
      await updateProduction.mutateAsync({
        id: editingProduction.id,
        batches: Number(prodBatches),
        total_cost: Number(prodTotalCost),
      });
      setEditingProduction(null);
    }}
    className="flex flex-col gap-4"
  >
    <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5">
      <p className="text-xs text-amber-700">Product</p>
      <p className="text-sm font-medium text-[#2C1810]">
        {(editingProduction?.recipe as any)?.name ?? "—"}{" "}
        <span className="text-xs text-[#B88D6A]">({(editingProduction?.recipe as any)?.unit})</span>
      </p>
    </div>
    <Input
      label="Batches"
      type="number"
      min="0.01"
      step="0.01"
      value={prodBatches}
      onChange={(e) => setProdBatches(e.target.value)}
      required
    />
    <Input
      label="Total Cost ($)"
      type="number"
      min="0"
      value={prodTotalCost}
      onChange={(e) => setProdTotalCost(e.target.value)}
      required
    />
    <div className="flex gap-2 pt-1">
      <Button type="button" variant="ghost" onClick={() => setEditingProduction(null)} className="flex-1">
        Cancel
      </Button>
      <Button type="submit" loading={updateProduction.isPending} className="flex-1">
        Save
      </Button>
    </div>
  </form>
</Modal>
```

- [ ] **Step 16: Verify compile**

```bash
cd /home/gbk/Project/tata-data-kitchen && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors in `purchases/page.tsx`.

- [ ] **Step 17: Commit**

```bash
git -C /home/gbk/Project/tata-data-kitchen add src/app/purchases/page.tsx
git -C /home/gbk/Project/tata-data-kitchen commit -m "feat: purchases page — Productions tab with create/edit/delete/filter"
```

---

## Task 8: Sales Page — Sub-Recipe Stock Deduction

**Files:**
- Modify: `src/app/sales/page.tsx`

- [ ] **Step 1: Build sub_recipe_deductions in handleSubmit**

In `src/app/sales/page.tsx`, inside `handleSubmit`, replace the `createSale.mutateAsync` call:

```ts
// BEFORE:
await createSale.mutateAsync({
  recipe_id: recipeId,
  quantity_sold: Number(quantity),
  selling_price: Number(sellingPrice),
  hpp_at_sale: hpp,
  category_id: categoryId || null,
  date,
});

// AFTER:
const sub_recipe_deductions = (selectedRecipe?.recipe_items ?? [])
  .filter((ri) => ri.sub_recipe_id)
  .map((ri) => ({
    sub_recipe_id: ri.sub_recipe_id!,
    quantity: ri.quantity_used * Number(quantity),
  }));
await createSale.mutateAsync({
  recipe_id: recipeId,
  quantity_sold: Number(quantity),
  selling_price: Number(sellingPrice),
  hpp_at_sale: hpp,
  category_id: categoryId || null,
  date,
  sub_recipe_deductions,
});
```

- [ ] **Step 2: Verify full compile clean**

```bash
cd /home/gbk/Project/tata-data-kitchen && npx tsc --noEmit 2>&1
```

Expected: **zero errors**.

- [ ] **Step 3: Commit**

```bash
git -C /home/gbk/Project/tata-data-kitchen add src/app/sales/page.tsx
git -C /home/gbk/Project/tata-data-kitchen commit -m "feat: deduct sub-recipe stock on sale"
```

---

## Task 9: Smoke Test

- [ ] **Step 1: Start dev server**

```bash
cd /home/gbk/Project/tata-data-kitchen && npm run dev
```

- [ ] **Step 2: Test recipe creation with is_ingredient**

1. Go to `/recipes` → click "New Recipe"
2. Check "Make Semi-Finished Good" → unit dropdown appears → select `pcs`
3. Add a raw material row → set qty → submit
4. Card should show "Semi-Finished" badge and `Stock: 0 pcs`

- [ ] **Step 3: Test using sub-recipe as ingredient**

1. Create another recipe
2. In the BOM dropdown: "Semi-Finished Goods" optgroup should show the recipe from Step 2
3. Select it, set qty → submit
4. HPP preview should include sub-recipe cost

- [ ] **Step 4: Test production recording**

1. Go to `/purchases` → click "Productions" tab (empty state visible)
2. Click "Add" → toggle to "Production" → select the semi-finished good → set batches + cost → Record
3. Switch to Productions tab → production row visible
4. Go to `/recipes` → sub-recipe card stock should reflect the recorded batches

- [ ] **Step 5: Test edit and delete production**

1. Click edit on a production row → change batches → save → stock updates
2. Delete a production → stock reverts

- [ ] **Step 6: Test sale deducts sub-recipe stock**

1. Create a sale of the parent product (the one that uses the semi-finished good)
2. Go to `/recipes` → sub-recipe stock should decrease by `quantity_used × quantity_sold`
