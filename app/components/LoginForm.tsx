"use client";

import { useState } from "react";

type LoginFormProps = {
  onSuccess: (user: { id: string; email: string; displayName: string }) => void;
  onSwitchToRegister: () => void;
};

export function LoginForm({ onSuccess, onSwitchToRegister }: LoginFormProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (!email || !password) {
      setError("Preencha todos os campos.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      // Chamada para Supabase Auth
      const response = await fetch("/api/auth/supabase/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível fazer login.");
      }

      onSuccess({
        id: data.user.id,
        email: data.user.email,
        displayName: data.user.user_metadata?.display_name || data.user.email,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao fazer login.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label className="auth-field">
        <span>E-mail</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="seu@email.com"
          disabled={busy}
        />
      </label>

      <label className="auth-field">
        <span>Senha</span>
        <input
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="current-password"
          placeholder="Mínimo de 6 caracteres"
          disabled={busy}
        />
      </label>

      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}

      <button className="primary-button auth-submit" disabled={busy}>
        {busy ? "Entrando..." : "Entrar"}
        <span aria-hidden="true">→</span>
      </button>

      <p className="auth-switch">
        Ainda não tem uma conta?
        <button type="button" onClick={onSwitchToRegister} disabled={busy}>
          Criar agora
        </button>
      </p>
    </form>
  );
}
