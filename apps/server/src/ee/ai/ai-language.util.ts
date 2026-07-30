/**
 * Model prompts name the target language in plain English rather than passing a
 * locale code, which models handle inconsistently.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  'de-DE': 'German',
  'en-US': 'English',
  'es-ES': 'Spanish',
  'fr-FR': 'French',
  'it-IT': 'Italian',
  'ja-JP': 'Japanese',
  'ko-KR': 'Korean',
  'nl-NL': 'Dutch',
  'pt-BR': 'Brazilian Portuguese (pt-BR)',
  'ru-RU': 'Russian',
  'uk-UA': 'Ukrainian',
  'zh-CN': 'Simplified Chinese',
};

/** Language this workspace writes in when a user has no locale set. */
export const DEFAULT_AI_LANGUAGE = LANGUAGE_NAMES['pt-BR'];

/**
 * Shown when the permission system refuses an edit the model announced. Written
 * server-side rather than left to the model, which cannot be trusted to report
 * a failure it does not know about mid-response.
 */
export function editRefusalNotice(
  locale: string | null | undefined,
  count: number,
): string {
  const isPortuguese = (locale ?? 'pt-BR').toLowerCase().startsWith('pt');

  if (isPortuguese) {
    return count === 1
      ? '> [!WARNING]\n> A edição descrita acima **não foi aplicada**: a página não existe neste workspace ou você não tem permissão para editá-la.'
      : `> [!WARNING]\n> ${count} edições descritas acima **não foram aplicadas**: as páginas não existem neste workspace ou você não tem permissão para editá-las.`;
  }

  return count === 1
    ? '> [!WARNING]\n> The edit described above **was not applied**: the page does not exist in this workspace, or you do not have permission to edit it.'
    : `> [!WARNING]\n> ${count} edits described above **were not applied**: those pages do not exist in this workspace, or you do not have permission to edit them.`;
}

export function languageFromLocale(locale?: string | null): string {
  if (!locale) return DEFAULT_AI_LANGUAGE;

  const exact = LANGUAGE_NAMES[locale];
  if (exact) return exact;

  // Tolerate a bare language tag such as `pt` or an unexpected region.
  const base = locale.split(/[-_]/)[0]?.toLowerCase();
  const match = Object.entries(LANGUAGE_NAMES).find(([key]) =>
    key.toLowerCase().startsWith(`${base}-`),
  );

  return match ? match[1] : DEFAULT_AI_LANGUAGE;
}
