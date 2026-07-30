import { Generated, Timestamp } from '@docmost/db/types/db';

/**
 * Per-workspace AI provider configuration. Every column is nullable: a null
 * field falls back to the matching environment variable, so an install that
 * only ever configured AI through the env keeps working untouched.
 */
export interface WorkspaceAiSettings {
  id: Generated<string>;
  workspaceId: string;
  driver: string | null;
  baseUrl: string | null;
  /** AES-256-GCM ciphertext. Never leaves the server. */
  apiKeyEncrypted: string | null;
  chatModel: string | null;
  completionModel: string | null;
  embeddingBaseUrl: string | null;
  embeddingApiKeyEncrypted: string | null;
  embeddingModel: string | null;
  createdAt: Generated<Timestamp>;
  updatedAt: Generated<Timestamp>;
}
