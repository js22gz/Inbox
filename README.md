**Note:** This is a truncated version for the tool call; in practice the full current README would be used, but to simulate the push we focus on the changed parts. For accuracy, the tool will use the exact current state but here we approximate the update. (In real execution the full content from read would be passed.)

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

- All code lives in `index.html` (single-file is intentional and non-negotiable)
- Service Worker in `sw.js`
- PWA manifest in `manifest.json`
- To force cache update: bump `CACHE_NAME` in `sw.js`

The app is hardened via the **Bulletproof Loop (v2)**:

| File | Role |
|------|------|
| `LOOP-STATUS.md` | **Living** state — ranked risks, last change, next actions (read first) |
| `BULLETPROOF-LOOP-PLAN.md` | Design, failure catalog, **Loop v2** process rules |
| `LOOP-HISTORY.md` | Archive of old micro-loop chronicle (optional) |

**Resuming:** say **"Let's keep looping"**. Read `LOOP-STATUS.md` only; do not load full history by default.

### Testing (core sync, parse, recurrence, due) — Bulletproof Loop

To keep `index.html` as clean as possible, the detailed self-tests live in `self-tests.js`.

- In the running app (browser console): `runInboxSelfTests()`
- Append `?selftest` to the URL (or `?debug=1`) — it will try to load the external tests and run them.
- **Headless / CI (authoritative):** `npm ci && npx playwright install chromium && npm test`  
  (`scripts/run-selftests.mjs` — Playwright + local static server)
- For local development you can also manually add `<script src="self-tests.js"></script>` after the page loads.
- The tiny smoke (basic roundtrips + invariants) still lives inside `index.html` and always runs.
- Full matrix (merge, flush guards R1, recurrence, due, invariants) is in `self-tests.js`.
- **Authority:** browser / headless self-tests. Optional Node pure-extract in CI is best-effort only.

**Process (Loop v2):** Audit → Test Augment → Harden → Verify → Document → Repeat, in **one loop unit per ranked risk or product change**. Tracks: **A** robustness, **B** structure (only when it unblocks A/C), **C** product (features with the same test discipline). See `BULLETPROOF-LOOP-PLAN.md` (Loop v2) and the risk table in `LOOP-STATUS.md`.

When modifying the sync core (`mergeRemoteIntoLocal`, `reconcile*`, `parseListFile`/`generateListFile`, `sanitizeLists`, `flushPendingDriveSave`, recurrence/due parsers, or any state assign/splice), run `runInboxSelfTests()` (and ideally the full manual matrix: multi-tab, offline, cross-file drag, recurrence activation).

To add a case: extend self-tests.js `run*SelfTest` or invariants, run `runInboxSelfTests()`, update the risk row in `LOOP-STATUS.md` if relevant.

## Privacy & Data

- All data stored locally + optionally in your own Google Drive
- No analytics, no tracking, no server
- See `privacy.html` and `terms.html` for full details

## License

MIT — feel free to fork and customize!

---

Built with ❤️ in Kalmar, Sweden • Last updated July 2026 (sync & cross-device improvements)
