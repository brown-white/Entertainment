'use strict';
/* AUREA · pages/qr.js — QR codes: the guest app's address as a code and a poster.
   Uses: core/state · translations/languages · supabase · core/utils · components/modals · core/actions · core/router · systems/exports */
page('qr', {
  perm: 'm_settings,m_content', icon: 'qr', group: 'admin', title: 'qr_codes',
  render: async () => { const url = location.origin + location.pathname + '?hotel=' + S.hotel.id; return `<div class="card center"><p>${esc(t('qr_intro'))}</p><div id="qrbox" class="qr"></div><p><code>${esc(url)}</code></p><p class="row"><button class="btn" data-act="qr_print">${esc(t('print_pdf'))}</button><button class="btn ghost" data-act="qr_copy" data-u="${esc(url)}">${esc(t('copy_link'))}</button></p></div>`; },
  mount: async () => { try { await loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'); const box = $('#qrbox'); if (box) new window.QRCode(box, { text: location.origin + location.pathname + '?hotel=' + S.hotel.id, width: 220, height: 220 }); } catch { /* offline */ } }
});
ACT.qr_copy = async el => { try { await navigator.clipboard.writeText(el.dataset.u); toast(t('copied')); } catch { toast(el.dataset.u); } };
// the poster: never without its code (the code is drawn on the page; when it could not be made – no connection – say so)
ACT.qr_print = () => { const img = $('#qrbox img[src]') || $('#qrbox canvas'); const src = img ? (img.tagName === 'CANVAS' ? img.toDataURL() : img.src) : '';
  if (!src) return fail(new ApiError('offline'));
  const url = location.origin + location.pathname + '?hotel=' + S.hotel.id;
  printSheet(S.settings.app_name || S.hotel.name, `<p>${esc(t('qr_intro'))}</p><img src="${src}" width="300"><p><small>${esc(url)}</small></p>`, { sub: t('qr_scan'), orient: 'portrait' }); };
