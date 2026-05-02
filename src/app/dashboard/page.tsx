"use client";

export const dynamic = "force-dynamic";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { useExpensesByDate } from "@/hooks/useExpenses";
import { usePurchasesByDate, useSalesByDate } from "@/hooks/useDailyData";
import { formatCurrency } from "@/lib/utils";
import { Expense, Purchase, Sale } from "@/types";
import { format } from "date-fns";
import { enUS } from "date-fns/locale";
import {
  LucideIcon,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
} from "lucide-react";
import { useState } from "react";

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

interface SummaryCardProps {
  label: string;
  amount: number;
  icon: LucideIcon;
  colorClass: string;
  dark?: boolean;
  negative?: boolean;
}

function SummaryCard({
  label,
  amount,
  icon: Icon,
  colorClass,
  dark,
  negative,
}: SummaryCardProps) {
  return (
    <div
      className={`rounded-xl p-4 flex flex-col gap-2 ${dark ? (negative ? "bg-red-700" : "bg-[#1B4332]") : "bg-[#FBF8F2] border border-[#E5DACA]"}`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-xs font-medium ${dark ? "text-white/70" : "text-[#7C6352]"}`}
        >
          {label}
        </span>
        <span
          className={`p-1.5 rounded-lg ${dark ? "bg-white/10" : colorClass + "/10"}`}
        >
          <Icon className={`w-4 h-4 ${dark ? "text-white/80" : colorClass}`} />
        </span>
      </div>
      <span
        className={`text-lg sm:text-xl font-bold tabular-nums ${dark ? "text-white" : "text-[#2C1810]"}`}
      >
        {formatCurrency(Math.abs(amount))}
        {negative && amount < 0 && (
          <span className="text-xs font-normal ml-1 opacity-70">(loss)</span>
        )}
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const [date, setDate] = useState(todayString());

  const { data: sales = [], isLoading: salesLoading } = useSalesByDate(date);
  const { data: expenses = [], isLoading: expLoading } =
    useExpensesByDate(date);
  const { data: purchases = [], isLoading: purchLoading } =
    usePurchasesByDate(date);

  const isLoading = salesLoading || expLoading || purchLoading;

  const totalSales = sales.reduce(
    (s, r) => s + r.selling_price * r.quantity_sold,
    0,
  );
  const totalExpense = expenses.reduce((s, r) => s + r.total, 0);
  const totalPurchase = purchases.reduce((s, r) => s + r.total_price, 0);
  const netProfit = totalSales - totalExpense - totalPurchase;

  // Aggregate sales by category → recipe name
  const salesByCategory = sales.reduce<
    Record<
      string,
      { items: { name: string; qty: number; total: number }[]; total: number }
    >
  >((acc, s) => {
    const cat = (s as any).category?.name ?? "Uncategorized";
    const recipeName = (s.recipe as any)?.name ?? "—";
    if (!acc[cat]) acc[cat] = { items: [], total: 0 };
    const existing = acc[cat].items.find((i) => i.name === recipeName);
    if (existing) {
      existing.qty += s.quantity_sold;
      existing.total += s.selling_price * s.quantity_sold;
    } else {
      acc[cat].items.push({
        name: recipeName,
        qty: s.quantity_sold,
        total: s.selling_price * s.quantity_sold,
      });
    }
    acc[cat].total += s.selling_price * s.quantity_sold;
    return acc;
  }, {});

  // Aggregate expenses by category
  const expByCategory = expenses.reduce<
    Record<string, { items: Expense[]; total: number }>
  >((acc, e) => {
    const cat = e.category?.name ?? "Uncategorized";
    if (!acc[cat]) acc[cat] = { items: [], total: 0 };
    acc[cat].items.push(e);
    acc[cat].total += e.total;
    return acc;
  }, {});

  const dateDisplay = (() => {
    try {
      return format(new Date(date + "T00:00:00"), "d MMMM yyyy", {
        locale: enUS,
      });
    } catch {
      return date;
    }
  })();

  return (
    <AppLayout title="Dashboard">
      {/* Date header */}
      <div className="flex items-center justify-between mb-5 gap-4">
        <h2 className="text-xl sm:text-2xl font-bold text-[#2C1810] capitalize">
          {dateDisplay}
        </h2>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 rounded-lg border border-[#D9CCAF] bg-[#FBF8F2] px-3 text-sm text-[#2C1810] focus:outline-none focus:ring-2 focus:ring-[#A05035] focus:border-transparent"
        />
      </div>

      {/* Summary grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <SummaryCard
          label="Total Sales"
          amount={totalSales}
          icon={TrendingUp}
          colorClass="text-[#737B4C]"
        />
        <SummaryCard
          label="Total Expenses"
          amount={totalExpense}
          icon={Receipt}
          colorClass="text-red-500"
        />
        <SummaryCard
          label="Total Purchases"
          amount={totalPurchase}
          icon={ShoppingCart}
          colorClass="text-amber-600"
        />
        <SummaryCard
          label="Net Profit"
          amount={netProfit}
          icon={ShoppingBag}
          colorClass="text-[#1B4332]"
          dark
          negative={netProfit < 0}
        />
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-[#B88D6A]">
          Loading...
        </div>
      ) : (
        <>
          {/* Sales + Expense side-by-side on desktop */}
          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            {/* Card Penjualan */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[#2C1810]">
                    Sales
                  </h3>
                  <span className="text-xs text-[#B88D6A]">
                    {sales.length} transactions
                  </span>
                </div>
              </CardHeader>
              <CardBody className="p-0">
                {Object.keys(salesByCategory).length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-[#B88D6A]">
                    No sales yet
                  </div>
                ) : (
                  <div className="divide-y divide-[#EDE4CF]">
                    {Object.entries(salesByCategory).map(
                      ([cat, { items, total: catTotal }]) => (
                        <div key={cat}>
                          <div className="flex justify-between items-center px-4 py-2 bg-[#F5EFE0]">
                            <span className="text-xs font-bold text-[#5C4535] uppercase tracking-wide">
                              {cat}
                            </span>
                            <span className="text-xs font-bold text-[#737B4C] tabular-nums">
                              {formatCurrency(catTotal)}
                            </span>
                          </div>
                          {items.map((item) => (
                            <div
                              key={item.name}
                              className="flex justify-between items-center px-4 py-2"
                            >
                              <span className="text-sm text-[#2C1810]">
                                {item.name}
                                <span className="text-xs text-[#B88D6A] ml-1">
                                  ×{item.qty}
                                </span>
                              </span>
                              <span className="text-sm font-semibold text-[#737B4C] tabular-nums">
                                {formatCurrency(item.total)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ),
                    )}
                    <div className="flex justify-between items-center px-4 py-2.5 bg-[#EDE4CF]">
                      <span className="text-xs font-semibold text-[#7C6352] uppercase tracking-wide">
                        Total
                      </span>
                      <span className="text-sm font-bold text-[#2C1810] tabular-nums">
                        {formatCurrency(totalSales)}
                      </span>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Card Pengeluaran */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-[#2C1810]">
                    Expenses
                  </h3>
                  <span className="text-xs text-[#B88D6A]">
                    {expenses.length} entries
                  </span>
                </div>
              </CardHeader>
              <CardBody className="p-0">
                {expenses.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-[#B88D6A]">
                    No expenses yet
                  </div>
                ) : (
                  <div className="divide-y divide-[#EDE4CF]">
                    {Object.entries(expByCategory).map(
                      ([cat, { items, total: catTotal }]) => (
                        <div key={cat}>
                          <div className="flex justify-between items-center px-4 py-2 bg-[#F5EFE0]">
                            <span className="text-xs font-bold text-[#5C4535] uppercase tracking-wide">
                              {cat}
                            </span>
                            <span className="text-xs font-bold text-red-600 tabular-nums">
                              {formatCurrency(catTotal)}
                            </span>
                          </div>
                          {items.map((exp) => (
                            <div
                              key={exp.id}
                              className="flex justify-between items-center px-4 py-2"
                            >
                              <span className="text-sm text-[#2C1810]">
                                {exp.name}
                                <span className="text-xs text-[#B88D6A] ml-1">
                                  ×{exp.qty}
                                </span>
                              </span>
                              <span className="text-sm tabular-nums text-[#5C4535]">
                                {formatCurrency(exp.total)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ),
                    )}
                    <div className="flex justify-between items-center px-4 py-2.5 bg-[#F5EFE0]">
                      <span className="text-xs font-semibold text-[#7C6352] uppercase tracking-wide">
                        Total
                      </span>
                      <span className="text-sm font-bold text-red-600 tabular-nums">
                        {formatCurrency(totalExpense)}
                      </span>
                    </div>
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          {/* Card Pembelian — full width */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[#2C1810]">
                  Purchases
                </h3>
                <span className="text-xs text-[#B88D6A]">
                  {purchases.length} entries
                </span>
              </div>
            </CardHeader>
            <CardBody className="p-0">
              {purchases.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-[#B88D6A]">
                  No purchases yet
                </div>
              ) : (
                <div className="divide-y divide-[#EDE4CF]">
                  {purchases.map((p) => (
                    <div
                      key={p.id}
                      className="flex justify-between items-center px-4 py-2.5"
                    >
                      <div>
                        <span className="text-sm font-medium text-[#2C1810]">
                          {(p.item as any)?.name ?? "—"}
                        </span>
                        <span className="block text-xs text-[#B88D6A]">
                          {p.quantity} {(p.item as any)?.unit} ×{" "}
                          {formatCurrency(p.price_per_unit)}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-amber-700 tabular-nums whitespace-nowrap">
                        {formatCurrency(p.total_price)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center px-4 py-2.5 bg-[#F5EFE0]">
                    <span className="text-xs font-semibold text-[#7C6352] uppercase tracking-wide">
                      Total
                    </span>
                    <span className="text-sm font-bold text-amber-700 tabular-nums">
                      {formatCurrency(totalPurchase)}
                    </span>
                  </div>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </AppLayout>
  );
}
