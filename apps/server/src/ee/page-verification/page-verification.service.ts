import { Injectable, Logger } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

@Injectable()
export class PageVerificationService {
  private readonly logger = new Logger(PageVerificationService.name);

  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async getVerificationInfo(pageId: string, workspaceId: string) {
    try {
      const verification = await this.db
        .selectFrom('pageVerifications')
        .selectAll()
        .where('pageId', '=', pageId)
        .where('workspaceId', '=', workspaceId)
        .executeTakeFirst();

      if (!verification) {
        return {
          status: 'none',
          permissions: {
            canVerify: true,
            canManage: true,
            canSubmitForApproval: true,
            canMarkObsolete: true,
          },
        };
      }

      return {
        ...verification,
        permissions: {
          canVerify: true,
          canManage: true,
          canSubmitForApproval: true,
          canMarkObsolete: true,
        },
      };
    } catch (err) {
      // Fail closed: a lookup failure must not grant management rights.
      this.logger.error(
        `Failed to load verification info for page ${pageId}`,
        err instanceof Error ? err.stack : String(err),
      );
      return {
        status: 'none',
        permissions: {
          canVerify: false,
          canManage: false,
          canSubmitForApproval: false,
          canMarkObsolete: false,
        },
      };
    }
  }

  async setupVerification(data: any, workspaceId: string, userId: string) {
    return { success: true };
  }

  async updateVerification(data: any, workspaceId: string, userId: string) {
    return { success: true };
  }

  async removeVerification(pageId: string, workspaceId: string) {
    return { success: true };
  }

  async verifyPage(pageId: string, workspaceId: string, userId: string) {
    return { success: true };
  }

  async submitForApproval(pageId: string, workspaceId: string, userId: string) {
    return { success: true };
  }

  async rejectApproval(data: any, workspaceId: string, userId: string) {
    return { success: true };
  }

  async markObsolete(pageId: string, workspaceId: string, userId: string) {
    return { success: true };
  }

  async getVerificationList(params: any, workspaceId: string) {
    return {
      items: [],
      pageInfo: {
        nextCursor: null,
        prevCursor: null,
      },
    };
  }
}
