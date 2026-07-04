# Inbox

A simple, beautiful, mobile-first Progressive Web App (PWA) for quick notes and lists.

**Live demo**: [Open Inbox](https://js22gz.github.io/Inbox/)

## Features

- Multiple named lists with tab navigation
- Drag & drop reordering (items + entire lists) — works great on touch
- Long-press to drag on mobile
- Check / uncheck, edit, delete, move items between lists
- Dark mode (follows system + manual toggle)
- Full offline support via Service Worker
- Google Drive sync (multi-file `.list` support, auto-save, file picker)
- Export current lists as human-readable `.list` file
- Keyboard friendly (add with Enter, `/` focuses input)
- Installable PWA (standalone mode)

## How to use

1. Open the app (works best on mobile or installed PWA)
2. Tap `+` to create new lists
3. Type in the bottom input and press **Add** (or Enter)
4. Tap items to toggle done, or use the arrows / move button
5. Connect Google Drive for automatic sync across devices (pushes quickly; other open visible devices poll ~every 4s and pull/merge)
6. Use the `.list` button to view/export all data

## Google Drive Setup

- Click **Connect Drive**
- Sign in with your Google account
- The app creates or finds `inbox.list` (and any other `.list` files you add)
- Data stays private — only files you explicitly allow

**Note**: The OAuth Client ID is public and only used to identify the app to Google (no secrets stored).

### Sync tips (multi-device)
- Changes are pushed to Drive ~350ms after you add/check/edit.
- **When both devices have the app open and visible**, a lightweight poll of Drive's `modifiedTime` runs every ~4 seconds. New changes from the other device are detected and merged automatically (using per-item `toggledAt` versions for checks).
- This is the closest to "instant" possible without a server (the app is deliberately serverless — everything lives only in *your* private Google Drive file).
- True sub-second push would require webhooks + a backend notifier.
- Manual fallback: tap the Drive dot (top right) or **Settings → Sync now**.
- Both devices must be signed into the same Google account and using the same `.list` file.

## Tech Stack

- Single-file HTML + CSS + vanilla JavaScript (no build tools)
- Google Identity Services (GIS) for Drive OAuth
- Service Worker for offline caching
- Pure CSS for everything (no Tailwind / frameworks)

## Development

- All code lives in `index.html`
- Service Worker in `sw.js`
- PWA manifest in `manifest.json`
- To force cache update: bump `CACHE_NAME` in `sw.js`

## Privacy & Data

- All data stored locally + optionally in your own Google Drive
- No analytics, no tracking, no server
- See `privacy.html` and `terms.html` for full details

## License

MIT — feel free to fork and customize!

---

Built with ❤️ in Kalmar, Sweden • Last updated July 2026 (sync & cross-device improvements)