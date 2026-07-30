import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AI_DRIVERS } from '../ai-settings.service';

export class UpdateAiSettingsDto {
  /** Empty string clears the override and hands control back to the env. */
  @IsOptional()
  @IsString()
  @IsIn([...AI_DRIVERS, ''])
  driver?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  baseUrl?: string;

  /**
   * Omit to keep the stored key, send an empty string to delete it. The value
   * is never echoed back by the API.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  chatModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  completionModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  embeddingBaseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  embeddingApiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  embeddingModel?: string;
}

export class ListAiModelsDto {
  @IsOptional()
  @IsString()
  @IsIn([...AI_DRIVERS, ''])
  driver?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  baseUrl?: string;

  /** Lets an admin browse models with a key that has not been saved yet. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @IsOptional()
  @IsString()
  @IsIn(['chat', 'embedding'])
  kind?: string;
}
