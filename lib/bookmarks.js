// Mirrors all saved groups into a bookmarks folder ("SureTab backup").
// Bookmarks are not extension storage: they survive when the browser wipes
// extension data, and they sync for free with the user's Google account.

export const FOLDER = 'SureTab backup';
const TEMP = 'SureTab backup (updating)';

async function findFolders(title) {
  const res = await chrome.bookmarks.search({ title });
  return res.filter((b) => !b.url);
}

function label(g) {
  const d = new Date(g.createdAt || Date.now());
  const date = d.toISOString().slice(0, 16).replace('T', ' ');
  return g.title ? `${g.title} · ${date}` : date;
}

export async function mirror(groups) {
  // Never replace an existing backup with an empty list: an empty store is
  // exactly what data loss looks like, and the backup is how we recover.
  if (!groups.length) return;

  for (const old of await findFolders(TEMP)) await chrome.bookmarks.removeTree(old.id);
  const fresh = await chrome.bookmarks.create({ title: TEMP });
  for (const g of groups) {
    const sub = await chrome.bookmarks.create({ parentId: fresh.id, title: label(g) });
    for (const t of g.tabs) {
      try {
        await chrome.bookmarks.create({ parentId: sub.id, title: t.title, url: t.url });
      } catch {
        // Some URLs can't be bookmarked; skip them rather than abort the backup.
      }
    }
  }
  // Only remove the previous backup once the new one is complete.
  for (const old of await findFolders(FOLDER)) await chrome.bookmarks.removeTree(old.id);
  await chrome.bookmarks.update(fresh.id, { title: FOLDER });
}

export async function readBackup() {
  const [folder] = await findFolders(FOLDER);
  if (!folder) return [];
  const [tree] = await chrome.bookmarks.getSubTree(folder.id);
  return (tree.children || [])
    .filter((c) => !c.url)
    .map((c) => ({
      title: c.title.replace(/ · \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, '').replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/, ''),
      createdAt: c.dateAdded,
      tabs: (c.children || []).filter((b) => b.url).map((b) => ({ url: b.url, title: b.title || b.url }))
    }))
    .filter((g) => g.tabs.length);
}
