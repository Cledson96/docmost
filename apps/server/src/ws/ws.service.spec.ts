import { WsService } from './ws.service';

describe('WsService', () => {
  function createService() {
    return new WsService({} as any, {} as any);
  }

  it('disconnects only sockets belonging to the specified session', async () => {
    const matchingSocket = {
      data: { sessionId: 'session-to-revoke' },
      disconnect: jest.fn(),
    };
    const otherSocket = {
      data: { sessionId: 'current-session' },
      disconnect: jest.fn(),
    };
    const service = createService();
    service.setServer({
      fetchSockets: jest.fn().mockResolvedValue([matchingSocket, otherSocket]),
    } as any);

    await service.disconnectSession('session-to-revoke');

    expect(matchingSocket.disconnect).toHaveBeenCalledTimes(1);
    expect(otherSocket.disconnect).not.toHaveBeenCalled();
  });

  it('does nothing before the Socket.IO server is initialized', async () => {
    const service = createService();

    await expect(
      service.disconnectSession('session-to-revoke'),
    ).resolves.toBeUndefined();
  });
});
