"use client";

export const dynamic = "force-dynamic";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  useCreateItem,
  useDeleteItem,
  useItems,
  useUpdateItem,
} from "@/hooks/useItems";
import { Item } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { ImportExcelModal } from "@/components/ui/ImportExcelModal";
import { UnitSelect, HARDCODED_UNITS } from "@/components/ui/UnitSelect";
import { useCustomUnits } from "@/hooks/useUnits";
import { FileUp, Filter, Package, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

const cls =
  "h-9 rounded-lg border border-[#D9CCAF] bg-[#FBF8F2] px-3 text-sm text-[#2C1810] placeholder:text-[#B88D6A] focus:outline-none focus:ring-2 focus:ring-[#A05035] focus:border-transparent";

export default function ItemsPage() {
  const { data: customUnits = [] } = useCustomUnits();
  const { data: items, isLoading } = useItems();
  const createItem = useCreateItem();
  const updateItem = useUpdateItem();
  const deleteItem = useDeleteItem();
  const queryClient = useQueryClient();

  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  async function handleImportItems(rows: Record<string, unknown>[]) {
    const supabase = (await import("@/lib/supabase/client")).createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const allUnits = [
      ...HARDCODED_UNITS,
      ...(customUnits?.map((u) => u.name.toLowerCase()) ?? []),
    ];
    const valid = rows
      .map((r) => ({
        name: String(r["nama"] ?? r["name"] ?? "").trim(),
        unit: String(r["unit"] ?? "")
          .trim()
          .toLowerCase(),
      }))
      .filter(
        (r) =>
          r.name &&
          allUnits.includes(r.unit),
      );
    if (!valid.length) {
      toast.error("No valid rows. Check the name & unit columns.");
      return;
    }
    setImporting(true);
    const { error } = await supabase
      .from("items")
      .insert(
        valid.map((r) => ({ ...r, user_id: user!.id, avg_price: 0, stock: 0 })),
      );
    setImporting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${valid.length} items imported successfully`);
    queryClient.invalidateQueries({ queryKey: ["items"] });
  }

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<string>("gr");

  const [search, setSearch] = useState("");
  const [filterUnit, setFilterUnit] = useState("");
  const [sortBy, setSortBy] = useState("name_asc");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [pendingSortBy, setPendingSortBy] = useState("name_asc");
  const [pendingFilterUnit, setPendingFilterUnit] = useState("");

  function openCreate() {
    setEditing(null);
    setName("");
    setUnit("gr");
    setModalOpen(true);
  }

  function openEdit(item: Item) {
    setEditing(item);
    setName(item.name);
    setUnit(item.unit);
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (editing) {
      await updateItem.mutateAsync({ id: editing.id, name: name.trim(), unit });
    } else {
      await createItem.mutateAsync({ name: name.trim(), unit });
    }
    setModalOpen(false);
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this item?")) return;
    deleteItem.mutate(id);
  }

  const filtered = useMemo(() => {
    let rows = items ?? [];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((i) => i.name.toLowerCase().includes(q));
    }
    if (filterUnit) {
      rows = rows.filter((i) => i.unit === filterUnit);
    }
    return [...rows].sort((a, b) => {
      switch (sortBy) {
        case "name_desc":
          return b.name.localeCompare(a.name);
        case "price_desc":
          return b.avg_price - a.avg_price;
        case "price_asc":
          return a.avg_price - b.avg_price;
        case "stock_desc":
          return b.stock - a.stock;
        case "stock_asc":
          return a.stock - b.stock;
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [items, search, filterUnit, sortBy]);

  const hasFilters = search || filterUnit || sortBy !== "name_asc";

  return (
    <AppLayout
      title="Raw Materials"
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
                    <option value="name_asc">Name A–Z</option>
                    <option value="name_desc">Name Z–A</option>
                    <option value="price_desc">Price ↑</option>
                    <option value="price_asc">Price ↓</option>
                    <option value="stock_desc">Stock ↑</option>
                    <option value="stock_asc">Stock ↓</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#7C6352] mb-1 block">Unit</label>
                  <select
                    className={`${cls} w-full`}
                    value={pendingFilterUnit}
                    onChange={(e) => setPendingFilterUnit(e.target.value)}
                  >
                    <option value="">All units</option>
                    {HARDCODED_UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                    {customUnits.map((u) => (
                      <option key={u.id} value={u.name}>{u.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => {
                    setPendingSortBy("name_asc");
                    setPendingFilterUnit("");
                  }}
                  className="flex-1 h-9 rounded-lg border border-[#D9CCAF] text-sm text-[#7C6352] font-medium hover:bg-[#EDE4CF] transition-colors"
                >
                  Reset
                </button>
                <button
                  onClick={() => {
                    setSortBy(pendingSortBy);
                    setFilterUnit(pendingFilterUnit);
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
                placeholder="Search item name..."
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
                setPendingFilterUnit(filterUnit);
                setFilterSheetOpen(true);
              }}
              className={`relative h-9 px-3 rounded-lg border text-sm font-medium transition-colors flex items-center gap-1.5 ${
                (filterUnit || sortBy !== "name_asc")
                  ? "border-[#A05035] bg-[#A05035]/10 text-[#A05035]"
                  : "border-[#D9CCAF] bg-[#FBF8F2] text-[#7C6352] hover:bg-[#EDE4CF]"
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filter
              {(filterUnit || sortBy !== "name_asc") && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#A05035] text-white text-[10px] flex items-center justify-center font-bold">
                  {[filterUnit, sortBy !== "name_asc"].filter(Boolean).length}
                </span>
              )}
            </button>
          </div>
          <div className="flex items-center justify-between text-xs text-[#B88D6A]">
            <span>
              {filtered.length} items
              {(items?.length ?? 0) > filtered.length &&
                ` of ${items?.length}`}
            </span>
            {hasFilters && (
              <button
                onClick={() => {
                  setSearch("");
                  setFilterUnit("");
                  setSortBy("name_asc");
                  setPendingSortBy("name_asc");
                  setPendingFilterUnit("");
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
          ) : !items?.length ? (
            <EmptyState
              icon={Package}
              title="No items yet"
              description="Add raw materials to track costs and stock."
              action={
                <Button size="sm" onClick={openCreate}>
                  <Plus className="w-4 h-4" /> Add Item
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#B88D6A]">
              No items for this filter
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E5DACA]">
                    <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide">
                      Name
                    </th>
                    <th className="text-left px-3 sm:px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide">
                      Unit
                    </th>
                    <th className="text-right px-3 sm:px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide">
                      Avg Price
                    </th>
                    <th className="text-right px-3 sm:px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide hidden sm:table-cell">
                      Stock
                    </th>
                    <th className="px-3 sm:px-6 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-[#EDE4CF] last:border-0 hover:bg-[#F5EFE0] transition-colors"
                    >
                      <td className="px-4 sm:px-6 py-2.5 sm:py-3 font-medium text-[#2C1810]">
                        <span className="break-words">{item.name}</span>
                        <span className="sm:hidden block text-xs text-[#B88D6A] font-normal mt-0.5">
                          Stock: {item.stock} {item.unit}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-2.5 sm:py-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#EDE4CF] text-[#5C4535]">
                          {item.unit}
                        </span>
                      </td>
                      <td className="px-3 sm:px-6 py-2.5 sm:py-3 text-right tabular-nums text-[#4A3728] text-xs sm:text-sm whitespace-nowrap">
                        {formatCurrency(item.avg_price)}
                      </td>
                      <td className="px-3 sm:px-6 py-2.5 sm:py-3 text-right tabular-nums text-[#4A3728] text-xs hidden sm:table-cell">
                        {item.stock} {item.unit}
                      </td>
                      <td className="px-3 sm:px-6 py-2.5 sm:py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(item)}
                            className="p-1.5 rounded-lg text-[#B88D6A] hover:text-[#A05035] hover:bg-[#EDE4CF] cursor-pointer transition-colors"
                            aria-label="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="p-1.5 rounded-lg text-[#B88D6A] hover:text-red-600 hover:bg-red-50 cursor-pointer transition-colors"
                            aria-label="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "Edit Item" : "Add Item"}
        size="sm"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Item Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. All-purpose Flour"
          />
          <UnitSelect
            label="Unit"
            value={unit}
            onChange={setUnit}
            required
          />
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
              loading={createItem.isPending || updateItem.isPending}
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
        title="Import Raw Materials"
        templateFilename="template_items.xlsx"
        templateColumns={["nama", "unit"]}
        templateRows={[
          ["Tepung Terigu", "gr"],
          ["Gula Pasir", "kg"],
          ["Minyak Goreng", "liter"],
        ]}
        previewColumns={[
          { key: "nama", label: "Name" },
          { key: "unit", label: "Unit" },
        ]}
        onImport={handleImportItems}
        importing={importing}
      />
    </AppLayout>
  );
}
