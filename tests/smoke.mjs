import { readFileSync, existsSync } from 'node:fs';
const html = readFileSync('index.html', 'utf8');
for (const needle of [
  'manifest.webmanifest',
  'serviceWorker',
  'guestProgramView',
  'activityRating',
  'socialTopIcons',
  'makeGuestPassword',
  'isAssignedToMe',
  'x.role===loginRole',
  'guest_accounts'
]) {
  if (!html.includes(needle) && !existsSync(needle)) throw new Error(`Missing ${needle}`);
}
const js = html.split('<script>')[1].split('</script>')[0];
new Function(js);
for (const file of ['manifest.webmanifest', 'sw.js', 'icon.svg', 'supabase-setup.sql']) {
  if (!existsSync(file)) throw new Error(`Missing ${file}`);
}
console.log('smoke ok');
