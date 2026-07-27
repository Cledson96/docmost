import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

@Injectable()
export class PageVerificationService {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async getVerificationInfo(pageId: string, workspaceId: string) {
    try {
      const verification = await (this.db as any)
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
    } catch {
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
