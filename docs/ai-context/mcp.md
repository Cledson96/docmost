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
- `get_content_capabilities` é uma ferramenta MCP estável e sem argumentos para descobrir os blocos e marks ricos suportados. Ela retorna `{ capabilities }` a partir de `core/rich-content/rich-content-capabilities.ts`, em um snapshot serializável; `RichContentCapabilitiesService` apenas acrescenta ao atributo `embed.provider` os IDs atuais de `embedProviders` em `packages/editor-ext`.
- `apps/server/src/core/rich-content/rich-content-capabilities.ts` mantém o contrato compartilhado para futura descoberta de conteúdo rico pelo MCP: ele lista as capacidades públicas do schema TipTap, exclui o mark interno `comment` e expõe a sintaxe Agent Markdown de cada tipo. A classificação `standard`, `block-directive` e `inline-directive` é definida em `packages/editor-ext/src/lib/markdown/agent-markdown-syntax.ts`, também usada pelo codec reversível do editor.

## Recursos Expostos

- Páginas e spaces: listar, ler, criar, atualizar, mover, duplicar, restaurar, excluir, navegar por breadcrumbs/backlinks e pesquisar texto.
- Conteúdo do workspace: comentários, labels, favoritos, histórico, templates, anexos e exportação de uma página.
- Bases: criar, converter páginas, consultar e alterar schema, propriedades, linhas e views; bases são páginas e seguem a autorização da página.
- Busca avançada: busca semântica, reindexação de embeddings e busca ampla em páginas, bases, comentários e anexos.
- A lista e os schemas de cada ferramenta ficam em `getToolsList`, `getPageToolsList`, `getBaseToolsList` e `getWorkspaceToolsList`; a execução fica em `callTool`, `callWorkspaceTool` e `callBaseTool`.

## Autorização E Limites

- Operações verificam associação a space, CASL e `PageAccessService` antes de ler ou alterar conteúdo. Páginas de outro workspace são tratadas como não encontradas para não permitir enumeração de IDs.
- O acesso é limitado às permissões do usuário dono da API key, não a uma permissão especial do MCP. Não ignore verificações de serviço, CASL ou acesso à página ao acrescentar ferramentas.
- `get_comment` valida acesso à página do comentário antes de devolvê-lo, seguindo o mesmo padrão das demais ferramentas de página.
- O endpoint MCP tem rate limiting por usuário; não presuma que uma nova ferramenta ou rota fica de fora desse limite.
- O formato padrão de conteúdo de página é Markdown; `get_page` também aceita HTML ou JSON ProseMirror. Atualizações de página recebem Markdown e usam `append` por padrão.
- Após autorizar a leitura, `get_page` obtém o snapshot atual via `CollaborationGateway.handleYjsEvent('getPageSnapshot', 'page.' + pageId, { user })`. A resposta inclui a revisão e blocos estruturados de `ee/mcp/rich-content/content-reader.service.ts`; o Markdown usa o codec Agent Markdown do snapshot, enquanto HTML e JSON preservam a renderização do conteúdo persistido.
- Cada bloco MCP corresponde a um nó público registrado do schema TipTap (inclusive nós inline), em ordem de documento. Ele mantém o `id` persistido quando houver; conteúdo legado recebe o locator somente de leitura `legacy:<revision>:<path>`, sem a atribuição de IDs. Estruturas internas, como `doc`, `text` e `listItem`, não são blocos próprios.
- Os blocos dinâmicos de `get_page` são resolvidos por usuário: `subpages` usa `PageService.getSidebarPages` (e portanto a mesma ordem `position`/`id` e filtro de acesso da sidebar), `base` exige leitura da página-base e devolve somente `BaseService.getBaseInfo`, e `transclusionReference` usa `TransclusionService.lookup`. Uma falha de um bloco devolve `{ code: 'DYNAMIC_RESOLUTION_FAILED', type, message }` naquele bloco, sem falhar a página inteira; listas aninhadas são limitadas a profundidade 5 e até 100 itens por nível.
- `list_child_pages` requer `parentPageId`, valida a leitura do pai e devolve filhos pelo mesmo caminho da sidebar. Aceita `cursor`, `limit` (1–100) e `depth` (1–5); filhos inacessíveis nunca entram na resposta.
- Upload de anexo por MCP aceita no máximo 2 MiB de bytes antes de base64. Exports que geram ZIP, como uma página com filhos ou anexos, não podem ser devolvidos pelo MCP.

## Configuração E Interface

- O switch de workspace é `settings.ai.mcp`, alterado por `mcpEnabled` em `UpdateWorkspaceDto`. A atualização exige o recurso de licença `mcp` e é persistida por `WorkspaceRepo.updateAiSettings`.
- A tela de IA em `apps/client/src/ee/ai/components/mcp-settings.tsx` mostra a URL `${APP_URL}/mcp`, habilita/desabilita o switch e orienta o uso de uma API key.
- `POST /mcp` verifica `workspace.settings.ai.mcp` no controller e responde 403 (`ForbiddenException`) quando o switch está desligado ou nunca foi definido. O `GET /mcp` informativo permanece público e não consulta o switch.

## Alterações E Testes

- Ao adicionar uma ferramenta, atualize tanto seu schema em `getToolsList()` quanto sua execução no dispatcher correto. Aplique escopo de workspace e as mesmas verificações de autorização usadas pelo recurso HTTP correspondente.
- Ao alterar compatibilidade de protocolo, preserve as três versões negociadas ou atualize testes e documentação de clientes de forma coordenada.
- Cubra o contrato com `apps/server/src/ee/mcp/mcp.service.spec.ts` e `mcp.controller.spec.ts`; execute com `pnpm --filter server test -- ee/mcp`.
