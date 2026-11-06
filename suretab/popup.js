import { load } from './lib/store.js';
import { t, applyI18n } from './lib/i18n.js';

applyI18n();

const win = await chrome.windows.getCurrent();
const [active] = await chrome.tabs.query({ active: true, currentWindow: true });

const data = await load();
const total = data.groups.reduce((n, g) => n + g.tabs.length, 0);
document.getElementById('total').textContent = t('totalSaved', total);

async function save(scope) {
  const status = document.getElementById('status');
  document.querySelectorAll('button').forEach((b) => (b.disabled = true));
  const res = await chrome.runtime.sendMessage({ type: 'save', scope, windowId: win.id, tabId: active?.id });
  if (res?.error) status.textContent = res.error;
  else if (!res?.saved) status.textContent = t('nothingToSave');
  else {
    status.textContent = t('savedCount', res.saved);
    if (!data.settings.closeAfterSave) setTimeout(() => window.close(), 900);
    return;
  }
  document.querySelectorAll('button').forEach((b) => (b.disabled = false));
}

document.getElementById('save-window').onclick = () => save('window');
document.getElementById('save-all').onclick = () => save('all');
document.getElementById('save-tab').onclick = () => save('tab');
document.getElementById('open').onclick = async () => {
  await chrome.runtime.sendMessage({ type: 'open-manager', windowId: win.id });
  window.close();
};
