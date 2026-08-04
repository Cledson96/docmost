import { CollaborationGateway } from './collaboration.gateway';

describe('CollaborationGateway', () => {
  it('runs a custom Yjs event locally when Redis synchronization is disabled', async () => {
    const result = { revision: 'revision', content: { type: 'doc' } };
    const localHandler = jest.fn().mockResolvedValue(result);
    const gateway = Object.create(CollaborationGateway.prototype) as {
      redisSync: undefined;
      hocuspocus: object;
      collabEventsService: {
        getHandlers: jest.Mock;
      };
      handleYjsEvent: CollaborationGateway['handleYjsEvent'];
    };
    gateway.redisSync = undefined;
    gateway.hocuspocus = {};
    gateway.collabEventsService = {
      getHandlers: jest.fn().mockReturnValue({ getPageSnapshot: localHandler }),
    };

    await expect(
      gateway.handleYjsEvent('getPageSnapshot', 'page-1', {
        user: {} as any,
      }),
    ).resolves.toEqual(result);
    expect(localHandler).toHaveBeenCalledWith('page-1', { user: {} });
  });
});
