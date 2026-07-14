# Docmost VPS Deploy Implementation Plan

**Goal:** Publicar o Docmost em `wiki.cledson.com.br` na VPS `167.86.117.142` com deploy automático a cada push em `main`.

**Architecture:** GitHub Actions valida o monorepo, cria uma imagem Docker multi-stage e publica uma tag imutável no GHCR. O job de deploy envia apenas a infraestrutura e o ambiente, e a VPS faz pull da imagem, executa Docker Compose em `/opt/docmost`, configura nginx em loopback e solicita TLS ao Certbot quando necessário.

**Tech Stack:** GitHub Actions, GHCR, Docker Compose, PostgreSQL, Redis, nginx, Certbot, SSH.

---

### Task 1: Infraestrutura de produção

**Files:**
- Create: `deploy/docker-compose.vps.yml`
- Create: `deploy/nginx/reverse-proxy-http.conf`
- Create: `scripts/deploy-docker.sh`

- [x] Adaptar o Compose existente para imagem GHCR, porta loopback, volumes persistentes e healthchecks.
- [x] Criar script idempotente para instalar Docker/nginx/certbot, selecionar porta, fazer pull, subir serviços e validar saúde.
- [x] Criar template nginx com suporte a WebSocket e proxy para o Docmost.

### Task 2: Workflow automático

**Files:**
- Create: `.github/workflows/deploy.yml`

- [x] Criar jobs `ci`, `build-push` e `deploy` com execução em push para `main`, `workflow_dispatch`, concorrência e environment `production`.
- [x] Publicar `ghcr.io/cledson96/docmost:${GITHUB_SHA}` e `latest`.
- [x] Gerar os arquivos de ambiente no runner usando GitHub Secrets/Variables, enviar somente a infraestrutura à VPS e executar o script remoto.

### Task 3: Verificação

**Files:**
- Modify: `docker-compose.yml` somente se a validação demonstrar incompatibilidade com o modelo de produção.

- [x] Validar Compose, shell, formatação e build Docker localmente.
- [x] Testar SSH/DNS; SSH requer uma chave configurada e o DNS ainda não resolve.
- [ ] Executar deploy e confirmar `https://wiki.cledson.com.br` e o estado dos containers.

### Secrets e Variables do GitHub

Secrets do environment `production`: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `APP_SECRET`, `POSTGRES_PASSWORD`, `CERTBOT_EMAIL`; `GHCR_PULL_TOKEN` somente se o pacote GHCR for privado.

Variables do environment `production`: `DEPLOY_PATH=/opt/docmost`, `APP_DOMAIN=wiki.cledson.com.br`, `APP_PORT=3000`, `APP_URL=https://wiki.cledson.com.br`.
