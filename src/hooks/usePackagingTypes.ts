"use client";

import { createClient } from "@/lib/supabase/client";
import { PackagingType } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

export function usePackagingTypes() {
  return useQuery<PackagingType[]>({
    queryKey: ["packaging_types"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("packaging_types")
        .select("*")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreatePackagingType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("packaging_types")
        .insert({ name: name.trim(), user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["packaging_types"] });
      toast.success("Kemasan ditambahkan");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeletePackagingType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { count } = await supabase
        .from("purchases")
        .select("id", { count: "exact", head: true })
        .eq("pkg_type_id", id);
      if ((count ?? 0) > 0) {
        throw new Error(`Kemasan masih dipakai di ${count ?? 0} transaksi`);
      }
      const { error } = await supabase.from("packaging_types").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["packaging_types"] });
      toast.success("Kemasan dihapus");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
