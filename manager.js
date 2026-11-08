import * as store from './lib/store.js';
import { parseImport } from './lib/parse.js';
import { readBackup } from './lib/bookmarks.js';
import { t, tabs as nTabs, groups as nGroups, applyI18n, favicon, formatDate } from './lib/i18n.js';
import { getMeta, setMeta, bump, shouldAskReview } from './lib/meta.js';
import { CHECKOUT_URL, PRO_PRICE } from './lib/config.js';
import * as license from './lib/license.js';
import * as drive from './lib/drive.js';

applyI18n();

const $ = (id) => document.getElementById(id);
let data = await store.load();
let query = '';

// ---------- render ----------
function render() {
  const groupsEl = $('groups');
  groupsEl.textContent = '';
  const totalTabs = data.groups.reduce((n, g) => n + g.tabs.length, 0);
  $('summary').textContent = t('summary', nTabs(totalTabs), nGroups(data.groups.length));
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
  node.querySelector('.meta').textContent = `${nTabs(g.tabs.length)} · ${formatDate(g.createdAt)}`;

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
  toast(t('importDone', nTabs(res.tabs), nGroups(res.groups)));
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
    span.textContent = `${name} — ${nTabs(g.tabs.length)} · ${t('deletedOn', formatDate(g.deletedAt))}`;
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
    span.textContent = `${formatDate(s.at)} — ${t('summary', nTabs(s.tabs), nGroups(s.groups))}`;
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
  $('recover-body').textContent = t('recoverBody', nTabs(tabs), nGroups(backup.length));
  $('recover').hidden = false;
  $('btn-recover').onclick = async () => {
    await store.importGroups(backup);
    $('recover').hidden = true;
    toast(t('recovered'));
    await bump('recoveries');
    checkReview();
  };
}

// ---------- one-time review request ----------
async function checkReview() {
  const m = await getMeta();
  if (!shouldAskReview(m) || !data.groups.length) return;
  $('review').hidden = false;
  $('btn-review-yes').onclick = async () => {
    await setMeta({ reviewPrompt: 'done' });
    $('review').hidden = true;
    chrome.tabs.create({ url: `https://chromewebstore.google.com/detail/${chrome.runtime.id}/reviews` });
  };
  $('btn-review-no').onclick = async () => {
    await setMeta({ reviewPrompt: 'dismissed' });
    $('review').hidden = true;
  };
}

// ---------- SureTab Pro ----------
const LICENSE_ERRORS = {
  invalid: 'licenseInvalid',
  limit: 'licenseLimit',
  'wrong-product': 'licenseWrong',
  network: 'licenseNetwork'
};
const DRIVE_ERRORS = {
  'auth-needed': 'driveReconnect',
  'auth-cancelled': 'driveCancelled',
  'auth-failed': 'driveCancelled',
  network: 'licenseNetwork'
};
const proMsg = (text) => ($('pro-msg').textContent = text || '');

async function busy(button, fn) {
  const all = document.querySelectorAll('#dlg-pro button');
  all.forEach((b) => (b.disabled = true));
  proMsg(t('working'));
  try {
    await fn();
  } finally {
    all.forEach((b) => (b.disabled = false));
    if ($('pro-msg').textContent === t('working')) proMsg('');
  }
}

async function renderPro() {
  const [p, d] = await Promise.all([license.getPro(), drive.getDrive()]);
  const active = license.isProActive(p);
  $('pro-locked').hidden = active;
  $('pro-active').hidden = !active && p.status !== 'revoked';
  $('btn-buy').textContent = t('buyPro', PRO_PRICE);
  if (p.status === 'revoked') {
    $('pro-locked').hidden = false;
    $('pro-active').hidden = true;
    proMsg(t('proRevoked'));
    return;
  }
  if (!active) return;
  $('pro-state').textContent = t('proActive');

  const configured = drive.driveConfigured();
  let status;
  if (!configured) status = t('driveUnavailable');
  else if (!d.connected) status = t('driveNotConnected');
  else if (d.needsAuth) status = t('driveReconnect');
  else if (d.lastError) status = t('driveError', d.lastError);
  else if (d.lastBackupAt) status = t('driveLast', formatDate(d.lastBackupAt));
  else status = t('driveNever');
  $('drive-status').textContent = status;
  $('drive-actions').hidden = !configured;
  $('btn-drive-connect').hidden = d.connected && !d.needsAuth;
  $('btn-drive-now').hidden = !d.connected || d.needsAuth;
  $('btn-drive-restore').hidden = false;
  $('btn-drive-disconnect').hidden = !d.connected;
}

$('btn-pro').onclick = async () => {
  proMsg('');
  $('drive-list').hidden = true;
  await renderPro();
  $('dlg-pro').showModal();
  // Re-check the license if the last check is older than an hour.
  const p = await license.getPro();
  if (p.licenseKey && Date.now() - (p.validatedAt || 0) > 60 * 60 * 1000 &&
      (await chrome.permissions.contains({ origins: [license.LS_ORIGIN] }))) {
    await license.validate();
    await renderPro();
  }
};

$('btn-buy').onclick = () => chrome.tabs.create({ url: CHECKOUT_URL });

$('btn-activate').onclick = () =>
  busy($('btn-activate'), async () => {
    // Ask for the network permission only now, inside the click.
    const granted = await chrome.permissions.request({ origins: [license.LS_ORIGIN] });
    if (!granted) return proMsg(t('permDenied'));
    try {
      await license.activate($('license-input').value);
      $('license-input').value = '';
      proMsg('');
      await renderPro();
      toast(t('proActivated'));
    } catch (e) {
      proMsg(t(LICENSE_ERRORS[e.code] || 'licenseInvalid'));
    }
  });

$('btn-deactivate').onclick = async () => {
  if (!confirm(t('confirmDeactivate'))) return;
  await busy($('btn-deactivate'), async () => {
    await license.deactivate();
    await drive.disconnect();
    proMsg('');
    await renderPro();
  });
};

async function connectDrive() {
  const granted = await chrome.permissions.request({ permissions: ['identity'], origins: [drive.GOOGLE_ORIGIN] });
  if (!granted) throw Object.assign(new Error('perm'), { code: 'perm' });
}

function driveFailure(e) {
  if (e.code === 'perm') return proMsg(t('permDenied'));
  proMsg(t(DRIVE_ERRORS[e.code] || 'driveError', e.message));
}

$('btn-drive-connect').onclick = () =>
  busy($('btn-drive-connect'), async () => {
    try {
      await connectDrive();
      await drive.backupNow(store.exportData(data), { interactive: true });
      proMsg('');
      toast(t('driveBackedUp'));
    } catch (e) {
      driveFailure(e);
    }
    await renderPro();
  });

$('btn-drive-now').onclick = () =>
  busy($('btn-drive-now'), async () => {
    try {
      await drive.backupNow(store.exportData(data), { interactive: true });
      proMsg('');
      toast(t('driveBackedUp'));
    } catch (e) {
      await drive.setDrive({ lastError: e.code, needsAuth: e.code === 'auth-needed' });
      driveFailure(e);
    }
    await renderPro();
  });

$('btn-drive-disconnect').onclick = async () => {
  await drive.disconnect();
  proMsg('');
  await renderPro();
};

$('btn-drive-restore').onclick = () =>
  busy($('btn-drive-restore'), async () => {
    const ul = $('drive-list');
    ul.textContent = '';
    try {
      await connectDrive();
      const files = await drive.listBackups();
      proMsg(files.length ? '' : t('driveNoBackups'));
      for (const f of files) {
        const li = document.createElement('li');
        const span = document.createElement('span');
        span.textContent = `${f.name} — ${formatDate(Date.parse(f.modifiedTime))}`;
        const btn = document.createElement('button');
        btn.className = 'btn small';
        btn.textContent = t('restore');
        btn.onclick = () =>
          busy(btn, async () => {
            try {
              const json = await drive.downloadBackup(f.id);
              const groups = parseImport(JSON.stringify(json));
              const res = await store.importGroups(groups);
              proMsg('');
              toast(t('importDone', nTabs(res.tabs), nGroups(res.groups)));
            } catch (e) {
              driveFailure(e);
            }
          });
        li.append(span, btn);
        ul.append(li);
      }
      ul.hidden = !files.length;
    } catch (e) {
      driveFailure(e);
    }
  });

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
checkReview();
store.purgeOldTrash();
