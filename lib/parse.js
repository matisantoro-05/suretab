// Parses pasted text or a file into groups: [{ title, createdAt?, starred?, tabs: [{url, title}] }]
// Supports: SureTab JSON export, Toby JSON export (and other JSON with url objects),
// OneTab text export ("url | title", blank line between groups) and plain URL lists.

const URL_RE = /^[a-z][a-z0-9+.-]*:\/\/\S+/i;

export function parseImport(input) {
  const text = String(input || '').replace(/^﻿/, '').trim();
  if (!text) return [];
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      return parseJson(JSON.parse(text));
    } catch {
      // Not valid JSON: fall through to the text parser.
    }
  }
  return parseText(text);
}

function parseJson(obj) {
  if (obj && obj.app === 'suretab' && Array.isArray(obj.groups)) {
    return obj.groups
      .map((g) => ({
        title: String(g.title || ''),
        createdAt: g.createdAt,
        starred: Boolean(g.starred),
        tabs: toTabs(g.tabs || [])
      }))
      .filter((g) => g.tabs.length);
  }
  const out = [];
  collect(obj, '', out);
  return out.filter((g) => g.tabs.length);
}

function toTabs(list) {
  return list
    .filter((x) => x && typeof x.url === 'string' && URL_RE.test(x.url.trim()))
    .map((x) => {
      const url = x.url.trim();
      return { url, title: String(x.customTitle || x.title || x.name || url).trim() || url };
    });
}

// Walks any JSON. Every array that contains objects with a "url" becomes a group,
// titled with the nearest parent "title"/"name" (Toby: lists[].title -> cards[]).
function collect(node, ctxTitle, out) {
  if (Array.isArray(node)) {
    const tabs = toTabs(node);
    if (tabs.length) out.push({ title: ctxTitle || '', tabs });
    for (const x of node) {
      if (x && typeof x === 'object' && typeof x.url !== 'string') collect(x, ctxTitle, out);
    }
  } else if (node && typeof node === 'object') {
    const title = typeof node.title === 'string' ? node.title : typeof node.name === 'string' ? node.name : ctxTitle;
    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') collect(v, title, out);
    }
  }
}

function parseText(text) {
  const groups = [];
  let current = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      if (current.length) groups.push({ title: '', tabs: current });
      current = [];
      continue;
    }
    const sep = line.indexOf(' | ');
    const url = (sep === -1 ? line : line.slice(0, sep)).trim();
    const title = sep === -1 ? url : line.slice(sep + 3).trim() || url;
    if (URL_RE.test(url)) current.push({ url, title });
  }
  if (current.length) groups.push({ title: '', tabs: current });
  return groups;
}
