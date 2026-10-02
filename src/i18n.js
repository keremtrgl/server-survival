import { EN_TRANSLATIONS } from "./locales/en.js";
import { ZH_TRANSLATIONS } from "./locales/zh.js";
import { PT_BR_TRANSLATIONS } from "./locales/pt-BR.js";
import { DE_TRANSLATIONS } from "./locales/de.js";
import { FR_TRANSLATIONS } from "./locales/fr.js";
import { KO_TRANSLATIONS } from "./locales/ko.js";
import { RU_TRANSLATIONS } from "./locales/ru.js";
import { IT_TRANSLATIONS } from "./locales/it.js";
import { NE_TRANSLATIONS } from "./locales/nep.js";
import { UK_TRANSLATIONS } from "./locales/uk.js";
import { HI_TRANSLATIONS } from "./locales/hi.js";
import { TR_TRANSLATIONS } from "./locales/tr.js";

/**
 * Pick the starting locale: a saved choice wins; otherwise the first of the
 * browser's preferred languages the game ships, matched exactly ("pt-BR")
 * and then by base language ("tr-TR" → "tr", "pt-PT" → "pt-BR"); otherwise
 * English. Exported for tests.
 */
export function detectLocale(saved, preferred, available) {
    if (saved && available.includes(saved)) return saved;
    const lower = available.map((code) => code.toLowerCase());
    for (const tag of preferred || []) {
        if (typeof tag !== "string" || !tag) continue;
        const exact = lower.indexOf(tag.toLowerCase());
        if (exact !== -1) return available[exact];
        const base = tag.toLowerCase().split("-")[0];
        const byBase = lower.findIndex((code) => code.split("-")[0] === base);
        if (byBase !== -1) return available[byBase];
    }
    return "en";
}

function readSavedLocale() {
    try {
        return localStorage.getItem('game_locale');
    } catch {
        return null; // storage blocked (privacy mode): fall back to detection
    }
}

/**
 * Simple i18n manager for the game
 */
export class I18nManager {
    constructor() {
        this.translations = {
            en: typeof EN_TRANSLATIONS !== 'undefined' ? EN_TRANSLATIONS : {},
            zh: typeof ZH_TRANSLATIONS !== 'undefined' ? ZH_TRANSLATIONS : {},
            'pt-BR': typeof PT_BR_TRANSLATIONS !== 'undefined' ? PT_BR_TRANSLATIONS : {},
            de: typeof DE_TRANSLATIONS !== 'undefined' ? DE_TRANSLATIONS : {},
            fr: typeof FR_TRANSLATIONS !== 'undefined' ? FR_TRANSLATIONS : {},
            ko: typeof KO_TRANSLATIONS !== 'undefined' ? KO_TRANSLATIONS : {},
            ru: typeof RU_TRANSLATIONS !== 'undefined' ? RU_TRANSLATIONS : {},
            it: typeof IT_TRANSLATIONS !== 'undefined' ? IT_TRANSLATIONS : {},
            ne: typeof NE_TRANSLATIONS !== 'undefined' ? NE_TRANSLATIONS : {},
            uk: typeof UK_TRANSLATIONS !== 'undefined' ? UK_TRANSLATIONS : {},
            hi: typeof HI_TRANSLATIONS !== 'undefined' ? HI_TRANSLATIONS : {},
            tr: typeof TR_TRANSLATIONS !== 'undefined' ? TR_TRANSLATIONS : {}
        };
        this.currentLocale = detectLocale(
            readSavedLocale(),
            typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : [],
            Object.keys(this.translations)
        );
    }

    setLocale(locale) {
        if (this.translations[locale]) {
            this.currentLocale = locale;
            try {
                localStorage.setItem('game_locale', locale);
            } catch {
                // storage blocked: the choice still applies for this session
            }
            document.documentElement.lang = locale;
            this.applyTranslations();
            // Dispatch event for components that need to update manually.
            // Achievements (#158) subscribe to this event (wired in game.js's
            // boundary block): i18n must stay a LEAF module — importing the
            // achievements engine here would drag the sim graph
            // (circuit-breaker → metrics → events → game.js) into i18n's
            // eval chain and break module ordering for every entry point
            // that touches i18n before game.js.
            window.dispatchEvent(new CustomEvent('localeChanged', { detail: locale }));
        }
    }

    t(key, variables = {}) {
        // Missing in the active locale → English → the raw key, so a gap in
        // a translation never shows a player an identifier.
        let text = this.translations[this.currentLocale]?.[key]
            || this.translations.en[key]
            || key;
        
        // Handle variable interpolation
        Object.keys(variables).forEach(varName => {
            text = text.replace(`{${varName}}`, variables[varName]);
        });
        
        return text;
    }

    applyTranslations() {
        // Update all elements with data-i18n attribute
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = this.t(key);
            
            // Handle special cases like placeholder
            if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'number')) {
                el.placeholder = translation;
            } else {
                // For other elements, update innerHTML or textContent
                // If it contains HTML tags (like <b>), use innerHTML
                if (translation.includes('<')) {
                    el.innerHTML = translation;
                } else {
                    el.textContent = translation;
                }
            }
        });

        // Update all elements with data-i18n-title attribute
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const titleKey = el.getAttribute('data-i18n-title');
            el.setAttribute('title', this.t(titleKey));
        });

        // Update document title and language (screen readers, hyphenation)
        document.title = this.t('title');
        document.documentElement.lang = this.currentLocale;

        // Update language select if it exists
        const langSelect = document.getElementById('lang-select');
        if (langSelect) {
            langSelect.value = this.currentLocale;
        }
    }
}

// Create a global instance (kept on window: index.html inline handlers call
// i18n.setLocale(...), which resolves via the global scope)
export const i18n = new I18nManager();
window.i18n = i18n;

// Function to easily translate strings in JS
window.t = (key, variables) => window.i18n.t(key, variables);

// Auto-apply on load
document.addEventListener('DOMContentLoaded', () => {
    window.i18n.applyTranslations();
});
