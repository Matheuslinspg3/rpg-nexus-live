# RPG Nexus Live

Mesa virtual colaborativa para campanhas de RPG com ficha compartilhada, presença em tempo real e edição simultânea.

## Stack Migrada (Supabase + Vercel)

- **Framework**: Next.js 16 (App Router + RSC)
- **Database**: Supabase PostgreSQL
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage (cenas)
- **Realtime**: Polling (Supabase Realtime opcional)
- **Câmera**: Daily.co
- **Deploy**: Vercel

## Setup Local

```bash
npm install
# Configure .env.local com as credenciais Supabase
npm run dev
```

## Deploy Vercel

1. Conecte o repositório no Vercel
2. Configure as variáveis de ambiente:
   - `NEXT_PUBLIC_SUPABASE_URL`: https://pszucfdwbmszpfguxacn.supabase.co
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: (chave anon do Supabase)
   - `SUPABASE_SERVICE_ROLE_KEY`: (chave service_role)
   - `DAILY_API_KEY`: CPMFOGIREO
3. Deploy automático no push

## Supabase Schema

Execute `supabase-schema.sql` no SQL Editor do Supabase para criar as tabelas.

## Bucket Storage

Crie o bucket `campaign-scenes` no Supabase Storage (Storage > New Bucket):
- Name: `campaign-scenes`
- Public: No
- File size limit: 10 MB
- Allowed MIME types: image/jpeg, image/png, image/webp, image/gif

---

Migração concluída de Cloudflare Pages/Workers para Supabase + Vercel.
