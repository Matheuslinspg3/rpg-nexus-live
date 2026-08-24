import { getAuthenticatedUser } from "./supabase-server";
import { createAdminClient } from "./supabase";
import { createClient } from "@supabase/supabase-js";

export type ApiUser = { id: string; email: string; displayName: string };

// Resolve the authenticated user from the session cookie.
// Returns null if not authenticated. Uses email as the canonical identity.
export async function requireUser(): Promise<ApiUser | null> {
  const user = await getAuthenticatedUser();
  if (!user || !user.email) return null;
  return {
    id: user.id,
    email: user.email,
    displayName: (user.user_metadata?.display_name as string) || user.email,
  };
}

export type Membership = { campaignId: string; role: "master" | "player" };

// Resolve a campaign membership by invite code + user email.
// Returns null if the campaign doesn't exist or the user isn't a member.
export async function getMembership(code: string, email: string): Promise<Membership | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, campaign_members!inner(role)")
    .eq("code", code.toUpperCase())
    .eq("campaign_members.email", email)
    .single();
  if (error || !data) return null;
  const role = (data.campaign_members as Array<{ role: "master" | "player" }>)[0]?.role;
  if (!role) return null;
  return { campaignId: data.id as string, role };
}

// Admin client accessor (bypasses RLS; app-level authz is enforced in code).
export function db() {
  return createAdminClient();
}
