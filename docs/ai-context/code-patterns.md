# Padrões De Código

## Servidor

- Modele entradas HTTP como DTOs com validação declarativa. Controllers devem manter rotas, status, guards e extração de contexto; regras de negócio pertencem a serviços.
- Para endpoints autenticados, use `JwtAuthGuard`, `@AuthUser()` e `@AuthWorkspace()`; para exceções públicas, use `@Public()`. Não replique a leitura de workspace do middleware.
- Use exceções Nest para falhas de domínio. Não retorne objetos de erro ad hoc, pois o cliente e os filtros Nest já tratam respostas HTTP.
- Coloque consultas Kysely e paginação em repositórios. Serviços coordenam múltiplos repositórios e efeitos externos; use transação quando uma operação precisar ser atômica.
- Adicione módulo, controller, provider e export apenas onde houver uma dependência explícita. Registre módulos de core em `CoreModule` e infraestrutura em `AppModule`.

## Cliente

- Para um recurso com API, comece por `features/<domínio>/types`, `services` e `queries`; componentes consomem os hooks em vez de chamar Axios diretamente.
- Serviços devolvem dados tipados e deixam query keys, invalidação, estado de mutação e notificações para os hooks TanStack Query.
- Defina query keys estáveis e atualize/invalide todos os caches afetados por mutações. Páginas podem ser cacheadas por `id` e `slugId`; preserve os dois quando alterar esse fluxo.
- Use Jotai para estado de interface ou sincronização local. Para updates colaborativos, verifique os hooks de WebSocket e a atualização do cache, além da chamada REST.
- Reutilize componentes Mantine e traduções existentes. Não introduza texto visível sem i18n quando a área já usa `useTranslation`.

## Imports, Estilo E Testes

- O client usa `@/`; o servidor usa `@docmost/db/*`, `@docmost/transactional/*` e `@docmost/ee/*` para seus aliases. Mantenha o estilo de importação do diretório alterado.
- Não há padrão único de aspas no client. Não faça alterações puramente cosméticas em arquivos não relacionados.
- Testes unitários do servidor ficam junto ao código como `*.spec.ts`; use mocks tipados e valide delegação, exceções e efeitos observáveis. E2E usam configuração Jest separada e Supertest.
- Testes do client usam Vitest/jsdom. Para lógica pura, prefira fixtures pequenas e casos de borda; faça mock de dependências externas com `vi.mock` quando necessário.
