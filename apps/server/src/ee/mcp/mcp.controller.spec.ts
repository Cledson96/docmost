import 'reflect-metadata';
import { SKIP_TRANSFORM_KEY } from '../../common/decorators/skip-transform.decorator';
import { McpController } from './mcp.controller';

jest.mock('./mcp.service', () => ({
  McpService: class McpService {},
}));

describe('McpController', () => {
  it('returns JSON-RPC responses without the global HTTP envelope', () => {
    const handler = McpController.prototype.handleMcpRpc;

    expect(Reflect.getMetadata(SKIP_TRANSFORM_KEY, handler)).toBe(true);
  });
});
