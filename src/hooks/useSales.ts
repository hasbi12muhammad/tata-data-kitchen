"use client";

import { createClient } from "@/lib/supabase/client";
import { Sale, SaleCategory } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

export function useSales() {
  return useQuery<Sale[]>({
    queryKey: ["sales"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("sales")
        .select("*, recipe:recipes(name), category:sale_categories(id, name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaleCategories() {
  return useQuery<SaleCategory[]>({
    queryKey: ["sale-categories"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("sale_categories")
        .select("*")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateSaleCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("sale_categories")
        .insert({ name, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data as SaleCategory;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sale-categories"] });
      toast.success("Category added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** All sales (no limit) for reports — includes created_at for date filtering */
export function useReportSales() {
  return useQuery<Sale[]>({
    queryKey: ["report-sales"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("sales")
        .select("*, recipe:recipes(name), category:sale_categories(id, name)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("sales")
        .select("selling_price, hpp_at_sale, profit, quantity_sold");
      if (error) throw error;

      const rows = data ?? [];
      const total_revenue = rows.reduce(
        (s, r) => s + r.selling_price * r.quantity_sold,
        0,
      );
      const total_hpp = rows.reduce(
        (s, r) => s + r.hpp_at_sale * r.quantity_sold,
        0,
      );
      const total_profit = rows.reduce(
        (s, r) => s + r.profit * r.quantity_sold,
        0,
      );
      const profit_margin =
        total_revenue > 0 ? (total_profit / total_revenue) * 100 : 0;

      return {
        total_revenue,
        total_hpp,
        total_profit,
        profit_margin,
        sales_count: rows.length,
      };
    },
  });
}

export function useCreateSale() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (p: {
      recipe_id: string;
      quantity_sold: number;
      selling_price: number;
      hpp_at_sale: number;
      category_id?: string | null;
      date?: string;
      sub_recipe_deductions?: Array<{
        sub_recipe_id: string;
        quantity: number;
      }>;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const profit = p.selling_price - p.hpp_at_sale;
      const { date, sub_recipe_deductions, ...rest } = p;
      const { error } = await supabase.from("sales").insert({
        ...rest,
        profit,
        user_id: user!.id,
        ...(date ? { created_at: new Date(date).toISOString() } : {}),
      });
      if (error) throw error;

      if (sub_recipe_deductions?.length) {
        for (const d of sub_recipe_deductions) {
          const { error: deductError } = await supabase.rpc("deduct_sub_recipe_stock", {
            p_user_id: user!.id,
            p_recipe_id: d.sub_recipe_id,
            p_quantity: d.quantity,
          });
          if (deductError) throw deductError;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["recipes"] });
      toast.success("Sale recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      id: string;
      quantity_sold: number;
      selling_price: number;
      hpp_at_sale: number;
      category_id?: string | null;
      date?: string;
    }) => {
      const supabase = createClient();
      const profit = p.selling_price - p.hpp_at_sale;
      const { error } = await supabase
        .from("sales")
        .update({
          quantity_sold: p.quantity_sold,
          selling_price: p.selling_price,
          hpp_at_sale: p.hpp_at_sale,
          profit,
          category_id: p.category_id ?? null,
          ...(p.date ? { created_at: new Date(p.date).toISOString() } : {}),
        })
        .eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["report-sales"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Sale updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("sales").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["report-sales"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast.success("Sale deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
