# Bases E Templates

## Bases

- Uma base é uma página com `is_base`; seu schema, linhas e views ficam em `base_properties`, `base_rows` e `base_views`. A migração de origem é `apps/server/src/database/migrations/20260529T125146-bases.ts`.
- `apps/server/src/ee/base` fornece CRUD de base, propriedades, linhas, views, conversão de página e exportação CSV. A rota dedicada é `/base/:pageId`; páginas também podem embutir a mesma `BaseView`.
- Bases seguem autorização de página. Sempre valide acesso à página base antes de mudar schema, linhas ou views.
- Fórmulas são implementadas em `packages/base-formula`, com entradas distintas para client e server. Um build isolado do server precisa do `dist` desse package.

## Estado Atual De Realtime

- O client espera eventos Socket.IO para bases e recalculo de fórmulas em `src/ee/base/hooks/use-base-socket.ts`.
- O bridge server tenta carregar dinamicamente `ee/base/realtime/base-ws.service`, mas esse arquivo não existe neste checkout. Não presuma que sincronização de bases por socket está funcionando ou adicione dependência obrigatória sem implementar o serviço correspondente.
- O serviço HTTP atual também retorna permissões permissivas de base; preserve verificações de acesso da página até que uma política de base própria exista.

## Templates

- `apps/server/src/ee/template` oferece listar, ler, criar, editar, excluir e aplicar templates. Aplicar template cria uma página comum via `PageService`.
- Templates podem ser globais do workspace ou limitados a space. O serviço normaliza conteúdo Tiptap em JSON/texto/Yjs e usa CASL de workspace/space para permissões.
- `workspace.settings.templates.allowMemberTemplates` controla criação/edição por membros. Essa configuração é alterada por `WorkspaceService` e deve ser considerada em toda nova ação de template.
- O client tem lista, editor, picker e preview em `apps/client/src/ee/template`; as rotas ficam em `/templates`.
