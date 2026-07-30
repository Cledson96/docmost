# Conteúdo E Fluxos De Página

## Páginas E Árvore

- A página é a unidade central do produto: pertence a um space, pode ter pai, histórico, comentários, anexos, labels, favoritos, watchers e share público. Backend: `src/core/page`; client: `src/features/page` e `src/pages/page/page.tsx`.
- Metadados e operações estruturais usam endpoints de página e `PageService`; conteúdo vivo é persistido pelo fluxo Yjs, descrito em `collaboration-realtime.md`. Não trate `POST /pages/update` como a fonte de verdade de todo conteúdo editado.
- A árvore do client combina cache React Query com estado Jotai em `features/page/tree`. Mutações atualizam a árvore localmente, chamam REST e emitem evento Socket.IO; uma mudança de árvore precisa manter os três passos consistentes.
- `PageAccessService` protege conteúdo e árvores com restrição herdada. Listas e shares precisam filtrar descendentes inacessíveis, não apenas verificar a página raiz.

## Comentários, Histórico E Watchers

- `CommentService` valida acesso à página, persiste conteúdo JSON, pode marcar seleção Yjs e enfileira notificações para menções/watchers. O client está em `src/features/comment`.
- O histórico é produzido após persistência do editor por um job atrasado, não por um CRUD síncrono. `HistoryProcessor` só cria snapshot quando o conteúdo mudou, acumula contribuidores e agenda backlinks/notificações.
- Restaurar histórico no client substitui título/conteúdo no editor vivo; a persistência Yjs produz a nova revisão. Não procure ou introduza um endpoint de restore sem avaliar esse fluxo.
- Watchers representam acompanhamento/mute de página. Criação/edição de página, histórico e comentários podem adicionar watchers; remoção de acesso precisa removê-los.

## Arquivos, Importação E Exportação

- Anexos exigem acesso de edição para upload e acesso de visualização para leitura. O servidor grava no storage antes da metadata de banco e pode enfileirar indexação de PDF/DOCX.
- Respostas de arquivo suportam ranges e CSP próprio. Shares públicos usam URLs de arquivo com JWT limitado à página; não exponha a rota privada de arquivo em conteúdo compartilhado.
- Importações individuais de Markdown/HTML/DOCX/PDF são síncronas; ZIP é um `fileTask` assíncrono. Exportações de página/space são streams HTTP e devem filtrar páginas/arquivos inacessíveis.
- Os detalhes de storage, filas e `fileTasks` estão em `integrations-jobs.md`.

## Shares, Labels E Favoritos

- Shares públicos ficam em `src/core/share` e nas rotas client `/share/...`. Eles são públicos, mas recusam páginas com ancestrais restritos e removem marcas de comentário do conteúdo exposto.
- Labels usam `LabelService` e repositório dedicado; adição/remoção em página pertence ao fluxo de página. Favoritos usam `FavoriteService` e são limpos quando o acesso ao space é perdido.
- A UI ainda contém um serviço para `/labels/info`, mas o handler correspondente está comentado no controller. Não use essa chamada como contrato funcional sem restaurar ambos os lados.
