import { readFileSync, existsSync } from 'node:fs';
const html = readFileSync('index.html', 'utf8');
const sql = readFileSync('supabase-setup.sql', 'utf8');
for (const needle of [
  'data:application/manifest+json',
  '__singleFileApp',
  'guestProgramView',
  'activityRating',
  'socialTopIcons',
  'makeGuestPassword',
  'isAssignedToMe',
  'x.role===loginRole',
  'guest_accounts',
  'remember-me',
  'forgot-pass',
  'window.ENTERTAINMENT_CONFIG',
  'reviews?select=*'
]) {
  if (!html.includes(needle) && !existsSync(needle)) throw new Error(`Missing ${needle}`);
}
for (const needle of ['audit_logs', 'payroll_records', 'locations', 'files', 'password_hash']) {
  if (!sql.includes(needle)) throw new Error(`Missing schema object ${needle}`);
}
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const js = scripts.at(-1);
new Function(js);
for (const file of ['supabase-setup.sql']) {
  if (!existsSync(file)) throw new Error(`Missing ${file}`);
}
for (const oldAsset of ['manifest.webmanifest', 'sw.js', 'icon.svg']) {
  if (existsSync(oldAsset)) throw new Error(`External app asset should be inlined: ${oldAsset}`);
}
console.log('smoke ok');
