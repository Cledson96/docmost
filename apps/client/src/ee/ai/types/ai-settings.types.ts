export type AiDriver =
  | "openai"
  | "openrouter"
  | "openai-compatible"
  | "gemini"
  | "ollama"
  | "";

export interface AiSettings {
  driver: AiDriver;
  baseUrl: string | null;
  chatModel: string | null;
  completionModel: string | null;
  embeddingBaseUrl: string | null;
  embeddingModel: string | null;
  apiKeyPreview: string | null;
  embeddingApiKeyPreview: string | null;
  hasApiKey: boolean;
  hasEmbeddingApiKey: boolean;
  /** True while the provider still comes from server environment variables. */
  managedByEnv: boolean;
  configured: boolean;
  reindexQueued?: boolean;
}

export interface UpdateAiSettingsDto {
  driver?: AiDriver;
  baseUrl?: string;
  /** Omit to keep the stored key; empty string deletes it. */
  apiKey?: string;
  chatModel?: string;
  completionModel?: string;
  embeddingBaseUrl?: string;
  embeddingApiKey?: string;
  embeddingModel?: string;
}

export interface ListAiModelsDto {
  driver?: AiDriver;
  baseUrl?: string;
  apiKey?: string;
  kind?: "chat" | "embedding";
}

export interface AiModelOption {
  id: string;
  label: string;
}

export interface AiConnectionTest {
  ok: boolean;
  message: string;
}
