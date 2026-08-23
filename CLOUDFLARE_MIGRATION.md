# 🚀 Guia de Migração para Cloudflare Workers

Este documento descreve como migrar o **RPG Nexus Live** do ambiente ChatGPT Sites para Cloudflare Workers standalone.

---

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Arquitetura](#arquitetura)
3. [Alterações Realizadas](#alterações-realizadas)
4. [Pré-requisitos](#pré-requisitos)
5. [Configuração no Cloudflare Dashboard](#configuração-no-cloudflare-dashboard)
6. [Deploy Local](#deploy-local)
7. [Deploy em Produção](#deploy-em-produção)
8. [Comandos Úteis](#comandos-úteis)
9. [Verificação e Testes](#verificação-e-testes)
10. [Troubleshooting](#troubleshooting)
11. [Rollback](#rollback)
12. [Riscos Conhecidos](#riscos-conhecidos)

---

## 🎯 Visão Geral

### O que mudou?

**Antes (ChatGPT Sites):**
```
ChatGPT Sites Platform
├── Managed D1 Database
├── Managed R2 Bucket
├── Automatic Deployments
└── Custom Build System
```

**Depois (Cloudflare Workers):**
```
GitHub Repository
├── Cloudflare Workers (vinext)
├── D1 Database (self-managed)
├── R2 Bucket (self-managed)
└── Automated CI/CD via GitHub Integration
```

### Benefícios da Migração

✅ **Controle Total**: Gerenciamento direto de D1, R2 e Workers
✅ **CI/CD Automático**: Deploy automático ao fazer merge na `main`
✅ **Preview Branches**: Ambientes de preview para cada branch
✅ **Transparência**: Logs e métricas no Cloudflare Dashboard
✅ **Escalabilidade**: Acesso a todos os recursos da Cloudflare
✅ **Debugging**: Ferramentas nativas do Wrangler CLI

---

## 🏗️ Arquitetura

### Arquitetura Anterior (ChatGPT Sites)

```
ChatGPT Sites
    │
    ├── Build System (managed)
    ├── .openai/hosting.json (bindings)
    │   └── project_id: appgprj_6a866823f5e881919deed24996443147
    │
    ├── D1 Database (managed by Sites)
    │   └── Binding: "DB"
    │
    └── R2 Bucket (managed by Sites)
        └── Binding: "BUCKET"
```

### Arquitetura Nova (Cloudflare Workers)

```
GitHub (Matheuslinspg3/rpg-nexus-live)
    │
    ├── Push to main
    │   └── Cloudflare Workers Build
    │       └── Automatic Deploy
    │
    ├── wrangler.jsonc (source configuration)
    │   ├── compatibility_flags: ["nodejs_compat"]
    │   ├── D1 binding placeholder
    │   ├── R2 binding
    │   └── Assets config
    │
    ├── Build Output (vinext build)
    │   ├── dist/server/index.js (Worker entry)
    │   ├── dist/client/ (Assets)
    │   └── dist/client/wrangler.json (generated config with main field)
    │
    ├── Worker Entry: dist/server/index.js
    │   └── Built from: worker/index.ts (with IMAGES fallback)
    │
    ├── D1 Database: rpg-nexus-db
    │   ├── Binding: "DB"
    │   ├── Database ID: (configure no dashboard)
    │   └── Migrations: drizzle/*.sql
    │
    ├── R2 Bucket: rpg-nexus-files
    │   ├── Binding: "BUCKET"
    │   └── Path: campaigns/{id}/scenes/{uuid}.{ext}
    │
    └── Image Resizing (Cloudflare add-on)
        ├── Binding: env.IMAGES (auto-provided)
        ├── Endpoint: /_vinext/image
        └── Fallback: Unoptimized images if not enabled
```

---

## 🔧 Alterações Realizadas

### Arquivos Criados

| Arquivo | Propósito |
|---------|-----------|
| `wrangler.jsonc` | Configuração principal do Cloudflare Workers (compatibility_flags, bindings) |
| `scripts/build-cloudflare.sh` | Script de build standalone que esconde hosting.json temporariamente |
| `.env.example` | Template de variáveis de ambiente |
| `CLOUDFLARE_MIGRATION.md` | Este documento |

### Arquivos Modificados

| Arquivo | Alteração | Motivo |
|---------|-----------|--------|
| `wrangler.jsonc` | Configuração completa do Cloudflare Workers | Define bindings D1, R2, Assets e flags de compatibilidade |
| `vite.config.ts` | `.openai/hosting.json` agora é opcional | Permitir build fora do ChatGPT Sites |
| `package.json` | Novos scripts (`deploy`, `db:migrate`, etc) | Comandos específicos do Cloudflare |
| `.gitignore` | Adiciona `.dev.vars` e exclui `.env.example` | Proteger secrets locais |
| `worker/index.ts` | Adicionado fallback para `env.IMAGES` | Evitar quebra se Image Resizing não estiver habilitado |
| `scripts/build-cloudflare.sh` | Script para build standalone | Esconde `hosting.json` durante build e define `BUILD_TARGET=cloudflare` |

### Arquivos Preservados (NÃO alterados)

✅ `.openai/hosting.json` - mantido para compatibilidade com Sites
✅ `build/sites-vite-plugin.ts` - mantido para builds do Sites
✅ `scripts/sites-env.sh` - mantido para ambiente Sites
✅ `scripts/build-verified.sh` - mantido para builds do Sites
✅ `worker/index.ts` - sem alterações (já compatível)
✅ `db/schema.ts` - sem alterações
✅ `drizzle/*.sql` - migrations intactas

---

## ✅ Pré-requisitos

### 1. Conta Cloudflare

- [ ] Criar conta em https://dash.cloudflare.com (plano gratuito é suficiente)
- [ ] Verificar email
- [ ] Adicionar método de pagamento (necessário para D1/R2, mas gratuitos até os limites)

### 2. Wrangler CLI

```bash
npm install -g wrangler
wrangler login
wrangler whoami
```

### 3. Node.js

- Versão: ≥ 22.13.0 (conforme `package.json`)

---

## ⚙️ Configuração no Cloudflare Dashboard

### Passo 1: Criar D1 Database

1. Acesse https://dash.cloudflare.com
2. Navegue para **Workers & Pages** → **D1 SQL Database**
3. Clique em **Create database**
4. Configure:
   - **Database name**: `rpg-nexus-db`
   - **Location**: Automatic (ou escolha região)
5. Clique em **Create**
6. **IMPORTANTE**: Copie o **Database ID** exibido (formato: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
7. Edite `wrangler.jsonc` na raiz do projeto:
   ```jsonc
   "d1_databases": [
     {
       "binding": "DB",
       "database_name": "rpg-nexus-db",
       "database_id": "REPLACE_WITH_REAL_DATABASE_ID", // ← Substituir pelo Database ID real
       "migrations_dir": "./drizzle"
     }
   ],
   ```
8. Commit a alteração:
   ```bash
   git add wrangler.jsonc
   git commit -m "config: add D1 database ID"
   ```

### Passo 2: Aplicar Migrations no D1

```bash
# Instalar dependências
npm install

# Aplicar migrations localmente (para teste)
npm run db:migrate

# Aplicar migrations no banco remoto
npm run db:migrate:remote
```

**Verificar migrations:**
```bash
wrangler d1 execute rpg-nexus-db --remote --command "SELECT name FROM sqlite_master WHERE type='table';"
```

Você deve ver as tabelas:
- `users`
- `sessions`
- `campaigns`
- `campaign_members`
- `characters`
- `character_fields`
- `campaign_scenes`
- `dice_rolls`
- `presence`
- `camera_sessions`
- `camera_signals`
- `shield_layouts`
- E outras...

### Passo 3: Criar R2 Bucket

1. No dashboard, navegue para **R2**
2. Clique em **Create bucket**
3. Configure:
   - **Bucket name**: `rpg-nexus-files`
   - **Location**: Automatic (ou escolha região próxima ao D1)
4. Clique em **Create bucket**
5. **Permissões**: Manter privado (acesso via Worker apenas)

### Passo 4: Habilitar Image Resizing (Opcional mas Recomendado)

**IMPORTANTE**: O worker possui fallback - se Image Resizing não estiver habilitado, as imagens serão servidas diretamente sem otimização.

1. Após o primeiro deploy, navegue para **Workers & Pages** → **rpg-nexus-live**
2. Vá em **Settings** → **Functions** → **Bindings**
3. Habilite o add-on **Image Resizing**
   - Plano gratuito: 100.000 requisições/mês
   - Usado pelo endpoint `/_vinext/image`
4. Não é necessário adicionar binding manual - o `env.IMAGES` é fornecido automaticamente quando o add-on está ativo

---

## 🔗 Configuração do GitHub Integration

### Conectar GitHub ao Cloudflare

1. No Cloudflare Dashboard, vá para **Workers & Pages**
2. Clique em **Create application**
3. Selecione **Pages** → **Connect to Git**
4. Autorize o Cloudflare a acessar seu GitHub
5. Selecione o repositório: `Matheuslinspg3/rpg-nexus-live`
6. Configure:

#### Framework Preset
- **Framework preset**: `None` (vinext não é detectado automaticamente)

#### Build Configuration
```
Build command: npm run build:cloudflare
Build output directory: dist/client
```

**IMPORTANTE**: O comando `npm run build:cloudflare` executa `vinext build` que gera:
- `dist/server/index.js` - Worker entry point
- `dist/client/` - Assets estáticos
- `dist/client/wrangler.json` - Configuração gerada (com `main: ../server/index.js`)

O Wrangler usa `dist/client/wrangler.json` como base e mescla com `wrangler.jsonc` da raiz.

#### Root Directory
```
/ (raiz do repositório)
```

#### Environment Variables (Build)
Deixe vazio por enquanto - os bindings são configurados separadamente

7. Clique em **Save and Deploy**

### Configurar Production Branch

1. Após o deploy inicial, vá em **Settings** → **Builds & deployments**
2. Em **Production branch**, confirme: `main`
3. Em **Preview branches**, selecione **All non-production branches**
   - Isso cria previews automáticos para cada PR

### Adicionar Bindings ao Workers

Depois do deploy inicial via Pages:

1. No dashboard, vá até o seu projeto Workers/Pages
2. Clique em **Settings** → **Functions**
3. Role até **Bindings** e adicione:

**D1 Database Binding:**
- Variable name: `DB`
- D1 database: `rpg-nexus-db`

**R2 Bucket Binding:**
- Variable name: `BUCKET`
- R2 bucket: `rpg-nexus-files`

4. Clique em **Save**

### Trigger Re-Deploy

Após configurar os bindings:
1. Vá em **Deployments**
2. Encontre o último deployment bem-sucedido
3. Clique em **⋯** → **Retry deployment**

Ou simplesmente faça um novo push no `main`:
```bash
git commit --allow-empty -m "chore: trigger re-deploy with bindings"
git push origin main
```

---

## 💻 Deploy Local (Desenvolvimento)

### 1. Clonar e Instalar

```bash
git clone https://github.com/Matheuslinspg3/rpg-nexus-live.git
cd rpg-nexus-live
npm install
```

### 2. Configurar D1 Local

```bash
# Aplicar migrations localmente
npm run db:migrate
```

### 3. Iniciar Dev Server

```bash
# Método 1: Vite dev server (recomendado para desenvolvimento)
npm run dev

# Método 2: Wrangler dev (mais próximo da produção)
npm run dev:cloudflare
```

Acesse: http://localhost:5173 (vite) ou http://localhost:8787 (wrangler)

### 4. Criar Conta e Testar

1. Abra o app
2. Clique em **Criar conta**
3. Preencha os dados
4. Crie uma campanha teste
5. Faça upload de uma imagem de cena

---

## 🚀 Deploy em Produção

### Via GitHub (Recomendado)

```bash
# 1. Fazer alterações
git checkout -b feature/minha-feature
# ... suas alterações ...
git add .
git commit -m "feat: minha nova feature"
git push origin feature/minha-feature

# 2. Abrir Pull Request no GitHub
# 3. Preview automático será criado

# 4. Após aprovação, fazer merge na main
# 5. Deploy automático em produção
```

### Via Wrangler CLI (Manual)

```bash
# Build
npm run build:cloudflare

# Deploy
npm run deploy

# Ou para preview
npm run deploy:preview
```

---

## 📝 Comandos Úteis

### Desenvolvimento

```bash
npm run dev                    # Vite dev server
npm run dev:cloudflare         # Wrangler dev (mais próximo de produção)
npm run build                  # Build com verificação (Sites)
npm run build:cloudflare       # Build direto (Cloudflare)
npm test                       # Rodar testes
npm run lint                   # Verificar código
```

### Database

```bash
npm run db:generate            # Gerar nova migration
npm run db:migrate             # Aplicar migrations (local)
npm run db:migrate:remote      # Aplicar migrations (produção)

# Via Wrangler direto
wrangler d1 execute rpg-nexus-db --local --command "SELECT * FROM users LIMIT 5;"
wrangler d1 execute rpg-nexus-db --remote --file ./query.sql
```

### R2

```bash
# Listar objetos
wrangler r2 object list rpg-nexus-files

# Fazer upload manual
wrangler r2 object put rpg-nexus-files/test.jpg --file ./local-file.jpg

# Download
wrangler r2 object get rpg-nexus-files/campaigns/xyz/scenes/abc.jpg --file ./downloaded.jpg

# Deletar
wrangler r2 object delete rpg-nexus-files/test.jpg
```

### Cloudflare

```bash
npm run cf:login               # Login na Cloudflare
npm run cf:whoami              # Ver conta atual
npm run deploy                 # Deploy manual
npm run deploy:preview         # Deploy preview

# Logs em tempo real
wrangler tail
wrangler tail --format pretty
```

---

## ✔️ Verificação e Testes

### Checklist Pós-Deploy

- [ ] **Autenticação**: Criar conta, login, logout
- [ ] **Campanhas**: Criar campanha, obter código
- [ ] **Membros**: Entrar na campanha com código
- [ ] **Fichas**: Criar personagem, editar campos
- [ ] **Upload**: Fazer upload de imagem de cena
- [ ] **R2**: Verificar se imagem é carregada
- [ ] **Cortina**: Ajustar reveal % da cena
- [ ] **Dados**: Rolar dados públicos e privados
- [ ] **Presença**: Verificar cursores e edição em tempo real
- [ ] **Câmeras**: Testar sistema de câmeras WebRTC (se houver 2+ usuários)

### Testes de Carga

```bash
# Verificar limites do plano gratuito
# D1: 100.000 reads/day, 50.000 writes/day
# R2: 1 milhão Class A ops/month, 10 milhões Class B ops/month
# Workers: 100.000 requests/day

# Monitorar uso no dashboard:
# https://dash.cloudflare.com → Analytics
```

### Verificar Logs

```bash
# Produção
wrangler tail --env production

# Preview
wrangler tail --env preview

# Filtrar erros
wrangler tail --status error
```

---

## 🛠️ Troubleshooting

### Erro: "database_id" is required

**Problema**: `wrangler.jsonc` ainda tem placeholder.

**Solução**:
1. Copie o Database ID do Cloudflare Dashboard
2. Cole em `wrangler.jsonc` no campo `database_id`
3. Commit a mudança

### Erro: "binding DB not found"

**Problema**: Bindings não configurados no Workers/Pages.

**Solução**:
1. Vá em **Settings** → **Functions** → **Bindings**
2. Adicione D1 e R2 bindings
3. Re-deploy

### Erro: "BUCKET.get is not a function"

**Problema**: R2 binding não configurado.

**Solução**:
1. Verifique se o bucket `rpg-nexus-files` existe
2. Adicione binding `BUCKET` no dashboard
3. Re-deploy

### Erro: "Image optimization failed"

**Problema**: Image Resizing não está habilitado ou `env.IMAGES` ausente.

**Solução**:
O código atual em `worker/index.ts` possui fallback automático. Se `env.IMAGES` não estiver disponível:
- Imagens serão servidas diretamente de `ASSETS` sem otimização
- Um warning será logado: `"Image Resizing (env.IMAGES) not available - serving unoptimized images"`

**Para habilitar otimização** (opcional):
1. Dashboard → Workers & Pages → rpg-nexus-live → Settings → Functions
2. Enable Image Resizing add-on (100k requests/month free)
3. Re-deploy ou aguardar próximo deploy automático

### Build Falha Localmente

**Problema**: Timeout ou erro de memória.

**Solução**:
```bash
# Aumentar limite de memória do Node
NODE_OPTIONS="--max-old-space-size=4096" npm run build:cloudflare

# Ou usar build verificado (Sites)
npm run build
```

### Migrations Não Aplicam

**Problema**: D1 não reconhece migrations.

**Solução**:
```bash
# Verificar sintaxe SQL
cat drizzle/0000_*.sql

# Aplicar uma a uma
wrangler d1 execute rpg-nexus-db --remote --file ./drizzle/0000_volatile_bedlam.sql
wrangler d1 execute rpg-nexus-db --remote --file ./drizzle/0001_useful_daimon_hellstrom.sql
# ...
```

---

## 🔄 Rollback

### Se precisar voltar ao ChatGPT Sites

1. **Branch `main` está intacta** - nada foi alterado até o merge
2. Simplesmente não faça o merge do PR `migration/cloudflare`
3. Continue usando o ChatGPT Sites normalmente

### Se já fez merge e quer reverter

```bash
# 1. Reverter o merge
git revert <commit-hash-do-merge>
git push origin main

# 2. Ou resetar para commit anterior (CUIDADO)
git reset --hard <commit-antes-do-merge>
git push --force origin main
```

### Migrar Dados de Volta (D1 → Sites)

Se você já migrou dados para o Cloudflare D1 e quer voltar:

```bash
# 1. Export do D1
wrangler d1 export rpg-nexus-db --remote --output backup.sql

# 2. Contate suporte do ChatGPT Sites para importar
# (não há API pública para isso)
```

---

## ⚠️ Riscos Conhecidos

### 1. **Image Resizing Binding**

**Risco**: Worker usa `env.IMAGES` para otimização de imagens no endpoint `/_vinext/image`.

**Impacto**: Se Image Resizing não estiver habilitado, as imagens serão servidas diretamente sem otimização (fallback implementado).

**Mitigação**:
- Fallback implementado em `worker/index.ts` - imagens funcionam mesmo sem o add-on
- Para otimização, habilitar Image Resizing add-on no dashboard após deploy
- `env.IMAGES` é fornecido automaticamente quando o add-on está ativo

**Status**: ✅ Resolvido com fallback seguro

### 2. **WebRTC Signaling via D1**

**Risco**: Tabela `camera_signals` usa D1 para signaling WebRTC com polling.

**Impacto**: Funciona, mas não é ideal para real-time. Alto volume de reads.

**Mitigação**:
- Funcionalidade permanece operacional
- No futuro, considerar Durable Objects para signaling

**Status**: Funcional, mas não otimizado

### 3. **Presence Polling**

**Risco**: Sistema de presença faz polling a cada 150-320ms via D1.

**Impacto**: Pode atingir limites de reads do plano gratuito rapidamente.

**Mitigação**:
- Monitorar uso no dashboard
- Se necessário, aumentar intervalo de polling
- Ou migrar para Durable Objects

**Status**: Funcional, requer monitoramento

### 4. **Database ID Hardcoding**

**Risco**: `wrangler.jsonc` precisa do database_id real da Cloudflare.

**Impacto**: Deploy falhará se usar placeholder.

**Mitigação**:
- Documentado no passo a passo
- Checklist de pré-deploy

**Status**: Mitigado por documentação

### 5. **Perda de Dados durante Migração**

**Risco**: Banco ChatGPT Sites não pode ser exportado/importado facilmente.

**Impacto**: Se já houver usuários no Sites, dados não migram automaticamente.

**Mitigação**:
- Esta migração cria infraestrutura NOVA
- Não há migração automática de dados
- Considerar período de transição onde ambos ambientes coexistem

**Status**: Migração de dados NÃO incluída neste escopo

---

## 📚 Recursos Adicionais

- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [D1 Database Docs](https://developers.cloudflare.com/d1/)
- [R2 Storage Docs](https://developers.cloudflare.com/r2/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)
- [vinext Documentation](https://vinext.pages.dev/)
- [Drizzle ORM](https://orm.drizzle.team/)

---

## 📞 Suporte

Se encontrar problemas:

1. **Logs**: Verificar `wrangler tail` e Cloudflare Dashboard
2. **GitHub Issues**: Abrir issue no repositório
3. **Cloudflare Community**: https://community.cloudflare.com/
4. **Documentação**: Revisar este documento

---

**Última atualização**: 2026-08-23
**Versão da migração**: 1.1.0
**Branch**: `migration/cloudflare`

## 📝 Changelog

### v1.1.0 (2026-08-23)
- ✅ Corrigido `compatibility_flags`: `nodejs_compat` em vez de `nodejs_compat_v2`
- ✅ Adicionado fallback para `env.IMAGES` no `worker/index.ts`
- ✅ Corrigido entrypoint: `dist/server/index.js` (vinext gera automaticamente)
- ✅ Simplificado `build-cloudflare.sh` (vinext adiciona `main` automaticamente)
- ✅ Validado com `wrangler deploy --dry-run`: PASS
- ✅ Build: PASS
- ✅ Lint: PASS (1 warning não crítico)

### v1.0.0 (2025-01-20)
- Migração inicial para Cloudflare Workers
