# Contexto Para Agentes

Este diretório é o contexto técnico estável do repositório. Ele complementa `AGENTS.md`; não substitui código, configuração executável ou documentação de produto.

## Leitura Seletiva

| Tarefa                                                            | Arquivos necessários                                                    |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Entender o produto, os apps ou o fluxo principal                  | `system-overview.md`                                                    |
| Alterar API, autenticação, permissões ou módulos Nest             | `backend.md`, `code-patterns.md`                                        |
| Alterar login, sessão, API keys, workspace, grupos ou spaces      | `identity-access.md`, `backend.md`                                      |
| Alterar telas, rotas, estado, formulários ou chamadas HTTP        | `frontend.md`, `code-patterns.md`                                       |
| Alterar páginas, comentários, anexos, compartilhamento ou árvore  | `content-workflows.md`, `identity-access.md` quando houver permissão    |
| Alterar editor, Yjs, Socket.IO, colaboração ou histórico          | `collaboration-realtime.md`, `content-workflows.md`                     |
| Alterar schema, migração, storage, filas, colaboração ou ambiente | `data-runtime.md`, `backend.md` quando aplicável                        |
| Alterar storage, e-mail, importação, exportação, jobs ou saúde    | `integrations-jobs.md`, `data-runtime.md`                               |
| Alterar ferramentas, autenticação ou configuração MCP             | `mcp.md`, `backend.md`                                                  |
| Alterar IA, busca, embeddings ou chat                             | `ai-search.md`, `mcp.md` quando aplicável                               |
| Alterar bases ou templates                                        | `bases-templates.md`, `identity-access.md`                              |
| Alterar SSO, SCIM, MFA, billing ou verificações                   | `enterprise-security.md`, `identity-access.md`                          |
| Criar ou alterar testes, build, lint, Docker ou deploy            | `verification-operations.md`                                            |
| Implementar uma mudança que cruza camadas                         | Comece por `system-overview.md` e leia os arquivos das camadas afetadas |

## Manutenção Obrigatória

- Toda alteração deve avaliar se modificou comportamento, arquitetura, limite de módulo, comando, configuração ou padrão recorrente.
- Quando modificar algum desses itens, atualize o arquivo temático correspondente neste mesmo trabalho e cite a atualização na resposta final.
- Não atualize o contexto para correções internas que não alterem esses contratos; declare que a avaliação foi feita na resposta final.
- Prefira fatos verificáveis e caminhos de código. Não copie grandes blocos de código, listas completas de endpoints ou planos temporários.

## Arquivos

- `system-overview.md`: propósito, limites, packages, pontos de entrada e fluxos.
- `backend.md`: Nest/Fastify, módulos, API, autenticação, workspace e integrações de servidor.
- `frontend.md`: React/Vite, rotas, organização, estado, HTTP e colaboração no navegador.
- `data-runtime.md`: banco, migrações, tipos gerados, ambiente e serviços de runtime.
- `identity-access.md`: autenticação, sessões, API keys, workspaces, grupos, spaces e autorização.
- `content-workflows.md`: páginas, árvore, comentários, anexos, shares, histórico e recursos de conteúdo.
- `collaboration-realtime.md`: editor Tiptap/Yjs, Hocuspocus, Socket.IO, persistência e sincronização Redis.
- `integrations-jobs.md`: filas, storage, mail, import/export, estáticos, health, segurança e telemetria.
- `ai-search.md`: busca textual, IA generativa, chat, embeddings e seus requisitos.
- `bases-templates.md`: bases, fórmulas, templates e os limites de realtime atuais.
- `enterprise-security.md`: entitlements, verificação de página, SSO, SCIM, MFA e billing, inclusive lacunas conhecidas.
- `mcp.md`: endpoint MCP, protocolo JSON-RPC, ferramentas, autorização, limites e configuração.
- `code-patterns.md`: padrões recorrentes para implementar código e testes nas duas camadas.
- `verification-operations.md`: comandos, CI, Docker, Open API e deploy.
