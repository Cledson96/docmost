# Visão Geral Do Sistema

## Produto E Limites

Docmost é uma wiki colaborativa: workspaces contêm spaces, e spaces contêm páginas hierárquicas com permissões, comentários, anexos, histórico, pesquisa e colaboração em tempo real. O código principal está em dois apps e dois packages compartilhados.

| Área                    | Responsabilidade                                        | Entrada principal                                |
| ----------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| `apps/client`           | SPA React exibida ao usuário                            | `src/main.tsx`, rotas em `src/App.tsx`           |
| `apps/server`           | API HTTP, WebSocket, colaboração, jobs e entrega do app | `src/main.ts`, composição em `src/app.module.ts` |
| `packages/editor-ext`   | Extensões compartilhadas do editor                      | `src/index.ts`                                   |
| `packages/base-formula` | Fórmulas compartilhadas com entradas client/server      | `src/index.client.ts`, `src/index.server.ts`     |

## Fluxo Principal

1. O navegador inicia a SPA em `apps/client/src/main.tsx`, que instala providers Mantine, React Query, modais, notificações, i18n e roteamento.
2. `apps/client/src/App.tsx` seleciona páginas e layouts por React Router. Chamadas HTTP usam `/api`; no desenvolvimento, o Vite as encaminha para `APP_URL`.
3. `apps/server/src/main.ts` inicializa Nest com Fastify, Redis para WebSocket, multipart/cookies, validação e o prefixo global `/api`.
4. `AppModule` registra domínio, dados, Redis, filas, storage, importação/exportação, colaboração, telemetria e módulos de negócio. O `CoreModule` agrega os recursos centrais.
5. Serviços coordenam regras de negócio; repositórios Kysely persistem no PostgreSQL. Redis é usado por cache, filas e infraestrutura de colaboração/WebSocket.

## Fronteiras Relevantes

- `apps/server/src/core`: recursos de negócio, como auth, workspace, space, page, comentários, grupos, busca e anexos.
- `apps/server/src/integrations`: adaptadores de ambiente, storage, mail, filas, Redis, exportação, importação, saúde e segurança.
- `apps/server/src/database`: módulo Kysely global, repositórios, listeners, paginação, migrações e tipos de banco.
- `apps/server/src/collaboration` e `apps/server/src/ws`: colaboração e comunicação em tempo real; não trate como endpoints HTTP comuns.
- `apps/client/src/pages`: composição de telas por rota; `apps/client/src/features`: código reutilizável orientado ao domínio.
- `apps/*/src/ee`: recursos ativados condicionalmente no servidor. Preserve os limites de cloud/licenciamento quando mexer neles.

## Referências De Verdade

- Scripts e ferramentas: `package.json`, manifests de cada app/package, `nx.json` e workflows em `.github/workflows/`.
- Rotas e inicialização: `apps/client/src/App.tsx`, `apps/server/src/main.ts` e `apps/server/src/app.module.ts`.
- Contexto de runtime: `.env.example`, `docker-compose.yml`, `Dockerfile` e `docs/deployment.md`.
