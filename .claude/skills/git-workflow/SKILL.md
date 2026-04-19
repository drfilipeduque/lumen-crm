# Skill: git-workflow

## Descrição
Define o fluxo de versionamento obrigatório para o projeto Lumen CRM. Use esta skill SEMPRE que for executar qualquer tarefa de desenvolvimento que envolva mudanças em arquivos do projeto (features, fixes, refactors, configurações).

## Quando usar
- Antes de começar qualquer tarefa de desenvolvimento
- Ao longo da execução (commits intermediários)
- Ao finalizar uma tarefa

## Regras obrigatórias

### 1. Sempre trabalhar em branch separada
NUNCA commitar direto em main. Antes de qualquer alteração, executar:

- git checkout main
- git pull origin main
- git checkout -b feature/nome-curto-da-tarefa

Nomes de branch seguem o padrão:
- feature/xxx — nova funcionalidade
- fix/xxx — correção de bug
- refactor/xxx — reestruturação
- chore/xxx — configuração, dependências
- docs/xxx — documentação

### 2. Commits frequentes e atômicos
Commitar a cada etapa significativa (não esperar o fim da tarefa inteira). Cada commit deve representar uma unidade lógica de mudança.

### 3. Conventional Commits obrigatório
Formato: tipo(escopo): descrição curta em português

Tipos aceitos:
- feat — nova funcionalidade
- fix — correção de bug
- refactor — refatoração sem mudar comportamento
- chore — configurações, dependências, build
- docs — documentação
- style — formatação, sem mudança de código
- test — testes
- perf — melhoria de performance

Escopos comuns no projeto:
- auth, dashboard, pipeline, leads, contacts, settings
- opportunities, reminders, whatsapp, automation
- api, web, database, shared

Exemplos bons:
- feat(settings): adiciona crud de tags
- fix(auth): corrige refresh token expirado
- refactor(sidebar): migra para react-router NavLink
- chore(deps): atualiza prisma para 5.20

Exemplos ruins (evitar):
- atualização
- fix
- mudanças no código
- wip

### 4. Push ao finalizar
Ao terminar a tarefa, executar: git push origin feature/nome-da-branch

### 5. Reportar ao usuário
Ao final, sempre informar:
- Nome da branch criada
- Resumo dos commits feitos
- Instrução para o usuário mergear ou abrir PR

### 6. NUNCA commitar
- Arquivos .env (apenas .env.example)
- Pasta node_modules
- Pasta uploads (arquivos de usuários)
- Volumes Docker (postgres-data, redis-data)
- Logs, builds, caches
- Tokens, credenciais, secrets em código
Verificar .gitignore em caso de dúvida.

### 7. Antes de começar, verificar estado
Sempre executar no início: git status e git branch --show-current
Se houver mudanças não commitadas em branch diferente da main, perguntar ao usuário o que fazer antes de prosseguir.
