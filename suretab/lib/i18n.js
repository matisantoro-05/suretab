export const t = (key, ...subs) => chrome.i18n.getMessage(key, subs.map(String)) || key;

// Fills elements marked with data-i18n (text) and data-i18n-ph (placeholder).
export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)));
  root.querySelectorAll('[data-i18n-ph]').forEach((el) => (el.placeholder = t(el.dataset.i18nPh)));
  root.querySelectorAll('[data-i18n-title]').forEach((el) => (el.title = t(el.dataset.i18nTitle)));
  document.documentElement.lang = chrome.i18n.getUILanguage();
}

export function favicon(pageUrl) {
  return chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`);
}

export function formatDate(ms) {
  return new Date(ms).toLocaleString(chrome.i18n.getUILanguage(), {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}
