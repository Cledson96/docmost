import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JSONContent } from '@tiptap/core';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { TemplateRepo } from '@docmost/db/repos/template/template.repo';
import { UserRole } from '../../common/helpers/types/permission';
import { createYdocFromJson } from '../../common/helpers/prosemirror/utils';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import WorkspaceAbilityFactory from '../../core/casl/abilities/workspace-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../core/casl/interfaces/workspace-ability.type';
import { PageService } from '../../core/page/services/page.service';
import { jsonToNode, jsonToText } from '../../collaboration/collaboration.util';
import {
  CreateTemplateDto,
  ListTemplatesDto,
  UpdateTemplateDto,
  UseTemplateDto,
} from './dto/template.dto';

export const EMPTY_DOC: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

@Injectable()
export class TemplateService {
  constructor(
    private readonly templateRepo: TemplateRepo,
    private readonly spaceRepo: SpaceRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pageService: PageService,
    private readonly spaceAbilityFactory: SpaceAbilityFactory,
    private readonly workspaceAbilityFactory: WorkspaceAbilityFactory,
  ) {}

  async listTemplates(dto: ListTemplatesDto, user: User, workspace: Workspace) {
    const accessibleSpaceIds = await this.spaceMemberRepo.getUserSpaceIds(
      user.id,
    );

    return this.templateRepo.findTemplates(
      workspace.id,
      accessibleSpaceIds,
      dto,
      dto.spaceId ? { spaceId: dto.spaceId } : undefined,
    );
  }

  async getTemplate(templateId: string, user: User, workspace: Workspace) {
    const template = await this.findTemplate(templateId, workspace.id);
    await this.authorizeTemplateScope(template.spaceId, user, workspace, false);
    return template;
  }

  async createTemplate(
    dto: CreateTemplateDto,
    user: User,
    workspace: Workspace,
  ) {
    if (dto.spaceId) {
      await this.findSpace(dto.spaceId, workspace.id);
      await this.authorizeSpace(dto.spaceId, user, SpaceCaslAction.Edit);

      if (
        user.role === UserRole.MEMBER &&
        !this.memberTemplatesEnabled(workspace)
      ) {
        throw new ForbiddenException();
      }
    } else {
      this.authorizeWorkspaceSettings(user, workspace);
    }

    const normalized = this.normalizeContent(dto.content ?? EMPTY_DOC);
    const inserted = await this.templateRepo.insertTemplate({
      title: dto.title,
      description: dto.description,
      icon: dto.icon,
      content: normalized.content,
      textContent: normalized.textContent,
      ydoc: normalized.ydoc,
      spaceId: dto.spaceId ?? null,
      workspaceId: workspace.id,
      creatorId: user.id,
      lastUpdatedById: user.id,
    });

    return this.findTemplate(inserted.id, workspace.id);
  }

  async updateTemplate(
    dto: UpdateTemplateDto,
    user: User,
    workspace: Workspace,
  ) {
    const template = await this.findTemplate(dto.templateId, workspace.id);
    const mutableFields: Array<keyof UpdateTemplateDto> = [
      'title',
      'description',
      'icon',
      'content',
      'spaceId',
    ];

    await this.authorizeTemplateScope(template.spaceId, user, workspace, true);

    if (!mutableFields.some((field) => dto[field] !== undefined)) {
      throw new BadRequestException('No fields to update');
    }

    if (dto.spaceId !== undefined && dto.spaceId !== null) {
      await this.findSpace(dto.spaceId, workspace.id);
      await this.authorizeSpace(dto.spaceId, user, SpaceCaslAction.Edit);
    } else if (dto.spaceId === null) {
      this.authorizeWorkspaceSettings(user, workspace);
    }

    const update: Record<string, unknown> = {
      lastUpdatedById: user.id,
    };

    if (dto.title !== undefined) update.title = dto.title;
    if (dto.description !== undefined) update.description = dto.description;
    if (dto.icon !== undefined) update.icon = dto.icon;
    if (dto.spaceId !== undefined) update.spaceId = dto.spaceId;

    if (dto.content !== undefined) {
      const normalized = this.normalizeContent(dto.content);
      update.content = normalized.content;
      update.textContent = normalized.textContent;
      update.ydoc = normalized.ydoc;
    }

    await this.templateRepo.updateTemplate(update, template.id, workspace.id);

    return this.findTemplate(template.id, workspace.id);
  }

  async deleteTemplate(templateId: string, user: User, workspace: Workspace) {
    const template = await this.findTemplate(templateId, workspace.id);
    await this.authorizeTemplateScope(template.spaceId, user, workspace, true);
    await this.templateRepo.deleteTemplate(template.id, workspace.id);
  }

  async useTemplate(dto: UseTemplateDto, user: User, workspace: Workspace) {
    const template = await this.findTemplate(dto.templateId, workspace.id);
    await this.authorizeTemplateScope(template.spaceId, user, workspace, false);

    await this.findSpace(dto.spaceId, workspace.id);
    await this.authorizeSpaceForPageCreation(dto.spaceId, user);

    return this.pageService.create(user.id, workspace.id, {
      title: template.title,
      icon: template.icon,
      spaceId: dto.spaceId,
      parentPageId: dto.parentPageId,
      content: (template.content ?? EMPTY_DOC) as object,
      format: 'json',
    });
  }

  private async findTemplate(templateId: string, workspaceId: string) {
    const template = await this.templateRepo.findById(templateId, workspaceId, {
      includeContent: true,
    });

    if (!template) {
      throw new NotFoundException('Template not found');
    }

    return template;
  }

  private async findSpace(spaceId: string, workspaceId: string) {
    const space = await this.spaceRepo.findById(spaceId, workspaceId);
    if (!space) {
      throw new NotFoundException('Space not found');
    }
    return space;
  }

  private async authorizeTemplateScope(
    spaceId: string | null,
    user: User,
    workspace: Workspace,
    edit: boolean,
  ) {
    if (spaceId) {
      await this.authorizeSpace(
        spaceId,
        user,
        edit ? SpaceCaslAction.Edit : SpaceCaslAction.Read,
      );
      return;
    }

    if (edit) {
      this.authorizeWorkspaceSettings(user, workspace);
    }
  }

  private authorizeWorkspaceSettings(user: User, workspace: Workspace) {
    const ability = this.workspaceAbilityFactory.createForUser(user, workspace);
    if (
      !ability.can(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
  }

  private async authorizeSpace(
    spaceId: string,
    user: User,
    action: SpaceCaslAction,
  ) {
    try {
      const ability = await this.spaceAbilityFactory.createForUser(
        user,
        spaceId,
      );
      if (!ability.can(action, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new ForbiddenException();
      }
      throw error;
    }
  }

  private async authorizeSpaceForPageCreation(spaceId: string, user: User) {
    try {
      const ability = await this.spaceAbilityFactory.createForUser(
        user,
        spaceId,
      );
      const canCreate = ability.can(
        SpaceCaslAction.Create,
        SpaceCaslSubject.Page,
      );
      const canEdit = ability.can(SpaceCaslAction.Edit, SpaceCaslSubject.Page);

      if (!canCreate && !canEdit) {
        throw new ForbiddenException();
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new ForbiddenException();
      }
      throw error;
    }
  }

  private memberTemplatesEnabled(workspace: Workspace) {
    const settings = workspace.settings as {
      templates?: { allowMemberTemplates?: boolean };
    };
    return settings?.templates?.allowMemberTemplates === true;
  }

  private normalizeContent(input: Record<string, unknown> | JSONContent) {
    try {
      const content = jsonToNode(input).toJSON();
      return {
        content,
        textContent: jsonToText(content),
        ydoc: createYdocFromJson(content),
      };
    } catch {
      throw new BadRequestException('Invalid content format');
    }
  }
}
