"use client";

import { createClient } from "@/lib/supabase/client";
import { Expense, ExpenseCategory } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

export function useExpenses() {
  return useQuery<Expense[]>({
    queryKey: ["expenses"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("expenses")
        .select("*, category:expense_categories(id, name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useExpensesByDate(date: string) {
  return useQuery<Expense[]>({
    queryKey: ["expenses", "date", date],
    queryFn: async () => {
      const supabase = createClient();
      const next = new Date(date);
      next.setDate(next.getDate() + 1);
      const nextDate = next.toISOString().split("T")[0];
      const { data, error } = await supabase
        .from("expenses")
        .select("*, category:expense_categories(id, name)")
        .gte("created_at", date)
        .lt("created_at", nextDate)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!date,
  });
}

export function useExpenseCategories() {
  return useQuery<ExpenseCategory[]>({
    queryKey: ["expense-categories"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("expense_categories")
        .select("*")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useReportExpenses() {
  return useQuery<Expense[]>({
    queryKey: ["report-expenses"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("expenses")
        .select("*, category:expense_categories(id, name)")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      name: string;
      qty: number;
      price: number;
      total: number;
      category_id: string | null;
      note: string | null;
      created_at: string;
    }) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("expenses")
        .insert({ ...p, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      id: string;
      name: string;
      qty: number;
      price: number;
      total: number;
      category_id: string | null;
      note: string | null;
      created_at: string;
    }) => {
      const { id, ...rest } = p;
      const supabase = createClient();
      const { error } = await supabase
        .from("expenses")
        .update(rest)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      toast.success("Expense deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCreateExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("expense_categories")
        .insert({ name, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data as ExpenseCategory;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["expense-categories"] });
      toast.success("Category added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
