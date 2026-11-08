// SureTab Pro: automatic backup to the user's own Google Drive.
// Scope drive.file: SureTab only sees the files it creates (a "SureTab" folder).
import { GOOGLE_CLIENT_ID } from './config.js';

const DRIVE = 'drive';
const SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_ORIGIN = 'https://www.googleapis.com/*';
const FOLDER_NAME = 'SureTab';
const MAIN_FILE = 'suretab-backup.json';
const DAILY_PREFIX = 'suretab-backup-';
const KEEP_DAYS = 30;
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export const driveConfigured = () => Boolean(GOOGLE_CLIENT_ID);

export async function getDrive() {
  const r = await chrome.storage.local.get(DRIVE);
  return r[DRIVE] || {};
}

export async function setDrive(patch) {
  const next = { ...(await getDrive()), ...patch };
  await chrome.storage.local.set({ [DRIVE]: next });
  return next;
}

function fail(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

// ---------- auth (works in every Chromium browser, not only Chrome) ----------
export async function getToken(interactive) {
  const d = await getDrive();
  if (d.token && d.tokenExp > Date.now() + 60_000) return d.token;
  if (!chrome.identity) throw fail('auth-needed');
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    response_type: 'token',
    redirect_uri: chrome.identity.getRedirectURL(),
    scope: SCOPE,
    include_granted_scopes: 'true',
    prompt: interactive ? 'select_account' : 'none'
  }).toString();
  let redirect;
  try {
    redirect = await chrome.identity.launchWebAuthFlow({ url: url.href, interactive });
  } catch {
    throw fail(interactive ? 'auth-cancelled' : 'auth-needed');
  }
  const hash = new URLSearchParams(new URL(redirect).hash.slice(1));
  const token = hash.get('access_token');
  if (!token) throw fail(interactive ? 'auth-failed' : 'auth-needed', hash.get('error') || '');
  await setDrive({ token, tokenExp: Date.now() + Number(hash.get('expires_in') || 3600) * 1000, needsAuth: false });
  return token;
}

async function api(path, token, { method = 'GET', body, headers = {}, upload = false } = {}) {
  const base = upload ? 'https://www.googleapis.com/upload/drive/v3/' : 'https://www.googleapis.com/drive/v3/';
  let res;
  try {
    res = await fetch(base + path, { method, body, headers: { Authorization: `Bearer ${token}`, ...headers } });
  } catch {
    throw fail('network');
  }
  if (res.status === 401) {
    await setDrive({ token: null, tokenExp: 0 });
    throw fail('auth-needed');
  }
  if (!res.ok) throw fail('drive-error', `Google Drive error ${res.status}`);
  if (res.status === 204) return null;
  return res.json();
}

const q = (s) => encodeURIComponent(s);
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function findFiles(token, query, fields = 'files(id,name,modifiedTime)') {
  const r = await api(`files?q=${q(query + ' and trashed=false')}&fields=${q(fields)}&orderBy=modifiedTime desc&pageSize=100`, token);
  return r.files || [];
}

async function ensureFolder(token) {
  const d = await getDrive();
  if (d.folderId) return d.folderId;
  const [found] = await findFiles(token, `name='${FOLDER_NAME}' and mimeType='${FOLDER_MIME}'`);
  const id = found
    ? found.id
    : (await api('files?fields=id', token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME })
      })).id;
  await setDrive({ folderId: id });
  return id;
}

async function upsertFile(token, folderId, name, content) {
  const [existing] = await findFiles(token, `name='${esc(name)}' and '${folderId}' in parents`);
  if (existing) {
    await api(`files/${existing.id}?uploadType=media`, token, {
      method: 'PATCH',
      upload: true,
      headers: { 'Content-Type': 'application/json' },
      body: content
    });
    return existing.id;
  }
  const boundary = 'suretab' + Math.random().toString(36).slice(2);
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify({ name, parents: [folderId], mimeType: 'application/json' }) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
  const r = await api('files?uploadType=multipart&fields=id', token, {
    method: 'POST',
    upload: true,
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });
  return r.id;
}

// payload: the object from store.exportData(data)
export async function backupNow(payload, opts = {}) {
  try {
    return await backupOnce(payload, opts);
  } catch (e) {
    if (e.code !== 'drive-error') throw e;
    // The folder may have been deleted from Drive: forget it and try once more.
    await setDrive({ folderId: null });
    return backupOnce(payload, opts);
  }
}

async function backupOnce(payload, { interactive = false } = {}) {
  const token = await getToken(interactive);
  const folderId = await ensureFolder(token);
  const content = JSON.stringify(payload);
  const today = new Date().toISOString().slice(0, 10);
  await upsertFile(token, folderId, MAIN_FILE, content);
  await upsertFile(token, folderId, `${DAILY_PREFIX}${today}.json`, content);

  // Keep the daily copies of the last 30 days.
  const limit = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
  const daily = await findFiles(token, `name contains '${DAILY_PREFIX}' and '${folderId}' in parents`);
  for (const f of daily) {
    const day = f.name.slice(DAILY_PREFIX.length, DAILY_PREFIX.length + 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day < limit) {
      try {
        await api(`files/${f.id}`, token, { method: 'DELETE' });
      } catch {
        // Already gone or not deletable: an old copy left behind is harmless.
      }
    }
  }
  return setDrive({ connected: true, lastBackupAt: Date.now(), lastError: null, needsAuth: false });
}

export async function listBackups() {
  const token = await getToken(true);
  const folderId = await ensureFolder(token);
  return findFiles(token, `'${folderId}' in parents and name contains '${DAILY_PREFIX.slice(0, -1)}'`);
}

export async function downloadBackup(id) {
  const token = await getToken(true);
  return api(`files/${id}?alt=media`, token);
}

export async function disconnect() {
  await chrome.storage.local.remove(DRIVE);
}
