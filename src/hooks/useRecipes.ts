"use client";

import { createClient } from "@/lib/supabase/client";
import { Recipe, RecipeItem } from "@/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

export function calcHPP(items: RecipeItem[], usePrev: boolean): number {
  // Max sub-recipe depth: 1 (query only fetches one level of sub_recipe data)
  return items.reduce((sum, ri) => {
    if (ri.sub_recipe_id && ri.sub_recipe) {
      const subItems = ri.sub_recipe.recipe_items ?? [];
      const subHPP = calcHPP(subItems, usePrev);
      return sum + subHPP * ri.quantity_used;
    }
    const item = ri.item;
    const price = usePrev
      ? (item?.prev_avg_price ?? item?.avg_price ?? 0)
      : (item?.avg_price ?? 0);
    return sum + price * ri.quantity_used;
  }, 0);
}

export function useRecipes() {
  return useQuery<Recipe[]>({
    queryKey: ["recipes"],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("recipes")
        .select(
          `*, recipe_items!recipe_id(
        *,
        item:items(name, unit, avg_price, prev_avg_price),
        sub_recipe:recipes!sub_recipe_id(
          id, name, unit, stock, avg_price, is_ingredient,
          recipe_items!recipe_id(
            quantity_used, item_id,
            item:items(name, unit, avg_price, prev_avg_price)
          )
        )
      )`
        )
        .order("name");
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        is_ingredient: r.is_ingredient ?? false,
        stock: r.stock ?? 0,
        avg_price: r.avg_price ?? 0,
        hpp: calcHPP(r.recipe_items ?? [], false),
        prev_hpp: calcHPP(r.recipe_items ?? [], true),
      }));
    },
  });
}

export function useCreateRecipe() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      name: string;
      is_ingredient?: boolean;
      unit?: Recipe["unit"] | null;
      items: Array<{
        item_id?: string | null;
        sub_recipe_id?: string | null;
        quantity_used: number;
      }>;
    }) => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      const { data: recipe, error: re } = await supabase
        .from("recipes")
        .insert({
          name: payload.name,
          user_id: user!.id,
          is_ingredient: payload.is_ingredient ?? false,
          unit: payload.unit ?? null,
        })
        .select()
        .single();
      if (re) throw re;

      const { error: rie } = await supabase.from("recipe_items").insert(
        payload.items.map((i) => ({
          recipe_id: recipe.id,
          item_id: i.item_id ?? null,
          sub_recipe_id: i.sub_recipe_id ?? null,
          quantity_used: i.quantity_used,
        }))
      );
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
      is_ingredient?: boolean;
      unit?: Recipe["unit"] | null;
      items: Array<{
        item_id?: string | null;
        sub_recipe_id?: string | null;
        quantity_used: number;
      }>;
    }) => {
      const supabase = createClient();
      const { error: re } = await supabase
        .from("recipes")
        .update({
          name: payload.name,
          is_ingredient: payload.is_ingredient ?? false,
          unit: payload.unit ?? null,
        })
        .eq("id", payload.id);
      if (re) throw re;

      const { error: de } = await supabase
        .from("recipe_items")
        .delete()
        .eq("recipe_id", payload.id);
      if (de) throw de;

      const { error: ie } = await supabase.from("recipe_items").insert(
        payload.items.map((i) => ({
          recipe_id: payload.id,
          item_id: i.item_id ?? null,
          sub_recipe_id: i.sub_recipe_id ?? null,
          quantity_used: i.quantity_used,
        }))
      );
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
