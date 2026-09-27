import { enUS, id } from "date-fns/locale";
import { useTranslation } from "react-i18next";
import type { Locale } from "date-fns";

const LOCALE_MAP: Record<string, Locale> = {
  en: enUS,
  id: id,
};

/**
 * Returns the date-fns Locale that matches the current i18n language.
 * Falls back to enUS for any unknown language code.
 */
export function useDateFnsLocale(): Locale {
  const { i18n } = useTranslation();
  return LOCALE_MAP[i18n.language] ?? enUS;
}
