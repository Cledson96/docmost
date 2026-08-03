import { SessionService } from './session.service';

describe('SessionService', () => {
  it('disconnects a session after revoking it', async () => {
    const userSessionRepo = {
      revokeById: jest.fn().mockResolvedValue(undefined),
    };
    const wsService = {
      disconnectSession: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SessionService(
      {} as any,
      userSessionRepo as any,
      {} as any,
      {} as any,
      wsService as any,
    );

    await service.revokeSession('session-to-revoke', 'user-1', 'workspace-1');

    expect(wsService.disconnectSession).toHaveBeenCalledWith('session-to-revoke');
  });

  it('disconnects all active sessions except the current session after revoking them', async () => {
    const userSessionRepo = {
      findActiveByUser: jest.fn().mockResolvedValue([
        { id: 'current-session' },
        { id: 'session-a' },
        { id: 'session-b' },
      ]),
      revokeAllExceptCurrent: jest.fn().mockResolvedValue(undefined),
    };
    const wsService = {
      disconnectSession: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SessionService(
      {} as any,
      userSessionRepo as any,
      {} as any,
      {} as any,
      wsService as any,
    );

    await service.revokeAllOtherSessions(
      'current-session',
      'user-1',
      'workspace-1',
    );

    expect(wsService.disconnectSession).toHaveBeenCalledTimes(2);
    expect(wsService.disconnectSession).toHaveBeenCalledWith('session-a');
    expect(wsService.disconnectSession).toHaveBeenCalledWith('session-b');
    expect(wsService.disconnectSession).not.toHaveBeenCalledWith(
      'current-session',
    );
  });
});
