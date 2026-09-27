import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import id from "@/locales/id.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "id", label: "Indonesia" },
] as const;

export type LangCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    id: { translation: id },
  },
  lng: "en", // default; auth context overrides once profile loads
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
