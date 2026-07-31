# Recursos Enterprise E Segurança

## Entitlements

- Módulos EE são carregados por `EeModule`. O client obtém entitlements em `POST /workspace/entitlements` e usa `useHasFeature` para mostrar recursos.
- As chaves de recurso são definidas em `apps/server/src/common/features.ts`, incluindo bases, IA, templates, verificação de página, SSO, SCIM, MFA e configurações de segurança.
- `LicenseCheckService` deste checkout retorna todos os recursos e `enterprise`; os gates de client são estruturais de UI, não uma barreira efetiva de licença. Não use isso como base para uma decisão de segurança de servidor.

## Verificação De Página

- UI, migrations e endpoints de verificação existem em `src/ee/page-verification` e `src/ee/page-verification` do client. O schema suporta status, vencimento, aprovadores e notificações.
- Neste checkout, apenas a leitura de informação de verificação acessa dados; mutações retornam sucesso e listagem retorna vazia. Trate o workflow como incompleto até que o serviço implemente as operações.

## SSO, SCIM E MFA

- Client e schema existem para SAML, OIDC, Google, LDAP, SCIM e MFA. Workspace pode exigir SSO/MFA; login/senha respeita `enforceSso` e fluxos de convite/reset respeitam `enforceMfa`.
- Não há controller/provider SSO, rota SCIM ou serviço MFA correspondente sob `apps/server/src` neste checkout. Não anuncie essas integrações como operacionais apenas por haver UI e migration.
- SCIM armazena tokens com hash, IDs externos e grupos externos. A UI limita tokens e documenta precedência de sync de grupos, mas isso não substitui uma implementação de protocolo no server.

## Autorização E Rate Limiting Em IA

- O REST de bases, a busca de anexos, `/ai/answers`, as páginas mencionadas e de contexto do chat de IA e os dois caminhos de recuperação de contexto (busca semântica e o fallback textual) aplicam escopo de space e de página: cada resultado passa por verificação de associação a space e/ou `PageAccessService`/`PagePermissionRepo` antes de alcançar o autor da requisição ou o prompt do modelo. Não trate mais nenhum desses caminhos como retornando dados sem checar permissão do usuário.
- Os endpoints de IA, MCP e exportação de PDF têm rate limiting por usuário. Ao adicionar um novo endpoint nessas áreas, aplique o mesmo guard de throttling em vez de presumir que ele já está coberto globalmente.

## Billing E Cloud

- UI de billing cloud usa Stripe e dados de customer/subscription/plan/trial no banco. Criação de workspace cloud cria plano/trial e convites podem enfileirar sincronização de assentos.
- O webhook Stripe é excluído de middleware de domínio/auditoria, mas não há controller Stripe, serviço de billing ou consumidor da fila de billing no server deste checkout. Considere billing incompleto até esses componentes existirem.
- Variáveis Stripe, trial e opções cloud ficam em `EnvironmentService`; configuração de domínio/subdomínio e `CLOUD` também afetam autenticação e resolução de workspace.
