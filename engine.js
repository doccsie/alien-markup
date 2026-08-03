/* =============================================================
 *  ALIEN MARKUP — engine.js
 *  HTML beautifier / minifier with template-language awareness.
 *  Zero dependencies. Works in the browser and in Node.
 * ============================================================= */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AMEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------------------------------------------------------- *
   * 1. Tag dictionaries
   * ---------------------------------------------------------- */

  var VOID = new Set(('area base br col embed hr img input link meta param source ' +
    'track wbr command keygen basefont frame isindex').split(' '));

  var RAW_TEXT = new Set(['script', 'style']);      // content preserved, re-indented
  var PRE_TEXT = new Set(['pre', 'textarea']);      // content preserved byte-for-byte

  var INLINE = new Set(('a abbr acronym b bdi bdo big br button cite code data datalist ' +
    'del dfn em font i img input ins kbd label map mark meter noscript object output ' +
    'picture progress q ruby s samp select small span strike strong sub sup svg template ' +
    'textarea time tt u var video audio wbr').split(' '));

  var HTML_TAGS = new Set(('a abbr address area article aside audio b base bdi bdo big ' +
    'blockquote body br button canvas caption cite code col colgroup data datalist dd del ' +
    'details dfn dialog div dl dt em embed fieldset figcaption figure footer form h1 h2 h3 ' +
    'h4 h5 h6 head header hgroup hr html i iframe img input ins kbd label legend li link ' +
    'main map mark menu meta meter nav noscript object ol optgroup option output p param ' +
    'picture pre progress q rp rt ruby s samp script search section select slot small source ' +
    'span strong style sub summary sup table tbody td template textarea tfoot th thead time ' +
    'title tr track u ul var video wbr').split(' '));

  var BOOLEAN_ATTRS = new Set(('allowfullscreen async autofocus autoplay checked controls ' +
    'default defer disabled formnovalidate hidden inert ismap itemscope loop multiple muted ' +
    'nomodule novalidate open playsinline readonly required reversed selected').split(' '));

  /* ---------------------------------------------------------- *
   * 2. Template language detection
   * ---------------------------------------------------------- */

  // Blade / generic at-directives that open a nesting level
  var AT_OPEN = new Set(('if unless foreach for forelse while switch section push prepend ' +
    'once auth guest can cannot canany isset empty verbatim error env production hasSection ' +
    'sectionMissing php slot component fragment prependOnce pushOnce').split(' '));
  var AT_MID = new Set(('else elseif elseIf empty case default emptyElse').split(' '));

  // {% ... %} openers (Jinja / Twig / Django / Liquid / Nunjucks)
  var CURLY_OPEN = new Set(('if for foreach while block with unless each switch macro filter ' +
    'raw verbatim section forelse auth guest push prepend once can spaceless apply embed ' +
    'comment autoescape blocktrans blocktranslate ifchanged capture form tablerow schema ' +
    'javascript stylesheet paginate').split(' '));
  var CURLY_MID = new Set(('else elseif elif empty otherwise when case default ifchanged ' +
    'plural').split(' '));

  var ERB_OPEN = /^\s*(if|unless|for|while|until|case|begin|module|class|def)\b|(\bdo\b\s*(\|[^|]*\|)?\s*)$|\{\s*(\|[^|]*\|)?\s*$/;
  var ERB_CLOSE = /^\s*(end|\})\b|^\s*end\s*$/;
  var ERB_MID = /^\s*(else|elsif|elseif|when|rescue|ensure)\b/;

  /* ---------------------------------------------------------- *
   * 3. Tokenizer
   * ---------------------------------------------------------- */

  function isWS(c) { return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f'; }

  // Scan a balanced {...} starting at i (src[i] === '{'), quote-aware.
  function scanBraces(src, i) {
    var depth = 0, q = null;
    for (var j = i; j < src.length; j++) {
      var c = src[j];
      if (q) {
        if (c === '\\') { j++; continue; }
        if (c === q) q = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return j + 1; }
    }
    return src.length;
  }

  function scanParens(src, i) {
    var depth = 0, q = null;
    for (var j = i; j < src.length; j++) {
      var c = src[j];
      if (q) {
        if (c === '\\') { j++; continue; }
        if (c === q) q = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if (c === '(') depth++;
      else if (c === ')') { depth--; if (depth === 0) return j + 1; }
    }
    return src.length;
  }

  var AT_KNOWN = new Set(Array.from(AT_OPEN).concat(Array.from(AT_MID)).concat(
    ('endif endunless endforeach endfor endforelse endwhile endswitch endsection endpush ' +
      'endprepend endonce endauth endguest endcan endcannot endcanany endisset endempty ' +
      'endverbatim enderror endenv endproduction endphp endslot endcomponent endfragment ' +
      'endhasSection endsectionMissing endcapture stop show yield extends include includeIf ' +
      'includeWhen csrf method json dd dump break continue parent props class style checked ' +
      'selected disabled required lang livewire vite viteReactRefresh').split(' ')));

  /**
   * Detects a template token starting at position i.
   * Returns { v, end, k } or null.
   */
  function matchTplAt(src, i) {
    var c = src[i], c2 = src[i + 1], e;

    if (c === '<' && c2 === '?') {
      e = src.indexOf('?>', i + 2);
      e = e === -1 ? src.length : e + 2;
      return { v: src.slice(i, e), end: e, k: 'php' };
    }
    if (c === '<' && c2 === '%') {
      e = src.indexOf('%>', i + 2);
      e = e === -1 ? src.length : e + 2;
      return { v: src.slice(i, e), end: e, k: 'erb' };
    }
    if (c === '{' && c2 === '{') {
      var triple = src[i + 2] === '{';
      var closer = triple ? '}}}' : '}}';
      e = src.indexOf(closer, i + 2);
      e = e === -1 ? src.length : e + closer.length;
      return { v: src.slice(i, e), end: e, k: 'mustache' };
    }
    if (c === '{' && c2 === '%') {
      e = src.indexOf('%}', i + 2);
      e = e === -1 ? src.length : e + 2;
      return { v: src.slice(i, e), end: e, k: 'curly' };
    }
    if (c === '{' && c2 === '#') {
      e = src.indexOf('#}', i + 2);
      e = e === -1 ? src.length : e + 2;
      return { v: src.slice(i, e), end: e, k: 'curlycomment' };
    }
    if (c === '$' && c2 === '{') {
      e = scanBraces(src, i + 1);
      return { v: src.slice(i, e), end: e, k: 'interp' };
    }
    if (c === '@' && c2 === '{') {
      e = scanBraces(src, i + 1);
      return { v: src.slice(i, e), end: e, k: 'atbrace' };
    }
    if (c === '@' && c2 === '@') {          // @@escaped blade
      return { v: src.slice(i, i + 2), end: i + 2, k: 'text' };
    }
    if (c === '@' && /[a-zA-Z]/.test(c2 || '')) {
      var prev = i > 0 ? src[i - 1] : '\n';
      // avoid matching e-mails / handles inside words
      if (/[\w.\-@]/.test(prev)) return null;
      var m = /^@([a-zA-Z_][\w]*)/.exec(src.slice(i));
      if (!m) return null;
      var name = m[1];
      var j = i + m[0].length;
      var hasArgs = src[j] === '(';
      if (!hasArgs && !AT_KNOWN.has(name)) return null;
      if (hasArgs) j = scanParens(src, j);
      return { v: src.slice(i, j), end: j, k: 'at', name: name };
    }
    return null;
  }

  function parseTag(src, i) {
    var m = /^<([a-zA-Z][\w:.\-]*)/.exec(src.slice(i));
    if (!m) return null;
    var rawName = m[1];
    var j = i + m[0].length;
    var attrs = [];
    var self = false;
    var n = src.length;

    while (j < n) {
      while (j < n && isWS(src[j])) j++;
      if (j >= n) break;
      if (src[j] === '>') { j++; break; }
      if (src[j] === '/' && src[j + 1] === '>') { self = true; j += 2; break; }

      var tpl = matchTplAt(src, j);
      if (tpl) { attrs.push({ raw: tpl.v, tpl: true }); j = tpl.end; continue; }

      var ns = j;
      while (j < n && !isWS(src[j]) && src[j] !== '=' && src[j] !== '>' &&
             !(src[j] === '/' && src[j + 1] === '>')) {
        var t2 = matchTplAt(src, j);
        if (t2) { j = t2.end; continue; }
        j++;
      }
      var aname = src.slice(ns, j);
      if (!aname) { j++; continue; }

      var value = null, quote = '';
      var k = j;
      while (k < n && isWS(src[k])) k++;
      if (src[k] === '=') {
        k++;
        while (k < n && isWS(src[k])) k++;
        if (src[k] === '"' || src[k] === "'") {
          quote = src[k];
          var e = src.indexOf(quote, k + 1);
          var end = e === -1 ? n : e;
          value = src.slice(k + 1, end);
          k = end + 1;
        } else {
          var vs = k;
          while (k < n && !isWS(src[k]) && src[k] !== '>') {
            var t3 = matchTplAt(src, k);
            if (t3) { k = t3.end; continue; }
            k++;
          }
          value = src.slice(vs, k);
          if (value.length > 1 && value.slice(-1) === '/' && src[k] === '>') {
            value = value.slice(0, -1);
            self = true;
          }
        }
        j = k;
      }
      attrs.push({ name: aname, value: value, quote: quote || '"' });
    }

    var lower = rawName.toLowerCase();
    return {
      token: {
        t: 'open',
        name: lower,
        rawName: rawName,
        attrs: attrs,
        self: self || VOID.has(lower),
        void: VOID.has(lower)
      },
      end: j
    };
  }

  function tokenize(src) {
    var toks = [], i = 0, n = src.length, buf = '';

    function flush() { if (buf) { toks.push({ t: 'text', v: buf }); buf = ''; } }

    while (i < n) {
      var c = src[i];

      if (c === '<') {
        if (src.startsWith('<!--', i)) {
          var e = src.indexOf('-->', i + 4);
          e = e === -1 ? n : e + 3;
          flush(); toks.push({ t: 'comment', v: src.slice(i, e) }); i = e; continue;
        }
        if (src.startsWith('<![', i)) {                     // CDATA / downlevel-revealed
          var ce = src.indexOf(']>', i);
          ce = ce === -1 ? n : ce + 2;
          flush(); toks.push({ t: 'comment', v: src.slice(i, ce), keep: true }); i = ce; continue;
        }
        if (src.startsWith('<!', i)) {
          var de = src.indexOf('>', i);
          de = de === -1 ? n : de + 1;
          flush(); toks.push({ t: 'doctype', v: src.slice(i, de) }); i = de; continue;
        }
        if (src[i + 1] === '?' || src[i + 1] === '%') {
          var tp = matchTplAt(src, i);
          flush(); toks.push({ t: 'tpl', v: tp.v, k: tp.k }); i = tp.end; continue;
        }
        if (src.startsWith('</', i)) {
          var cm = /^<\/\s*([a-zA-Z][\w:.\-]*)\s*>/.exec(src.slice(i));
          if (cm) {
            flush();
            toks.push({ t: 'close', name: cm[1].toLowerCase(), rawName: cm[1] });
            i += cm[0].length; continue;
          }
        }
        if (/[a-zA-Z]/.test(src[i + 1] || '')) {
          var parsed = parseTag(src, i);
          if (parsed) {
            flush();
            toks.push(parsed.token);
            i = parsed.end;
            var nm = parsed.token.name;
            if (!parsed.token.self && (RAW_TEXT.has(nm) || PRE_TEXT.has(nm))) {
              var re = new RegExp('</\\s*' + nm + '\\s*>', 'i');
              var mm = re.exec(src.slice(i));
              var stop = mm ? i + mm.index : n;
              toks.push({ t: 'raw', v: src.slice(i, stop), name: nm });
              i = stop;
            }
            continue;
          }
        }
        buf += c; i++; continue;
      }

      var t = matchTplAt(src, i);
      if (t) {
        if (t.k === 'text') { buf += t.v; i = t.end; continue; }
        flush();
        toks.push({ t: 'tpl', v: t.v, k: t.k, name: t.name });
        i = t.end; continue;
      }

      buf += c; i++;
    }
    flush();
    return toks;
  }

  /* ---------------------------------------------------------- *
   * 4. Template block classification
   * ---------------------------------------------------------- */

  function netBraces(s) {
    var d = 0, q = null;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (q) { if (c === '\\') { i++; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if (c === '{') d++;
      else if (c === '}') d--;
    }
    return d;
  }

  function classifyTpl(tok) {
    var v = tok.v, k = tok.k, inner;

    if (k === 'php') {
      inner = v.replace(/^<\?(php|=)?/, '').replace(/\?>$/, '');
      var body = inner.trim();
      if (/^\}\s*(else|elseif|catch|finally)\b/.test(body)) return 'mid';
      if (/^(else|elseif|elif)\b/.test(body) && /:\s*$/.test(body)) return 'mid';
      if (/^(else|elseif)\s*:?\s*$/.test(body)) return 'mid';
      if (/\b(endif|endforeach|endfor|endwhile|endswitch)\s*;?\s*$/.test(body)) return 'close';
      if (/\b(if|foreach|for|while|switch)\s*\(.*\)\s*:\s*$/.test(body)) return 'open';
      var nb = netBraces(body);
      if (nb > 0) return 'open';
      if (nb < 0) return 'close';
      return 'leaf';
    }

    if (k === 'erb') {
      inner = v.replace(/^<%[-=#]?/, '').replace(/[-]?%>$/, '');
      if (/^\s*#/.test(inner)) return 'leaf';
      if (ERB_MID.test(inner)) return 'mid';
      if (ERB_CLOSE.test(inner)) return 'close';
      if (ERB_OPEN.test(inner)) return 'open';
      return 'leaf';
    }

    if (k === 'curly') {
      inner = v.replace(/^\{%[-~]?/, '').replace(/[-~]?%\}$/, '').trim();
      var w = (/^([a-zA-Z_][\w]*)/.exec(inner) || [, ''])[1];
      if (/^end/.test(w) || w === 'endblock') return 'close';
      if (CURLY_MID.has(w)) return 'mid';
      if (CURLY_OPEN.has(w)) {
        // Twig inline forms like {% set x = 1 %} are not blocks
        if (w === 'block' && /%\}$/.test(v) && /\bblock\s+\w+\s+\S/.test(inner)) return 'leaf';
        return 'open';
      }
      return 'leaf';
    }

    if (k === 'mustache') {
      inner = v.replace(/^\{\{+[~]?/, '').replace(/[~]?\}\}+$/, '').trim();
      if (/^#/.test(inner)) return 'open';
      if (/^\//.test(inner)) return 'close';
      if (/^(else|\^)/.test(inner)) return 'mid';
      return 'leaf';
    }

    // @{ ... } blocks (Mindbox / Postal и подобные)
    if (k === 'atbrace') {
      inner = v.replace(/^@\{/, '').replace(/\}$/, '').replace(/\s+/g, ' ').trim();
      if (/^(end|\/)\s*(if|for|foreach|while|switch|unless|with|block|repeat)?\b/i.test(inner)) return 'close';
      if (/^(else|elseif|elsif|else\s+if)\b/i.test(inner)) return 'mid';
      if (/^(if|for|foreach|while|switch|unless|with|block|repeat)\b/i.test(inner)) return 'open';
      return 'leaf';
    }

    if (k === 'at') {
      var nm = tok.name || '';
      if (/^end/.test(nm) || nm === 'stop' || nm === 'show') return 'close';
      if (AT_MID.has(nm)) return 'mid';
      if (AT_OPEN.has(nm)) return 'open';
      return 'leaf';
    }

    return 'leaf';
  }

  /* ---------------------------------------------------------- *
   * 5. Tree
   * ---------------------------------------------------------- */

  function buildTree(toks) {
    var root = { type: 'root', children: [] };
    var stack = [root];
    var warnings = [];

    function cur() { return stack[stack.length - 1]; }
    function add(node) { cur().children.push(node); }

    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i];

      if (tk.t === 'open') {
        var node = { type: 'el', name: tk.name, tok: tk, children: [] };
        add(node);
        if (!tk.self) stack.push(node);
        continue;
      }

      if (tk.t === 'close') {
        var idx = -1;
        for (var s = stack.length - 1; s > 0; s--) {
          if (stack[s].type === 'el' && stack[s].name === tk.name) { idx = s; break; }
        }
        if (idx === -1) {
          warnings.push({ level: 'err', msg: 'Закрывающий тег без пары: </' + tk.name + '>' });
          add({ type: 'stray', tok: tk });
        } else {
          for (var p = stack.length - 1; p > idx; p--) {
            if (stack[p].type === 'el') {
              warnings.push({ level: 'warn', msg: 'Незакрытый тег <' + stack[p].name + '> внутри <' + tk.name + '>' });
            } else {
              warnings.push({ level: 'warn', msg: 'Незакрытый блок ' + short(stack[p].tok.v) });
            }
          }
          stack[idx].closed = true;
          stack.length = idx;
        }
        continue;
      }

      if (tk.t === 'raw') { add({ type: 'raw', tok: tk }); continue; }
      if (tk.t === 'text') { add({ type: 'text', tok: tk }); continue; }
      if (tk.t === 'comment') { add({ type: 'comment', tok: tk }); continue; }
      if (tk.t === 'doctype') { add({ type: 'doctype', tok: tk }); continue; }

      if (tk.t === 'tpl') {
        var cls = classifyTpl(tk);
        if (cls === 'open') {
          var tn = { type: 'tpl', tok: tk, children: [] };
          add(tn); stack.push(tn);
        } else if (cls === 'close') {
          var ti = -1;
          for (var q = stack.length - 1; q > 0; q--) {
            if (stack[q].type === 'tpl') { ti = q; break; }
          }
          if (ti === -1) {
            add({ type: 'tplleaf', tok: tk });
          } else {
            for (var r = stack.length - 1; r > ti; r--) {
              if (stack[r].type === 'el') {
                warnings.push({ level: 'warn', msg: 'Тег <' + stack[r].name + '> не закрыт внутри шаблонного блока' });
              }
            }
            stack[ti].closeTok = tk;
            stack.length = ti;
          }
        } else if (cls === 'mid') {
          var mi = -1;
          for (var z = stack.length - 1; z > 0; z--) {
            if (stack[z].type === 'tpl') { mi = z; break; }
          }
          if (mi === stack.length - 1) add({ type: 'tplmid', tok: tk });
          else add({ type: 'tplleaf', tok: tk });
        } else {
          add({ type: 'tplleaf', tok: tk });
        }
        continue;
      }
    }

    for (var f = stack.length - 1; f > 0; f--) {
      if (stack[f].type === 'el') {
        warnings.push({ level: 'err', msg: 'Тег <' + stack[f].name + '> так и не закрыт' });
      } else {
        warnings.push({ level: 'err', msg: 'Шаблонный блок ' + short(stack[f].tok.v) + ' не закрыт' });
      }
    }

    return { root: root, warnings: warnings };
  }

  function short(s) {
    s = String(s).replace(/\s+/g, ' ').trim();
    return s.length > 28 ? s.slice(0, 28) + '…' : s;
  }

  /* ---------------------------------------------------------- *
   * 6. Serialisation helpers
   * ---------------------------------------------------------- */

  function tagName(tok, opts) {
    if (opts && opts.lowercase && HTML_TAGS.has(tok.name)) return tok.name;
    return HTML_TAGS.has(tok.name) ? tok.name : tok.rawName;
  }

  function attrToString(a, opts) {
    if (a.tpl) return a.raw;
    if (a.value === null) return a.name;
    var q = a.quote || '"';
    var v = a.value;
    // многострочные class/style/srcset схлопываем — иначе разметка «уезжает» влево
    if (v.indexOf('\n') !== -1 && /^(class|style|srcset|sizes)$/i.test(a.name)) {
      v = v.replace(/\s+/g, ' ').trim();
    }
    if (opts && opts.unquote && v !== '' && /^[^\s"'`=<>]+$/.test(v) && !/\/$/.test(v)) return a.name + '=' + v;
    if (v.indexOf('"') !== -1 && v.indexOf("'") === -1) q = "'";
    else if (q === "'" && v.indexOf("'") !== -1) q = '"';
    else if (!opts || !opts.keepQuoteStyle) q = v.indexOf('"') !== -1 ? "'" : '"';
    return a.name + '=' + q + v + q;
  }

  function openTag(tok, opts) {
    opts = opts || {};
    var name = tagName(tok, opts);
    var parts = [];
    var attrs = tok.attrs;

    if (opts.dropAttrs) attrs = optimiseAttrs(tok, attrs);

    for (var i = 0; i < attrs.length; i++) {
      var s = attrToString(attrs[i], opts);
      if (s) parts.push(s);
    }
    var body = parts.length ? name + ' ' + parts.join(' ') : name;
    // foreign content (SVG/MathML) and custom elements must keep the slash
    if (tok.self && !tok.void) return '<' + body + ' />';
    if (tok.void) return '<' + body + '>';
    return '<' + body + '>';
  }

  function optimiseAttrs(tok, attrs) {
    var out = [];
    for (var i = 0; i < attrs.length; i++) {
      var a = attrs[i];
      if (a.tpl) { out.push(a); continue; }
      var ln = (a.name || '').toLowerCase();
      var val = a.value === null ? null : a.value.trim();

      // empty, meaningless attributes
      if (val === '' && (ln === 'class' || ln === 'style' || ln === 'id' || ln === 'title')) continue;
      // redundant type declarations
      if (tok.name === 'script' && ln === 'type' && /^(text\/javascript|application\/javascript)$/i.test(val || '')) continue;
      if (tok.name === 'style' && ln === 'type' && /^text\/css$/i.test(val || '')) continue;
      if (tok.name === 'link' && ln === 'type' && /^text\/css$/i.test(val || '')) continue;
      if (ln === 'language' && tok.name === 'script') continue;
      if (tok.name === 'form' && ln === 'method' && /^get$/i.test(val || '')) continue;
      // boolean attributes
      if (BOOLEAN_ATTRS.has(ln) && (val === '' || (val || '').toLowerCase() === ln || (val || '').toLowerCase() === 'true')) {
        out.push({ name: a.name, value: null, quote: '"' });
        continue;
      }
      if (val !== null && (ln === 'class' || ln === 'style')) {
        val = val.replace(/\s+/g, ' ').trim();
        if (ln === 'style') val = val.replace(/\s*;\s*$/, '').replace(/\s*:\s*/g, ':').replace(/\s*;\s*/g, ';');
      }
      out.push({ name: a.name, value: val, quote: a.quote });
    }
    return dedupe(out);
  }

  function dedupe(attrs) {
    var seen = Object.create(null), out = [];
    for (var i = 0; i < attrs.length; i++) {
      var a = attrs[i];
      if (a.tpl) { out.push(a); continue; }
      var key = (a.name || '').toLowerCase();
      if (seen[key]) continue;
      seen[key] = 1;
      out.push(a);
    }
    return out;
  }

  function closeTag(node, opts) {
    return '</' + tagName(node.tok, opts) + '>';
  }

  /* ---------------------------------------------------------- *
   * 7. Beautifier
   * ---------------------------------------------------------- */

  var SENTINEL = '';   // private-use char: never appears in real markup

  // Вставки в фигурных скобках считаем атомарной строкой: всегда одна строка,
  // содержимое не разбирается и не переносится.
  var BRACE_TPL = { atbrace: 1, interp: 1, mustache: 1, curly: 1 };

  var DEFAULTS = {
    indent: '  ',
    inlineMax: 100,
    keepBlankLines: false,
    lowercase: false
  };

  function isInlineNode(node) {
    if (node.type === 'text') return true;
    if (node.type === 'tplleaf') return true;
    if (node.type === 'el') return INLINE.has(node.name) && node.name !== 'textarea' && node.name !== 'svg';
    return false;
  }

  function nodeLength(node) {
    if (node.type === 'text') return node.tok.v.replace(/\s+/g, ' ').trim().length;
    if (node.type === 'tplleaf') return node.tok.v.length;
    if (node.type === 'el') {
      var len = openTag(node.tok).length + (node.tok.self ? 0 : closeTag(node).length);
      for (var i = 0; i < node.children.length; i++) len += nodeLength(node.children[i]);
      return len;
    }
    if (node.type === 'comment') return node.tok.v.length;
    return 0;
  }

  function canInline(node, opts) {
    if (node.type !== 'el') return false;
    if (RAW_TEXT.has(node.name) || PRE_TEXT.has(node.name)) return false;
    var kids = node.children.filter(function (c) {
      return !(c.type === 'text' && !c.tok.v.trim());
    });
    if (!kids.length) return true;

    var hasElement = false;
    for (var i = 0; i < kids.length; i++) {
      var c = kids[i];
      if (!isInlineNode(c)) return false;
      if (c.type === 'el') {
        hasElement = true;
        if (!canInline(c, opts)) return false;
      }
    }
    // pure text / interpolation content — always keep on a single line
    if (!hasElement) return true;
    return nodeLength(node) + 0 <= opts.inlineMax;
  }

  function inlineRender(node, opts) {
    var out = '';
    for (var i = 0; i < node.children.length; i++) {
      var c = node.children[i];
      if (c.type === 'text') {
        var raw = c.tok.v;
        var collapsed = raw.replace(/\s+/g, ' ');
        if (i === 0) collapsed = collapsed.replace(/^\s+/, '');
        if (i === node.children.length - 1) collapsed = collapsed.replace(/\s+$/, '');
        out += collapsed;
      } else if (c.type === 'tplleaf' || c.type === 'tplmid') {
        out += c.tok.v;
      } else if (c.type === 'el') {
        out += openTag(c.tok, opts) + (c.tok.self ? '' : inlineRender(c, opts) + closeTag(c, opts));
      } else if (c.type === 'comment') {
        out += c.tok.v;
      } else if (c.type === 'raw') {
        out += c.tok.v;
      }
    }
    return out;
  }

  function reindentBlock(text, pad) {
    var lines = text.replace(/\t/g, '    ').split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    if (!lines.length) return [];
    var min = Infinity;
    lines.forEach(function (l) {
      if (!l.trim()) return;
      var m = /^ */.exec(l)[0].length;
      if (m < min) min = m;
    });
    if (min === Infinity) min = 0;
    return lines.map(function (l) {
      return l.trim() ? pad + l.slice(min).replace(/\s+$/, '') : '';
    });
  }

  function beautify(src, options) {
    var opts = Object.assign({}, DEFAULTS, options || {});
    var toks = tokenize(src);
    var built = buildTree(toks);
    var lines = [];
    var protectedChunks = [];

    function pad(d) { return opts.indent.repeat(Math.max(0, d)); }
    function push(d, s) { lines.push(pad(d) + s); }

    // Многострочная шаблонная вставка: первая строка на своём уровне,
    // продолжение — с отступом, чтобы ничего не прилипало к левому краю.
    function pushTpl(d, tok) {
      var v = tok.v;
      if (v.indexOf('\n') === -1) { push(d, squishTpl(v)); return; }

      var oneLine = v.replace(/\s*\n\s*/g, ' ').replace(/[ \t]{2,}/g, ' ');

      // Вставка в фигурных скобках — атомарная строка от открытия до закрытия:
      // всегда одна строка, независимо от длины, содержимое не интерпретируется.
      if (BRACE_TPL[tok.k]) { push(d, oneLine); return; }

      // Короткое выражение без строчных комментариев внутри — тоже схлопываем.
      var risky = /(^|[^:])\/\/|<!--/.test(v) || tok.k === 'php' || tok.k === 'erb';
      if (!risky && oneLine.length + pad(d).length <= opts.inlineMax) {
        push(d, oneLine);
        return;
      }

      var parts = v.split('\n');
      var tail = null;
      // одинокий закрывающий маркер возвращаем на уровень открывающего
      if (/^\s*(\?>|%>|%\}|\}|-->)\s*$/.test(parts[parts.length - 1])) {
        tail = parts.pop().trim();
      }
      push(d, parts[0].replace(/\s+$/, ''));
      reindentBlock(parts.slice(1).join('\n'), pad(d + 1)).forEach(function (l) {
        lines.push(l);
      });
      if (tail !== null) push(d, tail);
    }

    function walk(node, d) {
      switch (node.type) {

        case 'root':
          renderChildren(node, d);
          break;

        case 'doctype':
          push(d, node.tok.v.replace(/\s+/g, ' ').trim());
          break;

        case 'text': {
          var v = node.tok.v;
          if (!v.trim()) {
            if (opts.keepBlankLines && (v.match(/\n/g) || []).length > 1) lines.push('');
            return;
          }
          var body = v.replace(/\s+/g, ' ').trim();
          push(d, body);
          break;
        }

        case 'comment': {
          var cv = node.tok.v;
          if (cv.indexOf('\n') === -1) { push(d, cv.trim()); return; }
          var head = cv.slice(0, cv.indexOf('\n'));
          var tail = cv.slice(cv.indexOf('\n') + 1);
          push(d, head.replace(/\s+$/, ''));
          reindentBlock(tail, pad(d)).forEach(function (l) { lines.push(l); });
          break;
        }

        case 'stray':
          push(d, '</' + node.tok.name + '>');
          break;

        case 'tplleaf':
          pushTpl(d, node.tok);
          break;

        case 'tplmid':
          pushTpl(d - 1, node.tok);
          break;

        case 'tpl': {
          pushTpl(d, node.tok);
          renderChildren(node, d + 1);
          if (node.closeTok) pushTpl(d, node.closeTok);
          break;
        }

        case 'raw':
          break; // handled by the parent element

        case 'el': {
          var tok = node.tok;
          var open = openTag(tok, opts);

          if (tok.self || tok.void) { push(d, open); return; }

          if (PRE_TEXT.has(node.name)) {
            var rawKid = node.children.find(function (c) { return c.type === 'raw'; });
            var content = rawKid ? rawKid.tok.v : inlineRender(node, opts);
            // byte-for-byte: never insert or drop a character inside pre/textarea
            protectedChunks.push(content);
            lines.push(pad(d) + open + SENTINEL + (protectedChunks.length - 1) + SENTINEL +
                       closeTag(node, opts));
            return;
          }

          if (RAW_TEXT.has(node.name)) {
            var rk = node.children.find(function (c) { return c.type === 'raw'; });
            var code = rk ? rk.tok.v : '';
            if (!code.trim()) { push(d, open + closeTag(node, opts)); return; }
            if (code.indexOf('\n') === -1 && code.trim().length + open.length < opts.inlineMax) {
              push(d, open + code.trim() + closeTag(node, opts));
              return;
            }
            push(d, open);
            reindentBlock(code, pad(d + 1)).forEach(function (l) { lines.push(l); });
            push(d, closeTag(node, opts));
            return;
          }

          var kids = node.children.filter(function (c) {
            return !(c.type === 'text' && !c.tok.v.trim());
          });

          if (!kids.length) { push(d, open + closeTag(node, opts)); return; }

          if (canInline(node, opts)) {
            push(d, open + inlineRender(node, opts) + closeTag(node, opts));
            return;
          }

          push(d, open);
          renderChildren(node, d + 1);
          push(d, closeTag(node, opts));
          break;
        }
      }
    }

    function renderChildren(node, d) {
      var kids = node.children;
      for (var i = 0; i < kids.length; i++) {
        var c = kids[i];
        if (c.type === 'text' && !c.tok.v.trim()) {
          if (opts.keepBlankLines && (c.tok.v.match(/\n/g) || []).length > 1 &&
              lines.length && lines[lines.length - 1] !== '') lines.push('');
          continue;
        }
        walk(c, d);
      }
    }

    walk(built.root, 0);

    var out = lines.join('\n').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n');
    out = out.trim() + '\n';
    out = out.replace(new RegExp(SENTINEL + '(\\d+)' + SENTINEL, 'g'), function (_, n) {
      return protectedChunks[Number(n)];
    });
    return { code: out, warnings: built.warnings };
  }

  function squishTpl(v) {
    if (v.indexOf('\n') === -1) return v.replace(/[ \t]+/g, ' ');
    return v;
  }

  /* ---------------------------------------------------------- *
   * 8. Minifier
   * ---------------------------------------------------------- */

  function minifyCSS(css) {
    return css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s*([{}:;,>~+])\s*/g, '$1')
      .replace(/;}/g, '}')
      .trim();
  }

  function minifyJS(js) {
    // conservative: strip indentation and blank lines only (ASI-safe)
    return js.split('\n')
      .map(function (l) { return l.replace(/^\s+/, '').replace(/\s+$/, ''); })
      .filter(function (l) { return l.length; })
      .join('\n');
  }

  // Схлопывает многострочную шаблонную вставку в одну строку, если это безопасно:
  // PHP/ERB и вставки со строчными комментариями трогать нельзя — сломается синтаксис.
  function collapseTpl(tok) {
    var v = tok.v;
    if (v.indexOf('\n') === -1) return v;
    if (BRACE_TPL[tok.k]) return v.replace(/\s*\n\s*/g, ' ').replace(/[ \t]{2,}/g, ' ');
    if (tok.k === 'php' || tok.k === 'erb') return v;
    if (/(^|[^:])\/\//.test(v)) return v;
    return v.replace(/\s*\n\s*/g, ' ').replace(/[ \t]{2,}/g, ' ');
  }

  function isBlockBoundary(tok, level) {
    if (!tok) return true;
    if (tok.t === 'open') return !INLINE.has(tok.name);
    if (tok.t === 'close') return !INLINE.has(tok.name);
    if (tok.t === 'doctype') return true;
    if (tok.t === 'comment') return true;
    // control-flow template blocks behave like block elements on the top level
    if (tok.t === 'tpl' && level >= 3) {
      var c = classifyTpl(tok);
      return c === 'open' || c === 'close' || c === 'mid';
    }
    return false;
  }

  /**
   * level: 1 = safe, 2 = balanced, 3 = extreme
   */
  function minify(src, level) {
    level = level || 2;
    var toks = tokenize(src);
    var out = [];
    var opts = {
      lowercase: level >= 3,
      unquote: level >= 3,
      dropAttrs: level >= 3,
      dropSlash: level >= 3
    };

    // build list of significant tokens for whitespace context
    var keep = [];
    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i];
      if (tk.t === 'comment' && level >= 2 && !tk.keep &&
          !/^<!--\[if/i.test(tk.v) && !/^<!--!/.test(tk.v) && !/^<!--\s*<!\[endif/i.test(tk.v)) {
        continue;
      }
      // merge adjacent text tokens (they appear once comments are dropped)
      var last = keep[keep.length - 1];
      if (tk.t === 'text' && last && last.t === 'text') { last.v += tk.v; continue; }
      keep.push(tk);
    }

    function prevSig(idx) { return idx > 0 ? keep[idx - 1] : null; }
    function nextSig(idx) { return idx < keep.length - 1 ? keep[idx + 1] : null; }

    for (var j = 0; j < keep.length; j++) {
      var t = keep[j];

      switch (t.t) {
        case 'doctype':
          out.push(t.v.replace(/\s+/g, ' ').trim());
          break;

        case 'comment':
          out.push(t.v.replace(/\s*\n\s*/g, level >= 2 ? ' ' : '\n'));
          break;

        case 'open':
          out.push(openTag(t, opts));
          break;

        case 'close':
          out.push('</' + (opts.lowercase || HTML_TAGS.has(t.name) ? t.name : t.rawName) + '>');
          break;

        case 'tpl':
          out.push(level >= 2 ? collapseTpl(t) : t.v);
          break;

        case 'raw': {
          if (t.name === 'pre' || t.name === 'textarea') out.push(t.v);
          else if (t.name === 'style') out.push(level >= 2 ? minifyCSS(t.v) : minifyJS(t.v));
          else if (t.name === 'script') out.push(minifyJS(t.v));
          else out.push(t.v);
          break;
        }

        case 'text': {
          var v = t.v;
          var blank = !v.trim();
          var pB = isBlockBoundary(prevSig(j), level);
          var nB = isBlockBoundary(nextSig(j), level);

          if (blank) {
            if (pB && nB) out.push(level === 1 ? '\n' : '');
            else out.push(' ');
            break;
          }
          var collapsed = v.replace(/\s+/g, ' ');
          if (pB) collapsed = collapsed.replace(/^ /, '');
          if (nB) collapsed = collapsed.replace(/ $/, '');
          out.push(collapsed);
          break;
        }
      }
    }

    var res = out.join('');
    if (level === 1) res = res.replace(/\n{2,}/g, '\n').replace(/^\s+|\s+$/g, '');
    else res = res.replace(/^\s+|\s+$/g, '');
    return res;
  }

  /* ---------------------------------------------------------- *
   * 9. Analyser (light validation surfaced in the status bar)
   * ---------------------------------------------------------- */

  function analyze(src) {
    var built = buildTree(tokenize(src));
    var w = built.warnings.slice();
    var seenIds = Object.create(null);

    (function walk(n) {
      if (n.type === 'el') {
        var attrs = n.tok.attrs, seen = Object.create(null);
        for (var i = 0; i < attrs.length; i++) {
          var a = attrs[i];
          if (a.tpl) continue;
          var ln = (a.name || '').toLowerCase();
          if (seen[ln]) w.push({ level: 'warn', msg: 'Дубль атрибута ' + a.name + ' в <' + n.name + '>' });
          seen[ln] = 1;
          if (ln === 'id' && a.value) {
            if (seenIds[a.value]) w.push({ level: 'warn', msg: 'Повтор id="' + a.value + '"' });
            seenIds[a.value] = 1;
          }
          if (a.value === '' && (ln === 'class' || ln === 'style' || ln === 'id')) {
            w.push({ level: 'info', msg: 'Пустой атрибут ' + a.name + ' в <' + n.name + '>' });
          }
        }
        if (n.name === 'img' && !attrs.some(function (a) { return !a.tpl && (a.name || '').toLowerCase() === 'alt'; })) {
          w.push({ level: 'info', msg: '<img> без alt' });
        }
      }
      (n.children || []).forEach(walk);
    })(built.root);

    return w;
  }

  return {
    tokenize: tokenize,
    beautify: beautify,
    minify: minify,
    analyze: analyze,
    VOID: VOID,
    INLINE: INLINE
  };
});
