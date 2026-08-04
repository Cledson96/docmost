# Colaboração E Tempo Real

## Dois Canais Distintos

- O editor usa Hocuspocus/Yjs em WebSocket bruto `/collab`; Socket.IO é separado e distribui eventos de árvore, página, comentários, notificações e cache. Não substitua um pelo outro.
- Documentos colaborativos são nomeados `page.<pageId>`. O client Tiptap/Yjs fica em `apps/client/src/features/editor`; a infraestrutura server fica em `apps/server/src/collaboration`.
- A conexão de colaboração usa token curto retornado por `POST /api/auth/collab-token`, não o cookie HTTP diretamente. A autenticação valida usuário, workspace, membership, restrições de página, modo leitura e usuário desabilitado.

## Persistência Yjs

- `PersistenceExtension` carrega primeiro o estado Yjs salvo; sem ele, converte o JSON da página. Ao persistir, atualiza JSON ProseMirror, texto, estado Yjs, contribuidores e último editor.
- A persistência é debounce de 10 segundos, com espera máxima de 45 segundos. Backlinks, menções, indexação de IA, watchers, notificações e histórico são efeitos posteriores, frequentemente enfileirados.
- Leituras de conteúdo para integrações devem abrir o documento Yjs vivo com `CollaborationHandler.withYdocConnection`; `getPageSnapshot` retorna o JSON TipTap atual e uma revisão opaca SHA-256/base64url do state vector. O `CollaborationGateway` encaminha eventos customizados pelo Redis quando habilitado e os executa no handler local quando `COLLAB_DISABLE_REDIS` estiver ativo.
- `applyBlockOperations` é o evento de mutação estruturada em `collaboration/rich-content/block-operations.ts`. Ele preflighta todo o lote em um Y.Doc isolado, compara `expectedRevision` quando fornecida e só então aplica uma transação ao documento vivo; falhas tipadas não deixam alterações parciais. Inserções usam `prosemirrorNodeToYElement`, e mutações pontuais preservam os objetos Yjs dos irmãos não tocados.
- O estado em IndexedDB do client melhora uso offline/local, mas não substitui autorização ou o estado do servidor.
- `packages/editor-ext/src/lib/unique-id/unique-id-node-types.ts` é a fonte compartilhada dos tipos TipTap com `UniqueID` persistente, consumida por todos os editores client/read-only e pelo servidor. `agentAddressableNodeTypes` em `apps/server/src/core/rich-content/rich-content-capabilities.ts` a filtra para nós `blockAddressable`, e `apps/server/src/collaboration/collaboration.util.ts` usa esse resultado.

## Escala E Eventos

- Com Redis habilitado, a instância dona de um documento trata mensagens Yjs e outras instâncias usam o proxy/lock Redis em `extensions/redis-sync`. Preserve esse protocolo ao alterar eventos colaborativos.
- `COLLAB_DISABLE_REDIS` permite conexão direta, mas eventos Yjs customizados passam pelo Redis. No modo sem Redis, ações como marcação inline de comentário podem não ter efeito; trate esse modo ao alterar comentários/editor.
- Socket.IO autentica pelo cookie e exige uma `user_session` ativa que corresponda ao usuário e workspace do JWT antes de colocar conexões em salas de usuário, workspace e spaces autorizados. `WsService` refaz filtragem por usuário ao transmitir mudanças de árvore de páginas restritas e desconecta sockets pelo `sessionId` quando a sessão é revogada ou removida por alteração de senha. `disconnectSessions` busca os sockets uma única vez por operação; falhas de realtime são registradas e não revertem a mutação de sessão já confirmada.
- Eventos de árvore Socket.IO são emitidos somente por caminhos confiáveis do servidor. O navegador só pode enviar eventos `base:*`, que o `BaseRealtimeBridge` valida antes de encaminhar; o gateway não retransmite eventos de árvore recebidos do cliente.
- `WsService.emitTreeRefresh(spaceId, pageId)` limita refreshes associados a páginas restritas aos sockets que ainda têm acesso. Exclusões permanentes preparam esses destinatários antes de remover a página e publicam o refresh somente após o sucesso, pois a verificação de acesso não é possível depois da exclusão. A preparação e publicação são best-effort: falhas de Redis/Socket.IO são registradas e suprimidas para não reverter uma mutação persistida.
- O emissor exclui somente o socket originador, não todas as abas do usuário, para manter múltiplas abas sincronizadas. A presença de páginas restritas é cacheada por 30 segundos e precisa ser invalidada quando permissões/restrições mudam.
