# Direct Page Editor Module Loader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep a direct-linked document visible while its collaborative editor module loads, then mount collaboration without a route navigation.

**Architecture:** Add a focused component that owns the cached dynamic import of `PageEditor`. It renders `ReadonlyPageEditor` as a content-preserving fallback and replaces it with `PageEditor` when the module resolves. `FullEditor` delegates only collaborative cases to this component.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Vite.

## Global Constraints

- Preserve page URLs, page queries, permissions, edit mode and collaboration protocol.
- Keep the heavy `PageEditor` module dynamically imported.
- Do not add dependencies.
- Propagate editor-module errors to the existing page error boundary.
- Update `docs/ai-context/frontend.md` with the independent, non-Suspense editor loader.

---

### Task 1: Add a content-preserving collaborative editor loader

**Files:**

- Create: `apps/client/src/features/editor/components/page-editor-loader.ts`
- Create: `apps/client/src/features/editor/components/collaborative-page-editor.tsx`
- Create: `apps/client/src/features/editor/components/collaborative-page-editor.spec.tsx`
- Modify: `apps/client/src/features/editor/full-editor.tsx`
- Modify: `docs/ai-context/frontend.md`

**Interfaces:**

- Consumes: `loadPageEditor(): Promise<{ default: ComponentType<PageEditorProps> }>` and `ReadonlyPageEditor` default export.
- Produces: `CollaborativePageEditor`, accepting `pageId`, `title`, `content`, `editable` and optional `canComment`.

- [x] **Step 1: Write failing loader behavior tests**

Mock only the asynchronous editor-module loader and the visual reader. Render the real `CollaborativePageEditor` with a deferred loader. Assert that the reader receives the literal document title and content before resolution, then resolve the module and assert that its collaborative editor is visible.

```tsx
expect(screen.getByTestId("readonly-page-editor")).toHaveTextContent(
  "Saved document",
);

resolvePageEditor({ default: MockPageEditor });

expect(await screen.findByTestId("collaborative-page-editor")).toBeTruthy();
```

- [x] **Step 2: Run the new test and verify RED**

Run: `pnpm --filter client test -- src/features/editor/components/collaborative-page-editor.spec.tsx`

Expected: FAIL because `CollaborativePageEditor` does not exist yet.

- [x] **Step 3: Implement cached explicit module loading**

Create `page-editor-loader.ts` with a module-level promise returned by:

```tsx
const loadPageEditor = () =>
  (pageEditorModulePromise ??= import("@/features/editor/page-editor").catch(
    (error) => {
      pageEditorModulePromise = undefined;
      throw error;
    },
  ));
```

`CollaborativePageEditor` calls the loader in `useEffect`; while it is pending render `ReadonlyPageEditor`
with `showTitle={false}`. Store the loaded default component in state with
`setPageEditor(() => module.default)`. Throw a load error so the existing page
error boundary presents its reload action.

Replace `LazyPageEditor` in `FullEditor` with the new component only in the
existing `needsCollaborativeEditor` branch.

- [x] **Step 4: Update frontend context**

Document that `FullEditor` uses an explicit component-state loader for the
collaborative editor and keeps the saved document visible during module loading.

- [x] **Step 5: Verify GREEN and compile**

Run:

```powershell
pnpm --filter client test -- src/features/editor/components/collaborative-page-editor.spec.tsx
pnpm --filter client test -- src/App.spec.tsx
pnpm --filter client build
pnpm exec prettier --check apps/client/src/features/editor/components/collaborative-page-editor.tsx apps/client/src/features/editor/components/collaborative-page-editor.spec.tsx apps/client/src/features/editor/full-editor.tsx docs/ai-context/frontend.md docs/superpowers/plans/2026-08-05-direct-page-editor-module-loader.md
git diff --check
```

- [x] **Step 6: Commit the implementation**

```powershell
git add apps/client/src/features/editor/components/page-editor-loader.ts apps/client/src/features/editor/components/collaborative-page-editor.tsx apps/client/src/features/editor/components/collaborative-page-editor.spec.tsx apps/client/src/features/editor/full-editor.tsx docs/ai-context/frontend.md docs/superpowers/plans/2026-08-05-direct-page-editor-module-loader.md
git commit -m "fix(client): load direct page editor reliably"
```
