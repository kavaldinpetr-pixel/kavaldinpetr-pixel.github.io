// Собирает index.html из src/site/index.src.html: встраивает скриншоты проекта
// и общий скрипт анкеты «Обсудить сайт» (тот же, что в игре), чтобы страница была одним файлом.
// Запуск: node tools/build-site.cjs
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const image = name => 'data:image/webp;base64,' + fs.readFileSync(path.join(ROOT, 'src/site/img', name)).toString('base64');
const fill = (s, key, value) => s.split('{{' + key + '}}').join(value);

let page = read('src/site/index.src.html');
page = fill(page, 'IMG_HOME', image('vpn-home.webp'));
page = fill(page, 'IMG_TARIFFS', image('vpn-tariffs.webp'));
page = fill(page, 'BRIEF_JS', read('src/game/brief.js').split('</script').join('<\\/script'));
if (page.includes('{{')) throw new Error('в странице остался незаполненный {{...}}');

const [head, body] = page.split('<!--body-->');
if (body === undefined) throw new Error('в исходнике нет метки <!--body-->');
const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head.trim()}
</head>
<body>
${body.trim()}
</body>
</html>
`;
fs.writeFileSync(path.join(ROOT, 'index.html'), html);
console.log('site: index.html', (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB');
