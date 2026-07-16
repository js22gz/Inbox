# Bulletproof Loop — Status (living)

**Last updated:** 2026-07-16 · **Process:** Loop v2 (see `BULLETPROOF-LOOP-PLAN.md`)  
**Code size:** `index.html` ~5942 · `self-tests.js` ~1080

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
**Not a goal:** “N micro-loops in a row” or comment-only extractions.

## Loop unit (Definition of Done)

1. **Named target** — risk ID, bug, or extraction seam (one per unit).
2. **Test first** — new/tightened case in `self-tests.js`, or note why existing suite covers it.
3. **Harden root cause** — not only sprinkle normalize/assert.
4. **Verify** — `runInboxSelfTests()` / `?selftest` (browser authority). Node extract is best-effort only.
5. **Document** — update this short status (risks + last + next). Do not append novels to PLAN/history unless archiving a milestone.

Phases still apply: Audit → Test Augment → Harden → Verify → Document → Repeat.

## Risk backlog (ranked)

| ID | Risk | Track | Sev | Coverage | Next |
|----|------|-------|-----|----------|------|
| R1 | Flush/write to wrong file on rapid switch | A | High | Guards + opSeq; thin automated sim | Headless multi-switch / flush sim |
| R2 | Ghost resurrection after structural remove | A | High | Tests #1 + `structuralRemovePending` | Keep regression green |
| R3 | Dup ts after cross-list DnD + remote pull | A | High | localPlacement + tests #2 | Keep regression green |
| R4 | Rec reactivation vs manual uncheck / cross-device | A | Med | Enforcement + tests #6 | Keep green; watch multi-device |
| R5 | Lifecycle wake/poll vs mid-transition races | A | Med | `wakeDriveSync`, switching flag | More sims using helpers |
| R6 | List rename → duplicate list on merge | A | Med | Fixed (lts/oupd + item match + tests) | — |
| R7 | Rec complete log spam / missing memory | C | Low | Fixed (15s cooldown + log item + tests) | — |
| R8 | Large UI builders still mixed (tabs/item) | B | Low | renderItems split; drag/file transition improved | Extract only if next bug touches them |
| R9 | Soft Verify (CI Node extract brittle) | A | Med | Browser self-tests authority | Headless Chrome CI gate |

## Last meaningful change

- **2026-07-16 — Process:** Loop v2 docs — short living status, history archive, ranked risks, three tracks, DoD (this rewrite).
- **2026-07-16 — C/A:** Recurrent check creates Finished log item; 15s per-source cooldown (`4e7fa73`).
- **2026-07-16 — A:** List rename no longer spawns duplicate list on merge (`ba3a990`).
- **Earlier:** Failure-mode smash #1/#2/#5/#6; B-track `withFileTransition`, wake unification, renderItems builders (see `LOOP-HISTORY.md`).

## Next recommended (1–3)

1. **R9 / R1:** Headless full self-test CI gate; optional flush/switch sim harness.
2. **R5:** Expand lifecycle + rec/due sims using existing Drive helpers.
3. **B only if needed:** Further extract only when blocked on a real change.

## How to verify

```text
Browser: open index.html?selftest  →  runInboxSelfTests()
Console: runInboxSelfTests()
Debug:   ?debug=1  or  window._assertInboxInvariants()
```

Always run self-tests after sync/core/recurrence changes. Manual: multi-device Drive, offline reconnect, cross-file drag, rapid file switch.

## Key files

| File | Role |
|------|------|
| `LOOP-STATUS.md` | **Living** resume (this file) |
| `LOOP-HISTORY.md` | Archive of old loop chronicle |
| `BULLETPROOF-LOOP-PLAN.md` | Design + Loop v2 + failure catalog |
| `index.html` / `self-tests.js` | App + matrix |
| `.github/workflows/ci.yml` | Structure + best-effort Node smoke |
