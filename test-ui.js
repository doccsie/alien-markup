#!/usr/bin/env node
/* =============================================================
 *  ALIEN MARKUP — test-ui.js
 *  Прогон собранного index.html в jsdom: проверяет, что интерфейс
 *  поднимается без ошибок и кнопки делают то, что должны.
 *
 *  Запуск:  npm i jsdom && node test-ui.js
 * ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

let JSDOM;
try { JSDOM = require('jsdom').JSDOM; }
catch (e) {
  console.log('jsdom не установлен — пропускаю. Поставьте: npm i jsdom');
  process.exit(0);
}

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const errs = [];
let failed = 0;

function check(name, cond, detail) {
  if (!cond) { failed++; console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
  else console.log('  ✓ ' + name);
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously', url: 'https://example.com/', pretendToBeVisual: true,
  beforeParse(w) {
    w.onerror = m => errs.push(String(m));
    w.matchMedia = w.matchMedia ||
      (q => ({ matches: false, media: q, addListener() {}, removeListener() {} }));
  }
});

const d = dom.window.document, W = dom.window;
const BROKEN = '<table>\n<tr>\n<td class="a">первый</td>\n<td class="b">второй\n</tr\n' +
  '<tr>\n<td>третий</td>\n</span>\n<td class="c"\n<span>четвёртый</span>\n</td>\n</tr>\n' +
  '</table>\n<div><p>абзац без закрытия\n</div>';

console.log('ALIEN MARKUP — проверка интерфейса\n');

console.log('загрузка:');
check('движок встроен и доступен', typeof W.AMEngine === 'object');
check('тема применена', !!d.documentElement.dataset.theme);
check('в палитре 7 тем', d.getElementById('themeMenu').children.length === 7);
check('кнопка починки не светится на пустом вводе',
  !d.getElementById('btnFix').classList.contains('alert'));

console.log('\nформатирование:');
d.getElementById('btnSample').dispatchEvent(new W.Event('click'));
check('образец отформатирован', d.getElementById('output').value.split('\n').length > 10);
d.getElementById('btnMinify').dispatchEvent(new W.Event('click'));
check('сжатие отработало', /сжатие L\d/.test(d.getElementById('stMode').textContent));

console.log('\nсмена оформления:');
d.querySelector('[data-id="replicant"]').dispatchEvent(new W.MouseEvent('click', { bubbles: true }));
check('тема сменилась', d.documentElement.dataset.theme === 'replicant');
check('имя в шапке сменилось', d.getElementById('brandName').textContent === 'Replicant Markup');
check('фавикон перерисован',
  d.querySelector('link[rel="icon"]').getAttribute('href').includes('%2322d3ee'));

console.log('\nпочинка тегов:');
d.getElementById('input').value = BROKEN;
d.getElementById('input').dispatchEvent(new W.Event('input'));

setTimeout(function () {
  const btn = d.getElementById('btnFix');
  check('кнопка засветилась', btn.classList.contains('alert'));
  check('счётчик проблем: 6', d.getElementById('fixCount').textContent === '6');

  btn.dispatchEvent(new W.Event('click'));
  const out = d.getElementById('output').value;
  check('режим — починка', d.getElementById('stMode').textContent === 'починка + формат');
  check('дописан </td>', out.includes('<td class="b">второй</td>'));
  check('дописана скобка </tr>', !/<\/tr\s*\n/.test(out));
  check('дописана скобка у <td class="c">', out.includes('<td class="c">'));
  check('лишний </span> удалён', !out.includes('</span>\n'));
  check('дописан </p>', out.includes('<p>абзац без закрытия</p>'));
  check('в результате проблем не осталось', W.AMEngine.checkTags(out).length === 0);

  console.log('\nподсветка проблемных строк:');
  d.getElementById('input').value = BROKEN;
  d.getElementById('input').dispatchEvent(new W.Event('input'));
  setTimeout(function () {
    const bad = W.AMEngine.checkTags(BROKEN).map(function (w) { return w.line; });
    const marked = Array.from(d.getElementById('gutIn').querySelectorAll('i'))
      .map(function (el) { return Number(el.textContent); });
    check('строки помечены в нумерации: ' + marked.join(', '),
      marked.length > 0 && marked.every(function (l) { return bad.indexOf(l) !== -1; }));
    check('полос столько же, сколько помеченных строк',
      d.getElementById('marksIn').children.length === marked.length);
    check('номера совпадают с диагностикой',
      marked.join(',') === Array.from(new Set(bad)).sort(function (a, b) { return a - b; }).join(','));

    console.log('\nошибок в консоли: ' + errs.length + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
    if (errs.length) failed += errs.length;
    console.log('\n' + (failed ? failed + ' проверок провалено' : 'все проверки пройдены'));
    process.exit(failed ? 1 : 0);
  }, 600);
  return;

  console.log('\nошибок в консоли: ' + errs.length + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
  if (errs.length) failed += errs.length;
  console.log('\n' + (failed ? failed + ' проверок провалено' : 'все проверки пройдены'));
  process.exit(failed ? 1 : 0);
}, 600);
