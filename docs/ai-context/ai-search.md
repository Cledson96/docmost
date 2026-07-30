# Busca E Inteligência Artificial

## Busca De Conteúdo

- `SearchModule` oferece busca textual de páginas dentro de spaces acessíveis e aplica restrições de página quando recebe usuário/workspace. O recurso principal está em `apps/server/src/core/search`.
- O MCP também expõe busca textual, semântica e ampla; o contrato de ferramentas e suas regras estão em `mcp.md`, não em uma API REST separada.
- Busca de anexos é um módulo EE e depende da indexação de arquivos. Alterações em anexos devem avaliar também `SearchAttachmentsModule`.

## IA Generativa E Chat

- `src/ee/ai` expõe geração e streaming para ações de escrita, resumo, tradução e prompts livres. O client consome no menu do editor em `src/ee/ai/components/editor`.
- `/ai/answers` usa busca textual PostgreSQL, seleciona até cinco páginas do workspace, transmite fontes e chama o modelo de chat. Esse caminho não usa embeddings.
- `src/ee/ai-chat` mantém conversas e mensagens por usuário/workspace, transmite respostas, aceita contexto de página/menções e interpreta blocos de comando do modelo para editar título/conteúdo. Upload de chat é um stub, não um fluxo de arquivo completo.
- Providers aceitos são OpenAI, OpenRouter, OpenAI-compatible, Gemini e Ollama. Não trate IA como disponível só porque a UI está habilitada.
- A configuração de provider é resolvida por workspace em `AiSettingsService`: a tabela `workspace_ai_settings` tem precedência e cada campo nulo cai para a variável de ambiente correspondente. Admins editam em `/settings/ai/provider`; a chave é gravada cifrada (AES-256-GCM derivada de `APP_SECRET`) e a API só devolve preview mascarado.
- `AiProviderFactory` é assíncrona e exige `workspaceId`. Todo novo caminho de IA precisa carregar o workspace antes de montar o modelo.

## Embeddings

- Eventos do ciclo de vida de página enfileiram jobs na fila IA. `EmbeddingProcessor` fragmenta `textContent`, gera embeddings OpenAI e grava vetores pgvector em `page_embeddings`; remove vetores ao excluir página.
- A dimensão do schema atual é 1536. `AI_EMBEDDING_MODEL` e `AI_EMBEDDING_DIMENSION` precisam ser compatíveis com essa dimensão; mudar modelo/dimensão exige migração e reindexação.
- Embeddings resolvem credenciais separadas do chat (`embedding_api_key_encrypted`, `embedding_base_url`, `embedding_model`), porque gateways de chat como OpenRouter não têm endpoint de embeddings. Para modelos `text-embedding-3-*` o serviço envia `dimensions: 1536`, o que permite usar `text-embedding-3-large` sem alterar a coluna. Trocar o modelo pela tela enfileira reindexação do workspace.
- `EmbeddingService` oferece busca coseno com escopo de workspace/space. Fora do MCP, este checkout não expõe uma rota HTTP que consuma essa busca.
- Arquivos centrais: `apps/server/src/ee/{ai,ai-chat,embedding}` e migrations `20260714T192000-page_embeddings.ts` / `20260729T220000-page-embeddings-index.ts`.
