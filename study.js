// Interview page: "mark as studied" progress and flashcard mode.
(function(){
  var items = Array.prototype.slice.call(document.querySelectorAll('.qa-item'));
  if(!items.length) return;
  var KEY = 'fn-studied-v1';
  var studied = {};
  try { (JSON.parse(localStorage.getItem(KEY) || '[]')).forEach(function(id){ studied[id] = true; }); } catch(e){}
  function save(){ try { localStorage.setItem(KEY, JSON.stringify(Object.keys(studied))); } catch(e){} }
  function hash(str){
    var h = 5381;
    for(var i = 0; i < str.length; i++){ h = ((h << 5) + h + str.charCodeAt(i)) | 0; }
    return 'q' + (h >>> 0).toString(36);
  }
  function questionText(item){
    var clone = item.querySelector('.qa-question').cloneNode(true);
    var t = clone.querySelector('.qa-toggle'); if(t) t.remove();
    var m = clone.querySelector('.qa-check'); if(m) m.remove();
    return clone.innerHTML.trim();
  }

  var fill = document.getElementById('qaProgressFill');
  var countEl = document.getElementById('qaStudiedCount');
  var totalEl = document.getElementById('qaTotalCount');
  if(totalEl) totalEl.textContent = items.length;

  function refresh(){
    var done = 0;
    items.forEach(function(item){
      var on = !!studied[item.dataset.qid];
      item.classList.toggle('studied', on);
      var box = item.querySelector('.qa-studied input');
      if(box) box.checked = on;
      if(on) done++;
    });
    if(countEl) countEl.textContent = done;
    if(fill) fill.style.width = (items.length ? Math.round(done / items.length * 100) : 0) + '%';
    document.querySelectorAll('.qa-category').forEach(function(cat){
      var catItems = cat.querySelectorAll('.qa-item');
      var h3 = cat.querySelector('h3');
      if(!catItems.length || !h3) return;
      var n = 0;
      catItems.forEach(function(i){ if(studied[i.dataset.qid]) n++; });
      var badge = h3.querySelector('.qa-cat-progress');
      if(!badge){ badge = document.createElement('span'); badge.className = 'qa-cat-progress'; h3.appendChild(badge); }
      badge.textContent = n + '/' + catItems.length;
      badge.classList.toggle('complete', n === catItems.length);
    });
  }
  function setStudied(item, on){
    if(on) studied[item.dataset.qid] = true; else delete studied[item.dataset.qid];
    save(); refresh();
  }

  items.forEach(function(item){
    item.dataset.qid = hash(questionText(item));
    var btn = item.querySelector('.qa-question');
    var mark = document.createElement('span');
    mark.className = 'qa-check';
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = '✓';
    btn.insertBefore(mark, btn.firstChild);
    var label = document.createElement('label');
    label.className = 'qa-studied';
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.addEventListener('change', function(){ setStudied(item, input.checked); });
    label.appendChild(input);
    label.appendChild(document.createTextNode(' Mark as studied'));
    item.querySelector('.qa-answer-inner').appendChild(label);
  });
  var reset = document.getElementById('qaResetProgress');
  if(reset) reset.addEventListener('click', function(){
    if(!window.confirm('Clear your studied progress on this device?')) return;
    studied = {}; save(); refresh();
  });
  refresh();

  // ---------- flashcards ----------
  var section = document.getElementById('flashcards');
  var start = document.getElementById('fcStart');
  var list = document.querySelector('.prose.article-content');
  if(!section || !start || !list) return;
  var card = document.getElementById('fcCard');
  var qEl = document.getElementById('fcQ');
  var aEl = document.getElementById('fcA');
  var catEl = document.getElementById('fcCat');
  var hint = document.getElementById('fcHint');
  var counter = document.getElementById('fcCount');
  var onlyNew = document.getElementById('fcUnstudied');
  var empty = document.getElementById('fcEmpty');
  var controls = section.querySelector('.fc-controls');
  var deck = [], pos = 0, active = false;

  function visibleItems(){
    return items.filter(function(item){
      var cat = item.closest('.qa-category');
      return !item.hidden && cat && !cat.hidden;
    });
  }
  function build(){
    deck = visibleItems();
    if(deck.length === 0) deck = items.slice();
    if(onlyNew.checked) deck = deck.filter(function(i){ return !studied[i.dataset.qid]; });
    pos = 0;
    show();
  }
  function show(){
    var none = deck.length === 0;
    empty.hidden = !none;
    card.hidden = none;
    controls.hidden = none;
    if(none){ counter.textContent = 'No cards'; return; }
    var item = deck[pos];
    var cat = item.closest('.qa-category');
    var h3 = cat ? cat.querySelector('h3') : null;
    var catName = '';
    if(h3){
      var c = h3.cloneNode(true);
      var b = c.querySelector('.qa-cat-progress'); if(b) b.remove();
      catName = c.textContent.trim();
    }
    catEl.textContent = catName;
    var lvl = item.getAttribute('data-level') || 'intermediate';
    card.setAttribute('data-level', lvl);
    qEl.innerHTML = questionText(item);
    var ans = item.querySelector('.qa-answer-inner').cloneNode(true);
    var lab = ans.querySelector('.qa-studied'); if(lab) lab.remove();
    var askBox = ans.querySelector('.qa-ask'); if(askBox) askBox.remove();
    aEl.innerHTML = ans.innerHTML;
    aEl.hidden = true;
    card.classList.remove('flipped');
    card.classList.toggle('studied', !!studied[item.dataset.qid]);
    hint.textContent = 'Click the card or press Space to see the answer';
    counter.textContent = 'Card ' + (pos + 1) + ' of ' + deck.length;
  }
  function flip(){
    var open = aEl.hidden;
    aEl.hidden = !open;
    card.classList.toggle('flipped', open);
    hint.textContent = open ? 'Click again to hide the answer' : 'Click the card or press Space to see the answer';
  }
  function move(step){
    if(!deck.length) return;
    pos = (pos + step + deck.length) % deck.length;
    show();
  }
  function got(){
    if(!deck.length) return;
    setStudied(deck[pos], true);
    if(onlyNew.checked){
      deck.splice(pos, 1);
      if(pos >= deck.length) pos = 0;
      show();
    } else {
      move(1);
    }
  }
  function open(){
    active = true;
    section.hidden = false;
    list.hidden = true;
    start.textContent = 'Back to list';
    build();
    section.scrollIntoView({behavior: 'smooth', block: 'start'});
    card.focus({preventScroll: true});
  }
  function close(){
    active = false;
    section.hidden = true;
    list.hidden = false;
    start.textContent = 'Flashcards';
  }
  start.addEventListener('click', function(){ if(active) close(); else open(); });
  document.getElementById('fcExit').addEventListener('click', close);
  document.getElementById('fcPrev').addEventListener('click', function(){ move(-1); });
  document.getElementById('fcNext').addEventListener('click', function(){ move(1); });
  document.getElementById('fcAgain').addEventListener('click', function(){ move(1); });
  document.getElementById('fcGot').addEventListener('click', got);
  document.getElementById('fcShuffle').addEventListener('click', function(){
    for(var i = deck.length - 1; i > 0; i--){
      var j = Math.floor(Math.random() * (i + 1));
      var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    pos = 0;
    show();
  });
  onlyNew.addEventListener('change', build);
  card.addEventListener('click', function(e){
    if(e.target.closest('a, pre')) return;
    flip();
  });
  document.addEventListener('keydown', function(e){
    if(!active) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if(tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'button') return;
    if(e.key === ' ' || e.key === 'Enter'){ e.preventDefault(); flip(); }
    else if(e.key === 'ArrowRight'){ move(1); }
    else if(e.key === 'ArrowLeft'){ move(-1); }
    else if(e.key === 'g' || e.key === 'G'){ got(); }
  });
  document.querySelectorAll('.filter-tabs .filter-tab').forEach(function(tab){
    tab.addEventListener('click', function(){ if(active) build(); });
  });
  var qs = document.getElementById('qaSearch');
  if(qs) qs.addEventListener('input', function(){ if(active) build(); });
})();
