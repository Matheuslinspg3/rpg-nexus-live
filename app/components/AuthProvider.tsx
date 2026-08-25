'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createBrowserClient } from '@/lib/supabase'
import type { SupabaseClient, User } from '@supabase/supabase-js'

type AuthContextType = {
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, username: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const supabaseRef = useRef<SupabaseClient | null>(null)
  const getSupabaseClientSideOnly = useCallback(() => {
    supabaseRef.current ??= createBrowserClient()
    return supabaseRef.current
  }, [])

  useEffect(() => {
    const supabase = getSupabaseClientSideOnly()

    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [getSupabaseClientSideOnly])

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabaseClientSideOnly()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }, [getSupabaseClientSideOnly])

  const signUp = useCallback(async (email: string, password: string, username: string) => {
    const supabase = getSupabaseClientSideOnly()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          display_name: username,
        },
      },
    })
    return { error }
  }, [getSupabaseClientSideOnly])

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClientSideOnly()
    await supabase.auth.signOut()
  }, [getSupabaseClientSideOnly])

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
