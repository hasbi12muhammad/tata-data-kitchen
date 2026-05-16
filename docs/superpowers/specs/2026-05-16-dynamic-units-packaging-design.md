# Dynamic Units & Packaging Input — Design Spec

**Date:** 2026-05-16  
**Status:** Approved

---

## Overview

Two interconnected features requested by a prospective client:

1. **Dynamic packaging input** — when recording a purchase, users can optionally specify they bought N packages of a given size (e.g. 5 bungkus × 1 kg), with the system calculating total quantity automatically. Package type names (bungkus, galon, karung, etc.) are reusable per-user.
2. **Dynamic units** — the fixed unit list (gr, ml, pcs, kg, liter) becomes extensible. Users can add custom units (sachet, botol, ikat, etc.) that appear in item and recipe dropdowns. Managed via inline quick-add and a full Settings UI.
3. **Purchase UX fix** — the existing purchase form asks for total price; users naturally think in price-per-unit. The form is inverted: user inputs price per unit, system calculates total as a preview.

All three changes are per-user and backward compatible with existing data.

---

## Approach

**Two separate tables** (Opsi 1):

- `custom_units` — user-defined base units for items/recipes
- `packaging_types` — reusable package type names for purchases

Packaging conversion (size per package) is entered fresh each transaction — not predefined per item. This keeps the purchase flow flexible without requiring upfront setup.

---

## Data Model

### New Tables

```sql
CREATE TABLE custom_units (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE packaging_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, name)
);
```

Both tables: RLS enabled, user can only access their own rows.

### Modified Tables

```sql
-- items.unit: drop enum constraint, allow free text
ALTER TABLE items ALTER COLUMN unit TYPE text;

-- recipes.unit: same
ALTER TABLE recipes ALTER COLUMN unit TYPE text;

-- purchases: add nullable packaging columns
ALTER TABLE purchases ADD COLUMN pkg_type_id   uuid REFERENCES packaging_types(id) ON DELETE SET NULL;
ALTER TABLE purchases ADD COLUMN pkg_qty        numeric;
ALTER TABLE purchases ADD COLUMN size_per_pkg   numeric;
```

Existing rows are unaffected — all new purchase columns are nullable.

### TypeScript Types

```ts
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

// Item["unit"] changes from union literal to string
export interface Item {
  // ...existing fields...
  unit: string;  // was: "gr" | "ml" | "pcs" | "kg" | "liter"
}

// Recipe["unit"] same
export interface Recipe {
  // ...existing fields...
  unit?: string;
}

// Purchase gains packaging fields
export interface Purchase {
  // ...existing fields...
  pkg_type_id?: string | null;
  pkg_qty?: number | null;
  size_per_pkg?: number | null;
  pkg_type?: PackagingType;
}
```

---

## UI Flow

### Items Page — Add/Edit Modal

The unit dropdown becomes dynamic. Hardcoded units (gr, ml, pcs, kg, liter) appear first, then a separator, then user's custom units, then a "+ Tambah satuan baru..." option.

When user clicks "+ Tambah satuan baru...":
- Dropdown collapses
- Inline input appears: `[____________] [Tambah]` with a `[Batalkan]` link
- On submit: POST to `custom_units`, select the new unit, return to form

### Purchases Page — Add Purchase Modal

**UX fix:** Input field changes from "Total Price" to "Harga per [unit]". Total is shown as a calculated read-only preview (`qty × harga_per_unit`). The stored values remain the same (`quantity`, `price_per_unit`, `total_price`).

**Packaging toggle (optional):**

A checkbox "Beli per kemasan?" appears below the item selector. When checked, a kemasan section expands:

- **Jenis kemasan** — dropdown of user's `packaging_types` + "+" button to quick-add new type inline
- **Jumlah kemasan** — numeric input (e.g. 5)
- **Isi per kemasan** — numeric input with item's base unit label (e.g. 1 kg)
- **Total qty preview** — `pkg_qty × size_per_pkg` shown read-only, populates the quantity field

When packaging is active: `quantity = pkg_qty × size_per_pkg`. When not active: quantity entered directly.

Saved to DB: `pkg_type_id`, `pkg_qty`, `size_per_pkg` on the purchase row (nullable). The `quantity`, `price_per_unit`, `total_price` fields are always stored in base unit terms regardless.

**Edit mode:** The edit purchase form applies the same UX flip (price per unit input, total as preview). If the purchase was originally recorded with packaging, the packaging section is shown pre-filled and editable. The `record_purchase` RPC signature is unchanged — the client computes `total_price = quantity × price_per_unit` before calling it.

### Settings Page

Two new sections appended to the existing Settings page:

**Satuan Bahan Baku**
- Display hardcoded units as non-deletable chips: `[gr] [ml] [pcs] [kg] [liter]`
- Display custom units as deletable chips: `[sachet ×] [botol ×]`
- "+ Tambah Satuan" button → inline input → POST to `custom_units`
- Delete blocked (with tooltip) if the unit is still referenced by any item or recipe

**Jenis Kemasan**
- Display user's packaging types as deletable chips: `[Bungkus ×] [Galon ×]`
- "+ Tambah Kemasan" button → inline input → POST to `packaging_types`
- Delete blocked (with tooltip) if the type is still referenced by any purchase

### Recipes Page

Unit dropdown updated identically to the items page — hardcoded units + custom units + inline quick-add. No other changes.

---

## Hooks

New React Query hooks to add:

| Hook | Description |
|---|---|
| `useCustomUnits()` | Fetch user's custom units |
| `useCreateCustomUnit()` | POST to custom_units |
| `useDeleteCustomUnit()` | DELETE with pre-check (item/recipe usage) |
| `usePackagingTypes()` | Fetch user's packaging types |
| `useCreatePackagingType()` | POST to packaging_types |
| `useDeletePackagingType()` | DELETE with pre-check (purchase usage) |

---

## Deletion Guard Logic

Before deleting a custom unit:
```sql
SELECT COUNT(*) FROM items WHERE unit = $name AND user_id = $user_id
UNION ALL
SELECT COUNT(*) FROM recipes WHERE unit = $name AND user_id = $user_id
```
If count > 0, show tooltip error: "Satuan masih dipakai oleh [N] item/resep."

Before deleting a packaging type:
```sql
SELECT COUNT(*) FROM purchases WHERE pkg_type_id = $id
```
If count > 0, show tooltip error: "Kemasan masih dipakai di [N] transaksi."

---

## Scope Boundaries

- **Not in scope:** predefined conversion rates per packaging type (future enhancement)
- **Not in scope:** unit conversion between custom units (e.g. sachet → gr)
- **Not in scope:** import template changes for packaging columns
- **Not in scope:** reports/dashboard changes — packaging data is informational only, HPP calculation unchanged
