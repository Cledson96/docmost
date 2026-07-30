import { DB } from '@docmost/db/types/db';
import { PageEmbeddings } from '@docmost/db/types/embeddings.types';
import { WorkspaceAiSettings } from '@docmost/db/types/ai-settings.types';

export interface DbInterface extends DB {
  pageEmbeddings: PageEmbeddings;
  workspaceAiSettings: WorkspaceAiSettings;
}
