# Skill: git-workflow

## Descrição
Define o fluxo de versionamento obrigatório para o projeto Lumen CRM. Use esta skill SEMPRE que for executar qualquer tarefa de desenvolvimento que envolva mudanças em arquivos do projeto (features, fixes, refactors, configurações).

## Quando usar
- Antes de começar qualquer tarefa de desenvolvimento
- Ao longo da execução (commits intermediários)
- Ao finalizar uma tarefa

## Fluxo
1. Verificar o estado e garantir que a branch atual é main (fazer git checkout main se necessário).
2. Fazer as mudanças.
3. Commitar em etapas, com cada commit representando uma unidade lógica de mudança.
4. NÃO fazer push — o usuário faz o push manual no GitHub quando quiser.
5. Ao finalizar, reportar com o resumo dos commits e a frase: "Commits prontos na main. Push quando quiser."

## Regras obrigatórias

### 1. Trabalhar sempre direto na main
Não criar branches feature/*, fix/* etc. Todo o trabalho vai direto pra branch main local. O usuário cuida da publicação no GitHub depois.

### 2. Antes de começar, verificar estado
Sempre executar no início: git status e git branch --show-current
Se não estiver na main, executar: git checkout main
Se houver mudanças não commitadas em outra branch, perguntar ao usuário o que fazer antes de prosseguir.

### 3. Commits frequentes e atômicos
Commitar a cada etapa significativa (não esperar o fim da tarefa inteira). Cada commit deve representar uma unidade lógica de mudança.

### 4. Conventional Commits obrigatório
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

### 5. NÃO fazer push automático
NUNCA executar git push. O usuário publica os commits manualmente no GitHub quando quiser.

### 6. Reportar ao usuário ao finalizar
Ao concluir a tarefa, sempre informar:
- Resumo dos commits feitos (hashes curtos + mensagens)
- A frase: "Commits prontos na main. Push quando quiser."

### 7. NUNCA commitar
- Arquivos .env (apenas .env.example)
- Pasta node_modules
- Pasta uploads (arquivos de usuários)
- Volumes Docker (postgres-data, redis-data)
- Logs, builds, caches
- Tokens, credenciais, secrets em código
Verificar .gitignore em caso de dúvida.
