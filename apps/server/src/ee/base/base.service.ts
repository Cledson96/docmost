import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { sql } from 'kysely';
import { randomUUID } from 'crypto';
import {
  CreateBaseDto,
  UpdateBaseDto,
  CreatePropertyDto,
  UpdatePropertyDto,
  CreateRowDto,
  UpdateRowDto,
  ListRowsDto,
  CreateViewDto,
  UpdateViewDto,
} from './dto/base.dto';

function getNextPosition(lastPos?: string): string {
  if (!lastPos) return 'h0';
  const charCode = lastPos.charCodeAt(lastPos.length - 1);
  if (charCode < 122) { // 'z'
    return lastPos.slice(0, -1) + String.fromCharCode(charCode + 1);
  }
  return lastPos + 'h';
}

@Injectable()
export class BaseService {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async createBase(dto: CreateBaseDto, userId: string, workspaceId: string) {
    const pageId = dto.pageId || randomUUID();

    // 1. Create page
    const page = await this.db
      .insertInto('pages')
      .values({
        id: pageId,
        title: dto.name,
        isBase: true,
        baseSchemaVersion: 1,
        spaceId: dto.spaceId,
        workspaceId,
        creatorId: userId,
        lastUpdatedById: userId,
        slugId: randomUUID().substring(0, 8),
        position: 'a0',
        content: JSON.stringify({ type: 'doc', content: [] }),
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // 2. Create default primary property "Title"
    const propId = randomUUID().substring(0, 8);
    await this.db
      .insertInto('baseProperties')
      .values({
        id: propId,
        pageId: pageId,
        name: 'Title',
        type: 'text',
        position: 'h0',
        isPrimary: true,
        schemaVersion: 1,
        workspaceId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();

    // 3. Create default view
    await this.db
      .insertInto('baseViews')
      .values({
        id: randomUUID(),
        pageId: pageId,
        name: 'Table',
        type: 'table',
        position: 'h0',
        config: JSON.stringify({}),
        workspaceId,
        creatorId: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .execute();

    return this.getBaseInfo(pageId, workspaceId);
  }

  async getBaseInfo(pageId: string, workspaceId: string) {
    const page = await this.db
      .selectFrom('pages')
      .selectAll()
      .where('id', '=', pageId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!page) {
      throw new NotFoundException('Base not found');
    }

    const properties = await this.db
      .selectFrom('baseProperties')
      .selectAll()
      .where('pageId', '=', pageId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .orderBy('position asc')
      .execute();

    const views = await this.db
      .selectFrom('baseViews')
      .selectAll()
      .where('pageId', '=', pageId)
      .where('workspaceId', '=', workspaceId)
      .orderBy('position asc')
      .execute();

    // Parse typeOptions and config JSON fields
    const formattedProperties = properties.map((p) => ({
      ...p,
      typeOptions: typeof p.typeOptions === 'string' ? JSON.parse(p.typeOptions) : p.typeOptions || {},
      pendingTypeOptions: typeof p.pendingTypeOptions === 'string' ? JSON.parse(p.pendingTypeOptions) : p.pendingTypeOptions || null,
    }));

    const formattedViews = views.map((v) => ({
      ...v,
      config: typeof v.config === 'string' ? JSON.parse(v.config) : v.config || {},
    }));

    return {
      id: page.id,
      slugId: page.slugId,
      name: page.title,
      spaceId: page.spaceId,
      workspaceId: page.workspaceId,
      creatorId: page.creatorId,
      properties: formattedProperties,
      views: formattedViews,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      baseSchemaVersion: page.baseSchemaVersion,
      permissions: {
        canEdit: true,
        hasRestriction: false,
      },
    };
  }

  async updateBase(dto: UpdateBaseDto, workspaceId: string) {
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (dto.name !== undefined) updateData.title = dto.name;

    await this.db
      .updateTable('pages')
      .set(updateData)
      .where('id', '=', dto.pageId)
      .where('workspaceId', '=', workspaceId)
      .execute();

    return this.getBaseInfo(dto.pageId, workspaceId);
  }

  async deleteBase(pageId: string, workspaceId: string) {
    await this.db
      .updateTable('pages')
      .set({ deletedAt: new Date() })
      .where('id', '=', pageId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async convertPageToBase(pageId: string, template: string | undefined, userId: string, workspaceId: string) {
    await this.db
      .updateTable('pages')
      .set({
        isBase: true,
        baseSchemaVersion: 1,
        updatedAt: new Date(),
      })
      .where('id', '=', pageId)
      .where('workspaceId', '=', workspaceId)
      .execute();

    // Check if properties already exist, if not create default
    const existingProps = await this.db
      .selectFrom('baseProperties')
      .select('id')
      .where('pageId', '=', pageId)
      .execute();

    if (existingProps.length === 0) {
      const propId = randomUUID().substring(0, 8);
      await this.db
        .insertInto('baseProperties')
        .values({
          id: propId,
          pageId,
          name: 'Title',
          type: 'text',
          position: 'h0',
          isPrimary: true,
          schemaVersion: 1,
          workspaceId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute();
    }

    // Check if views exist, if not create default
    const existingViews = await this.db
      .selectFrom('baseViews')
      .select('id')
      .where('pageId', '=', pageId)
      .execute();

    if (existingViews.length === 0) {
      await this.db
        .insertInto('baseViews')
        .values({
          id: randomUUID(),
          pageId,
          name: template === 'kanban' ? 'Kanban' : 'Table',
          type: template === 'kanban' ? 'kanban' : 'table',
          position: 'h0',
          config: JSON.stringify({}),
          workspaceId,
          creatorId: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .execute();
    }

    return this.getBaseInfo(pageId, workspaceId);
  }

  async listBases(spaceId: string, workspaceId: string) {
    const bases = await this.db
      .selectFrom('pages')
      .selectAll()
      .where('spaceId', '=', spaceId)
      .where('workspaceId', '=', workspaceId)
      .where('isBase', '=', true)
      .where('deletedAt', 'is', null)
      .execute();

    const items = [];
    for (const base of bases) {
      const info = await this.getBaseInfo(base.id, workspaceId);
      items.push(info);
    }

    return { items };
  }

  // Properties CRUD
  async createProperty(dto: CreatePropertyDto, workspaceId: string) {
    const id = randomUUID().substring(0, 8);

    const lastProp = await this.db
      .selectFrom('baseProperties')
      .select('position')
      .where('pageId', '=', dto.pageId)
      .where('deletedAt', 'is', null)
      .orderBy('position desc')
      .executeTakeFirst();

    const position = getNextPosition(lastProp?.position);

    const prop = await this.db
      .insertInto('baseProperties')
      .values({
        id,
        pageId: dto.pageId,
        name: dto.name,
        type: dto.type as any,
        position,
        typeOptions: dto.typeOptions ? JSON.stringify(dto.typeOptions) : null,
        isPrimary: false,
        schemaVersion: 1,
        workspaceId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      ...prop,
      typeOptions: dto.typeOptions || {},
    };
  }

  async updateProperty(dto: UpdatePropertyDto, workspaceId: string) {
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.type !== undefined) updateData.type = dto.type;
    if (dto.typeOptions !== undefined) {
      updateData.typeOptions = JSON.stringify(dto.typeOptions);
    }

    const prop = await this.db
      .updateTable('baseProperties')
      .set(updateData)
      .where('id', '=', dto.propertyId)
      .where('pageId', '=', dto.pageId)
      .where('workspaceId', '=', workspaceId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      property: {
        ...prop,
        typeOptions: dto.typeOptions || (typeof prop.typeOptions === 'string' ? JSON.parse(prop.typeOptions) : prop.typeOptions || {}),
      },
      jobId: null,
    };
  }

  async deleteProperty(propertyId: string, pageId: string, workspaceId: string) {
    await this.db
      .updateTable('baseProperties')
      .set({ deletedAt: new Date() })
      .where('id', '=', propertyId)
      .where('pageId', '=', pageId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async reorderProperty(propertyId: string, pageId: string, position: string, workspaceId: string) {
    await this.db
      .updateTable('baseProperties')
      .set({ position, updatedAt: new Date() })
      .where('id', '=', propertyId)
      .where('pageId', '=', pageId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  // Rows CRUD
  async createRow(dto: CreateRowDto, userId: string, workspaceId: string) {
    const id = randomUUID();

    const lastRow = await this.db
      .selectFrom('baseRows')
      .select('position')
      .where('pageId', '=', dto.pageId)
      .where('deletedAt', 'is', null)
      .orderBy('position desc')
      .executeTakeFirst();

    const position = dto.position || getNextPosition(lastRow?.position);

    const row = await this.db
      .insertInto('baseRows')
      .values({
        id,
        pageId: dto.pageId,
        cells: dto.cells ? JSON.stringify(dto.cells) : '{}',
        position,
        creatorId: userId,
        lastUpdatedById: userId,
        workspaceId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      ...row,
      cells: dto.cells || {},
    };
  }

  async getRowInfo(rowId: string, pageId: string, workspaceId: string) {
    const row = await this.db
      .selectFrom('baseRows')
      .selectAll()
      .where('id', '=', rowId)
      .where('pageId', '=', pageId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!row) throw new NotFoundException('Row not found');

    return {
      ...row,
      cells: typeof row.cells === 'string' ? JSON.parse(row.cells) : row.cells || {},
    };
  }

  async updateRow(dto: UpdateRowDto, userId: string, workspaceId: string) {
    const existing = await this.getRowInfo(dto.rowId, dto.pageId, workspaceId);

    const mergedCells = {
      ...existing.cells,
      ...dto.cells,
    };

    const updateData: any = {
      cells: JSON.stringify(mergedCells),
      lastUpdatedById: userId,
      updatedAt: new Date(),
    };

    if (dto.position) updateData.position = dto.position;

    const row = await this.db
      .updateTable('baseRows')
      .set(updateData)
      .where('id', '=', dto.rowId)
      .where('pageId', '=', dto.pageId)
      .where('workspaceId', '=', workspaceId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      ...row,
      cells: mergedCells,
    };
  }

  async deleteRow(rowId: string, pageId: string, workspaceId: string) {
    await this.db
      .updateTable('baseRows')
      .set({ deletedAt: new Date() })
      .where('id', '=', rowId)
      .where('pageId', '=', pageId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async deleteRows(rowIds: string[], pageId: string, workspaceId: string) {
    await this.db
      .updateTable('baseRows')
      .set({ deletedAt: new Date() })
      .where('id', 'in', rowIds)
      .where('pageId', '=', pageId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async listRows(dto: ListRowsDto, workspaceId: string) {
    const limit = dto.limit || 50;

    let query = this.db
      .selectFrom('baseRows')
      .selectAll()
      .where('pageId', '=', dto.pageId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null);

    if (dto.cursor) {
      query = query.where('position', '>', dto.cursor);
    }

    query = query.orderBy('position asc').limit(limit + 1);

    const rows = await query.execute();

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map((r) => ({
      ...r,
      cells: typeof r.cells === 'string' ? JSON.parse(r.cells) : r.cells || {},
    }));

    const nextCursor = hasMore ? items[items.length - 1].position : null;

    // Fetch user mappings for references
    const creatorIds = [...new Set(items.map((i) => i.creatorId).filter(Boolean))];
    const updaterIds = [...new Set(items.map((i) => i.lastUpdatedById).filter(Boolean))];
    const userIds = [...new Set([...creatorIds, ...updaterIds])];

    const usersMap: Record<string, any> = {};
    if (userIds.length > 0) {
      const dbUsers = await this.db
        .selectFrom('users')
        .select(['id', 'name', 'avatarUrl'])
        .where('id', 'in', userIds)
        .execute();

      for (const u of dbUsers) {
        usersMap[u.id] = u;
      }
    }

    return {
      items,
      meta: {
        hasMore,
        nextCursor,
      },
      references: {
        users: usersMap,
        pages: {},
      },
    };
  }

  async reorderRow(rowId: string, pageId: string, position: string, workspaceId: string) {
    await this.db
      .updateTable('baseRows')
      .set({ position, updatedAt: new Date() })
      .where('id', '=', rowId)
      .where('pageId', '=', pageId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  // Views CRUD
  async createView(dto: CreateViewDto, userId: string, workspaceId: string) {
    const id = randomUUID();

    const lastView = await this.db
      .selectFrom('baseViews')
      .select('position')
      .where('pageId', '=', dto.pageId)
      .orderBy('position desc')
      .executeTakeFirst();

    const position = getNextPosition(lastView?.position);

    const view = await this.db
      .insertInto('baseViews')
      .values({
        id,
        pageId: dto.pageId,
        name: dto.name,
        type: dto.type || 'table',
        position,
        config: dto.config ? JSON.stringify(dto.config) : '{}',
        workspaceId,
        creatorId: userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      ...view,
      config: dto.config || {},
    };
  }

  async updateView(dto: UpdateViewDto, workspaceId: string) {
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.type !== undefined) updateData.type = dto.type;
    if (dto.config !== undefined) updateData.config = JSON.stringify(dto.config);
    if (dto.position !== undefined) updateData.position = dto.position;

    const view = await this.db
      .updateTable('baseViews')
      .set(updateData)
      .where('id', '=', dto.viewId)
      .where('pageId', '=', dto.pageId)
      .where('workspaceId', '=', workspaceId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      ...view,
      config: dto.config || (typeof view.config === 'string' ? JSON.parse(view.config) : view.config || {}),
    };
  }

  async deleteView(viewId: string, pageId: string, workspaceId: string) {
    await this.db
      .deleteFrom('baseViews')
      .where('id', '=', viewId)
      .where('pageId', '=', pageId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async listViews(pageId: string, workspaceId: string) {
    const views = await this.db
      .selectFrom('baseViews')
      .selectAll()
      .where('pageId', '=', pageId)
      .where('workspaceId', '=', workspaceId)
      .orderBy('position asc')
      .execute();

    return views.map((v) => ({
      ...v,
      config: typeof v.config === 'string' ? JSON.parse(v.config) : v.config || {},
    }));
  }

  // Export to CSV
  async exportToCsv(pageId: string, workspaceId: string): Promise<string> {
    const properties = await this.db
      .selectFrom('baseProperties')
      .selectAll()
      .where('pageId', '=', pageId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .orderBy('position asc')
      .execute();

    const rows = await this.db
      .selectFrom('baseRows')
      .selectAll()
      .where('pageId', '=', pageId)
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null)
      .orderBy('position asc')
      .execute();

    // Build CSV Headers
    const headers = properties.map((p) => p.name);
    let csv = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';

    // Build CSV Rows
    for (const row of rows) {
      const cells = typeof row.cells === 'string' ? JSON.parse(row.cells) : row.cells || {};
      const rowValues = properties.map((prop) => {
        const val = cells[prop.id];
        if (val === undefined || val === null) return '';
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
      });
      csv += rowValues.map(v => `"${v.replace(/"/g, '""')}"`).join(',') + '\n';
    }

    return csv;
  }
}
