"use client";

export const dynamic = "force-dynamic";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import {
  useCreateExpense,
  useCreateExpenseCategory,
  useDeleteExpense,
  useExpenseCategories,
  useExpenses,
  useUpdateExpense,
} from "@/hooks/useExpenses";
import { Expense } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { format } from "date-fns";
import { Filter, Pencil, Plus, Receipt, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

const cls =
  "h-9 rounded-lg border border-[#D9CCAF] bg-[#FBF8F2] px-3 text-sm text-[#2C1810] placeholder:text-[#B88D6A] focus:outline-none focus:ring-2 focus:ring-[#A05035] focus:border-transparent";

export default function ExpensesPage() {
  const { data: expenses, isLoading } = useExpenses();
  const { data: categories } = useExpenseCategories();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();
  const createCategory = useCreateExpenseCategory();

  // ── filter state ────────────────────────────────────────────
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [pendingFilterCategory, setPendingFilterCategory] = useState("");
  const [pendingFilterFrom, setPendingFilterFrom] = useState("");
  const [pendingFilterTo, setPendingFilterTo] = useState("");

  // ── modal state ─────────────────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [newCatName, setNewCatName] = useState("");
  const [addingCat, setAddingCat] = useState(false);

  const total =
    Number(qty) > 0 && Number(price) > 0 ? Number(qty) * Number(price) : 0;

  function openCreate() {
    setEditing(null);
    setDate(new Date().toISOString().split("T")[0]);
    setCategoryId("");
    setName("");
    setQty("1");
    setPrice("");
    setNote("");
    setNewCatName("");
    setAddingCat(false);
    setModalOpen(true);
  }

  function openEdit(exp: Expense) {
    setEditing(exp);
    setDate(exp.created_at.split("T")[0]);
    setCategoryId(exp.category_id ?? "");
    setName(exp.name);
    setQty(String(exp.qty));
    setPrice(String(exp.price));
    setNote(exp.note ?? "");
    setNewCatName("");
    setAddingCat(false);
    setModalOpen(true);
  }

  async function handleAddCategory() {
    if (!newCatName.trim()) return;
    const cat = await createCategory.mutateAsync(newCatName.trim());
    setCategoryId(cat.id);
    setNewCatName("");
    setAddingCat(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || Number(qty) <= 0 || Number(price) <= 0) return;
    const payload = {
      name: name.trim(),
      qty: Number(qty),
      price: Number(price),
      total,
      category_id: categoryId || null,
      note: note.trim() || null,
      created_at: new Date(date).toISOString(),
    };
    if (editing) {
      await updateExpense.mutateAsync({ id: editing.id, ...payload });
    } else {
      await createExpense.mutateAsync(payload);
    }
    setModalOpen(false);
    setEditing(null);
  }

  const filtered = useMemo(() => {
    let rows = expenses ?? [];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((e) => e.name.toLowerCase().includes(q));
    }
    if (filterCategory) {
      rows = rows.filter((e) => e.category_id === filterCategory);
    }
    if (filterFrom) {
      const from = new Date(filterFrom);
      rows = rows.filter((e) => new Date(e.created_at) >= from);
    }
    if (filterTo) {
      const to = new Date(filterTo + "T23:59:59");
      rows = rows.filter((e) => new Date(e.created_at) <= to);
    }
    return rows;
  }, [expenses, search, filterCategory, filterFrom, filterTo]);

  const hasFilters = search || filterCategory || filterFrom || filterTo;

  return (
    <AppLayout
      title="Expenses"
      action={
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Add</span>
        </Button>
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
                  <label className="text-xs font-medium text-[#7C6352] mb-1 block">Category</label>
                  <select
                    className={`${cls} w-full`}
                    value={pendingFilterCategory}
                    onChange={(e) => setPendingFilterCategory(e.target.value)}
                  >
                    <option value="">All categories</option>
                    {categories?.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[#7C6352] mb-1 block">From date</label>
                  <input
                    type="date"
                    className={`${cls} w-full`}
                    value={pendingFilterFrom}
                    onChange={(e) => setPendingFilterFrom(e.target.value)}
                    max={pendingFilterTo || undefined}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[#7C6352] mb-1 block">To date</label>
                  <input
                    type="date"
                    className={`${cls} w-full`}
                    value={pendingFilterTo}
                    onChange={(e) => setPendingFilterTo(e.target.value)}
                    min={pendingFilterFrom || undefined}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => {
                    setPendingFilterCategory("");
                    setPendingFilterFrom("");
                    setPendingFilterTo("");
                  }}
                  className="flex-1 h-9 rounded-lg border border-[#D9CCAF] text-sm text-[#7C6352] font-medium hover:bg-[#EDE4CF] transition-colors"
                >
                  Reset
                </button>
                <button
                  onClick={() => {
                    setFilterCategory(pendingFilterCategory);
                    setFilterFrom(pendingFilterFrom);
                    setFilterTo(pendingFilterTo);
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

        {/* Filter bar */}
        <div className="px-4 py-3 border-b border-[#E5DACA] space-y-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#B88D6A]" />
              <input
                className={`${cls} w-full pl-8`}
                placeholder="Search expenses..."
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
                setPendingFilterCategory(filterCategory);
                setPendingFilterFrom(filterFrom);
                setPendingFilterTo(filterTo);
                setFilterSheetOpen(true);
              }}
              className={`relative h-9 px-3 rounded-lg border text-sm font-medium transition-colors flex items-center gap-1.5 ${
                (filterCategory || filterFrom || filterTo)
                  ? "border-[#A05035] bg-[#A05035]/10 text-[#A05035]"
                  : "border-[#D9CCAF] bg-[#FBF8F2] text-[#7C6352] hover:bg-[#EDE4CF]"
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filter
              {(filterCategory || filterFrom || filterTo) && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#A05035] text-white text-[10px] flex items-center justify-center font-bold">
                  {[filterCategory, filterFrom, filterTo].filter(Boolean).length}
                </span>
              )}
            </button>
          </div>
          <div className="flex items-center justify-between text-xs text-[#B88D6A]">
            <span>
              {filtered.length} results
              {(expenses?.length ?? 0) > filtered.length &&
                ` of ${expenses?.length}`}
            </span>
            {hasFilters && (
              <button
                onClick={() => {
                  setSearch("");
                  setFilterCategory("");
                  setFilterFrom("");
                  setFilterTo("");
                  setPendingFilterCategory("");
                  setPendingFilterFrom("");
                  setPendingFilterTo("");
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
          ) : !expenses?.length ? (
            <EmptyState
              icon={Receipt}
              title="No expenses yet"
              description="Record operational expenses like gas, electricity, packaging, etc."
              action={
                <Button size="sm" onClick={openCreate}>
                  <Plus className="w-4 h-4" /> Add Expense
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#B88D6A]">
              No results for this filter
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#E5DACA]">
                    <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide">
                      Name
                    </th>
                    <th className="text-left px-2 sm:px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide hidden sm:table-cell">
                      Category
                    </th>
                    <th className="text-right px-2 sm:px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide">
                      Qty
                    </th>
                    <th className="text-right px-2 sm:px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide">
                      Total
                    </th>
                    <th className="text-right px-2 sm:px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide hidden sm:table-cell">
                      Date
                    </th>
                    <th className="px-2 sm:px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((exp) => (
                    <tr
                      key={exp.id}
                      className="border-b border-[#EDE4CF] last:border-0 hover:bg-[#F5EFE0] transition-colors"
                    >
                      <td className="px-4 sm:px-6 py-2.5 sm:py-3">
                        <span className="font-medium text-[#2C1810] text-xs sm:text-sm line-clamp-1">
                          {exp.name}
                        </span>
                        {exp.note && (
                          <span className="block text-[10px] text-[#B88D6A] line-clamp-1">
                            {exp.note}
                          </span>
                        )}
                        <div className="flex items-center gap-1.5 mt-0.5 sm:hidden flex-wrap">
                          {exp.category ? (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#EDE4CF] text-[#5C4535]">
                              {exp.category.name}
                            </span>
                          ) : null}
                          <span className="text-[10px] text-[#B88D6A]">
                            {format(new Date(exp.created_at), "dd MMM yyyy")}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 sm:px-6 py-2.5 sm:py-3 hidden sm:table-cell">
                        {exp.category ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#EDE4CF] text-[#5C4535]">
                            {exp.category.name}
                          </span>
                        ) : (
                          <span className="text-xs text-[#D9CCAF]">—</span>
                        )}
                      </td>
                      <td className="px-2 sm:px-6 py-2.5 sm:py-3 text-right tabular-nums text-[#5C4535] text-xs sm:text-sm">
                        {exp.qty}
                      </td>
                      <td className="px-2 sm:px-6 py-2.5 sm:py-3 text-right tabular-nums font-medium text-[#2C1810] text-xs sm:text-sm whitespace-nowrap">
                        {formatCurrency(exp.total)}
                      </td>
                      <td className="px-2 sm:px-6 py-2.5 sm:py-3 text-right text-[#B88D6A] text-xs whitespace-nowrap hidden sm:table-cell">
                        {format(new Date(exp.created_at), "dd MMM yyyy")}
                      </td>
                      <td className="px-2 sm:px-3 py-2.5 sm:py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => openEdit(exp)}
                            className="p-1.5 rounded-lg text-[#B88D6A] hover:text-[#A05035] hover:bg-[#EDE4CF] transition-colors"
                            aria-label="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm("Delete this expense?"))
                                deleteExpense.mutate(exp.id);
                            }}
                            className="p-1.5 rounded-lg text-[#B88D6A] hover:text-red-500 hover:bg-red-50 transition-colors"
                            aria-label="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        title={editing ? "Edit Expense" : "Add Expense"}
        size="sm"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />

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
            label="Item Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Gas LPG 3kg"
          />
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                label="Qty"
                type="number"
                min="0.01"
                step="0.01"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
              />
            </div>
            <div className="flex-1">
              <Input
                label="Unit Price (USD)"
                type="number"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </div>
          </div>
          {total > 0 && (
            <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-2.5">
              <p className="text-xs text-red-700 font-medium">
                Total:{" "}
                <span className="font-bold">{formatCurrency(total)}</span>
              </p>
            </div>
          )}
          <Input
            label="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional..."
          />
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
              loading={createExpense.isPending || updateExpense.isPending}
              className="flex-1"
            >
              {editing ? "Save" : "Add"}
            </Button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
