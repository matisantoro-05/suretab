import * as store from './lib/store.js';
import { parseImport } from './lib/parse.js';
import { readBackup } from './lib/bookmarks.js';
import { t, applyI18n, favicon, formatDate } from './lib/i18n.js';

applyI18n();

const $ = (id) => document.getElementById(id);
let data = await store.load();
let query = '';

// ---------- render ----------
function render() {
  const groupsEl = $('groups');
  groupsEl.textContent = '';
  const totalTabs = data.groups.reduce((n, g) => n + g.tabs.length, 0);
  $('summary').textContent = t('summary', totalTabs, data.groups.length);
  $('empty').hidden = data.groups.length > 0;

  const q = query.toLowerCase();
  for (const g of store.sortGroups(data.groups)) {
    const tabs = g.tabs
      .map((tab, index) => ({ ...tab, index }))
      .filter((tab) => !q || tab.title.toLowerCase().includes(q) || tab.url.toLowerCase().includes(q) || (g.title || '').toLowerCase().includes(q));
    if (q && !tabs.length) continue;
    groupsEl.append(renderGroup(g, tabs));
  }
}

function renderGroup(g, tabs) {
  const node = $('tpl-group').content.firstElementChild.cloneNode(true);
  applyI18n(node);
  node.dataset.id = g.id;
  const star = node.querySelector('.star');
  star.textContent = g.starred ? '★' : '☆';
  star.title = t(g.starred ? 'unstar' : 'star');
  star.classList.toggle('on', g.starred);
  const title = node.querySelector('.group-title');
  title.value = g.title;
  title.placeholder = t('untitled');
  node.querySelector('.meta').textContent = `${t('tabsCount', g.tabs.length)} · ${formatDate(g.createdAt)}`;

  const list = node.querySelector('.links');
  for (const tab of tabs) {
    const li = document.createElement('li');
    const img = document.createElement('img');
    img.src = favicon(tab.url);
    img.width = img.height = 16;
    img.alt = '';
    const a = document.createElement('a');
    a.href = tab.url;
    a.textContent = tab.title;
    a.title = tab.url;
    a.dataset.act = 'open';
    a.dataset.index = tab.index;
    const x = document.createElement('button');
    x.className = 'x';
    x.textContent = '×';
    x.title = t('removeLink');
    x.dataset.act = 'remove';
    x.dataset.index = tab.index;
    li.append(img, a, x);
    list.append(li);
  }
  return node;
}

// ---------- group actions ----------
$('groups').addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const id = el.closest('.group')?.dataset.id;
  const g = data.groups.find((x) => x.id === id);
  if (!g) return;
  const act = el.dataset.act;

  if (act === 'open') {
    e.preventDefault();
    const tab = g.tabs[Number(el.dataset.index)];
    await openTabs([tab], { newWindow: false, background: e.ctrlKey || e.metaKey || e.button === 1 });
    if (data.settings.removeOnRestore) await store.removeTab(id, Number(el.dataset.index));
  } else if (act === 'remove') {
    const trashId = await store.removeTab(id, Number(el.dataset.index));
    toast(t('linkRemoved'), () => store.restoreFromTrash(trashId));
  } else if (act === 'star') {
    await store.toggleStar(id);
  } else if (act === 'delete') {
    await store.deleteGroup(id);
    toast(t('groupDeleted'), () => store.restoreFromTrash(id));
  } else if (act === 'restore' || act === 'restore-window') {
    await openTabs(g.tabs, { newWindow: act === 'restore-window' });
    if (data.settings.removeOnRestore) {
      await store.deleteGroup(id);
      toast(t('groupRestored'), () => store.restoreFromTrash(id));
    }
  }
});

$('groups').addEventListener('change', (e) => {
  if (e.target.dataset.act === 'rename') {
    store.renameGroup(e.target.closest('.group').dataset.id, e.target.value);
  }
});
$('groups').addEventListener('keydown', (e) => {
  if (e.target.dataset.act === 'rename' && e.key === 'Enter') e.target.blur();
});

async function openTabs(tabs, { newWindow, background = true }) {
  const unloaded = data.settings.restoreUnloaded;
  let windowId;
  let rest = tabs;
  if (newWindow) {
    const win = await chrome.windows.create({ url: tabs[0].url });
    windowId = win.id;
    rest = tabs.slice(1);
  }
  for (const tab of rest) {
    const active = !background && rest.length === 1;
    // Background tabs open as a lightweight placeholder that loads the page on first view.
    const lazy = unloaded && !active && /^(https?|ftp|file):/i.test(tab.url);
    const url = lazy
      ? chrome.runtime.getURL(`lazy.html?${new URLSearchParams({ url: tab.url, title: tab.title })}`)
      : tab.url;
    try {
      await chrome.tabs.create({ url, active, windowId });
    } catch (err) {
      console.warn('SureTab: could not open', tab.url, err);
    }
  }
}

// ---------- toast with undo ----------
let toastTimer;
function toast(text, undo) {
  $('toast-text').textContent = text;
  $('toast-undo').hidden = !undo;
  $('toast-undo').onclick = async () => {
    $('toast').hidden = true;
    await undo();
  };
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('toast').hidden = true), 7000);
}

// ---------- search ----------
$('search').addEventListener('input', (e) => {
  query = e.target.value.trim();
  render();
});

// ---------- dialogs ----------
document.querySelectorAll('dialog [data-close]').forEach((b) => (b.onclick = () => b.closest('dialog').close()));

// Import
$('btn-import').onclick = () => {
  $('import-text').value = '';
  $('import-status').textContent = '';
  $('dlg-import').showModal();
};
$('import-file').onchange = async (e) => {
  const file = e.target.files[0];
  if (file) $('import-text').value = await file.text();
};
$('btn-do-import').onclick = async () => {
  const groups = parseImport($('import-text').value);
  if (!groups.length) {
    $('import-status').textContent = t('importNone');
    return;
  }
  const res = await store.importGroups(groups);
  $('dlg-import').close();
  toast(t('importDone', res.tabs, res.groups));
};

// Export
$('btn-export').onclick = () => $('dlg-export').showModal();
$('btn-export-json').onclick = () => {
  const blob = new Blob([JSON.stringify(store.exportData(data), null, 2)], { type: 'application/json' });
  download(blob, `suretab-backup-${new Date().toISOString().slice(0, 10)}.json`);
};
$('btn-export-text').onclick = async () => {
  await navigator.clipboard.writeText(store.toOneTabText(store.sortGroups(data.groups)));
  toast(t('copied'));
};
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Trash
$('btn-trash').onclick = () => {
  renderTrash();
  $('dlg-trash').showModal();
};
function renderTrash() {
  const ul = $('trash-list');
  ul.textContent = '';
  if (!data.trash.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = t('trashEmpty');
    ul.append(li);
    return;
  }
  for (const g of data.trash) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    const name = g.title || g.tabs[0]?.title || t('untitled');
    span.textContent = `${name} — ${t('tabsCount', g.tabs.length)} · ${t('deletedOn', formatDate(g.deletedAt))}`;
    const btn = document.createElement('button');
    btn.className = 'btn small';
    btn.textContent = t('restore');
    btn.onclick = async () => {
      await store.restoreFromTrash(g.id);
    };
    li.append(span, btn);
    ul.append(li);
  }
}
$('btn-empty-trash').onclick = async () => {
  if (confirm(t('confirmEmptyTrash'))) await store.emptyTrash();
};

// Settings + snapshots
$('btn-settings').onclick = async () => {
  document.querySelectorAll('[data-setting]').forEach((cb) => (cb.checked = Boolean(data.settings[cb.dataset.setting])));
  await renderSnapshots();
  $('dlg-settings').showModal();
};
document.querySelectorAll('[data-setting]').forEach((cb) => {
  cb.onchange = () => store.saveSettings({ [cb.dataset.setting]: cb.checked });
});
async function renderSnapshots() {
  const ul = $('snap-list');
  ul.textContent = '';
  const snaps = await store.listSnapshots();
  if (!snaps.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = t('noSnapshots');
    ul.append(li);
    return;
  }
  for (const s of snaps) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = `${formatDate(s.at)} — ${t('summary', s.tabs, s.groups)}`;
    const btn = document.createElement('button');
    btn.className = 'btn small';
    btn.textContent = t('snapshotRestore');
    btn.onclick = async () => {
      if (!confirm(t('confirmRestoreSnapshot'))) return;
      await store.restoreSnapshot(s.at);
      $('dlg-settings').close();
      toast(t('recovered'));
    };
    li.append(span, btn);
    ul.append(li);
  }
}

// ---------- recovery from the bookmarks backup ----------
async function checkRecovery() {
  if (data.groups.length) {
    $('recover').hidden = true;
    return;
  }
  const backup = await readBackup();
  if (!backup.length) return;
  const tabs = backup.reduce((n, g) => n + g.tabs.length, 0);
  $('recover-body').textContent = t('recoverBody', tabs, backup.length);
  $('recover').hidden = false;
  $('btn-recover').onclick = async () => {
    await store.importGroups(backup);
    $('recover').hidden = true;
    toast(t('recovered'));
  };
}

// ---------- live updates ----------
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes[store.KEY]) return;
  data = await store.load();
  if (document.activeElement?.classList.contains('group-title')) {
    document.activeElement.addEventListener('blur', render, { once: true });
  } else {
    render();
  }
  if ($('dlg-trash').open) renderTrash();
  checkRecovery();
});

render();
checkRecovery();
store.purgeOldTrash();
