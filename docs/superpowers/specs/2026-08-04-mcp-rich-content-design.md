# MCP Rich Content Design

## Summary

Docmost's MCP exposes broad page, workspace, search, template, attachment, and
base operations, but its page authoring contract is centered on Markdown. An
agent can request raw ProseMirror JSON to inspect rich nodes, yet the MCP does
not describe the available node types or their attributes, and page creation
and updates cannot reliably produce most editor-specific blocks.

This design makes the MCP aware of every agent-manipulable editor capability.
It preserves natural Markdown authoring, adds reversible Docmost directives for
rich blocks, returns block configuration together with resolved dynamic data,
and provides validated block-level operations. All writes continue through
Yjs so collaboration, attribution, history, and focused diffs retain their
current behavior.

## Goals

- Let agents discover every supported editor block and inline construct,
  including its purpose, attributes, examples, and allowed operations.
- Let agents read both persisted macro configuration and current dynamic
  results.
- Let agents create documentation naturally in Markdown while inserting rich
  Docmost blocks with a simple, validated syntax.
- Let agents insert, update, move, and delete individual blocks without
  replacing unrelated page content.
- Preserve current authorization, collaboration, contributor attribution,
  page history, and diff behavior.
- Make newly registered editor capabilities appear in MCP discovery
  automatically.
- Preserve existing MCP clients and Markdown-only workflows.

## Non-goals

- Exposing arbitrary executable code through macros.
- Allowing an API key to exceed its owner's permissions.
- Making raw ProseMirror JSON the primary authoring interface.
- Persisting expanded results of dynamic blocks in page content.
- Replacing the existing editor, Yjs document model, or history processor.
- Requiring every client to understand Docmost directives.

## Current Limitations

`getToolsList()` in `apps/server/src/ee/mcp/mcp.service.ts` is the MCP tool
source of truth. `get_page` returns Markdown by default and can return HTML or
raw ProseMirror JSON. `create_page` and `update_page` accept Markdown content.
The Markdown conversion in `packages/editor-ext/src/lib/markdown/` preserves
common formatting and selected custom elements, but it does not provide a
reversible representation for every rich editor node.

`list_pages` returns at most 100 accessible pages and includes `parentPageId`,
which lets an agent infer some direct children. It does not filter by parent,
paginate, guarantee tree order, or traverse depth. A persisted `subpages` node
also does not expand to its current child-page results in MCP output.

Page content updates already enter collaboration through
`PageService.updatePageContent()` and `CollaborationGateway.handleYjsEvent()`.
The new write path must preserve this boundary rather than write page JSON or
Yjs state directly in the MCP service.

## Selected Approach

Use a shared capability registry, enriched Markdown, and validated block-level
operations.

Raw ProseMirror remains available for diagnostics through the existing JSON
format, but agents are not expected to construct or replace raw documents.
Separate MCP tools per macro are avoided because they would duplicate schemas
and require MCP changes whenever the editor gains a capability.

## Shared Capability Registry

Add a serializable registry in `packages/editor-ext`. The registry contains no
React components, HTTP clients, database access, or executable dynamic
resolvers. Client and server implementations bind to a registry entry by its
stable `type`.

Each agent-manipulable capability declares:

- stable type and schema version;
- display name, category, description, and guidance for when to use it;
- block, inline node, or mark kind;
- JSON Schema-compatible attributes and nested-content rules;
- supported insert, update, move, delete, and resolve operations;
- enriched Markdown directive or ordinary Markdown representation;
- references that must be resolved first, such as users, pages, attachments,
  bases, or transclusions;
- whether its dynamic result has a resolver and the shape of that result;
- relevant feature or workspace gates.

The registry covers common Markdown content, rich editor blocks, and dynamic
blocks. Initial rich coverage includes callouts, details, math, status,
columns, page breaks, images, PDFs, audio, video, attachments, embeds and their
providers, Draw.io, Excalidraw, base embeds, mentions, subpages, and
transclusion sources/references. Basic text, headings, lists, task lists,
links, tables, quotes, code, Mermaid, and inline formatting retain ordinary
Markdown authoring.

A build-time completeness test compares the editor schema's manipulable nodes
and marks with the registry. An explicit internal-only allowlist covers
structural implementation nodes that agents should not address directly. The
test fails when a public editor capability has no registry entry.

## MCP Discovery

Add `get_content_capabilities`. It returns registry entries filtered by the
authenticated workspace's enabled features and configuration. Results include
attribute schemas, examples, reference requirements, enriched Markdown syntax,
and supported operations.

Discovery also exposes contextual dependencies:

- mentions direct the agent to user/page lookup tools;
- base embeds refer to the existing base tools;
- media blocks refer to `upload_attachment` and accessible attachment lookup;
- embeds include the current supported provider catalog;
- transclusions describe source/reference semantics and access restrictions;
- dynamic blocks describe their resolved result shape.

The registry is the source of truth. MCP descriptions and schemas are derived
from it rather than copied into `mcp.service.ts`.

## Enriched Markdown

Ordinary Markdown remains unchanged. Rich blocks use fenced Docmost directives
that are readable, deterministic, and reversible. For example:

```md
:::docmost-subpages
parentPageId: current
depth: 1
:::

:::docmost-status
text: Em producao
color: green
:::
```

Directive names map to registered capability types. Their bodies are parsed
against the registry schema. Unknown directives, unknown attributes, invalid
references, and invalid nested content produce validation errors rather than
silently degrading to paragraphs.

The page-to-Markdown converter emits a directive for every rich node that has
no complete ordinary Markdown representation. The Markdown-to-page converter
recreates the node without losing relevant attributes. Round-trip fixtures are
required for every registered capability and schema version.

Existing `create_page` and `update_page` tools continue to accept Markdown and
gain support for registered directives. Markdown-only clients can ignore or
display the directives as text without needing the structured operations API.

## Structured Page Reading

Extend `get_page` without removing existing response fields. Its response adds:

- `revision`: an opaque Yjs-derived revision token used for optimistic
  concurrency;
- `blocks`: ordered registered blocks with stable IDs, types, persisted
  attributes, nested content where applicable, capabilities, and optional
  resolved results.

The existing `content` field remains Markdown by default, now using reversible
directives for rich blocks. HTML and raw JSON formats remain supported.

Dynamic block entries return persisted configuration and a separate
`resolved` object. Resolved data is never injected into stored content and is
never accepted on writes. A resolver failure is localized to that block and
does not fail the rest of the page response.

For example, a `subpages` entry contains its configured parent and depth plus
the currently accessible child items. A base embed contains its base reference
and current accessible view metadata. A transclusion reference identifies its
source and returns the currently accessible resolved content.

## Dynamic Resolver Boundary

Server-side resolvers live outside the registry and bind by capability type.
Each resolver receives authenticated user and workspace context, the containing
page, persisted attributes, and bounded resolution options. Resolvers must use
the same domain services and authorization rules as corresponding HTTP or MCP
operations.

Resolution is bounded to prevent one page read from triggering an unbounded
tree or record scan. Paginated or truncated results include continuation
metadata. Recursive references detect cycles and report a localized resolution
error.

## Hierarchy Tools

Add `list_child_pages` with:

- required parent page ID;
- cursor pagination;
- stable page-tree ordering;
- optional bounded depth;
- metadata indicating children and continuation state.

The tool validates access to the parent and filters every returned descendant
using existing page access rules. `list_pages` remains for compatibility.

## Reference Resolution Tools

Agents must resolve user-provided names to authorized IDs instead of inventing
references. Add `search_users` for active users visible in the workspace and
`list_page_attachments` for files attached to an accessible page. Reuse
`search_workspace` for page lookup, the new hierarchy tool for parent/child
lookup, and the existing base tools for base and view IDs.

Every capability entry declares which lookup tool supplies each referenced
entity. Lookup responses contain only the minimum metadata needed to choose a
reference. They use the authenticated workspace and page/space permissions and
do not expose hidden users, restricted pages, or inaccessible attachments.

## Structured Block Operations

Add `edit_page_blocks`. Its input contains `pageId`, `expectedRevision`, and an
ordered operation list. Supported operations are:

- insert before or after a stable block ID;
- insert at the start or end of a valid container;
- update a block's registered attributes or nested Markdown content;
- move a block relative to another valid block/container;
- delete a block;
- replace a bounded range when natural Markdown authoring is more suitable.

Every operation is validated against the registry and current editor schema.
The entire request is atomic: any invalid operation rejects the request without
saving partial changes.

The existing page creation and full-content append, prepend, and replace paths
remain available. Agents use Markdown for normal document composition and
structured operations for precise changes to macros or isolated sections.

## Stable Block Identity And Legacy Pages

All agent-addressable blocks receive persistent IDs. Existing IDs used by
headings, paragraphs, and transclusion sources are preserved. The shared unique
ID behavior is expanded to other registered addressable nodes without changing
their visible rendering.

Legacy nodes without IDs are represented with a revision-bound locator when
read. On the first real structured edit, the same Yjs transaction promotes the
target and any required surrounding addressable nodes to persistent IDs. This
normalization does not run as an independent edit and therefore does not create
a history revision containing only technical IDs.

The server resolves locators only against the `expectedRevision`. If the page
has changed, the request returns a revision conflict instead of applying an
operation to the wrong node.

## Collaboration, Attribution, And History

Structured operations are converted into ProseMirror/Yjs transformations and
sent through the collaboration boundary. The MCP service does not update page
JSON or Yjs database columns directly.

All operations in one `edit_page_blocks` request execute in a single Yjs
transaction attributed to the authenticated API-key owner. Unchanged nodes and
their IDs are preserved. Existing persistence, contributor collection, history
queueing, backlinks, mentions, notifications, and search/indexing effects
continue to run.

The returned revision represents the post-transaction state. A stale
`expectedRevision` returns `REVISION_CONFLICT`; the agent must reread and apply
its intent to the latest page. This prevents an agent from silently replacing
concurrent human edits.

Because transformations target only selected nodes and attributes, the current
history diff continues to show the meaningful content or macro change rather
than a rewritten document.

## Authorization And Validation

The API key provides no special content role. Reading uses the key owner's page
view access; writing uses edit access. All references stay inside the resolved
workspace.

- Dynamic subpages and tree queries filter each page by inherited restrictions.
- Base data uses the base page's access checks.
- Transclusions require access to both the containing and source pages.
- Mentions accept only visible users/pages returned by supported lookup tools.
- Attachments must be accessible through the containing page.
- Embed URLs use existing sanitization and iframe/provider policy.
- Workspace feature gates filter discovery and reject unavailable writes.
- The existing MCP per-user rate limit applies to all new tools.

The structured API never accepts a client-supplied `resolved` result. Unknown
types, attributes, operations, or references fail closed.

## Error Contract

Tool errors retain MCP's `isError` response behavior and add stable domain error
codes in the textual JSON payload:

- `REVISION_CONFLICT`: the page changed after it was read;
- `BLOCK_NOT_FOUND`: a target block no longer exists;
- `INVALID_BLOCK`: type or nested structure is invalid;
- `INVALID_ATTRIBUTE`: registered attribute validation failed;
- `UNSUPPORTED_OPERATION`: the capability disallows the requested action;
- `REFERENCE_NOT_FOUND`: a referenced entity is absent or inaccessible;
- `FORBIDDEN`: the authenticated user lacks the required permission;
- `DYNAMIC_RESOLUTION_FAILED`: a stored block could not currently resolve.

Resolution errors are returned on the affected block while the page read
succeeds. Write errors reject the entire atomic operation list.

## Compatibility And Rollout

- Keep all current tools and their required inputs.
- Preserve Markdown as the default page content format.
- Add fields to `get_page`; do not remove or rename existing fields.
- Preserve HTML and JSON read formats.
- Keep `list_pages` while introducing the reliable hierarchy tool.
- Add a workspace rollout setting while the rich MCP contract stabilizes.
- Once verified, make rich discovery and reading the default MCP behavior.

Implementation proceeds in dependency order:

1. shared registry and completeness validation;
2. reversible enriched Markdown conversion;
3. capability discovery and structured reads;
4. dynamic resolvers and hierarchy tools;
5. stable IDs, revision tokens, and atomic block operations;
6. Yjs/history integration and conflict handling;
7. reference lookup tools and complete initial block coverage;
8. compatibility, authorization, agent-facing examples, and end-to-end
   verification.

## Verification

Tests must cover:

- registry completeness against the editor schema;
- ProseMirror-to-directive-to-ProseMirror round trips for every registered
  capability and version;
- preservation of every relevant attribute and nested-content shape;
- insert, update, move, and delete behavior for each supported type;
- atomic rollback when any operation is invalid;
- conflict rejection with concurrent human or agent edits;
- contributor attribution to the API-key owner;
- creation of normal history through the collaboration pipeline;
- focused diffs that exclude unrelated page content;
- no standalone history revision for legacy ID normalization;
- per-item permission filtering in dynamic results and hierarchy queries;
- cycle and size bounds for dynamic resolution;
- restricted pages, bases, transclusions, mentions, and attachments;
- unchanged behavior for existing Markdown-only MCP calls;
- `tools/list` and `tools/call` contracts for every new tool;
- server MCP tests with `pnpm --filter server test -- ee/mcp` plus focused
  editor-extension tests for registry and Markdown conversion.

## Documentation Impact

Implementation will update `docs/ai-context/mcp.md` with the capability
registry, enriched Markdown, structured page responses, block operations,
revision conflicts, and hierarchy tools. Changes to editor schema registration
and Yjs transformation behavior will also update
`docs/ai-context/collaboration-realtime.md`. This design document does not
change runtime behavior by itself.
