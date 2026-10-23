// Собирает игру в один файл game.html: код, three.js, cannon-es, шейдеры, шрифт и текстуры.
// Запуск: node tools/build-game.cjs [--dev] [путь/к/файлу.html]
//   --dev — без минификации, удобно для отладки (откройте файл с #debug в адресе).
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const dev = process.argv.includes('--dev');
const outArg = process.argv.slice(2).find(a => !a.startsWith('--'));
const out = path.resolve(ROOT, outArg || 'game.html');

(async () => {
  const t0 = Date.now();
  const res = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/game/main.js')],
    bundle: true,
    format: 'iife',
    target: ['es2020'],
    minify: !dev,
    sourcemap: false,
    legalComments: 'none',
    write: false,
    loader: { '.webp': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.json': 'json', '.glsl': 'text' },
    define: { 'process.env.NODE_ENV': '"production"' },
    logLevel: 'warning'
  });
  const js = res.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const banner = '/* three.js (c) 2010-2026 three.js authors, MIT. cannon-es (c) 2015 Stefan Hedman and contributors, MIT. */\n';
  const tpl = fs.readFileSync(path.join(ROOT, 'src/game/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'src/game/style.css'), 'utf8');
  const html = tpl.replace('/*STYLE*/', () => css).replace('<!--BUNDLE-->', () => '<script>' + banner + js + '</script>');
  fs.writeFileSync(out, html);
  console.log('game:', path.relative(ROOT, out), (html.length / 1024).toFixed(0) + ' KB', (Date.now() - t0) + ' ms');
})().catch(e => { console.error(e.message || e); process.exit(1); });
