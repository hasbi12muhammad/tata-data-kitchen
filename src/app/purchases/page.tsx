"use client";

export const dynamic = "force-dynamic";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useItems } from "@/hooks/useItems";
import { usePackagingTypes, useCreatePackagingType } from "@/hooks/usePackagingTypes";
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
import { useRecipes } from "@/hooks/useRecipes";
import { Purchase, Production } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { ImportExcelModal } from "@/components/ui/ImportExcelModal";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp, Filter, Pencil, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

const cls =
  "h-9 rounded-lg border border-[#D9CCAF] bg-[#FBF8F2] px-3 text-sm text-[#2C1810] placeholder:text-[#B88D6A] focus:outline-none focus:ring-2 focus:ring-[#A05035] focus:border-transparent";

export default function PurchasesPage() {
  const { data: purchases, isLoading } = usePurchases();
  const { data: items } = useItems();
  const createPurchase = useCreatePurchase();
  const updatePurchase = useUpdatePurchase();
  const deletePurchase = useDeletePurchase();
  const { data: subRecipes } = useRecipes();
  const produceSubRecipe = useProduceSubRecipe();
  const { data: productions } = useProductions();
  const deleteProduction = useDeleteProduction();
  const updateProduction = useUpdateProduction();
  const queryClient = useQueryClient();
  const { data: packagingTypes = [] } = usePackagingTypes();
  const createPkgType = useCreatePackagingType();

  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  async function handleImportPurchases(rows: Record<string, unknown>[]) {
    setImporting(true);
    const supabase = (await import("@/lib/supabase/client")).createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    let success = 0;
    const errors: string[] = [];
    for (const r of rows) {
      const itemName = String(r["nama_item"] ?? r["item"] ?? "").trim();
      const qty = Number(r["quantity"] ?? r["qty"] ?? 0);
      const total = Number(r["total_harga"] ?? r["total_price"] ?? 0);
      if (!itemName || qty <= 0 || total < 0) continue;
      const found = items?.find(
        (i) => i.name.toLowerCase() === itemName.toLowerCase(),
      );
      if (!found) {
        errors.push(`Item "${itemName}" not found`);
        continue;
      }
      const { error } = await supabase.rpc("record_purchase", {
        p_user_id: user!.id,
        p_item_id: found.id,
        p_quantity: qty,
        p_total_price: total,
        p_price_per_unit: total / qty,
      });
      if (error) errors.push(error.message);
      else success++;
    }
    setImporting(false);
    if (errors.length)
      toast.error(`${errors.length} rows failed: ${errors[0]}`);
    if (success) {
      toast.success(`${success} purchases imported successfully`);
      queryClient.invalidateQueries({ queryKey: ["purchases"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
    }
  }

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Purchase | null>(null);
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [usePkg, setUsePkg] = useState(false);
  const [pkgTypeId, setPkgTypeId] = useState("");
  const [pkgQty, setPkgQty] = useState("");
  const [sizePerPkg, setSizePerPkg] = useState("");
  const [addingPkgType, setAddingPkgType] = useState(false);
  const [newPkgTypeName, setNewPkgTypeName] = useState("");
  const [pkgPriceMode, setPkgPriceMode] = useState<"per_unit" | "per_pkg">("per_unit");
  const [pricePerPkg, setPricePerPkg] = useState("");

  const [editingProduction, setEditingProduction] = useState<Production | null>(null);
  const [prodBatches, setProdBatches] = useState("");
  const [prodTotalCost, setProdTotalCost] = useState("");
  const [activeTab, setActiveTab] = useState<"purchases" | "productions">("purchases");
  const [isProduction, setIsProduction] = useState(false);
  const [subRecipeId, setSubRecipeId] = useState("");

  const [prodSearch, setProdSearch] = useState("");
  const [prodFrom, setProdFrom] = useState("");
  const [prodTo, setProdTo] = useState("");
  const [prodFilterSheetOpen, setProdFilterSheetOpen] = useState(false);
  const [pendingProdDateFrom, setPendingProdDateFrom] = useState("");
  const [pendingProdDateTo, setPendingProdDateTo] = useState("");

  const [search, setSearch] = useState("");
  const [filterItem, setFilterItem] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [pendingSortBy, setPendingSortBy] = useState("date_desc");
  const [pendingFilterItem, setPendingFilterItem] = useState("");
  const [pendingDateFrom, setPendingDateFrom] = useState("");
  const [pendingDateTo, setPendingDateTo] = useState("");

  function openEdit(p: Purchase) {
    setEditing(p);
    setItemId("");
    setQuantity(String(p.quantity));
    setPricePerUnit(String(p.price_per_unit));
    setUsePkg(!!p.pkg_type_id);
    setPkgTypeId(p.pkg_type_id ?? "");
    setPkgQty(p.pkg_qty ? String(p.pkg_qty) : "");
    setSizePerPkg(p.size_per_pkg ? String(p.size_per_pkg) : "");
    setAddingPkgType(false);
    setNewPkgTypeName("");
    setPkgPriceMode("per_unit");
    setPricePerPkg("");
    setDate(new Date(p.created_at).toISOString().slice(0, 10));
    setModalOpen(true);
  }

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
    setPkgPriceMode("per_unit");
    setPricePerPkg("");
    setDate(new Date().toISOString().slice(0, 10));
    setProdBatches("");
    setProdTotalCost("");
    setIsProduction(false);
    setSubRecipeId("");
    setModalOpen(true);
  }

  const selectedItem = editing
    ? items?.find((i) => i.id === editing.item_id)
    : items?.find((i) => i.id === itemId);

  const effectiveQty = usePkg && pkgQty && sizePerPkg
    ? Number(pkgQty) * Number(sizePerPkg)
    : Number(quantity);

  const resolvedPricePerUnit = usePkg && pkgPriceMode === "per_pkg" && sizePerPkg && Number(sizePerPkg) > 0
    ? (pricePerPkg ? Number(pricePerPkg) / Number(sizePerPkg) : 0)
    : Number(pricePerUnit) || 0;

  const computedTotal = usePkg && pkgPriceMode === "per_pkg"
    ? (pkgQty && pricePerPkg ? Number(pkgQty) * Number(pricePerPkg) : 0)
    : (effectiveQty > 0 && Number(pricePerUnit) > 0 ? effectiveQty * Number(pricePerUnit) : 0);

  const avgPrice = selectedItem?.avg_price ?? 0;
  const priceDiff = resolvedPricePerUnit > 0 && avgPrice > 0 ? resolvedPricePerUnit - avgPrice : null;
  const pricePct = priceDiff !== null ? (priceDiff / avgPrice) * 100 : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isProduction) {
      if (!prodBatches || !prodTotalCost) return;
      if (Number(prodBatches) <= 0) return;
      if (Number(prodTotalCost) < 0) return;
    } else {
      if (usePkg) {
        if (!pkgTypeId || !pkgQty || !sizePerPkg) return;
        if (Number(pkgQty) <= 0 || Number(sizePerPkg) <= 0) return;
        if (pkgPriceMode === "per_pkg" && (!pricePerPkg || Number(pricePerPkg) <= 0)) return;
        if (pkgPriceMode === "per_unit" && (!pricePerUnit || Number(pricePerUnit) <= 0)) return;
      } else {
        if (!quantity || Number(quantity) <= 0) return;
        if (!pricePerUnit || Number(pricePerUnit) <= 0) return;
      }
    }

    if (editing) {
      const finalQtyEdit = usePkg
        ? Number(pkgQty) * Number(sizePerPkg)
        : Number(quantity);
      await updatePurchase.mutateAsync({
        id: editing.id,
        quantity: finalQtyEdit,
        price_per_unit: resolvedPricePerUnit,
        pkg_type_id: usePkg ? pkgTypeId || null : null,
        pkg_qty: usePkg ? Number(pkgQty) : null,
        size_per_pkg: usePkg ? Number(sizePerPkg) : null,
      });
    } else if (isProduction) {
      if (!subRecipeId) return;
      await produceSubRecipe.mutateAsync({
        recipe_id: subRecipeId,
        batches: Number(prodBatches),
        total_cost: Number(prodTotalCost),
        date,
      });
      setSubRecipeId("");
      setIsProduction(false);
    } else {
      if (!itemId) return;
      const finalQty = usePkg
        ? Number(pkgQty) * Number(sizePerPkg)
        : Number(quantity);
      await createPurchase.mutateAsync({
        item_id: itemId,
        quantity: finalQty,
        price_per_unit: resolvedPricePerUnit,
        date,
        pkg_type_id: usePkg ? pkgTypeId || null : null,
        pkg_qty: usePkg ? Number(pkgQty) : null,
        size_per_pkg: usePkg ? Number(sizePerPkg) : null,
      });
    }
    setModalOpen(false);
    setEditing(null);
    setItemId("");
    setQuantity("");
    setPricePerUnit("");
    setUsePkg(false);
    setPkgTypeId("");
    setPkgQty("");
    setSizePerPkg("");
    setAddingPkgType(false);
    setPkgPriceMode("per_unit");
    setPricePerPkg("");
    setDate(new Date().toISOString().slice(0, 10));
  }

  const filtered = useMemo(() => {
    let rows = purchases ?? [];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((p) =>
        ((p.item as any)?.name ?? "").toLowerCase().includes(q),
      );
    }
    if (filterItem) {
      rows = rows.filter((p) => p.item_id === filterItem);
    }
    if (filterDateFrom) {
      const from = new Date(filterDateFrom);
      from.setHours(0, 0, 0, 0);
      rows = rows.filter((p) => new Date(p.created_at) >= from);
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo);
      to.setHours(23, 59, 59, 999);
      rows = rows.filter((p) => new Date(p.created_at) <= to);
    }
    return [...rows].sort((a, b) => {
      switch (sortBy) {
        case "date_asc":
          return (
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
        case "price_desc":
          return b.total_price - a.total_price;
        case "price_asc":
          return a.total_price - b.total_price;
        case "qty_desc":
          return b.quantity - a.quantity;
        default:
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
      }
    });
  }, [purchases, search, filterItem, sortBy, filterDateFrom, filterDateTo]);

  const hasFilters = search || filterItem || sortBy !== "date_desc" || filterDateFrom || filterDateTo;

  const filteredProductions = useMemo(() => {
    let rows = productions ?? [];
    if (prodSearch) {
      const q = prodSearch.toLowerCase();
      rows = rows.filter((p: any) => (p.recipe?.name ?? "").toLowerCase().includes(q));
    }
    if (prodFrom) {
      const from = new Date(prodFrom);
      from.setHours(0, 0, 0, 0);
      rows = rows.filter((p: any) => new Date(p.created_at) >= from);
    }
    if (prodTo) {
      const to = new Date(prodTo);
      to.setHours(23, 59, 59, 999);
      rows = rows.filter((p: any) => new Date(p.created_at) <= to);
    }
    return [...rows].sort((a: any, b: any) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [productions, prodSearch, prodFrom, prodTo]);

  const hasProdFilters = prodSearch || prodFrom || prodTo;

  return (
    <AppLayout
      title="Purchases"
      action={
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setImportOpen(true)}
          >
            <FileUp className="w-4 h-4" />
            <span className="hidden sm:inline">Import</span>
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add</span>
          </Button>
        </div>
      }
    >
      <Card>
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

        {activeTab === "purchases" && (<>
        {/* Filter bottom sheet */}
        {filterSheetOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setFilterSheetOpen(false)}
            />
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#FBF8F2] rounded-t-2xl shadow-xl p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#2C1810]">Filter</span>
                <button onClick={() => setFilterSheetOpen(false)} className="text-[#B88D6A] hover:text-[#7C6352]">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-[#7C6352] mb-1 block">Sort</label>
                  <select
                    className={`${cls} w-full`}
                    value={pendingSortBy}
                    onChange={(e) => setPendingSortBy(e.target.value)}
                  >
                    <option value="date_desc">Newest</option>
                    <option value="date_asc">Oldest</option>
                    <option value="price_desc">Price ↑</option>
                    <option value="price_asc">Price ↓</option>
                    <option value="qty_desc">Highest qty</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#7C6352] mb-1 block">Item</label>
                  <select
                    className={`${cls} w-full`}
                    value={pendingFilterItem}
                    onChange={(e) => setPendingFilterItem(e.target.value)}
                  >
                    <option value="">All items</option>
                    {items?.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#7C6352] mb-1 block">From date</label>
                  <input
                    type="date"
                    className={`${cls} w-full`}
                    value={pendingDateFrom}
                    onChange={(e) => setPendingDateFrom(e.target.value)}
                    max={pendingDateTo || undefined}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#7C6352] mb-1 block">To date</label>
                  <input
                    type="date"
                    className={`${cls} w-full`}
                    value={pendingDateTo}
                    onChange={(e) => setPendingDateTo(e.target.value)}
                    min={pendingDateFrom || undefined}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => {
                    setPendingSortBy("date_desc");
                    setPendingFilterItem("");
                    setPendingDateFrom("");
                    setPendingDateTo("");
                  }}
                  className="flex-1 h-9 rounded-lg border border-[#D9CCAF] text-sm text-[#7C6352] font-medium hover:bg-[#EDE4CF] transition-colors"
                >
                  Reset
                </button>
                <button
                  onClick={() => {
                    setSortBy(pendingSortBy);
                    setFilterItem(pendingFilterItem);
                    setFilterDateFrom(pendingDateFrom);
                    setFilterDateTo(pendingDateTo);
                    setFilterSheetOpen(false);
                  }}
                  className="flex-1 h-9 rounded-lg bg-[#A05035] text-sm text-white font-medium hover:bg-[#8B4530] transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          </>
        )}

        <div className="px-4 py-3 border-b border-[#E5DACA] space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#B88D6A]" />
              <input
                className={`${cls} w-full pl-8`}
                placeholder="Search items..."
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
            <button
              onClick={() => {
                setPendingSortBy(sortBy);
                setPendingFilterItem(filterItem);
                setPendingDateFrom(filterDateFrom);
                setPendingDateTo(filterDateTo);
                setFilterSheetOpen(true);
              }}
              className={`relative h-9 px-3 rounded-lg border text-sm font-medium transition-colors flex items-center gap-1.5 ${
                (filterItem || sortBy !== "date_desc" || filterDateFrom || filterDateTo)
                  ? "border-[#A05035] bg-[#A05035]/10 text-[#A05035]"
                  : "border-[#D9CCAF] bg-[#FBF8F2] text-[#7C6352] hover:bg-[#EDE4CF]"
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filter
              {(filterItem || sortBy !== "date_desc" || filterDateFrom || filterDateTo) && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#A05035] text-white text-[10px] flex items-center justify-center font-bold">
                  {[filterItem, sortBy !== "date_desc", filterDateFrom, filterDateTo].filter(Boolean).length}
                </span>
              )}
            </button>
          </div>
          <div className="flex items-center justify-between text-xs text-[#B88D6A]">
            <span>
              {filtered.length} results
              {(purchases?.length ?? 0) > filtered.length &&
                ` of ${purchases?.length}`}
            </span>
            {hasFilters && (
              <button
                onClick={() => {
                  setSearch("");
                  setFilterItem("");
                  setSortBy("date_desc");
                  setFilterDateFrom("");
                  setFilterDateTo("");
                  setPendingSortBy("date_desc");
                  setPendingFilterItem("");
                  setPendingDateFrom("");
                  setPendingDateTo("");
                }}
                className="text-[#A05035] hover:underline font-medium"
              >
                Reset all
              </button>
            )}
          </div>
        </div>

        <CardBody className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-sm text-[#B88D6A]">
              Loading...
            </div>
          ) : !purchases?.length ? (
            <EmptyState
              icon={ShoppingCart}
              title="No purchases yet"
              description="Record purchases to start tracking ingredient costs."
              action={
                <Button size="sm" onClick={() => setModalOpen(true)}>
                  <Plus className="w-4 h-4" /> Add Purchase
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
                {filtered.map((p) => (
                  <div key={p.id} className="px-4 py-3 hover:bg-[#F5EFE0] transition-colors flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-[#2C1810] truncate">
                        {(p.item as any)?.name ?? "—"}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-[10px] text-[#B88D6A]">{(p.item as any)?.unit}</span>
                        <span className="text-[10px] text-[#B88D6A]">·</span>
                        <span className="text-[10px] text-[#B88D6A]">{p.quantity} unit</span>
                        <span className="text-[10px] text-[#B88D6A]">·</span>
                        <span className="text-[10px] text-[#B88D6A]">{formatCurrency(p.price_per_unit)}/unit</span>
                      </div>
                      {(p as any).pkg_type && (
                        <p className="text-[10px] text-[#A05035] mt-0.5">
                          {(p as any).pkg_qty} {(p as any).pkg_type.name} × {(p as any).size_per_pkg} {(p.item as any)?.unit}
                        </p>
                      )}
                      <p className="text-[10px] text-[#B88D6A] mt-0.5">
                        {format(new Date(p.created_at), "dd MMM yyyy")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-[#2C1810] tabular-nums whitespace-nowrap">
                          {formatCurrency(p.total_price)}
                        </p>
                      </div>
                      <button
                        onClick={() => openEdit(p)}
                        className="p-1.5 rounded-lg text-[#B88D6A] hover:text-[#A05035] hover:bg-[#EDE4CF] transition-colors"
                        aria-label="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { if (confirm("Delete this purchase?")) deletePurchase.mutate(p.id); }}
                        className="p-1.5 rounded-lg text-[#B88D6A] hover:text-red-500 hover:bg-red-50 transition-colors"
                        aria-label="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#E5DACA]">
                      <th className="text-left px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide">Item</th>
                      <th className="text-right px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide">Qty</th>
                      <th className="text-right px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide">Total</th>
                      <th className="text-right px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide">/Unit</th>
                      <th className="text-right px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide">Date</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.id} className="border-b border-[#EDE4CF] last:border-0 hover:bg-[#F5EFE0] transition-colors">
                        <td className="px-6 py-3 font-medium text-[#2C1810]">
                          <span className="line-clamp-1 text-sm">{(p.item as any)?.name ?? "—"}</span>
                          <span className="text-[10px] text-[#B88D6A]">{(p.item as any)?.unit}</span>
                          {(p as any).pkg_type && (
                            <span className="block text-[10px] text-[#A05035]">
                              {(p as any).pkg_qty} {(p as any).pkg_type.name} × {(p as any).size_per_pkg} {(p.item as any)?.unit}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-right tabular-nums text-[#5C4535] text-sm">{p.quantity}</td>
                        <td className="px-6 py-3 text-right tabular-nums font-medium text-[#2C1810] text-sm whitespace-nowrap">{formatCurrency(p.total_price)}</td>
                        <td className="px-6 py-3 text-right tabular-nums text-[#5C4535] text-xs whitespace-nowrap">{formatCurrency(p.price_per_unit)}</td>
                        <td className="px-6 py-3 text-right text-[#B88D6A] text-xs whitespace-nowrap">{format(new Date(p.created_at), "dd MMM yyyy")}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-[#B88D6A] hover:text-[#A05035] hover:bg-[#EDE4CF] transition-colors" aria-label="Edit">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => { if (confirm("Delete this purchase?")) deletePurchase.mutate(p.id); }} className="p-1.5 rounded-lg text-[#B88D6A] hover:text-red-500 hover:bg-red-50 transition-colors" aria-label="Delete">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardBody>
        </>)}

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
                        setProdFrom(pendingProdDateFrom);
                        setProdTo(pendingProdDateTo);
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
                        onClick={() => { setPendingProdDateFrom(prodFrom); setPendingProdDateTo(prodTo); setProdFilterSheetOpen(true); }}
                        className={`relative h-9 px-3 rounded-lg border text-sm font-medium transition-colors flex items-center gap-1.5 ${
                          (prodFrom || prodTo)
                            ? "border-[#A05035] bg-[#A05035]/10 text-[#A05035]"
                            : "border-[#D9CCAF] bg-[#FBF8F2] text-[#7C6352] hover:bg-[#EDE4CF]"
                        }`}
                      >
                        <Filter className="w-3.5 h-3.5" />
                        Filter
                        {(prodFrom || prodTo) && (
                          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#A05035] text-white text-[10px] flex items-center justify-center font-bold">
                            {[prodFrom, prodTo].filter(Boolean).length}
                          </span>
                        )}
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-xs text-[#B88D6A]">
                      <span>{filteredProductions.length} results{(productions?.length ?? 0) > filteredProductions.length && ` of ${productions?.length}`}</span>
                      {hasProdFilters && (
                        <button
                          onClick={() => { setProdSearch(""); setProdFrom(""); setProdTo(""); setPendingProdDateFrom(""); setPendingProdDateTo(""); }}
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
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Purchase" : "Record Purchase"}
        size="sm"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {editing ? (
            <div className="rounded-lg bg-[#F5EFE0] border border-[#D9CCAF] px-4 py-2.5">
              <p className="text-xs text-[#7C6352]">Item</p>
              <p className="text-sm font-medium text-[#2C1810]">
                {(editing.item as any)?.name ?? "—"}{" "}
                <span className="text-xs text-[#B88D6A]">
                  ({(editing.item as any)?.unit})
                </span>
              </p>
            </div>
          ) : (
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
          {isProduction ? (
            <>
              <Input
                label="Batches Produced"
                type="number"
                min="0.01"
                step="0.01"
                value={prodBatches}
                onChange={(e) => setProdBatches(e.target.value)}
                required
              />
              <Input
                label="Total Production Cost ($)"
                type="number"
                min="0"
                value={prodTotalCost}
                onChange={(e) => setProdTotalCost(e.target.value)}
                required
              />
            </>
          ) : (
            <>
              {/* Packaging toggle */}
              <div className="flex items-center gap-2">
                <input
                  id="usePkg"
                  type="checkbox"
                  checked={usePkg}
                  onChange={(e) => {
                    setUsePkg(e.target.checked);
                    if (!e.target.checked) { setPkgTypeId(""); setPkgQty(""); setSizePerPkg(""); setAddingPkgType(false); setNewPkgTypeName(""); }
                  }}
                  className="rounded border-[#D9CCAF] text-[#A05035] focus:ring-[#A05035]"
                />
                <label htmlFor="usePkg" className="text-sm text-[#4A3728] cursor-pointer">
                  Buy by package?
                </label>
              </div>

              {usePkg ? (
                <div className="rounded-lg border border-[#D9CCAF] bg-[#F5EFE0] p-3 space-y-3">
                  {/* Jenis kemasan */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-[#7C6352]">Packaging type</label>
                    {addingPkgType ? (
                      <div className="flex gap-2">
                        <input
                          autoFocus
                          className="h-9 rounded-lg border border-[#D9CCAF] bg-[#FBF8F2] px-3 text-sm text-[#2C1810] flex-1 focus:outline-none focus:ring-2 focus:ring-[#A05035]"
                          placeholder="New packaging name..."
                          value={newPkgTypeName}
                          onChange={(e) => setNewPkgTypeName(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              if (!newPkgTypeName.trim() || createPkgType.isPending) return;
                              const newId = await createPkgType.mutateAsync(newPkgTypeName.trim());
                              setPkgTypeId(newId);
                              setNewPkgTypeName("");
                              setAddingPkgType(false);
                            }
                            if (e.key === "Escape") { setAddingPkgType(false); setNewPkgTypeName(""); }
                          }}
                        />
                        <button type="button"
                          onClick={async () => {
                            if (!newPkgTypeName.trim()) return;
                            const newId = await createPkgType.mutateAsync(newPkgTypeName.trim());
                            setPkgTypeId(newId);
                            setNewPkgTypeName("");
                            setAddingPkgType(false);
                          }}
                          disabled={!newPkgTypeName.trim() || createPkgType.isPending}
                          className="px-3 h-9 rounded-lg bg-[#A05035] text-white text-sm disabled:opacity-50 hover:bg-[#8B4530] transition-colors"
                        >Add</button>
                        <button type="button" onClick={() => { setAddingPkgType(false); setNewPkgTypeName(""); }}
                          className="px-3 h-9 rounded-lg border border-[#D9CCAF] text-sm text-[#7C6352] hover:bg-[#EDE4CF] transition-colors">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <select
                          className="h-9 flex-1 rounded-lg border border-[#D9CCAF] bg-[#FBF8F2] px-3 text-sm text-[#2C1810] focus:outline-none focus:ring-2 focus:ring-[#A05035]"
                          value={pkgTypeId}
                          onChange={(e) => setPkgTypeId(e.target.value)}
                        >
                          <option value="">Select packaging...</option>
                          {packagingTypes.map((pt) => (
                            <option key={pt.id} value={pt.id}>{pt.name}</option>
                          ))}
                        </select>
                        <button type="button" onClick={() => setAddingPkgType(true)}
                          className="px-3 h-9 rounded-lg border border-[#A05035] text-[#A05035] text-sm hover:bg-[#A05035]/10 transition-colors">
                          + Add
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Jumlah & Isi */}
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-[#7C6352] mb-1">No. of packages</label>
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
                        Qty per package ({selectedItem?.unit ?? "unit"})
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
                  label={`Quantity (${selectedItem?.unit ?? "unit"})`}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                />
              )}

              {/* Price mode toggle — only shown when using packaging */}
              {usePkg && (
                <div className="flex gap-1 rounded-lg border border-[#D9CCAF] bg-[#F5EFE0] p-1">
                  <button
                    type="button"
                    onClick={() => { setPkgPriceMode("per_unit"); setPricePerPkg(""); }}
                    className={`flex-1 py-1 rounded-md text-xs font-medium transition-colors ${pkgPriceMode === "per_unit" ? "bg-white text-[#2C1810] shadow-sm" : "text-[#7C6352] hover:text-[#2C1810]"}`}
                  >
                    Price per {selectedItem?.unit ?? "unit"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPkgPriceMode("per_pkg"); setPricePerUnit(""); }}
                    className={`flex-1 py-1 rounded-md text-xs font-medium transition-colors ${pkgPriceMode === "per_pkg" ? "bg-white text-[#2C1810] shadow-sm" : "text-[#7C6352] hover:text-[#2C1810]"}`}
                  >
                    Price per package
                  </button>
                </div>
              )}

              {usePkg && pkgPriceMode === "per_pkg" ? (
                <Input
                  label="Price per package ($)"
                  type="number"
                  min="0"
                  step="1"
                  value={pricePerPkg}
                  onChange={(e) => setPricePerPkg(e.target.value)}
                  required
                />
              ) : (
                <Input
                  label={`Price per ${selectedItem?.unit ?? "unit"}`}
                  type="number"
                  min="0"
                  step="1"
                  value={pricePerUnit}
                  onChange={(e) => setPricePerUnit(e.target.value)}
                  required
                />
              )}

              {/* Preview: computed total + avg comparison */}
              {computedTotal > 0 && (
                <div className="rounded-lg bg-[#737B4C]/10 border border-[#737B4C]/20 px-4 py-2.5 space-y-1">
                  <p className="text-xs text-[#5C6B38] font-medium">
                    Total: <span className="font-bold">{formatCurrency(computedTotal)}</span>
                  </p>
                  {usePkg && pkgPriceMode === "per_pkg" && resolvedPricePerUnit > 0 && (
                    <p className="text-xs text-[#5C6B38]">
                      = <span className="font-semibold">{formatCurrency(resolvedPricePerUnit)}</span> per {selectedItem?.unit ?? "unit"}
                    </p>
                  )}
                  {priceDiff !== null && pricePct !== null && (
                    <p className={`text-xs font-medium ${priceDiff > 0 ? "text-red-600" : "text-green-700"}`}>
                      {priceDiff > 0 ? "▲" : "▼"}{" "}
                      {formatCurrency(Math.abs(priceDiff))} ({pricePct > 0 ? "+" : ""}{pricePct.toFixed(1)}%) vs avg price
                    </p>
                  )}
                </div>
              )}
            </>
          )}
          {isProduction && subRecipeId && (() => {
            const sr = (subRecipes ?? []).find((r) => r.id === subRecipeId);
            if (!sr) return null;
            const costPerUnit =
              Number(prodTotalCost) > 0 && Number(prodBatches) > 0
                ? (Number(prodTotalCost) / Number(prodBatches)).toFixed(2)
                : "—";
            return (
              <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5">
                <p className="text-xs text-amber-700 font-medium">
                  Cost per unit: <span className="font-bold">{costPerUnit}</span>
                </p>
              </div>
            );
          })()}
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
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setModalOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={createPurchase.isPending || updatePurchase.isPending || produceSubRecipe.isPending}
              className="flex-1"
            >
              {editing ? "Save" : "Record"}
            </Button>
          </div>
        </form>
      </Modal>

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

      <ImportExcelModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        title="Import Purchases"
        templateFilename="template_purchases.xlsx"
        templateColumns={["nama_item", "quantity", "total_harga"]}
        templateRows={[
          ["Tepung Terigu", 1000, 15000],
          ["Gula Pasir", 500, 8000],
        ]}
        previewColumns={[
          { key: "nama_item", label: "Item Name" },
          { key: "quantity", label: "Qty" },
          { key: "total_harga", label: "Total Price" },
        ]}
        onImport={handleImportPurchases}
        importing={importing}
      />
    </AppLayout>
  );
}
