"use client";

import { createClient } from "@/lib/supabase/client";
import { Recipe, RecipeItem } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

export function useRecipes() {
  return useQuery<Recipe[]>({
    queryKey: ["recipes"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("recipes")
        .select(
          "*, recipe_items(*, item:items(name, unit, avg_price, prev_avg_price))",
        )
        .order("name");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        hpp: calcHPP(r.recipe_items ?? [], false),
        prev_hpp: calcHPP(r.recipe_items ?? [], true),
      }));
    },
  });
}

function calcHPP(items: RecipeItem[], usePrev: boolean): number {
  return items.reduce((sum, ri) => {
    const item = ri.item as any;
    const price = usePrev
      ? (item?.prev_avg_price || item?.avg_price || 0)
      : (item?.avg_price ?? 0);
    return sum + price * ri.quantity_used;
  }, 0);
}

export function useCreateRecipe() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      name: string;
      items: Array<{ item_id: string; quantity_used: number }>;
    }) => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: recipe, error: re } = await supabase
        .from("recipes")
        .insert({ name: payload.name, user_id: user!.id })
        .select()
        .single();
      if (re) throw re;

      const { error: rie } = await supabase
        .from("recipe_items")
        .insert(payload.items.map((i) => ({ ...i, recipe_id: recipe.id })));
      if (rie) throw rie;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      toast.success("Recipe created");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateRecipe() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      id: string;
      name: string;
      items: Array<{ item_id: string; quantity_used: number }>;
    }) => {
      const supabase = createClient();
      const { error: re } = await supabase
        .from("recipes")
        .update({ name: payload.name })
        .eq("id", payload.id);
      if (re) throw re;

      const { error: de } = await supabase
        .from("recipe_items")
        .delete()
        .eq("recipe_id", payload.id);
      if (de) throw de;

      const { error: ie } = await supabase
        .from("recipe_items")
        .insert(payload.items.map((i) => ({ ...i, recipe_id: payload.id })));
      if (ie) throw ie;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      toast.success("Recipe updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteRecipe() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient();
      const { error } = await supabase.from("recipes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recipes"] });
      toast.success("Recipe deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
