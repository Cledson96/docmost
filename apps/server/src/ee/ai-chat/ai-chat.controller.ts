import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AiChatService } from './ai-chat.service';

@UseGuards(JwtAuthGuard)
@Controller('ai/chats')
export class AiChatController {
  constructor(private readonly aiChatService: AiChatService) {}

  @HttpCode(HttpStatus.OK)
  @Post('create')
  async createChat(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.aiChatService.createChat(user.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/')
  async listChats(
    @Body() body: { limit?: number; cursor?: string },
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.aiChatService.listChats(user.id, workspace.id, body);
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  async getChatInfo(
    @Body() body: { chatId: string },
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.aiChatService.getChatInfo(body.chatId, user.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async deleteChat(
    @Body() body: { chatId: string },
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.aiChatService.deleteChat(body.chatId, user.id, workspace.id);
    return { success: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async updateChatTitle(
    @Body() body: { chatId: string; title: string },
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.aiChatService.updateChatTitle(
      body.chatId,
      body.title,
      user.id,
      workspace.id,
    );
    return { success: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post('search')
  async searchChats(
    @Body() body: { query: string },
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.aiChatService.searchChats(body.query, user.id, workspace.id);
  }

  @Post('send')
  async sendMessage(
    @Body()
    body: {
      chatId?: string;
      content: string;
      mentionedPageIds?: string[];
      contextPageId?: string;
      attachmentIds?: string[];
    },
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    try {
      for await (const event of this.aiChatService.sendMessage(
        body,
        user.id,
        workspace.id,
      )) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      res.write('data: [DONE]\n\n');
    } catch (error: any) {
      const message = error?.message || 'An error occurred';
      const code = error?.status || error?.statusCode;
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          message,
          code: code ? String(code) : undefined,
          retryable: false,
        })}\n\n`,
      );
      res.write('data: [DONE]\n\n');
    } finally {
      res.end();
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('upload')
  async uploadFile(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    // Stub - file upload for AI chat context requires additional integration
    // with the attachment storage system
    return {
      id: null,
      fileName: '',
      fileExt: '',
      fileSize: 0,
      mimeType: '',
    };
  }
}
