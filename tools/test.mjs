// Node tests with a fake `chrome` API. Run: node tools/test.mjs <extension dir>
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ext = path.resolve(process.argv[2]);
const imp = (p) => import(pathToFileURL(path.join(ext, p)).href);

// ---- fake chrome ----
const mem = {};
let bmId = 10;
const bm = new Map(); // id -> {id, parentId, title, url, dateAdded}
globalThis.chrome = {
  storage: { local: {
    async get(k) { return k in mem ? { [k]: structuredClone(mem[k]) } : {}; },
    async set(o) { for (const [k, v] of Object.entries(o)) mem[k] = structuredClone(v); },
    async remove(k) { for (const key of [].concat(k)) delete mem[key]; }
  } },
  bookmarks: {
    async search({ title }) { return [...bm.values()].filter((b) => b.title === title); },
    async create({ parentId = '2', title, url }) {
      if (url && url.startsWith('javascript:')) throw new Error('bad url');
      const b = { id: String(bmId++), parentId, title, url, dateAdded: Date.now() };
      bm.set(b.id, b); return b;
    },
    async removeTree(id) {
      for (const b of [...bm.values()]) if (b.parentId === id) await this.removeTree(b.id);
      bm.delete(id);
    },
    async update(id, { title }) { bm.get(id).title = title; },
    async getSubTree(id) {
      const build = (n) => ({ ...n, children: n.url ? undefined : [...bm.values()].filter((c) => c.parentId === n.id).map(build) });
      return [build(bm.get(id))];
    }
  }
};

const { parseImport } = await imp('lib/parse.js');
const store = await imp('lib/store.js');
const { mirror, readBackup } = await imp('lib/bookmarks.js');

// ---- parse: OneTab text ----
const onetab = `https://a.com/x | Page A
https://b.com | Page B | with pipe

https://c.com | C
not a url
https://d.com`;
let g = parseImport(onetab);
assert.equal(g.length, 2);
assert.equal(g[0].tabs.length, 2);
assert.equal(g[0].tabs[1].title, 'Page B | with pipe');
assert.equal(g[1].tabs.length, 2);
assert.equal(g[1].tabs[1].title, 'https://d.com');

// ---- parse: Toby-like JSON ----
const toby = { version: 3, lists: [
  { title: 'Work', cards: [{ title: 'Docs', customTitle: 'My docs', url: 'https://docs.x' }, { title: 'Mail', url: 'https://mail.x' }] },
  { title: 'Fun', cards: [{ title: 'YT', url: 'https://yt.x' }] },
  { title: 'Empty', cards: [] }
] };
g = parseImport(JSON.stringify(toby));
assert.deepEqual(g.map((x) => [x.title, x.tabs.length]), [['Work', 2], ['Fun', 1]]);
assert.equal(g[0].tabs[0].title, 'My docs');

// ---- parse: own export round trip ----
const own = { app: 'suretab', groups: [{ title: 'T', createdAt: 5, starred: true, tabs: [{ url: 'https://z.x', title: 'Z' }] }] };
g = parseImport(JSON.stringify(own));
assert.equal(g[0].starred, true);
assert.equal(g[0].createdAt, 5);
assert.equal(parseImport('').length, 0);
assert.equal(parseImport('{broken json https://q.x').length, 0);
assert.equal(parseImport('﻿https://bom.x').length, 1);

// ---- store ----
const g1 = await store.addGroup([{ url: 'https://1.x', title: 'One' }, { url: '', title: 'skip' }]);
assert.equal(g1.tabs.length, 1);
const g2 = await store.addGroup([{ url: 'https://2.x', title: 'Two' }, { url: 'https://3.x', title: 'Three' }], 'Pair');
let d = await store.load();
assert.equal(d.groups.length, 2);
assert.equal(d.groups[0].id, g2.id, 'newest first');

// concurrent writes must not lose data
await Promise.all([1, 2, 3, 4, 5].map((i) => store.addGroup([{ url: `https://c${i}.x` }])));
d = await store.load();
assert.equal(d.groups.length, 7, 'no lost concurrent writes');

// delete -> trash -> undo
await store.deleteGroup(g2.id);
d = await store.load();
assert.equal(d.groups.length, 6);
assert.equal(d.trash[0].id, g2.id);
await store.restoreFromTrash(g2.id);
d = await store.load();
assert.ok(d.groups.some((x) => x.id === g2.id));

// remove link -> undo
const trashId = await store.removeTab(g2.id, 0);
d = await store.load();
assert.equal(d.groups.find((x) => x.id === g2.id).tabs.length, 1);
assert.ok(trashId);
// removing the last link removes the group
await store.removeTab(g1.id, 0);
d = await store.load();
assert.ok(!d.groups.some((x) => x.id === g1.id));

// snapshots exist and can be restored
const snaps = await store.listSnapshots();
assert.ok(snaps.length >= 1);
const before = (await store.load()).groups.length;
await store.restoreSnapshot(snaps[snaps.length - 1].at);
// restoring keeps the pre-restore state as the newest snapshot, so it can be undone
const after = await store.listSnapshots();
assert.equal(after[0].groups, before);
await store.restoreSnapshot(after[0].at);
assert.equal((await store.load()).groups.length, before);

// rename / star / sort
await store.renameGroup(g2.id, '  Renamed  ');
await store.toggleStar(g2.id);
d = await store.load();
assert.equal(store.sortGroups(d.groups)[0].id, g2.id, 'starred first');
assert.equal(d.groups.find((x) => x.id === g2.id).title, 'Renamed');

// import + export text
const r = await store.importGroups(parseImport(onetab));
assert.deepEqual(r, { groups: 2, tabs: 4 });
assert.match(store.toOneTabText([{ tabs: [{ url: 'https://a', title: 'A' }] }]), /^https:\/\/a \| A$/);

// trash purge only removes old items
d = await store.load();
mem.data.trash.push({ id: 'old', tabs: [], deletedAt: Date.now() - 40 * 864e5 });
await store.purgeOldTrash();
d = await store.load();
assert.ok(!d.trash.some((x) => x.id === 'old'));
assert.ok(d.trash.length > 0, 'recent trash kept');

// ---- bookmarks mirror ----
d = await store.load();
d.groups[0].tabs.push({ url: 'javascript:void(0)', title: 'bad' });
await mirror(d.groups);
await mirror(d.groups); // second run replaces, never duplicates
const folders = await chrome.bookmarks.search({ title: 'SureTab backup' });
assert.equal(folders.length, 1);
assert.equal((await chrome.bookmarks.search({ title: 'SureTab backup (updating)' })).length, 0);
const back = await readBackup();
const real = d.groups.reduce((n, x) => n + x.tabs.filter((t) => !t.url.startsWith('javascript:')).length, 0);
assert.equal(back.reduce((n, x) => n + x.tabs.length, 0), real);
assert.equal(back.find((x) => x.title === 'Renamed')?.tabs.length, 1);
// empty list must NOT wipe the backup
await mirror([]);
assert.equal((await readBackup()).length, back.length);

console.log('All tests passed ✓');

// ---- review prompt rules ----
const { shouldAskReview } = await imp('lib/meta.js');
const now = Date.now();
assert.equal(shouldAskReview({ installedAt: now, saves: 10 }, now), false, 'too soon');
assert.equal(shouldAskReview({ installedAt: now - 3 * 864e5, saves: 2 }, now), false, 'too few saves');
assert.equal(shouldAskReview({ installedAt: now - 3 * 864e5, saves: 3 }, now), true);
assert.equal(shouldAskReview({ installedAt: now, recoveries: 1 }, now), true, 'after a recovery');
assert.equal(shouldAskReview({ installedAt: now - 9e9, saves: 9, reviewPrompt: 'dismissed' }, now), false, 'never twice');
console.log('Review prompt tests passed ✓');

// ---- SureTab Pro: license ----
const license = await imp('lib/license.js');
const calls = [];
let lsReply = {};
globalThis.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), opts });
  const r = typeof lsReply === 'function' ? lsReply(String(url), opts) : lsReply;
  if (r === 'offline') throw new TypeError('Failed to fetch');
  return { ok: (r.status || 200) < 400, status: r.status || 200, json: async () => r.body, text: async () => JSON.stringify(r.body) };
};
const good = { activated: true, error: null, instance: { id: 'inst-1' }, license_key: { status: 'active' }, meta: { store_id: 517981, product_id: 1508709 } };

lsReply = { body: good };
let p = await license.activate('  KEY-1  ');
assert.equal(license.isProActive(p), true);
assert.equal(p.licenseKey, 'KEY-1');
assert.match(calls.at(-1).url, /licenses\/activate$/);
assert.equal(new URLSearchParams(calls.at(-1).opts.body).get('license_key'), 'KEY-1');

// wrong product -> rejected and activation released
await license.deactivate();
lsReply = (url) => (url.endsWith('activate') && !url.endsWith('deactivate') ? { body: { ...good, meta: { store_id: 1, product_id: 2 } } } : { body: { deactivated: true } });
await assert.rejects(license.activate('OTHER'), (e) => e.code === 'wrong-product');
assert.match(calls.at(-1).url, /deactivate$/);
assert.equal(license.isProActive(await license.getPro()), false);

// invalid / limit / offline
lsReply = { status: 404, body: { activated: false, error: 'license_key not found.' } };
await assert.rejects(license.activate('NOPE'), (e) => e.code === 'invalid');
lsReply = { status: 400, body: { activated: false, error: 'This license key has reached the activation limit.' } };
await assert.rejects(license.activate('FULL'), (e) => e.code === 'limit');
lsReply = 'offline';
await assert.rejects(license.activate('X'), (e) => e.code === 'network');

// validate: offline keeps Pro, refund (disabled) revokes it
lsReply = { body: good };
await license.activate('KEY-1');
lsReply = 'offline';
assert.equal(license.isProActive(await license.validate()), true, 'offline keeps Pro');
lsReply = { status: 503, body: {} };
assert.equal(license.isProActive(await license.validate()), true, 'server error keeps Pro');
lsReply = { body: { valid: true, license_key: { status: 'active' }, meta: good.meta } };
assert.equal(license.isProActive(await license.validate()), true);
lsReply = { status: 400, body: { valid: false, license_key: { status: 'disabled' }, meta: good.meta } };
p = await license.validate();
assert.equal(p.status, 'revoked');
console.log('License tests passed ✓');

// ---- SureTab Pro: Google Drive ----
const drive = await imp('lib/drive.js');
const files = new Map(); // id -> {id,name,parents,mimeType,content,modifiedTime}
let nextId = 1;
let tokenFlowCalls = 0;
globalThis.chrome.identity = {
  getRedirectURL: () => 'https://abc.chromiumapp.org/',
  launchWebAuthFlow: async ({ url, interactive }) => {
    tokenFlowCalls++;
    assert.match(url, /drive\.file/);
    return `https://abc.chromiumapp.org/#access_token=TOKEN${tokenFlowCalls}&expires_in=3600&token_type=Bearer`;
  }
};
function driveFetch(url, opts = {}) {
  const u = new URL(url);
  const method = opts.method || 'GET';
  assert.match(opts.headers.Authorization, /^Bearer TOKEN/);
  const send = (status, body) => ({ status, body });
  if (u.pathname === '/drive/v3/files' && method === 'GET') {
    const qy = u.searchParams.get('q');
    let list = [...files.values()];
    const name = qy.match(/name='([^']+)'/);
    if (name) list = list.filter((f) => f.name === name[1]);
    const contains = qy.match(/name contains '([^']+)'/);
    if (contains) list = list.filter((f) => f.name.includes(contains[1]));
    const parent = qy.match(/'([^']+)' in parents/);
    if (parent) list = list.filter((f) => (f.parents || []).includes(parent[1]));
    if (/mimeType='application\/vnd.google-apps.folder'/.test(qy)) list = list.filter((f) => f.mimeType.includes('folder'));
    return send(200, { files: list.map(({ id, name, modifiedTime }) => ({ id, name, modifiedTime })) });
  }
  if (u.pathname === '/drive/v3/files' && method === 'POST') {
    const meta = JSON.parse(opts.body);
    const id = 'f' + nextId++;
    files.set(id, { id, ...meta, modifiedTime: new Date().toISOString() });
    return send(200, { id });
  }
  if (u.pathname === '/upload/drive/v3/files' && method === 'POST') {
    const parts = opts.body.split(/--suretab[a-z0-9]+/);
    const meta = JSON.parse(parts[1].split('\r\n\r\n')[1]);
    const content = parts[2].split('\r\n\r\n')[1].replace(/\r\n$/, '');
    const id = 'f' + nextId++;
    files.set(id, { id, ...meta, content, modifiedTime: new Date().toISOString() });
    return send(200, { id });
  }
  const m = u.pathname.match(/files\/(f\d+)$/);
  if (m && method === 'PATCH') { files.get(m[1]).content = opts.body; return send(200, { id: m[1] }); }
  if (m && method === 'DELETE') { files.delete(m[1]); return send(204, null); }
  if (m && method === 'GET') return send(200, JSON.parse(files.get(m[1]).content));
  return send(404, { error: 'unknown ' + method + ' ' + u.pathname });
}
lsReply = (url, opts) => driveFetch(url, opts);

// an old daily copy that must be pruned
const oldDay = new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10);
const payload = store.exportData(await store.load());
await drive.backupNow(payload, { interactive: true });
const folder = [...files.values()].find((f) => f.mimeType.includes('folder'));
files.set('f999', { id: 'f999', name: `suretab-backup-${oldDay}.json`, parents: [folder.id], mimeType: 'application/json', content: '{}' });
await drive.backupNow(payload); // second run: updates, no duplicates, prunes
const names = [...files.values()].map((f) => f.name).sort();
const today = new Date().toISOString().slice(0, 10);
assert.deepEqual(names, ['SureTab', 'suretab-backup-' + today + '.json', 'suretab-backup.json']);
assert.equal(tokenFlowCalls, 1, 'token reused while valid');
const backups = await drive.listBackups();
assert.equal(backups.length, 2);
const restored = await drive.downloadBackup(backups.find((b) => b.name === 'suretab-backup.json').id);
assert.equal(parseImport(JSON.stringify(restored)).reduce((n, g) => n + g.tabs.length, 0), payload.groups.reduce((n, g) => n + g.tabs.length, 0));
// folder deleted in Drive -> recreated automatically
files.clear();
await drive.backupNow(payload);
assert.equal([...files.values()].filter((f) => f.name === 'suretab-backup.json').length, 1);
// expired token in background -> silent refresh
await drive.setDrive({ tokenExp: 0 });
await drive.backupNow(payload);
assert.equal(tokenFlowCalls, 2);
console.log('Drive tests passed ✓');
