// Data layer. Everything lives in chrome.storage.local under one key.
// Safety nets against data loss (the #1 complaint about OneTab/Session Buddy):
//   1. Deleted groups go to a trash for 30 days instead of disappearing.
//   2. Rolling automatic snapshots (max 5, at most one per hour).
//   3. A mirror of every group in a bookmarks folder (see bookmarks.js),
//      which survives extension data wipes and syncs with the Google account.

export const KEY = 'data';
const SNAP_KEY = 'snapshots';
const TRASH_DAYS = 30;
const SNAP_MAX = 5;
const SNAP_INTERVAL_MS = 60 * 60 * 1000;

export const DEFAULT_SETTINGS = {
  closeAfterSave: true,
  skipPinned: true,
  restoreUnloaded: true,
  removeOnRestore: false,
  bookmarkBackup: true
};

export function emptyData() {
  return { version: 1, groups: [], trash: [], settings: { ...DEFAULT_SETTINGS } };
}

function normalize(d) {
  const data = d && typeof d === 'object' ? d : emptyData();
  data.version = 1;
  data.groups = Array.isArray(data.groups) ? data.groups : [];
  data.trash = Array.isArray(data.trash) ? data.trash : [];
  data.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
  return data;
}

export async function load() {
  const r = await chrome.storage.local.get(KEY);
  return normalize(r[KEY]);
}

export function newId() {
  return crypto.randomUUID();
}

export function cleanTab(t) {
  const url = String(t.url || '').trim();
  return { url, title: String(t.title || url).trim() || url };
}

// Serialize writes made from this context so read-modify-write never interleaves.
let queue = Promise.resolve();
export function mutate(fn) {
  const run = queue.then(async () => {
    const data = await load();
    await maybeSnapshot(data);
    const result = await fn(data);
    await chrome.storage.local.set({ [KEY]: data });
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

// ---------- snapshots ----------
async function maybeSnapshot(data, force = false) {
  if (!data.groups.length) return;
  const r = await chrome.storage.local.get(SNAP_KEY);
  const snaps = Array.isArray(r[SNAP_KEY]) ? r[SNAP_KEY] : [];
  const last = snaps[0];
  if (!force && last && Date.now() - last.at < SNAP_INTERVAL_MS) return;
  snaps.unshift({ at: Date.now(), groups: structuredClone(data.groups) });
  await chrome.storage.local.set({ [SNAP_KEY]: snaps.slice(0, SNAP_MAX) });
}

export async function listSnapshots() {
  const r = await chrome.storage.local.get(SNAP_KEY);
  const snaps = Array.isArray(r[SNAP_KEY]) ? r[SNAP_KEY] : [];
  return snaps.map((s) => ({
    at: s.at,
    groups: s.groups.length,
    tabs: s.groups.reduce((n, g) => n + g.tabs.length, 0)
  }));
}

export async function restoreSnapshot(at) {
  const r = await chrome.storage.local.get(SNAP_KEY);
  const snaps = Array.isArray(r[SNAP_KEY]) ? r[SNAP_KEY] : [];
  const snap = snaps.find((s) => s.at === at);
  if (!snap) return false;
  return mutate(async (d) => {
    await maybeSnapshot(d, true); // keep the current state recoverable too
    d.groups = structuredClone(snap.groups);
    return true;
  });
}

// ---------- groups ----------
export function addGroup(tabs, title = '') {
  const clean = tabs.map(cleanTab).filter((t) => t.url);
  if (!clean.length) return Promise.resolve(null);
  return mutate((d) => {
    const g = { id: newId(), title, createdAt: Date.now(), starred: false, tabs: clean };
    d.groups.unshift(g);
    return g;
  });
}

export function importGroups(groups) {
  return mutate((d) => {
    let count = 0;
    const now = Date.now();
    const incoming = groups
      .map((g, i) => ({
        id: newId(),
        title: String(g.title || ''),
        createdAt: Number(g.createdAt) || now - i,
        starred: Boolean(g.starred),
        tabs: (g.tabs || []).map(cleanTab).filter((t) => t.url)
      }))
      .filter((g) => g.tabs.length);
    incoming.forEach((g) => (count += g.tabs.length));
    d.groups.push(...incoming);
    return { groups: incoming.length, tabs: count };
  });
}

export function renameGroup(id, title) {
  return mutate((d) => {
    const g = d.groups.find((x) => x.id === id);
    if (g) g.title = title.trim();
  });
}

export function toggleStar(id) {
  return mutate((d) => {
    const g = d.groups.find((x) => x.id === id);
    if (g) g.starred = !g.starred;
  });
}

export function deleteGroup(id) {
  return mutate((d) => {
    const i = d.groups.findIndex((x) => x.id === id);
    if (i === -1) return;
    const [g] = d.groups.splice(i, 1);
    d.trash.unshift({ ...g, deletedAt: Date.now() });
  });
}

export function removeTab(groupId, index) {
  return mutate((d) => {
    const g = d.groups.find((x) => x.id === groupId);
    if (!g) return;
    const [t] = g.tabs.splice(index, 1);
    if (!g.tabs.length) d.groups = d.groups.filter((x) => x.id !== groupId);
    if (!t) return null;
    // A removed link goes to the trash as a one-link group, so it can be undone.
    const trashed = { id: newId(), title: g.title, createdAt: g.createdAt, starred: false, tabs: [t], deletedAt: Date.now() };
    d.trash.unshift(trashed);
    return trashed.id;
  });
}

export function restoreFromTrash(id) {
  return mutate((d) => {
    const i = d.trash.findIndex((x) => x.id === id);
    if (i === -1) return;
    const [g] = d.trash.splice(i, 1);
    delete g.deletedAt;
    d.groups.unshift(g);
  });
}

export function emptyTrash() {
  return mutate((d) => {
    d.trash = [];
  });
}

export async function purgeOldTrash() {
  const limit = Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000;
  const current = await load();
  if (!current.trash.some((g) => g.deletedAt <= limit)) return; // nothing to write
  return mutate((d) => {
    d.trash = d.trash.filter((g) => g.deletedAt > limit);
  });
}

export function saveSettings(patch) {
  return mutate((d) => {
    d.settings = { ...d.settings, ...patch };
  });
}

export function sortGroups(groups) {
  return [...groups].sort((a, b) => (b.starred - a.starred) || (b.createdAt - a.createdAt));
}

export function exportData(data) {
  return {
    app: 'suretab',
    version: 1,
    exportedAt: new Date().toISOString(),
    groups: data.groups.map(({ title, createdAt, starred, tabs }) => ({ title, createdAt, starred, tabs }))
  };
}

// OneTab's "export" text format: "url | title" per line, blank line between groups.
export function toOneTabText(groups) {
  return groups.map((g) => g.tabs.map((t) => `${t.url} | ${t.title}`).join('\n')).join('\n\n');
}
