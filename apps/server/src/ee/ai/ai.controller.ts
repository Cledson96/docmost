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
import { AiService } from './ai.service';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @HttpCode(HttpStatus.OK)
  @Post('generate')
  async generate(
    @Body() body: { action?: string; content: string; prompt?: string },
  ) {
    return this.aiService.generate(body);
  }

  @Post('generate/stream')
  async generateStream(
    @Body() body: { action?: string; content: string; prompt?: string },
    @Res() res: Response,
  ) {
    const raw = (res as any).raw || res;
    raw.setHeader('Content-Type', 'text/event-stream');
    raw.setHeader('Cache-Control', 'no-cache');
    raw.setHeader('Connection', 'keep-alive');
    if (typeof raw.flushHeaders === 'function') {
      raw.flushHeaders();
    }

    try {
      for await (const chunk of this.aiService.generateStream(body)) {
        raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      raw.write('data: [DONE]\n\n');
    } catch (error: any) {
      raw.write(
        `data: ${JSON.stringify({ error: error?.message || 'An error occurred' })}\n\n`,
      );
    } finally {
      raw.end();
    }
  }
}
