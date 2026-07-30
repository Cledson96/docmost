# MCP

## Entrada E Autenticação

- O módulo está em `apps/server/src/ee/mcp/`, é registrado por `src/ee/ee.module.ts` e usa `McpController` e `McpService`.
- `GET /mcp` e `GET /api/mcp` retornam metadados de descoberta sem autenticação. `POST` nos mesmos caminhos aceita requisições MCP e usa `JwtAuthGuard` com `@SkipTransform()` para devolver JSON-RPC sem o envelope HTTP normal.
- O guard aceita o cookie `authToken` ou `Authorization: Bearer <API_KEY>`. API keys são JWTs vinculados ao usuário e workspace que as criou; usuários desativados, chaves revogadas/expiradas e workspace divergente são rejeitados em `JwtStrategy` e `ApiKeyService`.
- O MCP executa com o usuário autenticado e o workspace resolvido pelo guard. Ferramentas devem preservar esse contexto; não aceite IDs de workspace como forma de trocar o escopo da requisição.

## Protocolo

- `McpService.handleRpcRequest()` suporta `initialize`, `notifications/initialized`, `tools/list` e `tools/call`. Não há resources, batching nem requisições iniciadas pelo servidor.
- As versões negociadas são `2024-11-05`, `2025-03-26` e `2025-06-18`. O servidor devolve a versão conhecida solicitada; para uma versão desconhecida, devolve `2025-06-18`.
- `tools/call` retorna conteúdo textual JSON para resultados. Erros de ferramenta retornam `result.isError: true`; método desconhecido usa erro JSON-RPC `-32601`.
- `getToolsList()` em `mcp.service.ts` é a fonte de verdade. A lista exibida em `apps/client/src/ee/ai/components/mcp-settings.tsx` é apenas um resumo e pode não conter todas as ferramentas.

## Recursos Expostos

- Páginas e spaces: listar, ler, criar, atualizar, mover, duplicar, restaurar, excluir, navegar por breadcrumbs/backlinks e pesquisar texto.
- Conteúdo do workspace: comentários, labels, favoritos, histórico, templates, anexos e exportação de uma página.
- Bases: criar, converter páginas, consultar e alterar schema, propriedades, linhas e views; bases são páginas e seguem a autorização da página.
- Busca avançada: busca semântica, reindexação de embeddings e busca ampla em páginas, bases, comentários e anexos.
- A lista e os schemas de cada ferramenta ficam em `getPageToolsList`, `getBaseToolsList` e `getWorkspaceToolsList`; a execução fica em `callTool`, `callWorkspaceTool` e `callBaseTool`.

## Autorização E Limites

- Operações verificam associação a space, CASL e `PageAccessService` antes de ler ou alterar conteúdo. Páginas de outro workspace são tratadas como não encontradas para não permitir enumeração de IDs.
- O acesso é limitado às permissões do usuário dono da API key, não a uma permissão especial do MCP. Não ignore verificações de serviço, CASL ou acesso à página ao acrescentar ferramentas.
- O formato padrão de conteúdo de página é Markdown; `get_page` também aceita HTML ou JSON ProseMirror. Atualizações de página recebem Markdown e usam `append` por padrão.
- Upload de anexo por MCP aceita no máximo 2 MiB de bytes antes de base64. Exports que geram ZIP, como uma página com filhos ou anexos, não podem ser devolvidos pelo MCP.

## Configuração E Interface

- O switch de workspace é `settings.ai.mcp`, alterado por `mcpEnabled` em `UpdateWorkspaceDto`. A atualização exige o recurso de licença `mcp` e é persistida por `WorkspaceRepo.updateAiSettings`.
- A tela de IA em `apps/client/src/ee/ai/components/mcp-settings.tsx` mostra a URL `${APP_URL}/mcp`, habilita/desabilita o switch e orienta o uso de uma API key.
- O controller e `McpService` não consultam `settings.ai.mcp`; atualmente o endpoint permanece disponível quando `EeModule` está carregado, condicionado à autenticação e às permissões. Se o switch precisar bloquear acesso, essa verificação deve ser implementada no caminho de requisição, não apenas na interface.

## Alterações E Testes

- Ao adicionar uma ferramenta, atualize tanto seu schema em `getToolsList()` quanto sua execução no dispatcher correto. Aplique escopo de workspace e as mesmas verificações de autorização usadas pelo recurso HTTP correspondente.
- Ao alterar compatibilidade de protocolo, preserve as três versões negociadas ou atualize testes e documentação de clientes de forma coordenada.
- Cubra o contrato com `apps/server/src/ee/mcp/mcp.service.spec.ts` e `mcp.controller.spec.ts`; execute com `pnpm --filter server test -- ee/mcp`.
