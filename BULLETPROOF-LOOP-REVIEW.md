# Design Review: Bulletproofing the Inbox PWA – Iterative "/loop" Improvement Process

**Design doc:** /tmp/grok-design-doc-f4d28dad.md  
**Writer's summary:** /tmp/grok-design-summary-f4d28dad.md  
**Review file:** /tmp/grok-design-review-f4d28dad.md  
**Reviewer:** Senior staff engineer (systems + implementation focus)  
**Date:** 2026-07-10  
**Overall assessment:** The design is largely complete, technically sound, and aligned with the single-file + self-tests.js constraints. It correctly identifies the complex LWW+ghosts+offline+parse surface from the actual codebase. The Bulletproof Loop and 10-step PR Plan are pragmatic and ordered correctly (tests before hardening). Most claims about architecture (merge post-processing, flush opSeq/structural guards, __inboxPure, reconcile rules, parse compat, ghosts suffix assumptions) match reality after direct exploration of index.html (~5k+ LOC), self-tests.js, ci.yml, README, and sw.js.  

A few claims about current enforcement points are slightly imprecise, and some PR steps would benefit from tighter code references and explicit handling of generate emission / top-level list ghosts. No critical blockers; all are addressable with small updates before implementation. The scope is appropriately focused on "bullet proof the sync core" without overreach.

All findings below use initial **Status: open**.

---

## Structured Findings

- **Severity:** major
- **Section:** Proposed Design (Focus Area Deep Dives / 1. Sync/merge/reconcile logic) and Key Decisions
- **Description:** The document describes `mergeRemoteIntoLocal` as performing "final local-toggle bias, sanitize+ghostsToEnd." (and lists "ghostsToEndInPlace called in merge local-only/remote-empty, sanitize callers"). Actual implementation: empty-remote branch (line ~706) does `const res = sanitizeLists(...) || []; res.forEach(ghostsToEndInPlace); return res;`. Main path (remote present) builds result + ghost lists, does localPlacement dedup (which rebuilds per-list items as `[...kept, ...ghs]`), local-toggle bias, then `return sanitizeLists(deduped) || [];` (line ~846) *with no ghostsToEndInPlace on the final value or top-level lists*. `sanitizeLists` (2511) only does filter+map (preserves order); it never reorders. Many callers (flush ~1599, loadAndApply ~1395/1407, switch ~2726, cross-target ~2292, applyDriveListsToState ~665) receive the result and assign without additional ghostsToEnd. Reconcile builds suffix internally (finalItems = orderedAlive + ghosts) and merge construction appends ghost lists, but this is not "sanitize+ghostsToEnd".
- **Suggestion:** Correct the merge description and "called in" list to match code (dedup + construction provide suffix today; sanitize callers do not invoke ghostsToEndInPlace). This makes the gap that PR Plan step 5 must close explicit and accurate. Add a code snippet reference in the doc.
- **Status:** addressed
- **Response:** Updated "1. Sync/merge..." deep dive (and Background invariants note) with precise description: empty-remote does forEach ghostsToEnd, main path returns sanitize after dedup construction (no ghostsToEnd on final/top-level in remote-present); added code refs (~846, ~706) and explicit note that this gap is what step 5 closes. Also updated loop Harden phase. Accurate now.

- **Severity:** major
- **Section:** State invariants (section 5) and Top Failure Modes & Coverage Plan (#9)
- **Description:** "Current documented/enforced" lists ghostsToEndInPlace usage and "Missing/hard-to-enforce today" includes "Alive prefix + ghosts suffix strictly after every mutation". Reality: ghostsToEndInPlace is narrowly called; top-level list ghosts rely on append in merge + manual splice+push in deleteCurrentList (3481). No equivalent helper for lists array. `promoteByTimestamps` (3834) does `list.items = [...toPromote, ...remaining]` (remaining can contain ghosts in original relative positions; 3848) with no ghostsToEnd. `applyDriveListsToState`, loadData, many switch/preview paths do `state.lists = sanitizeLists(...) || []` + clamp (no ghostsToEnd). Parse (4967) and generate (4948) follow in-memory order (generate emits // deleted lines and ghost lists in encounter order, not forced suffix). Render/clamp (2574, 3395, 4674) defensively use `isDeleted` / `filterAlive*` + `findIndex(!isDeleted)`, which masks but does not prevent bad state (tab indices, drag, clampCurrentIndex rely on prefix-contiguous alives).
- **Suggestion:** Update "Current documented/enforced" and "Missing" bullets with precise call sites vs assumptions. Add "post-promoteByTimestamps / within-file DnD / list delete / direct parse assigns" to failure modes. PR Plan step 5's proposed `normalizeListsInPlace` (top-level ghost lists + per-item) is the right central fix.
- **Status:** addressed
- **Response:** Revised state invariants section 5 with exact call sites (empty-remote ~706, dedup per-list ghs, reconcile finalItems, promoteByTimestamps no re-end, many sanitize+assign+clamp paths, parse/gen follow encounter order, render defensive filters). Updated "Missing" and failure mode #9 to include post-promote/DnD/list-delete/direct-assign. Affirmed normalizeListsInPlace (item + top-level) is correct approach. Also updated failure mode #9 cover text.

- **Severity:** major
- **Section:** PR Plan (step 7) and Proposed Design (parser/generator)
- **Description:** Step 7: "In generate: ensure ghosts lists and item ghosts always emitted after alive content". Current `generateListFile` (4923) does direct `src.map(...)` and per-list `(list.items || []).forEach` emitting `-` or `// deleted` in array iteration order (no collect-alive-then-ghosts, no call to ghostsToEndInPlace). Ghost lists emitted where they sit in the top-level array. Emission order is a side-effect of in-memory suffix invariant, not enforced inside generate. If a non-suffix state reaches generate, the .list file will contain interspersed `// deleted` (parse will reproduce the interleaving). Parser is defensive on input but does not normalize.
- **Suggestion:** Revise step 7 (and design text) to: (preferred) ensure in-memory suffix via normalize before generate (or at end of merge/sanitize/apply/save paths), or (alt) enhance generate to separate alives vs ghosts for emission only. Reference exact forEach sites in generate. Make "minor parser tweaks" more concrete (e.g. "only if augmentation finds new roundtrip failures").
- **Status:** addressed
- **Response:** Revised parser/generator deep dive #2 to describe generate as direct map/forEach (no internal normalize, order=encounter). Revised PR step 7 to preferred "ensure in-memory suffix via normalize before generate (or at merge/sanitize/apply/save ends)" vs alt enhance generate; referenced forEach sites and ~4923; made parser tweaks conditional on new failures. Updated loop step 3 + additional invariants + roundtrip note. Also updated Background if needed for consistency.

- **Severity:** major
- **Section:** PR Plan (step 3) and Top Failure Modes
- **Description:** Step 3: "Expand abbreviated '12 scenarios' into explicit named cases (case1_remoteDelWins, ...). ... copy/expand from historical DESIGN comments." Current self-tests.js has only case1 (remote del) + case2 (later act resurrects) + "Quick additional PR-5 style checks" and comment: "The 12 scenarios (abbreviated for file size...)" + "See the version inside index.html comments for the full historical table." Index.html comments reference "DESIGN table + pseudocode" (reconcileItem ~924) and "MUTATION SITES AUDIT" but do not contain the full enumerated 12-case matrix. Self-tests cases match the LWW rules in reconcile/merge (maxDel > maxAct, local toggle bias, etc.).
- **Suggestion:** Either (a) derive the remaining 10 explicit cases from current reconcileItem/mergeRemoteIntoLocal logic during the audit step (step 1), or (b) update plan text to "expand the abbreviated cases + add missing coverage using the LWW rules + post-processing in merge (dedup/localPlacement/local-toggle)". Keep the "tests first" ordering. Add `assertGhostsSuffix`, `assertNoDuplicateTs`, `assertAlivePrefixGhosts` + runner as planned (excellent).
- **Status:** addressed
- **Response:** Updated PR step 3 (and New Test Cases section + loop step 2) to: derive remaining cases from current reconcile/merge logic (LWW + dedup/localPlacement/local-toggle) during audit step 1; note that index.html comments reference DESIGN table but do not contain full enumerated matrix. Kept "tests first". Also added the assert* helpers + runner as originally planned.

- **Severity:** minor
- **Section:** Runtime Assertions / Debug Aids and Feasibility of adding runtime asserts
- **Description:** Plan to add cheap `assertGhostsAtEnd`, `assertNoDupTsAcrossLists`, `assertValidSanitized` under `if (DEBUG)` after merge returns, sanitize, applyDrive*, cross targetLists, flush success, sync* if changed, post-parse is sound and does not bloat prod (DEBUG=false, current pattern already has 20+ if(DEBUG) logs + smoke try/catch). Current index.html already sets `if (DEBUG) window._inboxState = state;` (5240). However: (1) "after ... render prep" risks noise on hot path (renderItems called often); (2) no spec on warn vs throw (throw during render or mid-async bad); (3) many direct `state.lists = sanitize...` sites would need coverage for full "every stable point"; (4) adding normalize + asserts + calls will increase the 100k+ char single file (acceptable per non-goals but worth sizing).
- **Suggestion:** Define helpers as `function assertX(x) { if (!DEBUG) return; ... console.warn or error ... }`. Call asserts primarily at post-merge/sanitize/apply/flush/parse/saveAndRender ends + after structural+save. For render, expose via `window._inboxDebug.assertInvariants()` only. Update plan to list exact insertion points after step 1 audit. Add a one-line size check in verification.
- **Status:** addressed
- **Response:** Revised Runtime Assertions section: helpers now `if (!DEBUG) return; ... console.warn` (no throw on hot paths); calls at stable points (merge/sanitize/apply/flush/saveAndRender ends + structural+save + post-parse); render only via window._inboxDebug.assertInvariants(); added note to list exact points post-audit (step 1); added one-line size sanity check in step 10 verification. Also updated Goals to remove "render prep" and add single-file size sentence. Matches current DEBUG pattern.

- **Severity:** minor
- **Section:** The Bulletproof /loop process (and PR Plan ordering)
- **Description:** The 6-phase Audit→Test Augment→Harden→Verify→Document→Repeat is realistic and actionable within single-file + self-tests.js. Steps are small, independently reviewable, and correctly order "tests first" (step 3 before 4/5 hardening). Manual verification matrix (two tabs + Drive, offline, drag cross-file, recurrence) matches real failure modes and how the app works (no server). However, "Harden" + "Verify" phases assume repeatable manual Drive scenarios; full state (opSeq, structuralRemovePending, driveFileSwitching, recurrenceJustCompleted Set) is hard to exercise purely in self-tests.js (which is mostly pure via __inboxPure). Step 6/8/10 rely on console sim + live. No lightweight harness beyond test.html + ?selftest.
- **Suggestion:** In loop description, call out that integration/race paths (flush guards, structural bypass, cross-file async target) are primarily manual + DEBUG trace + ?selftest. Consider a small "sim" harness in self-tests (or new test-only section) that exercises merge + flush-like wrappers via state mocking. Keep PRs tiny as planned.
- **Status:** addressed
- **Response:** Added explicit note after loop phases: integration/race paths (flush, structural, cross-file async, opSeq/id) are primarily manual + DEBUG + ?selftest. Suggested (and referenced in New Test Cases + step 6) adding small "sim" harness in self-tests.js for mocked flush-like/seq abort cases. Kept all PRs tiny. Also updated step 2/6 accordingly.

- **Severity:** minor
- **Section:** Top Failure Modes & Coverage Plan and PR Plan (step 6, flush / reconnect)
- **Description:** Failure mode #8 (flush race to wrong file) and guards are correctly identified (intendedFileId snapshot, opSeq, driveOpSeq vs state.driveOpSeq, driveFileSwitching, structuralRemovePending bypass window <60s, final `getActiveDriveFileId() === intendedFileId` check). Code refs accurate (flush ~1558, loadAndApply ~1364 with early opSeq bind + post-await checks ~1379/1396/1408, cross ~2247). Self-test coverage note "(in self-test sim) capture intendedFileId + opSeq abort paths" is ok via side-effect or pure sig checks, but flush itself is not pure. Structural bypass protects source but target still does pull+merge (2292).
- **Suggestion:** Add one dedicated invariant test helper that can be called with mocked state snippets for seq/id mismatch paths (even if just asserting "would have aborted"). Update step 6 to also tighten/audit the cross-file async restore path (2309).
- **Status:** addressed
- **Response:** Added dedicated "mocked seq/id abort sim helper" to New Test Cases and step 6 verification. Updated step 6 text to "Also audit/tighten the cross-file async target restore path (source re-add on failure, ~2309)". Self-tests coverage now includes the helper for pure sim of abort paths.

- **Severity:** minor
- **Section:** Key Decisions (#4, #5) and Architecture Overview
- **Description:** Decisions on "Read-merge-write in flush + opSeq + fileId snapshot + structural bypass" and "Recurrence/due live in item text + derived fields" + "justCompleted is intentionally session-local" are well-reasoned and match code (flush 1573 snapshot + 1599 merge + 1620 final guard; syncRecurrence 4117 mutates + clears Set at 4139; due bias in reconcileItem 1005 and sanitize 2525 applyDueFromText only for !deleted). Cross-file target uses full merge for LWW/dedup (correct). Mermaid data flow is accurate at high level.
- **Suggestion:** Minor: add note that recurrenceJustCompleted is *not* exposed on __inboxPure (current code keeps it module-local to the IIFE); tests simulate via fallback var. Good.
- **Status:** addressed
- **Response:** Added explicit note in Key Decision #5 (and cross-ref in state invariants section 5): recurrenceJustCompleted is module-local to the IIFE, *not* on __inboxPure; self-tests use fallback var simulation. Good call.

- **Severity:** minor
- **Section:** Risks & Mitigations and Completeness
- **Description:** Risks cover perf (DEBUG gate), overly-strict (stable points), CI brittle (continue-on-error + regex), cross-device jitter, single-file PR size. All valid. One under-called risk: after adding normalize + multiple ghostsToEnd calls, generate will now reliably emit suffix, but existing .list files on Drive with historical interleaved ghosts (from pre-soft-del or bugs) will roundtrip to suffix on first merge (desired, but may surprise order on first cross-device after deploy). Also, ts uniqueness (Date.now collisions theoretically possible on fast adds + merge) is listed as "missing" but dedup in merge (seenTs + localPlacement) + ts() already mitigate; no global assert proposed beyond "no dup ts".
- **Suggestion:** Add a short "data migration on first sync" note under risks or invariants. Consider cheap `assertNoDupTs` always (or in sanitize) since N is tiny.
- **Status:** addressed
- **Response:** Added two new risk entries under Risks & Mitigations: (1) "data migration on first sync" note for historical interleaved ghosts becoming suffixed on merge (with mitigation: release notes + roundtrip tests); (2) ts uniqueness + cheap assertNoDupTs (or in sanitize, N tiny) recommendation. Also referenced in invariants "additional" and runtime section.

- **Severity:** nit
- **Section:** Evolving CI and Manual Verification + PR Plan step 9
- **Description:** CI Node smoke uses brittle `<script>` regex + vm cut before "initTokenClient" + `continue-on-error`. Plan to "invoke more pure + run invariant checks" is good but extraction will become more fragile as more pure fns (or context) are touched. README already says "When modifying the sync core... run `runInboxSelfTests()`". No AGENTS.md or other design docs present.
- **Suggestion:** In CI improvement, keep continue-on-error and add a non-extraction step (grep for new assert fns + normalize + explicit case names in self-tests.js). Document in README "browser self-tests are authoritative; Node smoke is best-effort".
- **Status:** addressed
- **Response:** Updated PR step 9 + Evolving CI section: keep continue-on-error; added explicit "Add a *non-extraction* verification step (e.g., grep for new assert* fns + normalizeListsInPlace + explicit case names in self-tests.js)"; documented "browser self-tests are authoritative; Node smoke is best-effort" in CI/README. Matches suggestion.

- **Severity:** nit
- **Section:** Proposed Design (New Test Cases & Invariants) and testability
- **Description:** Plan to add `runInvariantsSelfTest()`, full matrix, offline-sim, cross-file structural, recurrence+merge, due+sync+merge, roundtrip stress, `assertStateInvariants` after ops is excellent and directly targets actual failure modes (dup ts post-DnD, ghost suffix post-assign, parse meta text, only-ghosts, deleted-list pipes, etc.). Current __inboxPure (4338) already exposes the right surface (reconciles, parse/gen, ghostsToEnd, compute*, rec/due). Step 2 correctly plans to expose more (applyPromotions, getDriveListsSignature) for deeper tests.
- **Suggestion:** When adding, also expose (or provide test shims for) `getRecurrentEnforcement` / `applyPromotions` / `promoteByTimestamps` if new recurrence+merge cases need them (self-tests currently use fallbacks). Keep tests declarative.
- **Status:** addressed
- **Response:** Updated "New Test Cases & Invariants" section (and step 2 exposure plan): "Expose more if needed (e.g., getRecurrentEnforcement, applyPromotions, promoteByTimestamps) via __inboxPure or test shims... Keep tests declarative." Aligns with existing step 2 plan for applyPromotions etc.

- **Severity:** nit
- **Section:** Goals & Non-Goals and Scope
- **Description:** Explicit boundaries ("changes limited to index.html, self-tests.js, README.md (and minimal CI)") and non-goals (no modules, no breaking .list format, no full fuzz, no new deps) are clear and respected by the PR Plan. Scope is neither over (stays on sync core: merge/flush/ghosts/parser/rec+due/invariants) nor under.
- **Suggestion:** Add one sentence: "Any normalize/assert additions stay tiny and DEBUG-gated or cheap always-on (N small) to respect single-file delivery."
- **Status:** addressed
- **Response:** Added the exact sentence to Goals (integrated with the runtime assertions bullet) + reinforced in revised Runtime Assertions section and single-file non-goals respect. Also referenced in PR plan intro implicitly via tiny steps.

- **Severity:** nit
- **Section:** Revision Summary and overall process
- **Description:** Pre-populated initial entry is good. Future "open → addressed" pattern will work. The design was produced after thorough exploration (grep/read of exact functions/lines referenced).
- **Suggestion:** After implementing each PR, append a short "YYYY-MM-DD — PR-N merged — summary of what the Bulletproof Loop iteration covered + any new failure modes found" entry.
- **Status:** addressed
- **Response:** Added instruction in design doc: (a) in PR Plan intro, (b) in step 5 Document phase, (c) in step 10, (d) in design Revision Summary itself, and (e) this review file will also receive such entries. Pre-populated one review-address entry. Future PRs will append "YYYY-MM-DD — PR-N merged — ...". Also updated the parenthetical note at end of review summary section.

---

## Summary Recommendations (before starting PRs)

1. Apply the minor corrections to claims about current ghostsToEnd/sanitize/merge/generate behavior (findings 1-3) — this makes the "before" state accurate for the audit step.
2. Flesh out PR Plan step 3 with explicit derivation of the matrix cases and add post-promote / direct-assign to covered modes.
3. In step 4/5 implementation, centralize via a small `normalizeListsInPlace` (or enhance sanitize + a list-normalize) + DEBUG asserts; call from a handful of stable points rather than every splice.
4. Treat browser `runInboxSelfTests()` + manual two-device/offline/Drive + DEBUG traces as the verification authority (CI remains smoke + structure).
5. The design + PR Plan is ready for implementation once the above are addressed. Each step remains independently doable and testable with `runInboxSelfTests()`.

**Files referenced in this review (absolute paths from workspace exploration):**
- `/home/jonatanskaryd/01_PROJECTS/inbox/index.html` (core: pure helpers 566, merge 703 (esp 846 return), reconcile 850-1011, sanitize 2511, flush 1558, parse/gen 4923/4967, __inboxPure 4338, smoke 5217, deleteItem 4820, deleteCurrentList 3469, promote 3834, apply 663, state assigns, DEBUG 492, mutation audit 2551)
- `/home/jonatanskaryd/01_PROJECTS/inbox/self-tests.js` (abbreviated matrix ~260, runAllSelfTests 296, roundtrips/ghosts ~120-290)
- `/home/jonatanskaryd/01_PROJECTS/inbox/.github/workflows/ci.yml` (structure + brittle Node smoke + continue-on-error)
- `/home/jonatanskaryd/01_PROJECTS/inbox/README.md` (Testing section)
- `/home/jonatanskaryd/01_PROJECTS/inbox/test.html`, `sw.js` (CACHE)

**End of Review Notes**

---

## Revision Summary (appended per process)

- 2026-07-10 — All Status: open → addressed (13 findings) — Read review in full. Performed targeted search_replace edits on /tmp/grok-design-doc-f4d28dad.md to correct merge description (precise call sites ~706/846 no final ghostsToEnd on main path), state invariants (narrow calls, promoteByTimestamps interleaving, direct assigns, render masking), parser/generator (generate direct forEach no enforcement), PR steps 3/7 (derive cases in audit; preferred in-memory normalize before generate vs enhance), runtime asserts (if(!DEBUG) return; warn-only; stable points + debug exposure only for render; size check), loop (manual/sim harness note), step 6 (mock helper + cross restore audit), Key Decision #5 (justCompleted not on __inboxPure), Risks (data migration + dup ts), CI step 9 (non-extract grep + authority doc), New Tests (shims for promoteBy*), Goals (single-file size sentence), Revision notes (future PR-N entries). All nits/minors/majors addressed with accurate references. No pushback needed (feedback improved precision); no needs-user-input (all technical and resolvable from code). Design remains strong for single-file + loop. Pre-populated design Revision Summary too.

- (Post-PR template for future): YYYY-MM-DD — PR-N merged — Bulletproof Loop iteration covered X (e.g. invariants + step 3 tests); new modes found: Y; verified via runInboxSelfTests() + manual.

All issues closed. Ready for PR 1 (audit).