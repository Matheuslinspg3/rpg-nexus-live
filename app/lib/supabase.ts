import { createClient } from "@supabase/supabase-js";

// Tipos para o usuário do Supabase
export type SupabaseUser = {
  id: string;
  email: string;
  user_metadata: {
    display_name?: string;
    username?: string;
  };
};

// Cliente Supabase (server-side)
export function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase URL e Anon Key devem ser configurados nas variáveis de ambiente");
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

// Cliente Supabase com Service Role (para operações admin)
export function getSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error("Supabase URL e Service Role Key devem ser configurados nas variáveis de ambiente");
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

// Função para criar usuário no Supabase
export async function createSupabaseUser(email: string, password: string, displayName: string) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
        username: email.split("@")[0], // Gera username a partir do email
      },
    },
  });

  if (error) throw error;
  return data;
}

// Função para fazer login no Supabase
export async function signInWithSupabase(email: string, password: string) {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) throw error;
  return data;
}

// Função para fazer logout no Supabase
export async function signOutFromSupabase() {
  const supabase = getSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Função para obter usuário atual do Supabase
export async function getSupabaseUser() {
  const supabase = getSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error) throw error;
  return user;
}

// Função para converter sessão Supabase em cookie
export function serializeSupabaseSession(accessToken: string, refreshToken: string) {
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
  };
}
