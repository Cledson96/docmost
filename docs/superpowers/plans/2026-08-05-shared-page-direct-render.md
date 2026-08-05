# Shared Page Direct Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render content from a direct public-share URL without leaving the page body in a suspended loading state.

**Architecture:** Keep the route module lazy in `App`, but make `ReadonlyPageEditor` an eager dependency of `SharedPage`. Removing the nested `React.lazy`/`Suspense` boundary means the resolved share query can always render its content.

**Tech Stack:** React 19, React Router, Vitest, Testing Library, Vite.

## Global Constraints

- Preserve public-share access filtering and the existing share query.
- Do not add dependencies or alter the public URL structure.
- Keep `SharedPage`'s error boundary and reload action.
- Update `docs/ai-context/frontend.md` to describe the public-route renderer contract.

---

### Task 1: Render the shared document without a nested lazy boundary

**Files:**

- Modify: `apps/client/src/pages/share/shared-page.tsx`
- Modify: `apps/client/src/App.spec.tsx`
- Modify: `docs/ai-context/frontend.md`

**Interfaces:**

- Consumes: the existing `useSharePageQuery` result and `ReadonlyPageEditor` props (`title`, `content`, `pageId`, `shareId`).
- Produces: a shared route that displays the document immediately after query resolution.

- [x] **Step 1: Reproduce the suspended public reader in production**

Open the supplied direct public URL in a clean browser tab. Confirm that the share tree and table of contents appear, while the document area remains at the `Loading page content` status with no `ProseMirror` document after the request data has resolved.

- [x] **Step 2: Verify the existing shared-route baseline**

Run `pnpm --filter client test -- src/App.spec.tsx`.

Expected: PASS. The Vitest route test validates the regular rendered path but does not reproduce the production-only lazy-resume race.

- [x] **Step 3: Remove the nested lazy reader boundary**

Replace the local `React.lazy(() => import("@/features/editor/readonly-page-editor.tsx"))` declaration with a direct import. Render the existing `ReadonlyPageEditor` directly inside the `ErrorBoundary`; remove only the surrounding `React.Suspense` fallback. Keep the page key and all four reader props unchanged.

- [x] **Step 4: Update frontend context**

Document that public shared pages keep the reader in the route module so a resolved share query cannot remain suspended on a second lazy import.

- [x] **Step 5: Verify GREEN and compile**

Run the shared-route test, the full client suite, client build, Prettier over all changed files, and `git diff --check`.

- [x] **Step 6: Commit the implementation**

Stage `apps/client/src/pages/share/shared-page.tsx`, `apps/client/src/App.spec.tsx`, `docs/ai-context/frontend.md`, this design, and this plan; commit with `fix(client): render direct shared pages reliably`.
