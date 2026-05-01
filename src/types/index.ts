export interface Item {
  id: string;
  user_id: string;
  name: string;
  unit: "gr" | "ml" | "pcs" | "kg" | "liter";
  avg_price: number;
  prev_avg_price: number;
  stock: number;
  created_at: string;
}

export interface Purchase {
  id: string;
  user_id: string;
  item_id: string;
  quantity: number;
  total_price: number;
  price_per_unit: number;
  created_at: string;
  item?: Item;
}

export interface Recipe {
  id: string;
  user_id: string;
  name: string;
  hpp: number;
  prev_hpp: number;
  created_at: string;
  recipe_items?: RecipeItem[];
}

export interface RecipeItem {
  id: string;
  recipe_id: string;
  item_id: string;
  quantity_used: number;
  item?: Item;
}

export interface SaleCategory {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface Sale {
  id: string;
  user_id: string;
  recipe_id: string;
  category_id: string | null;
  quantity_sold: number;
  selling_price: number;
  hpp_at_sale: number;
  profit: number;
  created_at: string;
  recipe?: Recipe;
  category?: SaleCategory;
}

export interface ExpenseCategory {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
}

export interface Expense {
  id: string;
  user_id: string;
  category_id: string | null;
  name: string;
  qty: number;
  price: number;
  total: number;
  note: string | null;
  created_at: string;
  category?: ExpenseCategory;
}

export interface DashboardStats {
  total_revenue: number;
  total_hpp: number;
  total_profit: number;
  profit_margin: number;
  sales_count: number;
}
