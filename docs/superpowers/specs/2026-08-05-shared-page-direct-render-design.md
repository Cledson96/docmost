# Shared Page Direct Render Design

## Context

A direct visit to a public `/share/:shareId/p/:pageSlug` URL loads the share tree and table of contents but leaves the page body at `Loading page content`. The production route data is available; only the nested renderer does not resume.

## Decision

Keep `SharedPage` lazy at the application route boundary, but import `ReadonlyPageEditor` directly from the `SharedPage` module. The public-route chunk will therefore include the renderer it requires. Remove the local `React.lazy` declaration and its `Suspense` boundary.

## Behavior

Once `useSharePageQuery` resolves, `SharedPage` renders the saved document immediately. Its existing error boundary remains responsible for real render or module failures and continues to offer reload. Public share filtering, page keys, title metadata, navigation, and table of contents are unchanged.

## Verification

Extend the shared-route test to assert the document content is visible after the shared page query resolves. This must fail with the old test renderer setup and pass after the eager import. Run client tests, the client production build, formatting, and `git diff --check`.
