'use strict';
/* Mr Hassan · components/modals.js — messages and dialogs: toast, the error message, modal, choice and confirm, the ONE delete confirmation.
   Uses: translations/languages · supabase · core/utils · icons/icons */
/* ---------- toast / modal / confirm ---------- */
// ONE message system: success, warning, error – its icon, its words (never a technical message: errText), a little longer for problems
function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.setAttribute('role', kind === 'bad' ? 'alert' : 'status');
  el.innerHTML = ico({ ok: 'ok', warn: 'alert', bad: 'urgent' }[kind] || 'info') + `<span>${esc(msg)}</span>`;
  $('#toasts').appendChild(el);
  const ms = kind === 'ok' ? 2600 : 4200;
  setTimeout(() => el.classList.add('out'), ms); setTimeout(() => el.remove(), ms + 400);
}
const fail = e => {
  console.warn(e);
  // a required field left empty: said at the field too (the open dialog, else the page)
  if (e?.info?.k) document.dispatchEvent(new CustomEvent('aurea:field-error', { detail: { root: modalStack.length ? modalStack[modalStack.length - 1] : $('#view'), k: e.info.k, msg: errText(e) } }));
  toast(errText(e), 'bad');
};

let modalStack = [];
function modal(title, body, opts = {}) {
  const wrap = document.createElement('div');
  // (11.0) a drawer: details and lists open on the side of a wide screen (a bottom sheet on a phone, like every dialog)
  wrap.className = 'modal-wrap' + (opts.drawer ? ' drawer' : '');
  const back = document.activeElement;
  wrap.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''} ${opts.cls || ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="${esc(t('close'))}">${ico('x')}</button></header>
    <div class="modal-body">${body}</div>
    ${opts.save || opts.extra ? `<footer>${opts.danger ? `<button class="btn secondary danger" data-danger>${esc(opts.dangerLabel || t('delete'))}</button>` : ''}
      <span class="grow"></span>${opts.extra || ''}${opts.cancel ? `<button class="btn ghost" data-close>${esc(t('cancel'))}</button>` : ''}
      ${opts.save ? `<button class="btn ${opts.saveClass || ''}" data-save>${esc(opts.saveLabel || t('save'))}</button>` : ''}</footer>` : ''}
  </div>`;
  document.body.appendChild(wrap);
  modalStack.push(wrap);
  const close = () => { wrap.remove(); modalStack = modalStack.filter(x => x !== wrap); opts.onClose && opts.onClose(); if (back && back.isConnected && !modalStack.length) back.focus({ preventScroll: true }); };
  wrap.addEventListener('click', ev => { if (ev.target === wrap || ev.target.closest('[data-close]')) close(); });
  const root = $('.modal-body', wrap);
  const busy = async (btn, fn) => {
    if (btn.disabled) return; btn.disabled = true;
    try { if ((await fn(root, close)) !== false) close(); } catch (e) { fail(e); } finally { btn.disabled = false; }
  };
  if (opts.save) $('[data-save]', wrap).onclick = ev => busy(ev.currentTarget, opts.save);
  // (dangerNoAsk: the delete asks its own question, e.g. which dates of a series)
  if (opts.danger) $('[data-danger]', wrap).onclick = async ev => { const btn = ev.currentTarget; if (opts.dangerNoAsk || await confirmBox(opts.dangerAsk || t('confirm_delete'))) busy(btn, opts.danger); };   // keep the button: after the question the event is gone
  opts.mount && opts.mount(root, close);
  // the first field gets the focus – never taken away from a field the person already went to (a fast tap, typing at once)
  setTimeout(() => { const f = $('input:not([type=hidden]),select,textarea', root); if (f && !opts.noFocus && !wrap.contains(document.activeElement)) f.focus({ preventScroll: true }); }, 30);
  return { root, close };
}
// the keyboard in a dialog: Escape closes it, Tab stays inside it
document.addEventListener('keydown', ev => {
  if (!modalStack.length) return;
  const top = modalStack[modalStack.length - 1];
  if (ev.key === 'Escape') { $('[data-close]', top).click(); return; }
  if (ev.key !== 'Tab') return;
  const f = $$('a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])', top).filter(x => x.offsetParent);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1], at = document.activeElement;
  if (!top.contains(at)) { ev.preventDefault(); first.focus(); }
  else if (ev.shiftKey && at === first) { ev.preventDefault(); last.focus(); }
  else if (!ev.shiftKey && at === last) { ev.preventDefault(); first.focus(); }
});
const closeModals = () => { modalStack.slice().forEach(w => w.remove()); modalStack = []; };
/* a question with more than yes / no: choices [{ k, label, cls }] become buttons (the last one is the main one); answers the chosen k, or null */
function choiceBox(title, html, choices) {
  return new Promise(res => {
    let done = false;
    modal(title, html, {
      noFocus: true, onClose: () => { if (!done) res(null); },
      extra: `<button class="btn ghost" data-close>${esc(t('cancel'))}</button>` + choices.map((c, i) => `<button class="btn ${i === choices.length - 1 ? '' : 'secondary'} ${c.cls || ''}" data-choice="${esc(c.k)}">${esc(c.label)}</button>`).join(''),
      mount: (root, close) => { $$('[data-choice]', root.closest('.modal')).forEach(b => { b.onclick = () => { done = true; res(b.dataset.choice); close(); }; }); }
    });
  });
}
function confirmBox(text, yes) {
  return new Promise(res => {
    let done = false;
    modal(t('please_confirm'), `<p>${esc(text)}</p>`, {
      saveLabel: yes || t('yes'), save: () => { done = true; res(true); }, onClose: () => { if (!done) res(false); }, noFocus: true
    });
  });
}

/* ---------- permanent delete: ONE confirmation for every record ----------
   what goes, the choices where records are connected (o.options), warnings (o.warn, e.g. a winning ticket),
   and from DEL_STRONG records on the number has to be typed – nothing is ever deleted by one click */
const DEL_STRONG = 20;
function delAsk(o) {
  return new Promise(res => {
    let done = false; const strong = o.strong || (o.n || 0) >= DEL_STRONG, opts = (o.options || []).filter(Boolean);
    const def = o.def && opts.some(x => x.v === o.def && !x.off) ? o.def : opts.find(x => !x.off)?.v;
    modal(o.title, `${(o.warn || []).length ? `<div class="hint-box warn del-warn">${ico('flag')}<div>${o.warn.map(w => `<p>${esc(w)}</p>`).join('')}</div></div>` : ''}
      ${(o.facts || []).length ? `<ul class="del-facts">${o.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      <p>${esc(o.text || t('delete_perm_text'))}</p>
      ${opts.length ? `<fieldset class="field del-opts"><legend>${esc(o.legend || t('del_what'))}</legend>${opts.map(x => `<label class="del-opt ${x.off ? 'dim' : ''}"><input type="radio" name="del_m" value="${esc(x.v)}" ${x.v === def ? 'checked' : ''} ${x.off ? 'disabled' : ''}><span><b>${esc(x.label)}</b>${x.hint ? `<small class="muted">${esc(x.hint)}</small>` : ''}</span></label>`).join('')}</fieldset>` : ''}
      ${o.extra || ''}
      ${strong ? `<div class="field del-strong"><label for="del-n">${esc(t('type_n_to_confirm', { n: o.n }))}</label><input id="del-n" inputmode="numeric" autocomplete="off" data-n="${esc(String(o.n))}"></div>` : ''}`, {
      cancel: true, saveLabel: o.yes || t('delete_permanently'), saveClass: 'danger', noFocus: !strong,
      save: root => {
        if (strong && $('#del-n', root).value.trim() !== String(o.n)) { toast(t('type_n_wrong', { n: o.n }), 'bad'); return false; }
        const pick = {}; $$('input[type=radio]:checked', root).forEach(i => { pick[i.name] = i.value; });
        if (o.check && o.check(pick, root) === false) return false;
        done = true; res(Object.assign({ mode: pick.del_m || (opts.find(x => !x.off) || {}).v || null }, pick));
      },
      onClose: () => { if (!done) res(null); }
    });
  });
}
const later = fn => setTimeout(() => Promise.resolve().then(fn).catch(fail), 30);
