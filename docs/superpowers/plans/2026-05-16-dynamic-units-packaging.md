# Dynamic Units & Packaging Input — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user-defined custom units for items/recipes and an optional packaging input on purchases, plus flip the purchase form to use price-per-unit as primary input.

**Architecture:** Two new tables (`custom_units`, `packaging_types`) per user. A shared `UnitSelect` component replaces unit dropdowns across items, recipes, and settings. Purchases gain an optional packaging mode (N kemasan × size = total qty) and the price input flips from total → per-unit, with total shown as a calculated preview.

**Tech Stack:** Next.js 15, Supabase (PostgreSQL + RLS), React Query, TypeScript, Tailwind CSS

**Spec:** `docs/superpowers/specs/2026-05-16-dynamic-units-packaging-design.md`

---

## File Map

| Action | File |
|---|---|
| Create | `supabase/migrations/008_dynamic_units_packaging.sql` |
| Modify | `src/types/index.ts` |
| Create | `src/hooks/useUnits.ts` |
| Create | `src/hooks/usePackagingTypes.ts` |
| Modify | `src/hooks/usePurchases.ts` |
| Create | `src/components/ui/UnitSelect.tsx` |
| Modify | `src/app/items/page.tsx` |
| Modify | `src/app/recipes/page.tsx` |
| Modify | `src/app/purchases/page.tsx` |
| Modify | `src/app/settings/page.tsx` |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/008_dynamic_units_packaging.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/008_dynamic_units_packaging.sql

-- ── 1. Drop unit CHECK constraints ────────────────────────────────────────
ALTER TABLE public.items   DROP CONSTRAINT IF EXISTS items_unit_check;
ALTER TABLE public.recipes DROP CONSTRAINT IF EXISTS recipes_unit_check;

-- ── 2. New table: custom_units ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.custom_units (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

ALTER TABLE public.custom_units ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_custom_units" ON public.custom_units;
CREATE POLICY "users_own_custom_units" ON public.custom_units
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 3. New table: packaging_types ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.packaging_types (
  id         uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

ALTER TABLE public.packaging_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_packaging_types" ON public.packaging_types;
CREATE POLICY "users_own_packaging_types" ON public.packaging_types
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 4. Extend purchases table ─────────────────────────────────────────────
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS pkg_type_id  uuid    REFERENCES public.packaging_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pkg_qty      numeric,
  ADD COLUMN IF NOT EXISTS size_per_pkg numeric;

-- ── 5. Replace record_purchase RPC (add packaging params) ─────────────────
CREATE OR REPLACE FUNCTION public.record_purchase(
  p_user_id        uuid,
  p_item_id        uuid,
  p_quantity       numeric,
  p_total_price    numeric,
  p_price_per_unit numeric,
  p_created_at     timestamptz DEFAULT NULL,
  p_pkg_type_id    uuid        DEFAULT NULL,
  p_pkg_qty        numeric     DEFAULT NULL,
  p_size_per_pkg   numeric     DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  INSERT INTO public.purchases
    (user_id, item_id, quantity, total_price, price_per_unit, created_at, pkg_type_id, pkg_qty, size_per_pkg)
  VALUES
    (p_user_id, p_item_id, p_quantity, p_total_price, p_price_per_unit,
     COALESCE(p_created_at, now()), p_pkg_type_id, p_pkg_qty, p_size_per_pkg);
END;
$$;

-- ── 6. Replace update_purchase RPC (add price_per_unit + packaging params) ─
CREATE OR REPLACE FUNCTION public.update_purchase(
  p_purchase_id    uuid,
  p_user_id        uuid,
  p_quantity       numeric,
  p_total_price    numeric,
  p_price_per_unit numeric DEFAULT NULL,
  p_pkg_type_id    uuid    DEFAULT NULL,
  p_pkg_qty        numeric DEFAULT NULL,
  p_size_per_pkg   numeric DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item_id      uuid;
  v_old_quantity numeric;
  v_old_avg      numeric;
  v_new_avg      numeric;
BEGIN
  SELECT item_id, quantity INTO v_item_id, v_old_quantity
    FROM public.purchases
   WHERE id = p_purchase_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase not found';
  END IF;

  UPDATE public.purchases
     SET quantity       = p_quantity,
         total_price    = p_total_price,
         price_per_unit = COALESCE(p_price_per_unit, p_total_price / NULLIF(p_quantity, 0)),
         pkg_type_id    = p_pkg_type_id,
         pkg_qty        = p_pkg_qty,
         size_per_pkg   = p_size_per_pkg
   WHERE id = p_purchase_id AND user_id = p_user_id;

  UPDATE public.items
     SET stock = stock + (p_quantity - v_old_quantity)
   WHERE id = v_item_id AND user_id = p_user_id;

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
```

- [ ] **Step 2: Apply the migration**

```bash
supabase db push
```

Expected: migration applies cleanly with no errors.

If not using the CLI, apply via Supabase MCP tool `apply_migration` with the SQL above.

- [ ] **Step 3: Verify in Supabase dashboard**

Check that:
- Tables `custom_units` and `packaging_types` exist with RLS enabled
- `purchases` table has columns `pkg_type_id`, `pkg_qty`, `size_per_pkg`
- `items.unit` and `recipes.unit` no longer have a CHECK constraint

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/008_dynamic_units_packaging.sql
git commit -m "feat(db): add custom_units, packaging_types tables; extend purchases and RPCs"
```

---

## Task 2: Types + Hooks

**Files:**
- Modify: `src/types/index.ts`
- Create: `src/hooks/useUnits.ts`
- Create: `src/hooks/usePackagingTypes.ts`
- Modify: `src/hooks/usePurchases.ts`

- [ ] **Step 1: Update `src/types/index.ts`**

Add two new interfaces after the existing `Item` interface. Loosen `unit` on `Item`, `Recipe`, and extend `Purchase`:

```ts
// Add after the Item interface:
export interface CustomUnit {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface PackagingType {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}
```

Change `Item.unit`:
```ts
// Before:
unit: "gr" | "ml" | "pcs" | "kg" | "liter";
// After:
unit: string;
```

Change `Recipe.unit`:
```ts
// Before:
unit?: "gr" | "ml" | "pcs" | "kg" | "liter";
// After:
unit?: string;
```

Add packaging fields to `Purchase` (after the existing `item?` field):
```ts
pkg_type_id?: string | null;
pkg_qty?: number | null;
size_per_pkg?: number | null;
pkg_type?: PackagingType;
```

- [ ] **Step 2: Create `src/hooks/useUnits.ts`**

```ts
"use client";

import { createClient } from "@/lib/supabase/client";
import { CustomUnit } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

export function useCustomUnits() {
  return useQuery<CustomUnit[]>({
    queryKey: ["custom_units"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("custom_units")
        .select("*")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateCustomUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("custom_units")
        .insert({ name: name.trim().toLowerCase(), user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom_units"] });
      toast.success("Satuan ditambahkan");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteCustomUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const supabase = createClient();
      const { count: itemCount } = await supabase
        .from("items")
        .select("id", { count: "exact", head: true })
        .eq("unit", name);
      const { count: recipeCount } = await supabase
        .from("recipes")
        .select("id", { count: "exact", head: true })
        .eq("unit", name);
      const total = (itemCount ?? 0) + (recipeCount ?? 0);
      if (total > 0) {
        throw new Error(`Satuan masih dipakai oleh ${total} item/resep`);
      }
      const { error } = await supabase.from("custom_units").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom_units"] });
      toast.success("Satuan dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
```

- [ ] **Step 3: Create `src/hooks/usePackagingTypes.ts`**

```ts
"use client";

import { createClient } from "@/lib/supabase/client";
import { PackagingType } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

export function usePackagingTypes() {
  return useQuery<PackagingType[]>({
    queryKey: ["packaging_types"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("packaging_types")
        .select("*")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreatePackagingType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("packaging_types")
        .insert({ name: name.trim(), user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["packaging_types"] });
      toast.success("Kemasan ditambahkan");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeletePackagingType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { count } = await supabase
        .from("purchases")
        .select("id", { count: "exact", head: true })
        .eq("pkg_type_id", id);
      if ((count ?? 0) > 0) {
        throw new Error(`Kemasan masih dipakai di ${count} transaksi`);
      }
      const { error } = await supabase.from("packaging_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["packaging_types"] });
      toast.success("Kemasan dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
```

- [ ] **Step 4: Update `src/hooks/usePurchases.ts` — useCreatePurchase**

Replace `useCreatePurchase` entirely. The hook now takes `price_per_unit` (not `total_price`) and computes `total_price` client-side. Packaging fields are optional:

```ts
export function useCreatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      item_id: string;
      quantity: number;
      price_per_unit: number;
      date?: string;
      pkg_type_id?: string | null;
      pkg_qty?: number | null;
      size_per_pkg?: number | null;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const total_price = p.quantity * p.price_per_unit;
      const { error } = await supabase.rpc("record_purchase", {
        p_user_id: user!.id,
        p_item_id: p.item_id,
        p_quantity: p.quantity,
        p_total_price: total_price,
        p_price_per_unit: p.price_per_unit,
        ...(p.date ? { p_created_at: new Date(p.date).toISOString() } : {}),
        p_pkg_type_id: p.pkg_type_id ?? null,
        p_pkg_qty: p.pkg_qty ?? null,
        p_size_per_pkg: p.size_per_pkg ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["recipes"] });
      toast.success("Purchase recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
```

- [ ] **Step 5: Update `src/hooks/usePurchases.ts` — useUpdatePurchase**

Replace `useUpdatePurchase`. It now takes `price_per_unit` and optional packaging fields:

```ts
export function useUpdatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      id: string;
      quantity: number;
      price_per_unit: number;
      pkg_type_id?: string | null;
      pkg_qty?: number | null;
      size_per_pkg?: number | null;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const total_price = p.quantity * p.price_per_unit;
      const { error } = await supabase.rpc("update_purchase", {
        p_purchase_id: p.id,
        p_user_id: user!.id,
        p_quantity: p.quantity,
        p_total_price: total_price,
        p_price_per_unit: p.price_per_unit,
        p_pkg_type_id: p.pkg_type_id ?? null,
        p_pkg_qty: p.pkg_qty ?? null,
        p_size_per_pkg: p.size_per_pkg ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["recipes"] });
      toast.success("Purchase updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
```

- [ ] **Step 6: Update `usePurchases` query to join packaging_types**

In the `usePurchases` query function, change the select string:

```ts
// Before:
.select("*, item:items(name, unit)")
// After:
.select("*, item:items(name, unit), pkg_type:packaging_types(name)")
```

- [ ] **Step 7: Check TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no type errors. If `Item["unit"]` or `Recipe["unit"]` usages complain, those will be fixed in later tasks.

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/hooks/useUnits.ts src/hooks/usePackagingTypes.ts src/hooks/usePurchases.ts
git commit -m "feat: add CustomUnit + PackagingType types and hooks; update purchase hooks for price-per-unit flow"
```

---

## Task 3: UnitSelect Component

**Files:**
- Create: `src/components/ui/UnitSelect.tsx`

This component replaces every `<Select label="Unit">` in the app. It shows hardcoded units + user's custom units + an inline quick-add option.

- [ ] **Step 1: Create `src/components/ui/UnitSelect.tsx`**

```tsx
"use client";

import { useCreateCustomUnit, useCustomUnits } from "@/hooks/useUnits";
import { useState } from "react";

export const HARDCODED_UNITS = ["gr", "ml", "pcs", "kg", "liter"];

const cls =
  "h-9 rounded-lg border border-[#D9CCAF] bg-[#FBF8F2] px-3 text-sm text-[#2C1810] placeholder:text-[#B88D6A] focus:outline-none focus:ring-2 focus:ring-[#A05035] focus:border-transparent";

interface UnitSelectProps {
  value: string;
  onChange: (unit: string) => void;
  required?: boolean;
  label?: string;
}

export function UnitSelect({ value, onChange, required, label = "Unit" }: UnitSelectProps) {
  const { data: customUnits = [] } = useCustomUnits();
  const createUnit = useCreateCustomUnit();
  const [adding, setAdding] = useState(false);
  const [newUnit, setNewUnit] = useState("");

  async function handleAdd() {
    const trimmed = newUnit.trim().toLowerCase();
    if (!trimmed) return;
    await createUnit.mutateAsync(trimmed);
    onChange(trimmed);
    setNewUnit("");
    setAdding(false);
  }

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="block text-sm font-medium text-[#4A3728]">{label}</label>
      )}
      {adding ? (
        <div className="flex gap-2">
          <input
            autoFocus
            className={`${cls} flex-1`}
            placeholder="Nama satuan baru..."
            value={newUnit}
            onChange={(e) => setNewUnit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); handleAdd(); }
              if (e.key === "Escape") { setAdding(false); setNewUnit(""); }
            }}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newUnit.trim() || createUnit.isPending}
            className="px-3 h-9 rounded-lg bg-[#A05035] text-white text-sm font-medium disabled:opacity-50 hover:bg-[#8B4530] transition-colors"
          >
            Tambah
          </button>
          <button
            type="button"
            onClick={() => { setAdding(false); setNewUnit(""); }}
            className="px-3 h-9 rounded-lg border border-[#D9CCAF] text-sm text-[#7C6352] hover:bg-[#EDE4CF] transition-colors"
          >
            Batal
          </button>
        </div>
      ) : (
        <select
          className={`${cls} w-full`}
          value={value}
          onChange={(e) => {
            if (e.target.value === "__add__") { setAdding(true); return; }
            onChange(e.target.value);
          }}
          required={required}
        >
          {HARDCODED_UNITS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
          {customUnits.length > 0 && (
            <>
              <option disabled>──────────</option>
              {customUnits.map((u) => (
                <option key={u.id} value={u.name}>{u.name}</option>
              ))}
            </>
          )}
          <option value="__add__">+ Tambah satuan baru...</option>
        </select>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify component renders**

Import and render `<UnitSelect value="gr" onChange={() => {}} />` temporarily in any page. Confirm dropdown shows hardcoded units + "Tambah satuan baru" option. Remove temporary usage after confirming.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/UnitSelect.tsx
git commit -m "feat: add UnitSelect component with inline custom unit quick-add"
```

---

## Task 4: Items & Recipes Pages

**Files:**
- Modify: `src/app/items/page.tsx`
- Modify: `src/app/recipes/page.tsx`

- [ ] **Step 1: Update `src/app/items/page.tsx` — imports and state**

At the top, add `UnitSelect` import and remove the now-unused `UNITS` constant:

```ts
// Add import:
import { UnitSelect, HARDCODED_UNITS } from "@/components/ui/UnitSelect";
import { useCustomUnits } from "@/hooks/useUnits";

// Remove this line:
// const UNITS: Item["unit"][] = ["gr", "ml", "pcs", "kg", "liter"];
```

Inside `ItemsPage()`, add:
```ts
const { data: customUnits = [] } = useCustomUnits();
```

Change the unit state type:
```ts
// Before:
const [unit, setUnit] = useState<Item["unit"]>("gr");
// After:
const [unit, setUnit] = useState<string>("gr");
```

- [ ] **Step 2: Update `src/app/items/page.tsx` — modal form**

In the modal `<form>`, replace the `<Select label="Unit">` block:

```tsx
// Before:
<Select
  label="Unit"
  value={unit}
  onChange={(e) => setUnit(e.target.value as Item["unit"])}
  required
>
  {UNITS.map((u) => (
    <option key={u} value={u}>
      {u}
    </option>
  ))}
</Select>

// After:
<UnitSelect
  label="Unit"
  value={unit}
  onChange={setUnit}
  required
/>
```

- [ ] **Step 3: Update `src/app/items/page.tsx` — filter sheet unit dropdown**

The filter bottom sheet has a unit `<select>` for filtering. Update it to also show custom units:

```tsx
// Before:
{UNITS.map((u) => (
  <option key={u} value={u}>{u}</option>
))}

// After:
{HARDCODED_UNITS.map((u) => (
  <option key={u} value={u}>{u}</option>
))}
{customUnits.map((u) => (
  <option key={u.id} value={u.name}>{u.name}</option>
))}
```

- [ ] **Step 4: Update `src/app/items/page.tsx` — import handler**

The import handler validates units against a hardcoded array. Update it to also accept custom units:

```ts
// Before:
.filter(
  (r) =>
    r.name &&
    (["gr", "ml", "pcs", "kg", "liter"] as string[]).includes(r.unit),
)

// After:
const allUnits = [
  ...HARDCODED_UNITS,
  ...(customUnits?.map((u) => u.name) ?? []),
];
// then in the filter:
.filter((r) => r.name && allUnits.includes(r.unit))
```

Note: `handleImportItems` is an async function that closes over `customUnits` from the outer scope. Since `customUnits` is already fetched via `useCustomUnits()`, it's available directly.

- [ ] **Step 5: Update `src/app/recipes/page.tsx`**

Add import at top:
```ts
import { UnitSelect } from "@/components/ui/UnitSelect";
```

Change unit state type (currently `useState<Recipe["unit"]>("pcs")`):
```ts
// Before:
const [unit, setUnit] = useState<Recipe["unit"]>("pcs");
// After:
const [unit, setUnit] = useState<string>("pcs");
```

Find the unit select inside the `is_ingredient` section (around line 362). Replace:
```tsx
// Before (a native <select> element):
<select
  ...
  value={unit ?? "pcs"}
  onChange={(e) => setUnit(e.target.value as Recipe["unit"])}
  ...
>
  <option value="gr">gr</option>
  <option value="ml">ml</option>
  <option value="pcs">pcs</option>
  <option value="kg">kg</option>
  <option value="liter">liter</option>
</select>

// After:
<UnitSelect
  value={unit ?? "pcs"}
  onChange={setUnit}
  required={isIngredient}
/>
```

Remove the label element that was wrapping the old select if it's now handled by `UnitSelect`.

- [ ] **Step 6: Verify — manual check**

Run `npm run dev`. Open Items page → Add item → confirm unit dropdown shows hardcoded units + "Tambah satuan baru". Add a custom unit (e.g. "sachet"). Confirm it appears in the dropdown for other items. Open Recipes page → mark a recipe as ingredient → confirm unit dropdown shows same list including "sachet".

- [ ] **Step 7: Commit**

```bash
git add src/app/items/page.tsx src/app/recipes/page.tsx
git commit -m "feat: use UnitSelect in items and recipes; support custom units in filter and import"
```

---

## Task 5: Purchases Page

**Files:**
- Modify: `src/app/purchases/page.tsx`

This is the largest change. The form switches from `totalPrice` → `pricePerUnit` as primary input, and gains an optional packaging section.

- [ ] **Step 1: Add imports**

```ts
import { usePackagingTypes, useCreatePackagingType } from "@/hooks/usePackagingTypes";
```

- [ ] **Step 2: Replace state declarations**

Find the block with `[totalPrice, setTotalPrice]` and add the new state variables. Replace:

```ts
// Remove:
const [totalPrice, setTotalPrice] = useState("");

// Add in its place:
const [pricePerUnit, setPricePerUnit] = useState("");

// Add after existing state (before filter state):
const [usePkg, setUsePkg] = useState(false);
const [pkgTypeId, setPkgTypeId] = useState("");
const [pkgQty, setPkgQty] = useState("");
const [sizePerPkg, setSizePerPkg] = useState("");
const [addingPkgType, setAddingPkgType] = useState(false);
const [newPkgTypeName, setNewPkgTypeName] = useState("");
```

Add hooks at the top of the component:
```ts
const { data: packagingTypes = [] } = usePackagingTypes();
const createPkgType = useCreatePackagingType();
```

- [ ] **Step 3: Update `openCreate`**

```ts
function openCreate() {
  setEditing(null);
  setItemId("");
  setQuantity("");
  setPricePerUnit("");
  setUsePkg(false);
  setPkgTypeId("");
  setPkgQty("");
  setSizePerPkg("");
  setAddingPkgType(false);
  setDate(new Date().toISOString().slice(0, 10));
  setProdBatches("");
  setProdTotalCost("");
  setIsProduction(false);
  setSubRecipeId("");
  setModalOpen(true);
}
```

- [ ] **Step 4: Update `openEdit`**

```ts
function openEdit(p: Purchase) {
  setEditing(p);
  setQuantity(String(p.quantity));
  setPricePerUnit(String(p.price_per_unit));
  setUsePkg(!!p.pkg_type_id);
  setPkgTypeId(p.pkg_type_id ?? "");
  setPkgQty(p.pkg_qty ? String(p.pkg_qty) : "");
  setSizePerPkg(p.size_per_pkg ? String(p.size_per_pkg) : "");
  setAddingPkgType(false);
  setDate(new Date(p.created_at).toISOString().slice(0, 10));
  setModalOpen(true);
}
```

- [ ] **Step 5: Update computed values**

Replace the existing `pricePerUnit` / `priceDiff` / `pricePct` computed values block:

```ts
// Remove the old pricePerUnit computed variable (was derived from totalPrice)
// Remove priceDiff and pricePct

// Replace with:
const effectiveQty = usePkg && pkgQty && sizePerPkg
  ? Number(pkgQty) * Number(sizePerPkg)
  : Number(quantity);

const computedTotal =
  effectiveQty > 0 && Number(pricePerUnit) > 0
    ? effectiveQty * Number(pricePerUnit)
    : 0;

const avgPrice = selectedItem?.avg_price ?? 0;
const priceDiff =
  Number(pricePerUnit) > 0 && avgPrice > 0
    ? Number(pricePerUnit) - avgPrice
    : null;
const pricePct =
  priceDiff !== null ? (priceDiff / avgPrice) * 100 : null;
```

- [ ] **Step 6: Update `handleSubmit` — validation**

Replace the validation block for non-production purchases:

```ts
// Before:
if (!quantity || !totalPrice) return;
if (Number(quantity) <= 0) return;
if (Number(totalPrice) < 0) return;

// After:
if (!pricePerUnit || Number(pricePerUnit) <= 0) return;
if (usePkg) {
  if (!pkgQty || !sizePerPkg) return;
  if (Number(pkgQty) <= 0 || Number(sizePerPkg) <= 0) return;
} else {
  if (!quantity || Number(quantity) <= 0) return;
}
```

- [ ] **Step 7: Update `handleSubmit` — create and edit calls**

Replace the `createPurchase` and `updatePurchase` call sites:

```ts
// Create purchase:
if (!itemId) return;
const finalQty = usePkg
  ? Number(pkgQty) * Number(sizePerPkg)
  : Number(quantity);
await createPurchase.mutateAsync({
  item_id: itemId,
  quantity: finalQty,
  price_per_unit: Number(pricePerUnit),
  date,
  pkg_type_id: usePkg ? pkgTypeId || null : null,
  pkg_qty: usePkg ? Number(pkgQty) : null,
  size_per_pkg: usePkg ? Number(sizePerPkg) : null,
});

// Edit purchase:
const finalQtyEdit = usePkg
  ? Number(pkgQty) * Number(sizePerPkg)
  : Number(quantity);
await updatePurchase.mutateAsync({
  id: editing.id,
  quantity: finalQtyEdit,
  price_per_unit: Number(pricePerUnit),
  pkg_type_id: usePkg ? pkgTypeId || null : null,
  pkg_qty: usePkg ? Number(pkgQty) : null,
  size_per_pkg: usePkg ? Number(sizePerPkg) : null,
});
```

Also reset new state in the `setModalOpen(false)` cleanup block:
```ts
setPricePerUnit("");
setUsePkg(false);
setPkgTypeId("");
setPkgQty("");
setSizePerPkg("");
setAddingPkgType(false);
```

- [ ] **Step 8: Update the modal form UI**

Inside the modal `<form>`, replace the `<Input label="Quantity" ...>` and `<Input label="Total Price" ...>` block for non-production purchases with the new layout:

```tsx
{/* Packaging toggle */}
<div className="flex items-center gap-2">
  <input
    id="usePkg"
    type="checkbox"
    checked={usePkg}
    onChange={(e) => {
      setUsePkg(e.target.checked);
      if (!e.target.checked) { setPkgTypeId(""); setPkgQty(""); setSizePerPkg(""); }
    }}
    className="rounded border-[#D9CCAF] text-[#A05035] focus:ring-[#A05035]"
  />
  <label htmlFor="usePkg" className="text-sm text-[#4A3728] cursor-pointer">
    Beli per kemasan?
  </label>
</div>

{usePkg ? (
  <div className="rounded-lg border border-[#D9CCAF] bg-[#F5EFE0] p-3 space-y-3">
    {/* Jenis kemasan */}
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-[#7C6352]">Jenis kemasan</label>
      {addingPkgType ? (
        <div className="flex gap-2">
          <input
            autoFocus
            className="h-9 rounded-lg border border-[#D9CCAF] bg-[#FBF8F2] px-3 text-sm text-[#2C1810] flex-1 focus:outline-none focus:ring-2 focus:ring-[#A05035]"
            placeholder="Nama kemasan baru..."
            value={newPkgTypeName}
            onChange={(e) => setNewPkgTypeName(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (!newPkgTypeName.trim()) return;
                await createPkgType.mutateAsync(newPkgTypeName.trim());
                setPkgTypeId(""); // will be set by the user selecting from dropdown
                setNewPkgTypeName("");
                setAddingPkgType(false);
              }
              if (e.key === "Escape") { setAddingPkgType(false); setNewPkgTypeName(""); }
            }}
          />
          <button type="button"
            onClick={async () => {
              if (!newPkgTypeName.trim()) return;
              await createPkgType.mutateAsync(newPkgTypeName.trim());
              setNewPkgTypeName("");
              setAddingPkgType(false);
            }}
            disabled={!newPkgTypeName.trim() || createPkgType.isPending}
            className="px-3 h-9 rounded-lg bg-[#A05035] text-white text-sm disabled:opacity-50"
          >Tambah</button>
          <button type="button" onClick={() => { setAddingPkgType(false); setNewPkgTypeName(""); }}
            className="px-3 h-9 rounded-lg border border-[#D9CCAF] text-sm text-[#7C6352]">Batal</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <select
            className="h-9 flex-1 rounded-lg border border-[#D9CCAF] bg-[#FBF8F2] px-3 text-sm text-[#2C1810] focus:outline-none focus:ring-2 focus:ring-[#A05035]"
            value={pkgTypeId}
            onChange={(e) => setPkgTypeId(e.target.value)}
          >
            <option value="">Pilih kemasan...</option>
            {packagingTypes.map((pt) => (
              <option key={pt.id} value={pt.id}>{pt.name}</option>
            ))}
          </select>
          <button type="button" onClick={() => setAddingPkgType(true)}
            className="px-3 h-9 rounded-lg border border-[#A05035] text-[#A05035] text-sm hover:bg-[#A05035]/10 transition-colors">
            + Tambah
          </button>
        </div>
      )}
    </div>

    {/* Jumlah & Isi */}
    <div className="flex gap-2 items-end">
      <div className="flex-1">
        <label className="block text-xs font-medium text-[#7C6352] mb-1">Jumlah kemasan</label>
        <input
          type="number" min="0.01" step="0.01"
          className="h-9 w-full rounded-lg border border-[#D9CCAF] bg-[#FBF8F2] px-3 text-sm text-[#2C1810] focus:outline-none focus:ring-2 focus:ring-[#A05035]"
          value={pkgQty}
          onChange={(e) => setPkgQty(e.target.value)}
          placeholder="5"
        />
      </div>
      <span className="text-[#B88D6A] pb-2">×</span>
      <div className="flex-1">
        <label className="block text-xs font-medium text-[#7C6352] mb-1">
          Isi per kemasan ({selectedItem?.unit ?? "unit"})
        </label>
        <input
          type="number" min="0.01" step="0.01"
          className="h-9 w-full rounded-lg border border-[#D9CCAF] bg-[#FBF8F2] px-3 text-sm text-[#2C1810] focus:outline-none focus:ring-2 focus:ring-[#A05035]"
          value={sizePerPkg}
          onChange={(e) => setSizePerPkg(e.target.value)}
          placeholder="1000"
        />
      </div>
    </div>

    {pkgQty && sizePerPkg && (
      <p className="text-xs text-[#5C4535]">
        → Total qty: <span className="font-semibold">
          {Number(pkgQty) * Number(sizePerPkg)} {selectedItem?.unit}
        </span>
      </p>
    )}
  </div>
) : (
  <Input
    label={`Jumlah (${selectedItem?.unit ?? "unit"})`}
    type="number"
    min="0.01"
    step="0.01"
    value={quantity}
    onChange={(e) => setQuantity(e.target.value)}
    required
  />
)}

{/* Price per unit — replaces old Total Price field */}
<Input
  label={`Harga per ${selectedItem?.unit ?? "unit"}`}
  type="number"
  min="0"
  step="1"
  value={pricePerUnit}
  onChange={(e) => setPricePerUnit(e.target.value)}
  required
/>

{/* Preview: computed total + avg comparison */}
{computedTotal > 0 && (
  <div className="rounded-lg bg-[#737B4C]/10 border border-[#737B4C]/20 px-4 py-2.5 space-y-1">
    <p className="text-xs text-[#5C6B38] font-medium">
      Total: <span className="font-bold">{formatCurrency(computedTotal)}</span>
    </p>
    {priceDiff !== null && pricePct !== null && (
      <p className={`text-xs font-medium ${priceDiff > 0 ? "text-red-600" : "text-green-700"}`}>
        {priceDiff > 0 ? "▲" : "▼"}{" "}
        {formatCurrency(Math.abs(priceDiff))} ({pricePct > 0 ? "+" : ""}{pricePct.toFixed(1)}%) vs avg harga
      </p>
    )}
  </div>
)}
```

- [ ] **Step 9: Verify — manual check**

Run `npm run dev`. Open Purchases → Add Purchase:
1. Confirm field is now "Harga per [unit]" not "Total Price"
2. Enter qty + price per unit → confirm total shows in preview
3. Check "Beli per kemasan?" → confirm packaging section appears
4. Select/add kemasan type, enter 5 bungkus × 1000 gr → confirm "Total qty: 5000 gr" preview
5. Submit → confirm purchase recorded and stock updated correctly
6. Open existing purchase → confirm pre-filled with `price_per_unit` value

- [ ] **Step 10: Commit**

```bash
git add src/app/purchases/page.tsx
git commit -m "feat: purchases — flip to price-per-unit input, add optional packaging section"
```

---

## Task 6: Settings Page

**Files:**
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: Add imports**

```ts
import { useCustomUnits, useCreateCustomUnit, useDeleteCustomUnit } from "@/hooks/useUnits";
import { usePackagingTypes, useCreatePackagingType, useDeletePackagingType } from "@/hooks/usePackagingTypes";
import { HARDCODED_UNITS } from "@/components/ui/UnitSelect";
import { Trash2 } from "lucide-react";
```

- [ ] **Step 2: Add state and hooks inside `SettingsPage()`**

```ts
const { data: customUnits = [] } = useCustomUnits();
const createCustomUnit = useCreateCustomUnit();
const deleteCustomUnit = useDeleteCustomUnit();

const { data: packagingTypes = [] } = usePackagingTypes();
const createPkgType = useCreatePackagingType();
const deletePkgType = useDeletePackagingType();

const [newUnitName, setNewUnitName] = useState("");
const [addingUnit, setAddingUnit] = useState(false);

const [newPkgName, setNewPkgName] = useState("");
const [addingPkg, setAddingPkg] = useState(false);
```

- [ ] **Step 3: Add the two new sections to the JSX**

Append these two `<div>` blocks inside `<div className="max-w-lg mx-auto flex flex-col gap-6">`, after the existing password section:

```tsx
{/* Satuan Bahan Baku */}
<div className="bg-[#FBF8F2] rounded-2xl border border-[#D9CCAF] shadow-sm p-6">
  <h2 className="text-base font-semibold text-[#2C1810] mb-1">Satuan Bahan Baku</h2>
  <p className="text-sm text-[#7C6352] mb-4">
    Satuan yang tersedia untuk bahan baku dan resep.
  </p>

  <div className="mb-3">
    <p className="text-xs font-medium text-[#7C6352] mb-2">Bawaan sistem</p>
    <div className="flex flex-wrap gap-2">
      {HARDCODED_UNITS.map((u) => (
        <span key={u} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-[#EDE4CF] text-[#5C4535]">
          {u}
        </span>
      ))}
    </div>
  </div>

  {customUnits.length > 0 && (
    <div className="mb-3">
      <p className="text-xs font-medium text-[#7C6352] mb-2">Custom</p>
      <div className="flex flex-wrap gap-2">
        {customUnits.map((u) => (
          <span key={u.id} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-[#A05035]/10 text-[#A05035]">
            {u.name}
            <button
              onClick={() => deleteCustomUnit.mutate({ id: u.id, name: u.name })}
              disabled={deleteCustomUnit.isPending}
              className="ml-0.5 hover:text-red-600 transition-colors"
              aria-label={`Hapus satuan ${u.name}`}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  )}

  {addingUnit ? (
    <div className="flex gap-2">
      <input
        autoFocus
        className="h-9 flex-1 rounded-lg border border-[#D9CCAF] bg-white px-3 text-sm text-[#2C1810] focus:outline-none focus:ring-2 focus:ring-[#A05035]"
        placeholder="Nama satuan baru..."
        value={newUnitName}
        onChange={(e) => setNewUnitName(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (!newUnitName.trim()) return;
            await createCustomUnit.mutateAsync(newUnitName.trim());
            setNewUnitName("");
            setAddingUnit(false);
          }
          if (e.key === "Escape") { setAddingUnit(false); setNewUnitName(""); }
        }}
      />
      <Button
        onClick={async () => {
          if (!newUnitName.trim()) return;
          await createCustomUnit.mutateAsync(newUnitName.trim());
          setNewUnitName("");
          setAddingUnit(false);
        }}
        loading={createCustomUnit.isPending}
        disabled={!newUnitName.trim()}
        size="sm"
      >
        Tambah
      </Button>
      <Button size="sm" variant="ghost" onClick={() => { setAddingUnit(false); setNewUnitName(""); }}>
        Batal
      </Button>
    </div>
  ) : (
    <Button size="sm" variant="secondary" onClick={() => setAddingUnit(true)}>
      + Tambah Satuan
    </Button>
  )}
</div>

{/* Jenis Kemasan */}
<div className="bg-[#FBF8F2] rounded-2xl border border-[#D9CCAF] shadow-sm p-6">
  <h2 className="text-base font-semibold text-[#2C1810] mb-1">Jenis Kemasan</h2>
  <p className="text-sm text-[#7C6352] mb-4">
    Nama kemasan yang bisa dipilih saat mencatat pembelian (bungkus, galon, karung, dll).
  </p>

  {packagingTypes.length > 0 && (
    <div className="flex flex-wrap gap-2 mb-3">
      {packagingTypes.map((pt) => (
        <span key={pt.id} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-[#A05035]/10 text-[#A05035]">
          {pt.name}
          <button
            onClick={() => deletePkgType.mutate(pt.id)}
            disabled={deletePkgType.isPending}
            className="ml-0.5 hover:text-red-600 transition-colors"
            aria-label={`Hapus kemasan ${pt.name}`}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </span>
      ))}
    </div>
  )}

  {addingPkg ? (
    <div className="flex gap-2">
      <input
        autoFocus
        className="h-9 flex-1 rounded-lg border border-[#D9CCAF] bg-white px-3 text-sm text-[#2C1810] focus:outline-none focus:ring-2 focus:ring-[#A05035]"
        placeholder="Nama kemasan baru..."
        value={newPkgName}
        onChange={(e) => setNewPkgName(e.target.value)}
        onKeyDown={async (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (!newPkgName.trim()) return;
            await createPkgType.mutateAsync(newPkgName.trim());
            setNewPkgName("");
            setAddingPkg(false);
          }
          if (e.key === "Escape") { setAddingPkg(false); setNewPkgName(""); }
        }}
      />
      <Button
        onClick={async () => {
          if (!newPkgName.trim()) return;
          await createPkgType.mutateAsync(newPkgName.trim());
          setNewPkgName("");
          setAddingPkg(false);
        }}
        loading={createPkgType.isPending}
        disabled={!newPkgName.trim()}
        size="sm"
      >
        Tambah
      </Button>
      <Button size="sm" variant="ghost" onClick={() => { setAddingPkg(false); setNewPkgName(""); }}>
        Batal
      </Button>
    </div>
  ) : (
    <Button size="sm" variant="secondary" onClick={() => setAddingPkg(true)}>
      + Tambah Kemasan
    </Button>
  )}
</div>
```

- [ ] **Step 4: Verify — manual check**

Run `npm run dev`. Open Settings:
1. Scroll to bottom — confirm "Satuan Bahan Baku" and "Jenis Kemasan" sections appear
2. Add a custom unit (e.g. "sachet") → confirm it appears in the Custom chips
3. Add a packaging type (e.g. "Bungkus") → confirm it appears
4. Go to Items page → Add item → confirm "sachet" appears in unit dropdown
5. Go to Purchases → Add purchase → check "Beli per kemasan?" → confirm "Bungkus" in kemasan dropdown
6. Go to Settings → try deleting "sachet" while an item uses it → confirm error toast appears

- [ ] **Step 5: Commit**

```bash
git add src/app/settings/page.tsx
git commit -m "feat: settings — add custom units and packaging types management sections"
```

---

## Self-Review Checklist

Run this after all tasks complete:

- [ ] `npx tsc --noEmit` — zero type errors
- [ ] Run `npm run dev` and test end-to-end: add custom unit → use in item → buy item with packaging → check Settings shows both
- [ ] Verify existing purchases (without packaging) still display correctly in the list
- [ ] Verify import of items still works (now accepts custom units)
- [ ] Confirm deletion guard works: can't delete a unit in use, can't delete packaging type in use
