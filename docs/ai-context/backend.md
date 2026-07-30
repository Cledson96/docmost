# Backend

## Inicialização E HTTP

- O servidor é NestJS sobre Fastify. `apps/server/src/main.ts` aplica o prefixo global `/api`, exceto rotas públicas explícitas, e registra multipart, cookies, IP e o adaptador Redis para Socket.IO.
- A validação global usa `ValidationPipe` com `whitelist`, `transform` e `stopAtFirstError`. DTOs são classes com `class-validator` e, quando necessário, `class-transformer`.
- `TransformHttpResponseInterceptor` envolve respostas JSON em `{ data, success: true, status }`. Endpoints que precisam devolver payload HTTP nativo usam `@SkipTransform()`; exportações são o caso principal.
- O limite HTTP padrão é 10 MB. Alterações de upload devem considerar esse limite e os limites configuráveis de arquivos.

## Módulos E Recursos

- `AppModule` compõe infraestrutura; `CoreModule` registra os módulos de negócio e aplica `DomainMiddleware` e `AuditContextMiddleware` às rotas, com exclusões explícitas para setup, health e webhook Stripe.
- Um recurso normalmente possui `*.module.ts`, controller, DTOs, serviço e repositório. Módulos declaram imports, providers e exports de maneira explícita.
- Controllers recebem HTTP, DTOs e contexto autenticado. Serviços coordenam autorização, transações, eventos, filas, storage e colaboração. Repositórios encapsulam consultas Kysely. Alguns controllers também usam repositórios e serviços de acesso diretamente quando o caso requer leitura/autorização específica.
- Registre um novo módulo de negócio em `apps/server/src/core/core.module.ts`; registre infraestrutura de aplicação em `apps/server/src/app.module.ts`.

## Autenticação, Workspace E Autorização

- Rotas protegidas usam `JwtAuthGuard`; `@Public()` libera exceções. Use `@AuthUser()` e `@AuthWorkspace()` para obter o ator e o workspace, em vez de ler o request manualmente.
- `DomainMiddleware` define `workspaceId` e `workspace` no request: self-hosted usa o primeiro workspace; cloud resolve pelo subdomínio. O pre-handler em `main.ts` rejeita rotas de API sem workspace, salvo rotas explicitamente excluídas.
- Autorização de domínio usa CASL e serviços de acesso, especialmente para páginas e spaces. Retorne exceções Nest adequadas (`BadRequestException`, `ForbiddenException`, `NotFoundException`) em vez de formatos de erro próprios.
- Login usa cookie HTTP-only `authToken`; o cliente envia credenciais em todas as chamadas API.

## Dados E Integrações

- `DatabaseModule` é global e fornece repositórios Kysely. Serviços podem injetar um repositório ou `KyselyDB` com `@InjectKysely()` para transações coordenadas.
- Repositórios concentram consultas tipadas, paginação e escrita; serviços concentram regras de negócio e efeitos externos. Preserve essa separação ao criar código novo.
- `src/integrations` contém as fronteiras de infraestrutura. Não acople recursos de `core` diretamente a detalhes de storage, mail, Redis ou filas quando já existir um módulo de integração.
- `src/ee` é carregado dinamicamente por `AppModule`; em `CLOUD=true`, a ausência de `EeModule` encerra a aplicação. Não torne imports de EE obrigatórios sem preservar esse comportamento.
- O MCP é um módulo EE com contrato JSON-RPC e autorização própria; leia `docs/ai-context/mcp.md` antes de modificá-lo.
