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
  const user = {
    id: email,
    displayName: supabaseUser.user_metadata?.display_name || supabaseUser.user_metadata?.username || email.split('@')[0] || 'User',
    username: supabaseUser.user_metadata?.username || email.split('@')[0] || 'user',
  };

  return <RpgNexusApp initialUser={user} />;
}
