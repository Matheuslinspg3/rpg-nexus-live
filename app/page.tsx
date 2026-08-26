import { getAuthenticatedUser } from "@/lib/supabase-server";
import RpgNexusApp from "./RpgNexusApp";
import { AuthForm } from "./components/AuthForm";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabaseUser = await getAuthenticatedUser();
  
  // If not authenticated, show login form
  if (!supabaseUser) {
    return <AuthForm />;
  }

  // Convert Supabase user to app user format
  const email = supabaseUser.email || supabaseUser.id;
  const discordIdentity = supabaseUser.identities?.find((identity) => identity.provider === "discord");
  const discordData = discordIdentity?.identity_data as Record<string, unknown> | undefined;
  const discordName = typeof discordData?.global_name === "string"
    ? discordData.global_name
    : typeof discordData?.username === "string"
      ? discordData.username
      : null;

  const user = {
    id: email,
    displayName: supabaseUser.user_metadata?.display_name || supabaseUser.user_metadata?.username || email.split('@')[0] || 'User',
    username: supabaseUser.user_metadata?.username || email.split('@')[0] || 'user',
    discordName,
  };

  return <RpgNexusApp initialUser={user} />;
}
