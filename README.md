# Lumen CRM

CRM profissional para clínicas estéticas — gestão de leads via WhatsApp com pipeline visual.

## Stack

- **Monorepo** — pnpm workspaces
- **Backend** — Node.js 20 · Fastify 5 · TypeScript
- **Frontend** — React 18 · Vite 6 · TypeScript · Tailwind 3
- **Banco** — PostgreSQL 16 (Docker)
- **Cache / Filas** — Redis 7 (Docker) · BullMQ
- **ORM** — Prisma 6
- **Auth** — JWT (access + refresh)
- **Realtime** — Socket.io
- **Validação** — Zod

## Estrutura

```
lumen-crm/
├── apps/
│   ├── api/          # Backend Fastify (porta 3333)
│   └── web/          # Frontend React + Vite (porta 5173)
├── packages/
│   ├── database/     # Prisma schema + client
│   ├── shared/       # Tipos e utils compartilhados
│   └── config/       # tsconfig base (e configs futuras)
├── docker-compose.yml
├── eslint.config.mjs
├── .prettierrc.json
├── pnpm-workspace.yaml
└── package.json
```

## Pré-requisitos

- **Node.js** ≥ 20 (`.nvmrc` aponta para 20)
- **pnpm** ≥ 10
- **Docker** + **Docker Compose** (ou Postgres/Redis nativos)

### ⚠️ Redis é obrigatório

Os módulos de **Automation Engine** e **Cadências** dependem de BullMQ, que exige Redis. A API tenta se conectar ao Redis no boot — sem ele, os workers entram em loop de `ECONNREFUSED` e nenhuma automação ou cadência dispara.

```bash
# Caminho recomendado (Docker)
docker-compose up -d

# Alternativa: instalar nativamente
sudo apt-get install -y redis-server
sudo service redis-server start
redis-cli ping   # → PONG
```

A URL é configurada via `REDIS_URL` no `.env` (default `redis://localhost:6379`).

## Setup rápido

```bash
# 1. Subir infraestrutura (Postgres + Redis)
docker-compose up -d

# 2. Copiar variáveis de ambiente
cp .env.example .env

# 3. Instalar dependências
pnpm install

# 4. Gerar cliente Prisma
pnpm db:generate

# 5. Rodar API + Web em paralelo
pnpm dev
```

Pronto:
- **API** → http://localhost:3333/health
- **Web** → http://localhost:5173

## Serviços

| Serviço     | Porta | Credenciais                                    |
| ----------- | ----- | ---------------------------------------------- |
| PostgreSQL  | 5432  | `lumen` / `lumen` · DB `lumen_crm`             |
| Redis       | 6379  | sem auth                                       |
| API         | 3333  | —                                              |
| Web (Vite)  | 5173  | proxy `/api/*` → `http://localhost:3333/*`     |

## Scripts

| Comando              | Descrição                                |
| -------------------- | ---------------------------------------- |
| `pnpm dev`           | Roda **api + web** em paralelo           |
| `pnpm build`         | Build recursivo de todos os pacotes      |
| `pnpm lint`          | ESLint em todo o monorepo                |
| `pnpm format`        | Prettier (escrita)                       |
| `pnpm typecheck`     | `tsc --noEmit` em todos os pacotes       |
| `pnpm db:generate`   | Gera o Prisma Client                     |
| `pnpm db:migrate`    | Cria/aplica migrations (dev)             |
| `pnpm db:studio`     | Abre Prisma Studio                       |

## Design tokens

- **Cor de acento** — `#D4AF37` (dourado Lumen) → classes Tailwind `text-accent`, `bg-accent`, `border-accent`
- **Tipografia** — `SF Pro Display` (primária) com fallback `Inter` carregado de `rsms.me`
- **Tema** — CSS variables prontas para alternância **dark/light** (classe `.dark` no `<html>`)

Tokens definidos em `apps/web/src/index.css` e mapeados no `apps/web/tailwind.config.ts`.

## Próximos passos

- [x] Aplicar handoff do design system (componentes + 7 telas)
- [x] Implementar autenticação (JWT access/refresh)
- [x] Modelar entidades do domínio no Prisma
- [x] Integração WhatsApp (Baileys + Meta Cloud API)
- [x] Realtime (Socket.io) para pipeline e conversas
- [x] Automation Engine — Parte 1 (event-driven + IA)
- [x] Cadências — Parte 2 (sequências programadas)
- [ ] Construtor visual de Fluxos + Webhooks UI + Logs UI — Parte 3
