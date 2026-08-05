import { MODULE_METADATA } from '@nestjs/common/constants';
import { CollaborationModule } from '../../../collaboration/collaboration.module';
import { RichContentModule } from './rich-content.module';

describe('RichContentModule', () => {
  it('imports CollaborationModule for BlockEditService', () => {
    const imports = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      RichContentModule,
    );

    expect(imports).toContain(CollaborationModule);
  });
});
