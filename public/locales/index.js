import en from './en.js';
import es from './es.js';
import fr from './fr.js';
import zh from './zh.js';
import ja from './ja.js';
import ko from './ko.js';

export const words = {en, es, fr, zh, ja, ko};
export const languageNames = {
  en: 'English', es: 'Spanish', fr: 'French',
  zh: 'Simplified Chinese', ja: 'Japanese', ko: 'Korean'
};

export function resolveInterfaceLanguage(value) {
  return typeof value === 'string' && Object.hasOwn(words, value) ? value : 'en';
}
