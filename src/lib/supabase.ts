import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseServiceRoleKey, supabaseUrl } from "@/lib/env";

export function createAdminClient(): SupabaseClient {
  return createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
