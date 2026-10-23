// Personal invitation links: ?to=Company&n=auto|detailing|salon
// (the page greets the company, the island spells its name in letters you can knock over)
const q = (() => { try { return new URLSearchParams(location.search); } catch (e) { return new Map(); } })();
let to = '';
try { to = (q.get('to') || '').replace(/[^\p{L}\p{N} \-.,«»"'&+№!]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40); } catch (e) { to = ''; }
const n = ['auto', 'detailing', 'salon'].includes(q.get('n')) ? q.get('n') : '';
export const GUEST = { to, n };
export const NICHE = {
  auto: { zone: 'auto', what: 'концепта сайта для автосервиса — «Ключ на 10»' },
  detailing: { zone: 'dt', what: 'концепта сайта для детейлинга — «Слой»' },
  salon: { zone: 'salon', what: 'концепта сайта для салона красоты — «Миндаль»' }
};
