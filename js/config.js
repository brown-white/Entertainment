'use strict';
/* AUREA · config.js — the ONE place for the connection: the Supabase project (URL, public key, photo bucket) and the app version.
   A page may set window.AUREA_CONFIG before this file to use another project.
   Uses: nothing (the first files) */
const CFG = Object.assign({
  url: 'https://smecztwnxieovszndxga.supabase.co',
  key: 'sb_publishable_qY_DPSrOOR7nclHgXC05lQ_BMNSaf3V',
  bucket: 'aurea',
  version: '10.3'
}, window.AUREA_CONFIG || {});
