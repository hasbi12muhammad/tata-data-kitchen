"use client";

export const dynamic = "force-dynamic";

import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { useReportSales } from "@/hooks/useSales";
import { useReportExpenses } from "@/hooks/useExpenses";
import { useRecipes } from "@/hooks/useRecipes";
import { cn, formatCurrency, formatNumber } from "@/lib/utils";
import * as XLSX from "xlsx";
import {
  BarChart3,
  DollarSign,
  Download,
  FileText,
  Receipt,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  addDays,
  differenceInDays,
  endOfDay,
  endOfMonth,
  format,
  isSameDay,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { useMemo, useState } from "react";

// ── Period ───────────────────────────────────────────────────
type Preset = "today" | "7d" | "30d" | "thisMonth" | "lastMonth" | "custom";

const PRESETS: { key: Preset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "7 Days" },
  { key: "30d", label: "30 Days" },
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "custom", label: "Custom" },
];

function getRange(preset: Preset, from: string, to: string): [Date, Date] {
  const now = new Date();
  switch (preset) {
    case "today":
      return [startOfDay(now), endOfDay(now)];
    case "7d":
      return [startOfDay(subDays(now, 6)), endOfDay(now)];
    case "30d":
      return [startOfDay(subDays(now, 29)), endOfDay(now)];
    case "thisMonth":
      return [startOfMonth(now), endOfDay(now)];
    case "lastMonth": {
      const lm = subMonths(now, 1);
      return [startOfMonth(lm), endOfMonth(lm)];
    }
    case "custom":
      return [
        from ? startOfDay(new Date(from)) : startOfDay(subDays(now, 6)),
        to ? endOfDay(new Date(to)) : endOfDay(now),
      ];
  }
}

// ── Tooltip ──────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const colorMap: Record<string, string> = {
    revenue: "#C0714F",
    grossProfit: "#8E9960",
    netProfit: "#3B7A57",
  };
  const labelMap: Record<string, string> = {
    revenue: "Revenue",
    grossProfit: "Gross Profit",
    netProfit: "Net Profit",
  };
  return (
    <div className="bg-[#2C1810] text-[#F5EFE0] rounded-lg px-3 py-2.5 text-xs shadow-xl border border-[#4A3728]">
      <p className="font-semibold text-[#D9CCAF] mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-sm inline-block flex-shrink-0"
            style={{ backgroundColor: colorMap[p.dataKey] ?? "#ccc" }}
          />
          <span className="text-[#E9DFC6]">
            {labelMap[p.dataKey] ?? p.dataKey}:{" "}
          </span>
          <span className="font-semibold">
            {formatCurrency(Number(p.value))}
          </span>
        </p>
      ))}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────
export default function ReportsPage() {
  const { data: allSales = [], isLoading: salesLoading } = useReportSales();
  const { data: allExpenses = [], isLoading: expLoading } = useReportExpenses();
  const { data: recipes } = useRecipes();

  const isLoading = salesLoading || expLoading;

  const [preset, setPreset] = useState<Preset>("7d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const [rangeFrom, rangeTo] = useMemo(
    () => getRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const filteredSales = useMemo(
    () =>
      allSales.filter((s) => {
        const d = new Date(s.created_at);
        return d >= rangeFrom && d <= rangeTo;
      }),
    [allSales, rangeFrom, rangeTo],
  );

  const filteredExpenses = useMemo(
    () =>
      allExpenses.filter((e) => {
        const d = new Date(e.created_at);
        return d >= rangeFrom && d <= rangeTo;
      }),
    [allExpenses, rangeFrom, rangeTo],
  );

  const stats = useMemo(() => {
    const total_revenue = filteredSales.reduce(
      (sum, s) => sum + s.selling_price * s.quantity_sold,
      0,
    );
    const total_hpp = filteredSales.reduce(
      (sum, s) => sum + s.hpp_at_sale * s.quantity_sold,
      0,
    );
    const gross_profit = total_revenue - total_hpp;
    const total_expenses = filteredExpenses.reduce(
      (sum, e) => sum + e.total,
      0,
    );
    const net_profit = gross_profit - total_expenses;
    return {
      total_revenue,
      total_hpp,
      gross_profit,
      total_expenses,
      net_profit,
      gross_margin:
        total_revenue > 0 ? (gross_profit / total_revenue) * 100 : 0,
      net_margin: total_revenue > 0 ? (net_profit / total_revenue) * 100 : 0,
      sales_count: filteredSales.length,
    };
  }, [filteredSales, filteredExpenses]);

  // Expense breakdown by category
  const expByCategory = useMemo(() => {
    const map: Record<string, { name: string; total: number }> = {};
    filteredExpenses.forEach((e) => {
      const key = e.category_id ?? "__none__";
      const name = e.category?.name ?? "Uncategorized";
      if (!map[key]) map[key] = { name, total: 0 };
      map[key].total += e.total;
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filteredExpenses]);

  // Daily (≤60 days) or weekly chart
  const chartData = useMemo(() => {
    const days = differenceInDays(rangeTo, rangeFrom) + 1;
    if (days <= 60) {
      return Array.from({ length: days }, (_, i) => {
        const day = startOfDay(addDays(rangeFrom, i));
        const ds = filteredSales.filter((s) =>
          isSameDay(new Date(s.created_at), day),
        );
        const de = filteredExpenses.filter((e) =>
          isSameDay(new Date(e.created_at), day),
        );
        const revenue = ds.reduce(
          (sum, s) => sum + s.selling_price * s.quantity_sold,
          0,
        );
        const hpp = ds.reduce(
          (sum, s) => sum + s.hpp_at_sale * s.quantity_sold,
          0,
        );
        const grossProfit = revenue - hpp;
        const expenses = de.reduce((sum, e) => sum + e.total, 0);
        return {
          label: format(day, "dd/MM"),
          revenue,
          grossProfit,
          netProfit: grossProfit - expenses,
        };
      });
    }
    // Weekly aggregation
    const weeks: Record<
      string,
      { label: string; revenue: number; grossProfit: number; netProfit: number }
    > = {};
    filteredSales.forEach((s) => {
      const d = new Date(s.created_at);
      const mon = startOfDay(subDays(d, (d.getDay() + 6) % 7));
      const key = format(mon, "yyyy-MM-dd");
      if (!weeks[key])
        weeks[key] = {
          label: format(mon, "dd/MM"),
          revenue: 0,
          grossProfit: 0,
          netProfit: 0,
        };
      weeks[key].revenue += s.selling_price * s.quantity_sold;
      const gp =
        s.selling_price * s.quantity_sold - s.hpp_at_sale * s.quantity_sold;
      weeks[key].grossProfit += gp;
      weeks[key].netProfit += gp;
    });
    filteredExpenses.forEach((e) => {
      const d = new Date(e.created_at);
      const mon = startOfDay(subDays(d, (d.getDay() + 6) % 7));
      const key = format(mon, "yyyy-MM-dd");
      if (weeks[key]) weeks[key].netProfit -= e.total;
    });
    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [filteredSales, filteredExpenses, rangeFrom, rangeTo]);

  const recipeProfit = useMemo(
    () =>
      (recipes ?? [])
        .map((r) => {
          const rs = filteredSales.filter((s) => s.recipe_id === r.id);
          return {
            id: r.id,
            name: r.name,
            hpp: r.hpp,
            revenue: rs.reduce(
              (sum, s) => sum + s.selling_price * s.quantity_sold,
              0,
            ),
            profit: rs.reduce((sum, s) => sum + s.profit * s.quantity_sold, 0),
          };
        })
        .filter((r) => r.revenue > 0)
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 5),
    [filteredSales, recipes],
  );

  const chartTitle = useMemo(() => {
    const map: Record<Preset, string> = {
      today: `Revenue & Profit — ${format(rangeFrom, "dd MMM yyyy")}`,
      "7d": "Revenue & Profit — Last 7 Days",
      "30d": "Revenue & Profit — Last 30 Days",
      thisMonth: `Revenue & Profit — ${format(rangeFrom, "MMMM yyyy")}`,
      lastMonth: `Revenue & Profit — ${format(rangeFrom, "MMMM yyyy")}`,
      custom: `Revenue & Profit — ${format(rangeFrom, "dd MMM")} – ${format(rangeTo, "dd MMM yyyy")}`,
    };
    return map[preset];
  }, [preset, rangeFrom, rangeTo]);

  function downloadXLSX() {
    const USD = '"$"* #,##0';
    const isWeekly = differenceInDays(rangeTo, rangeFrom) > 60;
    const filename = `report_${format(rangeFrom, "yyyyMMdd")}_${format(rangeTo, "yyyyMMdd")}.xlsx`;
    const wb = XLSX.utils.book_new();

    // ── Sheet 1: P&L Summary ──
    const summaryRows: (string | number)[][] = [
      ["TATA DATA KITCHEN REPORT"],
      [
        `Period: ${format(rangeFrom, "dd MMM yyyy")} - ${format(rangeTo, "dd MMM yyyy")}`,
      ],
      [`Downloaded: ${format(new Date(), "dd MMM yyyy HH:mm")}`],
      [],
      ["Metric", "Value"],
      ["Total Revenue", stats.total_revenue],
      ["Total COGS (Ingredient Cost)", stats.total_hpp],
      ["Gross Profit", stats.gross_profit],
      ["Gross Margin (%)", stats.gross_margin],
      ["Total Expenses", stats.total_expenses],
      ["Net Profit", stats.net_profit],
      ["Net Margin (%)", stats.net_margin],
      ["Transaction Count", stats.sales_count],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
    // Currency format: rows 5,6,7,9,10 (0-indexed), col 1
    [5, 6, 7, 9, 10].forEach((r) => {
      const ref = XLSX.utils.encode_cell({ r, c: 1 });
      if (ws1[ref]) ws1[ref].z = USD;
    });
    // Percent format: rows 8, 11
    [8, 11].forEach((r) => {
      const ref = XLSX.utils.encode_cell({ r, c: 1 });
      if (ws1[ref]) ws1[ref].z = '0.0"%"';
    });
    ws1["!cols"] = [{ wch: 25 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws1, "P&L Summary");

    // ── Sheet 2: Daily/Weekly Breakdown ──
    const periodRows: (string | number)[][] = [
      ["Period", "Revenue", "Gross Profit", "Net Profit"],
      ...chartData.map((d) => [d.label, d.revenue, d.grossProfit, d.netProfit]),
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(periodRows);
    chartData.forEach((_, i) => {
      [1, 2, 3].forEach((c) => {
        const ref = XLSX.utils.encode_cell({ r: i + 1, c });
        if (ws2[ref]) ws2[ref].z = USD;
      });
    });
    ws2["!cols"] = [{ wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(
      wb,
      ws2,
      `${isWeekly ? "Weekly" : "Daily"} Breakdown`,
    );

    // ── Sheet 3: Top Products ──
    const productRows: (string | number)[][] = [
      ["Product", "COGS", "Revenue", "Gross Profit"],
      ...recipeProfit.map((r) => [r.name, r.hpp, r.revenue, r.profit]),
    ];
    const ws3 = XLSX.utils.aoa_to_sheet(productRows);
    recipeProfit.forEach((_, i) => {
      [1, 2, 3].forEach((c) => {
        const ref = XLSX.utils.encode_cell({ r: i + 1, c });
        if (ws3[ref]) ws3[ref].z = USD;
      });
    });
    ws3["!cols"] = [{ wch: 25 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws3, "Top Products");

    // ── Sheet 4: Expenses ──
    const expRows: (string | number)[][] = [
      ["Category", "Total"],
      ...expByCategory.map((c) => [c.name, c.total]),
    ];
    const ws4 = XLSX.utils.aoa_to_sheet(expRows);
    expByCategory.forEach((_, i) => {
      const ref = XLSX.utils.encode_cell({ r: i + 1, c: 1 });
      if (ws4[ref]) ws4[ref].z = USD;
    });
    ws4["!cols"] = [{ wch: 25 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws4, "Expenses");

    XLSX.writeFile(wb, filename);
  }

  function downloadPDF() {
    const isWeekly = differenceInDays(rangeTo, rangeFrom) > 60;
    const periodLabel = `${format(rangeFrom, "dd MMM yyyy")} – ${format(rangeTo, "dd MMM yyyy")}`;
    const printedAt = format(new Date(), "dd MMM yyyy, HH:mm");

    const fmt = (n: number) =>
      "$" +
      Math.round(n)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ",");

    const pct = (n: number) => n.toFixed(1) + "%";

    const kpiCards = [
      {
        label: "Total Revenue",
        value: fmt(stats.total_revenue),
        sub: `${stats.sales_count} transactions`,
      },
      {
        label: "Gross Profit",
        value: fmt(stats.gross_profit),
        sub: `Margin ${pct(stats.gross_margin)}`,
      },
      {
        label: "Total Expenses",
        value: fmt(stats.total_expenses),
        sub: `${filteredExpenses.length} entries`,
      },
      {
        label: "Net Profit",
        value: fmt(stats.net_profit),
        sub: `Margin ${pct(stats.net_margin)}`,
        highlight: true,
      },
    ];

    const kpiHtml = kpiCards
      .map(
        (k) => `
        <div style="border:1px solid #e0d8c8;border-radius:8px;padding:14px 16px;min-width:0;">
          <div style="font-size:9px;color:#7c6352;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;">${k.label}</div>
          <div style="font-size:15px;font-weight:700;color:${k.highlight ? (stats.net_profit >= 0 ? "#1b4332" : "#c0392b") : "#2c1810"};">${k.value}</div>
          <div style="font-size:9px;color:#b88d6a;margin-top:3px;">${k.sub}</div>
        </div>`,
      )
      .join("");

    const plRows = [
      {
        label: "Revenue",
        value: fmt(stats.total_revenue),
        style: "font-weight:600;",
      },
      {
        label: "− COGS (Ingredient Cost)",
        value: `(${fmt(stats.total_hpp)})`,
        style: "color:#b88d6a;",
      },
      {
        label: `Gross Profit (${pct(stats.gross_margin)})`,
        value: fmt(stats.gross_profit),
        style: "font-weight:700;background:#f0f4e8;border-radius:4px;",
      },
      ...expByCategory.map((c) => ({
        label: `  · ${c.name}`,
        value: fmt(c.total),
        style: "color:#7c6352;font-size:10px;",
      })),
      ...(expByCategory.length > 0
        ? [
            {
              label: "− Total Operating Costs",
              value: `(${fmt(stats.total_expenses)})`,
              style: "color:#7c6352;font-weight:600;",
            },
          ]
        : []),
      {
        label: `Net Profit (${pct(stats.net_margin)})`,
        value: fmt(stats.net_profit),
        style: `font-weight:700;background:${stats.net_profit >= 0 ? "#e8f5ee" : "#fdecea"};border-radius:4px;color:${stats.net_profit >= 0 ? "#1b4332" : "#c0392b"};`,
      },
    ];

    const plHtml = plRows
      .map(
        (r) => `
        <tr>
          <td style="padding:6px 10px;font-size:11px;${r.style}">${r.label}</td>
          <td style="padding:6px 10px;font-size:11px;text-align:right;${r.style}">${r.value}</td>
        </tr>`,
      )
      .join("");

    const topProdukHtml = recipeProfit
      .map(
        (r, i) => `
        <tr style="${i % 2 === 1 ? "background:#faf7f2;" : ""}">
          <td style="padding:6px 10px;font-size:11px;">${i + 1}. ${r.name}</td>
          <td style="padding:6px 10px;font-size:11px;text-align:right;color:#7c6352;">${fmt(r.hpp)}</td>
          <td style="padding:6px 10px;font-size:11px;text-align:right;">${fmt(r.revenue)}</td>
          <td style="padding:6px 10px;font-size:11px;text-align:right;font-weight:600;color:${r.profit >= 0 ? "#5c6b38" : "#c0392b"};">${fmt(r.profit)}</td>
        </tr>`,
      )
      .join("");

    const expCatHtml = expByCategory
      .map(
        (c, i) => `
        <tr style="${i % 2 === 1 ? "background:#faf7f2;" : ""}">
          <td style="padding:6px 10px;font-size:11px;">${c.name}</td>
          <td style="padding:6px 10px;font-size:11px;text-align:right;color:#7c6352;">${fmt(c.total)}</td>
        </tr>`,
      )
      .join("");

    const rincianRows = isWeekly ? chartData.slice(0, 52) : chartData;
    const rincianHtml = rincianRows
      .map(
        (d, i) => `
        <tr style="${i % 2 === 1 ? "background:#faf7f2;" : ""}">
          <td style="padding:5px 10px;font-size:10px;">${d.label}</td>
          <td style="padding:5px 10px;font-size:10px;text-align:right;">${fmt(d.revenue)}</td>
          <td style="padding:5px 10px;font-size:10px;text-align:right;color:#5c6b38;">${fmt(d.grossProfit)}</td>
          <td style="padding:5px 10px;font-size:10px;text-align:right;font-weight:600;color:${stats.net_profit >= 0 ? "#1b4332" : "#c0392b"};">${fmt(d.netProfit)}</td>
        </tr>`,
      )
      .join("");

    const th = (label: string, align = "left") =>
      `<th style="padding:7px 10px;font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#7c6352;text-align:${align};border-bottom:2px solid #e0d8c8;font-weight:600;">${label}</th>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>My Kitchen Book Report — ${periodLabel}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#2c1810;background:#fff;font-size:12px;}
  @page{margin:18mm 16mm;}
  @media print{
    .no-print{display:none!important;}
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  }
  .page{max-width:800px;margin:0 auto;padding:24px;}
  table{width:100%;border-collapse:collapse;}
  .section{margin-bottom:28px;}
  .section-title{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#7c6352;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #e0d8c8;}
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:18px;border-bottom:2px solid #2c1810;">
    <div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;">
        <img src="data:image/png;base64,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" style="width:36px;height:36px;border-radius:10px;object-fit:cover;display:block;" />
        <div>
          <div style="font-size:16px;font-weight:800;color:#2c1810;letter-spacing:-.02em;">My Kitchen Book</div>
          <div style="font-size:9px;color:#b88d6a;letter-spacing:.04em;text-transform:uppercase;">Financial Report</div>
        </div>
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:12px;font-weight:700;color:#2c1810;">${periodLabel}</div>
      <div style="font-size:9px;color:#b88d6a;margin-top:3px;">Printed: ${printedAt}</div>
    </div>
  </div>

  <!-- KPI -->
  <div class="section">
    <div class="section-title">Summary</div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
      ${kpiHtml}
    </div>
  </div>

  <!-- P&L -->
  <div class="section">
    <div class="section-title">P&amp;L Breakdown</div>
    <table>
      <tbody>${plHtml}</tbody>
    </table>
  </div>

  <!-- Top Produk -->
  ${
    recipeProfit.length > 0
      ? `
  <div class="section">
    <div class="section-title">Top Products by Profit</div>
    <table>
      <thead><tr>${th("Product")}${th("COGS", "right")}${th("Revenue", "right")}${th("Gross Profit", "right")}</tr></thead>
      <tbody>${topProdukHtml}</tbody>
    </table>
  </div>`
      : ""
  }

  <!-- Pengeluaran per Kategori -->
  ${
    expByCategory.length > 0
      ? `
  <div class="section">
    <div class="section-title">Expenses by Category</div>
    <table>
      <thead><tr>${th("Category")}${th("Total", "right")}</tr></thead>
      <tbody>${expCatHtml}</tbody>
      <tfoot><tr>
        <td style="padding:7px 10px;font-size:11px;font-weight:700;border-top:2px solid #e0d8c8;">Total</td>
        <td style="padding:7px 10px;font-size:11px;font-weight:700;text-align:right;border-top:2px solid #e0d8c8;">${fmt(stats.total_expenses)}</td>
      </tr></tfoot>
    </table>
  </div>`
      : ""
  }

  <!-- Rincian Harian/Mingguan -->
  <div class="section">
    <div class="section-title">${isWeekly ? "Weekly" : "Daily"} Breakdown</div>
    <table>
      <thead><tr>${th(isWeekly ? "Week" : "Date")}${th("Revenue", "right")}${th("Gross Profit", "right")}${th("Net Profit", "right")}</tr></thead>
      <tbody>${rincianHtml}</tbody>
    </table>
  </div>

  <!-- Footer -->
  <div style="margin-top:32px;padding-top:12px;border-top:1px solid #e0d8c8;display:flex;justify-content:space-between;align-items:center;">
    <span style="font-size:9px;color:#b88d6a;">My Kitchen Book — Kitchen Management System</span>
    <span style="font-size:9px;color:#b88d6a;">${periodLabel}</span>
  </div>

</div>
<script>window.onload=()=>{window.print();}</script>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
  }

  const barSize = chartData.length > 20 ? 5 : 12;
  const tickInterval =
    chartData.length > 20 ? Math.floor(chartData.length / 10) : 0;

  return (
    <AppLayout title="Reports">
      <div className="space-y-4 sm:space-y-6">
        {/* ── Filter + download ── */}
        <Card>
          <CardBody className="py-3 px-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-[#7C6352] font-medium">
                Period:
              </span>
              {PRESETS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setPreset(key)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    preset === key
                      ? "bg-[#A05035] text-white"
                      : "bg-[#EDE4CF] text-[#7C6352] hover:bg-[#D9CCAF]",
                  )}
                >
                  {label}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={downloadPDF}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#A05035] text-white hover:bg-[#8B4530] transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Download </span>PDF
                </button>
                <button
                  onClick={downloadXLSX}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#737B4C] text-white hover:bg-[#5C6B38] transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Download </span>Excel
                </button>
              </div>
            </div>

            {preset === "custom" && (
              <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-[#E5DACA]">
                <span className="text-xs text-[#7C6352]">From</span>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-8 rounded-lg border border-[#D9CCAF] bg-[#FBF8F2] px-2 text-xs text-[#2C1810] focus:outline-none focus:ring-2 focus:ring-[#A05035]"
                />
                <span className="text-xs text-[#7C6352]">to</span>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-8 rounded-lg border border-[#D9CCAF] bg-[#FBF8F2] px-2 text-xs text-[#2C1810] focus:outline-none focus:ring-2 focus:ring-[#A05035]"
                />
                {customFrom && customTo && (
                  <span className="text-xs text-[#B88D6A]">
                    {differenceInDays(
                      new Date(customTo),
                      new Date(customFrom),
                    ) + 1}{" "}
                    days
                  </span>
                )}
              </div>
            )}
          </CardBody>
        </Card>

        {/* ── KPI ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            label="Total Revenue"
            value={formatCurrency(stats.total_revenue)}
            icon={DollarSign}
            accent="dune"
            sub={`${stats.sales_count} transactions`}
          />
          <StatCard
            label="Gross Profit"
            value={formatCurrency(stats.gross_profit)}
            icon={TrendingUp}
            accent="verde"
            sub={`Margin ${formatNumber(stats.gross_margin, 1)}%`}
          />
          <StatCard
            label="Total Expenses"
            value={formatCurrency(stats.total_expenses)}
            icon={Receipt}
            accent="clay"
            sub={`${filteredExpenses.length} entries`}
          />
          <StatCard
            label="Net Profit"
            value={formatCurrency(stats.net_profit)}
            icon={stats.net_profit >= 0 ? TrendingUp : TrendingDown}
            accent={stats.net_profit >= 0 ? "verde" : "clay"}
            sub={`Margin ${formatNumber(stats.net_margin, 1)}%`}
          />
        </div>

        {/* ── P&L Breakdown ── */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-[#2C1810]">
              P&amp;L Breakdown
            </h2>
          </CardHeader>
          <CardBody className="px-4 sm:px-6 py-4 space-y-1">
            {/* Revenue */}
            <div className="flex justify-between items-baseline py-1.5">
              <span className="text-sm font-semibold text-[#2C1810]">
                Revenue
              </span>
              <span className="text-sm font-bold text-[#2C1810] tabular-nums">
                {formatCurrency(stats.total_revenue)}
              </span>
            </div>
            {/* HPP */}
            <div className="flex justify-between items-baseline py-1 pb-3">
              <span className="text-xs text-[#B88D6A]">
                − COGS (Ingredient Cost)
              </span>
              <span className="text-xs text-[#B88D6A] tabular-nums">
                ({formatCurrency(stats.total_hpp)})
              </span>
            </div>
            {/* Gross Profit pill */}
            <div className="flex justify-between items-baseline rounded-xl bg-[#737B4C]/10 px-4 py-3">
              <span className="text-sm font-bold text-[#5C6B38]">
                Gross Profit
                <span className="ml-2 text-xs font-normal text-[#737B4C]/70">
                  {formatNumber(stats.gross_margin, 1)}%
                </span>
              </span>
              <span className="text-sm font-bold text-[#5C6B38] tabular-nums">
                {formatCurrency(stats.gross_profit)}
              </span>
            </div>
            {/* Expenses breakdown */}
            {expByCategory.length > 0 && (
              <div className="pt-3 pb-1 space-y-1">
                <div className="flex justify-between items-baseline pb-1">
                  <span className="text-xs font-medium text-[#7C6352] uppercase tracking-wide">
                    − Operating Costs
                  </span>
                  <span className="text-xs font-medium text-[#7C6352] tabular-nums">
                    ({formatCurrency(stats.total_expenses)})
                  </span>
                </div>
                {expByCategory.map((cat) => (
                  <div
                    key={cat.name}
                    className="flex justify-between items-baseline pl-3"
                  >
                    <span className="text-xs text-[#B88D6A]">· {cat.name}</span>
                    <span className="text-xs text-[#B88D6A] tabular-nums">
                      {formatCurrency(cat.total)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {/* Net Profit pill */}
            <div
              className={`flex justify-between items-baseline rounded-xl px-4 py-3 mt-2 ${
                stats.net_profit >= 0 ? "bg-[#1B4332]" : "bg-red-700"
              }`}
            >
              <span className="text-sm font-bold text-white">
                Net Profit
                <span className="ml-2 text-xs font-normal text-white/60">
                  {formatNumber(stats.net_margin, 1)}%
                </span>
              </span>
              <span className="text-sm font-bold text-white tabular-nums">
                {formatCurrency(stats.net_profit)}
              </span>
            </div>
          </CardBody>
        </Card>

        {/* ── Chart ── */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-[#2C1810]">
              {chartTitle}
            </h2>
          </CardHeader>
          <CardBody>
            {isLoading ? (
              <div className="h-[220px] flex items-center justify-center text-sm text-[#B88D6A]">
                Loading...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={chartData}
                  margin={{ top: 4, right: 4, left: -8, bottom: 0 }}
                  barGap={2}
                  barSize={barSize}
                >
                  <defs>
                    <linearGradient
                      id="gradRevenue"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop offset="0%" stopColor="#A05035" stopOpacity={1} />
                      <stop
                        offset="100%"
                        stopColor="#C0714F"
                        stopOpacity={0.75}
                      />
                    </linearGradient>
                    <linearGradient id="gradGross" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#737B4C" stopOpacity={1} />
                      <stop
                        offset="100%"
                        stopColor="#8E9960"
                        stopOpacity={0.75}
                      />
                    </linearGradient>
                    <linearGradient id="gradNet" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#1B4332" stopOpacity={1} />
                      <stop
                        offset="100%"
                        stopColor="#3B7A57"
                        stopOpacity={0.75}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#E5DACA"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#B88D6A" }}
                    axisLine={false}
                    tickLine={false}
                    interval={tickInterval}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#B88D6A" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) =>
                      v >= 1_000_000
                        ? `$${(v / 1_000_000).toFixed(0)}M`
                        : `$${(v / 1000).toFixed(0)}K`
                    }
                    width={36}
                  />
                  <Tooltip
                    content={<CustomTooltip />}
                    cursor={{ fill: "#E9DFC6", opacity: 0.5 }}
                  />
                  <Bar
                    dataKey="revenue"
                    fill="url(#gradRevenue)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="grossProfit"
                    fill="url(#gradGross)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="netProfit"
                    fill="url(#gradNet)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
            <div className="flex items-center gap-5 mt-3 justify-center flex-wrap">
              <span className="flex items-center gap-1.5 text-xs text-[#7C6352]">
                <span className="w-3 h-3 rounded-sm bg-[#A05035] inline-block" />
                Revenue
              </span>
              <span className="flex items-center gap-1.5 text-xs text-[#7C6352]">
                <span className="w-3 h-3 rounded-sm bg-[#737B4C] inline-block" />
                Gross Profit
              </span>
              <span className="flex items-center gap-1.5 text-xs text-[#7C6352]">
                <span className="w-3 h-3 rounded-sm bg-[#1B4332] inline-block" />
                Net Profit
              </span>
            </div>
          </CardBody>
        </Card>

        {/* ── Top Products ── */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-[#2C1810]">
              Top Products by Profit
            </h2>
          </CardHeader>
          <CardBody className="p-0">
            {recipeProfit.length === 0 ? (
              <div className="py-10 text-center text-sm text-[#B88D6A]">
                No data for this period
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#E5DACA]">
                      <th className="text-left px-4 sm:px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide">
                        Product
                      </th>
                      <th className="text-right px-3 sm:px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide">
                        COGS
                      </th>
                      <th className="text-right px-3 sm:px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide">
                        Revenue
                      </th>
                      <th className="text-right px-4 sm:px-6 py-3 text-xs font-medium text-[#7C6352] uppercase tracking-wide">
                        Gross Profit
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipeProfit.map((r, i) => (
                      <tr
                        key={r.id}
                        className="border-b border-[#EDE4CF] last:border-0 hover:bg-[#F5EFE0] transition-colors"
                      >
                        <td className="px-4 sm:px-6 py-3">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[#E9DFC6] text-[#7C563D] text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                              {i + 1}
                            </span>
                            <span className="font-medium text-[#2C1810] text-xs sm:text-sm">
                              {r.name}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 sm:px-6 py-3 text-right tabular-nums text-[#7C6352] text-xs sm:text-sm whitespace-nowrap">
                          {formatCurrency(r.hpp)}
                        </td>
                        <td className="px-3 sm:px-6 py-3 text-right tabular-nums text-[#4A3728] text-xs sm:text-sm whitespace-nowrap">
                          {formatCurrency(r.revenue)}
                        </td>
                        <td
                          className={`px-4 sm:px-6 py-3 text-right tabular-nums font-semibold text-xs sm:text-sm whitespace-nowrap ${
                            r.profit >= 0 ? "text-[#737B4C]" : "text-[#C0392B]"
                          }`}
                        >
                          {formatCurrency(r.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </AppLayout>
  );
}
