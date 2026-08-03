import { WsService } from './ws.service';

describe('WsService', () => {
  function createService() {
    return new WsService({} as any, {} as any);
  }

  it('disconnects only sockets belonging to the specified sessions with one socket lookup', async () => {
    const matchingSocket = {
      data: { sessionId: 'session-to-revoke' },
      disconnect: jest.fn(),
    };
    const otherSocket = {
      data: { sessionId: 'current-session' },
      disconnect: jest.fn(),
    };
    const service = createService();
    const fetchSockets = jest
      .fn()
      .mockResolvedValue([matchingSocket, otherSocket]);
    service.setServer({ fetchSockets } as any);

    await service.disconnectSessions(['session-to-revoke', 'another-session']);

    expect(fetchSockets).toHaveBeenCalledTimes(1);
    expect(matchingSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(otherSocket.disconnect).not.toHaveBeenCalled();
  });

  it('does not propagate socket lookup failures', async () => {
    const service = createService();
    service.setServer({
      fetchSockets: jest.fn().mockRejectedValue(new Error('Redis unavailable')),
    } as any);

    await expect(
      service.disconnectSessions(['session-to-revoke']),
    ).resolves.toBeUndefined();
  });

  it('continues disconnecting matching sockets when one disconnect fails', async () => {
    const failingSocket = {
      data: { sessionId: 'session-to-revoke' },
      disconnect: jest.fn(() => {
        throw new Error('disconnect failed');
      }),
    };
    const matchingSocket = {
      data: { sessionId: 'session-to-revoke' },
      disconnect: jest.fn(),
    };
    const service = createService();
    service.setServer({
      fetchSockets: jest.fn().mockResolvedValue([failingSocket, matchingSocket]),
    } as any);

    await service.disconnectSessions(['session-to-revoke']);

    expect(matchingSocket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('does nothing before the Socket.IO server is initialized', async () => {
    const service = createService();

    await expect(
      service.disconnectSession('session-to-revoke'),
    ).resolves.toBeUndefined();
  });
});
