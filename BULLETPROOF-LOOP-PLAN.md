# Design: Bulletproofing the Inbox PWA – Iterative "/loop" Improvement Process

**Author:** Grok (systems architect subagent)  
**Date:** 2026-07-10  
**Status:** Draft  
**Scope:** index.html (single-file non-negotiable), self-tests.js, README.md, .github/workflows/ci.yml (minimal), sw.js (if needed for offline observability)  
**Related:** Recent addition of pure helpers (ts, compute*, ghostsToEndInPlace, etc.), test extraction to self-tests.js, PR-1..PR-5 changes (format/sanitize/soft-del, LWW/toggledAt, read-merge-write flushes, cross-file, observability).

---

## Overview

The Inbox PWA is a deliberately serverless, single-file vanilla JS Progressive Web App (core logic + UI in `index.html`) with sophisticated Google Drive multi-file `.list` sync. It uses Last-Write-Wins (LWW) per-item/list reconciliation driven by `toggledAt` (and fallbacks), soft-delete "ghosts"/tombstones (`deletedAt`), `orderUpdatedAt` for ordering, `lts` (list timestamp) matching, recurrence `[recurrent: ...]` and due `[due: ...]` metadata embedded in item text, and careful offline/reconnect/poll/flush handling.

This design defines a repeatable **Bulletproof Loop** (Audit → Test Augment → Harden → Verify → Document → Repeat) to systematically eliminate classes of bugs in the sync/merge/reconcile logic, `.list` parser/generator, recurrence/due interactions, offline races, and state invariants — while preserving the single-file delivery model and testability via exposed pure functions.

The goal is a "bulletproof" core where self-tests + runtime assertions catch regressions, invariants are enforced, and changes are small, verifiable, and incrementally shipped.

## Background & Motivation

Current state (post recent PRs):
- Pure helpers (`ts()`, `computeItemActivity()`, `computeListActivity()`, `ghostsToEndInPlace()`) extracted for testability (see lines ~566-587 in index.html).
- `self-tests.js` holds the bulk of the matrix (parse/generate roundtrips, sanitize, ghosts, 12-ish merge scenarios abbreviated, recurrence, due); smoke tests remain inside index.html.
- Core functions: `mergeRemoteIntoLocal`, `reconcileList`/`reconcileItems`/`reconcileItem`, `sanitizeLists`, `parseListFile`/`generateListFile`, `flushPendingDriveSave` (with read-merge-write + opSeq + structuralRemovePending), `syncRecurrenceState`/`syncDueState`, `applyDriveLists*`, cross-file move logic.
- Drive: multi-file support, polling (~2.5s when visible), debounce 350ms, pagehide/online/visibility/focus hooks, cache + persisted cache.
- Invariants partially documented in comments (ghosts at end via narrow ghostsToEndInPlace + construction, alive prefixes for clamp/render/patch/drag, maxDel > maxAct resurrection bias, no delAt on structural moves, seenTs dedup). Note: many direct assigns + promote paths do not call ghostsToEnd.

Pain points / why needed:
- Subtle races in flush (keepalive, offline, file-switch, concurrent structural moves) can resurrect ghosts or lose intent.
- Merge order + dedup logic (localPlacement bias for cross-list DnD) + remote ghosts can leave duplicate ts or non-suffixed ghosts.
- Parser/generator compat (legacy `@ts`, stray `|meta`, text containing `|upd:` or `|due:`, deleted-list pipes, empty listmeta, roundtrips with ghosts/recurrence/due) is exercised but not exhaustively fuzzed.
- Recurrence + due + sync/merge: `recurrenceJustCompleted` is session-only Set; dueAt can be text-derived or explicit; sync* run before render/save but interactions with LWW resurrects or cross-device order can surprise.
- State drift: ghosts not at end after some paths, duplicate timestamps (esp. after DnD + merge), alive lists not prefix, deleted lists not suffix.
- Testability good via `__inboxPure` + separate file, but full 12-scenario matrix abbreviated in self-tests.js; few runtime assertions; CI only does basic Node smoke + structure (brittle extraction).
- Offline/reconnect/polling: relies on later reconcile; structural bypass is recent and narrow.
- Single-file constraint means all hardening stays in index.html (or self-tests.js); no modules.

Without a systematic loop, each change risks regressions in the complex merge surface.

## Goals & Non-Goals

**Goals:**
- Define and operationalize the repeatable "Bulletproof Loop" process for ongoing hardening.
- Identify top failure modes with concrete coverage strategy in `self-tests.js`.
- Specify new test cases, invariants, and self-test augmentations (full matrix, edge roundtrips, recurrence+sync+merge, offline sims, cross-file).
- Add runtime assertions + debug aids (gated by `DEBUG`) inside `index.html` after key operations (merge, sanitize, structural, flush, saveAndRender ends; render paths use debug-only exposure). Any normalize/assert additions stay tiny and DEBUG-gated or cheap always-on (N small) to respect single-file delivery.
- Preserve and evolve single-file + pure-helpers approach for testability.
- Evolve CI (structure + smoke + optional full invocation hints) and manual verification (test.html, ?selftest, console).
- Phased, incremental PR plan (all changes inside allowed files) so each step is independently reviewable/testable.
- Make core "bulletproof": lost updates, ghost resurrection, dup ts, parse mangling, order loss, flush races, recurrence/due desync become hard to introduce and easy to detect.

**Non-Goals:**
- Split into multiple JS files or introduce build step (single-file non-negotiable).
- Add server, webhooks, or real-time beyond current poll+merge model.
- Change public `.list` format in a breaking way (strict compat + roundtrip required).
- Full property-based/fuzz testing or external test runners in this iteration (focus browser self-tests + CI smoke).
- Address UI polish, new features, or non-sync state.
- Remove existing DEBUG logs or comments; augment them.

Explicit boundaries: changes limited to `index.html`, `self-tests.js`, README.md (and minimal CI if required for verification). PRs stay small.

## Proposed Design

### The Bulletproof Loop (Repeatable Process)

A 6-phase cycle applied to each focus area or reported symptom. Use it for every sync/parser/recurrence change:

1. **Audit** — Grep/read targeted paths (merge*, reconcile*, sanitize*, parse*/generate*, flush*, syncRecurrence*/syncDue*, cross-file handlers, clamp/render paths that assume alive-prefix, state mutation sites from the PR-1 audit comment). Catalog assumptions vs reality. List top failure modes for the area. Run existing `runInboxSelfTests()` + manual scenarios (two tabs + Drive, offline toggle, drag cross-list/file, recurrence activate, due overdue).
2. **Test Augment** — Add failing (or coverage) cases to `self-tests.js` (and inline smoke where tiny). Add invariant checkers (pure or simple). Expand abbreviated matrix to explicit 12+ named cases (derive from logic in audit). Add cross-file, recurrence+merge, parse stress (text with meta chars, only-ghosts, deleted-list roundtrips), offline-sim (local edits + merge after "reconnect"), order/ghost-suffix asserts, mocked seq/id abort sim helper.
3. **Harden** — Fix root cause in index.html. Add/enhance runtime assertions (under `if (DEBUG)`; warn not throw). Introduce/strengthen guards (e.g., central `normalizeListsInPlace` calling ghostsToEnd + top-level list ghost suffix + assert suffix post-merge/sanitize/structural/apply/save paths; also after promote). Use `ts()` consistently. Tighten dedup/seenTs. Add local-toggle bias or due bias safety where races exist. Document the rule in comments. Prefer in-memory enforcement over generator changes.
4. **Verify** — Run full `runInboxSelfTests()` (in browser, ?selftest, test.html iframe). Manually exercise failure mode (e.g., two devices, kill one mid-edit, reconnect). Check smoke on load. Run CI locally via node snippets if possible. Add DEBUG=1 traces temporarily.
5. **Document** — Update the function header (e.g., mergeRemoteIntoLocal), PR-1 mutation audit comment, README "Testing" section, self-tests.js header/matrix comments. Add a "Failure Mode X covered by Y" note. Append to this design's "Revision Summary" (and after each PR implementation: "YYYY-MM-DD — PR-N merged — summary of what the Bulletproof Loop iteration covered + any new failure modes found").
6. **Repeat** — Pick next failure mode or re-audit after a batch. Schedule periodic full audit (e.g., before major release).

Apply the loop per PR or per focus area. Track open issues via comments or a lightweight list in README.

Note on verification: integration/race paths (flush guards, structuralRemovePending bypass, cross-file async target restore, opSeq/id mismatch aborts, keepalive) are primarily exercised via manual two-device/offline/Drive scenarios + DEBUG traces + ?selftest. Self-tests.js (via __inboxPure) covers pure merge/reconcile/parse/sanitize well; consider adding a small "sim" harness section in self-tests.js (state mocking for flush-like wrappers) for seq/id abort simulation without full async. Browser `runInboxSelfTests()` + manual + DEBUG is the verification authority.

### Architecture Overview (Key Data Flows)

```mermaid
graph TD
    A[User op: add/toggle/edit/drag/rec/due] --> B[Mutate state.lists + orderUpdatedAt/updatedAt/toggledAt/dueAt + saveData]
    B --> C[debounce flushPendingDriveSave]
    C --> D{onLine && !keepalive && !bypass?}
    D -->|yes| E[pull remote via fetchDriveFileLists force]
    E --> F[mergeRemoteIntoLocal(local, remote)]
    F --> G[apply if diff + render]
    F --> H[generate + saveToDrive]
    D -->|no| H
    I[Poll / visibility / online / focus] --> J[checkForRemoteChanges → loadAndApplyDriveData]
    J --> F
    K[Cross-file DnD] --> L[source splice + direct saveToDrive(src) + structuralRemovePending]
    L --> M[target: fetch + mergeRemoteIntoLocal(intent, remoteBase) + bg flush]
    N[parseListFile / generateListFile] <--> O[.list v2 + |ts|tg|upd|due|cts + // deleted + listmeta]
    P[sanitizeLists] --> Q[filter isValidItem + keep ghosts + applyDueFromText non-ghost + ts()]
    R[syncRecurrenceState / syncDueState] --> S[promoteByTimestamps + set checked/updated + recurrenceJustCompleted Set]
    R --> B
    T[reconcileItem / reconcileList] --> U[LWW + toggle special + local due bias + maxDel>maxAct ghost + order by oupd]
```

Pure boundary: `window.__inboxPure` exposes `ts, sanitizeLists, mergeRemoteIntoLocal, reconcile*, parse*, generate*, filterAlive*, ghostsToEndInPlace, recurrence/due parsers` for self-tests.js (and future Node smoke).

### Focus Area Deep Dives

**1. Sync/merge/reconcile logic (LWW + toggledAt + ghosts + order + cross-file)**
- `mergeRemoteIntoLocal`: lts/name match, reconcile per list/item, collect remote ghosts + local-only, dedup by ts (localPlacement bias for post-DnD), final local-toggle bias, then `return sanitizeLists(deduped) || []` (see ~846). Empty-remote path does `sanitize...; res.forEach(ghostsToEndInPlace)`. Main path relies on construction + per-list `[...kept, ...ghs]` in dedup (suffix is side-effect of in-memory state today; sanitize itself only filters/maps and does not reorder). No ghostsToEndInPlace on final result in remote-present path.
- `reconcile*`: maxDel > maxAct → ghost (resurrect bias); alive prefers full side then LWW (upd for text, special toggle, local due bias). Reconcile builds internal suffix (orderedAlive + ghosts) for items.
- Order: higher orderUpdatedAt wins base list for alive order; common + uniques; ghosts suffix.
- List ghosts: appended at end after alive (in merge construction).
- Cross-file: source direct write + mark structural; target does pull+full merge (not just splice) for del/resurrect/LWW/dedup safety.
- Failure modes: ghost resurrection on reconnect flush (mitigated by structural bypass + read-merge), dup ts after move+remote, order flip on tie, local toggle lost on race. (Note: current suffix in main merge is not via sanitize+ghostsToEnd; PR step 5 must centralize enforcement.)

**2. .list format parser + generator (compat, roundtrips, metadata)**
- generate (~4923): v2 header, # name + // listmeta, - [ ] text |ts:..|upd|due|tg|cts, // deleted ts:.. del:.., // deleted-list name:..|del:.. (encode name). Emission order follows in-memory array order (direct src.map + items.forEach); no internal ghostsToEnd or alive/ghost separation. Ghost emission order is side-effect of caller maintaining suffix invariant.
- parse (~4967): line-by-line, multi-strip |meta from end before anchoring |ts/@, post-clean only |upd|del residues, decode name, tolerate malformed tombstones. Defensive on input but does not normalize order.
- Handles legacy @, text containing literal |meta or ending in |due: (by design).
- Roundtrips must preserve ghosts (empty text), absent fields, list ts/oupd, due/recurrence text.
- Failure modes: mangled text with pipes/dates, lost metadata on mixed versions, only-ghost lists, deleted-list without lts, stray meta before ts. (In-memory suffix before generate is the contract.)

**3. Recurrence and due date interactions with sync and state**
- Text-embedded: `[recurrent: ...]` or `[due: ...]` at end; parsed on render/sync via getItemMeta + cache.
- syncRecurrenceState: per list, for each non-ghost, decide forceDormant / shouldActivate using evaluate + recentManualUncheck (tog>ca) + justCompleted; promoteByTimestamps + set checked/updated; clear Set at end; save if changed.
- syncDueState: promote overdue !checked due items.
- In reconcile: dueAt in activity (del decision), local due bias on alive.
- In sanitize: applyDueFromText only if !deletedAt and no explicit dueAt.
- In cross-move: due preserved in target reconcile.
- Failure modes: recurrence auto-reactivate fights user uncheck across devices (session Set not persisted), dueAt vs text drift after merge, promote timing vs merge (orderUpdatedAt bump), checkedAt clear for recurrent reactivation.

**4. Offline, reconnect, polling, flush races**
- flushPending: snapshot content+fileId + opSeq early; bypass structural; if online+!keepalive: pull+merge+adopt+generate; guards abort if switched/seq mismatch; keepalive path skips pull.
- Listeners: pagehide/visibility/focus/pageshow/online → flush + loadAndApply + startPolling.
- Polling: cheap modifiedTime poll every ~2.5s (visible+connected); on change → loadAndApply (which may merge).
- loadAndApply: opSeq, targetId bind, sig compare, pending-upload special merge+save path, applyPreserving.
- structuralRemovePending: short window bypass for source of cross move (prevents pull resurrect).
- driveFileSwitching / driveOpSeq / driveSwitchSeq guard almost every async path.
- Failure modes: flush writes wrong file post-switch, offline edit + reconnect loses to stale remote or resurrects, poll during switch, keepalive + merge conflict, multiple tabs (not currently coordinated beyond Drive).

**5. State invariants (ghosts at end, no duplicate ts, alive prefixes, etc.)**
Current documented/enforced (precise call sites):
- Item ghosts suffix within lists: `ghostsToEndInPlace` called narrowly (empty-remote merge path ~706 does `res.forEach(ghostsToEndInPlace)`; local-only appends; dedup rebuilds `[...kept, ...ghs]` per list; reconcile builds `finalItems = [...orderedAlive, ...ghosts]`). sanitizeLists (~2511) only filters/maps (preserves order, never reorders). Top-level list ghosts rely on append order in merge + manual splice+push in deleteCurrentList (~3481).
- No equivalent helper for top-level lists array suffix.
- `promoteByTimestamps` (~3834) does `list.items = [...toPromote, ...remaining]` (remaining may contain ghosts); no post-call ghostsToEnd.
- Many paths: `state.lists = sanitizeLists(...) || []` + `clampCurrentIndex` (loadData, applyDriveListsToState ~665, various switch/assigns ~2700 etc.) without ghostsToEnd.
- Parse (~4967) and generate (~4923) follow in-memory encounter order (generate does direct `.forEach` / `src.map` emitting in array order; no internal collect-alive-then-ghosts).
- Render/clamp (~2574, 3395, 4674) defensively use `isDeleted` / `filterAlive*` + `findIndex(!isDeleted)`, which masks but does not enforce prefix/suffix.
- clampCurrentIndex prefers first !isDeleted.
- filterAlive* / getAliveItems / isDeleted used in counts, empty checks, drag etc.
- No dups: seenTs in reconcile/merge dedup paths; localPlacement post-DnD.
- ts() >0 validation; isValidItem requires ts for ghosts too.
- orderUpdatedAt / lts / toggledAt etc. numeric or absent.
- recurrenceJustCompleted: session Set<ts> (module-local to IIFE in index.html; not on __inboxPure).

Missing/hard-to-enforce today:
- "Alive prefix + ghosts suffix" strictly after every mutation that could interleave (post-promoteByTimestamps, within-file DnD reorders, list delete splices, direct parse assigns, many apply/switch paths).
- Globally unique ts within a file (cross-list items must not collide; addItem etc. use Date.now()).
- Deleted lists always at end of top-level array.
- No duplicate list names among alive? (current allows?).
- After every merge/sanitize/apply: ghostsToEnd + no-dup-ts + every ghost has ts + alive items have text+bool+ts.
- list.timestamp present for matching.
- Post syncRecurrence/syncDue: orderUpdatedAt bumped only on actual change sometimes.
- (Central `normalizeListsInPlace` for per-item ghostsToEnd + top-level list ghosts suffix is the right addition in PR step 5.)

**6. Testability while keeping single-file**
- Pure helpers + `window.__inboxPure` (and internal reconcile* exposed for depth).
- self-tests.js consumes them; can be appended or ?selftest loaded.
- Inline smoke always runs (parse/gen/merge/ghost/filter).
- DEBUG-gated sims and console.
- Manual: test.html iframe, two-browser + Drive, offline airplane mode.

### Top Failure Modes & Coverage Plan (self-tests.js)

From code + comments + typical LWW+ghost+offline systems:

1. **Ghost resurrection on reconnect flush after structural (cross-list/file) remove** — remote has ghost or absent; local splice not yet flushed.  
   Cover: simulate structuralPending + merge local-edit vs remote-ghost; assert ghost wins or item absent per rules. Test flush bypass path.

2. **Duplicate ts after within-file cross-list DnD + remote pull** — remote retains old placement.  
   Cover: localPlacement dedup test; merge after move simulation; assert single survivor in final list.

3. **Toggle lost on concurrent check/uncheck (toggledAt LWW fail)** — esp. with checkedAt fallback or equal ts.  
   Cover: explicit localToggle > remoteToggle + equal case (prefer checked); include in 12 scenarios.

4. **Parse mangles text containing |upd:/|due: or legacy @ + fields** — or roundtrip loses metadata.  
   Cover: literal meta text cases, ends-with-due, old@+upd, upd/due/tg roundtrips, ghost-only lists.

5. **Deleted-list or ghost list roundtrip + name with pipes** — lts absent vs present.  
   Cover: delList with/without ts, encode/decode, parse after gen.

6. **Recurrence reactivation fights manual uncheck or cross-device** — or justCompleted leaks.  
   Cover: tog>ca recent uncheck keeps dormant; justCompleted prevents immediate re-activate; simulate merge of completed recurrent.

7. **Due promotion + merge interaction loses dueAt or order** — or due text vs explicit field drift.  
   Cover: applyDueFromText in sanitize, due bias in reconcile, syncDue after merge, cross move due preservation.

8. **Flush race: writes to wrong file after rapid switch** — or post-await seq/id mismatch.  
   Cover: (in self-test sim) capture intendedFileId + opSeq abort paths; assert no clobber (via side-effect mocks or sigs).

9. **Order loss or ghosts not at end after merge/reconcile/assign / promote / within-file DnD / list delete / direct parse assigns** — alive prefix broken for clamp/drag (render/clamp defensively filter but state can interleave).  
   Cover: post-every merge/sanitize assert ghosts suffix + alive prefix + no internal ghosts; orderUpdatedAt win cases; add post-promote and post-structural asserts. (Current suffix relies on construction/dedup in merge + appends, not universal normalize.)

10. **Offline edits + poll/reconnect + pending timer** — stale sig or lost local intent.  
    Cover: generate local, "remote" changes, mergeRemote, assert merged has both + correct LWW; no-pull keepalive path.

11. **Sanitize drops required ghost or injects fields wrongly** — absent deletedAt must stay absent; ghosts kept.  
    Cover: existing + fresh objects + only-ghosts.

12. **Cross-file move resurrects or dups on target when item was ghosted remotely** — or source restore fails.  
    Cover: move + target has higher del; move + conflict; failure restore path.

Additional invariants to assert in tests (and runtime):
- For any list: all ghosts after all alive (by deletedAt presence).
- No duplicate timestamps across items in a lists array (post merge/sanitize).
- Deleted lists appear after all alive lists.
- Every ghost item has finite ts; every alive has text + boolean checked + finite ts.
- After mergeRemoteIntoLocal(l, r) result is always sanitize-able and ghostsToEnd.
- Roundtrip: parse(generate(x)) deep-equal after sanitize (ghost order normalized to suffix after in-memory enforcement).
- compute* and ts never produce NaN/neg.
- (Post-normalize) ghosts suffix is reliably true for generate emission.

### New Test Cases & Invariants to Add to self-tests.js

- Full explicit 12 (or more) merge scenarios as named functions/cases. Expand abbreviated cases + derive remaining coverage from current LWW rules + post-processing in merge (dedup/localPlacement/local-toggle bias) + reconcile (maxDel>maxAct etc.). Derive during audit (step 1) rather than assuming historical DESIGN comments contain the full table. Use names like case1_remoteDelWins, case2_laterActResurrects, ...
- `testGhostsAlwaysSuffixAfterMerge()`, `testNoDuplicateTsPostDedup()`, `testAliveListsPrefixGhostLists()`.
- `testParseGenerateRoundtripMatrix()` covering: legacy, v2, ghosts, listmeta empty/full, deleted-list pipes, text-with-pipes/due, recurrence text + due field, only-ghosts.
- Recurrence+merge: item with [recurrent] toggled on one side, merged; order bump; reactivation guard.
- Due+sync+merge: overdue due promoted locally then merged with remote edit.
- Offline sim: `const localEdits = ...; const afterReconnect = mergeRemoteIntoLocal(localEdits, remoteWhileOffline);`
- Cross-file structural: mark pending, merge source vs target ghost.
- Invariant runner: after each interesting op, run `assertStateInvariants(result)`.
- Expose more if needed (e.g., getRecurrentEnforcement, applyPromotions, promoteByTimestamps) via __inboxPure or test shims for recurrence+merge cases. Keep tests declarative.

Add a `runInvariantsSelfTest()`. Also add a dedicated invariant test helper usable with mocked state snippets for seq/id mismatch (flush abort paths) even if asserting "would have aborted".

### Runtime Assertions / Debug Aids inside index.html

Under `const DEBUG = false;` (flip for sessions or ?debug):

Define helpers defensively:
```js
function assertGhostsAtEnd(list) { if (!DEBUG) return; /* impl */ if (bad) console.warn('[ASSERT] ghosts not at end', ...); /* never throw on hot paths */ }
function assertNoDupTsAcrossLists(lists) { if (!DEBUG) return; ... }
function assertValidSanitized(lists) { if (!DEBUG) return; ... }
```

After key stable points (post step-1 audit, call primarily here; render paths via debug exposure only):
```js
if (DEBUG) {
  assertGhostsAtEnd(l); assertNoDupTsAcrossLists(...);
}
```
Example at merge return / sanitize return / applyDrive* / end of flush success / saveAndRender / post-parse loads / after structural+save.

Helpers (new, small, pure-ish):
- `assertGhostsAtEnd(list)` — warn (not throw) if any deletedAt appears before a non-deleted.
- `assertNoDuplicateTimestamps(lists)` — global per file (consider cheap always-on in sanitize since N is tiny).
- `assertValidLists(lists)` — every list has name, items array or absent→[], ghosts have ts, etc.
- Call sites (after audit): every return of mergeRemoteIntoLocal, sanitizeLists, post-applyDrive*, after cross-file targetLists, end of flush success path, after syncRecurrence/syncDue if changed, post-parse in load paths, post structural op + save, saveAndRender ends. For render prep / renderItems: only expose via `window._inboxDebug.assertInvariants()` (do not auto-call in render hot path to avoid noise).
- In flush/load: log intended vs current + seq on abort paths (already partial).
- Add `window._inboxDebug = { assertInvariants, dumpGhosts, ... }` when DEBUG.
- In smoke/init: always run light invariant checks (non-throwing in prod). Add one-line size check (e.g., index.html char count or line count) in verification steps.

Keep lightweight; no perf impact when DEBUG=false. (Current index.html already has `if (DEBUG) window._inboxState = state;`)

### Evolving CI and Manual Verification

**CI (.github/workflows/ci.yml):**
- Keep/strengthen basic structure check (core fns, v2 marker, pure helpers, test hook).
- Node smoke: improve extraction robustness or run more of pure path; assert key invariants on sample data; test parse/gen/merge matrix snippets. Keep continue-on-error. Add non-extraction grep step for asserts/normalize/explicit cases.
- Add step: "Run self-test smoke via node (if possible)" or document that full matrix requires browser.
- On PR: require the structure + smoke pass. Optionally add a comment: "Reminder: runInboxSelfTests() + manual Drive scenarios."
- Version bump in sw.js + CACHE still manual on deploy for rollout.
- Future: consider Playwright or similar for headless ?selftest run (non-blocking now).
- Document explicitly: browser self-tests authoritative; Node smoke best-effort.

**Manual + dev verification:**
- `?selftest` or `?debug=1` auto-runs.
- `test.html` for convenient console view.
- Browser console: `runInboxSelfTests()` (always delegates to full when loaded).
- DEBUG=true + console for traces + asserts.
- Cross-device: two incognito or devices, same Drive account + same .list file; edit/check/drag/rec on one, watch poll/merge on other; offline one, edit both, reconnect.
- Edge: rapid file add/switch while editing; drag item to file while offline; text with `|due:1234` + recurrence; delete while other device ghosts it.
- After edit to merge/parse: always `runInboxSelfTests()`.
- README update: strengthen "When modifying the sync core... run `runInboxSelfTests()`."

### Observability Additions

- Signature already includes ghosts/oupd (good for detecting del/order).
- Add optional DEBUG dump of sig before/after merge.
- In self-tests: capture and assert on signatures for key cases.

## Key Decisions

1. **Single-file + pure extraction is the testability strategy** — not modules. `__inboxPure` + self-tests.js keeps delivery unchanged while allowing rich tests. Recent pure helpers (ts etc.) are the foundation; we extend this pattern.

2. **Ghosts/tombstones are permanent suffix citizens** — never filter them out of arrays permanently (needed for roundtrip emit). All display/clamp/drag paths use `filterAlive*` / `isDeleted`. `ghostsToEndInPlace` + asserts are the enforcement mechanism.

3. **LWW + "maxDel > maxAct resurrection bias" + local safety biases** — preferred over strict remote-win or vector clocks (simplicity for serverless). Local toggle bias and localPlacement for DnD are pragmatic post-processing to protect user intent in races.

4. **Read-merge-write in flush + opSeq + fileId snapshot + structural bypass** — the main defense against flush/switch/offline races. We harden guards and add asserts rather than redesign the async model.

5. **Recurrence/due live in item text + derived fields** — parse on demand + cache; sync* are post-mutation pre-save enforcers. justCompleted is intentionally session-local (cross-device "completion" is just a checked state with time). Note: `recurrenceJustCompleted` is module-local inside the IIFE in index.html and is *not* exposed via `__inboxPure`; self-tests simulate it via a fallback var in the test scope.

6. **Compat first for .list** — parser strips defensively, generator emits v2 + all fields; old clients see readable text. Roundtrip + self-tests are the contract.

7. **Bulletproof Loop over one-shot audit** — because the surface is subtle and will evolve. Each PR touches one loop iteration.

8. **Assertions are DEBUG + test-only by default** — production remains silent and fast; devs flip DEBUG or rely on self-tests.

9. **PRs are tiny and ordered** — each step adds tests or one hardening or one assert class so review can focus.

10. **No new external deps or test infra in phase 1** — leverage browser + existing Node smoke + manual.

## Risks & Mitigations

- **Risk: Adding asserts or extra calls in hot paths (render, every merge) regresses perf on low-end mobile.**  
  **Mitigation:** Gate under DEBUG (or cheap pure checks that early-return). Profile; call ghostsToEnd only when needed (already mostly conditional).

- **Risk: Overly strict invariants break legitimate states (e.g., temporarily mixed ghosts during a splice before end-of-op call).**  
  **Mitigation:** Assert only at "stable points" (post-merge return, post-sanitize, post-apply, end of saveAndRender, after structural op + save). Make asserts warn in DEBUG not throw in some paths.

- **Risk: Expanding self-tests.js makes it large; temptation to move logic back.**  
  **Mitigation:** Keep tests declarative + small helpers; only expose pure fns already in index.html.

- **Risk: CI Node extraction is brittle (regex on script) and silently skips.**  
  **Mitigation:** Keep `continue-on-error` for now; strengthen checks; document browser authority. Future: extract pure module comment block or duplicate minimal pure fns in a test-only way (but avoid dupe).

- **Risk: Cross-device + recurrence/due + timezones/clock skew cause user-visible "jitter".**  
  **Mitigation:** Use absolute ms; start-of-day helpers; document that recurrence is best-effort calendar, not cron. Tests use fixed anchors.

- **Risk: Hardening makes merge more "local bias" and surprises when remote should win.**  
  **Mitigation:** Clear comments + table in code; self-tests name the bias cases; preserve remote win when timestamps prove it.

- **Risk: Single-file means large PRs for any change.**  
  **Mitigation:** The phased PR Plan below + loop ensures each PR is a focused delta.

- **Risk: After centralizing normalize + ghostsToEnd calls, first cross-device sync after deploy will turn historical interleaved ghosts (pre-soft-del .list files on Drive or from prior bugs) into suffixed order on merge (desired behavior, but may cause visible reordering for users on first reconcile).**  
  **Mitigation:** Document in release notes / README as "data normalization on first sync". Tests already cover roundtrips; no user data loss.

- **Risk: Timestamp uniqueness (Date.now collisions on fast concurrent adds + merge) is called out as missing but only dedup-mitigated.**  
  **Mitigation:** Add cheap `assertNoDupTs` (or integrate into sanitize since N is tiny) as always-on guard where practical; merge already has seenTs + localPlacement.

## PR Plan

Break into independently doable, ordered, small steps (tests-first where possible). Each can land, be tested with `runInboxSelfTests()`, and rolled via CACHE bump if needed. All edits target `index.html` + `self-tests.js` + docs/README/CI.

After each PR lands, append a short entry to the Revision Summary in this design (and the review file): "YYYY-MM-DD — PR-N merged — summary of Bulletproof Loop coverage + new failure modes found".

1. **Audit + document current state (no behavior change)**  
   - Grep + read all merge/reconcile/sanitize/parse/generate/flush/sync* paths.  
   - Expand the existing "MUTATION SITES AUDIT" comment with current line refs and new assumptions (ghost suffix after every stable point).  
   - Add a "State Invariants" comment block near pure helpers.  
   - Update README "Testing" and "Development" to reference the Bulletproof Loop (link to this doc or copy summary).  
   - Files: index.html, README.md. Verify: smoke still passes.

2. **Strengthen inline smoke + expose more pure helpers**  
   - Enhance the always-on smoke (after generate/parse) with basic ghost-suffix, no-dup-ts, alive-prefix asserts (non-fatal in prod).  
   - Expose additional helpers via `window.__inboxPure`: `ghostsToEndInPlace`, `computeListActivity`, `getDriveListsSignature`, `applyPromotions` (or minimal), recurrence enforcement helpers if useful.  
   - Files: index.html. Verify: DEBUG smoke + runInboxSelfTests().

3. **Augment self-tests.js: full matrix + new invariant tests (tests first)**  
   - Expand abbreviated "12 scenarios" into explicit named cases (case1_remoteDelWins, case2_laterActResurrects, ... up to cross-order, ghost-list, local-only + remote-ghost). Derive the remaining ~10 cases from current reconcileItem/mergeRemoteIntoLocal logic (LWW rules + post-processing: dedup/localPlacement/local-toggle) during the audit step (step 1); index.html comments reference DESIGN table but do not embed the full enumerated matrix.  
   - Add `runInvariantsSelfTest()` + helpers: `assertGhostsSuffix(lists)`, `assertNoDuplicateTs(lists)`, `assertAlivePrefixGhosts(lists)`, `assertRoundtrip(listObj)`.  
   - Add dedicated tests for: only-ghost lists, deleted-list roundtrip with/without lts + pipe names, text containing meta chars + due, recurrence+toggle merge, due bias, offline-sim merge.  
   - Call the new runner from `runAllSelfTests`.  
   - File: self-tests.js. Verify: runInboxSelfTests() now exercises more; existing pass.

4. **Add DEBUG runtime assertions in index.html (core paths)**  
   - Implement `assertGhostsAtEnd(list)`, `assertNoDupTsAcrossLists(lists)`, `assertValidSanitized(lists)` (cheap).  
   - Insert calls (gated `if (DEBUG) { ... }`) immediately after: every return of mergeRemoteIntoLocal, sanitizeLists, reconcile*, post-applyDrive*, after cross-file targetLists construction, end of flush success path, after syncRecurrence/syncDue if changed, post-parse in load paths.  
   - Add `window._assertInboxInvariants = () => ...` for manual debug.  
   - File: index.html. Verify: flip DEBUG=true locally, run tests + manual ops, no false positives.

5. **Harden ghosts-to-end + dedup + alive prefix enforcement**  
   - Ensure `ghostsToEndInPlace` (or equivalent normalize) is called in *all* list assign paths that can receive remote/parse data (loadData, apply*, merge local-only already does some). Add post-call assert under DEBUG.  
   - Strengthen the dedup/seenTs logic in merge (and reconcile) to also enforce global no-dup-ts + move ghosts suffix.  
   - In structural ops (splice for del/drag/cross) + recurrence promote: after mutation call ghostsToEndInPlace on affected list(s) + bump order if needed.  
   - Add a top-level `normalizeListsInPlace(lists)` that does ghostsToEnd + sort ghosts lists to end.  
   - File: index.html. Verify: self-tests new invariants + manual drag + merge.

6. **Harden flush / reconnect / polling race guards + add traces**  
   - Audit and tighten abort conditions in flushPendingDriveSave, loadAndApply, checkForRemoteChanges (already strong; add explicit comments + one more "intendedFile still active" re-check before final save).  
   - Ensure structuralRemovePending window interacts correctly with opSeq.  
   - Under DEBUG: more detailed logs for seq/id/switch decisions and pre/post merge sigs.  
   - Consider a tiny "lastFlushIntent" state for diagnostics.  
   - Also audit/tighten the cross-file async target restore path (source re-add on failure, ~2309).  
   - File: index.html. Verify: simulate rapid switches (console or scripted), offline/online cycles; self-tests cover bypass/merge + mocked seq/id mismatch "would abort" helper.

7. **Harden parse/generate + add roundtrip stress in tests**  
   - Minor parser tweaks *only if augmentation finds new roundtrip failures* (e.g., more defensive trimming for listmeta anywhere, ensure deleted-list always roundtrips absent ts correctly).  
   - Preferred: ensure in-memory suffix (via central normalizeListsInPlace called before generate, or at ends of merge/sanitize/apply/save paths) so that generate (~4923: direct src.map + per-list forEach on items) emits ghosts after alives as a side-effect of correct state. Alternative (less preferred): enhance generate to explicitly separate alives vs ghosts for emission (while still preferring in-memory invariant). Reference: generate does not call ghostsToEndInPlace and emits in array encounter order; same for item `// deleted` lines. Parser remains defensive.  
   - Add comprehensive roundtrip + metadata preservation tests in self-tests (including recurrence text + explicit dueAt coexisting).  
   - File: index.html + self-tests.js. Verify: full parse/gen cases pass; no text mangling on known problem strings.

8. **Harden recurrence/due + merge/sync interactions**  
   - Ensure syncRecurrenceState and syncDueState run (or are considered) in merge adoption paths where order/checked may have changed (currently render paths call them; consider a post-merge normalize hook).  
   - Make dueAt survival + local bias explicit in reconcileItem comments + tests.  
   - Document that recurrenceJustCompleted is session-only (add comment).  
   - Add merge+recurrence and merge+due cases to self-tests (including cross-device "completion" as checked state).  
   - File: index.html + self-tests.js. Verify: recurrence/due self-tests + new merge cases.

9. **Evolve CI + verification docs**  
   - Improve CI Node smoke to invoke more pure functions and run a couple invariant checks on constructed data. Keep `continue-on-error` for extraction. Add a *non-extraction* verification step (e.g., grep for new assert* fns + normalizeListsInPlace + explicit case names in self-tests.js). Document in README and CI: "browser self-tests are authoritative; Node smoke is best-effort".  
   - Add a CI step comment or echo reminding to run browser self-tests.  
   - Update README with Bulletproof Loop steps, "top failure modes covered", how to add a case, and "always run self-tests after sync changes".  
   - Optionally bump sw.js CACHE minor if surface changes.  
   - Files: .github/workflows/ci.yml, README.md, (index.html if needed for doc). Verify: CI passes; docs clear.

10. **Final polish, full re-audit, and close the loop iteration**  
    - Run the full Bulletproof Loop: re-audit all focus areas with new asserts/tests in place.  
    - Add any missed lightweight runtime guards (e.g., via debug exposure only for render/clamp paths).  
    - Update this design doc's "Revision Summary" (and review file) with outcomes. After PRs: append "YYYY-MM-DD — PR-N merged — ..." entries.  
    - Manual cross-device + offline matrix on live (or preview).  
    - If all green, consider marking a milestone (e.g., "v14 bulletproof core").  
    - Files: all touched. Verify: `runInboxSelfTests()` clean, CI green, manual scenarios pass, no new regressions. (One-line size sanity for single-file growth.)

Each step is small enough for focused review. After step 3 tests are stronger before hardening. Repeat the loop for future issues.

---

## Revision Summary

*(Append here after each review/iteration of this document or the implemented changes. Format: Date — Status change — Summary — Responder notes.)*

- 2026-07-10 — Initial Draft — Created after full codebase exploration (grep/read of mergeRemoteIntoLocal ~703, reconcile* ~850, sanitize ~2511, parse/gen ~4923/4967, flush ~1558, syncRec* ~4117/4283, cross-file ~2240, self-tests.js full, CI, sw). Identified 12+ failure modes. Defined Bulletproof Loop + concrete PR Plan. No review_file supplied, so followed "Without review_file" path.

- 2026-07-10 — Review addressed — Incorporated all reviewer findings (precise ghostsToEnd/merge/generate call sites, invariants, PR step clarifications for derivation + generate emission strategy, runtime assert call sites + warn-only + debug exposure, loop manual/sim notes, CI non-extract + authority doc, risks data-migration + dup note, Key Decision justCompleted note, Goals sentence, Revision future PR entries). All open items addressed in design + this review file. No wontfix; all suggestions improved accuracy without worsening design.

*(Future entries will update Status: open → addressed + Response when processing review feedback. After PRs: append "YYYY-MM-DD — PR-N merged — Bulletproof Loop coverage + new modes found".)*

- 2026-07-10 — Full loop steps 1-10 executed & pushed — Step 1: audit+docs (mutation sites, invariants block, README). Step 2: smoke enhance + more __inboxPure. Step 3: expanded matrix + invariants in self-tests. Step 4: DEBUG asserts + global. Step 5: normalizeListsInPlace + calls in assign/structural. Step 6: flush extra checks + traces. Step 7: normalize before generate + roundtrip stress. Step 8: rec/due comments + merge cases. Step 9: CI non-extract + docs. Step 10: re-audit, extra clamp guard, plan revision. All steps committed+pushed. Verify: runInboxSelfTests, smoke, greps clean. No new regressions. Milestone: core sync hardened.

- 2026-07-10 — Post-loop evaluation (CLI run) — Local Node sims of smoke + invariants + merge LWW cases: PASSED (ghost suffix, no-dup ts, basic cases 1-2 + rec/due merge). Structure checks 7/8 (one grep scope miss). Grep counts confirm features in index.html/self-tests/CI/plan. Pure logic clean. Full browser eval ( ?selftest + runInboxSelfTests() ) + manual multi-device recommended for rec/due + DOM paths. Loop successful for sync core robustness.

---

---

## Iteration 2: Starting the Loop (post 2026-07-10 full pass)

### Audit Phase (current as of now)

**Quantitative:**
- index.html ~253kB (slightly grown from hardenings, still acceptable).
- Remaining raw `Number.isFinite && >0`: 1 (inside ts() definition itself).
- normalizeListsInPlace calls: 8+ (good coverage in merge, apply, flush, structural, load).
- DEBUG asserts: present post-merge, post-apply, post-clamp, etc.
- self-tests.js: 6 invariant asserts, 9+ explicit merge cases, roundtrips.
- Flush guards: 50+ mentions.

**Findings / Gaps identified (new for this iteration):**
1. **Incomplete normalize coverage in assign paths**:
   - Cached preview/switch paths (e.g. ~2795, 2808, 2827, 2848, 2962): `state.lists = sanitize...` without follow-up normalizeListsInPlace or post-assign assert.
   - Connect choice direct assign (~1590).
   - Some loadAndApply and restore paths miss the central normalize (rely on sanitize only).
   - Recommendation: Add `if (DEBUG) normalizeListsInPlace(state.lists);` + assert in these stable points.

2. **Test matrix still partial**:
   - self-tests still comments "abbreviated" in places; only ~9 explicit cases (plan targeted full 12 + more).
   - Missing dedicated tests for: full cross-file structural + merge, parser with heavy rec+due+ghost combos, offline reconnect sim using actual flush logic, top-level list ghost suffix after multiple switches.
   - recurrenceJustCompleted sim is minimal.

3. **Generate emission**:
   - Some call sites to generateListFile (e.g. list modal, certain cross restores) may not have normalized state immediately before.
   - With normalize in place, ensure calls are after normalize in hot paths.

4. **Other**:
   - 5 raw patterns cleaned in this audit start.
   - No major new races found, but cached paths and preview logic could benefit from more DEBUG traces.
   - Invariants comment is good but can reference specific missing paths.
   - Full browser verification still needed (CLI sims pass for pure parts).

**Action from this audit**: Proceed to Test Augment (add cases + more sims), then Harden (add missing normalizes/asserts in assign paths), Verify (expanded Node + browser plan), Document (update this + README).

Next steps in this iteration will follow the loop.

**End of Design Document**