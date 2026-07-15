import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabaseAnonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

// Must be createBrowserClient (cookie-based), not the plain supabase-js client
// (localStorage-based): /api/auth/login and middleware.ts both authenticate via
// @supabase/ssr cookies. A localStorage-based client here never sees that
// session, so supabase.auth.getUser() always comes back empty on every client
// component (attendance, dashboard, etc.) even right after a successful login.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

export function createClient() {
  return supabase;
}

/**
 * Create a server-side Supabase client using the service_role key.
 * This client bypasses RLS and MUST only be used in server-side code.
 */
export function createServiceRoleClient() {
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRole) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY (server-only). Add it to your environment.");
  }

  return createSupabaseClient(supabaseUrl!, serviceRole, {
    // server-side usage; do not include auth helpers/cookies here
  });
}