import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { PageVerificationService } from './page-verification.service';

@Controller('pages')
@UseGuards(JwtAuthGuard)
export class PageVerificationController {
  constructor(private readonly verificationService: PageVerificationService) {}

  @Post('verification-info')
  @HttpCode(HttpStatus.OK)
  async getVerificationInfo(
    @Body('pageId') pageId: string,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.verificationService.getVerificationInfo(pageId, workspace.id);
  }

  @Post('create-verification')
  @HttpCode(HttpStatus.OK)
  async setupVerification(
    @Body() body: any,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    return this.verificationService.setupVerification(body, workspace.id, user.id);
  }

  @Post('update-verification')
  @HttpCode(HttpStatus.OK)
  async updateVerification(
    @Body() body: any,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    return this.verificationService.updateVerification(body, workspace.id, user.id);
  }

  @Post('delete-verification')
  @HttpCode(HttpStatus.OK)
  async removeVerification(
    @Body('pageId') pageId: string,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.verificationService.removeVerification(pageId, workspace.id);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyPage(
    @Body('pageId') pageId: string,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    return this.verificationService.verifyPage(pageId, workspace.id, user.id);
  }

  @Post('submit-for-approval')
  @HttpCode(HttpStatus.OK)
  async submitForApproval(
    @Body('pageId') pageId: string,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    return this.verificationService.submitForApproval(pageId, workspace.id, user.id);
  }

  @Post('reject-approval')
  @HttpCode(HttpStatus.OK)
  async rejectApproval(
    @Body() body: any,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    return this.verificationService.rejectApproval(body, workspace.id, user.id);
  }

  @Post('mark-obsolete')
  @HttpCode(HttpStatus.OK)
  async markObsolete(
    @Body('pageId') pageId: string,
    @AuthWorkspace() workspace: Workspace,
    @AuthUser() user: User,
  ) {
    return this.verificationService.markObsolete(pageId, workspace.id, user.id);
  }

  @Post('verifications')
  @HttpCode(HttpStatus.OK)
  async getVerificationList(
    @Body() params: any,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.verificationService.getVerificationList(params, workspace.id);
  }
}
