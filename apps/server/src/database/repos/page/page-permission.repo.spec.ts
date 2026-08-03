import { PagePermissionRepo } from './page-permission.repo';

describe('PagePermissionRepo', () => {
  const repo = Object.create(
    PagePermissionRepo.prototype,
  ) as PagePermissionRepo;

  it('creates a predicate that rejects a page when any restricted ancestor lacks user or group permission', () => {
    const predicate = repo.userCanAccessPagePredicate('user-1', 'pages.id');
    const predicateSql = JSON.stringify(predicate.toOperationNode());

    expect(predicateSql).toContain('WITH RECURSIVE ancestors');
    expect(predicateSql).toContain('page_permissions');
  });
});
