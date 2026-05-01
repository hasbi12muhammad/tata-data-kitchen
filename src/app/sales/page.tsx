"use client";

export const dynamic = "force-dynamic";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useRecipes } from "@/hooks/useRecipes";
import {
  useCreateSale,
  useCreateSaleCategory,
  useDeleteSale,
  useSaleCategories,
  useSales,
  useUpdateSale,
} from "@/hooks/useSales";
import { Sale } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { Pencil, Plus, Search, TrendingUp, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

const cls =
  "h-9 rounded-lg border border-[#D9CCAF] bg-[#FBF8F2] px-3 text-sm text-[#2C1810] placeholder:text-[#B88D6A] focus:outline-none focus:ring-2 focus:ring-[#A05035] focus:border-transparent";

export default function SalesPage() {
  const { data: sales, isLoading } = useSales();
  const { data: recipes } = useRecipes();
  const { data: categories } = useSaleCategories();
  const createSale = useCreateSale();
  const updateSale = useUpdateSale();
  const deleteSale = useDeleteSale();
  const createCategory = useCreateSaleCategory();

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Sale | null>(null);
  const [recipeId, setRecipeId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [sellingPrice, setSellingPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [search, setSearch] = useState("");
  const [filterRecipe, setFilterRecipe] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");

  const selectedRecipe = recipes?.find((r) => r.id === recipeId);
  const hpp = editing ? editing.hpp_at_sale : (selectedRecipe?.hpp ?? 0);
  const totalRevenue = Number(sellingPrice) * Number(quantity);
  const totalProfit = (Number(sellingPrice) - hpp) * Number(quantity);
  const margin =
    Number(sellingPrice) > 0
      ? ((Number(sellingPrice) - hpp) / Number(sellingPrice)) * 100
      : 0;

  async function handleAddCategory() {
    if (!newCatName.trim()) return;
    const cat = await createCategory.mutateAsync(newCatName.trim());
    setCategoryId(cat.id);
    setNewCatName("");
    setAddingCat(false);
  }

  function openCreate() {
    setEditing(null);
    setRecipeId("");
    setQuantity("1");
    setSellingPrice("");
    setCategoryId("");
    setNewCatName("");
    setAddingCat(false);
    setDate(new Date().toISOString().slice(0, 10));
    setModalOpen(true);
  }

  function openEdit(s: Sale) {
    setEditing(s);
    setQuantity(String(s.quantity_sold));
    setSellingPrice(String(s.selling_price));
    setCategoryId(s.category_id ?? "");
    setNewCatName("");
    setAddingCat(false);
    setDate(new Date(s.created_at).toISOString().slice(0, 10));
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sellingPrice) return;
    if (editing) {
      await updateSale.mutateAsync({
        id: editing.id,
        quantity_sold: Number(quantity),
        selling_price: Number(sellingPrice),
        hpp_at_sale: editing.hpp_at_sale,
        category_id: categoryId || null,
        date,
      });
    } else {
      if (!recipeId) return;
      await createSale.mutateAsync({
        recipe_id: recipeId,
        quantity_sold: Number(quantity),
        selling_price: Number(sellingPrice),
        hpp_at_sale: hpp,
        category_id: categoryId || null,
        date,
      });
    }
    closeModal();
    setRecipeId("");
    setQuantity("1");
    setSellingPrice("");
    setCategoryId("");
    setNewCatName("");
    setAddingCat(false);
    setDate(new Date().toISOString().slice(0, 10));
  }

  const filtered = useMemo(() => {
    let rows = sales ?? [];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((s) =>
        ((s.recipe as any)?.name ?? "").toLowerCase().includes(q),
      );
    }
    if (filterRecipe) {
      rows = rows.filter((s) => s.recipe_id === filterRecipe);
    }
    if (filterCategory) {
      rows = rows.filter((s) => s.category_id === filterCategory);
    }
    return [...rows].sort((a, b) => {
      const profitA = a.profit * a.quantity_sold;
      const profitB = b.profit * b.quantity_sold;
      const revenueA = a.selling_price * a.quantity_sold;
      const revenueB = b.selling_price * b.quantity_sold;
      switch (sortBy) {
        case "date_asc":
          return (
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        case "profit_desc":
          return profitB - profitA;
        case "profit_asc":
          return profitA - profitB;
        case "revenue_desc":
          return revenueB - revenueA;
        case "qty_desc":
          return b.quantity_sold - a.quantity_sold;
        default:
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
      }
    });
  }, [sales, search, filterRecipe, filterCategory, sortBy]);

  const hasFilters =
    search || filterRecipe || filterCategory || sortBy !== "date_desc";

  return (
    <AppLayout
      title="Sales"
      action={
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Add
        </Button>
      }
    >
      <Card>
        <div className="px-4 py-3 border-b border-[#E5DACA] space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#B88D6A]" />
            <input
              className={`${cls} w-full pl-8`}
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#B88D6A] hover:text-[#7C6352]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <select
              className={`${cls} flex-1`}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="date_desc">Newest</option>
              <option value="date_asc">Oldest</option>
              <option value="profit_desc">Profit ↑</option>
              <option value="profit_asc">Profit ↓</option>
              <option value="revenue_desc">Revenue ↑</option>
              <option value="qty_desc">Highest qty</option>
            </select>
            <select
              className={`${cls} flex-1`}
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <select
              className={`${cls} flex-1`}
              value={filterRecipe}
              onChange={(e) => setFilterRecipe(e.target.value)}
            >
              <option value="">All products</option>
              {recipes?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between text-xs text-[#B88D6A]">
            <span>
              {filtered.length} results
              {(sales?.length ?? 0) > filtered.length &&
                ` of ${sales?.length}`}
            </span>
            {hasFilters && (
              <button
                onClick={() => {
                  setSearch("");
                  setFilterRecipe("");
                  setFilterCategory("");
                  setSortBy("date_desc");
                }}
                className="text-[#A05035] hover:underline font-medium"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        <CardBody className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-[#B88D6A]">
              Loading...
            </div>
          ) : !sales?.length ? (
            <EmptyState
              icon={TrendingUp}
              title="No sales yet"
              description="Record sales to start tracking revenue and profit."
              action={
                <Button size="sm" onClick={openCreate}>
                  <Plus className="w-4 h-4" /> Record Sale
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#B88D6A]">
              No results for this filter
            </div>
          ) : (
            <>
              {/* Mobile card list */}
              <div className="sm:hidden divide-y divide-[#EDE4CF]">
                {filtered.map((s) => {
                  const saleMargin = s.selling_price > 0 ? (s.profit / s.selling_price) * 100 : 0;
                  return (
                    <div key={s.id} className="px-4 py-3 hover:bg-[#F5EFE0] transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[#2C1810] truncate">
                            {(s.recipe as any)?.name ?? "—"}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {(s as any).category ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#EDE4CF] text-[#5C4535]">
                                {(s as any).category.name}
                              </span>
                            ) : null}
                            <span className="text-[10px] text-[#B88D6A]">{format(new Date(s.created_at), "dd MMM yyyy")}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <div className="text-right mr-1">
                            <p className={`text-sm font-semibold tabular-nums whitespace-nowrap ${s.profit >= 0 ? "text-[#737B4C]" : "text-red-600"}`}>
                              {formatCurrency(s.profit * s.quantity_sold)}
                            </p>
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded tabular-nums ${saleMargin >= 30 ? "text-[#5C6B38]" : saleMargin >= 15 ? "text-[#7C563D]" : "text-red-600"}`}>
                              {saleMargin.toFixed(1)}%
                            </span>
                          </div>
                          <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg text-[#B88D6A] hover:text-[#A05035] hover:bg-[#EDE4CF] transition-colors" aria-label="Edit">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => { if (confirm("Delete this sale?")) deleteSale.mutate(s.id); }} className="p-1.5 rounded-lg text-[#B88D6A] hover:text-red-500 hover:bg-red-50 transition-colors" aria-label="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-[#B88D6A] tabular-nums flex-wrap">
                        <span>{s.quantity_sold}×</span>
                        <span>{formatCurrency(s.selling_price)}/unit</span>
                        <span>·</span>
                        <span>COGS {formatCurrency(s.hpp_at_sale * s.quantity_sold)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E5DACA]">
                      <th className="text-left px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide">Product</th>
                      <th className="text-left px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide">Category</th>
                      <th className="text-right px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide">Qty</th>
                      <th className="text-right px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide">Selling Price</th>
                      <th className="text-right px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide">Profit</th>
                      <th className="text-right px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide">Margin</th>
                      <th className="text-right px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide">Date</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((s) => {
                      const saleMargin = s.selling_price > 0 ? (s.profit / s.selling_price) * 100 : 0;
                      return (
                        <tr key={s.id} className="border-b border-[#EDE4CF] last:border-0 hover:bg-[#F5EFE0] transition-colors">
                          <td className="px-6 py-3 font-medium text-[#2C1810]">
                            <span className="line-clamp-1 text-sm">{(s.recipe as any)?.name ?? "—"}</span>
                          </td>
                          <td className="px-6 py-3">
                            {(s as any).category ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#EDE4CF] text-[#5C4535]">{(s as any).category.name}</span>
                            ) : (
                              <span className="text-xs text-[#D9CCAF]">—</span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-right tabular-nums text-[#5C4535] text-sm">{s.quantity_sold}</td>
                          <td className="px-6 py-3 text-right tabular-nums text-[#4A3728] text-xs whitespace-nowrap">{formatCurrency(s.selling_price)}</td>
                          <td className={`px-6 py-3 text-right tabular-nums font-semibold text-sm whitespace-nowrap ${s.profit >= 0 ? "text-[#737B4C]" : "text-red-600"}`}>
                            {formatCurrency(s.profit * s.quantity_sold)}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${saleMargin >= 30 ? "bg-[#737B4C]/10 text-[#5C6B38]" : saleMargin >= 15 ? "bg-[#B88D6A]/10 text-[#7C563D]" : "bg-red-50 text-red-700"}`}>
                              {saleMargin.toFixed(1)}%
                            </span>
                          </td>
                          <td className="px-6 py-3 text-right text-[#B88D6A] text-xs whitespace-nowrap">
                            {format(new Date(s.created_at), "dd MMM yyyy")}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1">
                              <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg text-[#B88D6A] hover:text-[#A05035] hover:bg-[#EDE4CF] transition-colors" aria-label="Edit">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => { if (confirm("Delete this sale?")) deleteSale.mutate(s.id); }} className="p-1.5 rounded-lg text-[#B88D6A] hover:text-red-500 hover:bg-red-50 transition-colors" aria-label="Delete">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardBody>
      </Card>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? "Edit Sale" : "Record Sale"}
        size="sm"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {editing ? (
            <div className="rounded-lg bg-[#F5EFE0] border border-[#D9CCAF] px-4 py-2.5">
              <p className="text-xs text-[#7C6352]">Product</p>
              <p className="text-sm font-medium text-[#2C1810]">
                {(editing.recipe as any)?.name ?? "—"}
              </p>
            </div>
          ) : (
            <Select
              label="Product"
              value={recipeId}
              onChange={(e) => setRecipeId(e.target.value)}
              required
            >
              <option value="">Select product...</option>
              {recipes?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} — COGS {formatCurrency(r.hpp)}
                </option>
              ))}
            </Select>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-[#4A3728]">
                Category
              </label>
              {!addingCat && (
                <button
                  type="button"
                  onClick={() => setAddingCat(true)}
                  className="text-xs text-[#A05035] hover:underline font-medium flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> New category
                </button>
              )}
            </div>
            {addingCat ? (
              <div className="flex gap-2">
                <input
                  className={`${cls} flex-1`}
                  placeholder="Category name..."
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  autoFocus
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddCategory}
                  loading={createCategory.isPending}
                >
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setAddingCat(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">No category</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </div>

          <Input
            label="Quantity Sold"
            type="number"
            min="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
          <Input
            label="Selling Price per Unit ($)"
            type="number"
            min="0"
            value={sellingPrice}
            onChange={(e) => setSellingPrice(e.target.value)}
            required
          />
          <div>
            <label className="block text-sm font-medium text-[#4A3728] mb-1">Transaction Date</label>
            <input
              type="date"
              className={`${cls} w-full`}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              required
            />
          </div>
          {(editing || selectedRecipe) && Number(sellingPrice) > 0 && (
            <div
              className={`rounded-lg px-4 py-3 border text-xs space-y-1 ${totalProfit >= 0 ? "bg-[#737B4C]/10 border-[#737B4C]/20" : "bg-red-50 border-red-100"}`}
            >
              <div className="flex justify-between">
                <span className="text-[#5C4535]">Revenue</span>
                <span className="font-semibold tabular-nums">
                  {formatCurrency(totalRevenue)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5C4535]">COGS (total)</span>
                <span className="tabular-nums">
                  {formatCurrency(hpp * Number(quantity))}
                </span>
              </div>
              <div
                className={`flex justify-between font-bold border-t pt-1 ${totalProfit >= 0 ? "border-[#737B4C]/30 text-[#5C6B38]" : "border-red-200 text-red-700"}`}
              >
                <span>Profit</span>
                <span className="tabular-nums">
                  {formatCurrency(totalProfit)} ({margin.toFixed(1)}%)
                </span>
              </div>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={closeModal}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={createSale.isPending || updateSale.isPending}
              className="flex-1"
            >
              {editing ? "Save" : "Record"}
            </Button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
