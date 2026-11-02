'use strict';
/* AUREA · pages/payroll.js — Payroll (the manager's month) and My pay (own payslip) – the same calculation.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · components/modals · core/actions · core/router ·
         components/forms · components/tables · systems/exports · systems/team-schedule */
/* ---------- My pay (own payslip; same calculation as the manager's payroll) ---------- */
let mpMonth = null;
page('mypay', {
  perm: 'my_pay', icon: 'wallet', group: 'my',
  render: async () => {
    mpMonth = mpMonth || D.month(D.today());
    const from = mpMonth + '-01', to = D.add(D.add(from, 32).slice(0, 7) + '-01', -1), me = S.preview ? S.preview.me : S.me;
    const [rates, entries, b] = await Promise.all([list('payroll_rates', { staff_id: me.id }), list('payroll_entries', { staff_id: me.id, month: mpMonth }), board(from, to)]);
    mpCache = payrollCalc(me, rates, entries, b, mpMonth);
    return `<div class="row"><input type="month" value="${mpMonth}" data-act-change="mp_month" aria-label="${esc(t('month'))}"><span class="grow"></span><button class="btn ghost small" data-act="mp_print">${esc(t('print_pdf'))}</button></div>
      <div class="card">${payslipHtml(mpCache, mpMonth)}</div>`;
  }
});
let mpCache = null;
ACT.mp_month = el => { mpMonth = el.value; route(); };
ACT.mp_print = () => printSheet(t('payslip') + ' · ' + mpCache.s.display_name, payslipHtml(mpCache, mpMonth), { sub: D.mon(mpMonth) });

/* ---------- Payroll ---------- */
let prMonth = null;
page('payroll', {
  perm: 'm_payroll', icon: 'wallet', group: 'manage',
  render: async () => {
    prMonth = prMonth || D.month(D.today());
    const from = prMonth + '-01', to = D.add(D.add(from, 32).slice(0, 7) + '-01', -1);
    const [team, rates, entries, b] = await Promise.all([api('team_members'), list('payroll_rates'), list('payroll_entries', { month: prMonth }), board(from, to)]);
    const people = team.staff.filter(s => !s.is_manager || rates.some(r => r.staff_id === s.id));
    const rows = people.map(p => payrollCalc(p, rates, entries, b, prMonth));
    prCache = { rows, rates };
    return `<div class="row"><input type="month" value="${prMonth}" data-act-change="pr_month" aria-label="${esc(t('month'))}"><span class="grow"></span><button class="btn ghost small" data-act="pr_print">${esc(t('print_pdf'))}</button><button class="btn ghost small" data-act="pr_xlsx">${esc(t('excel'))}</button></div>
      <p class="muted small">${esc(t('payroll_intro'))}</p>
      <div class="tablewrap"><table class="grid"><thead><tr><th>${esc(t('name'))}</th><th>${esc(t('salary_full_month'))}</th><th>${esc(t('earned_so_far'))}</th><th>${esc(t('days_worked'))}</th><th>${esc(t('hours'))}</th><th>${esc(t('st_absent'))}</th><th>${esc(t('pk_bonus'))}</th><th>${esc(t('pk_deduction'))}</th><th>${esc(t('pk_advance'))}</th><th>${esc(t('net'))}</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr><th><button class="link" data-act="pr_slip" data-id="${r.s.id}">${esc(r.s.display_name)}</button></th><td><button class="link" data-act="pr_rate" data-id="${r.s.id}">${esc(money(r.rt.monthly_salary || 0, r.cur))}</button></td><td>${esc(money(r.earned, r.cur))}<br><small class="muted">${esc(t('x_of_y', { x: r.days, y: r.dim }))}</small></td><td>${r.tracked ? r.worked : `<small class="muted">${esc(t('not_in_team'))}</small>`}</td><td>${r.hours}</td><td>${r.absent}${r.absDed ? ' (−' + esc(money(r.absDed, r.cur)) + ')' : ''}</td><td>${esc(money(r.bonus, r.cur))}</td><td>${esc(money(r.ded, r.cur))}</td><td>${esc(money(r.adv, r.cur))}</td><td><b>${esc(money(r.net, r.cur))}</b></td><td><button class="btn ghost small" data-act="pr_entry" data-id="${r.s.id}">+</button></td></tr>`).join('')}</tbody>
        <tfoot>${uniq(rows.map(r => r.cur)).map(cu => { const rs = rows.filter(r => r.cur === cu); return `<tr class="tot"><th>${esc(t('total'))} · ${esc(cu)}</th><td>${esc(money(sum(rs, r => r.salary), cu))}</td><td>${esc(money(sum(rs, r => r.earned), cu))}</td><td colspan="6"></td><td><b>${esc(money(sum(rs, r => r.net), cu))}</b></td><td></td></tr>`; }).join('')}</tfoot></table></div>
      ${entries.length ? `<section><h2>${esc(t('entries'))}</h2><div class="list">${entries.map(e => `<div class="li row">${esc(people.find(p => p.id === e.staff_id)?.display_name || '')} · ${esc(t('pk_' + e.kind))} · ${esc(money(e.amount, (rows.find(r => r.s.id === e.staff_id) || {}).cur))} <span class="grow muted">${esc(e.note || '')}</span><button class="btn ghost small" data-act="pr_del" data-id="${e.id}">${ico('x')}</button></div>`).join('')}</div></section>` : ''}`;
  }
});
let prCache = null;
/* the ONE payroll calculation (manager payroll, payslips, My pay) */
function payrollCalc(person, rates, entries, b, month) {
  const from = month + '-01', to = monthEnd(month), dim = +to.slice(8);
  const rt = rates.find(r => r.staff_id === person.id) || {}; const en = entries.filter(e => e.staff_id === person.id);
  const a = attendanceSummary(person, b, from, to);
  const salary = +rt.monthly_salary || 0, dayRate = +rt.day_rate || (dim ? salary / dim : 0), cur = rt.currency || S.hotel?.currency || 'EUR';
  const earned = Math.round(salary * a.days / dim * 100) / 100;                       // only the days that really passed
  const bonus = sum(en.filter(e => e.kind === 'bonus'), e => e.amount), ded = sum(en.filter(e => e.kind === 'deduction'), e => e.amount), adv = sum(en.filter(e => e.kind === 'advance'), e => e.amount);
  const absDed = Math.round(a.absent * dayRate * 100) / 100;
  return Object.assign({ s: person, rt, en, cur, salary, dim, dayRate, earned, bonus, ded, adv, absDed, net: Math.round((earned + bonus - ded - adv - absDed) * 100) / 100 }, a);
}
function payslipHtml(r, month) {
  return tableHtml([t('payslip'), ''], [[t('name'), r.s.display_name], [t('month'), month], [t('currency'), r.cur], [t('salary_full_month'), money(r.salary, r.cur)],
    [t('days_counted'), t('x_of_y', { x: r.days, y: r.dim }) + (r.window ? ' (' + D.short(r.window[0]) + ' – ' + D.short(r.window[1]) + ')' : '')],
    [t('earned_so_far'), money(r.earned, r.cur)], [t('st_working'), r.worked], [t('hours'), r.hours], [t('st_day_off'), r.off], [t('st_vacation'), r.vac], [t('st_sick'), r.sick],
    [t('st_absent'), r.absent + (r.absDed ? ' (−' + money(r.absDed, r.cur) + ')' : '')], [t('pk_bonus'), money(r.bonus, r.cur)], [t('pk_deduction'), money(r.ded, r.cur)], [t('pk_advance'), money(r.adv, r.cur)],
    [{ html: '<b>' + esc(t('net')) + '</b>' }, { html: '<b>' + esc(money(r.net, r.cur)) + '</b>' }]])
    + (r.en.length ? tableHtml([t('kind'), t('amount'), t('note')], r.en.map(e => [t('pk_' + e.kind), money(e.amount, r.cur), e.note || ''])) : '');
}
ACT.pr_slip = el => { const r = prCache.rows.find(x => x.s.id === +el.dataset.id); printSheet(t('payslip') + ' · ' + r.s.display_name, payslipHtml(r, prMonth), { sub: D.mon(prMonth) }); };
ACT.pr_month = el => { prMonth = el.value; route(); };
ACT.pr_rate = el => { const sid = +el.dataset.id; const rt = prCache.rates.find(r => r.staff_id === sid) || { staff_id: sid, currency: S.hotel?.currency }; editForm(t('salary'), [{ k: 'currency', type: 'select', label: t('currency'), options: curOpts(), hint: t('salary_currency_hint') }, { k: 'monthly_salary', type: 'number', label: t('monthly_salary'), step: '0.01' }, { k: 'day_rate', type: 'number', label: t('day_rate'), step: '0.01', hint: t('day_rate_hint') }, { k: 'note', label: t('note') }], rt, async r => { await save('payroll_rates', Object.assign({ staff_id: sid }, r)); route(); }); };
ACT.pr_entry = el => editForm(t('add'), [{ k: 'kind', type: 'select', label: t('kind'), options: ['bonus', 'deduction', 'advance'].map(k => [k, t('pk_' + k)]) }, { k: 'amount', type: 'number', label: t('amount'), step: '0.01', req: true }, { k: 'note', label: t('note') }], {}, async r => { await save('payroll_entries', Object.assign({ staff_id: +el.dataset.id, month: prMonth }, r)); route(); });
ACT.pr_del = async el => { if (await confirmBox(t('confirm_delete'))) { await del('payroll_entries', +el.dataset.id); route(); } };
// the payroll columns, once: the Excel file gets the numbers, the PDF formats each column by what it is (amounts in the person's currency)
const prCols = () => [[t('name'), r => r.s.display_name], [t('currency'), r => r.cur], [t('salary_full_month'), r => r.salary, 'money'], [t('earned_so_far'), r => r.earned, 'money'],
  [t('days_counted'), r => r.days], [t('days_worked'), r => r.worked], [t('hours'), r => r.hours, 'hours'], [t('st_day_off'), r => r.off], [t('st_vacation'), r => r.vac], [t('st_sick'), r => r.sick],
  [t('st_absent'), r => r.absent], [t('pk_bonus'), r => r.bonus, 'money'], [t('pk_deduction'), r => r.ded + r.absDed, 'money'], [t('pk_advance'), r => r.adv, 'money'], [t('net'), r => r.net, 'money']];
const prTable = () => prCache.rows.map(r => Object.fromEntries(prCols().map(([l, f]) => [l, f(r)])));
ACT.pr_print = () => { const cols = prCols(); printSheet(t('pg_payroll'), tableHtml(cols.map(c => c[0]), prCache.rows.map(r => cols.map(([, f, k]) => { const v = f(r);
  return k === 'money' ? money(v, r.cur) : k === 'hours' ? (Number(v) || 0).toLocaleString(locale(), { maximumFractionDigits: 1 }) : v; }))), { sub: D.mon(prMonth) }); };
ACT.pr_xlsx = () => exportXlsx('payroll-' + prMonth, { [t('pg_payroll')]: prTable() });
