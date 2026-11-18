/* ForceNotes certification practice.
 * Question bank: cert-data.js (window.FN_CERTS). Progress lives only in this browser (localStorage).
 * Modes: quick quiz, practice by topic, mock exam (timed, no feedback until the end), review missed. */
(function () {
  var DATA = window.FN_CERTS;
  var root = document.getElementById('certApp');
  if (!root || !DATA) return;

  var KEY = 'fn-cert-v1', EXAM_KEY = 'fn-cert-exam-v1';
  var store = loadStore();
  var session = null, timerId = 0;

  /* ---------------------------------------------------------------- storage */
  function loadStore() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function saveStore() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* storage blocked */ } }
  function certStore(id) { if (!store[id]) store[id] = { q: {}, attempts: [] }; return store[id]; }
  function saveExam() {
    if (!session || session.mode !== 'exam' || session.done) return;
    try {
      localStorage.setItem(EXAM_KEY, JSON.stringify({
        cert: session.cert, endsAt: session.endsAt, startedAt: session.startedAt, idx: session.idx,
        items: session.items.map(function (it) { return { id: it.q.id, order: it.order, sel: it.sel, flagged: it.flagged }; })
      }));
    } catch (e) { /* ignore */ }
  }
  function clearExam() { try { localStorage.removeItem(EXAM_KEY); } catch (e) { /* ignore */ } }
  function savedExam() {
    try {
      var s = JSON.parse(localStorage.getItem(EXAM_KEY));
      if (s && s.endsAt > Date.now() && DATA[s.cert]) return s;
    } catch (e) { /* ignore */ }
    return null;
  }

  /* ---------------------------------------------------------------- helpers */
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function hl() { if (window.fnHighlight) { try { window.fnHighlight(); } catch (e) { /* ignore */ } } }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pct(n, d) { return d ? Math.round(n / d * 100) : 0; }
  function fmtTime(sec) { sec = Math.max(0, Math.round(sec)); var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  function fmtDate(ts) { var d = new Date(ts); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
  function qById(cert, id) { for (var i = 0; i < cert.questions.length; i++) if (cert.questions[i].id === id) return cert.questions[i]; return null; }
  function domainName(cert, id) { for (var i = 0; i < cert.domains.length; i++) if (cert.domains[i].id === id) return cert.domains[i].name; return id; }
  function link(href, text) { var a = el('a', '', text); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; return a; }
  function btn(text, cls, fn) { var b = el('button', 'btn ' + (cls || 'btn-ghost'), text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }

  function renderStem(container, text) {
    var parts = text.split('```');
    parts.forEach(function (p, i) {
      if (i % 2 === 1) { var pre = el('pre', 'cert-code'); pre.appendChild(el('code', '', p.replace(/^\n/, '').replace(/\n$/, ''))); container.appendChild(pre); }
      else if (p.trim()) { p.trim().split(/\n{2,}/).forEach(function (para) { container.appendChild(el('p', '', para.trim())); }); }
    });
    if (window.fnHighlight) { try { window.fnHighlight(); } catch (e) { /* ignore */ } }
  }

  /* ---------------------------------------------------------------- selection */
  function priority(certId, q) {
    var r = certStore(certId).q[q.id];
    var p = !r ? 2 : (r.l === false ? 1.6 : 0.6);
    return p + Math.random() * 0.9;
  }
  function pickMixed(cert, n, domainIds) {
    var pool = cert.questions.filter(function (q) { return !domainIds || domainIds.indexOf(q.d) !== -1; });
    var doms = cert.domains.filter(function (d) { return !domainIds || domainIds.indexOf(d.id) !== -1; });
    var totalPct = doms.reduce(function (s, d) { return s + d.pct; }, 0) || 1;
    var chosen = [], used = {};
    doms.forEach(function (d) {
      var want = Math.max(1, Math.round(d.pct / totalPct * n));
      pool.filter(function (q) { return q.d === d.id; })
        .sort(function (a, b) { return priority(cert.id, b) - priority(cert.id, a); })
        .slice(0, want).forEach(function (q) { chosen.push(q); used[q.id] = 1; });
    });
    if (chosen.length < n) {
      pool.filter(function (q) { return !used[q.id]; }).sort(function (a, b) { return priority(cert.id, b) - priority(cert.id, a); })
        .slice(0, n - chosen.length).forEach(function (q) { chosen.push(q); });
    }
    return shuffle(chosen).slice(0, n);
  }
  function pickExam(cert) {
    var total = cert.exam.questions, chosen = [], used = {};
    var targets = cert.domains.map(function (d) { return { d: d, n: Math.floor(d.pct / 100 * total) }; });
    var sum = targets.reduce(function (s, t) { return s + t.n; }, 0);
    var byRem = cert.domains.map(function (d, i) { return { i: i, r: d.pct / 100 * total - targets[i].n }; }).sort(function (a, b) { return b.r - a.r; });
    for (var k = 0; sum < total && k < byRem.length; k++, sum++) targets[byRem[k].i].n++;
    targets.forEach(function (t) {
      var pool = shuffle(cert.questions.filter(function (q) { return q.d === t.d.id; }));
      pool.slice(0, t.n).forEach(function (q) { chosen.push(q); used[q.id] = 1; });
    });
    if (chosen.length < total) shuffle(cert.questions.filter(function (q) { return !used[q.id]; })).slice(0, total - chosen.length).forEach(function (q) { chosen.push(q); });
    return shuffle(chosen).slice(0, total);
  }
  function makeItems(qs) {
    return qs.map(function (q) {
      var order = shuffle(q.o.map(function (_, i) { return i; }));
      return { q: q, order: order, sel: [], checked: false, flagged: false };
    });
  }
  function isCorrect(item) {
    var want = item.q.a.slice().sort().join(','), got = item.sel.slice().sort().join(',');
    return want === got;
  }

  /* ---------------------------------------------------------------- routing */
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = 0; } }
  function go(certId) {
    stopTimer(); session = null;
    if (certId && DATA[certId]) { history.replaceState(null, '', '#' + certId); viewCert(DATA[certId]); }
    else { history.replaceState(null, '', location.pathname + location.search); viewHome(); }
    window.scrollTo(0, root.getBoundingClientRect().top + window.scrollY - 90);
  }

  /* ---------------------------------------------------------------- home */
  function certStats(cert) {
    var cs = certStore(cert.id), seen = 0, right = 0;
    cert.questions.forEach(function (q) { var r = cs.q[q.id]; if (r) { seen++; if (r.l) right++; } });
    var best = null;
    cs.attempts.forEach(function (a) { if (a.mode === 'exam' && (best === null || a.pct > best)) best = a.pct; });
    return { seen: seen, right: right, best: best };
  }
  function viewHome() {
    clear(root);
    var grid = el('div', 'cert-grid');
    Object.keys(DATA).forEach(function (id) {
      var c = DATA[id], st = certStats(c);
      var card = el('article', 'cert-card');
      card.appendChild(el('span', 'cert-tag', 'Certification practice'));
      card.appendChild(el('h3', '', c.short));
      card.appendChild(el('p', 'cert-card-sub', c.name));
      card.appendChild(el('p', '', c.blurb));
      var facts = el('ul', 'cert-facts');
      [c.questions.length + ' practice questions', c.exam.questions + ' questions, ' + c.exam.minutes + ' minutes in the real exam', c.exam.passing + '% to pass the real exam'].forEach(function (t) { facts.appendChild(el('li', '', t)); });
      card.appendChild(facts);
      var prog = el('div', 'cert-mini');
      prog.appendChild(el('span', '', st.seen ? st.seen + ' of ' + c.questions.length + ' practised' + (st.best !== null ? ', best mock exam ' + st.best + '%' : '') : 'Not started yet'));
      var bar = el('div', 'cert-bar'); var fill = el('span'); fill.style.width = pct(st.seen, c.questions.length) + '%'; bar.appendChild(fill); prog.appendChild(bar);
      card.appendChild(prog);
      card.appendChild(btn(st.seen ? 'Continue' : 'Start practising', 'btn-primary', function () { go(id); }));
      grid.appendChild(card);
    });
    root.appendChild(grid);
    var ex = savedExam();
    if (ex) root.insertBefore(resumeBanner(ex), grid);
  }
  function resumeBanner(ex) {
    var box = el('div', 'cert-banner');
    box.appendChild(el('p', '', 'You have a mock exam in progress for ' + DATA[ex.cert].short + ' with ' + fmtTime((ex.endsAt - Date.now()) / 1000) + ' left.'));
    box.appendChild(btn('Resume exam', 'btn-primary', function () { resumeExam(ex); }));
    box.appendChild(btn('Discard', 'btn-ghost', function () { clearExam(); var id = location.hash.slice(1); if (id && DATA[id]) viewCert(DATA[id]); else viewHome(); }));
    return box;
  }

  /* ---------------------------------------------------------------- cert dashboard */
  function viewCert(cert) {
    clear(root);
    var back = btn('← All certifications', 'btn-ghost', function () { go(null); }); back.classList.add('cert-back');
    root.appendChild(back);
    var head = el('div', 'cert-head');
    head.appendChild(el('h2', '', cert.name));
    root.appendChild(head);
    var ex = savedExam();
    if (ex && ex.cert === cert.id) root.appendChild(resumeBanner(ex));

    var facts = el('div', 'cert-factbox');
    var rows = [
      ['Real exam', cert.exam.questions + ' scored multiple-choice questions, ' + cert.exam.unscored],
      ['Time', cert.exam.minutes + ' minutes'],
      ['Passing score', cert.exam.passing + '%'],
      ['Fee', cert.exam.fee],
      ['Exam guide aligned to', cert.exam.release]
    ];
    rows.forEach(function (r) { var d = el('div'); d.appendChild(el('dt', '', r[0])); d.appendChild(el('dd', '', r[1])); facts.appendChild(d); });
    var dl = el('dl', 'cert-facts-dl'); while (facts.firstChild) dl.appendChild(facts.firstChild);
    root.appendChild(dl);
    var guide = el('p', 'cert-note');
    guide.appendChild(document.createTextNode('Figures come from the official exam guide: '));
    guide.appendChild(link(cert.exam.guide, 'read it on Salesforce Help'));
    guide.appendChild(document.createTextNode(' and check it before you book, as Salesforce updates exams each release. ForceNotes questions are original practice questions written for study. They are not real exam questions.'));
    root.appendChild(guide);

    /* modes */
    var cs = certStore(cert.id);
    var missed = cert.questions.filter(function (q) { var r = cs.q[q.id]; return r && r.l === false; });
    var modes = el('div', 'cert-modes');
    modes.appendChild(modeCard('Quick quiz', '10 questions mixed across the exam sections. Unseen and previously missed questions come first. You see the answer after each one.', 'Start quick quiz', function () { startSession(cert, 'quick', pickMixed(cert, 10)); }));
    modes.appendChild(modeCard('Mock exam', Math.min(cert.exam.questions, cert.questions.length) + ' questions in the real exam proportions, ' + cert.exam.minutes + ' minutes, no answers until you finish. Flag questions and review them like the real exam.', 'Start mock exam', function () { startSession(cert, 'exam', pickExam(cert)); }, true));
    modes.appendChild(modeCard('Review missed', missed.length ? missed.length + ' question' + (missed.length === 1 ? '' : 's') + ' you got wrong last time.' : 'Questions you get wrong will collect here for a second try.', 'Review missed', function () { startSession(cert, 'review', shuffle(missed)); }, false, !missed.length));
    root.appendChild(modes);

    /* practice by topic */
    var topic = el('div', 'cert-topic');
    topic.appendChild(el('h3', '', 'Practice by topic'));
    var boxes = el('div', 'cert-checks');
    var checks = [];
    cert.domains.forEach(function (d) {
      var lab = el('label', 'cert-check'); var cb = el('input'); cb.type = 'checkbox'; cb.value = d.id; cb.checked = true; checks.push(cb);
      lab.appendChild(cb); lab.appendChild(el('span', '', d.name + ' (' + d.n + ')')); boxes.appendChild(lab);
    });
    topic.appendChild(boxes);
    var row = el('div', 'cert-topic-row');
    var sel = el('select', 'cert-select'); sel.setAttribute('aria-label', 'Number of questions');
    [['10', '10 questions'], ['20', '20 questions'], ['all', 'All selected']].forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; sel.appendChild(op); });
    row.appendChild(sel);
    row.appendChild(btn('Start practice', 'btn-primary', function () {
      var ids = checks.filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
      if (!ids.length) { alert('Choose at least one topic.'); return; }
      var pool = cert.questions.filter(function (q) { return ids.indexOf(q.d) !== -1; });
      var n = sel.value === 'all' ? pool.length : Math.min(parseInt(sel.value, 10), pool.length);
      startSession(cert, 'practice', sel.value === 'all' ? shuffle(pool) : pickMixed(cert, n, ids));
    }));
    topic.appendChild(row);
    root.appendChild(topic);

    /* weights and accuracy */
    var table = el('table', 'cert-table');
    var thead = el('thead'), htr = el('tr');
    ['Exam section', 'Weight', 'Questions', 'Your accuracy'].forEach(function (t) { htr.appendChild(el('th', '', t)); });
    thead.appendChild(htr); table.appendChild(thead);
    var tb = el('tbody');
    cert.domains.forEach(function (d) {
      var seen = 0, right = 0;
      cert.questions.forEach(function (q) { if (q.d === d.id) { var r = cs.q[q.id]; if (r) { seen++; if (r.l) right++; } } });
      var tr = el('tr');
      tr.appendChild(el('th', '', d.name)); tr.appendChild(el('td', '', d.pct + '%')); tr.appendChild(el('td', '', String(d.n)));
      var td = el('td'); var cell = el('div', 'cert-acc');
      var bar = el('div', 'cert-bar'); var fill = el('span'); fill.style.width = (seen ? pct(right, seen) : 0) + '%'; if (seen && pct(right, seen) < cert.exam.passing) fill.className = 'low'; bar.appendChild(fill);
      cell.appendChild(bar); cell.appendChild(el('span', '', seen ? pct(right, seen) + '% (' + right + ' of ' + seen + ')' : 'not started'));
      td.appendChild(cell); tr.appendChild(td); tb.appendChild(tr);
    });
    table.appendChild(tb);
    var wrap = el('div', 'cert-table-wrap'); wrap.appendChild(el('h3', '', 'Exam sections and your progress')); wrap.appendChild(table);
    root.appendChild(wrap);

    /* history */
    if (cs.attempts.length) {
      var hist = el('div', 'cert-history'); hist.appendChild(el('h3', '', 'Recent attempts'));
      var ul = el('ul');
      cs.attempts.slice(-8).reverse().forEach(function (a) {
        var label = { exam: 'Mock exam', quick: 'Quick quiz', practice: 'Practice', review: 'Review' }[a.mode] || a.mode;
        var li = el('li'); li.appendChild(el('span', '', fmtDate(a.at))); li.appendChild(el('span', '', label));
        var res = el('strong', a.mode === 'exam' ? (a.pct >= cert.exam.passing ? 'cert-pass' : 'cert-fail') : '', a.right + ' / ' + a.total + ' (' + a.pct + '%)'); li.appendChild(res);
        ul.appendChild(li);
      });
      hist.appendChild(ul);
      hist.appendChild(btn('Reset my progress for this exam', 'btn-ghost', function () {
        if (confirm('Clear your saved practice history for ' + cert.short + ' on this device?')) { store[cert.id] = { q: {}, attempts: [] }; saveStore(); viewCert(cert); }
      }));
      root.appendChild(hist);
    }
  }
  function modeCard(title, text, label, fn, primary, disabled) {
    var c = el('div', 'cert-mode');
    c.appendChild(el('h3', '', title)); c.appendChild(el('p', '', text));
    var b = btn(label, primary ? 'btn-primary' : 'btn-ghost', fn); if (disabled) { b.disabled = true; } c.appendChild(b);
    return c;
  }

  /* ---------------------------------------------------------------- sessions */
  function startSession(cert, mode, qs) {
    if (!qs.length) return;
    stopTimer();
    session = { cert: cert.id, mode: mode, items: makeItems(qs), idx: 0, startedAt: Date.now(), done: false };
    if (mode === 'exam') { session.endsAt = Date.now() + cert.exam.minutes * 60000; saveExam(); startTimer(); }
    viewQuestion();
  }
  function resumeExam(s) {
    var cert = DATA[s.cert];
    var items = [];
    s.items.forEach(function (it) { var q = qById(cert, it.id); if (q) items.push({ q: q, order: it.order, sel: it.sel || [], checked: false, flagged: !!it.flagged }); });
    if (!items.length) { clearExam(); return; }
    session = { cert: s.cert, mode: 'exam', items: items, idx: Math.min(s.idx || 0, items.length - 1), startedAt: s.startedAt, endsAt: s.endsAt, done: false };
    history.replaceState(null, '', '#' + s.cert);
    startTimer(); viewQuestion();
  }
  function startTimer() {
    stopTimer();
    timerId = setInterval(function () {
      if (!session || session.mode !== 'exam' || session.done) { stopTimer(); return; }
      var left = (session.endsAt - Date.now()) / 1000;
      var t = document.getElementById('certTimer');
      if (t) { t.textContent = fmtTime(left); t.classList.toggle('low', left < 600); }
      if (left <= 0) finishSession(true);
    }, 1000);
  }

  function viewQuestion() {
    clear(root);
    var cert = DATA[session.cert], item = session.items[session.idx], q = item.q, exam = session.mode === 'exam';
    var need = q.a.length, answered = item.checked;

    var bar = el('div', 'cert-topbar');
    bar.appendChild(btn(exam ? 'Review and finish' : 'Exit', 'btn-ghost', function () {
      if (exam) { viewExamNav(); return; }
      if (session.items.some(function (i) { return i.checked; }) ? confirm('Leave this session? Your answers so far are saved.') : true) { go(cert.id); }
    }));
    bar.appendChild(el('span', 'cert-count', 'Question ' + (session.idx + 1) + ' of ' + session.items.length));
    if (exam) { var tm = el('span', 'cert-timer', fmtTime((session.endsAt - Date.now()) / 1000)); tm.id = 'certTimer'; bar.appendChild(tm); }
    else {
      var done = session.items.filter(function (i) { return i.checked; }), ok = done.filter(isCorrect).length;
      bar.appendChild(el('span', 'cert-score', done.length ? ok + ' of ' + done.length + ' correct' : ''));
    }
    root.appendChild(bar);
    var prog = el('div', 'cert-bar cert-progress'); var pf = el('span');
    pf.style.width = pct(session.items.filter(function (i) { return exam ? i.sel.length : i.checked; }).length, session.items.length) + '%'; prog.appendChild(pf); root.appendChild(prog);

    var card = el('div', 'cert-q');
    card.appendChild(el('span', 'cert-domain', domainName(cert, q.d)));
    var stem = el('div', 'cert-stem'); renderStem(stem, q.q); card.appendChild(stem);
    card.appendChild(el('p', 'cert-choose', need > 1 ? 'Choose ' + need + ' answers' : 'Choose 1 answer'));

    var list = el('div', 'cert-opts'); list.setAttribute('role', need > 1 ? 'group' : 'radiogroup');
    var inputs = [];
    item.order.forEach(function (orig, pos) {
      var lab = el('label', 'cert-opt');
      var inp = el('input'); inp.type = need > 1 ? 'checkbox' : 'radio'; inp.name = 'opt'; inp.value = String(orig);
      inp.checked = item.sel.indexOf(orig) !== -1; inp.disabled = answered;
      inp.addEventListener('change', function () { onSelect(inp, need, inputs); });
      lab.appendChild(inp);
      lab.appendChild(el('span', 'cert-key', String(pos + 1)));
      lab.appendChild(el('span', 'cert-text', q.o[orig]));
      if (answered) { var isRight = q.a.indexOf(orig) !== -1, picked = item.sel.indexOf(orig) !== -1; if (isRight) lab.classList.add('right'); else if (picked) lab.classList.add('wrong'); if (isRight && !picked) lab.classList.add('missed'); }
      inputs.push(inp); list.appendChild(lab);
    });
    card.appendChild(list);

    var actions = el('div', 'cert-actions');
    var primary;
    if (exam) {
      actions.appendChild(btn(item.flagged ? 'Unflag' : 'Flag for review', item.flagged ? 'btn-primary cert-flagbtn' : 'btn-ghost', function () { item.flagged = !item.flagged; saveExam(); viewQuestion(); }));
      var prev = btn('← Previous', 'btn-ghost', function () { move(-1); }); prev.disabled = session.idx === 0; actions.appendChild(prev);
      var last = session.idx === session.items.length - 1;
      primary = btn(last ? 'Review answers' : 'Next →', 'btn-primary', function () { if (last) { viewExamNav(); } else move(1); });
      actions.appendChild(primary);
    } else if (!answered) {
      primary = btn('Check answer', 'btn-primary', function () { checkAnswer(item); });
      primary.disabled = item.sel.length !== need; primary.id = 'certPrimary'; actions.appendChild(primary);
    } else {
      var lastQ = session.idx === session.items.length - 1;
      primary = btn(lastQ ? 'See results' : 'Next question →', 'btn-primary', function () { if (lastQ) finishSession(false); else move(1); });
      actions.appendChild(primary);
    }
    card.appendChild(actions);

    if (answered && !exam) {
      var good = isCorrect(item);
      var fb = el('div', 'cert-feedback ' + (good ? 'good' : 'bad'));
      fb.appendChild(el('strong', '', good ? 'Correct' : 'Not quite'));
      fb.appendChild(el('p', '', q.e));
      card.appendChild(fb);
    }
    root.appendChild(card);
    hl();
    if (exam) root.appendChild(navigator(false));
    window.scrollTo(0, root.getBoundingClientRect().top + window.scrollY - 90);
  }
  function onSelect(inp, need, inputs) {
    var item = session.items[session.idx], val = parseInt(inp.value, 10);
    if (need === 1) item.sel = [val];
    else {
      var i = item.sel.indexOf(val);
      if (inp.checked) { if (i === -1) item.sel.push(val); } else if (i !== -1) item.sel.splice(i, 1);
      if (item.sel.length > need) { item.sel = item.sel.slice(item.sel.length - need); inputs.forEach(function (x) { x.checked = item.sel.indexOf(parseInt(x.value, 10)) !== -1; }); }
    }
    var p = document.getElementById('certPrimary'); if (p) p.disabled = item.sel.length !== need;
    if (session.mode === 'exam') saveExam();
  }
  function move(step) { session.idx = Math.max(0, Math.min(session.items.length - 1, session.idx + step)); saveExam(); viewQuestion(); }
  function checkAnswer(item) {
    if (item.checked) return;
    item.checked = true;
    var cs = certStore(session.cert), r = cs.q[item.q.id] || { s: 0, c: 0 };
    r.s++; var ok = isCorrect(item); if (ok) r.c++; r.l = ok; r.t = Date.now(); cs.q[item.q.id] = r; saveStore();
    viewQuestion();
  }
  function navigator(summary) {
    var box = el('div', 'cert-nav');
    if (!summary) box.appendChild(el('p', 'cert-nav-title', 'Question navigator'));
    var grid = el('div', 'cert-nav-grid');
    session.items.forEach(function (it, i) {
      var b = el('button', 'cert-nav-btn' + (it.sel.length ? ' answered' : '') + (it.flagged ? ' flagged' : '') + (i === session.idx ? ' current' : ''), String(i + 1));
      b.type = 'button'; b.setAttribute('aria-label', 'Question ' + (i + 1) + (it.sel.length ? ', answered' : ', not answered') + (it.flagged ? ', flagged' : ''));
      b.addEventListener('click', function () { session.idx = i; saveExam(); viewQuestion(); });
      grid.appendChild(b);
    });
    box.appendChild(grid);
    var key = el('p', 'cert-nav-key'); key.appendChild(el('span', 'answered', 'Answered')); key.appendChild(el('span', 'flagged', 'Flagged')); key.appendChild(el('span', '', 'Not answered')); box.appendChild(key);
    return box;
  }
  function viewExamNav() {
    clear(root);
    var un = session.items.filter(function (i) { return !i.sel.length; }).length, fl = session.items.filter(function (i) { return i.flagged; }).length;
    var card = el('div', 'cert-q');
    card.appendChild(el('h3', '', 'Review before you finish'));
    card.appendChild(el('p', '', un + ' not answered, ' + fl + ' flagged. Click a number to go back to that question.'));
    card.appendChild(navigator(true));
    var tm = el('p', 'cert-timer-inline'); tm.appendChild(document.createTextNode('Time left: ')); var t = el('strong', '', fmtTime((session.endsAt - Date.now()) / 1000)); t.id = 'certTimer'; tm.appendChild(t); card.appendChild(tm);
    var actions = el('div', 'cert-actions');
    actions.appendChild(btn('Back to questions', 'btn-ghost', function () { viewQuestion(); }));
    actions.appendChild(btn('Finish and see my score', 'btn-primary', function () { if (!un || confirm(un + ' question' + (un === 1 ? ' is' : 's are') + ' not answered. Finish anyway?')) finishSession(false); }));
    card.appendChild(actions);
    root.appendChild(card);
  }

  /* ---------------------------------------------------------------- results */
  function finishSession(timeUp) {
    if (!session || session.done) return;
    session.done = true; stopTimer();
    var cert = DATA[session.cert], cs = certStore(cert.id);
    var exam = session.mode === 'exam';
    var total = session.items.length, right = 0, byDomain = {};
    session.items.forEach(function (it) {
      var d = byDomain[it.q.d] || (byDomain[it.q.d] = { right: 0, total: 0 });
      d.total++;
      var ok = it.sel.length && isCorrect(it);
      if (ok) { right++; d.right++; }
      if (exam && it.sel.length) {
        var r = cs.q[it.q.id] || { s: 0, c: 0 }; r.s++; if (ok) r.c++; r.l = !!ok; r.t = Date.now(); cs.q[it.q.id] = r;
      }
    });
    var secs = Math.round((Math.min(Date.now(), session.endsAt || Date.now()) - session.startedAt) / 1000);
    cs.attempts.push({ at: Date.now(), mode: session.mode, right: right, total: total, pct: pct(right, total), secs: secs });
    if (cs.attempts.length > 60) cs.attempts = cs.attempts.slice(-60);
    saveStore(); if (exam) clearExam();
    viewResults(cert, right, total, byDomain, secs, timeUp);
  }
  function viewResults(cert, right, total, byDomain, secs, timeUp) {
    clear(root);
    var exam = session.mode === 'exam', score = pct(right, total);
    var head = el('div', 'cert-result');
    if (timeUp) head.appendChild(el('p', 'cert-note', 'Time is up. Your answers were submitted automatically.'));
    head.appendChild(el('p', 'cert-result-label', exam ? 'Mock exam result' : 'Session result'));
    head.appendChild(el('p', 'cert-result-score', score + '%'));
    head.appendChild(el('p', '', right + ' of ' + total + ' correct' + (exam ? ', time used ' + fmtTime(secs) + ' of ' + cert.exam.minutes + ':00' : '')));
    if (exam) {
      var pass = score >= cert.exam.passing;
      head.appendChild(el('p', 'cert-verdict ' + (pass ? 'cert-pass' : 'cert-fail'), pass ? 'Above the ' + cert.exam.passing + '% passing score' : 'Below the ' + cert.exam.passing + '% passing score'));
      head.appendChild(el('p', 'cert-note', 'This is a practice score. The real exam is scored differently and uses questions you have not seen here, so treat it as a guide to your weak areas, not a prediction.'));
    }
    root.appendChild(head);

    var tbl = el('table', 'cert-table'); var thead = el('thead'), htr = el('tr');
    ['Section', 'Correct', 'Score'].forEach(function (t) { htr.appendChild(el('th', '', t)); }); thead.appendChild(htr); tbl.appendChild(thead);
    var tb = el('tbody');
    cert.domains.forEach(function (d) {
      var x = byDomain[d.id]; if (!x) return;
      var tr = el('tr'); tr.appendChild(el('th', '', d.name)); tr.appendChild(el('td', '', x.right + ' of ' + x.total));
      var td = el('td'); var cell = el('div', 'cert-acc'); var bar = el('div', 'cert-bar'); var fill = el('span'); var p = pct(x.right, x.total); fill.style.width = p + '%'; if (p < cert.exam.passing) fill.className = 'low'; bar.appendChild(fill);
      cell.appendChild(bar); cell.appendChild(el('span', '', p + '%')); td.appendChild(cell); tr.appendChild(td); tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    var wrap = el('div', 'cert-table-wrap'); wrap.appendChild(tbl); root.appendChild(wrap);

    var acts = el('div', 'cert-actions');
    var wrong = session.items.filter(function (it) { return !(it.sel.length && isCorrect(it)); });
    if (wrong.length) acts.appendChild(btn('Retry the ' + wrong.length + ' I missed', 'btn-primary', function () { startSession(cert, 'review', shuffle(wrong.map(function (i) { return i.q; }))); }));
    acts.appendChild(btn('Back to ' + cert.short, 'btn-ghost', function () { go(cert.id); }));
    root.appendChild(acts);

    /* answer review */
    var rev = el('div', 'cert-review');
    rev.appendChild(el('h3', '', 'Review every question'));
    var filters = el('div', 'cert-filters'); var mode = 'all';
    var listBox = el('div', 'cert-review-list');
    function paint() {
      clear(listBox);
      session.items.forEach(function (it, i) {
        var ok = it.sel.length && isCorrect(it);
        if (mode === 'wrong' && ok) return; if (mode === 'flagged' && !it.flagged) return;
        var d = el('details', 'cert-rv ' + (ok ? 'good' : 'bad'));
        var s = el('summary'); s.appendChild(el('span', 'cert-rv-n', String(i + 1))); s.appendChild(el('span', 'cert-rv-q', it.q.q.split('\n')[0].replace(/```.*/, '(code question)').slice(0, 160))); s.appendChild(el('span', 'cert-rv-r', ok ? 'Correct' : (it.sel.length ? 'Wrong' : 'Unanswered'))); d.appendChild(s);
        var body = el('div', 'cert-rv-body'); renderStem(body, it.q.q);
        var ul = el('ul', 'cert-rv-opts');
        it.order.forEach(function (orig) {
          var li = el('li', (it.q.a.indexOf(orig) !== -1 ? 'right' : '') + (it.sel.indexOf(orig) !== -1 && it.q.a.indexOf(orig) === -1 ? ' wrong' : ''));
          li.appendChild(el('span', '', (it.q.a.indexOf(orig) !== -1 ? '✓ ' : (it.sel.indexOf(orig) !== -1 ? '✗ ' : '')) + it.q.o[orig] + (it.sel.indexOf(orig) !== -1 ? '  (your answer)' : '')));
          ul.appendChild(li);
        });
        body.appendChild(ul); body.appendChild(el('p', 'cert-rv-e', it.q.e)); d.appendChild(body); listBox.appendChild(d);
      });
      if (!listBox.firstChild) listBox.appendChild(el('p', 'cert-note', 'Nothing here.'));
      hl();
    }
    [['all', 'All'], ['wrong', 'Missed or unanswered'], ['flagged', 'Flagged']].forEach(function (f) {
      var b = el('button', 'filter-tab' + (f[0] === 'all' ? ' active' : ''), f[1]); b.type = 'button';
      b.addEventListener('click', function () { mode = f[0]; Array.prototype.forEach.call(filters.children, function (c) { c.classList.remove('active'); }); b.classList.add('active'); paint(); });
      filters.appendChild(b);
    });
    rev.appendChild(filters); rev.appendChild(listBox); root.appendChild(rev); paint();
    window.scrollTo(0, root.getBoundingClientRect().top + window.scrollY - 90);
  }

  /* ---------------------------------------------------------------- keyboard + guards */
  document.addEventListener('keydown', function (e) {
    if (!session || session.done || e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (e.target.tagName || '').toLowerCase(); if (tag === 'textarea' || tag === 'select') return;
    var item = session.items[session.idx]; if (!item || !document.querySelector('.cert-opts')) return;
    if (/^[1-9]$/.test(e.key)) {
      var inputs = document.querySelectorAll('.cert-opts input'); var inp = inputs[parseInt(e.key, 10) - 1];
      if (inp && !inp.disabled) { inp.click(); }
    } else if (e.key === 'Enter' && tag !== 'button') {
      var p = document.getElementById('certPrimary') || document.querySelector('.cert-actions .btn-primary:not(:disabled)'); if (p) { e.preventDefault(); p.click(); }
    } else if (session.mode === 'exam' && e.key === 'ArrowRight') { if (session.idx < session.items.length - 1) move(1); }
    else if (session.mode === 'exam' && e.key === 'ArrowLeft') { if (session.idx > 0) move(-1); }
  });
  window.addEventListener('beforeunload', function (e) { if (session && session.mode === 'exam' && !session.done) { saveExam(); e.preventDefault(); e.returnValue = ''; } });
  window.addEventListener('hashchange', function () { if (session && !session.done) return; var id = location.hash.slice(1); if (id && DATA[id]) viewCert(DATA[id]); else if (!id) viewHome(); });

  var start = location.hash.slice(1);
  if (start && DATA[start]) viewCert(DATA[start]); else viewHome();
})();
