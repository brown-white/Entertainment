'use strict';
/* AUREA · components/modals.js — messages and dialogs: toast, the error message, modal, choice and confirm, the ONE delete confirmation.
   Uses: translations/languages · supabase · core/utils · icons/icons */
/* ---------- toast / modal / confirm ---------- */
function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.setAttribute('role', 'status'); el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 2600); setTimeout(() => el.remove(), 3100);
}
const fail = e => { console.warn(e); toast(errText(e), 'bad'); };

let modalStack = [];
function modal(title, body, opts = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <header><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="${esc(t('close'))}">${ico('x')}</button></header>
    <div class="modal-body">${body}</div>
    ${opts.save || opts.extra ? `<footer>${opts.danger ? `<button class="btn ghost danger" data-danger>${esc(opts.dangerLabel || t('delete'))}</button>` : ''}
      <span class="grow"></span>${opts.extra || ''}${opts.cancel ? `<button class="btn ghost" data-close>${esc(t('cancel'))}</button>` : ''}
      ${opts.save ? `<button class="btn ${opts.saveClass || ''}" data-save>${esc(opts.saveLabel || t('save'))}</button>` : ''}</footer>` : ''}
  </div>`;
  document.body.appendChild(wrap);
  modalStack.push(wrap);
  const close = () => { wrap.remove(); modalStack = modalStack.filter(x => x !== wrap); opts.onClose && opts.onClose(); };
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
  setTimeout(() => { const f = $('input:not([type=hidden]),select,textarea', root); f && !opts.noFocus && f.focus({ preventScroll: true }); }, 30);
  return { root, close };
}
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && modalStack.length) $('[data-close]', modalStack[modalStack.length - 1]).click(); });
const closeModals = () => { modalStack.slice().forEach(w => w.remove()); modalStack = []; };
/* a question with more than yes / no: choices [{ k, label, cls }] become buttons (the last one is the main one); answers the chosen k, or null */
function choiceBox(title, html, choices) {
  return new Promise(res => {
    let done = false;
    modal(title, html, {
      noFocus: true, onClose: () => { if (!done) res(null); },
      extra: `<button class="btn ghost" data-close>${esc(t('cancel'))}</button>` + choices.map((c, i) => `<button class="btn ${i === choices.length - 1 ? '' : 'ghost'} ${c.cls || ''}" data-choice="${esc(c.k)}">${esc(c.label)}</button>`).join(''),
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
      cancel: true, saveLabel: o.yes || t('delete_permanently'), saveClass: 'solid-danger', noFocus: !strong,
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
