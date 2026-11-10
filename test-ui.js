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

console.log('ALIEN MARKUP — проверка интерфейса\n');

console.log('загрузка:');
check('движок встроен и доступен', typeof W.AMEngine === 'object');
check('тема применена', !!d.documentElement.dataset.theme);
check('в палитре 13 тем', d.getElementById('themeMenu').children.length === 13);

console.log('\nформатирование:');
d.getElementById('btnSample').dispatchEvent(new W.Event('click'));
check('образец отформатирован', d.getElementById('output').value.split('\n').length > 10);
d.getElementById('btnMinify').dispatchEvent(new W.Event('click'));
check('сжатие отработало', /сжатие L\d/.test(d.getElementById('stMode').textContent));

console.log('\nсмена оформления:');
d.querySelector('[data-id="replicant"]').dispatchEvent(new W.MouseEvent('click', { bubbles: true }));
check('тема сменилась', d.documentElement.dataset.theme === 'replicant');
check('пластика темы проставлена', d.documentElement.dataset.skin === 'crt');
check('имя в шапке сменилось', d.getElementById('brandName').textContent === 'Replicant Markup');
check('фавикон перерисован',
  d.querySelector('link[rel="icon"]').getAttribute('href').includes('%2322d3ee'));

d.querySelector('[data-id="slime"]').dispatchEvent(new W.MouseEvent('click', { bubbles: true }));
check('мультяшная пластика включилась', d.documentElement.dataset.skin === 'toon');
d.querySelector('[data-id="fog"]').dispatchEvent(new W.MouseEvent('click', { bubbles: true }));
check('спокойная пластика включилась', d.documentElement.dataset.skin === 'calm');

console.log('\nдиагностика и подсветка строк:');
const BAD = '<table>\n<tr>\n<td class="a" class="b">первый</td>\n<td>второй\n</tr>\n' +
  '<div>\n<p>абзац\n</div>\n<img src="x.png">\n</table>';
d.getElementById('input').value = BAD;
d.getElementById('btnFormat').dispatchEvent(new W.Event('click'));

const rows = Array.from(d.querySelectorAll('#diag .row'));
check('диагностика не пуста', rows.length > 0);
check('у каждой строки проставлен номер',
  rows.every(function (r) { return /^стр\. \d+$/.test(r.querySelector('.ln').textContent); }),
  rows.map(function (r) { return r.querySelector('.ln').textContent; }).join(' | '));

const diagLines = rows.map(function (r) { return Number(r.dataset.line); });
const marked = Array.from(d.getElementById('gutIn').querySelectorAll('i'))
  .map(function (el) { return Number(el.textContent); });
check('строки помечены в нумерации: ' + marked.join(', '), marked.length > 0);
check('номера совпадают с диагностикой',
  marked.join(',') === Array.from(new Set(diagLines)).sort(function (a, b) { return a - b; }).join(','),
  marked.join(',') + ' против ' + diagLines.join(','));
check('полос столько же, сколько помеченных строк',
  d.getElementById('marksIn').children.length === marked.length);

check('диагностика идёт по порядку строк',
  diagLines.every(function (l, i) { return i === 0 || l >= diagLines[i - 1]; }),
  diagLines.join(', '));
check('уровень подсветки совпадает с уровнем проблемы',
  Array.from(d.getElementById('gutIn').querySelectorAll('i')).every(function (el) {
    const row = rows.find(function (r) { return r.dataset.line === el.textContent; });
    const lv = row.className.replace('row lvl-', '');
    return el.className === 'lv-' + (lv === 'err' ? 'err' : lv);
  }));

const REPEAT = '<table>\n<tr>\n<td>первый\n<td>второй\n</tr>\n<tr>\n<td>третий\n<td>четвёртый\n</tr>\n</table>';
d.getElementById('input').value = REPEAT;
d.getElementById('btnFormat').dispatchEvent(new W.Event('click'));
const repLines = Array.from(d.querySelectorAll('#diag .row')).map(function (r) { return Number(r.dataset.line); });
check('одинаковые ошибки на разных строках не схлопываются',
  repLines.join(',') === '3,4,7,8', repLines.join(','));
check('счётчик в статус-баре считает все места',
  d.getElementById('stDiag').textContent === '4', d.getElementById('stDiag').textContent);

d.getElementById('input').value = BAD;
d.getElementById('btnFormat').dispatchEvent(new W.Event('click'));
const rows2 = Array.from(d.querySelectorAll('#diag .row'));
const line2 = Number(rows2[0].dataset.line);
rows2[0].dispatchEvent(new W.MouseEvent('click', { bubbles: true }));
check('клик по строке диагностики ставит курсор в эту строку',
  d.getElementById('input').selectionStart ===
    BAD.split('\n').slice(0, line2 - 1).join('\n').length + (line2 > 1 ? 1 : 0));

d.getElementById('input').value = BAD + '\n';
d.getElementById('input').dispatchEvent(new W.Event('input'));
check('правка ввода гасит устаревшую подсветку',
  d.getElementById('gutIn').querySelectorAll('i').length === 0 &&
  d.getElementById('marksIn').children.length === 0);

console.log('\nошибок в консоли: ' + errs.length + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
if (errs.length) failed += errs.length;
console.log('\n' + (failed ? failed + ' проверок провалено' : 'все проверки пройдены'));
process.exit(failed ? 1 : 0);
