# Dados E Runtime

## Configuração

- A configuração do servidor e a do Vite carregam a `.env` da raiz. Parta de `.env.example`; não crie arquivos de ambiente por app.
- O runtime nativo depende de PostgreSQL e Redis acessíveis pelos valores de `DATABASE_URL` e `REDIS_URL`. O servidor escuta `PORT` (3000 por padrão); o Vite encaminha API, Socket.IO e colaboração para `APP_URL`.
- `docker-compose.yml` sobe aplicação, PostgreSQL com pgvector e Redis. Produção usa imagem criada pelo `Dockerfile`, que compila todo o workspace antes de instalar dependências de produção.

## Banco E Migrações

- A persistência é PostgreSQL com Kysely, não Prisma. `DatabaseModule` usa `CamelCasePlugin` e os tipos de banco ficam em `apps/server/src/database/types/`.
- Migrações são arquivos TypeScript ordenados em `apps/server/src/database/migrations/`. Crie e execute-as pelos scripts `migration:create`, `migration:up`, `migration:down` e `migration:redo` do package `server`.
- Desenvolvimento não migra automaticamente. O bootstrap de produção chama `MigrationService.migrateToLatest()`.
- `apps/server/src/database/types/db.d.ts` é gerado por `pnpm --filter server migration:codegen`, que usa o banco apontado pela `.env` da raiz. Nunca o edite manualmente.

## Serviços De Runtime

- Redis sustenta cache, BullMQ, o adaptador Socket.IO e partes da colaboração. Uma alteração de recurso em tempo real pode envolver `collaboration`, `ws`, cache e frontend.
- Storage é selecionado por `STORAGE_DRIVER` (`local`, `s3` ou `azure`); mantenha acessos a arquivos dentro da integração de storage e preserve os contratos de upload/download.
- Mail pode usar SMTP ou Postmark. Exportação PDF usa Gotenberg quando configurado. Busca, IA, telemetria e billing são opcionais e controlados por variáveis de ambiente.
- `CLOUD`, `SUBDOMAIN_HOST`, billing e licenciamento alteram o comportamento multi-workspace. Valide sempre os dois modos quando mudar contexto de workspace ou recursos em `ee`.
