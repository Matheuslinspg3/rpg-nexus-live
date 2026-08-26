# Integração Discord — Cianna's Stage

O Cianna usa o Discord como identidade e ponto de encontro da comunidade. O **Rollem** continua responsável pelas rolagens no Discord e o bot de música continua exclusivo para músicas.

## O que esta etapa faz

- permite que cada conta Cianna vincule sua conta Discord;
- usa o escopo mínimo `identify`;
- não lê mensagens nem lista servidores neste vínculo;
- mantém o **PVRP totalmente fora de sincronização, importação e catálogo**.

## Configuração única

1. Crie uma aplicação em [Discord Developer Portal](https://discord.com/developers/applications) e copie **Client ID** e **Client Secret**.
2. No Supabase: **Authentication → Providers → Discord**, ative o provedor e cole ambos.
3. No Discord: **OAuth2 → Redirects**, adicione exatamente:
   `https://SEU_PROJECT_REF.supabase.co/auth/v1/callback`
4. No Supabase: **Authentication → URL Configuration**, adicione:
   `https://rpg-nexus-live.vercel.app/auth/callback`
   aos Redirect URLs permitidos. Acrescente a URL de preview da Vercel somente se for testar OAuth fora de produção.
5. Publique o site. Em **Perfil e integrações**, a pessoa clica em **Conectar Discord**.

O segredo do Discord permanece no Supabase. Não crie `DISCORD_CLIENT_SECRET` no GitHub nem no código do navegador.

## Quando o bot existir

O bot de sessões/voz deve usar hospedagem sempre ligada (Railway, Render com worker, VPS etc.), pois precisa manter uma conexão Gateway/voz por toda a sessão. A Vercel continua hospedando o Cianna e suas rotas HTTP curtas, inclusive este callback OAuth.
