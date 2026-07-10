/**
 * Inbox Self-Tests (separate file for cleanliness)
 *
 * These live outside index.html so the main app script stays as small and focused as possible.
 *
 * How to use:
 *   - In the running app (after index.html loaded): runInboxSelfTests() in console
 *   - Or visit the app with ?selftest in the URL
 *   - For full auto in dev: set DEBUG=true in index.html (it will try to load this)
 *
 * The tests use the pure functions exposed by index.html under window.__inboxPure.
 * This avoids code duplication for the core logic.
 */

(function () {
  const Pure = (typeof window !== 'undefined' && window.__inboxPure) || {};

  // Aliases for the functions we need from the main app (or fallbacks for standalone smoke)
  const ts = Pure.ts || (v => { const n = Number(v); return (Number.isFinite(n) && n > 0) ? n : 0; });
  const sanitizeLists = Pure.sanitizeLists || (x => x);
  const mergeRemoteIntoLocal = Pure.mergeRemoteIntoLocal || ((l, r) => r || l);
  const parseListFile = Pure.parseListFile || (t => null);
  const generateListFile = Pure.generateListFile || (l => '');
  const filterAliveItems = Pure.filterAliveItems || (items => (items || []).filter(it => it && !it.deletedAt));
  const filterAliveLists = Pure.filterAliveLists || (lists => (lists || []).filter(l => l && !l.deletedAt));
  const isDeleted = Pure.isDeleted || (it => !!(it && it.deletedAt));

  // Invariant helpers for Bulletproof Loop (step 3+)
  function assertGhostsSuffix(lists, msg = '') {
    (lists || []).forEach(l => {
      if (!l || l.deletedAt) return;
      const itms = l.items || [];
      let seenGhost = false;
      itms.forEach(it => {
        if (it && it.deletedAt) seenGhost = true;
        else if (seenGhost) throw new Error('ghosts not at suffix: ' + (msg || ''));
      });
    });
  }
  function assertNoDuplicateTs(lists, msg = '') {
    const seen = new Set();
    (lists || []).forEach(l => {
      (l && l.items || []).forEach(it => {
        if (it && ts(it.timestamp)) {
          if (seen.has(it.timestamp)) throw new Error('dup ts ' + it.timestamp + ' ' + (msg || ''));
          seen.add(it.timestamp);
        }
      });
    });
  }
  function assertAlivePrefixGhosts(lists, msg = '') {
    let seenGhostList = false;
    (lists || []).forEach(l => {
      if (l && l.deletedAt) seenGhostList = true;
      else if (seenGhostList) throw new Error('alive lists not prefix before ghosts: ' + (msg || ''));
    });
  }
  function assertRoundtrip(obj) {
    const gen = generateListFile([obj]);
    const p = parseListFile(gen);
    if (!p || p.length < 1) throw new Error('roundtrip parse fail');
    const back = sanitizeLists(p) || [];
    if (!back[0] || back[0].name !== obj.name) throw new Error('roundtrip name fail');
  }

  function runInvariantsSelfTest() {
    // Basic suffix / dedup / prefix
    const gList = [{ name: 'G', items: [{text:'a', timestamp:1, checked:false}, {text:'', timestamp:2, checked:false, deletedAt:99}] }];
    const gSan = sanitizeLists(gList) || [];
    assertGhostsSuffix(gSan, 'per list');
    assertNoDuplicateTs(gSan, 'no dups');
    const mixedLists = [{name:'Alive', items:[]}, {name:'GhostL', deletedAt:123, items:[]}];
    const ml = sanitizeLists(mixedLists) || [];
    assertAlivePrefixGhosts(ml, 'list level');

    // Roundtrips
    assertRoundtrip({ name: 'RT', items: [{text:'x', timestamp:10, checked:false}] });
    assertRoundtrip({ name: 'RTG', items: [{text:'', timestamp:20, checked:false, deletedAt:30}] });

    if (typeof console !== 'undefined' && console.log) console.log('%c[Inbox] Invariants self-test passed.', 'color:#34c759');
  }

  // Recurrence / due functions (exposed by main app)
  const parseRecurrence = Pure.parseRecurrence || (() => null);
  const evaluateRecurrence = Pure.evaluateRecurrence || (() => ({}));
  const parseDueDate = Pure.parseDueDate || (() => null);
  const formatDueDisplay = Pure.formatDueDisplay || (d => String(d));
  const recStartOfDay = Pure.recStartOfDay || (d => d && d.setHours ? new Date(d).setHours(0,0,0,0) : 0);
  const recAddIntervalMs = Pure.recAddIntervalMs || ((ms, n, u) => ms);

  // Some tests reference recurrenceJustCompleted (session Set)
  let recurrenceJustCompleted = null;

  // ==================== THE TESTS (moved from index.html) ====================

  function runDueSelfTest() {
    const anchor = new Date(2026, 2, 17, 10, 30).getTime();
    const cases = [
      ['tomorrow', recStartOfDay(new Date(2026, 2, 18))],
      ['2w', recAddIntervalMs(anchor, 2, 'week')],
      ['17 march', recStartOfDay(new Date(2026, 2, 17))],
      ['17 march 17:00', recStartOfDay(new Date(2026, 2, 17)) + 17 * 60 * 60 * 1000],
      ['in 3 days', recAddIntervalMs(anchor, 3, 'day')],
      ['2026-06-28', recStartOfDay(new Date(2026, 5, 28))],
      ['2026/06/28', recStartOfDay(new Date(2026, 5, 28))],
      ['28-06-2026', recStartOfDay(new Date(2026, 5, 28))],
      ['28.06.2026 17:00', recStartOfDay(new Date(2026, 5, 28)) + 17 * 60 * 60 * 1000],
      ['2026-06-28t17:00', recStartOfDay(new Date(2026, 5, 28)) + 17 * 60 * 60 * 1000],
    ];
    cases.forEach(([input, expect]) => {
      const got = parseDueDate(input, anchor);
      if (!got || got.dueAt !== expect) throw new Error(`parseDueDate("${input}") expected ${expect}, got ${got ? got.dueAt : null}`);
    });
    if (parseDueDate('not a date', anchor)) throw new Error('parseDueDate should reject unknown input');
    const overdueText = formatDueDisplay(recStartOfDay(new Date(2026, 2, 16)), new Date(2026, 2, 17));
    if (overdueText !== 'overdue · 1 day') throw new Error(`formatDueDisplay overdue expected "overdue · 1 day", got "${overdueText}"`);
    if (typeof console !== 'undefined' && console.log) console.log('%c[Inbox] Due self-test passed.', 'color:#34c759');
  }

  function runRecurrenceSelfTest() {
    const parseCases = [
      ['once in november and june', 'onceInMonths'],
      ['1 week in may to september', 'interval'],
      ['4 may', 'annualDate'],
      ['last sunday each month', 'weekdayOfMonth'],
      ['every month', 'dayOfMonth'],
      ['every 3 months', 'everyNMonths'],
      ['every 2 weeks | home: Garden', 'interval'],
      ['08:00 and 20:00', 'dailyTimes'],
      ['8:00', 'dailyTimes'],
      ['not a rule', null],
    ];
    parseCases.forEach(([input, expect]) => {
      const rule = parseRecurrence(input);
      const got = rule ? rule.type : null;
      if (got !== expect) throw new Error(`parseRecurrence("${input}") expected ${expect}, got ${got}`);
    });
    const dormantItem = { text: 'X [recurrent: 4 may]', timestamp: Date.now(), checked: false };
    const apr1 = new Date(2026, 3, 1);
    const status = evaluateRecurrence(parseRecurrence('4 may'), dormantItem, apr1);
    if (!status.dormant) throw new Error('annual 4 may should be dormant before activation');
    const may10 = new Date(2026, 4, 10);
    const completed = { text: 'X [recurrent: 4 may]', timestamp: Date.now(), checked: true, checkedAt: may10.getTime() };
    const afterComplete = evaluateRecurrence(parseRecurrence('4 may'), completed, may10);
    if (!afterComplete.dormant) throw new Error('annual 4 may should be dormant after completion');
    const timesRule = parseRecurrence('08:00 and 20:00');
    const beforeMorning = evaluateRecurrence(timesRule, { timestamp: Date.now(), checked: false }, new Date(2026, 5, 25, 7, 30));
    if (!beforeMorning.dormant) throw new Error('08:00 and 20:00 should be dormant before first slot');
    const afterMorning = evaluateRecurrence(timesRule, { timestamp: Date.now(), checked: false }, new Date(2026, 5, 25, 8, 5));
    if (afterMorning.dormant) throw new Error('08:00 and 20:00 should be active after 08:00');
    const doneMorning = { timestamp: Date.now(), checked: true, checkedAt: new Date(2026, 5, 25, 8, 10).getTime() };
    const beforeEvening = evaluateRecurrence(timesRule, doneMorning, new Date(2026, 5, 25, 12, 0));
    if (!beforeEvening.dormant) throw new Error('08:00 and 20:00 should be dormant before 20:00 after morning completion');
    const onceMayRule = parseRecurrence('once in may');
    const overdueJune = evaluateRecurrence(onceMayRule, { timestamp: Date.now(), checked: false }, new Date(2026, 5, 15));
    if (overdueJune.dormant) throw new Error('once in may should be overdue in June before completion');
    if (!overdueJune.dueAt) throw new Error('once in may overdue should include dueAt');
    const annualOverdue = evaluateRecurrence(parseRecurrence('4 may'), { timestamp: Date.now(), checked: false }, new Date(2026, 4, 10));
    if (!annualOverdue.overdue || !annualOverdue.dueAt) throw new Error('annual 4 may should be overdue with dueAt on May 10');
    const doneLateJune = { timestamp: Date.now(), checked: true, checkedAt: new Date(2026, 5, 25).getTime() };
    const afterLateComplete = evaluateRecurrence(onceMayRule, doneLateJune, new Date(2026, 5, 25));
    if (!afterLateComplete.dormant) throw new Error('once in may should be dormant after late June completion');
    const stillDormantJuly = evaluateRecurrence(onceMayRule, doneLateJune, new Date(2026, 6, 1));
    if (!stillDormantJuly.dormant) throw new Error('once in may should stay dormant in July after June completion');
    if (typeof console !== 'undefined' && console.log) console.log('%c[Inbox] Recurrence self-test passed.', 'color:#34c759');
  }

  function runSyncMergeSelfTest() {
    // PR-1/2: parse/generate roundtrips (old + new fields + ghosts + post-clean), basic merge + soft del cases.
    // PR-3: full table scenarios, lts/order, rewrite (see below + DESIGN).
    // Old format (no markers) -> alive, no deletedAt.

    /*
     * === OBSERVABILITY + TESTING MATRIX (PR-5) ===
     * Per DESIGN "Observability + Testing Matrix".
     * Run via runInboxSelfTests() or ?selftest.
     * (See the version inside index.html comments for the full historical table.)
     */

    const oldText = '# Work\n- [ ] foo |ts:1000000000000\n- [x] bar |ts:1000000001000|tg:1000000002000';
    let parsed = parseListFile(oldText);
    if (!parsed || parsed.length !== 1 || parsed[0].name !== 'Work') throw new Error('parse old header failed');
    if (parsed[0].items.length !== 2 || parsed[0].items[0].timestamp !== 1000000000000 || parsed[0].items[0].deletedAt || parsed[0].items[0].updatedAt) throw new Error('old parse should yield alive no new fields');
    let gen = generateListFile(parsed);
    if (!gen.includes('// inbox.list v2') || !gen.includes('|ts:1000000000000')) throw new Error('generate should include v2 + ts');
    let reparsed = parseListFile(gen);
    if (reparsed[0].items[0].timestamp !== 1000000000000 || reparsed[0].items[0].text !== 'foo') throw new Error('old roundtrip failed');

    // New fields roundtrip via |upd after ts (compat alive format)
    const withUpd = [{ name: 'L', items: [{ text: 'has upd', timestamp: 2000000000000, checked: false, updatedAt: 2000000000100 }] }];
    gen = generateListFile(withUpd);
    if (!/\|ts:2000000000000\|upd:2000000000100/.test(gen)) throw new Error('generate upd suffix failed');
    parsed = parseListFile(gen);
    if (!parsed[0].items[0].updatedAt || parsed[0].items[0].updatedAt !== 2000000000100) throw new Error('parse upd roundtrip failed');
    if (parsed[0].items[0].deletedAt) throw new Error('no del on alive');

    // Ghost via // deleted
    const withGhost = [{ name: 'G', items: [
      { text: 'alive', timestamp: 3000000000000, checked: false },
      { text: '', timestamp: 3000000001000, checked: false, deletedAt: 3000000002000 }
    ] }];
    gen = generateListFile(withGhost);
    if (!/\/\/ deleted ts:3000000001000 del:3000000002000/.test(gen)) throw new Error('ghost // emit failed');
    if (gen.includes('|ts:3000000001000')) throw new Error('ghost should not be - line');
    parsed = parseListFile(gen);
    if (parsed[0].items.length !== 2 || !parsed[0].items[1].deletedAt || parsed[0].items[1].deletedAt !== 3000000002000 || parsed[0].items[1].text !== '') throw new Error('ghost parse failed');

    // Post-clean of stray |meta
    parsed = parseListFile('# L\n- [ ] stray |upd:123 |ts:4000000000000');
    if (!parsed || !parsed[0] || !parsed[0].items[0] || parsed[0].items[0].text !== 'stray') throw new Error('post-clean failed to strip stray meta');
    if (parsed[0].items[0].updatedAt) throw new Error('stray |upd before ts should be cleaned not parsed as field');

    // List meta roundtrip
    const withListMeta = [{ name: 'M', timestamp: 5000000000000, orderUpdatedAt: 5000000000100, items: [] }];
    gen = generateListFile(withListMeta);
    if (!/\/\/ listmeta lts:5000000000000 lupd:5000000000100/.test(gen)) throw new Error('listmeta emit failed');
    parsed = parseListFile(gen);
    if (!parsed[0].timestamp || parsed[0].timestamp !== 5000000000000 || parsed[0].orderUpdatedAt !== 5000000000100) throw new Error('listmeta roundtrip failed');

    // Basic merge + toggle + ghosts
    const local = [{ name: 'L', items: [{ text: 't', timestamp: 6000000000000, checked: false, updatedAt: 6000000000500 }] }];
    const remote = [{ name: 'L', items: [{ text: 't', timestamp: 6000000000000, checked: false, updatedAt: 6000000000400 }] }];
    let merged = mergeRemoteIntoLocal(local, remote);
    if (!merged[0] || !merged[0].items[0] || merged[0].items[0].updatedAt == null) throw new Error('merge did not preserve updatedAt field');

    const localToggle = [{ name: 'L', items: [{ text: 't', timestamp: 6000000000000, checked: true, toggledAt: 6000000000600, updatedAt: 6000000000500 }] }];
    const remoteToggle = [{ name: 'L', items: [{ text: 't', timestamp: 6000000000000, checked: false, toggledAt: 6000000000300, updatedAt: 6000000000400 }] }];
    merged = mergeRemoteIntoLocal(localToggle, remoteToggle);
    if (!merged[0] || !merged[0].items[0] || !merged[0].items[0].checked || merged[0].items[0].toggledAt !== 6000000000600) throw new Error('merge toggle win');

    const rGhost = [{ name: 'L', items: [{ text: '', timestamp: 7000000000000, checked: false, deletedAt: 7000000000100 }] }];
    merged = mergeRemoteIntoLocal([], rGhost);
    if (!merged[0] || !merged[0].items[0] || !merged[0].items[0].deletedAt) throw new Error('remote ghost should be kept');

    const s = sanitizeLists([{ name: 'S', items: [{ text: '', timestamp: 800, checked: false, deletedAt: 900 }] }]);
    if (!s[0].items[0].deletedAt) throw new Error('sanitize must keep ghost');

    if (sanitizeLists([{name:'O', items:[{text:'x', timestamp:1, checked:false}]}])[0].items[0].deletedAt) throw new Error('absent deletedAt must stay absent');

    // Deleted-list, pipes, literal meta, etc.
    const delList = [{ name: 'Del|WithPipe', timestamp: 9000000000000, deletedAt: 9000000001000, items: [] }];
    gen = generateListFile(delList);
    if (!gen.includes('// inbox.list v2')) throw new Error('v2 header missing in gen');
    if (!/\/\/ deleted-list name:/.test(gen) || !gen.includes(encodeURIComponent('Del|WithPipe'))) throw new Error('deleted-list emit failed');
    parsed = parseListFile(gen);
    if (!parsed[0] || parsed[0].name !== 'Del|WithPipe' || !parsed[0].deletedAt) throw new Error('deleted-list roundtrip+name| failed');

    const delNoTs = [{ name: 'NoTsDel', deletedAt: 9200000000000, items: [] }];
    gen = generateListFile(delNoTs);
    if (/\|lts:/.test(gen)) throw new Error('deleted-list without ts should not emit |lts:');
    parsed = parseListFile(gen);
    if (!parsed[0] || parsed[0].name !== 'NoTsDel' || !parsed[0].deletedAt || parsed[0].timestamp) throw new Error('deleted-list w/o ts roundtrip failed');

    parsed = parseListFile('# L\n- [ ] note about |upd:123 and |due:456 syntax |ts:9100000000000');
    if (parsed[0].items[0].text !== 'note about |upd:123 and |due:456 syntax') throw new Error('literal |meta text mangled');

    parsed = parseListFile('# L\n- [ ] ends with due note |due:999 |ts:9150000000000');
    if (!parsed[0].items[0].text.includes('|due:999')) throw new Error('end-of-text |due:NN should not be mangled');

    const onlyGhosts = [{ name: 'OnlyG', items: [{text:'', timestamp:920, checked:false, deletedAt:930}] }];
    gen = generateListFile(onlyGhosts); parsed = parseListFile(gen);
    if (parsed[0].items.length !== 1 || !parsed[0].items[0].deletedAt) throw new Error('only-ghosts list failed');

    parsed = parseListFile('# L\n- [ ] old @9300000000000|upd:931');
    if (!parsed[0].items[0] || parsed[0].items[0].timestamp !== 9300000000000 || parsed[0].items[0].updatedAt !== 931) throw new Error('legacy @ + upd failed');

    const fresh = { name: 'Fresh', items: [{ text: 'new', timestamp: Date.now(), checked: false }] };
    const sanFresh = sanitizeLists([fresh])[0];
    if (sanFresh.timestamp || sanFresh.items[0].updatedAt || sanFresh.items[0].deletedAt) throw new Error('fresh objects must have absent versioning fields');

    const emptyMeta = [{ name: 'EmptyM', timestamp: 9400000000000, orderUpdatedAt: 9400000000100, items: [] }];
    gen = generateListFile(emptyMeta); if (!/\/\/ listmeta/.test(gen)) throw new Error('empty listmeta emit');
    if (parseListFile(gen)[0].timestamp !== 9400000000000) throw new Error('empty listmeta parse');

    parsed = parseListFile('# L\n// deleted ts:foo del:bar\n- [ ] ok |ts:9500000000000');
    if (parsed[0].items.length !== 1 || parsed[0].items[0].text !== 'ok') throw new Error('malformed tombstone not ignored');

    // Soft del + ghosts
    let dtest = [{ name: 'D', items: [{text:'a', timestamp:100, checked:false}, {text:'b', timestamp:200, checked:false}] }];
    const ditem = dtest[0].items[0];
    ditem.deletedAt = 123456;
    const g = dtest[0].items.splice(0,1)[0];
    dtest[0].items.push(g);
    if (dtest[0].items.length !== 2 || dtest[0].items[1].deletedAt !== 123456) throw new Error('soft del ghost move failed');
    if (filterAliveItems(dtest[0].items).length !== 1 || filterAliveItems(dtest[0].items)[0].timestamp !== 200) throw new Error('filterAlive excludes ghost');
    const dlist = [{name:'L1', items:[]}, {name:'DL', deletedAt:999, items:[]}];
    if (filterAliveLists(dlist).length !== 1 || filterAliveLists(dlist)[0].name !== 'L1') throw new Error('filterAliveLists failed');
    if (!dtest[0].items[1].deletedAt) throw new Error('ghost must retain del marker');

    const localGhost = [{ name: 'L', items: [{text:'x', timestamp:100, checked:false, deletedAt:150}] }];
    merged = mergeRemoteIntoLocal(localGhost, []);
    if (!merged[0] || !merged[0].items[0] || !merged[0].items[0].deletedAt) throw new Error('local-only ghost kept');

    const rGhost2 = [{ name: 'L', items: [{text:'', timestamp:200, checked:false, deletedAt:250}] }];
    merged = mergeRemoteIntoLocal([], rGhost2);
    if (!merged[0] || !merged[0].items[0].deletedAt) throw new Error('remote ghost kept');

    const mixedG = [{name:'M', items:[{text:'alive', timestamp:300, checked:false}, {text:'', timestamp:301, checked:false, deletedAt:310}]}];
    merged = mergeRemoteIntoLocal(mixedG, mixedG);
    if (filterAliveItems(merged[0].items).length !== 1) throw new Error('ghost filtered in alive count post merge');

    // recurrenceJustCompleted sim (used by sync paths)
    if (!recurrenceJustCompleted) recurrenceJustCompleted = new Set();
    const gRecur = { text: '[recurrent: daily]', timestamp: 4000, checked: false, deletedAt: 4100 };
    recurrenceJustCompleted.add(gRecur.timestamp);
    if (!recurrenceJustCompleted.has(gRecur.timestamp)) throw new Error('recurrenceJustCompleted ts works for ghost ts');
    recurrenceJustCompleted.clear();

    const pdel = [{ name: 'PD', items: [{text:'live', timestamp:5000, checked:false}] }];
    const pdit = pdel[0].items[0]; pdit.deletedAt = 5100;
    const pdg = pdel[0].items.splice(0,1)[0]; pdel[0].items.push(pdg);
    if (filterAliveItems(pdel[0].items).length !== 0) throw new Error('post del alive count');
    if (pdel[0].items.length !== 1 || !pdel[0].items[0].deletedAt) throw new Error('ghost at end after del sim');

    // The 12 scenarios (abbreviated for file size but still exercising the important paths)
    let l1 = [{ name: 'L', timestamp: 50, items: [{ text: 'foo', timestamp: 100, checked: false }] }];
    let r1 = [{ name: 'L', timestamp: 50, items: [{ text: 'foo', timestamp: 100, checked: false, deletedAt: 200 }] }];
    let m1 = mergeRemoteIntoLocal(l1, r1);
    if (!m1[0] || !m1[0].items[0] || m1[0].items[0].deletedAt !== 200) throw new Error('case1: remote del wins');

    let l2 = [{ name: 'L', timestamp: 50, items: [{ text: 'foo edited', timestamp: 100, checked: false, updatedAt: 250 }] }];
    let r2 = [{ name: 'L', timestamp: 50, items: [{ text: 'foo', timestamp: 100, checked: false, deletedAt: 200 }] }];
    let m2 = mergeRemoteIntoLocal(l2, r2);
    if (!m2[0] || m2[0].items[0].deletedAt || m2[0].items[0].updatedAt !== 250) throw new Error('case2: later act resurrects');

    // Explicit named cases derived from reconcile/merge LWW + post-processing (dedup, localPlacement, local-toggle, due bias)
    // Case 3: Concurrent create + delete (del > ts)
    let l3 = [{ name: 'L', items: [{ text: 'new', timestamp: 100, checked: false }] }];
    let r3 = [{ name: 'L', items: [{ text: '', timestamp: 100, checked: false, deletedAt: 105 }] }];
    let m3 = mergeRemoteIntoLocal(l3, r3);
    if (!m3[0] || !m3[0].items[0].deletedAt || m3[0].items[0].deletedAt !== 105) throw new Error('case3: del>create ghosts');

    // Case 4: Local-only del (ghost kept)
    let l4 = [{ name: 'L', items: [{ text: '', timestamp: 100, checked: false, deletedAt: 150 }] }];
    let m4 = mergeRemoteIntoLocal(l4, []);
    if (!m4[0] || !m4[0].items[0].deletedAt) throw new Error('case4: local ghost kept');

    // Case 5: List delete vs item activity
    let l5 = [{ name: 'L', timestamp: 50, deletedAt: 300, items: [] }];
    let r5 = [{ name: 'L', timestamp: 50, items: [{ text: 'i', timestamp: 60, checked: false, updatedAt: 200 }] }];
    let m5 = mergeRemoteIntoLocal(l5, r5);
    if (!m5[0] || !m5[0].deletedAt || m5[0].deletedAt !== 300) throw new Error('case5: list del > item act');

    // Case 7: Order + del in middle (higher oupd wins order, ghost suffix)
    let l7 = [{ name: 'L', orderUpdatedAt: 180, items: [ {text:'1', timestamp:1, checked:false}, {text:'', timestamp:2, checked:false, deletedAt:200}, {text:'3', timestamp:3, checked:false} ] }];
    let r7 = [{ name: 'L', orderUpdatedAt: 250, items: [ {text:'1', timestamp:1, checked:false}, {text:'3', timestamp:3, checked:false} ] }];
    let m7 = mergeRemoteIntoLocal(l7, r7);
    const alive7 = filterAliveItems(m7[0] ? m7[0].items : []).map(i => i.timestamp);
    if (alive7.join(',') !== '1,3') throw new Error('case7: remote oupd order + ghost suffix');

    // Case 9: Remote del + local rec toggle race (toggled > del resurrects)
    let l9 = [{ name: 'L', items: [{ text: '[recurrent: daily]', timestamp: 100, checked: false, toggledAt: 180 }] }];
    let r9 = [{ name: 'L', items: [{ text: '', timestamp: 100, checked: false, deletedAt: 150 }] }];
    let m9 = mergeRemoteIntoLocal(l9, r9);
    if (!m9[0] || m9[0].items[0].deletedAt || m9[0].items[0].toggledAt !== 180) throw new Error('case9: toggle > del + text preserved');

    // Case 10: Text/due edit concurrent w/ del
    let l10 = [{ name: 'L', items: [{ text: 'edited', timestamp: 100, checked: false, updatedAt: 300, dueAt: 999 }] }];
    let r10 = [{ name: 'L', items: [{ text: 'old', timestamp: 100, checked: false, deletedAt: 250 }] }];
    let m10 = mergeRemoteIntoLocal(l10, r10);
    if (m10[0].items[0].deletedAt || m10[0].items[0].updatedAt !== 300) throw new Error('case10: upd > del');

    // Case 12: Local-only list del
    let l12 = [{ name: 'Bar', timestamp: 70, deletedAt: 180, items: [] }];
    let m12 = mergeRemoteIntoLocal(l12, []);
    if (!m12[0] || !m12[0].deletedAt || m12[0].deletedAt !== 180) throw new Error('case12: local list ghost kept');

    // Additional: cross-order, ghost-list, local-only + remote-ghost (from plan)
    let mGhostL = mergeRemoteIntoLocal([{name:'AliveL', timestamp:1, items:[]}, {name:'GhostL', timestamp:2, deletedAt:99, items:[]}], [{name:'AliveL', timestamp:1, items:[]}]);
    if (mGhostL.length !== 2 || !mGhostL[1] || !mGhostL[1].deletedAt) throw new Error('ghost lists appended at end');

    // ... (remaining cases can be derived similarly; full matrix exercised via browser self-tests + plan)

    // Quick additional PR-5 style checks
    let pdel5 = [{ name: 'PDel', items: [{text:'live', timestamp:5000, checked:false}] }];
    const pdit5 = pdel5[0].items[0]; pdit5.deletedAt = 5100;
    const pdg5 = pdel5[0].items.splice(0,1)[0]; pdel5[0].items.push(pdg5);
    if (filterAliveItems(pdel5[0].items).length !== 0) throw new Error('PR5 patch-after-del: alive count 0');

    const rdelIt = { text: '[recurrent: daily]', timestamp: 6000, checked: false, deletedAt: 6100 };
    if (!isDeleted(rdelIt)) throw new Error('PR5 recur+del: isDeleted');

    const crossL = [{name:'Src', items:[]}];
    const crossR = [{name:'Src', items:[{text:'x', timestamp:7000, checked:false, updatedAt:7005}]}];
    let crossM = mergeRemoteIntoLocal(crossL, crossR);
    if (crossM[0].items.length !== 1 || !crossM[0].items[0].updatedAt) throw new Error('PR5 cross: no-del + upd preserved');

    const off = [{name:'Off', timestamp:80, items:[{text:'o', timestamp:8000, checked:false, updatedAt:8001}]}];
    const offGen = generateListFile(off);
    const offP = parseListFile(offGen);
    if (!offP[0] || offP[0].items[0].updatedAt !== 8001) throw new Error('PR5 offline roundtrip');

    // Step 7: Additional roundtrip stress (rec text + due coexisting, meta chars)
    const recDue = [{ name: 'RD', items: [{text:'task [recurrent: daily] |due: tomorrow', timestamp:1001, checked:false, dueAt:123456789}] }];
    const rdGen = generateListFile(recDue);
    const rdP = parseListFile(rdGen);
    const rdSan = sanitizeLists(rdP) || [];
    if (!rdSan[0] || !rdSan[0].items[0].dueAt) throw new Error('roundtrip rec+due meta');
    assertRoundtrip({ name: 'MetaPipe', items: [{text:'note about |upd:123 and |due:456', timestamp:1002, checked:false}] });

    // Step 8: merge + recurrence / due cases (cross-device completion as checked state)
    const recMergeL = [{ name: 'L', items: [{ text: '[recurrent: daily]', timestamp: 500, checked: false, toggledAt: 600 }] }];
    const recMergeR = [{ name: 'L', items: [{ text: '[recurrent: daily]', timestamp: 500, checked: true, toggledAt: 550, deletedAt: 580 }] }];
    const recM = mergeRemoteIntoLocal(recMergeL, recMergeR);
    if (recM[0].items[0].deletedAt || !recM[0].items[0].toggledAt) throw new Error('merge+rec toggle resurrection');
    // due bias in merge
    const dueL = [{ name: 'L', items: [{ text: 'd', timestamp: 600, checked: false, dueAt: 999 }] }];
    const dueR = [{ name: 'L', items: [{ text: 'd', timestamp: 600, checked: false, dueAt: 888 }] }];
    const dueM = mergeRemoteIntoLocal(dueL, dueR);
    if (dueM[0].items[0].dueAt !== 999) throw new Error('merge due local bias');

    if (typeof console !== 'undefined' && console.log) console.log('%c[Inbox] Sync merge self-test passed.', 'color:#34c759');
  }

  function runAllSelfTests() {
    const results = [];
    let passed = 0;
    let failed = 0;

    function runOne(name, fn) {
      try {
        fn();
        results.push({ name, ok: true });
        passed++;
      } catch (e) {
        results.push({ name, ok: false, error: e && e.message || String(e) });
        failed++;
        if (typeof console !== 'undefined') console.error('[SelfTest] ' + name + ' failed:', e);
      }
    }

    runOne('Due', runDueSelfTest);
    runOne('Recurrence', runRecurrenceSelfTest);
    runOne('SyncMerge', runSyncMergeSelfTest);
    runOne('Invariants', runInvariantsSelfTest);

    const summary = `Self-tests: ${passed} passed, ${failed} failed`;
    if (failed > 0) {
      if (typeof console !== 'undefined') {
        console.group('%c[Inbox SelfTest] ' + summary, 'color:#c93400;font-weight:bold');
        results.filter(r => !r.ok).forEach(r => console.error(r.name + ':', r.error));
        console.groupEnd();
      }
    } else {
      if (typeof console !== 'undefined') console.log('%c[Inbox SelfTest] ' + summary, 'color:#34c759');
    }
    if (typeof window !== 'undefined') {
      window._lastSelfTestResults = { passed, failed, results, at: Date.now() };
    }
    return { passed, failed, results };
  }

  // Make the real implementation available
  if (typeof window !== 'undefined') {
    window.runDueSelfTest = runDueSelfTest;
    window.runRecurrenceSelfTest = runRecurrenceSelfTest;
    window.runSyncMergeSelfTest = runSyncMergeSelfTest;
    window.runAllSelfTests = runAllSelfTests;
    window.__runFullSelfTests = runAllSelfTests; // used by the loader in index.html

    // Also override the main hook if it exists so that calling runInboxSelfTests does the real thing
    window.runInboxSelfTests = runAllSelfTests;
  }

  // If this script is loaded directly (e.g. in a test harness), run automatically when DEBUG-like
  if (typeof window !== 'undefined' && (window.location.search.includes('selftest') || (typeof DEBUG !== 'undefined' && DEBUG))) {
    setTimeout(runAllSelfTests, 30);
  }
})();
