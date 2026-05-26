import i18n, { type Resource } from "i18next";
import { initReactI18next } from "react-i18next";

import enApp from "@/locales/en/app.json";
import enCommon from "@/locales/en/common.json";
import enPet from "@/locales/en/pet.json";
import koApp from "@/locales/ko/app.json";
import koCommon from "@/locales/ko/common.json";
import koPet from "@/locales/ko/pet.json";
import zhApp from "@/locales/zh/app.json";
import zhCommon from "@/locales/zh/common.json";
import zhPet from "@/locales/zh/pet.json";

export type AppLanguage = "en" | "zh" | "ko";

export function normalizeLanguage(lang: unknown): AppLanguage {
  if (!lang) return "en";
  const s = String(lang).toLowerCase();
  if (s === "zh" || s === "cn" || s === "chinese") return "zh";
  if (s === "ko" || s === "kr" || s === "korean" || s === "한국어") return "ko";
  return "en";
}

let _initialized = false;

export function initI18n(language?: unknown) {
  if (_initialized) return i18n;

  const resources: Resource = {
    en: { app: enApp, common: enCommon, pet: enPet },
    zh: { app: zhApp, common: zhCommon, pet: zhPet },
    ko: { app: koApp, common: koCommon, pet: koPet },
  };

  i18n.use(initReactI18next).init({
    resources,
    lng: normalizeLanguage(language),
    fallbackLng: "en",
    // Use a single default namespace to keep lookups simple.
    // We intentionally keep keySeparator disabled so keys like "Generating..." remain valid.
    defaultNS: "app",
    ns: ["app", "common", "pet"],
    keySeparator: false,
    interpolation: {
      escapeValue: false,
    },
    returnEmptyString: false,
    returnNull: false,
  });

  _initialized = true;
  return i18n;
}
