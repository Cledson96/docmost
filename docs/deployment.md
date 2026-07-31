# Deploy de produção

O deploy de produção é feito pelo GitHub Actions a cada push na branch `main` e pode ser executado manualmente em **Actions → Deploy production → Run workflow**.

## GitHub Environment

Crie o environment `production` no repositório e configure:

Secrets:

- `VPS_HOST=167.86.117.142`
- `VPS_USER=root`
- `VPS_SSH_KEY`: chave privada SSH autorizada para o usuário `root`
- `APP_SECRET`: segredo aleatório com pelo menos 32 caracteres
- `POSTGRES_PASSWORD`: senha do banco
- `CERTBOT_EMAIL`: e-mail para avisos do Let’s Encrypt
- `GHCR_PULL_TOKEN`: token clássico com `read:packages`, caso o pacote GHCR seja privado

Variables:

- `DEPLOY_PATH=/opt/docmost`
- `APP_DOMAIN=wiki.cledson.com.br`
- `APP_PORT=3000`
- `APP_URL=https://wiki.cledson.com.br`

O workflow publica `ghcr.io/cledson96/docmost:<SHA>` e a VPS apenas faz pull dessa imagem. Os dados persistem nos volumes Docker `docmost`, `db_data` e `redis_data`.

Antes do primeiro deploy, crie um registro DNS A para `wiki.cledson.com.br` apontando para `167.86.117.142` e libere as portas TCP 80, 443 e 22 no firewall da VPS. O nginx publica o app em loopback e o Certbot configura HTTPS após o DNS estar propagado.

## Rede de segurança do deploy

- Antes de subir a nova imagem (cujo boot aplica migrations pendentes), o script gera um dump `pre-deploy-<stamp>.sql.gz` em `<DEPLOY_PATH>/backups`. Se o dump falhar, o deploy é abortado antes de qualquer migration. Os 5 dumps pré-deploy mais recentes são mantidos.
- Se o healthcheck da nova imagem falhar, o script tenta voltar automaticamente à imagem que estava rodando antes e ainda encerra com erro, para o workflow acusar a falha.
- Para rollback manual, execute novamente o workflow usando um commit anterior ou publique novamente a tag SHA anterior no mesmo environment. Rollback reverte o código, não o schema; para reverter dados, restaure o dump pré-deploy correspondente.
