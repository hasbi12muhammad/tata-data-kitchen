# Sub-Recipe (Semi-Finished Good) — Design Spec

**Date:** 2026-05-15
**Status:** Approved
**Source:** Ported from tata-data-dapur (commit history + spec 2026-05-13)

---

## Overview

Port the sub-recipe feature from tata-data-dapur to tata-data-kitchen. A recipe flagged `is_ingredient` acts like a raw material: it has stock, a unit, and can be used as an ingredient in other recipes. Stock increases when a "production run" is recorded on the Purchases page (Productions tab), and decreases automatically when a parent product is sold.

---

## Database

Copy the following migration files as-is from tata-data-dapur:

- `supabase/migrations/006_sub_recipe.sql`
- `supabase/migrations/007_production_crud.sql`

### Changes to `recipes`
```sql
ADD COLUMN is_ingredient boolean NOT NULL DEFAULT false
ADD COLUMN unit          text CHECK (unit IN ('gr','ml','pcs','kg','liter'))
ADD COLUMN stock         numeric(15,4) NOT NULL DEFAULT 0
ADD COLUMN avg_price     numeric(15,4) NOT NULL DEFAULT 0
```

### Changes to `recipe_items`
- Add `sub_recipe_id uuid REFERENCES recipes(id) ON DELETE RESTRICT`
- `item_id` becomes nullable
- Constraint: exactly one of `item_id` or `sub_recipe_id` must be non-null
- Constraint: `sub_recipe_id != recipe_id` (no self-reference)

### New table: `productions`
```sql
id, user_id, recipe_id, batches, total_cost, created_at
```
With RLS: users only access their own rows.

### New RPCs
- `produce_sub_recipe(p_user_id, p_recipe_id, p_batches, p_total_cost, p_created_at?)`
- `deduct_sub_recipe_stock(p_user_id, p_recipe_id, p_quantity)`
- `delete_production(p_user_id, p_production_id)`
- `update_production(p_user_id, p_production_id, p_batches, p_total_cost)`

---

## TypeScript Types (`src/types/index.ts`)

### `Recipe` — add fields
```ts
is_ingredient: boolean
unit?: 'gr' | 'ml' | 'pcs' | 'kg' | 'liter'
stock: number
avg_price: number
```

### `RecipeItem` — update fields
```ts
item_id?: string | null       // was: item_id: string
sub_recipe_id?: string | null // new
sub_recipe?: Recipe           // new
```

### `Production` — new interface
```ts
interface Production {
  id: string
  user_id: string
  recipe_id: string
  batches: number
  total_cost: number
  created_at: string
  recipe?: Recipe
}
```

---

## Hooks

### `src/hooks/useRecipes.ts`

**`calcHPP`** — becomes recursive, exported:
```ts
export function calcHPP(items: RecipeItem[], usePrev: boolean): number {
  return items.reduce((sum, ri) => {
    if (ri.sub_recipe_id && ri.sub_recipe) {
      return sum + calcHPP(ri.sub_recipe.recipe_items ?? [], usePrev) * ri.quantity_used;
    }
    const item = ri.item;
    const price = usePrev ? (item?.prev_avg_price || item?.avg_price || 0) : (item?.avg_price ?? 0);
    return sum + price * ri.quantity_used;
  }, 0);
}
```

**`useRecipes`** — expand query to include nested sub_recipe:
```ts
recipe_items!recipe_id(
  *,
  item:items(name, unit, avg_price, prev_avg_price),
  sub_recipe:recipes!sub_recipe_id(
    id, name, unit, stock, avg_price, is_ingredient,
    recipe_items!recipe_id(
      quantity_used, item_id,
      item:items(name, unit, avg_price, prev_avg_price)
    )
  )
)
```
Map result to include `is_ingredient`, `stock`, `avg_price` fields.

**`useCreateRecipe` / `useUpdateRecipe`** — accept `is_ingredient?`, `unit?`, `sub_recipe_id?` in items array.

### `src/hooks/usePurchases.ts`

Add 4 new hooks (copy from dapur, no translation needed):
- `useProductions` — fetch `productions` table with `recipe:recipes(name, unit)`
- `useProduceSubRecipe` — RPC `produce_sub_recipe`
- `useDeleteProduction` — RPC `delete_production`
- `useUpdateProduction` — RPC `update_production`

All mutations invalidate `["productions"]`, `["items"]`, `["recipes"]`.

### `src/hooks/useSales.ts`

**`useCreateSale`** — add optional `sub_recipe_deductions` param, call `deduct_sub_recipe_stock` RPC for each deduction after insert. Add `qc.invalidateQueries({ queryKey: ["recipes"] })` on success.

---

## Frontend

### `src/app/recipes/page.tsx`

**`BomRow` interface** — add `sub_recipe_id: string` field.

**Form changes:**
- Checkbox "Make Semi-Finished Good" (`is_ingredient`)
- Unit dropdown (conditional on `is_ingredient`): gr, ml, pcs, kg, liter
- BOM dropdown uses `<optgroup>`: "Raw Materials" / "Semi-Finished Goods"
- Sub-recipe options filtered: `is_ingredient=true`, not the recipe being edited, no circular refs

**Card changes:**
- Badge "Semi-Finished" if `is_ingredient`
- Show stock below name if `is_ingredient`
- BOM list shows `ri.sub_recipe?.name` fallback

### `src/app/purchases/page.tsx`

**Tab switcher** at top of card: "Purchases (N)" / "Productions (N)"

**Modal** — toggle button "Purchase / Production" when creating new:
- Purchase mode: existing flow
- Production mode: sub-recipe selector (filtered `is_ingredient=true`), batch qty, total cost, date, HPP preview

**Productions tab:**
- Search by product name
- Date filter (from/to) via bottom sheet
- List rows: product name, batches + unit, date, total cost, edit + delete buttons
- "Edit Production" modal: product name read-only, batch + cost editable

### `src/app/sales/page.tsx`

Build `sub_recipe_deductions` from `selectedRecipe.recipe_items` before calling `createSale.mutateAsync`:
```ts
const sub_recipe_deductions = (selectedRecipe?.recipe_items ?? [])
  .filter((ri) => ri.sub_recipe_id)
  .map((ri) => ({
    sub_recipe_id: ri.sub_recipe_id!,
    quantity: ri.quantity_used * Number(quantity),
  }));
```

---

## Implementation Notes

- Kitchen uses English labels throughout (Item, Purchases, Add, Cancel, etc.)
- `calcHPP` must be exported from `useRecipes.ts` (used in recipes page for preview)
- All language in new UI: English
- Existing purchases tab behavior unchanged
