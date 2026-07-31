import { ForbiddenException } from '@nestjs/common';
import { AiChatService } from './ai-chat.service';
import { User } from '@docmost/db/types/entity.types';

const WORKSPACE = 'workspace-1';
const OTHER_WORKSPACE = 'workspace-2';
const PAGE_ID = '018f8b3c-0000-7000-8000-000000000001';

const user = { id: 'user-1', locale: 'pt-BR' } as User;

function editCommand(pageId = PAGE_ID, operation = 'append') {
  return [
    'Pronto, atualizei a página.',
    ':::EDIT_PAGE:::',
    JSON.stringify({ pageId, content: 'novo conteúdo', operation }),
    ':::END_EDIT:::',
  ].join('\n');
}

function titleCommand(pageId = PAGE_ID) {
  return [
    ':::UPDATE_TITLE:::',
    JSON.stringify({ pageId, title: 'Novo título' }),
    ':::END_TITLE:::',
  ].join('\n');
}

type Mocks = {
  pageService: { updatePageContent: jest.Mock };
  pageRepo: { findById: jest.Mock; updatePage: jest.Mock };
  pageAccessService: { validateCanEdit: jest.Mock };
  environmentService: { getAppName: jest.Mock };
};

function build(overrides: {
  page?: unknown;
  findByIdThrows?: boolean;
  canEdit?: boolean;
}) {
  const mocks: Mocks = {
    pageService: { updatePageContent: jest.fn().mockResolvedValue(undefined) },
    pageRepo: {
      findById: overrides.findByIdThrows
        ? jest.fn().mockRejectedValue(new Error('invalid input syntax for uuid'))
        : jest.fn().mockResolvedValue(overrides.page),
      updatePage: jest.fn().mockResolvedValue(undefined),
    },
    pageAccessService: {
      validateCanEdit:
        overrides.canEdit === false
          ? jest.fn().mockRejectedValue(new ForbiddenException())
          : jest.fn().mockResolvedValue({ hasRestriction: false }),
    },
    environmentService: { getAppName: jest.fn().mockReturnValue('Gobrax Wiki') },
  };

  const service = new AiChatService(
    {} as any,
    {} as any,
    mocks.pageService as any,
    mocks.pageRepo as any,
    mocks.pageAccessService as any,
    {} as any,
    {} as any,
    mocks.environmentService as any,
    {} as any,
  );

  return { service, mocks };
}

function run(service: AiChatService, text: string) {
  return (service as any).parseAndExecuteEditCommands(text, user, WORKSPACE);
}

describe('AiChatService edit command authorization', () => {
  const allowedPage = {
    id: PAGE_ID,
    workspaceId: WORKSPACE,
    spaceId: 'space-1',
    deletedAt: null,
  };

  it('applies an edit the user is allowed to make', async () => {
    const { service, mocks } = build({ page: allowedPage });

    const outcomes = await run(service, editCommand());

    expect(outcomes).toEqual([
      { pageId: PAGE_ID, action: 'content', applied: true },
    ]);
    expect(mocks.pageService.updatePageContent).toHaveBeenCalledWith(
      PAGE_ID,
      'novo conteúdo',
      'append',
      'markdown',
      user,
    );
  });

  it('refuses a page the user cannot edit and does not touch it', async () => {
    const { service, mocks } = build({ page: allowedPage, canEdit: false });

    const outcomes = await run(service, editCommand());

    expect(outcomes[0].applied).toBe(false);
    expect(outcomes[0].reason).toMatch(/permission/i);
    expect(mocks.pageService.updatePageContent).not.toHaveBeenCalled();
  });

  it('refuses a page belonging to another workspace', async () => {
    const { service, mocks } = build({
      page: { ...allowedPage, workspaceId: OTHER_WORKSPACE },
    });

    const outcomes = await run(service, editCommand());

    expect(outcomes[0].applied).toBe(false);
    expect(mocks.pageService.updatePageContent).not.toHaveBeenCalled();
    // Cross-workspace targets are rejected before any permission lookup.
    expect(mocks.pageAccessService.validateCanEdit).not.toHaveBeenCalled();
  });

  it('refuses a deleted page', async () => {
    const { service, mocks } = build({
      page: { ...allowedPage, deletedAt: new Date() },
    });

    const outcomes = await run(service, editCommand());

    expect(outcomes[0].applied).toBe(false);
    expect(mocks.pageService.updatePageContent).not.toHaveBeenCalled();
  });

  it('refuses a page that does not exist', async () => {
    const { service, mocks } = build({ page: undefined });

    const outcomes = await run(service, editCommand());

    expect(outcomes[0]).toEqual({
      pageId: PAGE_ID,
      action: 'content',
      applied: false,
      reason: 'Page not found',
    });
    expect(mocks.pageService.updatePageContent).not.toHaveBeenCalled();
  });

  it('survives a malformed page id instead of throwing', async () => {
    const { service, mocks } = build({ findByIdThrows: true });

    const outcomes = await run(service, editCommand('not-a-uuid'));

    expect(outcomes[0].applied).toBe(false);
    expect(mocks.pageService.updatePageContent).not.toHaveBeenCalled();
  });

  it('guards title updates with the same check', async () => {
    const { service, mocks } = build({ page: allowedPage, canEdit: false });

    const outcomes = await run(service, titleCommand());

    expect(outcomes).toEqual([
      {
        pageId: PAGE_ID,
        action: 'title',
        applied: false,
        reason: 'You do not have permission to edit this page',
      },
    ]);
    expect(mocks.pageRepo.updatePage).not.toHaveBeenCalled();
  });

  it('renames a page when allowed', async () => {
    const { service, mocks } = build({ page: allowedPage });

    const outcomes = await run(service, titleCommand());

    expect(outcomes[0].applied).toBe(true);
    expect(mocks.pageRepo.updatePage).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Novo título' }),
      PAGE_ID,
    );
  });

  it('ignores malformed command blocks', async () => {
    const { service, mocks } = build({ page: allowedPage });

    const outcomes = await run(
      service,
      ':::EDIT_PAGE:::\n{not json at all}\n:::END_EDIT:::',
    );

    expect(outcomes).toEqual([]);
    expect(mocks.pageService.updatePageContent).not.toHaveBeenCalled();
  });

  it('reports each command separately when several are emitted', async () => {
    const { service } = build({ page: allowedPage });

    const outcomes = await run(
      service,
      `${editCommand()}\n${titleCommand()}`,
    );

    expect(outcomes).toHaveLength(2);
    expect(outcomes.map((o: any) => o.action)).toEqual(['content', 'title']);
  });
});

describe('AiChatService system prompt', () => {
  function prompt(locale?: string) {
    const { service } = build({});
    return (service as any).buildSystemPrompt(
      '',
      undefined,
      locale ?? 'Brazilian Portuguese (pt-BR)',
    );
  }

  it('identifies itself as the wiki, not Docmost', () => {
    const text = prompt();
    expect(text).toContain('Gobrax Wiki');
    expect(text).not.toContain('Docmost');
  });

  it('states the language to write in', () => {
    expect(prompt()).toContain('Brazilian Portuguese (pt-BR)');
    expect(prompt('Japanese')).toContain('Japanese');
  });

  it('warns the model off destructive replaces', () => {
    expect(prompt()).toMatch(/Never use "replace"/);
  });
});

describe('AiChatService.textSearchPages permission filtering', () => {
  function buildQuery(rows: unknown[]) {
    const query: any = {
      select: jest.fn(() => query),
      where: jest.fn(() => query),
      orderBy: jest.fn(() => query),
      limit: jest.fn(() => query),
      execute: jest.fn().mockResolvedValue(rows),
    };
    return query;
  }

  function buildService(rows: unknown[], accessiblePageIds: string[]) {
    const query = buildQuery(rows);
    const db = { selectFrom: jest.fn(() => query) };
    const pagePermissionRepo = {
      filterAccessiblePageIds: jest.fn().mockResolvedValue(accessiblePageIds),
    };

    const service = new AiChatService(
      db as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { getAppName: jest.fn() } as any,
      pagePermissionRepo as any,
    );

    return { service, pagePermissionRepo, query };
  }

  it('drops pages the user cannot read from the full-text fallback', async () => {
    const rows = [
      { id: 'page-a', title: 'A', textContent: 'alpha text' },
      { id: 'page-b', title: 'B', textContent: 'beta text' },
    ];
    const { service, pagePermissionRepo } = buildService(rows, ['page-a']);

    const result = await (service as any).textSearchPages({
      query: 'alpha search term',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      spaceIds: ['space-1'],
      exclude: new Set<string>(),
    });

    // If the permission filter were removed, both rows would survive and this
    // would equal ['page-a', 'page-b'] instead.
    expect(result.map((r: any) => r.id)).toEqual(['page-a']);
    expect(pagePermissionRepo.filterAccessiblePageIds).toHaveBeenCalledWith({
      pageIds: ['page-a', 'page-b'],
      userId: 'user-1',
    });
  });

  it('excludes already-in-context pages before checking permissions', async () => {
    const rows = [
      { id: 'page-a', title: 'A', textContent: 'alpha text' },
      { id: 'page-b', title: 'B', textContent: 'beta text' },
    ];
    const { service, pagePermissionRepo } = buildService(rows, [
      'page-a',
      'page-b',
    ]);

    await (service as any).textSearchPages({
      query: 'alpha search term',
      workspaceId: 'workspace-1',
      userId: 'user-1',
      spaceIds: ['space-1'],
      exclude: new Set(['page-b']),
    });

    expect(pagePermissionRepo.filterAccessiblePageIds).toHaveBeenCalledWith({
      pageIds: ['page-a'],
      userId: 'user-1',
    });
  });
});
