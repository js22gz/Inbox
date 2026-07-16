# Bulletproof Loop — Status (living)

**Last updated:** 2026-07-16 · **Process:** Loop v2 (see `BULLETPROOF-LOOP-PLAN.md`)  
**Code size:** `index.html` ~6k · `self-tests.js` ~1.3k

## Resume

Say: **"Let's keep looping"** or **"Resume the Bulletproof Loop"**

1. Read **this file only** (do not load full history by default).
2. Skim **Loop v2** in `BULLETPROOF-LOOP-PLAN.md` if process is unclear.
3. `git status` + `git log --oneline -5`.
4. Work the **top open risk** or an explicit user feature (Track C).
5. One loop unit → update **this file** (risks + last change + next) → commit/push when asked.

Chronicle: `LOOP-HISTORY.md` (archive). Design detail / failure catalog: `BULLETPROOF-LOOP-PLAN.md`.

## Tracks (pick with a rule)

| Track | Use when |
|-------|----------|
| **A** Robustness | Bug, race, merge/parse/rec/due, data loss |
| **B** Structure | Next A/C blocked by entanglement, or hot function keeps causing bugs |
| **C** Product | User-facing behavior; still pure helpers + tests + “new failure mode?” |

Prefer **A/C** until high risks are green. Do **B** only when it lowers cost of the next A/C change.

## Loop unit (Definition of Done)

1. **Named target** — risk ID, bug, or extraction seam (one per unit).
2. **Test first** — new/tightened case in `self-tests.js`, or note why existing suite covers it.
3. **Harden root cause** — not only sprinkle normalize/assert.
4. **Verify** — `npm test` (headless Chromium) or `?selftest` / `runInboxSelfTests()`.
5. **Document** — update this short status (risks + last + next).

Phases: Audit → Test Augment → Harden → Verify → Document → Repeat.

## Risk backlog (ranked)

| ID | Risk | Track | Sev | Coverage | Next |
|----|------|-------|-----|----------|------|
| R1 | Flush/write to wrong file on rapid switch | A | High | **Mitigated** — pure flush guards + FlushGuard suite | Keep green |
| R2 | Ghost resurrection after structural remove | A | High | Tests + `structuralRemovePending` | Keep green |
| R3 | Dup ts after cross-list DnD + remote pull | A | High | localPlacement + tests | Keep green |
| R4 | Rec reactivation vs manual uncheck / cross-device | A | Med | Enforcement + tests #6 | Keep green |
| R5 | Lifecycle wake/poll vs mid-transition races | A | Med | **Mitigated** — pure wake/poll/continue guards; online no longer skips switching; post-meta file-mismatch abort; **LifecycleGuard** suite; loadAndApply adopt paths use shared abort | Keep green |
| R6 | List rename → duplicate list on merge | A | Med | Fixed + tests | — |
| R7 | Rec complete log spam / missing memory | C | Low | Fixed (15s cooldown + log) | — |
| R8 | Large UI builders still mixed | B | Low | renderItems / transitions improved | Extract only if needed |
| R9 | Soft Verify (CI Node extract brittle) | A | Med | **Mitigated** — `npm test` headless gate | — |

## Last meaningful change

- **2026-07-16 — A R5:** Lifecycle guards (`shouldAllowWakeDriveSync`, `shouldAllowPollTick`, `shouldContinuePollAfterAwait`). `wakeDriveSync` single entry gate (fixes online mid-switch). Poll post-await aborts on file mismatch / switching. loadAndApply merge-adopt uses shared abort. LifecycleGuard suite.  
- **2026-07-16 — A R9+R1:** Headless CI + flush concurrency guards.  
- **2026-07-16 — Process / C:** Loop v2 docs; recurrent logs; list rename identity.

## Next recommended (1–3)

1. **Product (C)** — user-driven features with Track C checklist.
2. **R2–R4** only if regression or multi-device bug appears.
3. **B** only when blocked on structure for a real change.

## How to verify

```text
npm ci && npx playwright install chromium   # once / CI
npm test                                      # headless full matrix (R9)

Browser: open index.html?selftest  →  runInboxSelfTests()
```

Always run self-tests after sync/core/recurrence/flush/lifecycle changes.

## Key files

| File | Role |
|------|------|
| `LOOP-STATUS.md` | **Living** resume (this file) |
| `LOOP-HISTORY.md` | Archive chronicle |
| `BULLETPROOF-LOOP-PLAN.md` | Design + Loop v2 + failure catalog |
| `scripts/run-selftests.mjs` | Headless full self-test runner (R9) |
| `package.json` | Dev-only Playwright for CI/tests (no app build) |
| `index.html` / `self-tests.js` | App + matrix (FlushGuard R1, LifecycleGuard R5) |
