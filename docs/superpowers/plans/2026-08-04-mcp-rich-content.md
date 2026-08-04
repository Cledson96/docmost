# MCP Rich Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Docmost's MCP discover, read, resolve, insert, update, move, and delete every supported editor capability while preserving natural Markdown authoring, Yjs collaboration, permissions, and focused history diffs.

**Architecture:** A serializable capability registry in `@docmost/editor-ext` is the source of truth for the editor and MCP. MCP-only rich-content services derive discovery schemas, reversible agent Markdown, structured reads, dynamic results, and block operations from that registry; writes are applied atomically to the live Yjs document through `CollaborationGateway`. Existing Markdown tools remain compatible and are upgraded to understand Docmost directives.

**Tech Stack:** Node 22, TypeScript 5.9, pnpm 10.18.3, Nx, NestJS, Kysely/PostgreSQL, Tiptap/ProseMirror, Yjs/Hocuspocus, Jest, React/Vite/Mantine.

---

## File Structure

### Shared editor package

- Create `packages/editor-ext/src/lib/content-capabilities/types.ts`: serializable capability, attribute-schema, reference, Markdown, and operation types.
- Create `packages/editor-ext/src/lib/content-capabilities/registry.ts`: complete registry and lookup helpers.
- Create `packages/editor-ext/src/lib/content-capabilities/index.ts`: public exports.
- Create `packages/editor-ext/src/lib/markdown/agent-markdown.ts`: reversible block/inline directive codec.
- Modify `packages/editor-ext/src/lib/markdown/index.ts`: export the agent codec.
- Modify `packages/editor-ext/src/index.ts`: export the capability registry.
- Modify `packages/editor-ext/package.json` and `pnpm-lock.yaml`: add the `yaml` parser used by directive bodies.

### Collaboration boundary

- Create `apps/server/src/collaboration/rich-content/rich-content.types.ts`: snapshots, revisions, structured operations, and stable error codes.
- Create `apps/server/src/collaboration/rich-content/rich-content-yjs.util.ts`: state-vector revisions, Yjs element lookup, schema validation, and atomic node operations.
- Create `apps/server/src/collaboration/rich-content/rich-content-yjs.util.spec.ts`: focused Yjs transformation and conflict tests.
- Modify `apps/server/src/collaboration/collaboration.handler.ts`: add snapshot and structured-edit handlers.
- Modify `apps/server/src/collaboration/collaboration.gateway.ts`: provide Redis-aware snapshot/edit entry points with a direct-mode fallback.

### MCP rich-content module

- Create `apps/server/src/ee/mcp/rich-content/capability.service.ts`: filter and expose registry entries.
- Create `apps/server/src/ee/mcp/rich-content/content-reader.service.ts`: return agent Markdown, revision, blocks, and resolved data.
- Create `apps/server/src/ee/mcp/rich-content/content-reader.service.spec.ts`: reading and legacy-ID tests.
- Create `apps/server/src/ee/mcp/rich-content/dynamic-resolver.service.ts`: bounded resolver dispatcher.
- Create `apps/server/src/ee/mcp/rich-content/dynamic-resolver.service.spec.ts`: access, cycles, truncation, and localized error tests.
- Create `apps/server/src/ee/mcp/rich-content/block-edit.service.ts`: validate and submit atomic structured edits.
- Create `apps/server/src/ee/mcp/rich-content/block-edit.service.spec.ts`: authorization, validation, and error-code tests.
- Create `apps/server/src/ee/mcp/rich-content/rich-content.tools.ts`: generated MCP tool schemas and dispatch types.
- Create `apps/server/src/ee/mcp/rich-content/rich-content.module.ts`: Nest wiring.
- Modify `apps/server/src/ee/mcp/mcp.module.ts`: import rich-content and user modules.
- Modify `apps/server/src/ee/mcp/mcp.service.ts`: delegate discovery, rich reads, hierarchy/reference lookup, and block writes.
- Modify `apps/server/src/ee/mcp/mcp.service.spec.ts`: update constructor fixture and cover new tool contracts.

### Domain lookups and rollout

- Modify `apps/server/src/database/repos/attachment/attachment.repo.ts`: add page-scoped cursor listing.
- Modify `apps/server/src/core/workspace/dto/update-workspace.dto.ts`: accept the rollout setting.
- Modify `apps/server/src/core/workspace/services/workspace.service.ts`: persist and audit the rollout setting.
- Modify `apps/client/src/features/workspace/services/workspace-service.ts`: type the new setting mutation.
- Modify `apps/client/src/features/workspace/types/workspace.types.ts`: expose `settings.ai.mcpRichContent`.
- Modify `apps/client/src/ee/ai/components/mcp-settings.tsx`: add the rich-content switch and accurate tool summary.
- Add/update focused client tests beside MCP settings if no existing test covers it.

### Stable context documentation

- Modify `docs/ai-context/mcp.md`: document the final MCP contract.
- Modify `docs/ai-context/collaboration-realtime.md`: document the structured Yjs transaction path and revision tokens.

---

### Task 1: Define the shared capability contract

**Files:**
- Create: `packages/editor-ext/src/lib/content-capabilities/types.ts`
- Create: `packages/editor-ext/src/lib/content-capabilities/registry.ts`
- Create: `packages/editor-ext/src/lib/content-capabilities/index.ts`
- Modify: `packages/editor-ext/src/index.ts`
- Test: `apps/server/src/ee/mcp/rich-content/capability-registry.spec.ts`

- [ ] **Step 1: Write the failing registry contract test**

Create a Jest test that asserts stable unique types, required agent guidance,
valid operation declarations, and the complete public capability set:

```ts
import {
  agentContentCapabilities,
  agentContentCapabilityByType,
} from '@docmost/editor-ext';

const expectedTypes = [
  'attachment', 'audio', 'base', 'blockquote', 'bold', 'bulletList',
  'callout', 'code', 'codeBlock', 'columns', 'details', 'drawio', 'embed',
  'excalidraw', 'hardBreak', 'heading', 'highlight', 'horizontalRule',
  'image', 'italic', 'link', 'mathBlock', 'mathInline', 'mention',
  'orderedList', 'pageBreak', 'paragraph', 'pdf', 'status', 'strike',
  'subpages', 'subscript', 'superscript', 'table', 'taskList', 'textStyle',
  'transclusionReference', 'transclusionSource', 'underline', 'video',
  'youtube',
].sort();

describe('agent content capability registry', () => {
  it('contains one complete descriptor per public capability', () => {
    const types = agentContentCapabilities.map((item) => item.type);
    expect([...types].sort()).toEqual(expectedTypes);
    expect(new Set(types).size).toBe(types.length);
    for (const item of agentContentCapabilities) {
      expect(item.version).toBe(1);
      expect(item.description.length).toBeGreaterThan(10);
      expect(item.useWhen.length).toBeGreaterThan(0);
      expect(agentContentCapabilityByType(item.type)).toBe(item);
    }
  });
});
```

- [ ] **Step 2: Build the editor package and verify the test fails**

Run:

```powershell
pnpm --filter @docmost/editor-ext build
pnpm --filter server test -- ee/mcp/rich-content/capability-registry.spec.ts --runInBand
```

Expected: compilation or test failure because the registry exports do not exist.

- [ ] **Step 3: Implement the serializable types and registry helper**

Define these public types in `types.ts`:

```ts
export type AgentContentKind = 'block' | 'inline' | 'mark';
export type AgentContentOperation = 'insert' | 'update' | 'move' | 'delete' | 'resolve';
export type AgentMarkdownRepresentation = 'standard' | 'block-directive' | 'inline-directive';

export interface AgentReferenceDescriptor {
  attribute: string;
  entity: 'page' | 'user' | 'attachment' | 'base' | 'transclusion';
  lookupTool: string;
}

export interface AgentContentCapability {
  type: string;
  version: 1;
  name: string;
  category: 'text' | 'layout' | 'media' | 'embed' | 'dynamic' | 'inline';
  kind: AgentContentKind;
  description: string;
  useWhen: string[];
  attributesSchema: Record<string, unknown>;
  content: 'none' | 'inline' | 'block+';
  markdown: AgentMarkdownRepresentation;
  operations: AgentContentOperation[];
  references?: AgentReferenceDescriptor[];
  feature?: string;
}
```

In `registry.ts`, use a typed `defineCapability()` helper and create one
descriptor for every type asserted by the test. Use the actual node attribute
names from the matching files under `packages/editor-ext/src/lib/`. Mark
ordinary Markdown types and marks as `standard`; use `inline-directive` for
`mention`, `status`, `mathInline`, `underline`, `superscript`, `subscript`,
`highlight`, and colored `textStyle`; use `block-directive` for other
nonstandard nodes.
Declare `resolve` only for `subpages`, `base`, and `transclusionReference`.
`agentAddressableNodeTypes` contains only node capabilities, never marks such
as `link`.

Export:

```ts
export const agentContentCapabilities: readonly AgentContentCapability[];
export const agentAddressableNodeTypes: readonly string[];
export function agentContentCapabilityByType(
  type: string,
): AgentContentCapability | undefined;
```

- [ ] **Step 4: Export the registry and verify it passes**

Export the new module from `packages/editor-ext/src/index.ts`, then run the two
commands from Step 2. Expected: editor build and registry test pass.

- [ ] **Step 5: Commit the capability contract**

```powershell
git add packages/editor-ext/src/lib/content-capabilities packages/editor-ext/src/index.ts apps/server/src/ee/mcp/rich-content/capability-registry.spec.ts
git commit -m "feat(editor): register agent content capabilities"
```

### Task 2: Enforce registry completeness against the server schema

**Files:**
- Modify: `apps/server/src/collaboration/collaboration.util.ts`
- Modify: `apps/server/src/ee/mcp/rich-content/capability-registry.spec.ts`

- [ ] **Step 1: Add a failing schema-completeness assertion**

Extend the test with an explicit internal-only allowlist:

```ts
import { getSchema } from '@tiptap/core';
import { tiptapExtensions } from '../../../collaboration/collaboration.util';

const internalNodes = new Set([
  'doc', 'text', 'listItem', 'taskItem', 'tableRow', 'tableCell',
  'tableHeader', 'column', 'detailsSummary', 'detailsContent', 'trailingNode',
]);

it('registers every agent-visible node in the collaboration schema', () => {
  const schema = getSchema(tiptapExtensions);
  const publicSchemaNodes = Object.keys(schema.nodes)
    .filter((name) => !internalNodes.has(name))
    .sort();
  expect([...agentAddressableNodeTypes].sort()).toEqual(publicSchemaNodes);
});
```

Add a separate assertion comparing registered `kind: 'mark'` entries with the
agent-visible marks in `schema.marks`; keep editor-internal marks such as
collaboration comments in an explicit mark allowlist.

- [ ] **Step 2: Run the test and record the exact missing or extra types**

Run:

```powershell
pnpm --filter server test -- ee/mcp/rich-content/capability-registry.spec.ts --runInBand
```

Expected: FAIL with a concrete schema/registry mismatch.

- [ ] **Step 3: Make the collaboration schema consume the shared addressable list**

Replace the hard-coded unique-ID types in `collaboration.util.ts`:

```ts
UniqueID.configure({
  types: [...agentAddressableNodeTypes],
}),
```

Keep internal structural nodes out of the list. Update the registry until the
test names exactly the real public schema. Do not add nodes to the internal
allowlist merely to make a missing public capability disappear.

- [ ] **Step 4: Run the focused test and server build**

```powershell
pnpm --filter @docmost/editor-ext build
pnpm --filter server test -- ee/mcp/rich-content/capability-registry.spec.ts --runInBand
pnpm --filter server build
```

Expected: all commands pass.

- [ ] **Step 5: Commit schema completeness**

```powershell
git add apps/server/src/collaboration/collaboration.util.ts apps/server/src/ee/mcp/rich-content/capability-registry.spec.ts
git commit -m "test(editor): enforce MCP capability coverage"
```

### Task 3: Add reversible agent Markdown directives

**Files:**
- Modify: `packages/editor-ext/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `packages/editor-ext/src/lib/markdown/agent-markdown.ts`
- Modify: `packages/editor-ext/src/lib/markdown/index.ts`
- Test: `apps/server/src/ee/mcp/rich-content/agent-markdown.spec.ts`

- [ ] **Step 1: Write failing round-trip tests for block and inline directives**

Cover `subpages`, `embed`, nested `columns`, inline `status`, and `mention`.
Assert both serialized syntax and reconstructed JSON:

```ts
import {
  agentMarkdownToProsemirror,
  prosemirrorToAgentMarkdown,
} from '@docmost/editor-ext';
import { tiptapExtensions } from '../../../collaboration/collaboration.util';

const doc = {
  type: 'doc',
  content: [
    { type: 'paragraph', attrs: { id: 'p1' }, content: [
      { type: 'text', text: 'Estado: ' },
      { type: 'status', attrs: { id: 's1', text: 'Ativo', color: 'green' } },
    ] },
    { type: 'subpages', attrs: { id: 'b1' } },
  ],
};

it('round-trips rich nodes without losing attributes', async () => {
  const markdown = prosemirrorToAgentMarkdown(doc, tiptapExtensions);
  expect(markdown).toContain('{{docmost:status');
  expect(markdown).toContain(':::docmost-subpages');
  expect(await agentMarkdownToProsemirror(markdown, tiptapExtensions)).toEqual(doc);
});
```

- [ ] **Step 2: Run the test and verify it fails**

```powershell
pnpm --filter server test -- ee/mcp/rich-content/agent-markdown.spec.ts --runInBand
```

Expected: FAIL because both codec functions are missing.

- [ ] **Step 3: Add YAML and implement the codec**

Run:

```powershell
pnpm --filter @docmost/editor-ext add yaml@2.8.3
```

Implement these exports:

```ts
export function prosemirrorToAgentMarkdown(
  doc: JSONContent,
  extensions: Extensions,
): string;

export async function agentMarkdownToProsemirror(
  markdown: string,
  extensions: Extensions,
): Promise<JSONContent>;
```

Use the registry to choose standard, block-directive, or inline-directive
encoding. Block directives use `:::docmost-<type>`, a YAML mapping containing
`id` and `attrs`, optional nested Markdown, and a closing `:::`. Inline
directives use `{{docmost:<type> <base64url(JSON.stringify({id, attrs}))>}}`
so braces and user text cannot break parsing. Escape generated placeholder
tokens with a per-call random prefix, restore them only from an internal map,
and reject unknown types or invalid base64url rather than treating them as
editor content.

- [ ] **Step 4: Add malformed-input and all-capability fixtures**

Add tests proving unknown directives, duplicate IDs, malformed YAML, and an
inline payload with a foreign type throw typed codec errors. Add one fixture per
registry entry with all non-default attributes populated; for standard
Markdown entries assert semantic round-trip, and for directives assert exact
attribute round-trip.

- [ ] **Step 5: Run codec tests and builds**

```powershell
pnpm --filter @docmost/editor-ext build
pnpm --filter server test -- ee/mcp/rich-content/agent-markdown.spec.ts --runInBand
pnpm --filter server build
```

Expected: all commands pass.

- [ ] **Step 6: Commit enriched Markdown**

```powershell
git add packages/editor-ext/package.json pnpm-lock.yaml packages/editor-ext/src/lib/markdown apps/server/src/ee/mcp/rich-content/agent-markdown.spec.ts
git commit -m "feat(editor): add reversible agent markdown"
```

### Task 4: Expose filtered content capabilities through MCP

**Files:**
- Create: `apps/server/src/ee/mcp/rich-content/capability.service.ts`
- Create: `apps/server/src/ee/mcp/rich-content/rich-content.tools.ts`
- Create: `apps/server/src/ee/mcp/rich-content/rich-content.module.ts`
- Modify: `apps/server/src/ee/mcp/mcp.module.ts`
- Modify: `apps/server/src/ee/mcp/mcp.service.ts`
- Modify: `apps/server/src/ee/mcp/mcp.service.spec.ts`

- [ ] **Step 1: Add a failing MCP discovery test**

Update `buildService()` with a mocked `capabilityService`, then assert
`tools/list` includes `get_content_capabilities` and `tools/call` returns only
enabled entries with schema, examples, references, and operations.

```ts
it('discovers enabled editor capabilities', async () => {
  const capability = { type: 'subpages', operations: ['insert', 'resolve'] };
  const { service } = buildService({
    capabilityService: { listForWorkspace: jest.fn().mockReturnValue([capability]) },
  });
  const res: any = await callTool(service, 'get_content_capabilities', {});
  expect(JSON.parse(res.result.content[0].text)).toEqual({ capabilities: [capability] });
});
```

- [ ] **Step 2: Run the MCP test and verify it fails**

```powershell
pnpm --filter server test -- ee/mcp/mcp.service.spec.ts --runInBand
```

Expected: FAIL because the tool and injected service do not exist.

- [ ] **Step 3: Implement filtered discovery**

`CapabilityService.listForWorkspace(workspace)` returns cloned serializable
descriptors. Filter entries whose `feature` is unavailable according to the
same workspace entitlement information already used by server features. Add
provider choices from `embedProviders` to the `embed` response without
mutating the shared registry.

Define `get_content_capabilities` in `rich-content.tools.ts`, import
`RichContentModule` in `McpModule`, inject `CapabilityService` into
`McpService`, spread the generated tool into `getToolsList()`, and dispatch the
call before the existing page/base/workspace switches.

- [ ] **Step 4: Verify discovery and compatibility**

```powershell
pnpm --filter server test -- ee/mcp --runInBand
pnpm --filter server build
```

Expected: existing and new MCP tests pass.

- [ ] **Step 5: Commit MCP capability discovery**

```powershell
git add apps/server/src/ee/mcp
git commit -m "feat(mcp): expose editor capability registry"
```

### Task 5: Read live Yjs snapshots with revision tokens

**Files:**
- Create: `apps/server/src/collaboration/rich-content/rich-content.types.ts`
- Create: `apps/server/src/collaboration/rich-content/rich-content-yjs.util.ts`
- Test: `apps/server/src/collaboration/rich-content/rich-content-yjs.util.spec.ts`
- Modify: `apps/server/src/collaboration/collaboration.handler.ts`
- Modify: `apps/server/src/collaboration/collaboration.gateway.ts`

- [ ] **Step 1: Write failing revision and snapshot tests**

Create a Y.Doc containing a paragraph and assert that identical state vectors
produce identical opaque revisions while a content change produces a different
revision:

```ts
import * as Y from 'yjs';
import { revisionForDocument, snapshotDocument } from './rich-content-yjs.util';

it('changes revision only when the Yjs state changes', () => {
  const doc = new Y.Doc();
  doc.getXmlFragment('default').insert(0, [new Y.XmlElement('paragraph')]);
  const first = revisionForDocument(doc);
  expect(revisionForDocument(doc)).toBe(first);
  doc.getXmlFragment('default').get(0).setAttribute('id', 'p1');
  expect(revisionForDocument(doc)).not.toBe(first);
  expect(snapshotDocument(doc).content[0].type).toBe('paragraph');
});
```

- [ ] **Step 2: Run the test and verify it fails**

```powershell
pnpm --filter server test -- collaboration/rich-content/rich-content-yjs.util.spec.ts --runInBand
```

Expected: FAIL because the utility is missing.

- [ ] **Step 3: Implement revision and snapshot utilities**

Use SHA-256 base64url over `Y.encodeStateVector(doc)` for the revision. Use
`TiptapTransformer.fromYdoc(doc, 'default')` for the ProseMirror snapshot.
Return:

```ts
export interface RichContentSnapshot {
  revision: string;
  content: JSONContent;
}
```

- [ ] **Step 4: Add Redis-aware handler and direct fallback**

Add `getPageSnapshot` to `CollaborationHandler.getHandlers()`. It opens the
document through `withYdocConnection`, reads the live document inside the
connection transaction, and returns `RichContentSnapshot`.

Update `CollaborationGateway.handleYjsEvent()` so it does not silently return
`undefined` when Redis is disabled. When `redisSync` is absent, obtain the
handler from `collabEventsService.getHandlers(this.hocuspocus)` and invoke it
directly. Add a focused gateway test if no existing test exercises this branch.

- [ ] **Step 5: Run collaboration tests and build**

```powershell
pnpm --filter server test -- collaboration/rich-content --runInBand
pnpm --filter server build
```

Expected: tests and build pass in direct mode; the typed handler compiles for
the Redis path.

- [ ] **Step 6: Commit live snapshots**

```powershell
git add apps/server/src/collaboration
git commit -m "feat(collaboration): expose revisioned page snapshots"
```

### Task 6: Return structured blocks from `get_page`

**Files:**
- Create: `apps/server/src/ee/mcp/rich-content/content-reader.service.ts`
- Test: `apps/server/src/ee/mcp/rich-content/content-reader.service.spec.ts`
- Modify: `apps/server/src/ee/mcp/rich-content/rich-content.module.ts`
- Modify: `apps/server/src/ee/mcp/mcp.service.ts`
- Modify: `apps/server/src/ee/mcp/mcp.service.spec.ts`

- [ ] **Step 1: Write failing structured-read tests**

Test a snapshot containing a paragraph, status, subpages node, and a legacy
node without ID. Assert ordered blocks contain persisted attributes, a stable
ID where present, a `legacy:<revision>:<path>` locator where absent, and the
enriched Markdown directive. Assert the legacy read does not write anything.

- [ ] **Step 2: Run tests and verify failure**

```powershell
pnpm --filter server test -- ee/mcp/rich-content/content-reader.service.spec.ts ee/mcp/mcp.service.spec.ts --runInBand
```

Expected: FAIL because `ContentReaderService` and enriched fields are missing.

- [ ] **Step 3: Implement ordered block extraction**

Implement:

```ts
export interface McpPageBlock {
  id: string;
  type: string;
  path: number[];
  attributes: Record<string, unknown>;
  content?: string;
  operations: AgentContentOperation[];
  resolved?: unknown;
}

read(snapshot: RichContentSnapshot): Promise<{
  revision: string;
  content: string;
  blocks: McpPageBlock[];
}>;
```

Walk ProseMirror JSON in document order. Include registered nodes and inline
constructs, but omit internal structural nodes as independent entries. For a
missing persistent ID, emit the revision-bound locator without modifying the
document. Serialize `content` with `prosemirrorToAgentMarkdown()`.

- [ ] **Step 4: Integrate live reads into `get_page`**

After `validateCanView`, request `getPageSnapshot` through the collaboration
gateway. Preserve existing metadata and requested `format`; add `revision` and
`blocks` in every format. For `markdown`, use the reader's enriched Markdown;
for HTML/JSON, preserve the existing content representation.

- [ ] **Step 5: Run read, MCP, and build verification**

```powershell
pnpm --filter server test -- ee/mcp/rich-content/content-reader.service.spec.ts ee/mcp/mcp.service.spec.ts --runInBand
pnpm --filter server build
```

Expected: structured read and all existing `get_page` tests pass.

- [ ] **Step 6: Commit structured page reads**

```powershell
git add apps/server/src/ee/mcp apps/server/src/collaboration
git commit -m "feat(mcp): return structured page blocks"
```

### Task 7: Add dynamic resolvers and reliable child-page queries

**Files:**
- Create: `apps/server/src/ee/mcp/rich-content/dynamic-resolver.service.ts`
- Test: `apps/server/src/ee/mcp/rich-content/dynamic-resolver.service.spec.ts`
- Modify: `apps/server/src/ee/mcp/rich-content/content-reader.service.ts`
- Modify: `apps/server/src/ee/mcp/rich-content/rich-content.module.ts`
- Modify: `apps/server/src/ee/mcp/rich-content/rich-content.tools.ts`
- Modify: `apps/server/src/ee/mcp/mcp.service.ts`
- Modify: `apps/server/src/ee/mcp/mcp.service.spec.ts`

- [ ] **Step 1: Write failing resolver tests**

Cover:

- `subpages` returns only accessible children in `position` order;
- depth is clamped to 5 and each page is emitted once;
- `base` returns accessible schema/view metadata, not unrestricted rows;
- `transclusionReference` delegates to `TransclusionService.lookup()`;
- a resolver exception becomes `{ error: { code: 'DYNAMIC_RESOLUTION_FAILED' } }` on that block;
- a reference cycle stops without failing the page.

- [ ] **Step 2: Run tests and verify failure**

```powershell
pnpm --filter server test -- ee/mcp/rich-content/dynamic-resolver.service.spec.ts --runInBand
```

Expected: FAIL because the resolver service is missing.

- [ ] **Step 3: Implement the bounded dispatcher**

Define a `Map<string, resolver>` for `subpages`, `base`, and
`transclusionReference`. Pass `{ user, workspace, containingPage, attributes,
limit: 50, depth: Math.min(requestedDepth, 5), visited }`. Use
`PageAccessService`, `BaseService`, and `TransclusionService`; never query
protected dynamic data without the domain authorization service.

- [ ] **Step 4: Implement `list_child_pages`**

Add a tool with required `parentPageId`, optional `depth` (1-5), `limit`
(1-100), and `cursor`. Validate view access on the parent, use the same
position/id cursor order as `PageService.getSidebarPages()`, stop traversal at
an inaccessible ancestor, and return `{ items, meta }`.

- [ ] **Step 5: Attach localized results to structured blocks**

Update `ContentReaderService.read()` to accept authenticated context and the
containing page. Resolve only capabilities declaring `resolve`. Store results
under `block.resolved`; catch a typed resolution error per block.

- [ ] **Step 6: Verify dynamic reads and hierarchy**

```powershell
pnpm --filter server test -- ee/mcp/rich-content ee/mcp/mcp.service.spec.ts --runInBand
pnpm --filter server build
```

Expected: all focused tests and build pass.

- [ ] **Step 7: Commit dynamic resolution**

```powershell
git add apps/server/src/ee/mcp
git commit -m "feat(mcp): resolve dynamic content safely"
```

### Task 8: Add reference lookup tools

**Files:**
- Modify: `apps/server/src/database/repos/attachment/attachment.repo.ts`
- Modify: `apps/server/src/ee/mcp/rich-content/rich-content.tools.ts`
- Modify: `apps/server/src/ee/mcp/mcp.module.ts`
- Modify: `apps/server/src/ee/mcp/mcp.service.ts`
- Modify: `apps/server/src/ee/mcp/mcp.service.spec.ts`

- [ ] **Step 1: Write failing lookup authorization tests**

Add tests for `search_users` and `list_page_attachments`. Users must belong to
the current workspace and be active. Attachment listing must validate page
view access and return only non-deleted rows whose `pageId`, `workspaceId`, and
`spaceId` match the authorized page.

- [ ] **Step 2: Run tests and verify failure**

```powershell
pnpm --filter server test -- ee/mcp/mcp.service.spec.ts --runInBand
```

Expected: FAIL with unknown tools.

- [ ] **Step 3: Implement page-scoped attachment pagination**

Add `AttachmentRepo.findByPageId(pageId, workspaceId, pagination)` selecting
safe metadata fields and ordering by `createdAt desc, id desc`. Exclude deleted
attachments and return the standard cursor pagination shape.

- [ ] **Step 4: Implement both lookup tools**

Import `UserModule` in `McpModule` and inject `UserRepo`. `search_users` accepts
`query`, `limit`, and `cursor`, delegates to `getUsersPaginated()`, excludes
deactivated/deleted users, and returns only `id`, `name`, `email`, and
`avatarUrl`. `list_page_attachments` resolves and authorizes the page before
calling the repository.

- [ ] **Step 5: Verify lookups and MCP compatibility**

```powershell
pnpm --filter server test -- ee/mcp --runInBand
pnpm --filter server build
```

Expected: all tests and build pass.

- [ ] **Step 6: Commit reference lookup**

```powershell
git add apps/server/src/database/repos/attachment/attachment.repo.ts apps/server/src/ee/mcp
git commit -m "feat(mcp): resolve rich content references"
```

### Task 9: Implement pure structured block operations

**Files:**
- Modify: `apps/server/src/collaboration/rich-content/rich-content.types.ts`
- Modify: `apps/server/src/collaboration/rich-content/rich-content-yjs.util.ts`
- Modify: `apps/server/src/collaboration/rich-content/rich-content-yjs.util.spec.ts`

- [ ] **Step 1: Write failing operation tests**

Build a Y.Doc fixture with top-level and nested blocks. Cover insert-before,
insert-after, insert-in-container, attribute update, nested-content update,
move, delete, and bounded Markdown range replacement. Assert unrelated Yjs
elements retain object identity for every operation except the explicitly
moved/replaced node.

Add tests for stale revision, missing block, duplicate IDs, invalid container,
unsupported operation, invalid attributes, legacy locator promotion, and
atomic rollback of a two-operation request whose second operation is invalid.

- [ ] **Step 2: Run operation tests and verify failure**

```powershell
pnpm --filter server test -- collaboration/rich-content/rich-content-yjs.util.spec.ts --runInBand
```

Expected: FAIL because the operation executor does not exist.

- [ ] **Step 3: Define exact operation and error types**

Use a discriminated union:

```ts
export type RichContentOperation =
  | { action: 'insertBefore' | 'insertAfter'; blockId: string; block: JSONContent }
  | { action: 'insertIn'; containerId: string; position: 'start' | 'end'; block: JSONContent }
  | { action: 'update'; blockId: string; attributes?: Record<string, unknown>; content?: JSONContent[] }
  | { action: 'move'; blockId: string; targetId: string; position: 'before' | 'after' }
  | { action: 'delete'; blockId: string }
  | { action: 'replaceRange'; fromBlockId: string; toBlockId: string; content: JSONContent[] };

export type RichContentErrorCode =
  | 'REVISION_CONFLICT' | 'BLOCK_NOT_FOUND' | 'INVALID_BLOCK'
  | 'INVALID_ATTRIBUTE' | 'UNSUPPORTED_OPERATION'
  | 'REFERENCE_NOT_FOUND' | 'FORBIDDEN' | 'DYNAMIC_RESOLUTION_FAILED';
```

- [ ] **Step 4: Implement validation and atomic mutation**

Before mutating, compare `expectedRevision`, resolve every persistent ID or
revision-bound legacy locator, validate every proposed node with the Tiptap
schema and capability descriptor, and preflight the full operation list.

Inside one `doc.transact()`, mutate only target parents using
`prosemirrorNodeToYElement()`. For updates, replace the target element at the
same parent index while leaving siblings untouched. For moves, serialize the
target once, delete it, and insert a reconstructed element at the adjusted
target index. Promote legacy locators to generated IDs in this same
transaction. Throw a typed error before the transaction when preflight fails.

- [ ] **Step 5: Run focused operation tests**

```powershell
pnpm --filter server test -- collaboration/rich-content/rich-content-yjs.util.spec.ts --runInBand
pnpm --filter server build
```

Expected: all operation, identity, atomicity, and build checks pass.

- [ ] **Step 6: Commit the operation engine**

```powershell
git add apps/server/src/collaboration/rich-content
git commit -m "feat(collaboration): apply atomic block edits"
```

### Task 10: Route block edits through collaboration and MCP

**Files:**
- Modify: `apps/server/src/collaboration/collaboration.handler.ts`
- Modify: `apps/server/src/collaboration/collaboration.gateway.ts`
- Create: `apps/server/src/ee/mcp/rich-content/block-edit.service.ts`
- Test: `apps/server/src/ee/mcp/rich-content/block-edit.service.spec.ts`
- Modify: `apps/server/src/ee/mcp/rich-content/rich-content.module.ts`
- Modify: `apps/server/src/ee/mcp/rich-content/rich-content.tools.ts`
- Modify: `apps/server/src/ee/mcp/mcp.service.ts`
- Modify: `apps/server/src/ee/mcp/mcp.service.spec.ts`

- [ ] **Step 1: Write failing authorization and history-boundary tests**

Assert `BlockEditService` validates page edit access before submitting an
event, passes the API-key owner in the event payload, rejects client-supplied
`resolved`, and returns the new revision. Assert MCP returns stable error codes
inside `isError` responses.

- [ ] **Step 2: Run tests and verify failure**

```powershell
pnpm --filter server test -- ee/mcp/rich-content/block-edit.service.spec.ts ee/mcp/mcp.service.spec.ts --runInBand
```

Expected: FAIL because the service and tool are missing.

- [ ] **Step 3: Add the collaboration handler**

Add `editPageBlocks` to `CollaborationHandler.getHandlers()`. Open the document
with `{ user }`, execute `applyRichContentOperations()` once, and return its
post-transaction revision. Do not update `pages.content`, `pages.ydoc`,
contributors, history, backlinks, or notifications here; the existing
`PersistenceExtension` owns those effects.

- [ ] **Step 4: Implement `BlockEditService` and MCP tool schema**

`BlockEditService.edit(page, expectedRevision, operations, user)` validates
edit access and reference visibility, converts nested agent Markdown through
the enriched codec, then calls `CollaborationGateway.handleYjsEvent(
'editPageBlocks', 'page.<id>', payload)`.

Add `edit_page_blocks` with required `pageId`, `expectedRevision`, and a
non-empty operation array capped at 50 operations. Reject any operation object
with unknown fields through explicit runtime validation before dispatch.

- [ ] **Step 5: Verify attribution through persistence/history tests**

Add an integration-style test around the collaboration handler and mocked
persistence hooks proving the transaction context contains `user.id`. Add a
history-processor fixture whose prior and new JSON differ in one block and
assert the saved history content preserves all untouched block IDs.

- [ ] **Step 6: Run MCP, collaboration, and build verification**

```powershell
pnpm --filter server test -- collaboration/rich-content ee/mcp --runInBand
pnpm --filter server build
```

Expected: all commands pass.

- [ ] **Step 7: Commit MCP block editing**

```powershell
git add apps/server/src/collaboration apps/server/src/ee/mcp
git commit -m "feat(mcp): edit page blocks through Yjs"
```

### Task 11: Upgrade existing Markdown page writes

**Files:**
- Modify: `apps/server/src/ee/mcp/mcp.service.ts`
- Modify: `apps/server/src/ee/mcp/mcp.service.spec.ts`

- [ ] **Step 1: Write failing create/update directive tests**

For both `create_page` and `update_page`, send Markdown containing a status and
subpages directive. Assert the service receives ProseMirror JSON with those
node types and `format: 'json'`. Retain a test proving ordinary Markdown still
produces the same headings, paragraphs, lists, and tables.

- [ ] **Step 2: Run tests and verify failure**

```powershell
pnpm --filter server test -- ee/mcp/mcp.service.spec.ts --runInBand
```

Expected: directive tests fail because writes still declare `format: 'markdown'`.

- [ ] **Step 3: Parse agent Markdown before page service calls**

Convert MCP content with `agentMarkdownToProsemirror(content,
tiptapExtensions)`, validate the resulting schema, and call page services with
`format: 'json'`. Preserve append/prepend/replace semantics and the existing
Yjs path. Do not change non-MCP imports or ordinary page editor behavior.

- [ ] **Step 4: Verify compatibility and round-trip behavior**

```powershell
pnpm --filter server test -- ee/mcp --runInBand
pnpm --filter server build
```

Expected: existing Markdown tests and new directive tests pass.

- [ ] **Step 5: Commit enriched page writes**

```powershell
git add apps/server/src/ee/mcp/mcp.service.ts apps/server/src/ee/mcp/mcp.service.spec.ts
git commit -m "feat(mcp): create pages with rich directives"
```

### Task 12: Add the workspace rollout control and accurate UI

**Files:**
- Modify: `apps/server/src/core/workspace/dto/update-workspace.dto.ts`
- Modify: `apps/server/src/core/workspace/services/workspace.service.ts`
- Modify: `apps/server/src/core/workspace/services/workspace.service.spec.ts` if present; otherwise create a focused spec beside the service.
- Modify: `apps/client/src/features/workspace/types/workspace.types.ts`
- Modify: `apps/client/src/features/workspace/services/workspace-service.ts`
- Modify: `apps/client/src/ee/ai/components/mcp-settings.tsx`
- Test: `apps/client/src/ee/ai/components/mcp-settings.test.tsx`

- [ ] **Step 1: Write failing server setting tests**

Assert `mcpRichContentEnabled` is accepted only as a boolean, stored at
`settings.ai.mcpRichContent`, audited on change, and ignored by unrelated
workspace updates.

- [ ] **Step 2: Write the failing client settings test**

Render MCP settings with MCP enabled. Assert the rich-content switch reflects
`workspace.settings.ai.mcpRichContent`, calls
`updateWorkspace({ mcpRichContentEnabled: true })`, and the tool summary lists
only names actually returned by `McpService.getToolsList()` including
`get_content_capabilities`, `list_child_pages`, `search_users`,
`list_page_attachments`, and `edit_page_blocks`.

- [ ] **Step 3: Run focused tests and verify failure**

```powershell
pnpm --filter server test -- core/workspace/services/workspace.service.spec.ts --runInBand
pnpm --filter client test -- src/ee/ai/components/mcp-settings.test.tsx
```

Expected: both fail because the setting and UI do not exist.

- [ ] **Step 4: Implement the setting end to end**

Add `@IsOptional() @IsBoolean() mcpRichContentEnabled: boolean` to the DTO.
Persist it through `WorkspaceRepo.updateAiSettings(workspaceId,
'mcpRichContent', value, trx)` and include before/after audit data. Add the
client setting type and service input. Show the secondary switch only when MCP
is enabled; default new/absent values to `false` during rollout.

Keep `get_content_capabilities` visible in `tools/list` even when rollout is
disabled so an agent can explain availability. Gate `edit_page_blocks`, rich
reference/hierarchy tools, and enriched `get_page` fields on the setting.
Existing MCP tools retain their previous behavior when it is false;
`get_content_capabilities` returns a concise disabled message.

- [ ] **Step 5: Run server/client tests and builds**

```powershell
pnpm --filter server test -- core/workspace/services/workspace.service.spec.ts ee/mcp --runInBand
pnpm --filter client test -- src/ee/ai/components/mcp-settings.test.tsx
pnpm --filter client lint
pnpm --filter server build
pnpm --filter client build
```

Expected: tests, lint, and both builds pass.

- [ ] **Step 6: Commit rollout controls**

```powershell
git add apps/server/src/core/workspace apps/client/src/features/workspace apps/client/src/ee/ai/components/mcp-settings.tsx apps/client/src/ee/ai/components/mcp-settings.test.tsx
git commit -m "feat(mcp): add rich content rollout setting"
```

### Task 13: Complete security, compatibility, and failure-path coverage

**Files:**
- Modify: `apps/server/src/ee/mcp/mcp.service.spec.ts`
- Modify: `apps/server/src/ee/mcp/rich-content/*.spec.ts`
- Modify: `apps/server/src/collaboration/rich-content/rich-content-yjs.util.spec.ts`

- [ ] **Step 1: Add the security matrix**

Add table-driven tests for another workspace, private space, inherited page
restriction, deleted page, inaccessible transclusion source, inaccessible base,
foreign attachment, deactivated mention target, unavailable feature, and a
client-supplied `resolved` field. Assert every case fails closed or omits only
the inaccessible dynamic result as specified.

- [ ] **Step 2: Add concurrency and size-bound tests**

Test stale revision conflicts, 51-operation rejection, depth 6 clamping or
rejection according to tool schema, result truncation with continuation
metadata, transclusion cycles, and malformed directives whose payloads exceed
the normal MCP request limit.

- [ ] **Step 3: Add backward-compatibility snapshots**

Snapshot `tools/list` for the rollout setting off and on. Assert old required
arguments and response fields are unchanged, raw JSON and HTML reads remain
available, ordinary Markdown writes preserve current semantics, and
`list_pages` remains callable.

- [ ] **Step 4: Run the complete focused suite**

```powershell
pnpm --filter @docmost/editor-ext build
pnpm --filter server test -- ee/mcp collaboration/rich-content --runInBand
pnpm --filter client test -- src/ee/ai/components/mcp-settings.test.tsx
```

Expected: all security, concurrency, compatibility, and UI tests pass.

- [ ] **Step 5: Commit hardening tests**

```powershell
git add apps/server/src/ee/mcp apps/server/src/collaboration/rich-content apps/client/src/ee/ai/components/mcp-settings.test.tsx
git commit -m "test(mcp): harden rich content operations"
```

### Task 14: Update stable context and run final verification

**Files:**
- Modify: `docs/ai-context/mcp.md`
- Modify: `docs/ai-context/collaboration-realtime.md`

- [ ] **Step 1: Update MCP context documentation**

Document the shared registry source paths, agent Markdown directive contract,
new tools, additive `get_page` fields, rollout setting, reference lookups,
error codes, and authorization rules. State that `resolved` is computed and
never persisted.

- [ ] **Step 2: Update collaboration context documentation**

Document live snapshot reads, state-vector revision tokens, atomic structured
edits, direct-mode fallback, API-key owner attribution, legacy locator
promotion, and the continued ownership of persistence/history side effects by
`PersistenceExtension` and `HistoryProcessor`.

- [ ] **Step 3: Run formatting checks without broad auto-fix**

Run Prettier only on touched files rather than `server lint`, which auto-fixes
the entire server tree:

```powershell
pnpm exec prettier --check packages/editor-ext/src/lib/content-capabilities packages/editor-ext/src/lib/markdown/agent-markdown.ts apps/server/src/ee/mcp apps/server/src/collaboration/rich-content apps/client/src/ee/ai/components/mcp-settings.tsx docs/ai-context/mcp.md docs/ai-context/collaboration-realtime.md
```

Expected: all matched files are formatted.

- [ ] **Step 4: Run final focused and full builds**

```powershell
pnpm --filter @docmost/editor-ext build
pnpm --filter server test -- ee/mcp collaboration/rich-content --runInBand
pnpm --filter client test -- src/ee/ai/components/mcp-settings.test.tsx
pnpm --filter client lint
pnpm build
```

Expected: every command exits successfully. If the full build exposes an
unrelated pre-existing failure, record the exact command/output and still
require all feature-focused commands to pass.

- [ ] **Step 5: Review the final diff and commit documentation**

```powershell
git diff --check
git status --short
git diff --stat
git add docs/ai-context/mcp.md docs/ai-context/collaboration-realtime.md
git commit -m "docs: document rich MCP content support"
```

Expected: no whitespace errors; only intentional files remain changed before
the documentation commit.
