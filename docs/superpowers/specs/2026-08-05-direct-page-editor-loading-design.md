# Direct page editor loading design

## Goal

Ensure a workspace page opened through its direct URL renders its document
without requiring a second navigation from the sidebar.

## Root cause

The workspace page route dynamically imports both `FullEditor` and the history
modal inside one `Suspense` boundary. On a cold direct visit, this creates a
nested lazy-loading waterfall beneath the already lazy route. Production
reproduction shows that all related assets finish downloading, but the shared
boundary remains suspended until another route navigation causes a render.
Because the boundary contains the full editor, the page body stays blank.

## Design

- Import `FullEditor` with the page route so the core document renderer is
  available as soon as that route module resolves.
- Keep the heavy collaborative `PageEditor` lazy inside `FullEditor`; read-mode
  users retain the existing editor code-splitting benefit.
- Keep the history modal lazy, but render it in its own `Suspense` boundary with
  a neutral fallback. Loading optional history code must never hide the page.
- Preserve current page queries, permissions, edit-mode behavior, collaboration
  protocol, URLs and error handling.

The small increase to the workspace page route chunk is accepted in exchange
for deterministic direct-link rendering. The heavy Tiptap collaboration graph
remains deferred, which preserves the most valuable optimization.

## Error handling

The page-level error boundary continues to catch route and editor rendering
errors. A history-modal load failure remains isolated from the visible document
and can be recovered through a later route reload.

## Verification

- Add a regression test in `apps/client/src/App.spec.tsx` where the optional
  history modal suspends indefinitely and assert that the full editor remains
  visible.
- Run the focused client test file and the production client build.
- After deployment, reload the reported direct URL and confirm the document
  appears without clicking the sidebar.

## Documentation

Update `docs/ai-context/frontend.md` to record that the core workspace editor is
eager within the page route while optional history and collaborative editor
code retain independent lazy boundaries.
