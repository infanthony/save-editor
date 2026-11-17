// Readers for the game's own data files, used to label ids with the installed language's text:
// sfDat.dat (system strings), *.str (line tables), TEE.trs (item catalog), monsters.mon
// (creature catalog), Dialogue/test.cv (world-variable names) and LMM/*.lmm (area markers).
(function (root) {
  'use strict';

  const B = root.PorBytes || require('./bytes.js');
  const { FormatError, Codec } = B;

  function view(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }

  // sfDat.dat: count, total chars, char offsets, then UTF-16 text with a per-string XOR key.
  function parseSystemStrings(bytes) {
    const dv = view(bytes);
    if (bytes.length < 8) throw new FormatError('sfDat.dat is too short');
    const count = dv.getUint32(0, true);
    const total = dv.getUint32(4, true);
    const blobAt = 8 + 4 * count;
    if (blobAt + total * 2 !== bytes.length) throw new FormatError('sfDat.dat size does not match its header');
    const out = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const start = dv.getUint32(8 + 4 * i, true);
      const end = i + 1 < count ? dv.getUint32(8 + 4 * (i + 1), true) : total;
      const lo = (i + 0x55) & 0xFF;
      const hi = (i + 0xBB) & 0xFF;
      // Units with a high byte of 0, or 0xFF over a byte of 0x80 and above, hold one byte of text in the
      // installed language's code page (two of them make a Chinese character); other units are UTF-16.
      let text = '';
      const run = [];
      const flush = () => { if (run.length) { text += Codec.decode(Uint8Array.from(run)); run.length = 0; } };
      for (let c = start; c < end; c += 1) {
        const low = bytes[blobAt + c * 2] ^ lo;
        const high = bytes[blobAt + c * 2 + 1] ^ hi;
        if (low === 0 && high === 0) break;
        if (high === 0 || (high === 0xFF && low >= 0x80)) run.push(low);
        else { flush(); text += String.fromCharCode((high << 8) | low); }
      }
      flush();
      out[i] = text;
    }
    return out;
  }

  // Line tables are split the way the game splits them: runs of CR/LF separate entries.
  function parseLineTable(bytes) {
    const out = [];
    let start = -1;
    for (let i = 0; i <= bytes.length; i += 1) {
      const delim = i === bytes.length || bytes[i] === 0x0A || bytes[i] === 0x0D;
      if (delim) {
        if (start >= 0) { out.push(Codec.decode(bytes.subarray(start, i))); start = -1; }
      } else if (start < 0) {
        start = i;
      }
    }
    return out;
  }

  // test.cv lists world variables in index order as {name NUL source NUL} records separated by 0xFF.
  function parseWorldVarNames(bytes) {
    const out = [];
    let start = 0;
    for (let i = 0; i <= bytes.length; i += 1) {
      if (i === bytes.length || bytes[i] === 0xFF) {
        if (i > start) {
          const rec = bytes.subarray(start, i);
          const z = rec.indexOf(0);
          const name = Codec.decode(z < 0 ? rec : rec.subarray(0, z));
          let source = '';
          if (z >= 0) {
            const rest = rec.subarray(z + 1);
            const z2 = rest.indexOf(0);
            source = Codec.decode(z2 < 0 ? rest : rest.subarray(0, z2));
          }
          out.push({ name, source });
        }
        start = i + 1;
      }
    }
    return out;
  }

  const TEE_VERSION = 104;
  const TEE_EFFECT_SIZE = 30;
  const TEE_ITEM_SIZE = 72;

  function parseItemCatalog(bytes) {
    const dv = view(bytes);
    if (bytes.length < 12 || dv.getUint32(0, true) !== TEE_VERSION) throw new FormatError('TEE.trs is not a version 104 catalog');
    let at = 8;
    const effectCount = dv.getUint32(at, true);
    at += 4 + effectCount * TEE_EFFECT_SIZE;
    const itemCount = dv.getUint32(at, true);
    at += 4;
    if (at + itemCount * TEE_ITEM_SIZE > bytes.length) throw new FormatError('TEE.trs item table is truncated');
    const items = [];
    for (let i = 0; i < itemCount; i += 1) {
      const o = at + i * TEE_ITEM_SIZE;
      items.push({
        index: i,
        type: dv.getInt16(o, true),
        nameStr: dv.getInt32(o + 0x02, true),
        fullNameStr: dv.getInt32(o + 0x06, true),
        model: dv.getInt32(o + 0x0A, true),
        category: dv.getInt32(o + 0x0E, true),
        value: dv.getUint32(o + 0x12, true),
        weight: dv.getInt16(o + 0x16, true),
        dieSides: bytes[o + 0x20],
        dieCount: bytes[o + 0x21],
        dmgBonus: bytes[o + 0x22],
        critMin: bytes[o + 0x23],
        critMult: bytes[o + 0x24],
        acBonus: dv.getInt8(o + 0x2B),
        bodyLook: dv.getInt8(o + 0x31),
        h: bytes[o + 0x18],
        w: bytes[o + 0x19],
        slotMask: dv.getUint16(o + 0x1A, true),
        classMask: dv.getUint16(o + 0x1C, true),
        maxCharges: bytes[o + 0x34],
        initialCharges: bytes[o + 0x35],
        identifiable: bytes[o + 0x37],
        id: dv.getUint16(o + 0x46, true),
      });
    }
    return items;
  }

  // Equipment sets: label -> list of [item id (-1 empty, -2 gold), minimum, maximum (exclusive)].
  function parseEquipSets(bytes) {
    const model = parseItemFile(bytes);
    const sets = new Map();
    for (const b of model.sets) {
      const slots = [];
      for (let k = 0; k < 8; k += 1) {
        const item = b.i16(2 + k * 6);
        if (item !== -1) slots.push([item, b.u16(4 + k * 6), b.u16(6 + k * 6)]);
      }
      sets.set(b.u16(0), slots);
    }
    return sets;
  }

  const MONSTER_VERSION = 122;
  const MONSTER_SIZE = 0xE4;
  const MONSTER_ATTACK_SIZE = 9;

  function parseCreatureCatalog(bytes) {
    const dv = view(bytes);
    if (bytes.length < 8 || dv.getInt32(0, true) !== MONSTER_VERSION) throw new FormatError('monsters.mon is not a version 122 catalog');
    const count = dv.getUint32(4, true);
    let at = 8;
    const out = [];
    for (let i = 0; i < count; i += 1) {
      if (at + MONSTER_SIZE > bytes.length) throw new FormatError('monsters.mon is truncated');
      // Creatures in a save refer to their template by its position in this file.
      out.push({
        id: i,
        nameStr: dv.getInt32(at, true),
        xp: dv.getInt32(at + 0x15, true),
        level: bytes[at + 0x1A],
        model: dv.getInt32(at + 0x04, true),
        look: dv.getInt32(at + 0x08, true),
        uniqueId: dv.getInt32(at + 0xE0, true),
      });
      at += MONSTER_SIZE + bytes[at + 0x26] * MONSTER_ATTACK_SIZE;
    }
    return out;
  }

  // Editable creature template file: every record and attack row is kept as a Block, so an
  // unedited file rebuilds byte for byte.
  function parseCreatureFile(bytes) {
    const dv = view(bytes);
    if (bytes.length < 8 || dv.getInt32(0, true) !== MONSTER_VERSION) throw new FormatError('monsters.mon is not a version 122 catalog');
    const count = dv.getUint32(4, true);
    const head = bytes.slice(0, 8);
    let at = 8;
    const records = [];
    for (let i = 0; i < count; i += 1) {
      if (at + MONSTER_SIZE > bytes.length) throw new FormatError('monsters.mon is truncated');
      const rec = new B.Block(bytes.slice(at, at + MONSTER_SIZE));
      at += MONSTER_SIZE;
      const attacks = [];
      for (let k = 0; k < rec.u8(0x26); k += 1) {
        if (at + MONSTER_ATTACK_SIZE > bytes.length) throw new FormatError('monsters.mon attack rows are truncated');
        attacks.push(new B.Block(bytes.slice(at, at + MONSTER_ATTACK_SIZE)));
        at += MONSTER_ATTACK_SIZE;
      }
      records.push({ rec, attacks });
    }
    return { head, records, tail: bytes.slice(at) };
  }

  function serializeCreatureFile(model) {
    const w = new B.Writer();
    const head = new B.Block(model.head.slice());
    head.setU32(4, model.records.length);
    w.block(head);
    for (const r of model.records) {
      r.rec.setU8(0x26, r.attacks.length);
      w.block(r.rec);
      for (const a of r.attacks) w.block(a);
    }
    w.bytes(model.tail);
    return w.toBytes();
  }

  const TEE_SET_SIZE = 50;

  // Editable item catalog: item effects, item templates and equipment sets as Blocks; the data after
  // the equipment sets, which the game does not read, is kept as is.
  function parseItemFile(bytes) {
    const dv = view(bytes);
    if (bytes.length < 12 || dv.getUint32(0, true) !== TEE_VERSION) throw new FormatError('TEE.trs is not a version 104 catalog');
    let at = 8;
    const table = (size, what) => {
      if (at + 4 > bytes.length) throw new FormatError('TEE.trs ' + what + ' table is truncated');
      const n = dv.getUint32(at, true);
      at += 4;
      if (at + n * size > bytes.length) throw new FormatError('TEE.trs ' + what + ' table is truncated');
      const out = [];
      for (let i = 0; i < n; i += 1) { out.push(new B.Block(bytes.slice(at, at + size))); at += size; }
      return out;
    };
    const head = bytes.slice(0, 8);
    const effects = table(TEE_EFFECT_SIZE, 'effect');
    const items = table(TEE_ITEM_SIZE, 'item');
    const sets = table(TEE_SET_SIZE, 'equipment set');
    return { head, effects, items, sets, tail: bytes.slice(at) };
  }

  function serializeItemFile(model) {
    const w = new B.Writer();
    w.bytes(model.head);
    for (const list of [model.effects, model.items, model.sets]) {
      w.u32(list.length);
      for (const b of list) w.block(b);
    }
    w.bytes(model.tail);
    return w.toBytes();
  }

  // ---- LMM area marker files ----------------------------------------------------------------

  const LMM_VERSION = 3;
  const LMM_HEADER_SIZE = 584;
  const LMM_MARKER_SIZE = 133;
  const MARKER_KINDS = ['Arrival', 'Scenery', 'Object', 'Navigation', 'Sound', 'Encounter', 'Trap', 'Treasure', 'Conversation', 'Rest', 'Light'];

  function fixedName(bytes, o, len) {
    let s = '';
    for (let i = 0; i < len; i += 1) {
      const b = bytes[o + i];
      if (b < 0x20 || b > 0x7E) break;
      s += String.fromCharCode(b);
    }
    return s.trim();
  }
  function atoi(bytes, o, len) {
    const m = /^\s*([+-]?\d+)/.exec(fixedName(bytes, o, len));
    return m ? Number(m[1]) : null;
  }

  function parseAreaMarkers(bytes) {
    const dv = view(bytes);
    if (bytes.length < LMM_HEADER_SIZE || dv.getUint32(0, true) !== LMM_VERSION) throw new FormatError('not a version 3 area marker file');
    const gx = dv.getInt32(0x228, true);
    const gy = dv.getInt32(0x22C, true);
    const gz = dv.getInt32(0x230, true);
    const cellCount = gx * gy * gz;
    const markerStart = LMM_HEADER_SIZE + cellCount * 8;
    if (cellCount < 0 || markerStart > bytes.length) throw new FormatError('area marker cell table is invalid');
    const owner = [];
    let total = 0;
    for (let cell = 0; cell < cellCount; cell += 1) {
      const recordAt = dv.getUint32(LMM_HEADER_SIZE + cell * 8, true);
      const n = dv.getUint32(LMM_HEADER_SIZE + cell * 8 + 4, true);
      total += n;
      if (!n) continue;
      if (recordAt < markerStart || (recordAt - markerStart) % LMM_MARKER_SIZE) throw new FormatError('area marker cell offset is misaligned');
      const first = (recordAt - markerStart) / LMM_MARKER_SIZE;
      for (let k = 0; k < n; k += 1) owner[first + k] = [cell, k];
    }
    if (markerStart + total * LMM_MARKER_SIZE > bytes.length) throw new FormatError('area marker table is truncated');
    const markers = [];
    for (let i = 0; i < total; i += 1) {
      const o = markerStart + i * LMM_MARKER_SIZE;
      const kind = bytes[o + 0x0C];
      const m = {
        index: i, kind, kindName: MARKER_KINDS[kind] || ('Kind ' + kind),
        x: dv.getFloat32(o, true), y: dv.getFloat32(o + 4, true), z: dv.getFloat32(o + 8, true),
        handle: owner[i] ? ((owner[i][0] << 8) | owner[i][1]) + 1 : null,
        label: '',
      };
      if (kind === 0) {
        m.arrivalId = atoi(bytes, o + 0x32, LMM_MARKER_SIZE - 0x32);
        m.label = m.arrivalId === null ? 'arrival' : 'arrival ' + m.arrivalId;
      } else if (kind === 2) {
        m.name = fixedName(bytes, o + 0x40, 8);
        m.subtype = bytes[o + 0x57];
        m.initialState = bytes[o + 0x48];
        m.label = m.name;
        const prefix = m.name.slice(0, 3);
        if (prefix === '1ZZ' || prefix === '2ZZ' || prefix === '3ZZ') m.stateIndex = atoi(bytes, o + 0x43, 5);
        if (m.subtype === 5) {
          m.destinationLevel = bytes[o + 0x5A];
          m.destinationArrival = atoi(bytes, o + 0x5B, 8);
        }
      } else if (kind === 3) {
        m.label = fixedName(bytes, o + 0x34, 8);
      } else if (kind === 4 || kind === 8) {
        m.label = fixedName(bytes, o + 0x30, 8);
      } else if (kind === 5) {
        m.encounter = dv.getInt32(o + 0x30, true);
        m.label = 'encounter ' + m.encounter;
      } else if (kind === 7) {
        m.label = 'equipment set ' + dv.getUint16(o + 0x30, true);
      } else if (kind === 9) {
        m.label = 'rest point';
      } else if (kind === 10) {
        m.label = 'light ' + bytes[o + 0x30];
      }
      markers.push(m);
    }
    return markers;
  }

  // ---- container -----------------------------------------------------------------------------

  function baseName(path) {
    const parts = path.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1];
  }

  const CLOUD_CELL = 40;

  // Compact per-area summary: arrival points, stateful and named objects, conversation and
  // encounter spots, and a coarse point cloud of walkable and scenery positions for drawing.
  function summarizeArea(markers) {
    const arrivals = [];
    const objects = [];
    const spots = [];
    const seen = new Set();
    const cloud = [];
    for (const m of markers) {
      const x = Math.round(m.x);
      const y = Math.round(m.y);
      const z = Math.round(m.z);
      if (m.kind === 0 && m.arrivalId !== null) arrivals.push([m.arrivalId, x, y, z]);
      else if (m.kind === 2) objects.push([m.name, m.subtype, m.initialState, x, y, z, m.destinationLevel === undefined ? -1 : m.destinationLevel]);
      else if (m.kind === 8 || m.kind === 5 || m.kind === 9) spots.push([m.kind, m.kind === 5 ? m.encounter : m.label, x, y, z]);
      if (m.kind === 3 || m.kind === 1 || m.kind === 2) {
        const key = Math.round(m.x / CLOUD_CELL) + ',' + Math.round(m.y / CLOUD_CELL);
        if (!seen.has(key)) { seen.add(key); cloud.push(x, y, z); }
      }
    }
    return { arrivals, objects, spots, cloud };
  }

  // Point clouds are stored as base64 little-endian 16-bit integers.
  function packCloud(values) {
    const bytes = new Uint8Array(values.length * 2);
    const dv = new DataView(bytes.buffer);
    values.forEach((v, i) => dv.setInt16(i * 2, Math.max(-32768, Math.min(32767, v)), true));
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
  }
  function unpackCloud(text) {
    if (Array.isArray(text)) return text;
    const bin = typeof atob === 'function' ? atob(text) : Buffer.from(text, 'base64').toString('binary');
    const dv = new DataView(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i += 1) dv.setUint8(i, bin.charCodeAt(i));
    const out = new Array(bin.length / 2);
    for (let i = 0; i < out.length; i += 1) out[i] = dv.getInt16(i * 2, true);
    return out;
  }

  // Rebuilds marker objects from a summary so callers see one shape whatever the source.
  function markersFromSummary(sum) {
    const out = [];
    let i = 0;
    for (const [id, x, y, z] of sum.arrivals) out.push({ index: i++, kind: 0, kindName: 'Arrival', arrivalId: id, label: 'arrival ' + id, x, y, z });
    for (const [name, subtype, initialState, x, y, z, dest] of sum.objects) {
      const m = { index: i++, kind: 2, kindName: 'Object', name, label: name, subtype, initialState, x, y, z };
      const prefix = name.slice(0, 3);
      if (prefix === '1ZZ' || prefix === '2ZZ' || prefix === '3ZZ') {
        const n = /^\s*(\d+)/.exec(name.slice(3));
        if (n) m.stateIndex = Number(n[1]);
      }
      if (dest >= 0) m.destinationLevel = dest;
      out.push(m);
    }
    for (const [kind, label, x, y, z] of sum.spots) {
      out.push({ index: i++, kind, kindName: MARKER_KINDS[kind], label: kind === 5 ? 'encounter ' + label : String(label), encounter: kind === 5 ? label : undefined, x, y, z });
    }
    return out;
  }

  class GameData {
    constructor() {
      this.system = null;
      this.items = null;
      this.itemById = new Map();
      this.creatures = null;
      this.equipSets = null;
      this.icons = null;
      this.looks = null;
      this.worldVars = null;
      this.index = null;
      this.areaFiles = new Map();
      this.areaCache = new Map();
      this.areaSummaries = new Map();
      this.origin = '';
    }

    get loaded() { return Boolean(this.items || this.creatures || this.worldVars || this.areaFiles.size || this.areaSummaries.size); }

    static fromBundle(bundle) {
      const g = new GameData();
      if (!bundle) return g;
      g.origin = 'bundled';
      g.system = [];
      for (const [id, text] of Object.entries(bundle.strings || {})) g.system[Number(id)] = text;
      g.items = bundle.items.map((r, id) => ({
        id, name: r[0], baseName: r[1], type: r[2], category: r[3], value: r[4], weight: r[5], w: r[6], h: r[7],
        slotMask: r[8], classMask: r[9], maxCharges: r[10], initialCharges: r[11], identifiable: r[12],
        model: r[13], dieCount: r[14], dieSides: r[15], dmgBonus: r[16], critMin: r[17], critMult: r[18], acBonus: r[19], bodyLook: r[20],
      }));
      g.itemById = new Map(g.items.map((it) => [it.id, it]));
      g.creatures = bundle.creatures.map((r, id) => ({ id, name: r[0], level: r[1], xp: r[2], model: r[3], look: r[4] }));
      if (bundle.equipSets) g.equipSets = new Map(bundle.equipSets.map(([label, slots]) => [label, slots]));
      g.icons = bundle.icons || null;
      g.looks = bundle.looks || null;
      g.worldVars = bundle.index.vars.map((v) => ({ name: v.name, source: v.script }));
      g.index = bundle.index;
      for (const [file, sum] of Object.entries(bundle.areas)) {
        g.areaSummaries.set(file.toLowerCase(), Object.assign({}, sum, { cloud: unpackCloud(sum.cloud) }));
      }
      return g;
    }

    toBundle(language, stringIds) {
      const strings = {};
      for (const id of stringIds || []) { const t = this.systemString(id); if (t) strings[id] = t; }
      const areas = {};
      for (const [file, sum] of this.areaSummaries) areas[file] = Object.assign({}, sum, { cloud: packCloud(sum.cloud) });
      return {
        format: 1,
        language: language || '',
        strings,
        items: this.items.map((it) => [it.name || '', it.baseName || '', it.type, it.category, it.value, it.weight, it.w, it.h,
          it.slotMask, it.classMask, it.maxCharges, it.initialCharges, it.identifiable,
          it.model, it.dieCount, it.dieSides, it.dmgBonus, it.critMin, it.critMult, it.acBonus, it.bodyLook]),
        creatures: this.creatures.map((c) => [c.name || '', c.level, c.xp, c.model, c.look]),
        equipSets: this.equipSets ? Array.from(this.equipSets.entries()) : [],
        icons: this.icons || [],
        looks: this.looks || {},
        index: this.index,
        areas,
      };
    }

    // files: array of {path, read(): Promise<Uint8Array>}; progress(text) reports long steps.
    async load(files, progress) {
      const norm = (f) => f.path.replace(/\\/g, '/').toLowerCase();
      const pick = (test) => files.filter((f) => test(norm(f))).sort((a, b) => a.path.length - b.path.length)[0];
      const notes = [];
      const read = async (f, fn) => {
        if (!f) return null;
        try {
          return fn(await f.read());
        } catch (error) {
          notes.push(baseName(f.path) + ': ' + error.message);
          return null;
        }
      };
      const say = (t) => { if (progress) progress(t); };
      this.origin = 'folder';
      say('Reading text and catalogs');
      const system = await read(pick((p) => p.endsWith('sfdat.dat')), parseSystemStrings);
      if (system) this.system = system;
      const itemText = await read(pick((p) => p.endsWith('/str/tee.str') || p === 'tee.str'), parseLineTable);
      const teeFile = pick((p) => p.endsWith('tee.trs'));
      const items = await read(teeFile, parseItemCatalog);
      const sets = await read(teeFile, parseEquipSets);
      if (sets) this.equipSets = sets;
      if (items) {
        for (const it of items) {
          it.name = itemText ? itemText[it.fullNameStr] || itemText[it.nameStr] || '' : '';
          it.baseName = itemText ? itemText[it.nameStr] || '' : '';
        }
        this.items = items;
        this.itemById = new Map(items.map((it) => [it.id, it]));
      }
      const creatureText = await read(pick((p) => p.endsWith('/str/monsters.str') || p === 'monsters.str'), parseLineTable);
      const creatures = await read(pick((p) => p.endsWith('monsters.mon')), parseCreatureCatalog);
      if (creatures) {
        for (const c of creatures) c.name = creatureText ? creatureText[c.nameStr] || '' : '';
        this.creatures = creatures;
      }
      const worldVars = await read(pick((p) => p.endsWith('test.cv')), parseWorldVarNames);
      if (worldVars) this.worldVars = worldVars;
      const S = root.PorScripts;
      const idxFile = pick((p) => p.endsWith('dialogue/all.idx') || p === 'all.idx');
      const dbFile = pick((p) => p.endsWith('dialogue/all.db') || p === 'all.db');
      if (S && idxFile && dbFile) {
        say('Reading conversation scripts');
        const tables = {};
        for (const ext of ['cv', 'ck', 'cj', 'cl']) {
          tables[ext] = (await read(pick((p) => p.endsWith('test.' + ext)), S.parseNameTable)) || [];
        }
        const scriptIndex = await read(idxFile, S.parseScriptIndex);
        const db = await read(dbFile, (b) => b);
        if (scriptIndex && db) {
          const scripts = scriptIndex.map((e) => ({ name: e.name, chains: S.parseScript(db, e.offset) || [] }));
          // One text file per conversation: when copies share a name, the shortest path is the game's own.
          const byName = new Map();
          for (const f of files) {
            const p = norm(f);
            if (!p.endsWith('.por')) continue;
            const key = baseName(p).replace(/\.por$/, '');
            if (!byName.has(key) || f.path.length < byName.get(key).path.length) byName.set(key, f);
          }
          const texts = new Map();
          let done = 0;
          for (const [key, f] of byName) {
            const rows = await read(f, S.parseConversationText);
            if (rows) texts.set(key, rows);
            done += 1;
            if (done % 200 === 0) say('Reading conversation text ' + done + ' of ' + byName.size);
          }
          this.index = S.buildIndex(tables, scripts, texts);
        }
      }
      for (const f of files) {
        const p = norm(f);
        if (p.endsWith('.lmm')) {
          const key = baseName(p).replace(/\.lmm$/, '');
          if (!this.areaFiles.has(key) || f.path.length < this.areaFiles.get(key).path.length) this.areaFiles.set(key, f);
        }
      }
      this.areaCache.clear();
      return notes;
    }

    // Reads every area file and keeps its summary (used when building the bundled data).
    async summarizeAreas(progress) {
      for (const [key] of this.areaFiles) {
        if (progress) progress('Summarizing ' + key);
        const markers = await this.areaMarkers(key);
        if (markers) this.areaSummaries.set(key, summarizeArea(markers));
      }
    }

    systemString(id) {
      return this.system && id >= 0 && id < this.system.length && this.system[id] ? this.system[id] : null;
    }

    item(id) { return this.itemById.get(id) || null; }
    itemName(id) { const it = this.item(id); return it && it.name ? it.name : null; }
    itemBaseName(id) { const it = this.item(id); return it && it.baseName ? it.baseName : null; }
    creature(id) { return this.creatures && id >= 0 && id < this.creatures.length ? this.creatures[id] : null; }
    equipSet(label) { return this.equipSets ? this.equipSets.get(label) || null : null; }
    icon(n) { return this.icons && this.icons[n] ? this.icons[n] : null; }
    itemIcon(id) { const it = this.item(id); return it ? this.icon(it.category) : null; }
    // Looks available for a model: {parts, looks: {look: number of texture parts that have it}} or null.
    modelLooks(model) { return this.looks && this.looks[model] ? this.looks[model] : null; }
    creatureName(id) { const c = this.creature(id); return c && c.name ? c.name : null; }
    worldVar(i) { return this.worldVars && i < this.worldVars.length ? this.worldVars[i] : null; }
    varInfo(i) { return this.index && this.index.vars[i] ? this.index.vars[i] : null; }
    encounterInfo(name) { return this.findNamed(this.index && this.index.encounters, name); }
    doorInfo(name) { return this.findNamed(this.index && this.index.doors, name); }
    npcInfo(name) { return this.findNamed(this.index && this.index.npcs, name); }
    conversation(name) {
      return (this.index && this.index.conversations[String(name).toLowerCase()]) || null;
    }
    conversationSpeakers(name) {
      const c = this.conversation(name);
      return c ? c.speakers : null;
    }
    findNamed(list, name) {
      if (!list || !name) return null;
      const want = name.trim().toLowerCase();
      return list.find((x) => x.name.trim().toLowerCase() === want) || null;
    }

    hasArea(fileName) {
      const key = String(fileName || '').toLowerCase();
      return this.areaFiles.has(key) || this.areaSummaries.has(key);
    }

    async areaMarkers(fileName) {
      const key = String(fileName || '').toLowerCase();
      if (!key) return null;
      if (!this.areaCache.has(key)) {
        if (this.areaFiles.has(key)) this.areaCache.set(key, this.areaFiles.get(key).read().then(parseAreaMarkers));
        else if (this.areaSummaries.has(key)) this.areaCache.set(key, Promise.resolve(markersFromSummary(this.areaSummaries.get(key))));
        else return null;
      }
      return this.areaCache.get(key);
    }

    // Coarse positions for drawing an area: [x, y, z] repeated.
    async areaCloud(fileName) {
      const key = String(fileName || '').toLowerCase();
      if (this.areaSummaries.has(key)) return this.areaSummaries.get(key).cloud;
      const markers = await this.areaMarkers(key);
      if (!markers) return null;
      const sum = summarizeArea(markers);
      this.areaSummaries.set(key, sum);
      return sum.cloud;
    }
  }

  const api = {
    GameData, parseSystemStrings, parseLineTable, parseWorldVarNames, parseItemCatalog, parseCreatureCatalog, parseEquipSets,
    parseAreaMarkers, summarizeArea, markersFromSummary, parseCreatureFile, serializeCreatureFile, parseItemFile, serializeItemFile, MARKER_KINDS,
  };
  root.PorGameData = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
