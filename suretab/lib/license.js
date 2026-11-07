// SureTab Pro licenses through the Lemon Squeezy License API (no backend needed).
import { LS_STORE_ID, LS_PRODUCT_ID } from './config.js';

const PRO = 'pro';
const API = 'https://api.lemonsqueezy.com/v1/licenses/';
export const LS_ORIGIN = 'https://api.lemonsqueezy.com/*';

export async function getPro() {
  const r = await chrome.storage.local.get(PRO);
  return r[PRO] || {};
}

async function setPro(patch) {
  const next = { ...(await getPro()), ...patch };
  await chrome.storage.local.set({ [PRO]: next });
  return next;
}

export function isProActive(p) {
  return Boolean(p && p.licenseKey && p.instanceId && p.status === 'active');
}

function fail(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

async function call(action, params) {
  let res;
  try {
    res = await fetch(API + action, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params)
    });
  } catch {
    throw fail('network');
  }
  let json = {};
  try {
    json = await res.json();
  } catch {
    // keep empty
  }
  return { status: res.status, json };
}

function belongsToSureTab(meta) {
  return Boolean(meta) && Number(meta.store_id) === LS_STORE_ID && Number(meta.product_id) === LS_PRODUCT_ID;
}

function instanceName() {
  const platform = navigator.userAgentData?.platform || navigator.platform || 'computer';
  return `SureTab on ${platform}`;
}

export async function activate(rawKey) {
  const key = String(rawKey || '').trim();
  if (!key) throw fail('invalid');
  const { status, json } = await call('activate', { license_key: key, instance_name: instanceName() });
  if (status >= 500) throw fail('network');
  if (!json.activated) throw fail(/limit/i.test(json.error || '') ? 'limit' : 'invalid', json.error);
  if (!belongsToSureTab(json.meta)) {
    // Give the activation back so the buyer doesn't lose a slot on the other product.
    try {
      await call('deactivate', { license_key: key, instance_id: json.instance?.id });
    } catch {
      // ignore
    }
    throw fail('wrong-product');
  }
  return setPro({
    licenseKey: key,
    instanceId: json.instance.id,
    status: 'active',
    activatedAt: Date.now(),
    validatedAt: Date.now()
  });
}

// Re-check the license (weekly). Network problems never take Pro away.
export async function validate() {
  const p = await getPro();
  if (!p.licenseKey || !p.instanceId) return p;
  let r;
  try {
    r = await call('validate', { license_key: p.licenseKey, instance_id: p.instanceId });
  } catch {
    return p;
  }
  if (r.status >= 500 || r.status === 429) return p;
  const j = r.json;
  const ok = j.valid === true && belongsToSureTab(j.meta) && !['disabled', 'expired'].includes(j.license_key?.status);
  return setPro({ status: ok ? 'active' : 'revoked', validatedAt: Date.now() });
}

export async function deactivate() {
  const p = await getPro();
  if (p.licenseKey && p.instanceId) {
    try {
      await call('deactivate', { license_key: p.licenseKey, instance_id: p.instanceId });
    } catch {
      // Remove it locally anyway.
    }
  }
  await chrome.storage.local.remove(PRO);
}
