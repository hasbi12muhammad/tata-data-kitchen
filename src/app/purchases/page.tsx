"use client";

export const dynamic = "force-dynamic";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useItems } from "@/hooks/useItems";
import {
  useCreatePurchase,
  useDeletePurchase,
  usePurchases,
  useUpdatePurchase,
} from "@/hooks/usePurchases";
import { Purchase } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { ImportExcelModal } from "@/components/ui/ImportExcelModal";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp, Pencil, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

const cls =
  "h-9 rounded-lg border border-[#D9CCAF] bg-[#FBF8F2] px-3 text-sm text-[#2C1810] placeholder:text-[#B88D6A] focus:outline-none focus:ring-2 focus:ring-[#A05035] focus:border-transparent";

export default function PurchasesPage() {
  const { data: purchases, isLoading } = usePurchases();
  const { data: items } = useItems();
  const createPurchase = useCreatePurchase();
  const updatePurchase = useUpdatePurchase();
  const deletePurchase = useDeletePurchase();
  const queryClient = useQueryClient();

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
  const [totalPrice, setTotalPrice] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  function openEdit(p: Purchase) {
    setEditing(p);
    setQuantity(String(p.quantity));
    setTotalPrice(String(p.total_price));
    setDate(new Date(p.created_at).toISOString().slice(0, 10));
    setModalOpen(true);
  }

  function openCreate() {
    setEditing(null);
    setItemId("");
    setQuantity("");
    setTotalPrice("");
    setDate(new Date().toISOString().slice(0, 10));
    setModalOpen(true);
  }

  const [search, setSearch] = useState("");
  const [filterItem, setFilterItem] = useState("");
  const [sortBy, setSortBy] = useState("date_desc");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const pricePerUnit =
    quantity && totalPrice && Number(quantity) > 0
      ? Number(totalPrice) / Number(quantity)
      : 0;

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
  }, [purchases, search, filterItem, sortBy]);

  const hasFilters = search || filterItem || sortBy !== "date_desc" || filterDateFrom || filterDateTo;

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
            <FileUp className="w-4 h-4" /> Import
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
      }
    >
      <Card>
        <div className="px-4 py-3 border-b border-[#E5DACA] space-y-2">
          <div className="relative">
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
          <div className="flex gap-2">
            <select
              className={`${cls} flex-1`}
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="date_desc">Newest</option>
              <option value="date_asc">Oldest</option>
              <option value="price_desc">Price ↑</option>
              <option value="price_asc">Price ↓</option>
              <option value="qty_desc">Highest qty</option>
            </select>
            <select
              className={`${cls} flex-1`}
              value={filterItem}
              onChange={(e) => setFilterItem(e.target.value)}
            >
              <option value="">All items</option>
              {items?.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-xs text-[#B88D6A] whitespace-nowrap">From</span>
            <input
              type="date"
              className={`${cls} flex-1`}
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              max={filterDateTo || undefined}
            />
            <span className="text-xs text-[#B88D6A] whitespace-nowrap">to</span>
            <input
              type="date"
              className={`${cls} flex-1`}
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              min={filterDateFrom || undefined}
            />
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
          )}
          <Input
            label="Quantity"
            type="number"
            min="0.01"
            step="0.01"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
          />
          <Input
            label="Total Price ($)"
            type="number"
            min="0"
            value={totalPrice}
            onChange={(e) => setTotalPrice(e.target.value)}
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
          {pricePerUnit > 0 && (
            <div className="rounded-lg bg-[#737B4C]/10 border border-[#737B4C]/20 px-4 py-2.5">
              <p className="text-xs text-[#5C6B38] font-medium">
                Price per unit:{" "}
                <span className="font-bold">
                  {formatCurrency(pricePerUnit)}
                </span>
              </p>
            </div>
          )}
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
              loading={createPurchase.isPending || updatePurchase.isPending}
              className="flex-1"
            >
              {editing ? "Save" : "Record"}
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
