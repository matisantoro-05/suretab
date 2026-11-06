// Placeholder for a restored tab: costs almost no memory and loads the real
// page only when the user actually switches to the tab.
import { favicon } from './lib/i18n.js';

const params = new URLSearchParams(location.search);
const url = params.get('url') || '';
const title = params.get('title') || url;

document.title = title;
document.getElementById('title').textContent = title;
const link = document.getElementById('link');
link.textContent = url;
link.href = url;
if (url) document.getElementById('icon').href = favicon(url);

function go() {
  if (document.visibilityState === 'visible' && /^(https?|ftp|file):/i.test(url)) location.replace(url);
}
document.addEventListener('visibilitychange', go);
go();
