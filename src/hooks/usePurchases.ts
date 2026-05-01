"use client";

import { createClient } from "@/lib/supabase/client";
import { Purchase } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

export function usePurchases() {
  return useQuery<Purchase[]>({
    queryKey: ["purchases"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("purchases")
        .select("*, item:items(name, unit)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpdatePurchase() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (p: {
      id: string;
      quantity: number;
      total_price: number;
    }) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.rpc("update_purchase", {
        p_purchase_id: p.id,
        p_user_id: user!.id,
        p_quantity: p.quantity,
        p_total_price: p.total_price,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["recipes"] });
      toast.success("Purchase updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCreatePurchase() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (p: {
      item_id: string;
      quantity: number;
      total_price: number;
      date?: string;
    }) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const price_per_unit = p.total_price / p.quantity;

      const { error } = await supabase.rpc("record_purchase", {
        p_user_id: user!.id,
        p_item_id: p.item_id,
        p_quantity: p.quantity,
        p_total_price: p.total_price,
        p_price_per_unit: price_per_unit,
        ...(p.date ? { p_created_at: new Date(p.date).toISOString() } : {}),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["recipes"] });
      toast.success("Purchase recorded");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeletePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { error } = await supabase.rpc("delete_purchase", {
        p_purchase_id: id,
        p_user_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["recipes"] });
      toast.success("Purchase deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
