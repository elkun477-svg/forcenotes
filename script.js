(function(){
  var toggle = document.getElementById('menuToggle');
  var menu = document.getElementById('mobile-menu');
  if(toggle && menu){
    toggle.addEventListener('click', function(){
      var open = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menu.querySelectorAll('a').forEach(function(a){
      a.addEventListener('click', function(){
        menu.classList.remove('open');
        toggle.setAttribute('aria-expanded','false');
      });
    });
  }

  var form = document.getElementById('subForm');
  var confirmEl = document.getElementById('subConfirm');
  if(form){
    var cfg = window.FN_CONFIG || {};
    var note = document.querySelector('.sub-note');
    function showDone(msg){
      if(msg && confirmEl){ confirmEl.lastChild.textContent = ' ' + msg; }
      confirmEl.classList.add('show');
      form.reset();
    }
    function viaMail(email){
      var to = cfg.subscribeEmail || '';
      var url = 'mailto:' + to + '?subject=' + encodeURIComponent('Subscribe me to ForceNotes') + '&body=' + encodeURIComponent('Please add this address to the weekly notes list: ' + email);
      window.location.href = url;
      showDone('Your email app should open with a ready-to-send message. Press send to finish subscribing.');
    }
    if(cfg.subscribeMode === 'mailto' && note){ note.textContent = 'Subscribing opens an email to the author. One click to unsubscribe.'; }
    form.addEventListener('submit', function(e){
      e.preventDefault();
      var emailInput = document.getElementById('subEmail');
      if(!emailInput.value || !emailInput.checkValidity()) return;
      var email = emailInput.value;
      if(cfg.subscribeMode === 'mailto'){ viaMail(email); return; }
      if(cfg.subscribeMode === 'endpoint' && cfg.subscribeEndpoint){
        fetch(cfg.subscribeEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify({ email: email }) })
          .then(function(r){ if(!r.ok) throw new Error('bad'); showDone(); })
          .catch(function(){ viaMail(email); });
        return;
      }
      var body = new URLSearchParams(new FormData(form)).toString();
      fetch('/', { method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: body })
        .then(function(r){ if(!r.ok) throw new Error('bad'); showDone(); })
        .catch(function(){ viaMail(email); });
    });
  }
})();

var SEARCH_INDEX = [
  {title:"ForceNotes home", page:"Home", url:"index.html"},
  {title:"Salesforce interview questions", page:"Interview Prep", url:"interview-questions.html"},
  {title:"Try it yourself: HTML, CSS and JavaScript playground", page:"Playground", url:"playground.html"},
  {title:"Apex design patterns and SOLID principles", page:"Design patterns", url:"design-patterns.html"},
  {title:"SOLID principles with Apex examples", page:"Design patterns", url:"design-patterns.html#solid"},
  {title:"Singleton pattern in Apex", page:"Design patterns", url:"design-patterns.html#singleton"},
  {title:"Factory pattern in Apex", page:"Design patterns", url:"design-patterns.html#factory"},
  {title:"Builder pattern in Apex", page:"Design patterns", url:"design-patterns.html#builder"},
  {title:"Strategy pattern in Apex", page:"Design patterns", url:"design-patterns.html#strategy"},
  {title:"Observer pattern in Apex", page:"Design patterns", url:"design-patterns.html#observer"},
  {title:"Decorator pattern in Apex", page:"Design patterns", url:"design-patterns.html#decorator"},
  {title:"Facade pattern in Apex", page:"Design patterns", url:"design-patterns.html#facade"},
  {title:"Trigger handler pattern", page:"Design patterns", url:"design-patterns.html#trigger-handler"},
  {title:"Unit of Work pattern", page:"Design patterns", url:"design-patterns.html#unit-of-work"},
  {title:"All trending articles (archive)", page:"Trending", url:"trending-archive.html"},
  {title:"What Winter '27 Actually Means For Your Monday Morning", page:"Trending", url:"trending-1.html"},
  {title:"Salesforce Says AI Replaces the UI. Should You Panic?", page:"Trending", url:"trending-2.html"},
  {title:"Salesforce Data Meets Claude: Meet Claudeforce", page:"Trending", url:"trending-3.html"},
  {title:"Admin or Developer? In 2026, the Line Just Got Blurrier", page:"Trending", url:"trending-4.html"},
  {title:"5 Salesforce Certifications Actually Worth Your Time Right Now", page:"Trending", url:"trending-5.html"},
  {title:"Salesforce Just Bought an AI That Watches Your Dashboards For You", page:"Trending", url:"trending-6.html"},
  {title:"Agentforce Voice Learns to Say \"Hola\" (And Five Other Languages)", page:"Trending", url:"trending-7.html"},
  {title:"The Winter '27 Security Change That Could Quietly Break Your Integrations", page:"Trending", url:"trending-8.html"},
  {title:"Platform & CRM basics", page:"Pillar", url:"platform-crm-basics.html"},
  {title:"Data model & relationships", page:"Pillar", url:"data-model-relationships.html"},
  {title:"Security & sharing model", page:"Pillar", url:"security-sharing.html"},
  {title:"Automation, clicks not code", page:"Pillar", url:"automation.html"},
  {title:"Apex & development", page:"Pillar", url:"apex-development.html"},
  {title:"Architecture & integration", page:"Pillar", url:"architecture-integration.html"},
  {title:"Apex triggers", page:"Apex & development", url:"apex-development.html#apex-triggers"},
  {title:"SOQL and SOSL", page:"Apex & development", url:"apex-development.html#soql-sosl"},
  {title:"Governor limits", page:"Apex & development", url:"apex-development.html#governor-limits"},
  {title:"Lightning Web Components", page:"Apex & development", url:"apex-development.html#lwc"},
  {title:"REST vs SOAP APIs", page:"Architecture & integration", url:"architecture-integration.html#integration-patterns"},
  {title:"Data Loader and ETL", page:"Architecture & integration", url:"architecture-integration.html#data-loader"},
  {title:"Deployment: change sets vs CI/CD", page:"Architecture & integration", url:"architecture-integration.html#change-management"},
  {title:"Multi-org strategy", page:"Architecture & integration", url:"architecture-integration.html#multi-org"},
  {title:"Why declarative comes first", page:"Automation", url:"automation.html#why-declarative"},
  {title:"Flow Builder", page:"Automation", url:"automation.html#flow-builder"},
  {title:"Validation rules", page:"Automation", url:"automation.html#validation-rules"},
  {title:"Approval processes", page:"Automation", url:"automation.html#approval-processes"},
  {title:"A note on automation limits", page:"Automation", url:"automation.html#automation-limits"},
  {title:"Records connect the same way, every time", page:"Data model & relationships", url:"data-model-relationships.html#records-connect"},
  {title:"Lookup vs Master-Detail", page:"Data model & relationships", url:"data-model-relationships.html#lookup-master-detail"},
  {title:"Record types and page layouts", page:"Data model & relationships", url:"data-model-relationships.html#record-types"},
  {title:"Schema Builder", page:"Data model & relationships", url:"data-model-relationships.html#schema-builder"},
  {title:"What a CRM is actually for", page:"Platform & CRM basics", url:"platform-crm-basics.html#crm-basics"},
  {title:"Objects: the noun of the platform", page:"Platform & CRM basics", url:"platform-crm-basics.html#objects"},
  {title:"Fields and data types", page:"Platform & CRM basics", url:"platform-crm-basics.html#fields"},
  {title:"Finding your way around Setup", page:"Platform & CRM basics", url:"platform-crm-basics.html#setup"},
  {title:"Reports and dashboards", page:"Platform & CRM basics", url:"platform-crm-basics.html#reports-dashboards"},
  {title:"Data management basics", page:"Platform & CRM basics", url:"platform-crm-basics.html#data-management"},
  {title:"The layered model, in the order it's evaluated", page:"Security & sharing model", url:"security-sharing.html#security-model"},
  {title:"Profiles vs permission sets", page:"Security & sharing model", url:"security-sharing.html#profiles-permsets"},
  {title:"Field-level security", page:"Security & sharing model", url:"security-sharing.html#field-level-security"}
];

(function(){
  var toggle = document.getElementById('searchToggle');
  var overlay = document.getElementById('searchOverlay');
  var input = document.getElementById('searchInput');
  var results = document.getElementById('searchResults');
  if(!toggle || !overlay || !input || !results) return;

  function render(query){
    var q = query.trim().toLowerCase();
    results.innerHTML = '';
    if(!q) return;
    var matches = SEARCH_INDEX.filter(function(item){
      return item.title.toLowerCase().indexOf(q) !== -1 || item.page.toLowerCase().indexOf(q) !== -1;
    }).slice(0, 8);
    if(matches.length === 0){
      var empty = document.createElement('div');
      empty.className = 'search-empty';
      empty.textContent = 'No results for "' + query + '"';
      results.appendChild(empty);
      return;
    }
    matches.forEach(function(item){
      var a = document.createElement('a');
      a.href = item.url;
      var titleEl = document.createElement('span');
      titleEl.textContent = item.title;
      var pageEl = document.createElement('span');
      pageEl.className = 'res-page';
      pageEl.textContent = item.page;
      a.appendChild(titleEl);
      a.appendChild(pageEl);
      results.appendChild(a);
    });
  }

  function openSearch(){
    overlay.hidden = false;
    input.value = '';
    results.innerHTML = '';
    setTimeout(function(){ input.focus(); }, 0);
  }
  function closeSearch(){
    overlay.hidden = true;
  }

  toggle.addEventListener('click', openSearch);
  overlay.addEventListener('click', function(e){ if(e.target === overlay) closeSearch(); });
  input.addEventListener('input', function(){ render(input.value); });
  document.addEventListener('keydown', function(e){
    if((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)){
      e.preventDefault();
      var hero = document.getElementById('heroSearch');
      if(hero){ hero.focus(); hero.select(); } else { openSearch(); }
    }
    if(e.key === 'Escape' && !overlay.hidden){ closeSearch(); }
  });
})();

(function(){
  var fill = document.getElementById('readingProgressFill');
  var prose = document.querySelector('.prose');
  if(!fill || !prose) return;
  function update(){
    var rect = prose.getBoundingClientRect();
    var total = prose.offsetHeight - window.innerHeight;
    var scrolled = -rect.top;
    var pct = total > 0 ? Math.min(100, Math.max(0, (scrolled / total) * 100)) : 0;
    fill.style.width = pct + '%';
  }
  window.addEventListener('scroll', update, {passive: true});
  window.addEventListener('resize', update);
  update();
})();

(function(){
  var tabs = document.querySelectorAll('.filter-tab');
  var cards = document.querySelectorAll('.article-grid .article');
  if(!tabs.length || !cards.length) return;
  tabs.forEach(function(tab){
    tab.addEventListener('click', function(){
      tabs.forEach(function(t){ t.classList.remove('active'); });
      tab.classList.add('active');
      var filter = tab.getAttribute('data-filter');
      cards.forEach(function(card){
        var match = filter === 'all' || card.getAttribute('data-category') === filter;
        card.hidden = !match;
      });
    });
  });
})();

(function(){
  var list = document.getElementById('archiveList');
  var count = document.getElementById('archiveCount');
  if(!list || !count) return;
  count.textContent = list.querySelectorAll('.archive-item').length;
})();

(function(){
  var items = document.querySelectorAll('.qa-item');
  if(!items.length) return;
  items.forEach(function(item){
    var btn = item.querySelector('.qa-question');
    btn.addEventListener('click', function(){
      item.classList.toggle('open');
    });
  });

  var tabs = document.querySelectorAll('.filter-tabs .filter-tab');
  var categories = document.querySelectorAll('.qa-category');
  var search = document.getElementById('qaSearch');
  var countEl = document.getElementById('qaCount');
  var filter = 'all';
  var level = 'all';
  var levelTabs = document.querySelectorAll('.level-tab');
  var emptyMsg = document.createElement('div');
  emptyMsg.className = 'qa-empty';
  emptyMsg.hidden = true;
  emptyMsg.innerHTML = '<img class="mascot mascot-sm" src="null-bug-confused.svg" alt="" aria-hidden="true"/><p><strong>Null could not find a match.</strong> Try a shorter keyword, like "flow" or "batch".</p>';
  if(categories.length){ categories[categories.length - 1].parentNode.appendChild(emptyMsg); }

  function apply(){
    var q = search ? search.value.trim().toLowerCase() : '';
    var shown = 0, total = items.length;
    categories.forEach(function(cat){
      var inFilter = filter === 'all' || cat.getAttribute('data-category') === filter;
      var catItems = cat.querySelectorAll('.qa-item');
      var visible = 0;
      catItems.forEach(function(item){
        var lv = item.getAttribute('data-level') || 'intermediate';
        var match = (level === 'all' || lv === level) && (!q || item.textContent.toLowerCase().indexOf(q) !== -1);
        item.hidden = !match;
        if(match) visible++;
      });
      var show = inFilter && (catItems.length ? visible > 0 : !q);
      cat.hidden = !show;
      if(show) shown += visible;
    });
    if(countEl){
      countEl.textContent = (q || filter !== 'all' || level !== 'all') && filter !== 'cat-cheatsheets' ? 'Showing ' + shown + ' of ' + total : total + ' questions';
    }
    emptyMsg.hidden = !((q || level !== 'all') && shown === 0);
  }

  tabs.forEach(function(tab){
    tab.addEventListener('click', function(){
      tabs.forEach(function(t){ t.classList.remove('active'); });
      tab.classList.add('active');
      filter = tab.getAttribute('data-filter');
      apply();
    });
  });
  levelTabs.forEach(function(tab){
    tab.addEventListener('click', function(){
      levelTabs.forEach(function(t){ t.classList.remove('active'); });
      tab.classList.add('active');
      level = tab.getAttribute('data-level');
      try { var u = new URL(location.href); if(level === 'all') u.searchParams.delete('level'); else u.searchParams.set('level', level); history.replaceState(null, '', u); } catch(e){}
      apply();
    });
  });
  var presetLevel = new URLSearchParams(location.search).get('level');
  if(presetLevel && ['beginner','intermediate','advanced'].indexOf(presetLevel) !== -1){
    level = presetLevel;
    levelTabs.forEach(function(t){ t.classList.toggle('active', t.getAttribute('data-level') === level); });
    apply();
  }
  if(search){
    search.addEventListener('input', apply);
    var preset = new URLSearchParams(location.search).get('q');
    if(preset){ search.value = preset; apply(); }
  }
})();

(function(){
  var tocLinks = document.querySelectorAll('.toc-card a');
  var headings = document.querySelectorAll('.prose h2[id]');
  if(!tocLinks.length || !headings.length || !('IntersectionObserver' in window)) return;
  var map = {};
  tocLinks.forEach(function(a){ map[a.getAttribute('href').slice(1)] = a; });
  var observer = new IntersectionObserver(function(entries){
    entries.forEach(function(entry){
      var link = map[entry.target.id];
      if(!link || !entry.isIntersecting) return;
      tocLinks.forEach(function(a){ a.classList.remove('active'); });
      link.classList.add('active');
    });
  }, {rootMargin: '-15% 0px -70% 0px'});
  headings.forEach(function(h){ observer.observe(h); });
})();

(function(){
  var btn = document.getElementById('themeToggle');
  if(!btn) return;
  var root = document.documentElement;
  function sync(){
    var light = root.getAttribute('data-theme') === 'light';
    btn.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
    var meta = document.querySelector('meta[name="theme-color"]');
    if(meta) meta.setAttribute('content', light ? '#F6F8FA' : '#0B0E14');
  }
  btn.addEventListener('click', function(){
    var light = root.getAttribute('data-theme') !== 'light';
    if(light){ root.setAttribute('data-theme','light'); } else { root.removeAttribute('data-theme'); }
    try { localStorage.setItem('fn-theme', light ? 'light' : 'dark'); } catch(e){}
    sync();
  });
  sync();
})();

(function(){
  var groups = document.querySelectorAll('.nav-group');
  if(!groups.length) return;
  function closeAll(except){
    groups.forEach(function(g){
      if(g === except) return;
      g.classList.remove('open');
      g.querySelector('.nav-trigger').setAttribute('aria-expanded','false');
    });
  }
  groups.forEach(function(g){
    var t = g.querySelector('.nav-trigger');
    t.addEventListener('click', function(e){
      e.stopPropagation();
      var open = !g.classList.contains('open');
      closeAll(g);
      g.classList.toggle('open', open);
      t.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  });
  document.addEventListener('click', function(){ closeAll(); });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeAll(); });
})();

(function(){
  var input = document.getElementById('heroSearch');
  var box = document.getElementById('heroResults');
  if(!input || !box || typeof SEARCH_INDEX === 'undefined') return;
  function render(){
    var q = input.value.trim();
    var lq = q.toLowerCase();
    box.innerHTML = '';
    if(!q){ box.hidden = true; return; }
    var matches = SEARCH_INDEX.filter(function(item){
      return item.title.toLowerCase().indexOf(lq) !== -1 || item.page.toLowerCase().indexOf(lq) !== -1;
    }).slice(0, 6);
    matches.forEach(function(item){
      var a = document.createElement('a');
      a.href = item.url;
      var t = document.createElement('span'); t.textContent = item.title;
      var p = document.createElement('span'); p.className = 'res-page'; p.textContent = item.page;
      a.appendChild(t); a.appendChild(p); box.appendChild(a);
    });
    var qa = document.createElement('a');
    qa.href = 'interview-questions.html?q=' + encodeURIComponent(q);
    var t2 = document.createElement('span'); t2.className = 'res-qa'; t2.textContent = 'Search interview questions for "' + q + '"';
    var p2 = document.createElement('span'); p2.className = 'res-page'; p2.textContent = 'Enter ↵';
    qa.appendChild(t2); qa.appendChild(p2); box.appendChild(qa);
    box.hidden = false;
  }
  input.addEventListener('input', render);
  input.addEventListener('focus', render);
  input.addEventListener('keydown', function(e){
    if(e.key === 'Enter'){
      e.preventDefault();
      var first = box.querySelector('a');
      var qaLink = box.querySelector('a:last-child');
      if(qaLink) location.href = qaLink.href; else if(first) location.href = first.href;
    }
    if(e.key === 'Escape'){ box.hidden = true; input.blur(); }
  });
  document.addEventListener('click', function(e){
    if(!box.contains(e.target) && e.target !== input) box.hidden = true;
  });
})();

(function(){
  var KEYWORDS = 'abstract|class|else|enum|extends|final|finally|for|if|implements|instanceof|interface|new|override|private|protected|public|return|static|super|switch|this|throw|try|catch|virtual|void|when|while|do|break|continue|global|inherited|sharing|with|without|on|trigger|before|after|insert|update|delete|undelete|upsert|import|export|from|const|let|var|function|async|await|default|get|set|as|user|mode';
  var TYPES = 'Integer|String|Boolean|Decimal|Double|Long|Date|Datetime|Id|Object|List|Set|Map|Exception|Iterator|Iterable|Comparable|Assert|System|Math|JSON|Type|SObject|Database|Account|Contact|Lead|Opportunity|Case|Trigger|Test|Schema|HttpRequest|HttpResponse|Http|Queueable|Schedulable';
  var RE = new RegExp(
    '(//[^\\n]*|/\\*[\\s\\S]*?\\*/)' +
    '|(\'(?:\\\\.|[^\'\\\\\\n])*\'|"(?:\\\\.|[^"\\\\\\n])*")' +
    '|(@[A-Za-z]+)' +
    '|\\b(' + KEYWORDS + '|true|false|null)\\b' +
    '|\\b(' + TYPES + ')\\b' +
    '|\\b(\\d+(?:\\.\\d+)?)\\b', 'gi');
  function esc(s){ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function highlight(text){
    var out = '', last = 0, m;
    RE.lastIndex = 0;
    while((m = RE.exec(text))){
      out += esc(text.slice(last, m.index));
      var cls = m[1] ? 'tk-c' : m[2] ? 'tk-s' : m[3] ? 'tk-a' : m[4] ? 'tk-k' : m[5] ? 'tk-t' : 'tk-n';
      out += '<span class="' + cls + '">' + esc(m[0]) + '</span>';
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }
  function run(){
    var blocks = document.querySelectorAll('pre code');
    blocks.forEach(function(code){
      if(code.dataset.hl || code.closest('.CodeMirror')) return;
      code.dataset.hl = '1';
      code.innerHTML = highlight(code.textContent);
    });
  }
  window.fnHighlight = run;
  run();
})();
