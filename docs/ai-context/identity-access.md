# Identidade E Acesso

## Workspace E Domínio

- `DomainMiddleware` resolve o workspace antes das rotas de `CoreModule`: em self-hosted usa o primeiro workspace; em cloud usa o subdomínio do host. O ID e o objeto do workspace são gravados no request.
- O pre-handler em `apps/server/src/main.ts` rejeita API sem workspace, exceto setup, health, webhooks e rotas de bootstrap explicitamente listadas. Não implemente resolução de workspace em controllers.
- Workspaces, usuários, grupos e spaces vivem em `src/core`; os repositórios correspondentes estão em `src/database/repos`. A tela mantém o usuário/workspace atual em `src/features/user/user-provider.tsx` e Jotai.

## Login, Sessões E API Keys

- `JwtStrategy` aceita cookie HTTP-only `authToken` ou bearer token. O JWT precisa conter o mesmo workspace resolvido pelo domínio, um usuário ativo e, para acesso normal, uma sessão ainda ativa.
- Login cria `user_sessions`, assina JWT com a sessão e grava o cookie. Logout revoga a sessão atual e remove o cookie. O usuário pode listar/revogar sessões, mas não revogar a sessão atual pelo endpoint de revogação.
- API keys são JWTs gerados por `ApiKeyService`, vinculados a usuário e workspace. Sua validação verifica chave ativa, dono, usuário não desabilitado e workspace; use as permissões do dono, nunca uma permissão especial da chave.
- A implementação está em `apps/server/src/core/auth/`, `core/session/` e `core/api-key/`; telas de login ficam em `apps/client/src/pages/auth/` e recursos de conta em `src/features/user` e `src/features/session`.

## Papéis E Permissões

- Controllers protegidos usam `JwtAuthGuard`, `@AuthUser()` e `@AuthWorkspace()`. Exceções públicas usam `@Public()`.
- CASL separa permissões de workspace e space. Para conteúdo de páginas, `PageAccessService` combina associação ao space com restrições de página herdadas: o usuário precisa acessar todos os ancestrais restritos e o ancestral restrito mais próximo determina acesso de escrita.
- A mesma regra de página deve valer para HTTP, colaboração, listagens, notificações e eventos Socket.IO. Use os serviços de acesso existentes, não apenas uma consulta de membro do space.
- Atualizações de grupos e membership removem transacionalmente favoritos e watchers que perderam acesso. Preserve essa limpeza quando criar novos vínculos de acesso.

## Recursos De Organização

- `WorkspaceModule`, `UserModule`, `GroupModule` e `SpaceModule` fornecem configuração, membros, convites e papéis. O client correspondente fica em `src/features/workspace`, `group`, `space` e nas páginas de settings.
- Spaces contêm páginas e membros. Fluxos de criação, membership e ações no space usam `SpaceService`, `SpaceMemberService` e `SpaceAbilityFactory`.
- Convites e mudanças de workspace podem acionar efeitos assíncronos, como sincronização de billing; leia `integrations-jobs.md` quando alterar esses fluxos.
