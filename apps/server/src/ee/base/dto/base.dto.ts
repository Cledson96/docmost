import { IsNotEmpty, IsString, IsOptional, IsUUID, IsArray, IsObject, IsNumber } from 'class-validator';

export class CreateBaseDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  icon?: string;

  @IsUUID()
  @IsOptional()
  pageId?: string;

  @IsUUID()
  @IsNotEmpty()
  spaceId: string;
}

export class UpdateBaseDto {
  @IsUUID()
  @IsNotEmpty()
  pageId: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  icon?: string;
}

export class PageIdDto {
  @IsUUID()
  @IsNotEmpty()
  pageId: string;
}

export class BaseIdDto {
  @IsUUID()
  @IsNotEmpty()
  pageId: string;
}

export class SpaceIdDto {
  @IsUUID()
  @IsNotEmpty()
  spaceId: string;
}

export class ConvertBaseDto {
  @IsUUID()
  @IsNotEmpty()
  pageId: string;

  @IsString()
  @IsOptional()
  template?: string;
}

export class CreatePropertyDto {
  @IsUUID()
  @IsNotEmpty()
  pageId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsObject()
  @IsOptional()
  typeOptions?: any;
}

export class UpdatePropertyDto {
  @IsString()
  @IsNotEmpty()
  propertyId: string;

  @IsUUID()
  @IsNotEmpty()
  pageId: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsObject()
  @IsOptional()
  typeOptions?: any;
}

export class DeletePropertyDto {
  @IsString()
  @IsNotEmpty()
  propertyId: string;

  @IsUUID()
  @IsNotEmpty()
  pageId: string;
}

export class ReorderPropertyDto {
  @IsString()
  @IsNotEmpty()
  propertyId: string;

  @IsUUID()
  @IsNotEmpty()
  pageId: string;

  @IsString()
  @IsNotEmpty()
  position: string;
}

export class CreateRowDto {
  @IsUUID()
  @IsNotEmpty()
  pageId: string;

  @IsObject()
  @IsOptional()
  cells?: Record<string, any>;

  @IsUUID()
  @IsOptional()
  afterRowId?: string;

  @IsString()
  @IsOptional()
  position?: string;
}

export class RowInfoDto {
  @IsUUID()
  @IsNotEmpty()
  rowId: string;

  @IsUUID()
  @IsNotEmpty()
  pageId: string;
}

export class UpdateRowDto {
  @IsUUID()
  @IsNotEmpty()
  rowId: string;

  @IsUUID()
  @IsNotEmpty()
  pageId: string;

  @IsObject()
  @IsNotEmpty()
  cells: Record<string, any>;

  @IsString()
  @IsOptional()
  position?: string;
}

export class DeleteRowDto {
  @IsUUID()
  @IsNotEmpty()
  rowId: string;

  @IsUUID()
  @IsNotEmpty()
  pageId: string;
}

export class DeleteRowsDto {
  @IsUUID()
  @IsNotEmpty()
  pageId: string;

  @IsArray()
  @IsNotEmpty()
  rowIds: string[];
}

export class ReorderRowDto {
  @IsUUID()
  @IsNotEmpty()
  rowId: string;

  @IsUUID()
  @IsNotEmpty()
  pageId: string;

  @IsString()
  @IsNotEmpty()
  position: string;
}

export class ListRowsDto {
  @IsUUID()
  @IsNotEmpty()
  pageId: string;

  @IsString()
  @IsOptional()
  cursor?: string;

  @IsNumber()
  @IsOptional()
  limit?: number;

  @IsObject()
  @IsOptional()
  filter?: any;

  @IsArray()
  @IsOptional()
  sorts?: any[];
}

export class CreateViewDto {
  @IsUUID()
  @IsNotEmpty()
  pageId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsObject()
  @IsOptional()
  config?: any;
}

export class UpdateViewDto {
  @IsUUID()
  @IsNotEmpty()
  viewId: string;

  @IsUUID()
  @IsNotEmpty()
  pageId: string;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsObject()
  @IsOptional()
  config?: any;

  @IsString()
  @IsOptional()
  position?: string;
}

export class DeleteViewDto {
  @IsUUID()
  @IsNotEmpty()
  viewId: string;

  @IsUUID()
  @IsNotEmpty()
  pageId: string;
}
