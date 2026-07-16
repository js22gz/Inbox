# Bulletproof Loop — Status (living)

**Last updated:** 2026-07-16 · **Process:** Loop v2  
**Re-audit:** 2026-07-16 (full pass — action list refresh, no app code change)  
**Code:** `index.html` ~6090 · `self-tests.js` ~1310 · suites: Due, Recurrence, SyncMerge, Invariants, FlushGuard, LifecycleGuard

## Resume

Say: **"Let's keep looping"**

1. Read **this file** (risks + next actions).
2. Pick **one open action ID** (or a product feature = Track C).
3. Run one loop unit → update this file → commit/push when asked.

Archive: `LOOP-HISTORY.md`. Design catalog: `BULLETPROOF-LOOP-PLAN.md`.

---

## Tracks

| Track | When |
|-------|------|
| **A** Robustness | Race, data loss, merge/flush/rec/due |
| **B** Structure | Needed to unblock A/C, or hot bug-prone surface |
| **C** Product | User-facing feature (+ failure-mode row if new) |

---

## Re-audit snapshot (2026-07-16)

### Healthy (keep green — do not re-open without a bug)

| Area | Evidence |
|------|----------|
| Merge LWW + ghosts + dedup | `mergeRemoteIntoLocal`, tests #1/#2/#5/#6, rename match |
| Flush wrong-file (R1) | Pure skip/abort/commit + FlushGuard + wired flush |
| Wake/poll vs switch (R5) | Pure wake/poll/continue + LifecycleGuard + online gated |
| Verify (R9) | `npm test` Playwright required in CI |
| Normalize on assigns | Most `state.lists =` paths call `normalizeListsInPlace` |
| File transitions | `withFileTransition` / seq / switching flag |

### Residual themes (why a new action list)

1. **Guards are pure; I/O paths are not fully simulated** — no mock `driveFetch` / multi-step async race tests.
2. **Cross-file move remains the hardest Drive surface** (~150 lines, fire-and-forget source save, complex restore).
3. **60s `structuralRemovePending`** intentionally blocks remote merge — correctness vs latency tradeoff, multi-device local-only.
4. **Product/domain edges** — empty-list rename, duplicate list names, rec+due parse limitation.
5. **UI/drag** large surface, almost no automated coverage (manual only).
6. **Prod DEBUG=false** — asserts are warn-only when DEBUG; always-on dup-ts is console.warn only.

---

## Action list (ranked) — *acquired by this re-audit*

Use these IDs as loop unit targets. **P0–P1 first.** Mitigated R1–R9 stay closed unless regression.

### P0 — Highest leverage next units

| ID | Action | Track | Why | Suggested loop unit |
|----|--------|-------|-----|---------------------|
| **A10** | **Async Drive race harness** — mock `driveFetch` / `saveToDrive`; simulate flush+switch, poll+switch, loadAndApply mid-transition | A | Pure guards (R1/R5) proven; real await interleaving not. Highest remaining *sync* risk class | Test Augment first (self-tests or `scripts/`); wire minimal test doubles on `Drive` surface; no UI |
| **A11** | **Cross-file item move hardening** — characterize `performCrossFileItemMove`; post-await abort; failed source save; restore integrity | A | Largest remaining Drive protocol; sparse tests; offline/reconnect sensitive | Audit + 3–5 pure/async sims + any missing gate before target apply |

### P1 — Correctness / multi-device

| ID | Action | Track | Why | Suggested loop unit |
|----|--------|-------|-----|---------------------|
| **A12** | **Structural bypass contract** — document + tests for 60s window; optional: clear flag only after confirmed save; dual-device “remote edit delayed” behavior | A | Protects reorder/cross-file but can hide remote checks ≤60s; flag is device-local | Tests that encode intended contract; only change window/clear semantics with tests first |
| **A13** | **loadAndApply structural-bypass save path** — after `await saveToDrive`, ensure no stale adopt; align with abort helper where content is regenerated | A | Bypass branches bind `targetFileId` (OK) but less uniform than merge branches | Small harden + test if gap confirmed in A10 harness |
| **A14** | **Empty / no-item list rename** — no item-overlap fallback; ensure lts always present after rename (already partly done); test empty rename + merge | A | Edge case of rename identity | 2 merge tests + ensure path |
| **A15** | **Duplicate alive list names** — `localByName` last-wins; cross-file home/`findTargetListIndexByName` ambiguous | A | Silent wrong-list match | Policy: prevent rename to existing name *or* match by lts only when ambiguous + tests |

### P2 — Domain / product edges

| ID | Action | Track | Why | Suggested loop unit |
|----|--------|-------|-----|---------------------|
| **A16** | **Rec + due in same item text** — known parser limitation (`\|due:` vs `[recurrent:]`) | A/C | Documented; can lose dueAt | Fix parse order or dual-extract + roundtrip tests |
| **A17** | **Recurrent completion log multi-device** — cooldown is session-local Map; two devices can double-log | C/A | Acceptable? or content-hash / same-day dedupe | Product decision + light harden |
| **A18** | **Recurrent home list missing** — `returnRecurrentItemToHome` no-ops if name not found | C | Silent stay on current list | UX: create list / warn / test |

### P3 — Structure (only when unblocking)

| ID | Action | Track | Why | Suggested loop unit |
|----|--------|-------|-----|---------------------|
| **B10** | **Drag controller still large** (`createDragController` ~200+ lines of nested handlers) | B | Hard to test races; only touch if drag bugs return | Extract pure geometry/state machine; characterization tests first |
| **B11** | **createItemElement** (~100 lines) event wiring | B | Same | Split render vs handlers if editing item model |
| **B12** | **Choke-point normalize** — reduce sprinkle; one post-mutation path (`saveAndRender` / apply) | B/A | Maintainability; fewer missed assigns | Map remaining assigns without normalize; centralize |

### P4 — Platform / ops

| ID | Action | Track | Why | Suggested loop unit |
|----|--------|-------|-----|---------------------|
| **O10** | **SW / cache bump discipline** after releases | ops | Stale PWA clients | Checklist in README; bump `CACHE_NAME` when shipping |
| **O11** | **CI disk / Playwright install** — local env was ENOSPC-sensitive | ops | CI uses `--with-deps`; document `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` fallback | Docs only unless CI flakes |

### Closed (reference)

| ID | Status |
|----|--------|
| R1 Flush wrong-file | Mitigated |
| R2 Ghost resurrection | Mitigated (tests + structural) |
| R3 Dup ts cross-list | Mitigated |
| R4 Rec vs uncheck | Mitigated |
| R5 Wake/poll vs switch | Mitigated |
| R6 List rename dup | Mitigated |
| R7 Rec completion log | Mitigated (session cooldown) |
| R8 UI builders | Deferred → B10/B11 |
| R9 Headless CI | Mitigated |

---

## Recommended sequence (next 4–6 loop units)

1. **A10** — Async race harness (unlocks confidence for everything Drive-async)  
2. **A11** — Cross-file move (highest remaining protocol risk)  
3. **A12** — Structural bypass contract (multi-device semantics)  
4. **A14 / A15** — List identity edges (empty rename, dup names)  
5. **A16** or **C** — Parser/product as user priority  
6. **B10** only if drag bugs or A11 needs cleaner hooks  

**Not recommended next:** random B extract, more normalize sprinkles, or re-doing R1/R5 pure matrices without a failing case.

---

## Last meaningful change

- **2026-07-16 — Re-audit:** Full pass of merge/flush/wake/cross-file/rec/UI/tests; **new action list A10–A18, B10–B12, O10–O11**. No code change.  
- **2026-07-16 — A R5 / R9 / R1:** Lifecycle + flush guards + headless CI.  
- **2026-07-16 — C/A:** Rec logs; list rename identity; Loop v2 process.

## How to verify

```text
npm test          # authoritative matrix
# after A10: extend npm test or node scripts with mocked Drive I/O
```

## Key files

| File | Role |
|------|------|
| `LOOP-STATUS.md` | Living risks + **this action list** |
| `LOOP-HISTORY.md` | Old micro-loop archive |
| `BULLETPROOF-LOOP-PLAN.md` | Design + original failure catalog |
| `scripts/run-selftests.mjs` | Headless gate |
| `index.html` / `self-tests.js` | App + matrix |
