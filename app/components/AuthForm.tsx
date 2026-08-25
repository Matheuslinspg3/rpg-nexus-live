'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from './AuthProvider'

export function AuthForm() {
  const router = useRouter()
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn, signUp } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (isLogin) {
        const { error } = await signIn(email, password)
        if (error) throw error
        router.refresh()
      } else {
        if (!username.trim()) {
          throw new Error('Nome de usuário é obrigatório')
        }
        const { error } = await signUp(email, password, username)
        if (error) throw error
        router.refresh()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao autenticar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-orbit login-orbit-one" aria-hidden />
      <div className="login-orbit login-orbit-two" aria-hidden />
      <div className="basic-auth-card">
        <div className="auth-brand">
          <h1>RPG Nexus</h1>
          <p>{isLogin ? 'Entre na sua conta para continuar sua campanha.' : 'Crie sua conta e comece sua jornada.'}</p>
        </div>

        <div className="auth-tabs">
          <button type="button" className={isLogin ? 'active' : ''} onClick={() => { setIsLogin(true); setError('') }} disabled={loading}>
            Entrar
          </button>
          <button type="button" className={!isLogin ? 'active' : ''} onClick={() => { setIsLogin(false); setError('') }} disabled={loading}>
            Criar conta
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {!isLogin && (
            <label className="auth-field">
              <span>Nome de usuário</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required={!isLogin}
                disabled={loading}
                placeholder="seu_nick"
                autoComplete="username"
              />
            </label>
          )}

          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
              placeholder="voce@exemplo.com"
              autoComplete="email"
            />
          </label>

          <label className="auth-field">
            <span>Senha</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
              minLength={6}
              placeholder="••••••••"
              autoComplete={isLogin ? 'current-password' : 'new-password'}
            />
          </label>

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" disabled={loading} className="primary-button auth-submit">
            {loading ? 'Aguarde...' : isLogin ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        <div className="auth-switch">
          <span>{isLogin ? 'Não tem conta?' : 'Já tem conta?'}</span>
          <button type="button" onClick={() => { setIsLogin(!isLogin); setError('') }} disabled={loading}>
            {isLogin ? 'Registre-se' : 'Entre'}
          </button>
        </div>
      </div>
    </div>
  )
}
