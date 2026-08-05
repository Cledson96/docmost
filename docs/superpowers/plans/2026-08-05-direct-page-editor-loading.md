# Direct Page Editor Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render workspace page content reliably on a cold direct URL visit without requiring sidebar navigation.

**Architecture:** Make `FullEditor` part of the workspace page route module and isolate the optional lazy history modal behind its own `Suspense` boundary. Keep the heavy collaborative `PageEditor` lazy inside `FullEditor`, preserving the important read-mode optimization.

**Tech Stack:** React 19, React Router, React Suspense, Vitest, Testing Library, Vite, TypeScript.

## Global Constraints

- Preserve page URLs, queries, permissions, edit-mode behavior and collaboration protocol.
- Do not add dependencies.
- Keep `PageEditor` lazy inside `FullEditor`.
- Update `docs/ai-context/frontend.md` with the stable loading boundary.

---

### Task 1: Isolate optional lazy content from the workspace editor

**Files:**

- Modify: `apps/client/src/App.spec.tsx`
- Modify: `apps/client/src/pages/page/page.tsx`
- Modify: `docs/ai-context/frontend.md`

**Interfaces:**

- Consumes: `FullEditor` named export from `@/features/editor/full-editor`.
- Produces: A workspace page where `FullEditor` renders independently of `LazyHistoryModal` suspension.

- [x] **Step 1: Write the failing regression test**

Extend the hoisted mocks with a mutable suspension flag and an unresolved promise:

```tsx
const {
  usePageQueryMock,
  useGetSpaceBySlugQueryMock,
  suspendHistoryModalMock,
  pendingHistoryModalPromise,
} = vi.hoisted(() => ({
  usePageQueryMock: vi.fn(),
  useGetSpaceBySlugQueryMock: vi.fn(),
  suspendHistoryModalMock: { current: false },
  pendingHistoryModalPromise: new Promise<never>(() => undefined),
}));
```

Make the history-modal test double suspend only when requested:

```tsx
vi.mock("@/features/page-history/components/history-modal", () => ({
  default: () => {
    if (suspendHistoryModalMock.current) {
      throw pendingHistoryModalPromise;
    }

    return null;
  },
}));
```

Add a test proving optional history loading cannot hide the core editor:

```tsx
it("keeps the full editor visible while page history is suspended", async () => {
  suspendHistoryModalMock.current = true;

  render(
    <MemoryRouter initialEntries={["/s/workspace/p/workspace-page-id"]}>
      <MantineProvider>
        <HelmetProvider>
          <App />
        </HelmetProvider>
      </MantineProvider>
    </MemoryRouter>,
  );

  expect(await screen.findByTestId("full-editor")).toBeTruthy();
  suspendHistoryModalMock.current = false;
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter client test -- src/App.spec.tsx`

Expected: FAIL in `keeps the full editor visible while page history is suspended`, because the current shared `Suspense` boundary hides `FullEditor`.

- [x] **Step 3: Implement the minimal loading-boundary change**

In `apps/client/src/pages/page/page.tsx`, import the core renderer eagerly:

```tsx
import { FullEditor } from "@/features/editor/full-editor";
```

Remove `LazyFullEditor`, memoize `FullEditor` directly, render it outside a `Suspense` boundary, and give only `MemoizedHistoryModal` an independent neutral boundary:

```tsx
const MemoizedFullEditor = React.memo(FullEditor);

<MemoizedFullEditor
  key={page.id}
  pageId={page.id}
  title={page.title}
  content={page.content}
  slugId={page.slugId}
  spaceSlug={page?.space?.slug}
  editable={canEdit}
  creator={page.creator}
  contributors={page.contributors}
  canComment={canComment}
/>
<React.Suspense fallback={null}>
  <MemoizedHistoryModal pageId={page.id} />
</React.Suspense>
```

- [x] **Step 4: Update stable frontend context**

Replace the frontend context statement that says `FullEditor` is deferred with a statement that the route loads `FullEditor` eagerly, while `PageEditor` and page history retain independent lazy boundaries so optional loading cannot blank the document.

- [x] **Step 5: Verify GREEN and production compilation**

Run:

```powershell
pnpm --filter client test -- src/App.spec.tsx
pnpm --filter client build
pnpm exec prettier --check apps/client/src/App.spec.tsx apps/client/src/pages/page/page.tsx docs/ai-context/frontend.md docs/superpowers/plans/2026-08-05-direct-page-editor-loading.md
git diff --check
```

Expected: all tests pass, the build exits zero, formatting passes and `git diff --check` reports no errors.

- [x] **Step 6: Commit the implementation**

```powershell
git add apps/client/src/App.spec.tsx apps/client/src/pages/page/page.tsx docs/ai-context/frontend.md docs/superpowers/plans/2026-08-05-direct-page-editor-loading.md
git commit -m "fix(client): render direct page content reliably"
```
