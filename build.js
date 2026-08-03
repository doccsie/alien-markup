#!/usr/bin/env node
/* =============================================================
 *  ALIEN MARKUP — build.js
 *  Встраивает engine.js и favicon.svg внутрь index.html,
 *  чтобы приложение работало одним файлом из любого места.
 *
 *  Запуск:  node build.js
 * ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');

const dir = __dirname;
const htmlPath = path.join(dir, 'index.html');

let html = fs.readFileSync(htmlPath, 'utf8');
const engine = fs.readFileSync(path.join(dir, 'engine.js'), 'utf8');

/* --- 1. движок --- */
const START = '<!-- ENGINE:START';
const END = '<!-- ENGINE:END -->';
const s = html.indexOf(START);
const e = html.indexOf(END);
if (s === -1 || e === -1) {
  console.error('Не найдены маркеры ENGINE:START / ENGINE:END в index.html');
  process.exit(1);
}

// "</script" внутри строк разорвал бы тег — экранируем на всякий случай
const safeEngine = engine.replace(/<\/script/gi, '<\\/script');

const block =
  '<!-- ENGINE:START (собрано из engine.js командой: node build.js) -->\n' +
  '<script>\n' + safeEngine.trim() + '\n</script>\n' +
  END;

html = html.slice(0, s) + block + html.slice(e + END.length);

/* --- 2. иконка --- */
const svgPath = path.join(dir, 'favicon.svg');
if (fs.existsSync(svgPath)) {
  const svg = fs.readFileSync(svgPath, 'utf8')
    .replace(/\n\s*/g, '')
    .replace(/"/g, "'")
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E');
  html = html.replace(
    /<link rel="icon"[^>]*>/,
    '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,' + svg + '">'
  );
  html = html.replace(
    /<link rel="apple-touch-icon"[^>]*>/,
    '<link rel="apple-touch-icon" href="data:image/svg+xml,' + svg + '">'
  );
}

fs.writeFileSync(htmlPath, html);
console.log('Готово: index.html собран, ' + (html.length / 1024).toFixed(1) + ' КБ, зависимостей нет.');
