// Conversation data readers (data/Dialogue) and the cross-reference index built from them:
// which conversations set or check each world variable, named state, door and NPC, and the
// spoken line at which they do it.
(function (root) {
  'use strict';

  const B = root.PorBytes || require('./bytes.js');
  const { Codec } = B;

  // Name tables (test.cv, test.ck, test.cj, test.cl ...): {name NUL, script NUL, flag byte}.
  function parseNameTable(bytes) {
    const out = [];
    let i = 0;
    while (i < bytes.length && out.length < 1500) {
      const a = bytes.indexOf(0, i);
      if (a < 0) break;
      const b = bytes.indexOf(0, a + 1);
      if (b < 0 || b + 1 > bytes.length) break;
      out.push({ name: Codec.decode(bytes.subarray(i, a)), script: Codec.decode(bytes.subarray(a + 1, b)) });
      i = b + 2;
    }
    return out;
  }

  // all.idx: {name NUL, 3 padding bytes, u32 offset into all.db}.
  function parseScriptIndex(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const out = [];
    let i = 0;
    while (i < bytes.length) {
      const z = bytes.indexOf(0, i);
      if (z < 0 || z + 8 > bytes.length) break;
      out.push({ name: Codec.decode(bytes.subarray(i, z)).replace(/\.[^.]*$/, ''), offset: dv.getUint32(z + 4, true) });
      i = z + 8;
    }
    return out;
  }

  // Operand count of each script opcode (0x32..0xF0).
  const ARG_COUNTS = [
    1, 1, 2, 3, 1, 1, 1, 0, 6, 1, 2, 2, 1, 1, 1, 3, 3, 3, 3, 3, 4, 2, 3, 3, 1, 1, 3, 3, 2, 1, 2, 2,
    1, 1, 3, 2, 3, 3, 5, 5, 5, 5, 5, 5, 5, 5, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3,
    3, 3, 3, 3, 3, 3, 3, 2, 4, 1, 2, 5, 7, 3, 2, 2, 2, 4, 1, 1, 8, 8, 0, 2, 3, 8, 3, 2, 2, 1, 3, 8,
    0, 2, 2, 3, 2, 2, 2, 2, 2, 1, 1, 3, 8, 8, 4, 4, 2, 3, 2, 1, 1, 1, 2, 1, 2, 3, 3, 3, 2, 3, 3, 3,
    3, 5, 1, 8, 3, 3, 3, 3, 3, 3, 2, 2, 1, 1, 0, 0, 1, 1, 3, 3, 3, 3, 3, 4, 4, 4, 4, 0, 0, 2, 0, 0,
    4, 1, 1, 8, 1, 1, 4, 4, 2, 4, 2, 2, 2, 8, 8, 8, 0, 0, 2, 2, 2, 2, 8, 0, 3, 0, 7, 0, 0, 0, 1,
  ];
  const OP_FIRST = 0x32;
  const OP_LAST = 0xF0;
  const OP = {
    REAP: 0x3C, NAMED_FETCH: 0x55, SPEAKER: 0x53, SET_STATE: 0x79, SET_CHAR: 0x7C,
    PUT: 0x80, ADD: 0x8D, SUB: 0x8E, COUNT_TO_VAR: 0x4E, COND_FIRST: 0x56, COND_LAST: 0x77,
  };
  // cctSETCHAR stores 11, 3, 12 or 0 for operand 0, 1, 2 or 3.
  const SET_CHAR_STATES = [11, 3, 12, 0];

  function readOps(r) {
    if (r.pos + 2 > r.end) { r.pos = r.end; return []; }
    const count = r.dv.getUint16(r.pos, true);
    r.pos += 2;
    const ops = [];
    for (let k = 0; k < count && r.pos < r.end; k += 1) {
      const opcode = r.bytes[r.pos++];
      if (opcode < OP_FIRST || opcode > OP_LAST) break;
      const n = ARG_COUNTS[opcode - OP_FIRST];
      const args = [];
      const types = [];
      for (let a = 0; a < n && r.pos < r.end; a += 1) {
        const t = r.bytes[r.pos++];
        types.push(t);
        if (t === 1 || t === 4) { args.push(r.bytes[r.pos]); r.pos += 1; }
        else if (t === 2 || t === 8 || t === 0x10 || t === 0x18 || t === 0x40) { args.push(r.dv.getUint16(r.pos, true)); r.pos += 2; }
        else if (t === 0x20) { args.push(r.dv.getUint16(r.pos, true)); r.pos += 4; }
        else args.push(null);
      }
      ops.push({ opcode, args, types });
    }
    if (r.pos > r.end) r.pos = r.end;
    return ops;
  }

  // Empty node slots are skipped without counting toward `count`; at most 50 slots exist.
  function readNodes(r, count) {
    const nodes = [];
    let nonEmpty = 0;
    for (let slot = 0; slot < 50 && nonEmpty < count && r.pos < r.end; slot += 1) {
      const n = r.bytes[r.pos++];
      if (n) nonEmpty += 1;
      for (let k = 0; k < n && r.pos + 4 <= r.end; k += 1) {
        const line = r.dv.getUint16(r.pos, true);
        r.pos += 4;
        nodes.push({ line, ops: readOps(r) });
        if (r.pos >= r.end) break;
        const children = r.bytes[r.pos++];
        for (let c = 0; c < children && r.pos + 4 <= r.end; c += 1) {
          const cl = r.dv.getUint16(r.pos, true);
          r.pos += 4;
          nodes.push({ line: cl, ops: readOps(r) });
        }
      }
    }
    return nodes;
  }

  // One compiled conversation: a 16-byte header of section sizes, then the op chains and nodes.
  function parseScript(db, offset) {
    const dv = new DataView(db.buffer, db.byteOffset, db.byteLength);
    if (offset + 16 > db.length) return null;
    const sec0 = dv.getUint32(offset, true);
    const r = { bytes: db, dv, pos: offset + 16, end: Math.min(db.length, offset + 16 + sec0) };
    const chains = [{ line: -1, ops: readOps(r) }, { line: -1, ops: readOps(r) }];
    let nodes = [];
    if (r.pos < r.end) nodes = nodes.concat(readNodes(r, r.bytes[r.pos++]));
    if (r.pos < r.end) nodes = nodes.concat(readNodes(r, r.bytes[r.pos++]));
    return chains.concat(nodes);
  }

  // Conversation text: one row per line, tab-separated {id, text, speaker, direction}.
  function parseConversationText(bytes) {
    const text = Codec.decode(bytes);
    return text.split(/\r?\n/).map((row) => {
      const c = row.split('\t');
      const t = c[1] && c[1] !== 'null' ? c[1].trim() : '';
      return { text: t, speaker: (c[2] || '').trim() };
    });
  }

  function speakerName(raw) {
    if (!raw || raw === 'null') return '';
    if (/^(dm|thedm|nobody)$/i.test(raw)) return 'Narrator';
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  function clip(s, n) { return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; }

  const MAX_SET = 6;
  const MAX_CHECK = 10;
  const TEXT_LIMIT = 170;

  // Builds the cross-reference index. tables: {cv, ck, cj, cl} name tables; scripts: [{name, chains}];
  // texts: Map(conversation name -> rows).
  function buildIndex(tables, scripts, texts) {
    const vars = (tables.cv || []).map((v) => ({ name: v.name, script: v.script, set: [], check: [], journal: [] }));
    const encounters = (tables.ck || []).map((v) => ({ name: v.name, script: v.script, set: [], check: [] }));
    const doors = (tables.cj || []).map((v) => ({ name: v.name, script: v.script, set: [] }));
    const npcs = (tables.cl || []).map((v) => ({ name: v.name, script: v.script, display: '', modes: [] }));
    const conversations = {};
    const speakerSeen = new Map();
    for (const s of scripts) {
      const rows = texts.get(s.name.toLowerCase()) || [];
      const counts = new Map();
      for (const row of rows) {
        const sp = speakerName(row.speaker);
        if (!sp || !row.text) continue;
        counts.set(sp, (counts.get(sp) || 0) + 1);
        if (!speakerSeen.has(sp.toLowerCase())) speakerSeen.set(sp.toLowerCase(), sp);
      }
      const speakers = Array.from(counts).sort((a, b) => b[1] - a[1]).map(([n]) => n).filter((n) => n !== 'Narrator').slice(0, 3);
      const opening = rows.find((row) => row.text && !/^protagonist$/i.test(row.speaker));
      conversations[s.name.toLowerCase()] = { speakers, first: opening ? clip(opening.text, 120) : '' };
      const lineInfo = (line, forward) => {
        if (line < 0 || line >= rows.length) return { text: '', speaker: '' };
        for (let k = line; k < Math.min(rows.length, line + (forward ? 4 : 1)); k += 1) {
          if (rows[k].text) return { text: clip(rows[k].text, TEXT_LIMIT), speaker: speakerName(rows[k].speaker) };
        }
        return { text: '', speaker: '' };
      };
      const isJournal = /^questlog$/i.test(s.name);
      for (const chain of s.chains) {
        chain.ops.forEach((op, opIndex) => {
          const a0 = op.args[0];
          const a1 = op.args[1];
          if ((op.opcode === OP.PUT || op.opcode === OP.ADD || op.opcode === OP.SUB) && Number.isInteger(a1) && vars[a1]) {
            const v = vars[a1];
            const how = op.opcode === OP.PUT ? '=' : op.opcode === OP.ADD ? '+=' : '-=';
            const value = op.types[0] === 2 ? 'the value of ' + (vars[a0] ? vars[a0].name : '#' + a0) : a0;
            const entry = Object.assign({ conv: s.name, how, value }, lineInfo(chain.line, false));
            const dup = v.set.some((x) => x.conv === entry.conv && x.value === entry.value && x.how === entry.how && (x.text === entry.text || !entry.text));
            if (!dup && v.set.length < MAX_SET) v.set.push(entry);
          } else if (op.opcode >= OP.COND_FIRST && op.opcode <= OP.COND_LAST && Number.isInteger(a0) && vars[a0]) {
            const v = vars[a0];
            if (isJournal) {
              // Journal text follows a node only when this check is the node's own first test.
              if (opIndex !== 0 || chain.line < 0) return;
              const info = lineInfo(chain.line, true);
              if (info.text && v.journal.length < 4 && !v.journal.some((j) => j.text === info.text)) v.journal.push({ value: a1, text: info.text });
            } else if (v.check.length < MAX_CHECK && !v.check.some((c) => c.conv === s.name && c.value === a1)) {
              v.check.push({ conv: s.name, value: a1 });
            }
          } else if ((op.opcode === OP.REAP || op.opcode === OP.NAMED_FETCH) && Number.isInteger(a0) && encounters[a0]) {
            const e = encounters[a0];
            const entry = Object.assign({ conv: s.name }, lineInfo(chain.line, false));
            if (op.opcode === OP.REAP && e.set.length < MAX_SET) e.set.push(entry);
            else if (op.opcode === OP.NAMED_FETCH && e.check.length < MAX_CHECK && !e.check.some((c) => c.conv === s.name)) e.check.push({ conv: s.name });
          } else if (op.opcode === OP.SET_STATE && Number.isInteger(a0) && doors[a0]) {
            if (doors[a0].set.length < MAX_SET) doors[a0].set.push(Object.assign({ conv: s.name, value: a1 }, lineInfo(chain.line, false)));
          } else if (op.opcode === OP.SET_CHAR && Number.isInteger(a0) && npcs[a0]) {
            const mode = SET_CHAR_STATES[a1];
            const entry = Object.assign({ conv: s.name, state: mode }, lineInfo(chain.line, false));
            if (mode !== undefined && npcs[a0].modes.length < MAX_SET
              && !npcs[a0].modes.some((x) => x.conv === entry.conv && x.state === entry.state)) npcs[a0].modes.push(entry);
          }
        });
      }
    }
    for (const n of npcs) n.display = speakerSeen.get(n.name.toLowerCase()) || speakerName(n.name);
    return { vars, encounters, doors, npcs, conversations };
  }

  const api = { parseNameTable, parseScriptIndex, parseScript, parseConversationText, buildIndex, speakerName, SET_CHAR_STATES };
  root.PorScripts = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
