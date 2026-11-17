// DOM helpers and reusable widgets: element builder, typed field grids, hex editor, dialogs.
(function (root) {
  'use strict';

  const { FormatError } = root.PorBytes;

  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v === null || v === undefined || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'class') el.className = v;
        else if (k === 'value') el.value = v;
        else if (k === 'checked') el.checked = Boolean(v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    append(el, children);
    return el;
  }

  function append(el, children) {
    for (const c of children) {
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) append(el, c);
      else if (c instanceof Node) el.appendChild(c);
      else el.appendChild(document.createTextNode(String(c)));
    }
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  const RANGE = {
    u8: [0, 0xFF], i8: [-128, 127], u16: [0, 0xFFFF], i16: [-32768, 32767],
    u32: [0, 0xFFFFFFFF], i32: [-2147483648, 2147483647], hex: [0, 0xFFFFFFFF], hex16: [0, 0xFFFF],
    rgba: [0, 0xFFFFFFFF], argb: [0, 0xFFFFFFFF],
  };

  function storageType(t) {
    if (t === 'hex' || t === 'rgba' || t === 'argb') return 'u32';
    if (t === 'hex16') return 'u16';
    return t;
  }

  function formatValue(t, v) {
    if (t === 'hex' || t === 'rgba' || t === 'argb') return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(8, '0');
    if (t === 'hex16') return '0x' + (v & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
    if (t === 'f32') return Number.isFinite(v) ? String(Math.round(v * 10000) / 10000) : String(v);
    return String(v);
  }

  function parseValue(t, text) {
    const s = String(text).trim();
    if (t === 'f32') {
      const v = Number(s);
      if (!Number.isFinite(v)) throw new FormatError('enter a number');
      return v;
    }
    let v;
    if (/^[+-]?0x[0-9a-f]+$/i.test(s)) v = parseInt(s, 16);
    else if (/^[+-]?\d+$/.test(s)) v = Number(s);
    else if ((t === 'hex' || t === 'hex16' || t === 'rgba' || t === 'argb') && /^[0-9a-f]+$/i.test(s)) v = parseInt(s, 16);
    else throw new FormatError('enter a whole number');
    const [lo, hi] = RANGE[t];
    if (v < lo || v > hi) throw new FormatError('value must be between ' + lo + ' and ' + hi);
    return v;
  }

  // Width class for a numeric input, sized to the longest value its type can hold.
  function numClass(t) {
    if (t === 'f32') return 'in-num in-float';
    if (t === 'u8' || t === 'i8') return 'in-num w-byte';
    if (t === 'u16' || t === 'i16' || t === 'hex16') return 'in-num w-word';
    return 'in-num w-dword';
  }

  function elementSize(t) {
    return { u8: 1, i8: 1, u16: 2, i16: 2, hex16: 2, u32: 4, i32: 4, f32: 4, hex: 4, rgba: 4, argb: 4 }[t];
  }

  // Renders a labelled grid of inputs bound to a Block. ctx.commit(fn) applies an edit;
  // ctx.enums[name] = {options: [[value, label, tooltip]]} or {hint(value), list, pick()} for big id spaces,
  // or a function (block, ctx) returning one of those, for choices that depend on other fields.
  // ctx.inline renders the controls without labels, for use inside table cells.
  function fieldGrid(block, fields, ctx) {
    const grid = h('div', { class: ctx.inline ? 'fields inline' : 'fields' });
    for (const f of fields) {
      if (ctx.only && !ctx.only.includes(f.k)) continue;
      if (ctx.skip && ctx.skip.includes(f.k)) continue;
      if (f.derived) continue;
      const where = 'Byte offset 0x' + f.o.toString(16).toUpperCase() + ' in this record.';
      grid.appendChild(h('label', { class: 'field-label' + (f.n > 1 ? ' top' : '') + (f.help ? ' has-help' : ''), title: f.help ? f.help + '\n' + where : where }, f.label));
      grid.appendChild(fieldControl(block, f, ctx));
    }
    return grid;
  }

  function fieldControl(block, f, ctx) {
    const st = storageType(f.t);
    if (f.t === 'rgba' || f.t === 'argb') return colourControl(block, f, ctx);
    if (f.bits) return bitsControl(block, f, ctx);
    if (f.t === 'str') {
      const input = h('input', { type: 'text', class: 'in-text', value: block.str(f.o, f.len), maxlength: f.full ? f.len : f.len - 1, disabled: f.ro });
      const strHint = f.conversation && ctx.enums && ctx.enums.conversation ? h('span', { class: 'hint' }, ctx.enums.conversation.hint(block.str(f.o, f.len)) || '') : null;
      input.addEventListener('change', () => {
        try {
          ctx.commit(() => block.setStr(f.o, f.len, input.value, f.full));
        } catch (error) {
          toast(error.message, 'error');
          input.value = block.str(f.o, f.len);
        }
        if (strHint) strHint.textContent = ctx.enums.conversation.hint(block.str(f.o, f.len)) || '';
      });
      return h('div', { class: 'field-value' }, input, strHint);
    }
    const count = f.n || 1;
    const wrap = h('div', { class: count > 1 ? 'field-value field-array' : 'field-value' });
    let enumDef = f.enumOf && ctx.enums ? ctx.enums[f.enumOf] : null;
    if (typeof enumDef === 'function') enumDef = enumDef(block, ctx, f);
    for (let i = 0; i < count; i += 1) {
      const off = f.o + i * elementSize(f.t);
      const current = () => block.get(st, off);
      let control;
      let hint = null;
      if (enumDef && enumDef.options) {
        control = h('select', { class: 'in-select', disabled: f.ro });
        const options = enumDef.options.slice();
        if (!options.some(([v]) => v === current())) options.push([current(), '(unknown ' + current() + ')']);
        for (const [v, label, tip] of options) control.appendChild(h('option', { value: String(v), title: tip || null }, label));
        control.value = String(current());
        const chosen = options.find(([v]) => v === current());
        if (chosen && chosen[2]) control.title = chosen[2];
      } else {
        control = h('input', {
          type: 'text', class: numClass(f.t), value: formatValue(f.t, current()),
          disabled: f.ro, list: enumDef && enumDef.list ? enumDef.list : null, inputmode: f.t === 'f32' ? 'decimal' : 'numeric',
        });
        if (enumDef && enumDef.hint) hint = h('span', { class: 'hint' }, enumDef.hint(current()) || '');
      }
      let pickBtn = null;
      if (enumDef && enumDef.pick && !f.ro) {
        pickBtn = h('button', { class: 'btn small', type: 'button', title: 'Choose from a list' }, 'Pick...');
        pickBtn.addEventListener('click', async () => {
          const v = await enumDef.pick();
          if (v === null || v === undefined) return;
          ctx.commit(() => block.set(st, off, v));
          control.value = formatValue(f.t, current());
          if (hint) hint.textContent = enumDef.hint(current()) || '';
          if (ctx.onChange) ctx.onChange(f, i);
        });
      }
      control.addEventListener('change', () => {
        let v;
        try {
          const raw = control.value.replace(/\s.*$/, '');
          v = parseValue(f.t, raw);
        } catch (error) {
          toast(f.label + ': ' + error.message, 'error');
          control.value = formatValue(f.t, current());
          return;
        }
        ctx.commit(() => block.set(st, off, v));
        if (control.tagName === 'INPUT') control.value = formatValue(f.t, current());
        if (hint) hint.textContent = enumDef.hint(current()) || '';
        if (ctx.onChange) ctx.onChange(f, i);
      });
      const cell = f.labels ? h('span', { class: 'array-cell' }, h('small', null, f.labels[i]), control) : control;
      wrap.appendChild(count > 1 && !f.labels ? h('span', { class: 'array-cell' }, h('small', null, String(i)), control) : cell);
      if (pickBtn) wrap.appendChild(pickBtn);
      if (hint) wrap.appendChild(hint);
    }
    return wrap;
  }

  // Packed colour: rgba keeps red in the high byte and alpha in the low byte; argb keeps alpha high.
  function unpackColour(t, v) {
    const b = [(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF];
    return t === 'rgba' ? { r: b[0], g: b[1], b: b[2], a: b[3] } : { a: b[0], r: b[1], g: b[2], b: b[3] };
  }
  function packColour(t, c) {
    return (t === 'rgba' ? ((c.r << 24) | (c.g << 16) | (c.b << 8) | c.a) : ((c.a << 24) | (c.r << 16) | (c.g << 8) | c.b)) >>> 0;
  }
  const hex2 = (n) => n.toString(16).padStart(2, '0');

  function colourControl(block, f, ctx) {
    const current = () => unpackColour(f.t, block.u32(f.o));
    const c0 = current();
    const picker = h('input', { type: 'color', class: 'in-colour', value: '#' + hex2(c0.r) + hex2(c0.g) + hex2(c0.b), disabled: f.ro, title: 'Colour' });
    // Browsers without a colour picker turn it into a text box; the stored-value field covers that case.
    if (picker.type !== 'color') picker.hidden = true;
    const alpha = h('input', { type: 'text', class: 'in-num w-byte', value: String(c0.a), title: 'Alpha (0 transparent, 255 opaque)', disabled: f.ro });
    const raw = h('input', { type: 'text', class: 'in-num w-dword', value: formatValue('hex', block.u32(f.o)), title: 'Stored value', disabled: f.ro });
    const refresh = () => {
      const c = current();
      picker.value = '#' + hex2(c.r) + hex2(c.g) + hex2(c.b);
      alpha.value = String(c.a);
      raw.value = formatValue('hex', block.u32(f.o));
    };
    const apply = (c) => { ctx.commit(() => block.setU32(f.o, packColour(f.t, c))); refresh(); if (ctx.onChange) ctx.onChange(f, 0); };
    picker.addEventListener('change', () => {
      const c = current();
      const v = picker.value;
      apply({ r: parseInt(v.slice(1, 3), 16), g: parseInt(v.slice(3, 5), 16), b: parseInt(v.slice(5, 7), 16), a: c.a });
    });
    alpha.addEventListener('change', () => {
      try {
        const a = parseValue('u8', alpha.value);
        apply(Object.assign(current(), { a }));
      } catch (error) { toast(error.message, 'error'); refresh(); }
    });
    raw.addEventListener('change', () => {
      try {
        const v = parseValue('hex', raw.value);
        ctx.commit(() => block.setU32(f.o, v));
        refresh();
      } catch (error) { toast(error.message, 'error'); refresh(); }
    });
    return h('div', { class: 'field-value colour' }, picker, h('label', { class: 'mini' }, 'Alpha ', alpha), raw);
  }

  // A flag field shown as one named checkbox per bit, plus the raw number.
  function bitsControl(block, f, ctx) {
    const st = storageType(f.t);
    const raw = h('input', { type: 'text', class: numClass(f.t), value: formatValue(f.t, block.get(st, f.o)), disabled: f.ro, title: 'Stored value' });
    const boxes = [];
    const wide = st === 'u32';
    const refresh = () => {
      const v = block.get(st, f.o);
      raw.value = formatValue(f.t, v);
      for (const [mask, cb] of boxes) cb.checked = (v & mask) !== 0;
    };
    const wrap = h('div', { class: 'field-value bits' });
    for (const [mask, text, tip] of f.bits) {
      const cb = h('input', { type: 'checkbox', disabled: f.ro });
      cb.addEventListener('change', () => {
        const v = block.get(st, f.o);
        const next = cb.checked ? (v | mask) : (v & ~mask);
        ctx.commit(() => block.set(st, f.o, wide ? next >>> 0 : next & 0xFFFF));
        refresh();
        if (ctx.onChange) ctx.onChange(f, 0);
      });
      boxes.push([mask, cb]);
      wrap.appendChild(h('label', { class: 'check' + (tip ? ' has-help' : ''), title: tip || null }, cb, ' ', text));
    }
    raw.addEventListener('change', () => {
      try {
        const v = parseValue(f.t, raw.value);
        ctx.commit(() => block.set(st, f.o, v));
      } catch (error) { toast(error.message, 'error'); }
      refresh();
      if (ctx.onChange) ctx.onChange(f, 0);
    });
    wrap.appendChild(raw);
    refresh();
    return wrap;
  }

  // Searchable list dialog. columns: [{label, get(row), cls}]; filters: [{label, options: [[v, text]], test(row, v)}].
  // Resolves to the chosen row, or null when cancelled.
  function picker(opts) {
    return new Promise((resolve) => {
      const dlg = h('dialog', { class: 'dlg picker' });
      const close = (v) => { dlg.close(); dlg.remove(); resolve(v); };
      const search = h('input', { type: 'search', class: 'in-text wide', placeholder: opts.placeholder || 'Search', autofocus: true });
      const selects = (opts.filters || []).map((f) => {
        const sel = h('select', { class: 'in-select', title: f.label }, h('option', { value: '' }, f.label + ': all'),
          f.options.map(([v, t]) => h('option', { value: String(v) }, t)));
        return { f, sel };
      });
      const body = h('tbody');
      const count = h('span', { class: 'muted' });
      const limit = opts.limit || 400;
      const draw = () => {
        const q = search.value.trim().toLowerCase();
        const rows = opts.rows.filter((r) => (!q || opts.text(r).toLowerCase().includes(q))
          && selects.every(({ f, sel }) => sel.value === '' || f.test(r, sel.value)));
        clear(body);
        for (const r of rows.slice(0, limit)) {
          body.appendChild(h('tr', { class: 'clickable', tabindex: '0', title: opts.tooltip ? opts.tooltip(r) : null,
            onclick: () => close(r), onkeydown: (e) => { if (e.key === 'Enter') close(r); } },
          opts.columns.map((c) => h('td', { class: c.cls || null }, c.get(r)))));
        }
        count.textContent = rows.length > limit ? 'Showing ' + limit + ' of ' + rows.length + ' - refine the search' : rows.length + ' shown';
      };
      search.addEventListener('input', draw);
      for (const { sel } of selects) sel.addEventListener('change', draw);
      dlg.appendChild(h('h3', null, opts.title));
      dlg.appendChild(h('div', { class: 'row' }, search, selects.map((x) => x.sel), count));
      dlg.appendChild(h('div', { class: 'picker-list' }, h('table', { class: 'grid compact' },
        h('thead', null, h('tr', null, opts.columns.map((c) => h('th', null, c.label)))), body)));
      dlg.appendChild(h('div', { class: 'dlg-buttons' }, h('button', { class: 'btn', onclick: () => close(null) }, 'Cancel')));
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(null); });
      document.body.appendChild(dlg);
      draw();
      dlg.showModal();
      search.focus();
    });
  }

  // ---- hex -----------------------------------------------------------------------------------

  function hexLines(bytes, base) {
    const lines = [];
    for (let i = 0; i < bytes.length; i += 16) {
      const row = bytes.subarray(i, Math.min(bytes.length, i + 16));
      let hexPart = '';
      let text = '';
      for (let k = 0; k < row.length; k += 1) {
        hexPart += row[k].toString(16).toUpperCase().padStart(2, '0') + ' ';
        text += row[k] >= 0x20 && row[k] < 0x7F ? String.fromCharCode(row[k]) : '.';
      }
      lines.push({ offset: (base || 0) + i, hex: hexPart.trimEnd(), text });
    }
    return lines;
  }

  function parseHexText(text) {
    const clean = text.replace(/[^0-9a-fA-F]/g, '');
    if (clean.length % 2) throw new FormatError('hex text has an odd number of digits');
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i += 1) out[i] = parseInt(clean.substr(i * 2, 2), 16);
    return out;
  }

  // Edits a byte array in place without changing its length.
  function hexEditor(bytes, opts) {
    opts = opts || {};
    const pageSize = opts.pageSize || 4096;
    const pages = Math.max(1, Math.ceil(bytes.length / pageSize));
    let page = 0;
    const box = h('div', { class: 'hex' });
    const render = () => {
      clear(box);
      const start = page * pageSize;
      const slice = bytes.subarray(start, Math.min(bytes.length, start + pageSize));
      const lines = hexLines(slice, (opts.base || 0) + start);
      const gutter = h('pre', { class: 'hex-gutter' }, lines.map((l) => l.offset.toString(16).toUpperCase().padStart(8, '0')).join('\n'));
      const area = h('textarea', { class: 'hex-text', spellcheck: 'false', readonly: opts.readOnly, rows: Math.min(24, Math.max(2, lines.length)) },
        lines.map((l) => l.hex).join('\n'));
      const ascii = h('pre', { class: 'hex-ascii' }, lines.map((l) => l.text).join('\n'));
      area.addEventListener('scroll', () => { gutter.scrollTop = area.scrollTop; ascii.scrollTop = area.scrollTop; });
      const bar = h('div', { class: 'hex-bar' },
        h('span', { class: 'muted' }, bytes.length + ' bytes' + (pages > 1 ? ' - page ' + (page + 1) + ' of ' + pages : '')),
        pages > 1 ? h('button', { class: 'btn small', disabled: page === 0, onclick: () => { page -= 1; render(); } }, 'Previous') : null,
        pages > 1 ? h('button', { class: 'btn small', disabled: page === pages - 1, onclick: () => { page += 1; render(); } }, 'Next') : null,
        opts.readOnly ? null : h('button', {
          class: 'btn small primary', onclick: () => {
            let parsed;
            try {
              parsed = parseHexText(area.value);
            } catch (error) {
              toast(error.message, 'error');
              return;
            }
            if (parsed.length !== slice.length) {
              toast('hex edits must keep the same length (' + slice.length + ' bytes)', 'error');
              return;
            }
            opts.commit(() => bytes.set(parsed, start));
            render();
          },
        }, 'Apply bytes'));
      box.appendChild(bar);
      box.appendChild(h('div', { class: 'hex-body' }, gutter, area, ascii));
    };
    render();
    return box;
  }

  // ---- feedback ------------------------------------------------------------------------------

  let toastHost = null;
  function toast(message, kind) {
    if (!toastHost) {
      toastHost = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(toastHost);
    }
    const el = h('div', { class: 'toast ' + (kind || 'info') }, message);
    toastHost.appendChild(el);
    setTimeout(() => el.classList.add('fade'), kind === 'error' ? 5000 : 2600);
    setTimeout(() => el.remove(), kind === 'error' ? 5600 : 3200);
  }

  function dialog(title, body, buttons) {
    return new Promise((resolve) => {
      const dlg = h('dialog', { class: 'dlg' });
      const close = (value) => { dlg.close(); dlg.remove(); resolve(value); };
      dlg.appendChild(h('h3', null, title));
      dlg.appendChild(typeof body === 'string' ? h('p', null, body) : body);
      dlg.appendChild(h('div', { class: 'dlg-buttons' }, buttons.map(([label, value, cls]) =>
        h('button', { class: 'btn ' + (cls || ''), onclick: () => close(value) }, label))));
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(null); });
      document.body.appendChild(dlg);
      dlg.showModal();
    });
  }

  function confirm(title, message, okLabel) {
    return dialog(title, message, [['Cancel', false], [okLabel || 'Continue', true, 'primary']]);
  }

  function table(headers, rows, opts) {
    opts = opts || {};
    return h('div', { class: 'table-scroll' }, h('table', { class: 'grid' + (opts.compact ? ' compact' : '') },
      h('thead', null, h('tr', null, headers.map((x) => h('th', null, x)))),
      h('tbody', null, rows)));
  }

  function section(title, ...children) {
    return h('section', { class: 'card' }, h('h3', null, title), children);
  }

  function download(name, bytes) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const a = h('a', { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  root.PorUI = {
    h, append, clear, fieldGrid, fieldControl, numClass, parseValue, formatValue, hexEditor, hexLines, parseHexText, picker,
    toast, dialog, confirm, table, section, download, RANGE,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
