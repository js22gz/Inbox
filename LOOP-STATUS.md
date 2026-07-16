# Bulletproof Loop — Status (living)

**Last updated:** 2026-07-16 · **Process:** Loop v2  
**Re-audit:** 2026-07-16 · **Latest unit:** A13 loadAndApply bypass save path  
**Code:** suites: … DriveRace (+A13), CrossFile, StructuralBypass, ListIdentity

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
| **A10** | **Async Drive race harness** | A | **Mitigated** — `driveFetch` mock seam + `__inboxDriveTest`; **DriveRace** suite (flush+switch, switching, stale opSeq, poll+switch, load+switch, happy path); poll double-check before load | Keep green; extend scenarios as needed |
| **A11** | **Cross-file item move** | A | **Mitigated** — robust restore (live/cache/detached); fail-closed args; post-merge item survival check; **bugfix** `findTargetListIndexByName` no longer falls back to index 0 (wrong list); **CrossFile** suite | Keep green |

### P1 — Correctness / multi-device

| ID | Action | Track | Why | Suggested loop unit |
|----|--------|-------|-----|---------------------|
| **A12** | **Structural bypass contract** | A | **Mitigated** — `STRUCTURAL_BYPASS_MS` + pure `isStructuralBypassActive`; shared mark/clear/get helpers; loadAndApply clears **after** save; flush does **not** clear (window stays); **StructuralBypass** suite | Keep green |
| **A13** | **loadAndApply structural-bypass save path** — after `await saveToDrive`, ensure no stale adopt; align with abort helper where content is regenerated | A | Bypass branches bind `targetFileId` (OK) but less uniform than merge branches | Small harden + test if gap confirmed in A10 harness |
| **A14** | **Empty / no-item list rename** | A | **Mitigated** — `ensureListTimestamp` on rename; empty+lts merge keeps one list (local name via oupd); no-lts empty documents 2-list limitation; **ListIdentity** suite | Keep green |
| **A15** | **Duplicate alive list names** | A | **Mitigated** — `isAliveListNameTakenInLists` / `canUseAliveListName` block create+rename dups (ghosts free); `findTargetListIndexByName` fail-closed on ambiguous alives; **ListIdentity** suite | Keep green |

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

## Recommended sequence (next loop units)

1. **A13** — loadAndApply structural-bypass save path uniformity (if gap vs merge branches)  
2. **A16** or **C** — Parser/product (rec+due) as user priority  
3. **A17 / A18** — Rec multi-device / home-list edges  
4. **B10** only if drag bugs return

**Not recommended next:** random B extract, more normalize sprinkles, or re-doing R1/R5 pure matrices without a failing case.

---

## Last meaningful change

- **2026-07-16 — A12:** Structural bypass contract (`STRUCTURAL_BYPASS_MS`, pure active check, mark/clear helpers, clear-after-save on load, no clear on flush).  
- **2026-07-16 — Product:** Clean body + private `// inbox.deletes v1` log for multi-device deletes.  
- **2026-07-16 — A11 / A10:** Cross-file move + Drive race harness.  

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
