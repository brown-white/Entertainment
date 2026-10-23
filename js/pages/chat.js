'use strict';
/* AUREA · pages/chat.js — staff page: Chat (the team and the direct line to management).
   Uses: core/state · translations/languages · supabase · core/utils · icons/icons · core/permissions · components/modals · core/actions ·
         components/cards · core/router · components/forms · systems/notifications */
/* ---------- Chat (team + direct line to management) ---------- */
let chatTimer = null;
page('chat', {
  perm: 'myday', icon: 'chat', group: 'team',
  heading: arg => arg ? (arg.startsWith('team:') ? t('team_chat') : t('chat')) : t('pg_chat'),
  render: async arg => {
    clearInterval(chatTimer);
    if (!arg) {
      const { threads } = await api('chat_threads');
      const name = th => th.thread.startsWith('team:') ? t('team_chat') + ' · ' + (th.name || '') : (th.thread === 'staff:' + meId() ? t('chat_with_management') : th.name || '');
      const row = th => `<a class="thread" href="#/chat/${esc(th.thread)}"><span class="av">${th.thread.startsWith('team:') ? ico('users') : esc((name(th) || '?').slice(0, 1).toUpperCase())}</span>
        <span class="grow"><b>${esc(name(th))}</b><small class="muted">${th.last ? (th.last.body == null ? esc(t('message_deleted')) : esc(th.last.sender + ': ' + th.last.body.slice(0, 60))) : esc(t('no_messages'))}</small></span>
        <span class="th-end">${th.last ? `<small class="muted">${esc(D.stamp(th.last.at))}</small>` : ''}${+th.unread ? `<i class="dot">${th.unread}</i>` : ''}</span></a>`;
      const act = threads.filter(x => !x.archived), arch = threads.filter(x => x.archived);
      return `<div class="threads">${act.map(row).join('') || empty(t('no_messages'))}</div>
        ${arch.length ? `<details class="archived"><summary>${ico('download')} ${esc(t('archived_chats'))} (${arch.length})</summary><div class="threads">${arch.map(row).join('')}</div></details>` : ''}`;
    }
    const j = await api('chat_list', { p_thread: arg });
    return `<div class="chat-head"><a href="#/chat" class="btn ghost small">${ico('up', 'rot-l')} ${esc(t('back'))}</a><span class="grow"></span>
        <button class="btn ghost small" data-act="chat_arch" data-th="${esc(arg)}" data-on="${j.archived ? 0 : 1}">${ico('download')} ${esc(j.archived ? t('unarchive') : t('archive'))}</button></div>
      <div class="chat" id="chatbox">${chatHtml(j.messages)}</div>
      <form class="chat-in" onsubmit="return false"><textarea id="chatmsg" rows="1" aria-label="${esc(t('message'))}" placeholder="${esc(t('message'))}"></textarea><button class="btn" data-act="chat_send" data-th="${esc(arg)}" aria-label="${esc(t('send'))}">${esc(t('send'))}</button></form>`;
  },
  mount: (root, arg) => {
    const box = $('#chatbox'); if (box) box.scrollTop = box.scrollHeight;
    if (arg) chatTimer = setInterval(async () => { if (current.key !== 'chat' || current.arg !== arg) return clearInterval(chatTimer); try { const { messages } = await api('chat_list', { p_thread: arg }); const b = $('#chatbox'); if (b) { const atEnd = b.scrollTop + b.clientHeight >= b.scrollHeight - 30; b.innerHTML = chatHtml(messages); if (atEnd) b.scrollTop = b.scrollHeight; } } catch { /* later */ } }, 5000);
    S.chatBadge = 0; pollStaff();
  }
});
let chatMsgs = [];
const chatHtml = ms => { chatMsgs = ms; return ms.length ? ms.map(m => { const mine = m.sender_staff_id === S.me?.id, gone = m.body == null;
  return `<div class="msg ${mine ? 'me' : ''} ${gone ? 'gone' : ''}">${mine ? '' : `<small class="who">${esc(m.sender_name || '')}</small>`}
    ${gone ? `<p><i>${esc(t('message_deleted'))}</i></p>` : `<button class="msg-body" data-act="chat_tap" data-id="${m.id}" aria-label="${esc(t('message_options'))}">${nl2br(m.body)}</button>`}
    <small class="when">${esc(D.stamp(m.created_at))}${m.edited_at && !gone ? ' · ' + esc(t('edited')) : ''}</small></div>`; }).join('') : empty(t('no_messages')); };
ACT.chat_send = async el => { const ta = $('#chatmsg'); if (!ta.value.trim()) return; await api('chat_send', { p_thread: el.dataset.th, p_body: ta.value }); ta.value = ''; route(); };
ACT.chat_tap = el => {
  const m = chatMsgs.find(x => x.id === +el.dataset.id); if (!m) return;
  const mine = m.sender_staff_id === S.me?.id; if (!mine && !can('m_team')) return;
  modal(t('message_options'), `<div class="sheet-actions">${mine ? `<button class="btn ghost wide" data-act="chat_edit" data-id="${m.id}">${ico('edit')} ${esc(t('edit'))}</button>` : ''}
    <button class="btn ghost wide danger" data-act="chat_del" data-id="${m.id}">${ico('trash')} ${esc(t('delete'))}</button></div>`, {});
};
ACT.chat_edit = el => { const m = chatMsgs.find(x => x.id === +el.dataset.id); closeModals();
  editForm(t('edit'), [{ k: 'body', type: 'textarea', label: t('message'), req: true, rows: 4 }], { body: m.body }, async r => { await api('chat_message', { p_id: m.id, p_action: 'edit', p_body: r.body }); route(); }); };
ACT.chat_del = async el => { closeModals(); if (!await confirmBox(t('delete_message_q'), t('delete'))) return; await api('chat_message', { p_id: +el.dataset.id, p_action: 'delete', p_body: null }); toast(t('deleted')); route(); };
ACT.chat_arch = async el => { await api('chat_archive', { p_thread: el.dataset.th, p_on: el.dataset.on === '1' }); toast(el.dataset.on === '1' ? t('archived') : t('unarchived')); location.hash = '#/chat'; };
