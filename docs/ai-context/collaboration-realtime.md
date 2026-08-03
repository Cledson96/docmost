# Colaboração E Tempo Real

## Dois Canais Distintos

- O editor usa Hocuspocus/Yjs em WebSocket bruto `/collab`; Socket.IO é separado e distribui eventos de árvore, página, comentários, notificações e cache. Não substitua um pelo outro.
- Documentos colaborativos são nomeados `page.<pageId>`. O client Tiptap/Yjs fica em `apps/client/src/features/editor`; a infraestrutura server fica em `apps/server/src/collaboration`.
- A conexão de colaboração usa token curto retornado por `POST /api/auth/collab-token`, não o cookie HTTP diretamente. A autenticação valida usuário, workspace, membership, restrições de página, modo leitura e usuário desabilitado.

## Persistência Yjs

- `PersistenceExtension` carrega primeiro o estado Yjs salvo; sem ele, converte o JSON da página. Ao persistir, atualiza JSON ProseMirror, texto, estado Yjs, contribuidores e último editor.
- A persistência é debounce de 10 segundos, com espera máxima de 45 segundos. Backlinks, menções, indexação de IA, watchers, notificações e histórico são efeitos posteriores, frequentemente enfileirados.
- O estado em IndexedDB do client melhora uso offline/local, mas não substitui autorização ou o estado do servidor.

## Escala E Eventos

- Com Redis habilitado, a instância dona de um documento trata mensagens Yjs e outras instâncias usam o proxy/lock Redis em `extensions/redis-sync`. Preserve esse protocolo ao alterar eventos colaborativos.
- `COLLAB_DISABLE_REDIS` permite conexão direta, mas eventos Yjs customizados passam pelo Redis. No modo sem Redis, ações como marcação inline de comentário podem não ter efeito; trate esse modo ao alterar comentários/editor.
- Socket.IO autentica pelo cookie e exige uma `user_session` ativa que corresponda ao usuário e workspace do JWT antes de colocar conexões em salas de usuário, workspace e spaces autorizados. `WsService` refaz filtragem por usuário ao transmitir mudanças de árvore de páginas restritas.
- O emissor exclui somente o socket originador, não todas as abas do usuário, para manter múltiplas abas sincronizadas. A presença de páginas restritas é cacheada por 30 segundos e precisa ser invalidada quando permissões/restrições mudam.
