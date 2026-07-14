#!/usr/bin/env bash
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/docmost}"
APP_DOMAIN="${APP_DOMAIN:-wiki.cledson.com.br}"
APP_PORT="${APP_PORT:-3000}"
WEB_IMAGE="${WEB_IMAGE:?WEB_IMAGE é obrigatório}"
GHCR_USER="${GHCR_USER:-}"
GHCR_TOKEN="${GHCR_TOKEN:-}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
PORT_SCAN_LIMIT="${PORT_SCAN_LIMIT:-20}"
HEALTHCHECK_ATTEMPTS="${HEALTHCHECK_ATTEMPTS:-18}"
HEALTHCHECK_SLEEP_SECONDS="${HEALTHCHECK_SLEEP_SECONDS:-5}"
APT_UPDATED=0

log() { printf '[deploy] %s\n' "$1"; }

sudo_run() {
  if [ "$(id -u)" -eq 0 ]; then "$@"; else sudo "$@"; fi
}

ensure_apt_updated() {
  if [ "${APT_UPDATED}" -eq 0 ]; then
    sudo_run apt-get update
    APT_UPDATED=1
  fi
}

ensure_package() {
  local package="$1"
  if ! dpkg -s "${package}" >/dev/null 2>&1; then
    ensure_apt_updated
    sudo_run apt-get install -y "${package}"
  fi
}

ensure_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    sudo_run systemctl enable --now docker
    return
  fi

  ensure_package ca-certificates
  ensure_package curl
  ensure_package gnupg
  sudo_run install -m 0755 -d /etc/apt/keyrings
  if [ ! -f /etc/apt/keyrings/docker.asc ]; then
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo_run tee /etc/apt/keyrings/docker.asc >/dev/null
    sudo_run chmod a+r /etc/apt/keyrings/docker.asc
  fi
  if [ ! -f /etc/apt/sources.list.d/docker.list ]; then
    . /etc/os-release
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" | sudo_run tee /etc/apt/sources.list.d/docker.list >/dev/null
  fi
  APT_UPDATED=0
  ensure_apt_updated
  sudo_run apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo_run systemctl enable --now docker
}

ensure_nginx_certbot() {
  ensure_package nginx
  ensure_package certbot
  ensure_package python3-certbot-nginx
  sudo_run systemctl enable --now nginx
}

compose() {
  sudo_run env WEB_IMAGE="${WEB_IMAGE}" APP_PORT="${APP_PORT}" docker compose \
    --env-file "${DEPLOY_PATH}/.env" -f "${DEPLOY_PATH}/deploy/docker-compose.vps.yml" "$@"
}

port_is_in_use() {
  sudo_run ss -ltnH "( sport = :${1} )" 2>/dev/null | grep -q .
}

port_is_current_compose() {
  local port="$1"
  local container_ids
  container_ids="$(compose ps -q docmost 2>/dev/null || true)"
  [ -n "${container_ids}" ] || return 1
  for container_id in ${container_ids}; do
    if sudo_run docker port "${container_id}" 3000/tcp 2>/dev/null | grep -q "127.0.0.1:${port}"; then
      return 0
    fi
  done
  return 1
}

select_runtime_port() {
  local candidate="${APP_PORT}"
  local maximum=$((APP_PORT + PORT_SCAN_LIMIT))
  while [ "${candidate}" -le "${maximum}" ]; do
    if ! port_is_in_use "${candidate}" || port_is_current_compose "${candidate}"; then
      APP_PORT="${candidate}"
      log "porta da aplicação: ${APP_PORT}"
      return
    fi
    candidate=$((candidate + 1))
  done
  log "nenhuma porta livre encontrada entre ${APP_PORT} e ${maximum}"
  exit 1
}

publish_nginx() {
  local template="${DEPLOY_PATH}/deploy/nginx/reverse-proxy-http.conf"
  sudo_run sed -e "s|__APP_DOMAIN__|${APP_DOMAIN}|g" -e "s|__APP_PORT__|${APP_PORT}|g" "${template}" \
    | sudo_run tee "/etc/nginx/sites-available/${APP_DOMAIN}.conf" >/dev/null
  sudo_run ln -sf "/etc/nginx/sites-available/${APP_DOMAIN}.conf" "/etc/nginx/sites-enabled/${APP_DOMAIN}.conf"
  sudo_run nginx -t
  sudo_run systemctl reload nginx
}

issue_certificate_if_needed() {
  if [ -f "/etc/letsencrypt/live/${APP_DOMAIN}/fullchain.pem" ]; then
    log "certificado existente para ${APP_DOMAIN}"
    return
  fi

  log "solicitando certificado TLS para ${APP_DOMAIN}"
  if [ -n "${CERTBOT_EMAIL}" ]; then
    sudo_run certbot --nginx -d "${APP_DOMAIN}" --redirect --email "${CERTBOT_EMAIL}" --agree-tos --non-interactive --keep-until-expiring
  else
    sudo_run certbot --nginx -d "${APP_DOMAIN}" --redirect --register-unsafely-without-email --agree-tos --non-interactive --keep-until-expiring
  fi
}

healthcheck() {
  local attempt=1
  until curl --fail --silent --show-error "http://127.0.0.1:${APP_PORT}/api/health/live" >/dev/null; do
    if [ "${attempt}" -ge "${HEALTHCHECK_ATTEMPTS}" ]; then
      log "healthcheck falhou"
      compose logs --tail=100 docmost || true
      exit 1
    fi
    sleep "${HEALTHCHECK_SLEEP_SECONDS}"
    attempt=$((attempt + 1))
  done
}

sudo_run mkdir -p "${DEPLOY_PATH}"
ensure_docker
ensure_nginx_certbot
select_runtime_port
sudo_run sed -i "s/^APP_PORT=.*/APP_PORT=${APP_PORT}/" "${DEPLOY_PATH}/.env"
if [ -n "${GHCR_USER}" ] && [ -n "${GHCR_TOKEN}" ]; then
  printf '%s' "${GHCR_TOKEN}" | sudo_run docker login ghcr.io --username "${GHCR_USER}" --password-stdin
fi
compose pull
compose up -d --remove-orphans
publish_nginx
healthcheck
issue_certificate_if_needed
sudo_run systemctl enable --now certbot.timer 2>/dev/null || true
log "deploy concluído com ${WEB_IMAGE}"
