import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../../common/helpers/types/permission';
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
import { SpaceMemberRepo } from '../../database/repos/space/space-member.repo';
import { SpaceRepo } from '../../database/repos/space/space.repo';
import { TemplateRepo } from '../../database/repos/template/template.repo';
import { Template, User, Workspace } from '../../database/types/entity.types';
import { ListTemplatesDto } from './dto/template.dto';
import { TemplateService } from './template.service';

type TemplateRepoMock = {
  findById: jest.MockedFunction<TemplateRepo['findById']>;
  findTemplates: jest.MockedFunction<TemplateRepo['findTemplates']>;
  insertTemplate: jest.MockedFunction<TemplateRepo['insertTemplate']>;
  updateTemplate: jest.MockedFunction<TemplateRepo['updateTemplate']>;
  deleteTemplate: jest.MockedFunction<TemplateRepo['deleteTemplate']>;
};

type SpaceRepoMock = {
  findById: jest.MockedFunction<SpaceRepo['findById']>;
};

type SpaceMemberRepoMock = {
  getUserSpaceIds: jest.MockedFunction<SpaceMemberRepo['getUserSpaceIds']>;
};

type PageServiceMock = {
  create: jest.MockedFunction<PageService['create']>;
};

type SpaceAbilityMock = {
  createForUser: jest.MockedFunction<SpaceAbilityFactory['createForUser']>;
};

type WorkspaceAbilityMock = {
  createForUser: jest.MockedFunction<WorkspaceAbilityFactory['createForUser']>;
};

const workspace = {
  id: 'workspace-1',
  settings: { templates: { allowMemberTemplates: false } },
} as unknown as Workspace;

const admin = { id: 'admin-1', role: UserRole.ADMIN } as User;
const member = { id: 'member-1', role: UserRole.MEMBER } as User;
const content = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
};

const template = (overrides: Partial<Template> = {}) =>
  ({
    id: 'template-1',
    title: 'Template title',
    description: 'Description',
    icon: 'book',
    content,
    spaceId: null,
    workspaceId: workspace.id,
    creatorId: admin.id,
    lastUpdatedById: admin.id,
    ...overrides,
  }) as Template;

describe('TemplateService', () => {
  let service: TemplateService;
  let templateRepo: TemplateRepoMock;
  let spaceRepo: SpaceRepoMock;
  let spaceMemberRepo: SpaceMemberRepoMock;
  let pageService: PageServiceMock;
  let spaceAbility: SpaceAbilityMock;
  let workspaceAbility: WorkspaceAbilityMock;
  let canSpace: jest.Mock<boolean, [SpaceCaslAction, SpaceCaslSubject]>;
  let canWorkspace: jest.Mock<
    boolean,
    [WorkspaceCaslAction, WorkspaceCaslSubject]
  >;

  beforeEach(() => {
    templateRepo = {
      findById: jest.fn(),
      findTemplates: jest.fn(),
      insertTemplate: jest.fn(),
      updateTemplate: jest.fn(),
      deleteTemplate: jest.fn(),
    };
    spaceRepo = { findById: jest.fn() };
    spaceMemberRepo = { getUserSpaceIds: jest.fn() };
    pageService = { create: jest.fn() };
    canSpace = jest.fn().mockReturnValue(true);
    canWorkspace = jest.fn().mockReturnValue(true);
    spaceAbility = {
      createForUser: jest.fn().mockResolvedValue({ can: canSpace }),
    } as unknown as SpaceAbilityMock;
    workspaceAbility = {
      createForUser: jest.fn().mockReturnValue({ can: canWorkspace }),
    } as unknown as WorkspaceAbilityMock;

    service = new TemplateService(
      templateRepo as unknown as TemplateRepo,
      spaceRepo as unknown as SpaceRepo,
      spaceMemberRepo as unknown as SpaceMemberRepo,
      pageService as unknown as PageService,
      spaceAbility as unknown as SpaceAbilityFactory,
      workspaceAbility as unknown as WorkspaceAbilityFactory,
    );
  });

  it('lists only templates in accessible spaces and forwards pagination', async () => {
    const dto = Object.assign(new ListTemplatesDto(), {
      limit: 25,
      cursor: 'cursor',
      spaceId: 'space-1',
    });
    const result = { items: [template()], meta: {} };
    spaceMemberRepo.getUserSpaceIds.mockResolvedValue(['space-1', 'space-2']);
    templateRepo.findTemplates.mockResolvedValue(result as never);

    await expect(service.listTemplates(dto, member, workspace)).resolves.toBe(
      result,
    );
    expect(templateRepo.findTemplates).toHaveBeenCalledWith(
      workspace.id,
      ['space-1', 'space-2'],
      dto,
      { spaceId: 'space-1' },
    );
  });

  it('allows every workspace member to read a global template', async () => {
    const globalTemplate = template();
    templateRepo.findById.mockResolvedValue(globalTemplate);

    await expect(
      service.getTemplate(globalTemplate.id, member, workspace),
    ).resolves.toBe(globalTemplate);
    expect(spaceAbility.createForUser).not.toHaveBeenCalled();
  });

  it('requires page read permission for a space template', async () => {
    const scopedTemplate = template({ spaceId: 'space-1' });
    templateRepo.findById.mockResolvedValue(scopedTemplate);

    await expect(
      service.getTemplate(scopedTemplate.id, member, workspace),
    ).resolves.toBe(scopedTemplate);
    expect(canSpace).toHaveBeenCalledWith(
      SpaceCaslAction.Read,
      SpaceCaslSubject.Page,
    );
  });

  it('hides missing and cross-workspace templates with a 404', async () => {
    templateRepo.findById.mockResolvedValue(undefined);

    await expect(
      service.getTemplate('outside-template', member, workspace),
    ).rejects.toEqual(new NotFoundException('Template not found'));
    expect(templateRepo.findById).toHaveBeenCalledWith(
      'outside-template',
      workspace.id,
      { includeContent: true },
    );
  });

  it('returns 403 when a found space template is not readable', async () => {
    templateRepo.findById.mockResolvedValue(
      template({ spaceId: 'space-private' }),
    );
    canSpace.mockReturnValue(false);

    await expect(
      service.getTemplate('template-1', member, workspace),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('converts missing space membership to 403 after finding the template', async () => {
    templateRepo.findById.mockResolvedValue(
      template({ spaceId: 'space-private' }),
    );
    spaceAbility.createForUser.mockRejectedValue(
      new NotFoundException('Space permissions not found'),
    );

    await expect(
      service.getTemplate('template-1', member, workspace),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows an admin to create a normalized global template', async () => {
    templateRepo.insertTemplate.mockResolvedValue({ id: 'new-template' });
    const created = template({ id: 'new-template' });
    templateRepo.findById.mockResolvedValue(created);

    await expect(
      service.createTemplate(
        { title: 'Template title', description: 'Description', content },
        admin,
        workspace,
      ),
    ).resolves.toBe(created);

    expect(canWorkspace).toHaveBeenCalledWith(
      WorkspaceCaslAction.Manage,
      WorkspaceCaslSubject.Settings,
    );
    expect(templateRepo.insertTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Template title',
        description: 'Description',
        spaceId: null,
        workspaceId: workspace.id,
        creatorId: admin.id,
        lastUpdatedById: admin.id,
        content: expect.objectContaining({
          type: 'doc',
          content: [
            expect.objectContaining({
              type: 'paragraph',
              attrs: expect.objectContaining({
                id: null,
                indent: 0,
                textAlign: null,
              }),
            }),
          ],
        }),
        textContent: 'Hello',
        ydoc: expect.any(Buffer),
      }),
    );
  });

  it('uses an empty document when create content is absent', async () => {
    templateRepo.insertTemplate.mockResolvedValue({ id: 'new-template' });
    templateRepo.findById.mockResolvedValue(template({ id: 'new-template' }));

    await service.createTemplate({ title: 'Blank' }, admin, workspace);

    expect(templateRepo.insertTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          type: 'doc',
          content: [expect.objectContaining({ type: 'paragraph' })],
        }),
      }),
    );
  });

  it('returns 400 for invalid create content', async () => {
    await expect(
      service.createTemplate(
        { title: 'Broken', content: { type: 'definitely-invalid' } },
        admin,
        workspace,
      ),
    ).rejects.toEqual(new BadRequestException('Invalid content format'));
  });

  it.each([UserRole.ADMIN, UserRole.OWNER])(
    'allows a workspace %s to create in an editable space when member templates are disabled',
    async (role) => {
      const privilegedUser = { id: `${role}-1`, role } as User;
      spaceRepo.findById.mockResolvedValue({ id: 'space-1' } as never);
      templateRepo.insertTemplate.mockResolvedValue({ id: 'new-template' });
      templateRepo.findById.mockResolvedValue(
        template({
          id: 'new-template',
          spaceId: 'space-1',
          creatorId: privilegedUser.id,
          lastUpdatedById: privilegedUser.id,
        }),
      );

      await service.createTemplate(
        { title: 'Privileged template', spaceId: 'space-1' },
        privilegedUser,
        workspace,
      );

      expect(canSpace).toHaveBeenCalledWith(
        SpaceCaslAction.Edit,
        SpaceCaslSubject.Page,
      );
      expect(templateRepo.insertTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          spaceId: 'space-1',
          creatorId: privilegedUser.id,
        }),
      );
    },
  );

  it('allows a normal member to create in an editable space when enabled', async () => {
    const enabledWorkspace = {
      ...workspace,
      settings: { templates: { allowMemberTemplates: true } },
    } as Workspace;
    spaceRepo.findById.mockResolvedValue({ id: 'space-1' } as never);
    templateRepo.insertTemplate.mockResolvedValue({ id: 'new-template' });
    templateRepo.findById.mockResolvedValue(
      template({ id: 'new-template', spaceId: 'space-1' }),
    );

    await service.createTemplate(
      { title: 'Member template', spaceId: 'space-1' },
      member,
      enabledWorkspace,
    );

    expect(canSpace).toHaveBeenCalledWith(
      SpaceCaslAction.Edit,
      SpaceCaslSubject.Page,
    );
    expect(templateRepo.insertTemplate).toHaveBeenCalled();
  });

  it('denies a normal member space creation when member templates are disabled', async () => {
    spaceRepo.findById.mockResolvedValue({ id: 'space-1' } as never);

    await expect(
      service.createTemplate(
        { title: 'Member template', spaceId: 'space-1' },
        member,
        workspace,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(templateRepo.insertTemplate).not.toHaveBeenCalled();
  });

  it('denies a space reader from creating templates even when enabled', async () => {
    const enabledWorkspace = {
      ...workspace,
      settings: { templates: { allowMemberTemplates: true } },
    } as Workspace;
    spaceRepo.findById.mockResolvedValue({ id: 'space-1' } as never);
    canSpace.mockReturnValue(false);

    await expect(
      service.createTemplate(
        { title: 'Reader template', spaceId: 'space-1' },
        member,
        enabledWorkspace,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns 404 when the create destination space is outside the workspace', async () => {
    spaceRepo.findById.mockResolvedValue(undefined);

    await expect(
      service.createTemplate(
        { title: 'Outside', spaceId: 'outside-space' },
        admin,
        workspace,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates only supplied fields and derived content fields', async () => {
    const current = template({ spaceId: 'space-1' });
    const updated = template({ spaceId: 'space-1', title: 'Updated' });
    templateRepo.findById
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(updated);

    await expect(
      service.updateTemplate(
        { templateId: current.id, title: 'Updated', content },
        admin,
        workspace,
      ),
    ).resolves.toBe(updated);

    expect(templateRepo.updateTemplate).toHaveBeenCalledWith(
      {
        title: 'Updated',
        content: expect.objectContaining({
          type: 'doc',
          content: [expect.objectContaining({ type: 'paragraph' })],
        }),
        textContent: 'Hello',
        ydoc: expect.any(Buffer),
        lastUpdatedById: admin.id,
      },
      current.id,
      workspace.id,
    );
  });

  it('returns 403 for an unauthorized update with no mutable fields', async () => {
    templateRepo.findById.mockResolvedValue(template());
    canWorkspace.mockReturnValue(false);

    await expect(
      service.updateTemplate({ templateId: 'template-1' }, member, workspace),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(templateRepo.updateTemplate).not.toHaveBeenCalled();
  });

  it('returns 400 for an authorized update with no mutable fields', async () => {
    templateRepo.findById.mockResolvedValue(template());

    await expect(
      service.updateTemplate({ templateId: 'template-1' }, admin, workspace),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(canWorkspace).toHaveBeenCalledWith(
      WorkspaceCaslAction.Manage,
      WorkspaceCaslSubject.Settings,
    );
    expect(templateRepo.updateTemplate).not.toHaveBeenCalled();
  });

  it('retains the existing scope when spaceId is omitted', async () => {
    const current = template({ spaceId: 'space-1' });
    templateRepo.findById
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(current);

    await service.updateTemplate(
      { templateId: current.id, title: 'Renamed' },
      admin,
      workspace,
    );

    expect(spaceRepo.findById).not.toHaveBeenCalled();
    expect(templateRepo.updateTemplate).toHaveBeenCalledWith(
      expect.not.objectContaining({ spaceId: expect.anything() }),
      current.id,
      workspace.id,
    );
  });

  it('requires source and target edit permissions when moving between spaces', async () => {
    const current = template({ spaceId: 'source-space' });
    templateRepo.findById
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(template({ spaceId: 'target-space' }));
    spaceRepo.findById.mockResolvedValue({ id: 'target-space' } as never);

    await service.updateTemplate(
      { templateId: current.id, spaceId: 'target-space' },
      admin,
      workspace,
    );

    expect(spaceAbility.createForUser).toHaveBeenNthCalledWith(
      1,
      admin,
      'source-space',
    );
    expect(spaceAbility.createForUser).toHaveBeenNthCalledWith(
      2,
      admin,
      'target-space',
    );
  });

  it('requires workspace settings permission when moving a space template global', async () => {
    const current = template({ spaceId: 'source-space' });
    templateRepo.findById.mockResolvedValue(current);
    canWorkspace.mockReturnValue(false);

    await expect(
      service.updateTemplate(
        { templateId: current.id, spaceId: null },
        admin,
        workspace,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(templateRepo.updateTemplate).not.toHaveBeenCalled();
  });

  it('requires global source permission before moving into a space', async () => {
    templateRepo.findById.mockResolvedValue(template());
    canWorkspace.mockReturnValue(false);

    await expect(
      service.updateTemplate(
        { templateId: 'template-1', spaceId: 'space-1' },
        member,
        workspace,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(spaceRepo.findById).not.toHaveBeenCalled();
  });

  it('deletes a template after authorizing its current scope', async () => {
    templateRepo.findById.mockResolvedValue(template({ spaceId: 'space-1' }));

    await service.deleteTemplate('template-1', admin, workspace);

    expect(canSpace).toHaveBeenCalledWith(
      SpaceCaslAction.Edit,
      SpaceCaslSubject.Page,
    );
    expect(templateRepo.deleteTemplate).toHaveBeenCalledWith(
      'template-1',
      workspace.id,
    );
  });

  it('uses a template in an editable destination and forwards the parent', async () => {
    const source = template({ spaceId: 'source-space' });
    const createdPage = { id: 'page-1' };
    templateRepo.findById.mockResolvedValue(source);
    spaceRepo.findById.mockResolvedValue({ id: 'destination-space' } as never);
    pageService.create.mockResolvedValue(createdPage as never);

    await expect(
      service.useTemplate(
        {
          templateId: source.id,
          spaceId: 'destination-space',
          parentPageId: 'parent-page',
        },
        member,
        workspace,
      ),
    ).resolves.toBe(createdPage);

    expect(canSpace).toHaveBeenCalledWith(
      SpaceCaslAction.Read,
      SpaceCaslSubject.Page,
    );
    expect(pageService.create).toHaveBeenCalledWith(member.id, workspace.id, {
      title: source.title,
      icon: source.icon,
      spaceId: 'destination-space',
      parentPageId: 'parent-page',
      content,
      format: 'json',
    });
  });

  it('returns 404 when the use destination does not exist in the workspace', async () => {
    templateRepo.findById.mockResolvedValue(template());
    spaceRepo.findById.mockResolvedValue(undefined);

    await expect(
      service.useTemplate(
        { templateId: 'template-1', spaceId: 'outside-space' },
        member,
        workspace,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(pageService.create).not.toHaveBeenCalled();
  });

  it('returns 403 when the use destination is read-only', async () => {
    templateRepo.findById.mockResolvedValue(template());
    spaceRepo.findById.mockResolvedValue({ id: 'space-1' } as never);
    canSpace.mockReturnValue(false);

    await expect(
      service.useTemplate(
        { templateId: 'template-1', spaceId: 'space-1' },
        member,
        workspace,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
