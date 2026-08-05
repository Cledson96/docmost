# Frontend

## Inicialização E Rotas

- `apps/client/src/main.tsx` é a entrada. Ele instala `BrowserRouter`, Mantine, modais, notificações, React Query, Helmet, PostHog e i18n antes de renderizar `App`.
- `apps/client/src/App.tsx` é o mapa de rotas. Páginas ficam em `src/pages`; layouts globais e de compartilhamento agrupam rotas privadas e públicas. As páginas de rota usam `React.lazy` com uma única fronteira compartilhada de `Suspense`; layouts e a infraestrutura de roteamento permanecem eager.
- Os módulos de rota de workspace e páginas compartilhadas mantêm eager o comportamento de query, erro e metadados, mas adiam `FullEditor`, o histórico da página e `ReadonlyPageEditor` até que os dados resolvidos exijam a renderização do conteúdo. Dentro de `FullEditor`, `PageEditor` (Yjs/Hocuspocus) só é carregado para edição ou comentários inline, que exigem seleções relativas Yjs; leitores sem essas permissões usam `ReadonlyPageEditor` sem conexão de colaboração. Falhas de chunks lazy se recuperam com ações de recarregamento.
- `pages/page/page.tsx` sempre mostra um estado de carregamento enquanto a página ou seu space estão sendo resolvidos; uma falha do space mostra uma ação de nova tentativa em vez de retornar uma rota vazia.
- O alias `@/` aponta para `apps/client/src` em TypeScript, Vite e Vitest. Use-o para imports dentro do app, seguindo os caminhos já adotados pela área modificada.

## Organização Por Feature

- Código reutilizável do domínio fica em `src/features/<domínio>/`, normalmente dividido em `types`, `services`, `queries`, `components` e, quando necessário, `hooks`, `atoms`, `utils` ou subfeatures.
- Páginas compõem features e layouts; não concentre regras de acesso HTTP ou cache em componentes de página quando a feature já tiver camada de serviço/query.
- `src/ee` contém telas e recursos condicionais de cloud/licença. Os flags de ambiente são acessados por `src/lib/config.ts`.

## HTTP, Cache E Estado

- `src/lib/api-client.ts` cria Axios com `baseURL: "/api"` e `withCredentials: true`. O interceptor desembrulha o envelope do servidor; endpoints de exportação preservam a resposta para acessar headers e blobs.
- Serviços são funções tipadas e pequenas que chamam `api`, em geral com endpoints `POST` por ação, e devolvem `req.data`. Para upload, use `FormData` e `multipart/form-data` como nos serviços de página/anexos.
- Hooks em `queries/` são responsáveis por query keys, `enabled`, paginação por cursor, invalidação/atualização de cache e feedback de mutações. `queryClient` é exportado por `src/main.tsx`.
- Os defaults globais do React Query não tentam novamente requisições, não refazem query no foco/mount e usam `staleTime` de cinco minutos. Só sobrescreva esses valores com motivo específico.
- Jotai atende estado local compartilhado, como árvore e socket. Não use o cache do React Query como substituto de estado de interação local.

## Interface E Idioma

- A biblioteca visual é Mantine, com tema em `src/theme.ts`; use seus providers, modais e notificações existentes.
- Formulários normalmente usam Mantine Form, schemas Zod e `mantine-form-zod-resolver`.
- Textos visíveis devem passar por `useTranslation`/i18next, conforme os componentes próximos. Erros de mutação costumam aparecer via `notifications.show`.
- `src/features/websocket` conecta atualizações em tempo real ao cache/estado do client. Mudanças em árvore, páginas ou colaboração precisam avaliar também o fluxo de evento, não apenas a requisição HTTP.
