# Verificação E Operação

## Desenvolvimento E Verificação

- Use Node 22 e pnpm 10.4.0. Instale com `pnpm install --frozen-lockfile`.
- `pnpm dev` inicia Vite e o servidor Nest juntos. Para trabalho isolado, use scripts filtrados, por exemplo `pnpm --filter client build` ou `pnpm --filter server test -- <teste>`.
- Cliente: `pnpm --filter client lint`, `pnpm --filter client test -- <teste>` e `pnpm --filter client build`. O build executa `tsc` antes do Vite.
- Servidor: `pnpm --filter server test -- <teste>`, `pnpm --filter server test:e2e` e `pnpm --filter server build`. Unit tests usam `src/**/*.spec.ts`; E2E usam `test/*.e2e-spec.ts`.
- `pnpm --filter server lint` executa ESLint com `--fix` e modifica arquivos. O lint do client não corrige automaticamente.
- `pnpm build` executa o build completo Nx com dependências na ordem correta. O CI de `main` só instala com lockfile congelado e roda esse comando.

## Dependências E Banco

- Antes de um build isolado do server, gere `packages/base-formula/dist` com `pnpm --filter @docmost/base-formula build` se ele ainda não existir.
- Para banco novo ou após migration, execute `pnpm --filter server migration:up`; o dev server não aplica migrations sozinho.
- Os verificadores de Open API em `scripts/verify-open-api-*.mjs` exigem `DOCMOST_API_URL` e `DOCMOST_API_KEY`; alguns fluxos de membros também exigem `DOCMOST_SECOND_USER_ID`. Eles criam e removem dados temporários. Nunca use ou registre uma chave real.

## Docker E Deploy

- `Dockerfile` é a fonte do artefato publicado: instala pnpm 10.4.0, executa instalação congelada e `pnpm build`, e copia os `dist` necessários para a imagem final.
- Push em `main` dispara `.github/workflows/deploy.yml`: valida `pnpm build`, publica uma imagem GHCR e atualiza a VPS. Consulte `docs/deployment.md` antes de modificar deploy, variáveis ou volumes.
- A inicialização de produção aplica migrations pendentes. Não dependa disso para desenvolvimento local ou para validar uma migration antes do deploy.
