import { getAuthenticatedUser } from "@/lib/supabase";
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
  const user = {
    id: supabaseUser.email || supabaseUser.id,
    displayName: supabaseUser.user_metadata?.display_name || supabaseUser.user_metadata?.username || supabaseUser.email?.split('@')[0] || 'User',
  };

  return <RpgNexusApp initialUser={user} />;
}
