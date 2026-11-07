// Small usage counters kept apart from the user's data (never exported or backed up).
const META = 'meta';

export async function getMeta() {
  const r = await chrome.storage.local.get(META);
  return r[META] || {};
}

export async function setMeta(patch) {
  const m = await getMeta();
  await chrome.storage.local.set({ [META]: { ...m, ...patch } });
}

export async function bump(counter) {
  const m = await getMeta();
  await setMeta({ [counter]: (m[counter] || 0) + 1 });
}

// Ask for a review once, only after real use: 3+ saves over 2+ days, or after a recovery.
export function shouldAskReview(m, now = Date.now()) {
  if (m.reviewPrompt) return false; // already rated or dismissed
  if (m.recoveries > 0) return true;
  const days = (now - (m.installedAt || now)) / 864e5;
  return (m.saves || 0) >= 3 && days >= 2;
}
