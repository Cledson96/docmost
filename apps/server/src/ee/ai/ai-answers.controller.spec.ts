jest.mock('ai', () => ({
  streamText: jest.fn().mockReturnValue({
    textStream: (async function* () {})(),
  }),
}));

import { AiAnswersController } from './ai-answers.controller';

describe('AiAnswersController', () => {
  function build() {
    const where = jest.fn();
    const query: any = {
      select: jest.fn(() => query),
      innerJoin: jest.fn(() => query),
      where: jest.fn((...args: unknown[]) => {
        where(...args);
        return query;
      }),
      limit: jest.fn(() => query),
      execute: jest.fn().mockResolvedValue([]),
      executeTakeFirst: jest.fn().mockResolvedValue(undefined),
    };

    const db = { selectFrom: jest.fn(() => query) };
    const spaceMemberRepo = {
      getUserSpaceIdsQuery: jest.fn().mockReturnValue('SPACE_SUBQUERY'),
    };
    const providerFactory = {
      isConfigured: jest.fn().mockResolvedValue(true),
      getChatModel: jest.fn().mockResolvedValue('fake-model'),
    };
    const environmentService = {
      getAppName: jest.fn().mockReturnValue('Docmost'),
    };

    const controller = new AiAnswersController(
      db as any,
      providerFactory as any,
      environmentService as any,
      spaceMemberRepo as any,
    );

    return { controller, where, spaceMemberRepo, db };
  }

  function buildRes() {
    return {
      raw: {
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
      },
    };
  }

  it('restricts the answers search to spaces the user belongs to', async () => {
    const { controller, where, spaceMemberRepo } = build();
    const res = buildRes();

    await controller.aiAnswers(
      { query: 'runbook' },
      { id: 'user-1', locale: 'en' } as any,
      { id: 'workspace-1' } as any,
      res as any,
    );

    expect(spaceMemberRepo.getUserSpaceIdsQuery).toHaveBeenCalledWith(
      'user-1',
    );
    expect(where).toHaveBeenCalledWith('spaceId', 'in', 'SPACE_SUBQUERY');
  });

  it('still applies the space filter when a spaceId is supplied', async () => {
    const { controller, where } = build();
    const res = buildRes();

    await controller.aiAnswers(
      { query: 'runbook', spaceId: 'space-9' },
      { id: 'user-1', locale: 'en' } as any,
      { id: 'workspace-1' } as any,
      res as any,
    );

    expect(where).toHaveBeenCalledWith('spaceId', 'in', 'SPACE_SUBQUERY');
    expect(where).toHaveBeenCalledWith('spaceId', '=', 'space-9');
  });
});
