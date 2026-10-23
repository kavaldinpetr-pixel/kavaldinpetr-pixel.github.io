// «Обсудить сайт»: three quick questions -> a ready message in Telegram (or e-mail).
// Shared by the portfolio page (inlined) and the game (bundled). No server: the message is
// pre-filled into the chat with t.me/<user>?text=… and also copied to the clipboard.
(function () {
  if (window.PetrBrief) return;
  var TG = 'petrk_av', MAIL = 'kavaldinpetr@gmail.com';
  var BIZ = [['auto', 'Автосервис'], ['detailing', 'Детейлинг'], ['salon', 'Салон красоты'], ['other', 'Другое']];
  var NEED = [['landing', 'Лендинг'], ['booking', 'Сайт с онлайн-записью'], ['bot', 'Telegram-бот'], ['redesign', 'Новый дизайн сайта'], ['unsure', 'Пока не знаю']];
  var WHEN = [['asap', 'Как можно скорее'], ['month', 'В течение месяца'], ['later', 'Не срочно']];
  var NEED_TXT = { landing: 'лендинг', booking: 'сайт с онлайн-записью', bot: 'Telegram-бот', redesign: 'новый дизайн сайта', unsure: 'пока не знаю, нужен совет' };
  var WHEN_TXT = { asap: 'как можно скорее', month: 'в течение месяца', later: 'не срочно' };

  var CSS = [
    '.brief{width:min(560px,calc(100vw - 24px));max-height:calc(100dvh - 24px);margin:auto;padding:0;border:0;border-radius:18px;background:var(--brief-bg,#0E1322);color:var(--brief-ink,#EEF1F7);box-shadow:0 0 0 1px rgba(255,255,255,.08),0 40px 90px -20px rgba(0,0,0,.8);font:400 15px/1.45 var(--brief-font-t,system-ui,sans-serif);overflow:auto;overscroll-behavior:contain}',
    '.brief::backdrop{background:rgba(4,4,12,.62);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px)}',
    '.brief[open]{animation:briefIn .32s cubic-bezier(.2,.8,.2,1)}',
    '@keyframes briefIn{from{opacity:0;transform:translateY(18px) scale(.98)}to{opacity:1;transform:none}}',
    '.brief-in{position:relative;display:grid;gap:18px;padding:26px 24px 22px}',
    '.brief h2{margin:0;padding-right:40px;font:800 40px/.95 var(--brief-font-h,sans-serif);letter-spacing:-.005em}',
    '.brief-lead{margin:-6px 0 0;color:var(--brief-mute,#98A2B8);font-size:14px}',
    '.brief-x{position:absolute;top:14px;right:14px;width:36px;height:36px;border:0;border-radius:50%;background:rgba(255,255,255,.08);color:inherit;font:400 24px/1 system-ui,sans-serif;cursor:pointer}',
    '.brief-x:hover{background:rgba(255,255,255,.16)}',
    '.brief fieldset{margin:0;padding:0;border:0;min-width:0}',
    '.brief legend{padding:0;margin:0 0 8px;font-weight:600;font-size:14px}',
    '.brief legend small{margin-left:6px;font-weight:400;color:var(--brief-mute,#98A2B8)}',
    '.brief-chips{display:flex;flex-wrap:wrap;gap:8px}',
    '.brief-chips label{position:relative;cursor:pointer}',
    '.brief-chips input{position:absolute;opacity:0;width:1px;height:1px}',
    '.brief-chips span{display:block;padding:8px 13px;border-radius:999px;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.18);font-size:14px;line-height:1.2;transition:background-color .2s,box-shadow .2s,color .2s}',
    '.brief-chips label:hover span{box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.4)}',
    '.brief-chips input:checked+span{background:var(--brief-ink,#EEF1F7);color:var(--brief-bg,#0E1322);box-shadow:none}',
    '.brief-chips input:focus-visible+span{outline:2px solid var(--brief-accent,#FF4FA0);outline-offset:2px}',
    '.brief-f{display:grid;gap:6px;font-size:14px;font-weight:600}',
    '.brief-f input,.brief-f textarea{width:100%;box-sizing:border-box;padding:10px 12px;border:0;border-radius:10px;background:rgba(255,255,255,.07);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);color:inherit;font:400 15px/1.35 var(--brief-font-t,system-ui,sans-serif);resize:vertical}',
    '.brief-f input::placeholder,.brief-f textarea::placeholder{color:var(--brief-mute,#98A2B8);opacity:.8}',
    '.brief-f input:focus,.brief-f textarea:focus{outline:none;box-shadow:inset 0 0 0 1.5px var(--brief-accent,#FF4FA0)}',
    '.brief-prev{display:grid;gap:6px;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.04);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}',
    '.brief-prev>span{color:var(--brief-mute,#98A2B8);font-size:12px;text-transform:uppercase;letter-spacing:.08em}',
    '.brief-prev pre{margin:0;white-space:pre-wrap;word-break:break-word;font:400 13px/1.45 var(--brief-font-t,system-ui,sans-serif);color:var(--brief-ink,#EEF1F7)}',
    '.brief-act{display:flex;flex-wrap:wrap;align-items:center;gap:10px 18px}',
    '.brief-go{display:inline-flex;align-items:center;gap:9px;padding:13px 22px;border-radius:999px;background:var(--brief-accent,#FF4FA0);color:var(--brief-on-accent,#0A0D16);font-weight:700;font-size:16px;text-decoration:none;box-shadow:0 12px 30px -12px var(--brief-accent,#FF4FA0);transition:transform .2s,box-shadow .2s}',
    '.brief-go:hover{transform:translateY(-1px);box-shadow:0 16px 34px -12px var(--brief-accent,#FF4FA0)}',
    '.brief-go svg{width:20px;height:20px;fill:currentColor}',
    '.brief-mail{color:inherit;font-size:15px;text-underline-offset:4px}',
    '.brief-note{margin:0;color:var(--brief-mute,#98A2B8);font-size:13px}',
    '.brief-note a{color:inherit}',
    '.brief-ok{margin:0;color:var(--brief-ink,#EEF1F7);font-size:13px}',
    '@media (max-width:560px){.brief{width:100vw;max-width:100vw;max-height:92dvh;margin:auto 0 0;border-radius:18px 18px 0 0}.brief[open]{animation-name:briefUp}.brief-in{padding:22px 18px calc(18px + env(safe-area-inset-bottom))}.brief h2{font-size:34px}}',
    '@keyframes briefUp{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}',
    '@media (prefers-reduced-motion:reduce){.brief[open]{animation:none}}'
  ].join('\n');

  var dlg = null, form = null, pre = null, go = null, mail = null, ok = null, source = 'page';
  var TG_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.5 4.3 2.9 11.5c-1.3.5-1.3 1.2-.2 1.6l4.8 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.5c.3-1.3-.5-1.8-1.4-1.6zM9.4 14.4l8.9-5.6c.4-.3.8-.1.5.2l-7.6 6.9-.3 3.2-1.5-4.7z"/></svg>';

  function chips(type, name, list) {
    return '<div class="brief-chips">' + list.map(function (o) {
      return '<label><input type="' + type + '" name="' + name + '" value="' + o[0] + '"><span>' + o[1] + '</span></label>';
    }).join('') + '</div>';
  }
  function build() {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    dlg = document.createElement('dialog');
    dlg.className = 'brief';
    dlg.setAttribute('aria-labelledby', 'briefT');
    dlg.innerHTML = '<form class="brief-in" method="dialog">' +
      '<button class="brief-x" type="button" aria-label="Закрыть">×</button>' +
      '<h2 id="briefT">Обсудим ваш сайт</h2>' +
      '<p class="brief-lead">Три вопроса — и откроется Telegram с готовым сообщением. Отправите его сами.</p>' +
      '<fieldset><legend>Ваш бизнес</legend>' + chips('radio', 'biz', BIZ) + '</fieldset>' +
      '<fieldset><legend>Что нужно<small>можно несколько</small></legend>' + chips('checkbox', 'need', NEED) + '</fieldset>' +
      '<fieldset><legend>Когда</legend>' + chips('radio', 'when', WHEN) + '</fieldset>' +
      '<label class="brief-f"><span>Название или ссылка на карты</span><input name="name" type="text" maxlength="90" autocomplete="organization" placeholder="Необязательно"></label>' +
      '<label class="brief-f"><span>Что ещё важно</span><textarea name="note" rows="2" maxlength="600" placeholder="Необязательно"></textarea></label>' +
      '<div class="brief-prev"><span>Сообщение</span><pre></pre></div>' +
      '<div class="brief-act"><a class="brief-go" href="#" target="_blank" rel="noopener">' + TG_ICON + 'Написать в Telegram</a><a class="brief-mail" href="#">Отправить на почту</a></div>' +
      '<p class="brief-ok" role="status" aria-live="polite" hidden></p>' +
      '<p class="brief-note">Telegram <a href="https://t.me/' + TG + '" target="_blank" rel="noopener">@' + TG + '</a> · ' + MAIL + '</p>' +
      '</form>';
    document.body.appendChild(dlg);
    form = dlg.querySelector('form'); pre = dlg.querySelector('pre');
    go = dlg.querySelector('.brief-go'); mail = dlg.querySelector('.brief-mail'); ok = dlg.querySelector('.brief-ok');
    form.addEventListener('submit', function (e) { e.preventDefault(); }); // Enter in a field must not close it
    dlg.querySelector('.brief-x').addEventListener('click', close);
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    go.addEventListener('click', function () {
      var text = message();
      try { navigator.clipboard && navigator.clipboard.writeText(text).catch(function () {}); } catch (e) { /* no clipboard */ }
      ok.hidden = false;
      ok.textContent = 'Открываем Telegram. Если чат откроется пустым, текст уже скопирован — просто вставьте его.';
    });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) close(); }); // tap on the backdrop
    dlg.addEventListener('close', function () { if (window.PetrBrief.onClose) window.PetrBrief.onClose(); });
  }
  function val(name) { var el = form.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : ''; }
  function vals(name) { return Array.prototype.map.call(form.querySelectorAll('input[name="' + name + '"]:checked'), function (el) { return el.value; }); }
  function label(list, v) { for (var i = 0; i < list.length; i++) if (list[i][0] === v) return list[i][1]; return ''; }
  function message() {
    var lines = ['Здравствуйте, Пётр! Хочу обсудить сайт.'];
    var biz = val('biz'), name = form.elements.name.value.trim(), need = vals('need'), when = val('when'), note = form.elements.note.value.trim();
    var b = biz ? label(BIZ, biz) : '';
    if (b || name) lines.push('Бизнес: ' + [b, name].filter(Boolean).join(', '));
    if (need.length) lines.push('Нужно: ' + need.map(function (n) { return NEED_TXT[n]; }).join(', '));
    if (when) lines.push('Срок: ' + WHEN_TXT[when]);
    if (note) lines.push('Комментарий: ' + note);
    lines.push(source === 'game' ? '(написал из игры на сайте)' : '(написал с сайта-портфолио)');
    return lines.join('\n');
  }
  function update() {
    var text = message();
    pre.textContent = text;
    go.href = 'https://t.me/' + TG + '?text=' + encodeURIComponent(text);
    mail.href = 'mailto:' + MAIL + '?subject=' + encodeURIComponent('Обсудить сайт') + '&body=' + encodeURIComponent(text);
  }
  function setChecked(name, values) {
    Array.prototype.forEach.call(form.querySelectorAll('input[name="' + name + '"]'), function (el) { el.checked = values.indexOf(el.value) >= 0; });
  }
  // opts: { biz: 'auto'|'detailing'|'salon'|'other', need: ['booking', …], name: 'ICARRA BRAKES', source: 'page'|'game' }
  function open(opts) {
    opts = opts || {};
    if (!dlg) build();
    source = opts.source || source;
    if (opts.biz) setChecked('biz', [opts.biz]);
    if (opts.need) setChecked('need', opts.need);
    if (opts.name && !form.elements.name.value) form.elements.name.value = opts.name;
    ok.hidden = true;
    update();
    if (window.PetrBrief.onOpen) window.PetrBrief.onOpen();
    if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
    var first = form.querySelector('input:checked') || form.querySelector('input');
    if (first && !matchMedia('(pointer: coarse)').matches) first.focus({ preventScroll: true });
  }
  function close() { if (dlg && dlg.open) { if (dlg.close) dlg.close(); else { dlg.removeAttribute('open'); if (window.PetrBrief.onClose) window.PetrBrief.onClose(); } } }
  window.PetrBrief = { open: open, close: close, tg: TG, mail: MAIL, onOpen: null, onClose: null, get isOpen() { return !!(dlg && dlg.open); } };
})();
