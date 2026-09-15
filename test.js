#!/usr/bin/env node
/* =============================================================
 *  ALIEN MARKUP — test.js
 *  Прогон движка по набору верстки. Запуск: node test.js
 *
 *  Проверяются два инварианта:
 *   1. идемпотентность  — повторное форматирование ничего не меняет;
 *   2. сохранность      — сжатие исходника и сжатие отформатированного
 *                         совпадают побайтово, значит отрисовка та же.
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

  'вложенные кавычки в шаблонной вставке': `<td style="text-align: center;">
<center><a href="\${Products.SearchInIdentity("item").GetByValue("13823630").Url}" target="_blank" style="text-decoration: none;"><img class="mw89" src="\${Products.SearchInIdentity("item").GetByValue("13823630").CustomField.html400}" style="border: 0; max-width: 150px;" width="150" alt=""></a></center>
</td>
<td style="color: #1b1b1b;"><a href="\${Products.SearchInIdentity("item").GetByValue("13823630").Url}" style="color: #1b1b1b;">\${Products.SearchInIdentity("item").GetByValue("13823630").VendorName}</a></td>
<a href="{{ url("route", {"id": 5}) }}">twig</a>
<div data-x="<?php echo "a"; ?>">php</div>
<span title="незакрытая \${вставка">край</span>`,

  'директивы шаблонизатора построчно': `<td>
@{set counter = 0} @{if Recipient.Sex.IsMale} @{for item in Recipient.GetProductList("L").Take(5)} @{if counter = 0} @{set brand1 = item.Product.VendorName} @{end if} @{end for} @{else} @{set counter = 1} @{end if} @{if counter = 2} Последние поступления \${brand1} и\&nbsp;не\&nbsp;только @{else} <span>нет</span>@{end if}
</td>
<p>{% if x %}5{% else %}6{% endif %} и \${inline} внутри текста</p>`,

  'строчное содержимое не рвётся': `<table>
<tr>
<td style="color: #6f757e;">ООО &laquo;Меркури Мода&raquo; 14<span>30</span>82, Мос<span>ковска</span>я обл., <span style="white-space: nowrap;">г. Оди<span>нцово</span>, д. Бар</span>виха, д.&nbsp;114 <span style="white-space: nowrap;">ОГРН 11<span>45</span>03<span>20</span>0</span></td>
</tr>
<tr>
<td>текст до <b>жирный</b> текст после<div>блок внутри</div>текст в конце<img src="x.png" alt=""></td>
</tr>
</table>`
};

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
  check('атрибуты не искажены', first.code.indexOf('(" ') === -1 && first.code.indexOf(' ")') === -1,
    'в значение атрибута вклинился пробел');

  const sizes = [1, 2, 3].map(function (l) { return E.minify(src, l).length; });
  check('сжатие уменьшает объём: ' + src.length + ' → ' + sizes.join(' / '),
    sizes[0] <= src.length && sizes[2] <= sizes[1] && sizes[1] <= sizes[0]);
  console.log('');
});

console.log('типографика:');
const TYPO_SRC = '<p>Компания  "Меркури"   работает с 2010-2024 годов . Цена -- 10 000 руб, ' +
  'вес 5 кг, скидка 20 %.</p>\n<p>Товар № 5, размер 10 x 20 см (c) 2024</p>\n' +
  '<p>А. С. Пушкин и  М. Ю. Лермонтов</p>\n<code>если a - b, то "код" не трогаем</code>\n' +
  '<pre>  тоже   не   трогаем  "тут"</pre>\n<p>Скидка {{ discount }} на товар, у нас в магазине</p>\n' +
  '<p>Уже&nbsp;неразрывный и&nbsp;ещё</p>\n<a href="/x?a=1&amp;b=2">ссылка на  сайт</a>';

const typo = E.typography(TYPO_SRC);
const skeleton = function (s) { return E.minify(s, 3).replace(/>[^<]*/g, '>'); };

check('кавычки-ёлочки', typo.code.indexOf('«Меркури»') !== -1);
check('двойной дефис → тире с неразрывным', typo.code.indexOf('Цена&nbsp;—') !== -1);
check('диапазон через короткое тире', typo.code.indexOf('2010–2024') !== -1);
check('разряды числа не рвутся', typo.code.indexOf('10&nbsp;000') !== -1);
check('предлог не отрывается', typo.code.indexOf('с&nbsp;2010') !== -1);
check('единица измерения не склеена со следующим словом', typo.code.indexOf('см&nbsp;©') === -1);
check('номер и знаки', typo.code.indexOf('№&nbsp;5') !== -1 && typo.code.indexOf('10×20') !== -1);
check('инициалы', typo.code.indexOf('А.&nbsp;С.&nbsp;Пушкин') !== -1);
check('внутри <code> не тронуто', typo.code.indexOf('если a - b, то "код"') !== -1);
check('внутри <pre> не тронуто', typo.code.indexOf('  тоже   не   трогаем  "тут"') !== -1);
check('шаблонная вставка цела', typo.code.indexOf('{{ discount }}') !== -1);
check('сущности целы', typo.code.indexOf('&amp;b=2') !== -1);
check('разметка не изменилась', skeleton(TYPO_SRC) === skeleton(typo.code));
check('идемпотентность', E.typography(typo.code).code === typo.code);
console.log('');

console.log('директивы шаблонизатора:');
const DIR = CASES['директивы шаблонизатора построчно'];
const dirOut = E.beautify(DIR).code;
const dirLines = dirOut.split('\n').filter(function (l) { return l.trim(); });

check('каждая директива на своей строке',
  dirLines.filter(function (l) { return (l.match(/@\{/g) || []).length > 1; }).length === 0,
  dirLines.filter(function (l) { return (l.match(/@\{/g) || []).length > 1; }).join(' | '));
check('текст с подстановками не порван',
  dirOut.indexOf('Последние поступления ${brand1} и&nbsp;не&nbsp;только') !== -1);
check('слитный блок не разорван внутри',
  dirOut.indexOf('{% if x %}5{% else %}6{% endif %}') !== -1);
check('подстановка осталась в тексте',
  dirOut.indexOf('и ${inline} внутри текста') !== -1);
check('пробел не добавлен перед слитной директивой',
  dirOut.indexOf('<span>нет</span>@{end if}') !== -1);
console.log('');

console.log('\n' + (failed ? failed + ' проверок провалено' : 'все проверки пройдены'));
process.exit(failed ? 1 : 0);
