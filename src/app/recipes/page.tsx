"use client";

export const dynamic = "force-dynamic";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useItems } from "@/hooks/useItems";
import {
  useCreateRecipe,
  useDeleteRecipe,
  useRecipes,
  useUpdateRecipe,
} from "@/hooks/useRecipes";
import { formatCurrency } from "@/lib/utils";
import { ImportExcelModal } from "@/components/ui/ImportExcelModal";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  FileUp,
  Minus,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import { Recipe } from "@/types";

interface BomRow {
  item_id: string;
  sub_recipe_id: string;
  quantity_used: string;
}

export default function RecipesPage() {
  const { data: recipes, isLoading } = useRecipes();
  const { data: items } = useItems();
  const createRecipe = useCreateRecipe();
  const updateRecipe = useUpdateRecipe();
  const deleteRecipe = useDeleteRecipe();
  const queryClient = useQueryClient();

  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  async function handleImportRecipes(rows: Record<string, unknown>[]) {
    setImporting(true);
    const supabase = (await import("@/lib/supabase/client")).createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const grouped = new Map<
      string,
      { item_id: string; quantity_used: number }[]
    >();
    const errors: string[] = [];

    for (const r of rows) {
      const recipeName = String(r["nama_resep"] ?? r["recipe"] ?? "").trim();
      const itemName = String(r["nama_item"] ?? r["item"] ?? "").trim();
      const qty = Number(r["quantity_used"] ?? r["qty"] ?? 0);
      if (!recipeName || !itemName || qty <= 0) continue;
      const found = items?.find(
        (i) => i.name.toLowerCase() === itemName.toLowerCase(),
      );
      if (!found) {
        errors.push(`Item "${itemName}" not found`);
        continue;
      }
      if (!grouped.has(recipeName)) grouped.set(recipeName, []);
      grouped.get(recipeName)!.push({ item_id: found.id, quantity_used: qty });
    }

    let success = 0;
    for (const [recipeName, recipeItems] of grouped) {
      const { data: recipe, error: re } = await supabase
        .from("recipes")
        .insert({ name: recipeName, user_id: user!.id })
        .select()
        .single();
      if (re) {
        errors.push(re.message);
        continue;
      }
      const { error: rie } = await supabase
        .from("recipe_items")
        .insert(recipeItems.map((i) => ({ ...i, recipe_id: recipe.id })));
      if (rie) errors.push(rie.message);
      else success++;
    }

    setImporting(false);
    if (errors.length) toast.error(`${errors.length} error: ${errors[0]}`);
    if (success) {
      toast.success(`${success} products imported successfully`);
      queryClient.invalidateQueries({ queryKey: ["recipes"] });
    }
  }

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<BomRow[]>([
    { item_id: "", sub_recipe_id: "", quantity_used: "" },
  ]);
  const [isIngredient, setIsIngredient] = useState(false);
  const [unit, setUnit] = useState<Recipe["unit"]>("pcs");

  function openCreate() {
    setEditing(null);
    setName("");
    setIsIngredient(false);
    setUnit("pcs");
    setRows([{ item_id: "", sub_recipe_id: "", quantity_used: "" }]);
    setModalOpen(true);
  }

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

  function addRow() {
    setRows((r) => [...r, { item_id: "", sub_recipe_id: "", quantity_used: "" }]);
  }
  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }
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

  return (
    <AppLayout
      title="Products"
      action={
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setImportOpen(true)}
          >
            <FileUp className="w-4 h-4" /> Import
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4" /> New Product
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <div className="py-12 text-center text-sm text-[#B88D6A]">
          Loading...
        </div>
      ) : !recipes?.length ? (
        <EmptyState
          icon={BookOpen}
          title="No products yet"
          description="Create a product (Bill of Materials) to automatically calculate COGS."
          action={
            <Button size="sm" onClick={openCreate}>
              <Plus className="w-4 h-4" /> New Product
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <Card key={recipe.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
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
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEdit(recipe)}
                      className="p-1 rounded text-[#D9CCAF] hover:text-[#A05035] cursor-pointer transition-colors"
                      aria-label="Edit product"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Delete this product?"))
                          deleteRecipe.mutate(recipe.id);
                      }}
                      className="p-1 rounded text-[#D9CCAF] hover:text-red-500 cursor-pointer transition-colors"
                      aria-label="Delete product"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardBody>
                <div className="space-y-1.5 mb-4">
                  {(recipe.recipe_items ?? []).map((ri) => (
                    <div
                      key={ri.id}
                      className="flex justify-between text-xs text-[#5C4535]"
                    >
                      <span>{ri.item?.name ?? ri.sub_recipe?.name ?? "—"}</span>
                      <span className="tabular-nums text-[#B88D6A]">
                        {ri.quantity_used} {ri.item?.unit ?? ri.sub_recipe?.unit}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-[#E5DACA] pt-3">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-xs text-[#7C6352] font-medium">
                      COGS
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <span className="text-sm font-bold text-[#A05035] tabular-nums">
                        {formatCurrency(recipe.hpp)}
                      </span>
                      {(() => {
                        const diff = recipe.hpp - (recipe as any).prev_hpp;
                        const prev = (recipe as any).prev_hpp;
                        if (Math.abs(diff) < 1) return null;
                        const up = diff > 0;
                        const pct = prev > 0 ? (diff / prev) * 100 : null;
                        return (
                          <span
                            className={`inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded ${up ? "bg-red-50 text-red-600" : "bg-[#737B4C]/10 text-[#5C6B38]"}`}
                          >
                            {up ? (
                              <ArrowUp className="w-2.5 h-2.5" />
                            ) : (
                              <ArrowDown className="w-2.5 h-2.5" />
                            )}
                            {formatCurrency(Math.abs(diff))}
                            {pct !== null && ` (${Math.abs(pct).toFixed(1)}%)`}
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        title={editing ? "Edit Product" : "New Product"}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Product Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Fried Rice"
          />

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

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[#4A3728]">
                Ingredients (BoM)
              </label>
              <button
                type="button"
                onClick={addRow}
                className="text-xs text-[#A05035] hover:underline cursor-pointer font-medium flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add row
              </button>
            </div>
            <div className="space-y-2">
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
            </div>
          </div>

          {(() => {
            const previewHPP = calcPreviewHPP();
            return previewHPP > 0 ? (
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-2.5">
                <p className="text-xs text-blue-700 font-medium">
                  Estimated COGS:{" "}
                  <span className="font-bold">
                    {formatCurrency(previewHPP)}
                  </span>
                </p>
              </div>
            ) : null;
          })()}

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setModalOpen(false);
                setEditing(null);
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={
                editing ? updateRecipe.isPending : createRecipe.isPending
              }
              className="flex-1"
            >
              {editing ? "Save" : "Create"}
            </Button>
          </div>
        </form>
      </Modal>

      <ImportExcelModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Products"
        templateFilename="template_recipes.xlsx"
        templateColumns={["nama_resep", "nama_item", "quantity_used"]}
        templateRows={[
          ["Nasi Goreng", "Beras", 200],
          ["Nasi Goreng", "Minyak Goreng", 10],
          ["Mie Goreng", "Mie", 100],
          ["Mie Goreng", "Telur", 1],
        ]}
        previewColumns={[
          { key: "nama_resep", label: "Product Name" },
          { key: "nama_item", label: "Item Name" },
          { key: "quantity_used", label: "Qty" },
        ]}
        onImport={handleImportRecipes}
        importing={importing}
      />
    </AppLayout>
  );
}
