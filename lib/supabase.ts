import { createClient } from "@supabase/supabase-js";

export function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase environment variables are not configured.");
  return createClient(url, key);
}

export async function requireManager(supabase: ReturnType<typeof db>, employeeId: string) {
  if (!employeeId) throw new Error("Select Svetlana de Monte Carlo to perform a manager action.");
  const { data, error } = await supabase.from("employees").select("id,name,role").eq("id", employeeId).single();
  if (error || !data || data.role !== "manager") throw new Error("Only Svetlana de Monte Carlo can perform this action.");
  return data;
}
