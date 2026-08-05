# Direct page editor loading design

## Goal

Ensure a workspace page opened through its direct URL renders its document
without requiring a second navigation from the sidebar.

## Root causes

The workspace page route dynamically imports both `FullEditor` and the history
modal inside one `Suspense` boundary. On a cold direct visit, this creates a
nested lazy-loading waterfall beneath the already lazy route. Production
reproduction shows that all related assets finish downloading, but the shared
boundary remains suspended until another route navigation causes a render.
Because the boundary contains the full editor, the page body stays blank.

After isolating that boundary, production reproduction exposed the same missed
`React.lazy` resume inside `FullEditor`: the title renders, but `PageEditor`
never mounts on the cold direct visit. No collaboration WebSocket is created.
Opening a sibling page and returning uses the cached module, mounts
`PageEditor`, opens `/collab` and renders the document.

## Design

- Import `FullEditor` with the page route so the core document renderer is
  available as soon as that route module resolves.
- Keep the history modal lazy, but render it in its own `Suspense` boundary with
  a neutral fallback. Loading optional history code must never hide the page.
- Replace the inner `React.lazy` boundary with an explicit cached module loader
  controlled by component state. While `PageEditor` is downloading, render the
  existing `ReadonlyPageEditor` with the page content instead of an empty
  fallback. Mount `PageEditor` after the module promise resolves.
- Reset the cached module promise after a load failure so a subsequent retry can
  request it again. Propagate the error to the existing page error boundary,
  whose retry action reloads the route.
- Preserve current page queries, permissions, edit-mode behavior, collaboration
  protocol, URLs and error handling.

The heavy Tiptap collaboration graph remains deferred, but the page no longer
depends on React Suspense resuming correctly to show its saved content.

## Error handling

The page-level error boundary continues to catch route and editor-module load
errors and offers a route reload. A history-modal load failure remains isolated
from the visible document.

## Verification

- Add a regression test in `apps/client/src/App.spec.tsx` where the optional
  history modal suspends indefinitely and assert that the full editor remains
  visible.
- Add focused loader tests proving that pending editor code leaves the read-only
  document visible and that resolving the module mounts the collaborative
  editor without a route navigation.
- Run the focused client test file and the production client build.
- After deployment, reload the reported direct URL and confirm the document
  appears without clicking the sidebar.

## Documentation

Update `docs/ai-context/frontend.md` to record that the core workspace editor is
eager within the page route while optional history and collaborative editor
code retain independent lazy boundaries.
