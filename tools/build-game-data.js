#!/usr/bin/env node
// Builds js/game-data.js, the item, creature, world-variable, conversation, area, picture and model-look
// data the editor shows without a game folder, from an installed copy of the game:
//   node tools/build-game-data.js <game folder> [language name]
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

require('../js/bytes.js');
require('../js/scripts.js');
const T = require('../js/tables.js');
const G = require('../js/gamedata.js');

const WANTED = /\.(dat|trs|str|mon|cv|ck|cj|cl|idx|db|por|lmm)$/i;

function collect(dir) {
  const out = [];
  (function walk(p) {
    for (const name of fs.readdirSync(p)) {
      const q = path.join(p, name);
      const st = fs.statSync(q);
      if (st.isDirectory()) walk(q);
      else if (WANTED.test(name)) out.push({ path: path.relative(dir, q), read: async () => new Uint8Array(fs.readFileSync(q)) });
    }
  })(dir);
  return out;
}

// Case-insensitive lookup of one path below a folder; returns the real path or null.
function findPath(base, rel) {
  let cur = base;
  for (const part of rel.split('/')) {
    if (!fs.existsSync(cur) || !fs.statSync(cur).isDirectory()) return null;
    const hit = fs.readdirSync(cur).find((n) => n.toLowerCase() === part.toLowerCase());
    if (!hit) return null;
    cur = path.join(cur, hit);
  }
  return cur;
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function pngChunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0))]);
}

// 24-bit uncompressed BMP to a PNG data URL; near-pure green is the game's transparent colour.
function bmpToDataUrl(buf) {
  if (buf.length < 54 || buf.toString('latin1', 0, 2) !== 'BM') return null;
  const dataOff = buf.readUInt32LE(10);
  const w = buf.readInt32LE(18);
  const hRaw = buf.readInt32LE(22);
  const bpp = buf.readUInt16LE(28);
  const compression = buf.readUInt32LE(30);
  if (bpp !== 24 || compression !== 0 || w <= 0 || hRaw === 0) return null;
  const h = Math.abs(hRaw);
  const stride = Math.ceil((w * 3) / 4) * 4;
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const src = dataOff + (hRaw > 0 ? h - 1 - y : y) * stride;
    for (let x = 0; x < w; x += 1) {
      const b = buf[src + x * 3];
      const g = buf[src + x * 3 + 1];
      const r = buf[src + x * 3 + 2];
      const o = (y * w + x) * 4;
      const key = r < 8 && g >= 252 && b < 8;
      rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = key ? 0 : 255;
    }
  }
  return 'data:image/png;base64,' + encodePng(w, h, rgba).toString('base64');
}

function readIcons(dataDir) {
  const out = [];
  let missing = 0;
  for (const name of T.ITEM_ICONS) {
    const p = findPath(dataDir, 'Interface/' + name + '.bmp');
    const url = p ? bmpToDataUrl(fs.readFileSync(p)) : null;
    if (!url) missing += 1;
    out.push(url || '');
  }
  return { icons: out, missing };
}

// Texture-pack directory: u32 count, u32 total size, then 56-byte entries {name[52], u32 offset}.
function packNames(buf) {
  if (buf.length < 8) return [];
  const n = buf.readUInt32LE(0);
  const names = [];
  for (let i = 0; i < n && 8 + (i + 1) * 56 <= buf.length; i += 1) {
    const raw = buf.subarray(8 + i * 56, 8 + i * 56 + 52);
    const z = raw.indexOf(0);
    names.push(raw.toString('latin1', 0, z < 0 ? 52 : z));
  }
  return names;
}

// Looks a model offers: the numbers the game can put in place of the one or two digits before
// a texture name's extension (one digit below 10, two digits from 10).
function readLooks(dataDir) {
  const looks = {};
  T.MODEL_PATHS.forEach((rel, model) => {
    const tag = (rel.split('/')[1] || '').replace(/\.nat$/i, '');
    if (!tag || rel.startsWith('objects/')) return;
    const p = findPath(dataDir, 'INK/' + tag + '.cnk');
    if (!p) return;
    const parts = new Map();
    for (const name of packNames(fs.readFileSync(p))) {
      const m = /^(.*?)(\d{1,2})\.ink$/i.exec(name);
      if (!m) continue;
      const v = Number(m[2]);
      if (m[2].length === 2 && v < 10) continue;
      const part = m[1].toLowerCase();
      if (!parts.has(part)) parts.set(part, new Set());
      parts.get(part).add(v);
    }
    if (!parts.size) return;
    const counts = {};
    for (const set of parts.values()) for (const v of set) counts[v] = (counts[v] || 0) + 1;
    looks[model] = { parts: parts.size, looks: counts };
  });
  return looks;
}

async function main() {
  const dir = process.argv[2];
  const language = process.argv[3] || 'English';
  if (!dir) {
    console.error('usage: node tools/build-game-data.js <game folder> [language name]');
    process.exit(2);
  }
  const gd = new G.GameData();
  const notes = await gd.load(collect(dir), (t) => console.log(t));
  for (const n of notes) console.warn('warning: ' + n);
  if (!gd.items || !gd.creatures || !gd.index) {
    console.error('the folder is missing the item catalog, creature catalog or conversation scripts');
    process.exit(1);
  }
  await gd.summarizeAreas();
  const dataDir = findPath(dir, 'data') || dir;
  const { icons, missing } = readIcons(dataDir);
  if (missing) console.warn('warning: ' + missing + ' item pictures were not found or not readable');
  gd.icons = icons;
  gd.looks = readLooks(dataDir);
  const bundle = gd.toBundle(language, T.stringIds());
  const target = path.join(__dirname, '..', 'js', 'game-data.js');
  const text = '// Generated by tools/build-game-data.js from the game\'s data files; rebuild rather than edit.\n'
    + '(function (root) {\n  \'use strict\';\n  root.PorBundledData = ' + JSON.stringify(bundle) + ';\n'
    + '})(typeof globalThis !== \'undefined\' ? globalThis : this);\n';
  fs.writeFileSync(target, text);
  console.log('wrote %s (%d KB): %d items, %d creatures, %d equipment sets, %d pictures, %d models with looks, %d world variables, %d conversations, %d areas',
    path.relative(process.cwd(), target), Math.round(text.length / 1024), bundle.items.length, bundle.creatures.length,
    bundle.equipSets.length, icons.filter(Boolean).length, Object.keys(bundle.looks).length,
    bundle.index.vars.length, Object.keys(bundle.index.conversations).length, Object.keys(bundle.areas).length);
}

main().catch((error) => { console.error(error); process.exit(1); });
