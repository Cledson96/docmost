import { Socket } from 'socket.io';
import { UserSession } from '@docmost/db/types/entity.types';
import { JwtType } from '../core/auth/dto/jwt-payload';
import { WsGateway } from './ws.gateway';

describe('WsGateway', () => {
  const activeSession: UserSession = {
    id: 'session-1',
    userId: 'user-1',
    workspaceId: 'workspace-1',
    deviceName: null,
    userAgent: null,
    ipAddress: null,
    geoLocation: null,
    metadata: null,
    lastActiveAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    createdAt: new Date(),
  };

  function createClient() {
    return {
      handshake: { headers: { cookie: 'authToken=valid-token' } },
      data: {},
      emit: jest.fn(),
      disconnect: jest.fn(),
      join: jest.fn(),
    } as unknown as Socket;
  }

  function createGateway(session: UserSession | undefined) {
    const tokenService = {
      verifyJwt: jest.fn().mockResolvedValue({
        sub: 'user-1',
        email: 'user@example.com',
        workspaceId: 'workspace-1',
        type: JwtType.ACCESS,
        sessionId: 'session-1',
      }),
    };
    const spaceMemberRepo = { getUserSpaceIds: jest.fn().mockResolvedValue([]) };
    const gateway = new WsGateway(
      tokenService as any,
      { findActiveById: jest.fn().mockResolvedValue(session) } as any,
      spaceMemberRepo as any,
      { setServer: jest.fn(), isTreeEvent: jest.fn() } as any,
      { setServer: jest.fn() } as any,
    );

    return gateway;
  }

  it('disconnects a client whose valid token has no active session', async () => {
    const client = createClient();
    const gateway = createGateway(undefined);

    await gateway.handleConnection(client);

    expect(client.emit).toHaveBeenCalledWith('Unauthorized');
    expect(client.disconnect).toHaveBeenCalled();
  });

  it('stores the active session id and joins rooms for a valid session', async () => {
    const client = createClient();
    const gateway = createGateway(activeSession);

    await gateway.handleConnection(client);

    expect(client.data.sessionId).toBe('session-1');
    expect(client.join).toHaveBeenCalledWith(['user-user-1', 'workspace-workspace-1']);
  });
});
