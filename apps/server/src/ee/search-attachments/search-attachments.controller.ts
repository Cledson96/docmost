import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SearchAttachmentsService } from './search-attachments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { IsNotEmpty, IsString, IsOptional, IsUUID } from 'class-validator';

class SearchAttachmentsDto {
  @IsString()
  @IsNotEmpty()
  query: string;

  @IsUUID()
  @IsOptional()
  spaceId?: string;
}

class IndexAttachmentsDto {
  @IsUUID()
  @IsOptional()
  workspaceId?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('search-attachments')
export class SearchAttachmentsController {
  constructor(private readonly searchService: SearchAttachmentsService) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  async search(
    @Body() dto: SearchAttachmentsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.searchService.search(dto.query, workspace.id, dto.spaceId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('indexing')
  async triggerIndexing(
    @Body() dto: IndexAttachmentsDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const wsId = dto.workspaceId || workspace.id;
    return this.searchService.triggerIndexing(wsId);
  }
}
