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

## Roteamento Inteligente WhatsApp

As actions de envio de WhatsApp em automações suportam 3 estratégias de seleção de conexão:

- **DEFAULT** — usa a conversa do trigger ou a primeira ativa do contato (com defaults globais aplicados)
- **SPECIFIC** — usa uma conexão específica (precisa ter conversation prévia com o contato)
- **TYPE_PREFERRED** — prioriza o tipo (Oficial / Não oficial), com fallback automático para o outro

Cada envio pode ter **fallback** configurado:

- **Template em janela fechada** — quando a Meta retorna `WINDOW_CLOSED`, dispara um template aprovado configurado
- **Outra conexão** — se a primeira tentativa falhar, itera para a próxima conexão ativa do contato

Os defaults globais ficam em `/whatsapp` aba **Roteamento** (singleton `WhatsAppRoutingConfig`): conexão padrão, estratégia (`OFFICIAL_FIRST` / `UNOFFICIAL_FIRST` / `OFFICIAL_ONLY` / `UNOFFICIAL_ONLY`), template de fallback, marcar como lida automaticamente e horário comercial only.

Os gatilhos `message_received`, `message_sent` e `keyword_detected` aceitam filtros opcionais por `connectionId` ou `connectionType`, permitindo fluxos diferentes por conexão (ex.: "atribuir Ana se chegou na conexão Recepção").

O caminho de decisão (sequência de tentativas + razão de cada falha) é registrado no AutomationLog em `output.path`.

## Transferência entre Funis

Oportunidades podem se mover entre funis preservando histórico:

- Action `transfer_to_pipeline` no construtor de fluxos
- Endpoint manual `PUT /opportunities/:id/transfer` (consumido pelo modal "Transferir" no popup de oportunidade)
- Trigger `opportunity_transferred` (com filtros opcionais by from/to pipeline e etapa) pra encadear automações no funil destino (ex.: cadência de boas-vindas no Pós-Venda quando ganho no Comercial)

3 estratégias para campos personalizados:

- **KEEP_COMPATIBLE** — preserva apenas valores cujo CustomField está visível no funil destino (recomendado)
- **DISCARD_ALL** — remove todos os valores
- **MAP** — aplica mapeamento manual `from → to`

Toggles independentes para `keepTags`, `keepReminders`, `keepFiles`. A movimentação é registrada com `HistoryAction.TRANSFERRED` e renderizada no histórico como _"Filipe transferiu de Comercial (Fechado) para Pós-Venda (Onboarding)"_.

## Próximos passos

- [x] Aplicar handoff do design system (componentes + 7 telas)
- [x] Implementar autenticação (JWT access/refresh)
- [x] Modelar entidades do domínio no Prisma
- [x] Integração WhatsApp (Baileys + Meta Cloud API)
- [x] Realtime (Socket.io) para pipeline e conversas
- [x] Automation Engine — Parte 1 (event-driven + IA)
- [x] Cadências — Parte 2 (sequências programadas)
- [x] Construtor visual de Fluxos + Webhooks UI + Logs UI — Parte 3
- [x] Roteamento Inteligente WhatsApp + Transferência entre Funis
