'use strict';
/* AUREA · pages/settings.js — Settings (per hotel): brand, welcome, links, location, booking, guest app parts, planner, assistant, documents.
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · components/modals · core/actions · components/cards ·
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
  perm: 'm_settings', icon: 'gear', group: 'admin',
  render: async arg => {
    const secs = SET_SECTIONS(); const tab = secs.some(s => s[0] === arg) ? arg : 'brand';
    const sec = secs.find(s => s[0] === tab);
    return tabs('settings', secs.map(s => [s[0], t('set_' + s[0])]), tab) + `<form class="card" id="setf" onsubmit="return false">${fieldsHtml(sec[1], S.settings)}<button class="btn" data-act="set_save" data-s="${tab}">${esc(t('save'))}</button></form>
      ${tab === 'brand' ? `<p class="muted small">${esc(t('brand_note'))}</p>` : ''}${tab === 'planner' ? `<p class="muted small">${esc(t('planner_rules_note'))}</p>` : ''}
      ${tab === 'documents' ? `<p class="row"><button class="btn ghost small" data-act="doc_sample">${ico('download')} ${esc(t('doc_sample'))}</button><span class="muted small">${esc(t('doc_sample_hint'))}</span></p>` : ''}`;
  }
});
// a sample document with the saved settings (the same head and foot as every PDF)
ACT.doc_sample = () => printSheet(t('doc_sample_title'), `<dl><dt>${esc(t('hotel'))}</dt><dd>${esc(S.hotel?.name || '')}</dd><dt>${esc(t('team'))}</dt><dd>${esc(S.team?.name || '—')}</dd><dt>${esc(t('date'))}</dt><dd>${esc(D.long(D.today()))}</dd></dl>`
  + tableHtml([t('item'), t('quantity'), t('rq_reason'), t('rq_expected')], [[t('tk_sample_event'), '1', t('doc_sample_reason'), t('doc_sample_result')]]), { sub: t('doc_sample_sub') });
ACT.set_save = async el => { const sec = SET_SECTIONS().find(s => s[0] === el.dataset.s); const r = readForm($('#setf'), sec[1]); await api('settings_save', { p_row: r }); await loadMe(); renderShell(); toast(t('saved')); route(); };
