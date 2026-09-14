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

console.log('\nошибок в консоли: ' + errs.length + (errs.length ? '\n  ' + errs.join('\n  ') : ''));
if (errs.length) failed += errs.length;
console.log('\n' + (failed ? failed + ' проверок провалено' : 'все проверки пройдены'));
process.exit(failed ? 1 : 0);
