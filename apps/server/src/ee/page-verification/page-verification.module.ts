import { Module } from '@nestjs/common';
import { PageVerificationController } from './page-verification.controller';
import { PageVerificationService } from './page-verification.service';

@Module({
  controllers: [PageVerificationController],
  providers: [PageVerificationService],
  exports: [PageVerificationService],
})
export class PageVerificationModule {}
