#!/usr/bin/env node
/* =============================================================
 *  ALIEN MARKUP — test.js
 *  Прогон движка по набору верстки. Запуск: node test.js
 *
 *  Проверяются три инварианта:
 *   1. идемпотентность  — повторное форматирование ничего не меняет;
 *   2. сохранность      — сжатие исходника и сжатие отформатированного
 *                         совпадают побайтово, значит отрисовка та же;
 *   3. починка          — repair() устраняет все найденные проблемы.
 * ============================================================= */
'use strict';

const E = require('./engine.js');

const CASES = {

  'базовый + шаблонизаторы': `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Test</title>
<!-- главный
   многострочный комментарий -->
<style>
   body { color : red;   background:#000 }
</style></head>
<body class="a   b" data-x=''>
@if($user->isAdmin())
<div class="panel"><h1>Привет, {{ $user->name }}!</h1>
<?php foreach ($items as $it): ?>
<ul><li><a href="/x" target=_blank>Ссылка <b>жирная</b> текст</a></li>
<li>{% if x %}<span>{{ y }}</span>{% else %}<span>нет</span>{% endif %}</li></ul>
<?php endforeach; ?>
</div>
@else
<p>Гость</p>
@endif
<% if user.admin? %><em>admin</em><% end %>
<img src="a.png" alt="" >
<input type=checkbox checked="checked" disabled>
<pre>
  keep   this
     exactly
</pre>
<script type="text/javascript">
    function f(){
        return \`\${a} @{b}\`;
    }
</script>
</body></html>`,

  'угловые скобки в тексте, svg, vue': `<div class="{{ cond ? 'a>b' : 'c' }}" @click="go(1>2)" :style="{width: x + 'px'}">
  <span>5 < 6 и 7 > 3</span>
  <ul>
  {{#each items}}
    <li>{{name}}</li>
  {{else}}
    <li>пусто</li>
  {{/each}}
  </ul>
<svg viewBox="0 0 10 10"><linearGradient id="g"/><path d="M0 0L1 1"/></svg>
<a href="#">x</a><a href="#">y</a>
<textarea>  raw
  text </textarea>
<my-component v-for="i in 3" :key="i"></my-component>
</div>`,

  'многострочные вставки и php': `<td>
@{for cell in row.Cells}
@{if cell.Value.Product != null and counter
< 40}
@{set counter = counter + 1}
<div class="mw48"><span>\${cell.Value.Product.Name}</span></div>
@{end if}
@{end for}
</td>
<p>условие a < b и c > d прямо в тексте</p>
<div class="one
   two    three" style="color: red;
   padding: 0">x</div>
<?php
  // комментарий
  if ($x) {
?>
<span>да</span>
<?php } ?>`,

  'длинная вставка в скобках': `<td>
@{else if Count(Recipient.GetProductList("Korzina").FilterBySegment("SKU635final").SinglePerGroup.Take(100)) >= 3 and Count(Recipient.GetProductList("Korzina").FilterBySegment("SKU635final").SinglePerGroup.Take(100))
< 5}
@{if counter < 40}
<span>\${cell.Value.Product.Name}</span>
@{end if}
</td>`,

  'условные комментарии Outlook': `<table>
<tr>
<td style="text-align:center;">
<!--[if (gte mso 9)|(IE)]>
<table align="center" width="634" border="0" cellspacing="0" cellpadding="0">
<tr>
<td width="634" valign="top">
<![endif]-->
<div style="display:inline-block;max-width:634px;">
<table border="0" cellspacing="0" cellpadding="0" width="100%">
<tr>
<td style="color:#808285;font-size:12px;">
АО &laquo;ДПД РУС&raquo;, ИНН 7713523. <br class="dn" />Если вы&nbsp;хотите отписаться, нажмите <a href="*|link|*" style="color:#dc0032;">сюда</a>.
</td>
</tr>
</table>
</div>
<!--[if (gte mso 9)|(IE)]>
</td>
</tr>
</table>
<![endif]-->
</td>
</tr>
</table>
<!--
   старый блок, временно отключён
   <div class="promo"><p>Скидка <b>50%</b></p></div>
-->`,

  'строчное содержимое не рвётся': `<table>
<tr>
<td style="color: #6f757e;">ООО &laquo;Меркури Мода&raquo; 14<span>30</span>82, Мос<span>ковска</span>я обл., <span style="white-space: nowrap;">г. Оди<span>нцово</span>, д. Бар</span>виха, д.&nbsp;114 <span style="white-space: nowrap;">ОГРН 11<span>45</span>03<span>20</span>0</span></td>
</tr>
<tr>
<td>текст до <b>жирный</b> текст после<div>блок внутри</div>текст в конце<img src="x.png" alt=""></td>
</tr>
</table>`
};

const BROKEN = `<table>
<tr>
<td class="a">первый</td>
<td class="b">второй
</tr
<tr>
<td>третий</td>
</span>
<td class="c"
<span>четвёртый</span>
</td>
</tr>
</table>
<div><p>абзац без закрытия
</div>`;

let failed = 0;

function check(name, cond, detail) {
  if (!cond) { failed++; console.log('  ✗ ' + name + (detail ? '\n      ' + detail : '')); }
  else console.log('  ✓ ' + name);
}

function diff(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      return 'позиция ' + i +
        '\n      было:  ' + JSON.stringify(a.slice(Math.max(0, i - 40), i + 40)) +
        '\n      стало: ' + JSON.stringify(b.slice(Math.max(0, i - 40), i + 40));
    }
  }
  return '';
}

console.log('ALIEN MARKUP — проверка движка\n');

Object.keys(CASES).forEach(function (name) {
  const src = CASES[name];
  const first = E.beautify(src);
  const second = E.beautify(first.code);
  const m1 = E.minify(src, 2);
  const m2 = E.minify(first.code, 2);

  console.log(name + ':');
  check('идемпотентность', first.code === second.code, diff(first.code, second.code));
  check('отрисовка не изменилась', m1 === m2, diff(m1, m2));
  check('проблем с тегами нет', E.checkTags(src).length === 0,
    E.checkTags(src).map(function (w) { return w.msg; }).join('; '));
  check('repair не трогает исправный код', E.repair(src).code === first.code);

  const sizes = [1, 2, 3].map(function (l) { return E.minify(src, l).length; });
  check('сжатие уменьшает объём: ' + src.length + ' → ' + sizes.join(' / '),
    sizes[0] <= src.length && sizes[2] <= sizes[1] && sizes[1] <= sizes[0]);
  console.log('');
});

console.log('битая верстка:');
const found = E.checkTags(BROKEN);
check('проблемы найдены (' + found.length + ')', found.length === 6,
  found.map(function (w) { return w.msg; }).join('; '));
const fixedRes = E.repair(BROKEN);
check('починка выполнена (' + fixedRes.fixes.length + ')', fixedRes.fixes.length === 5,
  fixedRes.fixes.map(function (f) { return f.msg; }).join('; '));
check('после починки проблем не осталось', E.checkTags(fixedRes.code).length === 0);
check('результат идемпотентен', E.beautify(fixedRes.code).code === fixedRes.code);

console.log('\n' + (failed ? failed + ' проверок провалено' : 'все проверки пройдены'));
process.exit(failed ? 1 : 0);
