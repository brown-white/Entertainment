'use strict';
/* AUREA · core/actions.js — every button names its action (data-act); ACT holds them all: one click handler, one change handler (data-act-change),
   Enter / Space on cards.
   Uses: components/modals */
/* ---------- actions registry (event delegation) ---------- */
const ACT = {};
// a card that is not a <button> (it can be dragged) still works with the keyboard: Enter / Space = tap
document.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches?.('[role=button][data-act]')) { ev.preventDefault(); ev.target.click(); } });
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (fn) { ev.preventDefault(); Promise.resolve(fn(el, ev)).catch(fail); }
});
document.addEventListener('change', ev => { const el = ev.target.closest('[data-act-change]'); if (el && ACT[el.dataset.actChange]) ACT[el.dataset.actChange](el); });
