import { KEY, load, addGroup, purgeOldTrash } from './lib/store.js';
import { mirror } from './lib/bookmarks.js';

const MANAGER = chrome.runtime.getURL('manager.html');
const LAZY = chrome.runtime.getURL('lazy.html');

// A restored-but-not-yet-viewed tab is our placeholder page: save its real address.
function realTab(tb) {
  const url = tb.url || tb.pendingUrl || '';
  if (url.startsWith(LAZY)) {
    const p = new URL(url).searchParams;
    return { url: p.get('url') || '', title: p.get('title') || tb.title };
  }
  return { url, title: tb.title };
}
const t = (k) => chrome.i18n.getMessage(k);

// ---------- menus ----------
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.contextMenus.removeAll();
  const contexts = ['action', 'page'];
  chrome.contextMenus.create({ id: 'save-tab', title: t('ctxSaveTab'), contexts });
  chrome.contextMenus.create({ id: 'save-window', title: t('ctxSaveWindow'), contexts });
  chrome.contextMenus.create({ id: 'save-all', title: t('ctxSaveAll'), contexts });
  chrome.contextMenus.create({ id: 'open-manager', title: t('ctxOpen'), contexts });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  const windowId = tab?.windowId;
  if (info.menuItemId === 'open-manager') return openManager(windowId);
  const scope = { 'save-tab': 'tab', 'save-window': 'window', 'save-all': 'all' }[info.menuItemId];
  if (scope) saveTabs(scope, windowId, tab?.id);
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'save-window') return;
  const win = await chrome.windows.getLastFocused();
  saveTabs('window', win.id);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'save') {
    saveTabs(msg.scope, msg.windowId, msg.tabId).then(sendResponse, (e) => sendResponse({ error: String(e) }));
    return true;
  }
  if (msg?.type === 'open-manager') {
    openManager(msg.windowId).then(() => sendResponse({ ok: true }));
    return true;
  }
});

// ---------- saving ----------
function isSkippable(url) {
  return !url || url.startsWith(MANAGER) || /^(chrome|edge|brave):\/\/newtab\/?$/.test(url) || url === 'about:blank';
}

async function saveTabs(scope, windowId, tabId) {
  const { settings } = await load();
  let tabs;
  if (scope === 'tab') {
    tabs = tabId ? [await chrome.tabs.get(tabId)] : await chrome.tabs.query({ active: true, windowId });
  } else if (scope === 'window') {
    tabs = await chrome.tabs.query({ windowId });
  } else {
    tabs = await chrome.tabs.query({});
  }
  tabs = tabs.filter((tb) => {
    if (isSkippable(realTab(tb).url)) return false;
    if (scope !== 'tab' && settings.skipPinned && tb.pinned) return false;
    return true;
  });
  if (!tabs.length) return { saved: 0 };

  const group = await addGroup(tabs.map(realTab));
  if (!group) return { saved: 0 };

  // Check the write really landed before closing anything.
  const check = await load();
  if (!check.groups.some((g) => g.id === group.id)) throw new Error('Save failed; tabs were not closed.');

  if (settings.closeAfterSave) {
    await openManager(windowId ?? tabs[0].windowId);
    await chrome.tabs.remove(tabs.map((tb) => tb.id));
  }
  return { saved: group.tabs.length };
}

async function openManager(windowId) {
  const existing = (await chrome.tabs.query({})).find((tb) => (tb.url || tb.pendingUrl || '').startsWith(MANAGER));
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    await chrome.windows.update(existing.windowId, { focused: true });
    return existing;
  }
  return chrome.tabs.create(windowId ? { url: MANAGER, windowId } : { url: MANAGER });
}

// ---------- bookmark backup ----------
let mirrorTimer = null;
function scheduleMirror() {
  clearTimeout(mirrorTimer);
  mirrorTimer = setTimeout(async () => {
    const data = await load();
    if (data.settings.bookmarkBackup) {
      try {
        await mirror(data.groups);
      } catch (e) {
        console.warn('SureTab: bookmark backup failed', e);
      }
    }
  }, 3000);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[KEY]) scheduleMirror();
});

chrome.runtime.onStartup.addListener(() => {
  purgeOldTrash();
});
