'use strict';
/* AUREA · core/permissions.js — what the person may do: can(permission) from Role + personal permissions (a preview shows exactly that person's rights).
   Uses: core/state */
const can = p => {
  const perms = S.preview ? S.preview.perms : S.perms;
  const me = S.preview ? S.preview.me : S.me;
  if (!p) return true;
  if (me?.is_manager) return true;
  return String(p).split(',').some(k => !!perms[k.trim()]);
};
const meId = () => (S.preview ? S.preview.me.id : S.me?.id);
const roleKey = () => (S.preview ? S.preview.me.role_key : S.me?.role_key);
