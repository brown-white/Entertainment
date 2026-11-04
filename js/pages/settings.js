'use strict';
/* Mr Hassan · pages/settings.js — Settings (per hotel): brand, welcome, links, location, booking, guest app parts, planner, assistant, documents, currencies.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions · components/cards ·
         core/auth · core/router · components/forms · components/tables · components/navigation · systems/exports */
/* ---------- Settings (typed per hotel) ---------- */
const SET_SECTIONS = () => [
  ['brand', [{ k: 'app_name', label: t('app_name') }, { k: 'subtitle', label: t('subtitle') }, { k: 'theme_guest', type: 'theme', label: t('theme_for_guests') }, { k: 'theme_staff', type: 'theme', label: t('theme_for_staff') }, { k: 'theme_manager', type: 'theme', label: t('theme_for_managers') },
    { k: 'font_style', type: 'select', label: t('font_style'), options: [['elegant', t('font_elegant')], ['modern', t('font_modern')], ['classic', t('font_classic')]] },
    { k: 'button_style', type: 'select', label: t('button_style'), options: [['rounded', t('btn_rounded')], ['pill', t('btn_pill')], ['square', t('btn_square')]] }, { k: 'default_lang', type: 'select', label: t('default_language'), options: LANGS.map(l => [l[0], l[1]]) }]],
  ['welcome', [{ k: 'welcome', type: 'i18n', withEn: true, label: t('welcome_text') }]],
  ['links', ['whatsapp', 'phone', 'email', 'website', 'instagram', 'facebook', 'tiktok', 'youtube', 'tripadvisor', 'google_reviews', 'holidaycheck'].map(k => ({ k, label: t('link_' + k), type: ['whatsapp', 'phone'].includes(k) ? 'phone' : undefined }))],
  ['location', [{ k: 'lat', type: 'number', label: t('latitude'), step: 'any' }, { k: 'lon', type: 'number', label: t('longitude'), step: 'any' }]],
  ['booking', [{ k: 'booking_limit_day', type: 'number', label: t('booking_limit_day'), min: 0 }, { k: 'booking_open_days', type: 'number', label: t('booking_open_days'), min: 0 }, { k: 'booking_close_minutes', type: 'number', label: t('booking_close_minutes'), min: 0 },
    { k: 'cancel_minutes', type: 'number', label: t('cancel_minutes'), min: 0 }, { k: 'max_seats', type: 'number', label: t('max_seats'), min: 1 }, { k: 'ticket_max', type: 'number', label: t('ticket_max'), min: 1 },
    { k: 'ticket_hold_hours', type: 'number', label: t('ticket_hold_hours'), min: 1 }, { k: 'ticket_release_minutes', type: 'number', label: t('ticket_release_minutes'), min: 0 },
    { k: 'ticket_guest_pay', type: 'select', label: t('ticket_guest_pay'), options: [['team', t('guest_pay_team')], ['room', t('guest_pay_room')]], hint: t('ticket_guest_pay_hint') },
    { k: 'guest_signin_mode', type: 'select', label: t('guest_signin_mode'), options: [['room', t('signin_room')], ['list', t('signin_list')]], hint: t('signin_hint') }]],
  ['features', ['f_programme', 'f_booking', 'f_tickets', 'f_quiz', 'f_gallery', 'f_bus', 'f_weather', 'f_info', 'f_team', 'f_feedback', 'f_songs'].map(k => ({ k, type: 'bool', label: t(k) }))],
  ['planner', [{ k: 'cross_team_assign', type: 'bool', label: t('cross_team_assign') }, { k: 'gender_rules', type: 'bool', label: t('gender_rules') }, { k: 'plan_max_per_day', type: 'number', label: t('plan_max_per_day'), min: 1, max: 20, hint: t('plan_max_per_day_hint') }, { k: 'plan_max_per_op', type: 'number', label: t('plan_max_per_op'), min: 1, max: 10, hint: t('plan_max_per_op_hint') }, { k: 'op_afternoon', type: 'time', label: t('op_afternoon_at') }, { k: 'op_evening', type: 'time', label: t('op_evening_at') }, { k: 'leave_op_time', type: 'time', label: t('leave_op_at'), req: true, hint: t('entrance_hint') }, { k: 'entrance_time', type: 'time', label: t('entrance_at'), req: true, hint: t('entrance_levels_hint', { teams: t('teams'), dayplan: t('pg_dayplan') }) }]],
  ['assistant', [{ k: 'ai_endpoint', label: t('assistant_address'), hint: t('assistant_hint') }]],
  // ONE document layout for every PDF of this hotel (the hotel's name and logo: Hotels)
  ['documents', [{ type: 'section', label: t('doc_author'), hint: t('doc_author_hint') }, { k: 'doc_prepared_by', label: t('doc_prepared_by') }, { k: 'doc_position', label: t('doc_position_l') },
    { type: 'section', label: t('doc_branding'), hint: t('doc_branding_hint') }, { k: 'doc_department', label: t('doc_department') }, { k: 'doc_show_logo', type: 'bool', label: t('doc_show_logo') },
    { k: 'doc_accent', type: 'color', label: t('doc_accent') },
    { type: 'section', label: t('doc_layout') }, { k: 'doc_show_date', type: 'bool', label: t('doc_show_date') }, { k: 'doc_show_pages', type: 'bool', label: t('doc_show_pages') },
    { k: 'doc_paper', type: 'select', label: t('paper'), options: [['a4', 'A4'], ['letter', 'Letter']] },
    { k: 'doc_orientation', type: 'select', label: t('orientation'), options: [['auto', t('doc_orient_auto')], ['portrait', t('portrait')], ['landscape', t('landscape')]] }]]];
page('settings', {
  perm: 'm_settings,currencies_manage', icon: 'gear', group: 'admin',
  render: async arg => {
    // the currencies are their own permission ("Manage currencies"): someone with only that sees only that tab
    const secs = can('m_settings') ? SET_SECTIONS() : [], all = secs.map(s => [s[0], t('set_' + s[0])]).concat(can('currencies_manage') ? [['currencies', t('set_currencies')]] : []);
    const tab = all.some(s => s[0] === arg) ? arg : all[0][0];
    if (tab === 'currencies') return tabs('settings', all, tab) + curSettingsHtml();
    const sec = secs.find(s => s[0] === tab);
    return tabs('settings', all, tab) + `<form class="card" id="setf" onsubmit="return false">${fieldsHtml(sec[1], S.settings)}<button class="btn" data-act="set_save" data-s="${tab}">${esc(t('save'))}</button></form>
      ${tab === 'brand' ? `<p class="muted small">${esc(t('brand_note'))}</p>` : ''}${tab === 'planner' ? `<p class="muted small">${esc(t('planner_rules_note'))}</p>` : ''}
      ${tab === 'documents' ? `<p class="row"><button class="btn ghost small" data-act="doc_sample">${ico('download')} ${esc(t('doc_sample'))}</button><span class="muted small">${esc(t('doc_sample_hint'))}</span></p>` : ''}`;
  }
});
// a sample document with the saved settings (the same head and foot as every PDF)
ACT.doc_sample = () => printSheet(t('doc_sample_title'), `<dl><dt>${esc(t('hotel'))}</dt><dd>${esc(S.hotel?.name || '')}</dd><dt>${esc(t('team'))}</dt><dd>${esc(S.team?.name || '—')}</dd><dt>${esc(t('date'))}</dt><dd>${esc(D.long(D.today()))}</dd></dl>`
  + tableHtml([t('item'), t('quantity'), t('rq_reason'), t('rq_expected')], [[t('tk_sample_event'), '1', t('doc_sample_reason'), t('doc_sample_result')]]), { sub: t('doc_sample_sub') });
ACT.set_save = async el => { const sec = SET_SECTIONS().find(s => s[0] === el.dataset.s); const r = readForm($('#setf'), sec[1]); await api('settings_save', { p_row: r }); await loadMe(); renderShell(); toast(t('saved')); route(); };

/* the hotel's CURRENCIES (one place, its own permission): the default currency, the others it accepts, and the optional conversion with
   the manager's own rates – 1 USD = … EGP; nothing is built in, nothing converts by itself, and nothing is fetched from the internet.
   Prices and sales keep their own currency; turning conversion on only adds a converted total to the reports. */
const curSettingsHtml = () => { const def = S.hotel?.currency || '', acc = S.settings?.currencies || [], on = !!S.settings?.fx_on, base = (on && S.settings?.fx_base) || def, rates = S.settings?.fx_rates || {};
  const all = uniq(CURRENCIES.concat(def ? [def] : [], acc));
  return `<form class="card" id="curf" onsubmit="return false"><p class="muted small">${esc(t('currencies_intro'))}</p>
    ${fieldHtml({ k: 'currency', type: 'select', label: t('default_currency'), options: curOpts().concat(all.filter(c => !CURRENCIES.includes(c)).map(c => [c, c])), hint: t('default_currency_hint') }, def)}
    ${fieldHtml({ k: 'currencies', type: 'multi', label: t('accepted_currencies'), options: all.map(c => [c, c]), hint: t('accepted_currencies_hint') }, uniq([def].concat(acc)))}
    ${fieldHtml({ type: 'section', label: t('fx_title'), hint: t('fx_hint') })}
    ${fieldHtml({ k: 'fx_on', type: 'bool', label: t('fx_on') }, on)}
    <div id="cur-fx" ${on ? '' : 'hidden'}>${fieldHtml({ k: 'fx_base', type: 'select', label: t('fx_base'), options: uniq([def].concat(acc)).map(c => [c, c]) }, base)}
      <div class="fx-rates">${uniq([def].concat(acc)).map(c => `<label class="row-mini fx-rate" data-fx="${c}" ${c === base ? 'hidden' : ''}><span>1 ${esc(c)} =</span><input type="number" min="0" step="0.0001" data-rate="${c}" value="${esc(rates[c] ?? '')}" aria-label="${esc('1 ' + c)}"><span class="fx-base">${esc(base)}</span></label>`).join('')}</div></div>
    <button class="btn" data-act="cur_save">${esc(t('save'))}</button></form>`; };
ACT.cur_save = async () => { const f = $('#curf'), def = $('[name=currency]', f).value, acc = $$('[data-multi=currencies] input:checked', f).map(i => i.value), on = $('[name=fx_on]', f).checked;
  const rates = {}; $$('[data-rate]', f).forEach(i => { if (i.value !== '') rates[i.dataset.rate] = +i.value; });
  await api('currency_settings_save', { p_row: { currency: def, currencies: acc, fx_on: on, fx_base: on ? $('[name=fx_base]', f)?.value || def : null, fx_rates: rates } });
  await loadMe(); renderShell(); toast(t('saved')); route(); };
// the conversion fields follow the switch and the base currency (a rate for every other accepted currency)
document.addEventListener('change', ev => { const f = ev.target.closest('#curf'); if (!f) return;
  $('#cur-fx', f).hidden = !$('[name=fx_on]', f).checked; const base = $('[name=fx_base]', f).value;
  $$('[data-fx]', f).forEach(l => { l.hidden = l.dataset.fx === base; $('.fx-base', l).textContent = base; }); });
