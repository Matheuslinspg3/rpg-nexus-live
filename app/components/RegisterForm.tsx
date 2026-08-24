"use client";

import { useState } from "react";

type RegisterFormProps = {
  onSuccess: (user: { id: string; email: string; displayName: string }) => void;
  onSwitchToLogin: () => void;
};

export function RegisterForm({ onSuccess, onSwitchToLogin }: RegisterFormProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const displayName = String(form.get("displayName") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const passwordConfirm = String(form.get("passwordConfirm") ?? "");

    if (!displayName || !email || !password) {
      setError("Preencha todos os campos.");
      return;
    }

    if (password !== passwordConfirm) {
      setError("As senhas não coincidem.");
      return;
    }

    if (displayName.length < 2) {
      setError("O nick precisa ter pelo menos 2 caracteres.");
      return;
    }

    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    setBusy(true);
    setError("");

    try {
      // Chamada para Supabase Auth
      const response = await fetch("/api/auth/supabase/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível criar a conta.");
      }

      onSuccess({
        id: data.user.id,
        email: data.user.email,
        displayName: data.user.user_metadata?.display_name || displayName,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar conta.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <label className="auth-field">
        <span>Nick na mesa</span>
        <input
          name="displayName"
          required
          minLength={2}
          maxLength={30}
          autoComplete="nickname"
          placeholder="Ex.: Paparoxo"
          disabled={busy}
        />
      </label>

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
          maxLength={128}
          autoComplete="new-password"
          placeholder="Mínimo de 6 caracteres"
          disabled={busy}
        />
      </label>

      <label className="auth-field">
        <span>Confirmar senha</span>
        <input
          name="passwordConfirm"
          type="password"
          required
          minLength={6}
          maxLength={128}
          autoComplete="new-password"
          placeholder="Repita sua senha"
          disabled={busy}
        />
      </label>

      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}

      <button className="primary-button auth-submit" disabled={busy}>
        {busy ? "Criando conta..." : "Criar conta"}
        <span aria-hidden="true">→</span>
      </button>

      <p className="auth-switch">
        Já possui uma conta?
        <button type="button" onClick={onSwitchToLogin} disabled={busy}>
          Entrar
        </button>
      </p>
    </form>
  );
}
