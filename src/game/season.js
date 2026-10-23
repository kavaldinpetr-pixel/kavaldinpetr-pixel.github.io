// Winter: from December to February the island is snowy. ?season=winter / ?season=autumn overrides it.
let forced = '';
try { forced = new URLSearchParams(location.search).get('season') || ''; } catch (e) { forced = ''; }
const month = new Date().getMonth(); // 0 = January
export const WINTER = forced ? forced === 'winter' : (month === 11 || month === 0 || month === 1);
