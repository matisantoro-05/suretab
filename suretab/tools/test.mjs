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
    async set(o) { for (const [k, v] of Object.entries(o)) mem[k] = structuredClone(v); }
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
