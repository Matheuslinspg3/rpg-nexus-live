"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase";

type Profile = {
  displayName: string;
  username: string;
  discordName?: string | null;
};

export function ProfileSettings({ open, user, onClose, onProfileUpdated }: {
  open: boolean;
  user: Profile;
  onClose: () => void;
  onProfileUpdated: (profile: Pick<Profile, "displayName" | "username">) => void;
}) {
  const router = useRouter();
  const clientRef = useRef<ReturnType<typeof createBrowserClient> | null>(null);
  const getClient = () => (clientRef.current ??= createBrowserClient());
  const [displayName, setDisplayName] = useState(user.displayName);
  const [username, setUsername] = useState(user.username);
  const [discordName, setDiscordName] = useState<string | null>(user.discordName ?? null);
  const [busy, setBusy] = useState<"profile" | "discord" | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!open) return;
    setDisplayName(user.displayName);
    setUsername(user.username);
    setDiscordName(user.discordName ?? null);
    setNotice("");

    void getClient().auth.getUser().then(({ data }) => {
      const identity = data.user?.identities?.find((item) => item.provider === "discord");
      const raw = identity?.identity_data as Record<string, unknown> | undefined;
      const name = typeof raw?.global_name === "string"
        ? raw.global_name
        : typeof raw?.username === "string"
          ? raw.username
          : null;
      setDiscordName(name);
    });
  }, [open, user.displayName, user.discordName, user.username]);

  if (!open) return null;

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextDisplayName = displayName.trim();
    const nextUsername = username.trim();
    if (!nextDisplayName || !nextUsername) {
      setNotice("Informe seu nome de exibição e seu @usuário.");
      return;
    }

    setBusy("profile");
    setNotice("");
    const { error } = await getClient().auth.updateUser({
      data: { display_name: nextDisplayName, username: nextUsername },
    });
    setBusy(null);

    if (error) {
      setNotice(error.message);
      return;
    }

    onProfileUpdated({ displayName: nextDisplayName, username: nextUsername });
    setNotice("Perfil salvo.");
    router.refresh();
  };

  const linkDiscord = async () => {
    setBusy("discord");
    setNotice("");
    const redirectTo = window.location.origin + "/auth/callback?next=/";
    const { data, error } = await getClient().auth.linkIdentity({
      provider: "discord",
      options: { redirectTo },
    });

    if (error) {
      setBusy(null);
      setNotice(error.message);
      return;
    }

    if (!data?.url) {
      setBusy(null);
      setNotice("Não foi possível iniciar a autorização do Discord.");
      return;
    }

    window.location.assign(data.url);
  };

  return (
    <div className="profile-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-settings-title" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <p className="eyebrow">Conta e integrações</p>
            <h2 id="profile-settings-title">Seu perfil no palco</h2>
          </div>
          <button type="button" onClick={onClose} className="profile-close" aria-label="Fechar configurações">×</button>
        </header>

        <form onSubmit={saveProfile} className="profile-form">
          <label className="auth-field">
            <span>Nome de exibição</span>
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={40} />
          </label>
          <label className="auth-field">
            <span>@Usuário</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} maxLength={32} />
          </label>
          <button className="primary-button" disabled={busy !== null} type="submit">
            {busy === "profile" ? "Salvando..." : "Salvar perfil"}
          </button>
        </form>

        <section className="discord-connect-card">
          <div className="discord-connect-icon" aria-hidden>◉</div>
          <div className="discord-connect-copy">
            <strong>Discord</strong>
            <p>{discordName ? <>Conectado como <b>{discordName}</b>.</> : "Conecte sua conta para reconhecer seu usuário no servidor Madruga do RPG."}</p>
          </div>
          <button type="button" className={discordName ? "secondary-button connected" : "secondary-button"} onClick={() => void linkDiscord()} disabled={busy !== null}>
            {busy === "discord" ? "Abrindo..." : discordName ? "Reconectar" : "Conectar Discord"}
          </button>
        </section>

        <aside className="catalog-privacy-note">
          <strong>Privacidade do PVRP</strong>
          <p>O PVRP não será sincronizado, lido nem catalogado pelo Cianna’s Stage. A futura linha do tempo usará somente os canais autorizados pelo Mestre.</p>
        </aside>

        {notice && <p className="profile-notice" role="status">{notice}</p>}
      </section>
    </div>
  );
}
