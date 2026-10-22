(function(){
  var WEB = window.FN_TEMPLATES || {};
  var APEX = window.FN_APEX_TEMPLATES || {};
  var ALL = {};
  Object.keys(WEB).forEach(function(k){ WEB[k].lang = 'web'; WEB[k].group = 'HTML, CSS and JavaScript'; ALL[k] = WEB[k]; });
  Object.keys(APEX).forEach(function(k){ ALL[k] = APEX[k]; });

  var KEYS = { web: 'forcenotes-playground-v1', apex: 'forcenotes-playground-apex-v1' };
  var LANG_KEY = 'forcenotes-playground-lang';
  var textarea = document.getElementById('pgCode');
  var frame = document.getElementById('pgFrame');
  var consoleEl = document.getElementById('pgConsole');
  var select = document.getElementById('pgTemplate');
  var status = document.getElementById('pgStatus');
  var webPane = document.getElementById('pgWeb');
  var apexPane = document.getElementById('pgApex');
  var apStatus = document.getElementById('apStatus');
  var apOut = document.getElementById('apOut');
  var resultTitle = document.getElementById('pgResultTitle');
  var langBtns = document.querySelectorAll('[data-lang]');
  var editor = null;
  var lang = 'web';
  var current = { web: 'hello', apex: 'apex-hello' };
  var drafts = {};
  var marks = [];

  function safeGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function safeSet(k, v){ try { localStorage.setItem(k, v); return true; } catch(e){ return false; } }
  function getCode(){ return editor ? editor.getValue() : textarea.value; }
  function setCode(v){ if(editor){ editor.setValue(v); } else { textarea.value = v; } }
  function say(msg){ status.textContent = msg; clearTimeout(say.t); say.t = setTimeout(function(){ status.textContent = ''; }, 2600); }
  function encode(str){ return btoa(unescape(encodeURIComponent(str))); }
  function decode(str){ return decodeURIComponent(escape(atob(str))); }

  /* ---------------- Apex syntax mode for CodeMirror */
  function defineApexMode(){
    if(!window.CodeMirror || !CodeMirror.defineMIME) return false;
    function words(s){ var o = {}; s.split(' ').forEach(function(w){ o[w] = true; }); return o; }
    try {
      CodeMirror.defineMIME('text/x-apex', {
        name: 'clike',
        keywords: words('abstract class else enum extends final finally for if implements instanceof interface new override private protected public return static super switch this throw try catch virtual void when while do break continue global inherited sharing with without on get set transient testmethod'),
        types: words('Integer String Boolean Decimal Double Long Date Datetime Id Object List Set Map Exception Iterator Iterable Comparable Assert System Math JSON Type'),
        blockKeywords: words('catch class do else finally for if switch try while enum interface when'),
        defKeywords: words('class interface enum'),
        atoms: words('true false null'),
        typeFirstDefinitions: true,
        hooks: { '@': function(stream){ stream.eatWhile(/[\w]/); return 'meta'; } }
      });
      return true;
    } catch(e){ return false; }
  }

  /* ---------------- Web runner */
  var BRIDGE = '<script>(function(){function send(l,a){try{parent.postMessage({fnConsole:true,level:l,text:Array.prototype.map.call(a,function(x){if(typeof x==="object"){try{return JSON.stringify(x)}catch(e){return String(x)}}return String(x)}).join(" ")},"*")}catch(e){}}' +
    '["log","info","warn","error"].forEach(function(l){var o=console[l];console[l]=function(){send(l,arguments);o.apply(console,arguments)}});' +
    'window.addEventListener("error",function(e){send("error",[e.message+" (line "+e.lineno+")"])});})();<\/script>';
  function withBridge(code){
    if(/<head[^>]*>/i.test(code)) return code.replace(/<head[^>]*>/i, function(m){ return m + BRIDGE; });
    if(/<html[^>]*>/i.test(code)) return code.replace(/<html[^>]*>/i, function(m){ return m + BRIDGE; });
    if(/<!doctype[^>]*>/i.test(code)) return code.replace(/<!doctype[^>]*>/i, function(m){ return m + BRIDGE; });
    return BRIDGE + code;
  }
  function runWeb(){
    consoleEl.innerHTML = '';
    consoleEl.classList.add('empty');
    frame.srcdoc = withBridge(getCode());
  }
  function addConsoleLine(level, text){
    consoleEl.classList.remove('empty');
    var line = document.createElement('div');
    line.className = 'pg-line pg-' + level;
    line.textContent = text;
    consoleEl.appendChild(line);
  }
  window.addEventListener('message', function(e){
    if(e.source !== frame.contentWindow || !e.data || !e.data.fnConsole) return;
    addConsoleLine(e.data.level, e.data.text);
  });

  /* ---------------- Apex runner */
  var worker = null, reqId = 0, timer = null, mainReady = false;
  function killWorker(){ if(worker){ worker.terminate(); worker = null; } }
  function getWorker(){
    if(worker) return worker;
    try {
      worker = new Worker('apex.js');
      worker.onmessage = function(e){
        clearTimeout(timer);
        if(e.data.id !== reqId) return;
        renderApex(e.data.result);
      };
      worker.onerror = function(){
        clearTimeout(timer);
        killWorker();
        runApexOnMain();
      };
      return worker;
    } catch(err){ worker = null; return null; }
  }
  function runApexOnMain(){
    function go(){ try { renderApex(window.ApexLab.run(getCode())); } catch(err){ apStatus.textContent = 'Internal error: ' + err.message; } }
    if(window.ApexLab){ go(); return; }
    var s = document.createElement('script'); s.src = 'apex.js'; s.onload = go;
    s.onerror = function(){ apStatus.textContent = 'Could not load the Apex engine (apex.js).'; };
    document.head.appendChild(s);
  }
  function clearMarks(){
    if(!editor) return;
    marks.forEach(function(l){ editor.removeLineClass(l, 'background', 'pg-err-line'); });
    marks = [];
  }
  function markLine(n){
    if(!editor) return;
    var idx = Math.max(0, Math.min(editor.lineCount() - 1, n - 1));
    editor.addLineClass(idx, 'background', 'pg-err-line');
    marks.push(idx);
  }
  function jumpTo(line, col){
    if(!editor) return;
    editor.focus();
    editor.setCursor({ line: Math.max(0, line - 1), ch: Math.max(0, (col || 1) - 1) });
  }
  function el(tag, cls, text){ var n = document.createElement(tag); if(cls) n.className = cls; if(text !== undefined) n.textContent = text; return n; }
  function renderApex(res){
    clearMarks();
    apOut.innerHTML = '';
    apStatus.className = 'ap-status';
    if(res.errors && res.errors.length){
      apStatus.classList.add('bad');
      apStatus.textContent = 'Compile failed: ' + res.errors.length + (res.errors.length === 1 ? ' error' : ' errors');
      res.errors.forEach(function(er){
        markLine(er.line);
        var row = el('button', 'ap-err');
        row.type = 'button';
        row.appendChild(el('span', 'ap-loc', 'Line ' + er.line + ', column ' + er.col));
        row.appendChild(el('span', 'ap-msg', er.message));
        row.addEventListener('click', function(){ jumpTo(er.line, er.col); });
        apOut.appendChild(row);
      });
      return;
    }
    var hadError = (res.output || []).some(function(o){ return o.k === 'error'; });
    apStatus.classList.add(hadError ? 'warn' : 'good');
    var ms = res.stats && res.stats.ms !== undefined ? ' in ' + res.stats.ms + ' ms' : '';
    apStatus.textContent = hadError ? 'Compiled, but the run stopped with an uncaught exception' + ms : 'Compiled and ran' + ms;
    if(res.info){ apOut.appendChild(el('div', 'ap-info', res.info)); }
    var debugCount = 0;
    (res.output || []).forEach(function(o){
      if(o.k === 'debug'){
        debugCount++;
        var row = el('div', 'ap-line');
        row.appendChild(el('span', 'ap-ln', o.line ? 'L' + o.line : ''));
        row.appendChild(el('span', 'ap-txt', o.text));
        apOut.appendChild(row);
      } else if(o.k === 'error'){
        if(o.line) markLine(o.line);
        var box = el('div', 'ap-exc');
        box.appendChild(el('div', 'ap-exc-head', o.text));
        (o.stack || []).forEach(function(s){ box.appendChild(el('div', 'ap-exc-stack', 'at ' + s)); });
        apOut.appendChild(box);
      } else {
        apOut.appendChild(el('div', 'ap-info', o.text));
      }
    });
    if(!debugCount && !hadError && !res.info){ apOut.appendChild(el('div', 'ap-info', 'No output. Add System.debug(...) to print something.')); }
  }
  function runApex(){
    clearMarks();
    apOut.innerHTML = '';
    apStatus.className = 'ap-status';
    apStatus.textContent = 'Compiling and running...';
    var id = ++reqId;
    var w = getWorker();
    if(!w){ runApexOnMain(); return; }
    clearTimeout(timer);
    timer = setTimeout(function(){
      killWorker();
      apStatus.className = 'ap-status bad';
      apStatus.textContent = 'Stopped after 8 seconds. Your code is probably stuck in an infinite loop.';
    }, 8000);
    w.postMessage({ id: id, code: getCode() });
  }

  function run(){ if(lang === 'apex') runApex(); else runWeb(); }

  /* ---------------- language + templates */
  function setLang(l){
    if(lang === l && editor && !setLang.force) return;
    if(!setLang.force) drafts[lang] = getCode();
    lang = l;
    safeSet(LANG_KEY, l);
    langBtns.forEach(function(b){ var on = b.getAttribute('data-lang') === l; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    webPane.hidden = l === 'apex';
    apexPane.hidden = l !== 'apex';
    resultTitle.textContent = l === 'apex' ? 'Output' : 'Result';
    if(editor){
      var ok = l === 'apex' ? defineApexMode() : true;
      editor.setOption('mode', l === 'apex' ? (ok ? 'text/x-apex' : 'text/x-java') : 'htmlmixed');
      clearMarks();
    }
    document.getElementById('pgFull').hidden = l === 'apex';
    var tpl = ALL[current[l]];
    if(select.value !== current[l]) select.value = current[l];
  }
  function loadTemplate(id){
    var t = ALL[id]; if(!t) return;
    var l = t.lang === 'apex' ? 'apex' : 'web';
    current[l] = id;
    setLang(l);
    select.value = id;
    setCode(t.code);
    run();
  }
  function startFor(l){
    var saved = safeGet(KEYS[l]);
    if(drafts[l] !== undefined) { setCode(drafts[l]); }
    else if(saved) { setCode(saved); }
    else { setCode(ALL[current[l]].code); }
  }
  function switchLang(l){
    if(l === lang) return;
    setLang(l);
    startFor(l);
    run();
  }

  function buildSelect(){
    var groups = {};
    var order = [];
    Object.keys(ALL).forEach(function(id){
      var g = ALL[id].group || 'Other';
      if(!groups[g]){ groups[g] = document.createElement('optgroup'); groups[g].label = g; order.push(g); }
      var o = document.createElement('option'); o.value = id; o.textContent = ALL[id].title; groups[g].appendChild(o);
    });
    order.forEach(function(g){ select.appendChild(groups[g]); });
  }

  function init(){
    buildSelect();
    var cmReady = !!window.CodeMirror;
    if(cmReady){
      defineApexMode();
      editor = CodeMirror.fromTextArea(textarea, {
        mode: 'htmlmixed', theme: 'forcenotes', lineNumbers: true, lineWrapping: true, tabSize: 4, indentWithTabs: false,
        extraKeys: { 'Ctrl-Enter': run, 'Cmd-Enter': run, Tab: function(cm){ cm.replaceSelection('    ', 'end'); } }
      });
      editor.on('change', function(){ if(marks.length) clearMarks(); });
    } else {
      textarea.addEventListener('keydown', function(e){ if((e.ctrlKey || e.metaKey) && e.key === 'Enter'){ e.preventDefault(); run(); } });
    }

    var params = new URLSearchParams(location.search);
    var hash = location.hash;
    var m;
    if((m = hash.match(/^#apex=(.+)$/))){
      try { setLang.force = true; setLang('apex'); setLang.force = false; setCode(decode(m[1])); run(); return; } catch(e){}
    }
    if((m = hash.match(/^#code=(.+)$/))){
      try { setLang.force = true; setLang('web'); setLang.force = false; setCode(decode(m[1])); run(); return; } catch(e){}
    }
    var t = params.get('t');
    if(t && ALL[t]){ setLang.force = true; setLang(ALL[t].lang === 'apex' ? 'apex' : 'web'); setLang.force = false; loadTemplate(t); return; }
    var wantLang = params.get('lang') === 'apex' ? 'apex' : (safeGet(LANG_KEY) === 'apex' ? 'apex' : 'web');
    setLang.force = true; setLang(wantLang); setLang.force = false;
    startFor(wantLang);
    run();
  }

  document.getElementById('pgRun').addEventListener('click', run);
  langBtns.forEach(function(b){ b.addEventListener('click', function(){ switchLang(b.getAttribute('data-lang')); }); });
  select.addEventListener('change', function(){ if(select.value) loadTemplate(select.value); });
  document.getElementById('pgReset').addEventListener('click', function(){
    var t = ALL[current[lang]];
    if(t){ setCode(t.code); run(); say('Reset to the original example'); }
  });
  document.getElementById('pgSave').addEventListener('click', function(){
    say(safeSet(KEYS[lang], getCode()) ? 'Saved in this browser' : 'Could not save (storage blocked)');
  });
  document.getElementById('pgShare').addEventListener('click', function(){
    var url = location.origin + location.pathname + '#' + (lang === 'apex' ? 'apex' : 'code') + '=' + encode(getCode());
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(url).then(function(){ say('Share link copied'); }, function(){ say('Copy failed'); });
    } else { say('Copy not supported here'); }
  });
  document.getElementById('pgClearConsole').addEventListener('click', function(){ consoleEl.innerHTML = ''; consoleEl.classList.add('empty'); });
  document.getElementById('pgFull').addEventListener('click', function(){ document.getElementById('pgLayout').classList.toggle('pg-wide'); });

  init();
})();
