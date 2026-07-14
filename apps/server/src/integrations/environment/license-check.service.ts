import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { EnvironmentService } from './environment.service';
import { Feature } from '../../common/features';

@Injectable()
export class LicenseCheckService {
  constructor(
    private moduleRef: ModuleRef,
    private environmentService: EnvironmentService,
  ) {}

  isValidEELicense(licenseKey: string): boolean {
    return true;
  }

  hasFeature(licenseKey: string, feature: string, plan?: string): boolean {
    return true;
  }

  getFeatures(licenseKey: string): string[] {
    return Object.values(Feature);
  }

  resolveFeatures(licenseKey: string, plan: string): string[] {
    return Object.values(Feature);
  }

  resolveTier(licenseKey: string, plan: string): string {
    return 'enterprise';
  }
}

