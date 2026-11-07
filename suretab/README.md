# SureTab – Save tabs, never lose them

[**➜ Install from the Chrome Web Store**](https://chromewebstore.google.com/detail/apohnmmpeoppgmldpjkedfobohofihnn?utm_source=item-share-cb)

A Manifest V3 Chrome extension that saves your open tabs into a list (like OneTab)...

## Why

The most popular tab savers have the same recurring complaint in their reviews: *"it deleted all my saved tabs"*. SureTab adds three independent safety nets:

| Safety net | What it protects against |
|---|---|
| **Bookmark backup** – every group is mirrored to a `SureTab backup` bookmarks folder | Browser or "cleaner" apps wiping extension storage. Bookmarks survive and sync with the Google account. If the list is ever empty but the backup exists, SureTab offers a 1-click recovery. |
| **Trash (30 days)** – deleted groups and links are recoverable, with Undo | Accidental deletes |
| **Automatic snapshots** – last 5, at most one per hour | Bad imports, mass changes, bugs |

The backup is never overwritten with an empty list, and a new backup is fully written before the old one is removed.

## Features

- Save the current window, all windows, or one tab (popup, right-click menu, `Alt+Shift+S`)
- Restore a group, in the current or a new window; background tabs open as lightweight placeholders that load only when viewed
- Search, rename groups, pin groups to the top, remove single links
- **Import** from OneTab (text export), Toby (JSON export), SureTab backups or any list of URLs
- **Export** a full JSON backup or copy everything as text (OneTab format)
- English and Spanish UI, light and dark mode
- 100% local: no account, no servers, no analytics

## Project structure

```
manifest.json
background.js      service worker: saving, context menus, shortcut, bookmark backup
popup.html/js      toolbar popup
manager.html/js    the saved-tabs page
lazy.html/js       placeholder page for restored background tabs
lib/store.js       data layer (storage, trash, snapshots)
lib/bookmarks.js   bookmark backup + recovery
lib/parse.js       importers (OneTab, Toby, JSON, URL lists)
lib/i18n.js        helpers
_locales/          en, es
```

## Development

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select this folder.
2. After editing, click the reload icon on the extension card.

Tests (Node 18+) run the store, importers and backup logic against a fake `chrome` API:

```
node tools/test.mjs .
```

## License

MIT
