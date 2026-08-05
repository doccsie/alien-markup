const fs = require('fs');
const p = __dirname + '/engine.js';
let s = fs.readFileSync(p, 'utf8');

const ctrl = new RegExp('[' + String.fromCharCode(1) + String.fromCharCode(2) + String.fromCharCode(0xA0) + ']', 'g');
const before = (s.match(ctrl) || []).length;

s = s.replace(/var MASK = '[^']*';/, "var MASK = '\\u0001';");
s = s.replace(/var NB = '[^']*';/, "var NB = '\\u0002';");
s = s.replace(/var nbsp = opts\.nbsp === 'char' \? '[^']*' :/, "var nbsp = opts.nbsp === 'char' ? '\\u00A0' :");
s = s.replace(ctrl, '');

fs.writeFileSync(p, s);
console.log('было управляющих:', before, '| осталось:', (s.match(ctrl) || []).length);
