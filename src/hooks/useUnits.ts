"use client";

import { createClient } from "@/lib/supabase/client";
import { CustomUnit } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

export function useCustomUnits() {
  return useQuery<CustomUnit[]>({
    queryKey: ["custom_units"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("custom_units")
        .select("*")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateCustomUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("custom_units")
        .insert({ name: name.trim().toLowerCase(), user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom_units"] });
      toast.success("Satuan ditambahkan");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteCustomUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const supabase = createClient();
      const { count: itemCount } = await supabase
        .from("items")
        .select("id", { count: "exact", head: true })
        .eq("unit", name);
      const { count: recipeCount } = await supabase
        .from("recipes")
        .select("id", { count: "exact", head: true })
        .eq("unit", name);
      const total = (itemCount ?? 0) + (recipeCount ?? 0);
      if (total > 0) {
        throw new Error(`Satuan masih dipakai oleh ${total} item/resep`);
      }
      const { error } = await supabase.from("custom_units").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom_units"] });
      toast.success("Satuan dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
