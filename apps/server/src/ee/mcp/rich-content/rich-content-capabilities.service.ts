import { Injectable } from '@nestjs/common';
import { embedProviders } from '@docmost/editor-ext';
import {
  richContentCapabilities,
  type RichContentCapability,
} from '../../../core/rich-content/rich-content-capabilities';

@Injectable()
export class RichContentCapabilitiesService {
  getCapabilities(): RichContentCapability[] {
    return structuredClone(richContentCapabilities).map((capability) =>
      capability.name === 'embed'
        ? {
            ...capability,
            attributes: capability.attributes.map((attribute) =>
              attribute.name === 'provider'
                ? { ...attribute, enum: embedProviders.map((provider) => provider.id) }
                : attribute,
            ),
          }
        : capability,
    );
  }
}
