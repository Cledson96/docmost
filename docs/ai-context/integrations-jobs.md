# Integrações E Jobs

## Redis E BullMQ

- Redis atende cache Nest, permissões, Socket.IO, BullMQ, locks/roteamento Yjs, contribuidores, atividade de sessão, limite de e-mail e throttling.
- `QueueModule` é global. Jobs gerais têm três tentativas com backoff exponencial; `fileTask` tem uma tentativa e remove registros concluídos/falhos. As filas incluem e-mail, anexos, geral, file task, busca, IA, histórico, notificações e auditoria.
- Persistência colaborativa enfileira histórico, menções, backlinks, atualização de IA, watchers e notificações. Não mova esses efeitos para a requisição HTTP sem avaliar idempotência e atraso.

## Storage, Mail E Arquivos

- `StorageModule` escolhe driver local, S3 ou Azure. O driver local limita chaves à raiz configurada e não suporta URL assinada; mantenha esse limite de segurança em novos drivers.
- Mail usa SMTP, Postmark ou log. Templates React são renderizados antes de entrar na fila, porque elementos React não são serializáveis por BullMQ; o worker marca notificações como enviadas após entrega.
- O upload de anexos e indexação de arquivos é tratado por `AttachmentService` e filas. Veja `content-workflows.md` para regras de permissão e exposição pública.

## Importação, Exportação E Entrega Web

- Importação de arquivo único é síncrona; ZIP gera `fileTasks`, envia para storage e é processado em worker. O client consulta o status periodicamente e atualiza a árvore após sucesso.
- Exportações HTML/Markdown de página e space são respostas HTTP nativas. Elas verificam acesso, filtram descendentes/anexos inacessíveis e registram auditoria.
- Exportação PDF é assíncrona e vive em `apps/server/src/ee/pdf-export`. O fluxo é: `POST /pdf-export/page` valida `validateCanView`, cria `fileTasks` (`type=export`, `source=pdf`) e enfileira `PDF_EXPORT_TASK`; o worker chama Gotenberg (`GOTENBERG_URL`), que carrega `PDF_RENDER_BASE_URL/pdf-render/:pageId?token=` e imprime o próprio renderer do client; o PDF vai para storage e o client baixa por `POST /pdf-export/download`. Sem `GOTENBERG_URL` o recurso falha com mensagem explícita — não há fallback de Chromium embutido, de propósito, para a imagem do app não carregar um navegador.
- O token `pdf_render` é a credencial do browser headless, que não tem sessão. Ele vale 5 minutos, carrega `includeChildren` e só libera a página para a qual foi emitido. `POST /pdf-export/render` é `@Public()` por isso; qualquer mudança ali é mudança de superfície de autenticação.
- A rota client `/pdf-render/:pageId` renderiza em `printMode` e marca `data-pdf-ready="true"` quando terminou; Gotenberg espera esse seletor via `waitForExpression`. Remover esse atributo faz o PDF sair em branco.
- PDFs gerados são descartáveis: `@Interval` enfileira `PDF_EXPORT_CLEANUP` a cada 6h e apaga arquivo e linha depois de 24h.
- `StaticModule` só serve a SPA se `apps/client/dist` existir. Na inicialização ele injeta configuração runtime em `index.html`, cria template quando necessário e fornece fallback SPA sem cache. O diretório de build precisa ser gravável no runtime.

## Segurança, Saúde E Observabilidade

- Throttling Redis define limites específicos de auth e AI chat; não presuma que todo endpoint é limitado globalmente. Frame protection ignora anexos e shares públicos para preservar seus contratos próprios.
- `/api/health` verifica PostgreSQL e Redis; `/api/health/live` é liveness simples. Use o primeiro para readiness de dependências.
- Telemetria de self-hosted em produção envia contagens agregadas diárias, identificadas por HMAC de workspace, e respeita opt-out/cloud/non-production. A abstração de auditoria presente neste código é no-op, embora serviços a chamem e o middleware preencha contexto CLS.
- Fontes principais: `apps/server/src/integrations/{queue,storage,mail,import,export,static,health,telemetry,throttle}`.
