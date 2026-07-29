import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { McpService } from './mcp.service';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';

@Controller(['mcp', 'api/mcp'])
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async getInfo() {
    return {
      status: 'active',
      name: 'Docmost MCP Server (Model Context Protocol)',
      version: '1.0.0',
      description:
        'Connect any AI Agent (Claude Desktop, Antigravity, Cursor, etc.) to read and create pages in your Docmost wiki.',
      endpoint: '/mcp',
      authentication: 'Bearer <API_KEY>',
    };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @SkipTransform()
  async handleMcpRpc(
    @Body() body: any,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.mcpService.handleRpcRequest(body, user, workspace);
  }
}
