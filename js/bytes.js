// Little-endian byte blocks, a bounded reader, a chunked writer and the game's text codec.
(function (root) {
  'use strict';

  class FormatError extends Error {
    constructor(message) {
      super(message);
      this.name = 'FormatError';
    }
  }

  function hex(value, width) {
    const text = (value >>> 0).toString(16).toUpperCase();
    return '0x' + (width ? text.padStart(width, '0') : text);
  }

  // Characters that are common in the game's text in each language, used to tell code pages apart.
  const COMMON_TRADITIONAL = '的一是不了人我在有他這中大來上個到說們為子和你地出道也時年得就那要下以生會自著去之過家學對可她裡後小麼心多天而能好都然沒日於起還發成事只作當想看文無開手十用主行方又如前所本見經頭面同三已老從動兩長知樣現分將外但身些與高意進把法此實回二理點月明其種聲全工己話兒者向情部正名定女問力機給等幾很最間新什打便位因重被走四第門相次東再真聽世氣信北少關並內加由卻代入先山五太水萬眼體別處才場師書比住九笑性通目白死常感金何反合放做或光王果及今各任至物象記邊共風戰接它許八特覺直林題南度色字請交愛讓算百吃元術結六功指思非流每青管夫連遠跟帶花快條變言往展該領近留紅決周保達七必城父強步完深即求士量空眾輕程告滿令黃德收錢倒未持取設始千片容像找友站改形早房音火則首單據失拿香似石若兵弟誰讀志飛觀爭包落離壞劍盾甲戒藥卷軸魔杖弓箭斧錘矛匕護符項鍊靴套袍皮鎖板短巨骷髏殭屍龍蜘蛛狼熊精靈矮獸半惡鬼怪巫牧盜賊治療傷害冰電毒盔腰';
  const COMMON_SIMPLIFIED = '的一是不了人我在有他这中大来上个到说们为子和你地出道也时年得就那要下以生会自着去之过家学对可她里后小么心多天而能好都然没日于起还发成事只作当想看文无开手十用主行方又如前所本见经头面同三已老从动两长知样现分将外但身些与高意进把法此实回二理点月明其种声全工己话儿者向情部正名定女问力机给等几很最间新什打便位因重被走四第门相次东再真听世气信北少关并内加由却代入先山五太水万眼体别处才场师书比住九笑性通目白死常感金何反合放做或光王果及今各任至物象记边共风战接它许八特觉直林题南度色字请交爱让算百吃元术结六功指思非流每青管夫连远跟带花快条变言往展该领近留红决周保达七必城父强步完深即求士量空众轻程告满令黄德收钱倒未持取设始千片容像找友站改形早房音火则首单据失拿香似石若兵弟谁读志飞观争包落离坏剑盾甲戒药卷轴魔杖弓箭斧锤矛匕护符项链靴套袍皮锁板短巨骷髅僵尸龙蜘蛛狼熊精灵矮兽半恶鬼怪巫牧盗贼治疗伤害冰电毒盔腰';
  const WESTERN_LETTERS = 'àâäæçéèêëîïôœùûüÿáíóúñ¿¡ßöãõìòÀÂÄÆÇÉÈÊËÎÏÔŒÙÛÜŸÁÍÓÚÑÖÃÕÌÒ’‘“”…–—«»°';
  const CENTRAL_LETTERS = 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻčďěňřšťůžýáéíúČĎĚŇŘŠŤŮŽÝÁÉÍÚöüőűÖÜŐŰ’‘“”„…–—«»°';

  // The code pages the game's text can be in, best first when two score the same.
  const CODE_PAGES = ['windows-1252', 'windows-1250', 'windows-1251', 'big5', 'gbk'];

  // Bytes 0x80-0x9F of windows-1252. Some TextDecoder implementations read that label as Latin-1 and
  // return control characters for this row.
  const WINDOWS_1252_ROW_8 = '€\x81‚ƒ„…†‡ˆ‰Š‹Œ\x8DŽ\x8F\x90‘’“”•–—˜™š›œ\x9DžŸ';

  // 256-entry table for a single-byte code page, or null for a double-byte one.
  const tables = new Map();
  function singleByteTable(label, decoder) {
    if (tables.has(label)) return tables.get(label);
    const table = new Array(256);
    let single = true;
    for (let i = 0; i < 256; i += 1) {
      let ch = i === 0 ? '\0' : decoder.decode(new Uint8Array([i]));
      if (label === 'windows-1252' && i >= 0x80 && i < 0xA0) ch = WINDOWS_1252_ROW_8[i - 0x80];
      table[i] = ch;
      if (i >= 0x80 && (ch.length !== 1 || ch === '�')) single = false;
    }
    tables.set(label, single ? table : null);
    return tables.get(label);
  }

  function decodeWith(label, decoder, bytes) {
    const table = singleByteTable(label, decoder);
    if (!table) return decoder.decode(bytes);
    let text = '';
    for (let i = 0; i < bytes.length; i += 1) text += table[bytes[i]];
    return text;
  }

  // Text codec for the installed language's code page. Single-byte pages use a 256-entry table;
  // double-byte pages (Big5, GBK) decode through TextDecoder and encode through a reverse map built
  // on first use, trying standard lead bytes before extension ones so duplicates encode as usual.
  const Codec = {
    label: 'windows-1252',
    decoder: null,
    decodeTable: null,
    encodeMap: null,
    setLabel(label) {
      let decoder;
      try {
        decoder = new TextDecoder(label);
      } catch (error) {
        decoder = new TextDecoder('windows-1252');
        label = 'windows-1252';
      }
      this.label = label;
      this.decoder = decoder;
      this.decodeTable = singleByteTable(label, decoder);
      this.encodeMap = null;
    },
    get multiByte() { return this.decodeTable === null; },
    buildEncodeMap() {
      const map = new Map();
      const add = (ch, bytes) => { if (!map.has(ch)) map.set(ch, bytes); };
      if (this.decodeTable) {
        for (let i = 0; i < 256; i += 1) add(this.decodeTable[i], [i]);
        return map;
      }
      for (let i = 0; i < 0x80; i += 1) add(String.fromCharCode(i), [i]);
      const leads = [];
      for (let b = 0xA1; b <= 0xFE; b += 1) leads.push(b);
      for (let b = 0x80; b <= 0xA0; b += 1) leads.push(b);
      for (const lead of leads) {
        const one = this.decoder.decode(new Uint8Array([lead]));
        if (one.length === 1 && one !== '�') { add(one, [lead]); continue; }
        for (let trail = 0x40; trail <= 0xFE; trail += 1) {
          const ch = this.decoder.decode(new Uint8Array([lead, trail]));
          if (ch !== '�' && Array.from(ch).length === 1) add(ch, [lead, trail]);
        }
      }
      return map;
    },
    decode(bytes) { return decodeWith(this.label, this.decoder, bytes); },
    encode(text) {
      if (!this.encodeMap) this.encodeMap = this.buildEncodeMap();
      const out = [];
      for (const ch of text) {
        const code = this.encodeMap.get(ch);
        if (code === undefined) out.push(0x3F);
        else for (const b of code) out.push(b);
      }
      return Uint8Array.from(out);
    },
    // The code page that reads the bytes most plausibly, or null when they are plain ASCII or too short
    // to tell.
    guess(bytes) {
      let high = 0;
      for (let i = 0; i < bytes.length; i += 1) if (bytes[i] >= 0x80) high += 1;
      if (high < 16) return null;
      let best = null;
      let bestScore = -Infinity;
      for (const label of CODE_PAGES) {
        const score = plausibility(label, decodeWith(label, new TextDecoder(label), bytes));
        if (score > bestScore + 0.02) { best = label; bestScore = score; }
      }
      return best;
    },
  };

  // Average weight of the non-ASCII characters in text as read with a code page: common letters or
  // characters of that language score 1, unreadable bytes and control characters count against it.
  // Accented Latin letters count only beside an ASCII letter, since Latin text rarely has long runs of
  // them and Chinese or Cyrillic text read as Latin does.
  function plausibility(label, text) {
    const chars = Array.from(text);
    const ascii = (c) => c !== undefined && /[A-Za-z]/.test(c);
    const nearAscii = (i) => ascii(chars[i - 1]) || ascii(chars[i + 1]) || ascii(chars[i - 2]) || ascii(chars[i + 2]);
    let sum = 0;
    let n = 0;
    for (let i = 0; i < chars.length; i += 1) {
      const ch = chars[i];
      const code = ch.codePointAt(0);
      if (code < 0x80) continue;
      n += 1;
      if (ch === '�' || (code >= 0x80 && code < 0xA0)) { sum -= 2; continue; }
      switch (label) {
        case 'windows-1252': sum += WESTERN_LETTERS.includes(ch) && nearAscii(i) ? 1 : 0; break;
        case 'windows-1250': sum += CENTRAL_LETTERS.includes(ch) && nearAscii(i) ? 1 : 0; break;
        case 'windows-1251': {
          // Russian words are runs of mostly lower-case letters.
          const lower = (c) => c && ((c >= 'а' && c <= 'я') || c === 'ё');
          if (lower(ch) && (lower(chars[i - 1]) || lower(chars[i + 1]))) sum += 1;
          else if ((ch >= 'А' && ch <= 'Я') && lower(chars[i + 1])) sum += 1;
          break;
        }
        default: {
          const common = label === 'big5' ? COMMON_TRADITIONAL : COMMON_SIMPLIFIED;
          if (common.includes(ch)) sum += 1;
          else if ((code >= 0x3000 && code <= 0x303F) || (code >= 0xFF01 && code <= 0xFF5E)) sum += 1;
          else if (code >= 0x4E00 && code <= 0x9FFF) sum += 0.2;
        }
      }
    }
    return n ? sum / n : 0;
  }
  Codec.setLabel('windows-1252');

  // A fixed-size record whose fields are read and written in place. Unknown bytes are preserved.
  class Block {
    constructor(bytes) {
      this.bytes = bytes;
      this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }
    static zero(size) { return new Block(new Uint8Array(size)); }
    get length() { return this.bytes.length; }
    clone() { return new Block(this.bytes.slice()); }
    u8(o) { return this.bytes[o]; }
    i8(o) { return this.view.getInt8(o); }
    u16(o) { return this.view.getUint16(o, true); }
    i16(o) { return this.view.getInt16(o, true); }
    u32(o) { return this.view.getUint32(o, true); }
    i32(o) { return this.view.getInt32(o, true); }
    f32(o) { return this.view.getFloat32(o, true); }
    setU8(o, v) { this.view.setUint8(o, v & 0xFF); }
    setI8(o, v) { this.view.setInt8(o, v); }
    setU16(o, v) { this.view.setUint16(o, v & 0xFFFF, true); }
    setI16(o, v) { this.view.setInt16(o, v, true); }
    setU32(o, v) { this.view.setUint32(o, v >>> 0, true); }
    setI32(o, v) { this.view.setInt32(o, v | 0, true); }
    setF32(o, v) { this.view.setFloat32(o, v, true); }
    get(type, o) {
      switch (type) {
        case 'u8': return this.u8(o);
        case 'i8': return this.i8(o);
        case 'u16': return this.u16(o);
        case 'i16': return this.i16(o);
        case 'u32': return this.u32(o);
        case 'i32': return this.i32(o);
        case 'f32': return this.f32(o);
        default: throw new Error('unknown field type ' + type);
      }
    }
    set(type, o, v) {
      switch (type) {
        case 'u8': return this.setU8(o, v);
        case 'i8': return this.setI8(o, v);
        case 'u16': return this.setU16(o, v);
        case 'i16': return this.setI16(o, v);
        case 'u32': return this.setU32(o, v);
        case 'i32': return this.setI32(o, v);
        case 'f32': return this.setF32(o, v);
        default: throw new Error('unknown field type ' + type);
      }
    }
    // Reads a NUL-terminated string from a fixed buffer. A buffer filled to its end is accepted.
    str(o, len) {
      const raw = this.bytes.subarray(o, o + len);
      const end = raw.indexOf(0);
      return Codec.decode(end < 0 ? raw : raw.subarray(0, end));
    }
    // Writes a string into a fixed buffer. Bytes after the terminator are cleared only up to the
    // previous string's end so filler the game never reads stays as it was.
    setStr(o, len, text, allowFull) {
      const encoded = Codec.encode(text);
      const limit = allowFull ? len : len - 1;
      if (encoded.length > limit) throw new FormatError('text is longer than ' + limit + ' bytes');
      const raw = this.bytes.subarray(o, o + len);
      const oldEnd = raw.indexOf(0) < 0 ? len : raw.indexOf(0);
      raw.set(encoded, 0);
      const clearTo = Math.min(len, Math.max(oldEnd + 1, encoded.length + 1));
      for (let i = encoded.length; i < clearTo; i += 1) raw[i] = 0;
    }
  }

  class Reader {
    constructor(bytes, pos) {
      this.bytes = bytes;
      this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      this.pos = pos || 0;
    }
    get remaining() { return this.bytes.length - this.pos; }
    need(n, what) {
      if (n < 0 || this.pos + n > this.bytes.length) {
        throw new FormatError((what || 'record') + ' runs past the end of the file at ' + hex(this.pos));
      }
    }
    u8(what) { this.need(1, what); return this.bytes[this.pos++]; }
    u16(what) { this.need(2, what); const v = this.view.getUint16(this.pos, true); this.pos += 2; return v; }
    u32(what) { this.need(4, what); const v = this.view.getUint32(this.pos, true); this.pos += 4; return v; }
    i32(what) { this.need(4, what); const v = this.view.getInt32(this.pos, true); this.pos += 4; return v; }
    f32(what) { this.need(4, what); const v = this.view.getFloat32(this.pos, true); this.pos += 4; return v; }
    peekU32(offset) {
      const at = this.pos + (offset || 0);
      if (at + 4 > this.bytes.length) throw new FormatError('read past the end of the file at ' + hex(at));
      return this.view.getUint32(at, true);
    }
    take(n, what) { this.need(n, what); const v = this.bytes.slice(this.pos, this.pos + n); this.pos += n; return v; }
    block(n, what) { return new Block(this.take(n, what)); }
  }

  class Writer {
    constructor() { this.parts = []; this.length = 0; }
    bytes(data) { this.parts.push(data); this.length += data.length; }
    block(b) { this.bytes(b.bytes); }
    u8(v) { this.bytes(Uint8Array.of(v & 0xFF)); }
    u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0, true); this.bytes(b); }
    i32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v | 0, true); this.bytes(b); }
    toBytes() {
      const out = new Uint8Array(this.length);
      let at = 0;
      for (const part of this.parts) { out.set(part, at); at += part.length; }
      return out;
    }
  }

  function bytesEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
    return true;
  }

  // Returns the changed byte ranges between two buffers as [start, end) pairs.
  function diffRanges(a, b, limit) {
    const ranges = [];
    const n = Math.max(a.length, b.length);
    let start = -1;
    for (let i = 0; i < n; i += 1) {
      const same = i < a.length && i < b.length && a[i] === b[i];
      if (!same && start < 0) start = i;
      if (same && start >= 0) {
        ranges.push([start, i]);
        start = -1;
        if (limit && ranges.length >= limit) return ranges;
      }
    }
    if (start >= 0) ranges.push([start, n]);
    return ranges;
  }

  const api = { FormatError, Codec, Block, Reader, Writer, hex, bytesEqual, diffRanges };
  root.PorBytes = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
