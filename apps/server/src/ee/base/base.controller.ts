import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  Res,
} from '@nestjs/common';
import { BaseService } from './base.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { FastifyReply } from 'fastify';
import {
  CreateBaseDto,
  UpdateBaseDto,
  PageIdDto,
  ConvertBaseDto,
  SpaceIdDto,
  CreatePropertyDto,
  UpdatePropertyDto,
  DeletePropertyDto,
  ReorderPropertyDto,
  CreateRowDto,
  RowInfoDto,
  UpdateRowDto,
  DeleteRowDto,
  DeleteRowsDto,
  ListRowsDto,
  ReorderRowDto,
  CreateViewDto,
  UpdateViewDto,
  DeleteViewDto,
} from './dto/base.dto';

@UseGuards(JwtAuthGuard)
@Controller('bases')
export class BaseController {
  constructor(private readonly baseService: BaseService) {}

  @HttpCode(HttpStatus.OK)
  @Post('create')
  async createBase(
    @Body() dto: CreateBaseDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.createBase(dto, user.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  async getBaseInfo(
    @Body() dto: PageIdDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.getBaseInfo(dto.pageId, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async updateBase(
    @Body() dto: UpdateBaseDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.updateBase(dto, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async deleteBase(
    @Body() dto: PageIdDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.deleteBase(dto.pageId, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('convert')
  async convertPageToBase(
    @Body() dto: ConvertBaseDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.convertPageToBase(dto.pageId, dto.template, user.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('export-csv')
  async exportBaseToCsv(
    @Body() dto: PageIdDto,
    @AuthWorkspace() workspace: Workspace,
    @Res() res: FastifyReply,
  ) {
    const csvContent = await this.baseService.exportToCsv(dto.pageId, workspace.id);
    const fileName = `export-${dto.pageId}.csv`;

    res.header('Content-Type', 'text/csv; charset=utf-8');
    res.header('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(csvContent);
  }

  @HttpCode(HttpStatus.OK)
  @Post()
  async listBases(
    @Body() dto: SpaceIdDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.listBases(dto.spaceId, workspace.id);
  }

  // Properties
  @HttpCode(HttpStatus.OK)
  @Post('properties/create')
  async createProperty(
    @Body() dto: CreatePropertyDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.createProperty(dto, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('properties/update')
  async updateProperty(
    @Body() dto: UpdatePropertyDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.updateProperty(dto, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('properties/delete')
  async deleteProperty(
    @Body() dto: DeletePropertyDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.deleteProperty(dto.propertyId, dto.pageId, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('properties/reorder')
  async reorderProperty(
    @Body() dto: ReorderPropertyDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.reorderProperty(dto.propertyId, dto.pageId, dto.position, workspace.id);
  }

  // Rows
  @HttpCode(HttpStatus.OK)
  @Post('rows/create')
  async createRow(
    @Body() dto: CreateRowDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.createRow(dto, user.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/info')
  async getRowInfo(
    @Body() dto: RowInfoDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.getRowInfo(dto.rowId, dto.pageId, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/update')
  async updateRow(
    @Body() dto: UpdateRowDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.updateRow(dto, user.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/delete')
  async deleteRow(
    @Body() dto: DeleteRowDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.deleteRow(dto.rowId, dto.pageId, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/delete-many')
  async deleteRows(
    @Body() dto: DeleteRowsDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.deleteRows(dto.rowIds, dto.pageId, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows')
  async listRows(
    @Body() dto: ListRowsDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.listRows(dto, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('rows/reorder')
  async reorderRow(
    @Body() dto: ReorderRowDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.reorderRow(dto.rowId, dto.pageId, dto.position, workspace.id);
  }

  // Views
  @HttpCode(HttpStatus.OK)
  @Post('views/create')
  async createView(
    @Body() dto: CreateViewDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.createView(dto, user.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('views/update')
  async updateView(
    @Body() dto: UpdateViewDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.updateView(dto, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('views/delete')
  async deleteView(
    @Body() dto: DeleteViewDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.deleteView(dto.viewId, dto.pageId, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('views')
  async listViews(
    @Body() dto: PageIdDto,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.baseService.listViews(dto.pageId, workspace.id);
  }
}
