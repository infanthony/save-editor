#!/usr/bin/env node
// Exercises the save library against real files:
//   node tests/run-tests.js [--game <install folder>] [--list <file of paths>] <save file or folder>...
// Every .sav must rebuild byte-identical, and each edit must survive a full re-read.
'use strict';

const fs = require('fs');
const path = require('path');

const PorBytes = require('../js/bytes.js');
const PorScripts = require('../js/scripts.js');
const T = require('../js/tables.js');
const S = require('../js/savefile.js');
const ST = require('../js/statefile.js');
const G = require('../js/gamedata.js');
const M = require('../js/model.js');

const args = process.argv.slice(2);
let gameDir = null;
const inputs = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--game') gameDir = args[++i];
  else if (args[i] === '--list') inputs.push(...fs.readFileSync(args[++i], 'utf8').split(/\r?\n/).filter(Boolean));
  else inputs.push(args[i]);
}

let failures = 0;
const fail = (msg) => { failures += 1; console.log('FAIL ' + msg); };
const ok = (cond, msg) => { if (!cond) fail(msg); };

function walk(p, out) {
  const st = fs.statSync(p);
  if (st.isDirectory()) for (const n of fs.readdirSync(p)) walk(path.join(p, n), out);
  else if (/\.sav$/i.test(p)) out.push(p);
  return out;
}

function tableChecks() {
  ok(T.CLASSES.length === 8, 'eight classes');
  ok(T.RACES.length === 6, 'six races');
  ok(T.ALIGNMENTS.length === 9, 'nine alignments');
  ok(T.SKILLS.length === 13, 'thirteen skills');
  ok(T.FEATS.length === 18, 'eighteen feats');
  ok(T.CLASS_FEATURES.length === 23, 'twenty-three class features');
  ok(T.ARCANE_SPELLS.length === 66, 'sixty-six arcane spell rows');
  ok(T.EFFECTS.length === 84, 'eighty-four effect rows, got ' + T.EFFECTS.length);
  ok(T.LEVELS.length === 46, 'forty-six areas');
  ok(T.DIVINE_SPELLS.length === 55 && T.DIVINE_SPELL_DESC.length === 55, 'fifty-five divine spell rows');
  ok(T.SPECIAL_ABILITIES.length === 17, 'seventeen special abilities');
  ok(T.ITEM_ICONS.length === 87, 'eighty-seven item pictures');
  ok(T.ITEM_MODELS.length === 36, 'thirty-six item models');
  ok(T.MODEL_PATHS.length === 327, '327 model paths');
  // Field layouts stay inside their records and never overlap one another.
  const size = { u8: 1, i8: 1, u16: 2, i16: 2, hex16: 2, u32: 4, i32: 4, f32: 4, hex: 4, rgba: 4, argb: 4 };
  for (const [name, fields, len] of [['creature template', T.CREATURE_TEMPLATE_FIELDS, 0xE4], ['creature attack', T.CREATURE_ATTACK_FIELDS, 9],
    ['item template', T.ITEM_TEMPLATE_FIELDS, 72], ['item effect', T.ITEM_EFFECT_FIELDS, 30], ['actor', T.ACTOR_FIELDS, 0x84], ['character', T.PC_FIELDS, 0x150]]) {
    const used = new Array(len).fill(null);
    for (const f of fields) {
      const bytes = f.t === 'str' ? f.len : size[f.t] * (f.n || 1);
      for (let b = f.o; b < f.o + bytes; b += 1) {
        if (b >= len) { fail(name + ' field ' + f.k + ' runs past the record'); break; }
        if (used[b]) fail(name + ' fields ' + used[b] + ' and ' + f.k + ' overlap at 0x' + b.toString(16));
        used[b] = f.k;
      }
    }
  }
  // Model text: one bone moved up 10 units carries a triangle with it.
  const nat = M.parseNat([
    'NAT', 'version 3.3', 'hierarchy', '[', 'bone Root', '{', 't 0 0 10', 'e 0 0 90', '}', ']',
    'geometry_physique', '[', 'physique', '{', 'vertList 3', '{',
    'v_phys 1', '{', 'xyz Root 1.0 1 0 0', '}', 'v_phys 1', '{', 'xyz Root 1.0 0 1 0', '}', 'v_phys 1', '{', 'xyz Root 1.0 0 0 1', '}', '}',
    'textList 1', '{', 't 0 0', '}', 'texture a0.tga', 'polyList 3', '{', 'f 0 0', 'f 1 0', 'f 2 0', '}', '}', ']',
  ].join(String.fromCharCode(10)));
  const geo = M.buildGeometry(nat);
  const p0 = Array.from(geo.parts[0].positions.slice(0, 3)).map((v) => Math.round(v * 1000) / 1000);
  ok(geo.parts.length === 1 && p0[0] === 0 && p0[1] === 1 && p0[2] === 10, 'model bones place vertices (got ' + p0 + ')');
  ok(M.lookNames('drwarm0.tga', 2, []).join() === 'drwarm2,drwarm0' && M.lookNames('6mfhand1.TGA', 21, [98]).join() === '6mfhand98,6mfhand21,6mfhand1', 'look texture names');
}

// Code pages: double-byte round trips, the windows-1252 0x80 row, detection and sfDat.dat byte units.
function codecChecks() {
  const C = PorBytes.Codec;
  const hexOf = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');
  C.setLabel('big5');
  ok(hexOf(C.encode('長劍 +1')) === 'aa f8 bc 43 20 2b 31', 'Big5 encode (got ' + hexOf(C.encode('長劍 +1')) + ')');
  ok(C.decode(Uint8Array.from([0xAA, 0xF8, 0xBC, 0x43])) === '長劍', 'Big5 decode');
  C.setLabel('gbk');
  ok(hexOf(C.encode('长剑')) === 'b3 a4 bd a3', 'GBK encode (got ' + hexOf(C.encode('长剑')) + ')');
  C.setLabel('windows-1252');
  ok(C.decode(Uint8Array.from([0x85, 0x92, 0xE9])) === '…’é' && hexOf(C.encode('…’é')) === '85 92 e9', 'windows-1252 row 0x80');
  const samples = [
    ['windows-1252', 'Épée longue de qualité supérieure, très légère. Le prêtre a été tué près de la forêt à côté du château.'],
    ['windows-1250', 'Długi miecz, który został wykuty przez krasnoludów. Zaklęcie ochronne działa na wszystkich członków drużyny. Łucznik zdobył złoty pierścień i księgę zaklęć.'],
    ['windows-1251', 'Длинный меч, выкованный гномами. Заклинание защиты действует на всех членов отряда.'],
    ['big5', '長劍 +1。這把劍是由矮人打造的，對所有的不死生物造成額外的傷害。'],
    ['gbk', '长剑 +1。这把剑是由矮人打造的，对所有的不死生物造成额外的伤害。'],
  ];
  for (const [label, text] of samples) {
    C.setLabel(label);
    const bytes = C.encode(text);
    ok(C.decode(bytes) === text, label + ' round trip');
    C.setLabel('windows-1252');
    ok(C.guess(bytes) === label, label + ' detected (got ' + C.guess(bytes) + ')');
  }
  ok(C.guess(Uint8Array.from(Buffer.from('Long Sword +1\nShield'))) === null, 'ASCII text is not guessed');
  // sfDat.dat: one string of sign-extended Big5 bytes, a plain byte and a UTF-16 unit.
  const units = [0xFFAA, 0xFFF8, 0xFFBC, 0x0043, 0x2019, 0x0000];
  const sf = new Uint8Array(8 + 4 + units.length * 2);
  const dv = new DataView(sf.buffer);
  dv.setUint32(0, 1, true);
  dv.setUint32(4, units.length, true);
  dv.setUint32(8, 0, true);
  units.forEach((u, c) => { sf[12 + c * 2] = (u & 0xFF) ^ 0x55; sf[13 + c * 2] = (u >> 8) ^ 0xBB; });
  C.setLabel('big5');
  ok(G.parseSystemStrings(sf)[0] === '長劍’', 'sfDat.dat double-byte text (got ' + JSON.stringify(G.parseSystemStrings(sf)[0]) + ')');
  C.setLabel('windows-1252');
}

// Every local script and stylesheet in index.html carries the same ?v= tag, so a reload never mixes versions.
function pageChecks() {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="((?:js|css)\/[^"]+)"/g)].map((m) => m[1]);
  const tags = new Set(refs.map((r) => (/[?&]v=([^&#]+)/.exec(r) || [])[1] || ''));
  ok(refs.length >= 10, 'index.html lists the scripts (' + refs.length + ')');
  ok(tags.size === 1 && !tags.has(''), 'every script and stylesheet has the same version tag (' + [...tags].join(', ') + ')');
}

async function loadGame(dir) {
  const files = [];
  (function rec(p) {
    for (const n of fs.readdirSync(p)) {
      const q = path.join(p, n);
      const st = fs.statSync(q);
      if (st.isDirectory()) rec(q);
      else if (/\.(dat|trs|str|mon|cv|ck|cj|cl|idx|db|por|lmm)$/i.test(n)) {
        files.push({ path: path.relative(dir, q), read: async () => new Uint8Array(fs.readFileSync(q)) });
      }
    }
  })(dir);
  const gd = new G.GameData();
  const notes = await gd.load(files);
  for (const n of notes) fail('game data: ' + n);
  ok(gd.system && gd.system.length > 1000, 'system strings load');
  ok(gd.items && gd.items.length > 1000, 'item catalog loads');
  ok(gd.items.every((it, i) => it.id === i), 'item catalog ids are sequential');
  ok(gd.creatures && gd.creatures.length > 100, 'creature catalog loads');
  ok(gd.worldVars && gd.worldVars.length > 1000, 'world variable names load');
  for (let i = 0; i < T.CLASSES.length; i += 1) ok(gd.systemString(T.CLASSES[i][1]) === T.CLASSES[i][0], 'class label ' + i);
  for (let i = 0; i < T.FEATS.length; i += 1) ok(gd.systemString(T.FEATS[i][1]) === T.FEATS[i][0], 'feat label ' + i);
  for (let i = 0; i < T.ARCANE_SPELLS.length; i += 1) ok(gd.systemString(T.ARCANE_SPELLS[i][1]) === T.ARCANE_SPELLS[i][0], 'spell label ' + i);
  for (let i = 0; i < T.EFFECTS.length; i += 1) if (T.EFFECTS[i][1] >= 0) ok(gd.systemString(T.EFFECTS[i][1]) === T.EFFECTS[i][0], 'effect label ' + i);
  for (let i = 1; i < T.LEVELS.length; i += 1) ok(gd.systemString(T.LEVELS[i][1]) !== null, 'area label ' + i);
  let areas = 0;
  let stateIndexed = 0;
  for (const [key] of gd.areaFiles) {
    const markers = await gd.areaMarkers(key);
    areas += 1;
    stateIndexed += markers.filter((m) => m.stateIndex !== undefined && m.stateIndex !== null).length;
  }
  ok(gd.index && gd.index.vars.length === gd.worldVars.length, 'conversation index covers every world variable');
  const described = gd.index.vars.filter((v) => v.set.length || v.check.length || v.journal.length).length;
  ok(described > gd.index.vars.length * 0.9, 'most world variables are described (' + described + ')');
  // Installs can hold languages/<lang>/data copies of the dialogue; the game's own data/Dialogue must win.
  const ownPor = path.join(dir, 'data', 'Dialogue', 'dw2z999.por');
  if (fs.existsSync(ownPor)) {
    const ownRows = PorScripts.parseConversationText(new Uint8Array(fs.readFileSync(ownPor)));
    const shown = ((gd.index.conversations.dw2z999 || {}).first || '').replace(/…$/, '').slice(0, 40);
    ok(shown && ownRows.some((r) => r.text && r.text.startsWith(shown)), 'conversation text comes from data/Dialogue (got ' + JSON.stringify(shown) + ')');
  }
  const mon = path.join(dir, 'data', 'Monsters.mon');
  if (fs.existsSync(mon)) {
    const bytes = new Uint8Array(fs.readFileSync(mon));
    const model = G.parseCreatureFile(bytes);
    ok(Buffer.compare(Buffer.from(G.serializeCreatureFile(model)), Buffer.from(bytes)) === 0, 'creature template file rebuilds byte-identical');
  }
  const tee = path.join(dir, 'data', 'TEE.trs');
  if (fs.existsSync(tee)) {
    const bytes = new Uint8Array(fs.readFileSync(tee));
    const model = G.parseItemFile(bytes);
    ok(model.items.length === gd.items.length, 'item file model reads every item');
    ok(Buffer.compare(Buffer.from(G.serializeItemFile(model)), Buffer.from(bytes)) === 0, 'item file rebuilds byte-identical');
  }
  await gd.summarizeAreas();
  const bundle = JSON.parse(JSON.stringify(gd.toBundle('test')));
  const back = G.GameData.fromBundle(bundle);
  ok(back.items.length === gd.items.length && back.itemName(17) === gd.itemName(17), 'bundle keeps item names');
  ok(back.creatureName(71) === gd.creatureName(71), 'bundle keeps creature names');
  ok(back.creature(71).model === gd.creature(71).model && back.creature(71).look === gd.creature(71).look, 'bundle keeps creature models and looks');
  ok(gd.equipSets && gd.equipSets.size > 1000 && back.equipSets.size === gd.equipSets.size, 'equipment sets load and survive the bundle');
  ok(gd.items.some((it) => it.weight < 0), 'item weights are signed');
  const longsword = gd.items.find((it) => it.name === 'Longsword');
  ok(!longsword || (longsword.dieCount === 1 && longsword.dieSides === 8 && longsword.critMin === 19 && longsword.critMult === 2), 'item damage fields');
  const cloudA = await gd.areaCloud('dwlvl3');
  const cloudB = await back.areaCloud('dwlvl3');
  ok(cloudA && cloudB && cloudA.length === cloudB.length && cloudA.every((v, i) => v === cloudB[i]), 'bundle keeps area point clouds');
  console.log('game data: %d strings, %d items, %d creatures, %d world variables (%d described), %d area files (%d stateful objects)',
    gd.system.length, gd.items.length, gd.creatures.length, gd.worldVars.length, described, areas, stateIndexed);
  return gd;
}

function sizeOf(gd) {
  return gd && gd.items ? (id) => { const it = gd.item(id); return it ? { w: it.w || 1, h: it.h || 1 } : null; } : null;
}

function editRoundTrip(file, bytes, gd) {
  const save = S.parse(bytes);
  const baseline = S.checkInvariants(save);
  const members = S.party(save).filter((m) => m.entity);
  if (save.mp || !members.length || save.mapRegionRaw) return 'skipped';
  const pc = members[0].entity;
  const name = S.entityName(pc);

  S.setWorldVar(save, 5, 1234);
  S.setNamedState(save, 2, 'webtest', 7);
  S.rest(pc);
  const before = pc.actor.items.length;
  const item = S.addItem(save, pc, 1, { sizeOf: sizeOf(gd), size: sizeOf(gd) ? sizeOf(gd)(1) : null });
  ok(pc.actor.items.length === before + 1, file + ': item added');
  const classes = S.pcClasses(pc).filter((c) => c.id < S.CLASS_SLOTS);
  if (classes.length) S.setPcClasses(pc, classes.map((c) => ({ id: c.id, level: Math.min(c.level + 1, 20) })));
  S.setKnownSpells(pc, S.knownSpells(pc).concat([10]).slice(0, S.KNOWN_SPELL_CAPACITY));
  if (save.maps.length) { S.setMapExplored(save.maps[0], true); S.addMapPin(save.maps[0], 0.5, 0.5, 'web test pin'); }
  S.relocateParty(save, S.partyCentroid(save).map((v) => v + 10));
  const v = S.validate(save, baseline);
  ok(v.ok, file + ': validate after edits: ' + v.problems.join('; '));
  const again = S.parse(v.bytes);
  const pc2 = S.findEntity(again, S.entityHandle(pc));
  ok(pc2 && S.entityName(pc2) === name, file + ': edited character survives');
  ok(S.worldVar(again, 5) === 1234, file + ': world variable survives');
  ok(again.namedStates.some((b) => S.namedState(b).name === 'webtest' && S.namedState(b).state === 7), file + ': named state survives');
  ok(pc2.actor.items.some((it) => it.equip.u16(4) === item.equip.u16(4)), file + ': added item survives');
  ok(again.actorList.i32(S.OFF.alArrival) === -1, file + ': relocation disables arrival placement');

  const moved = S.parse(bytes);
  S.moveToArea(moved, 8, { arrival: 0 });
  const mv = S.validate(moved, baseline);
  ok(mv.ok, file + ': validate after area move: ' + mv.problems.join('; '));
  const m2 = S.parse(mv.bytes);
  ok(m2.mapId === 8 && m2.entities.length === S.partyHandles(m2).length, file + ': area move keeps only the party');
  return 'edited';
}

async function main() {
  tableChecks();
  codecChecks();
  pageChecks();
  const gd = gameDir ? await loadGame(gameDir) : null;
  const files = [];
  for (const p of inputs) walk(p, files);
  let roundTrips = 0;
  let recovered = 0;
  let edited = 0;
  let mp = 0;
  const creatureIds = new Set();
  let nameMatches = 0;
  let namedCreatures = 0;
  const t0 = Date.now();
  for (const file of files) {
    const bytes = new Uint8Array(fs.readFileSync(file));
    let save;
    try {
      save = S.parse(bytes);
    } catch (error) {
      fail(file + ': ' + error.message);
      continue;
    }
    if (save.recovered) recovered += 1;
    if (save.mp) mp += 1;
    const rebuilt = S.serialize(save);
    if (Buffer.compare(Buffer.from(rebuilt), Buffer.from(bytes)) === 0) roundTrips += 1;
    else fail(file + ': rebuild differs');
    for (const e of save.entities) {
      if (e.tag !== 3 && e.tag !== 4) continue;
      creatureIds.add(e.data.u16(0));
      if (gd && S.entityName(e)) {
        namedCreatures += 1;
        if (gd.creatureName(e.data.u16(0)) === S.entityName(e)) nameMatches += 1;
      }
    }
    const sta = file + '.sta';
    if (fs.existsSync(sta)) {
      try { new ST.ObjectStateFile(new Uint8Array(fs.readFileSync(sta))); } catch (error) { fail(sta + ': ' + error.message); }
    }
    try {
      if (editRoundTrip(file, bytes, gd) === 'edited') edited += 1;
    } catch (error) {
      fail(file + ': edit test threw ' + error.stack);
    }
  }
  if (gd && gd.creatures) {
    const missing = [...creatureIds].filter((id) => !gd.creature(id));
    ok(missing.length === 0, 'every saved creature template id is in the catalog (missing: ' + missing.join(',') + ')');
    ok(!namedCreatures || nameMatches / namedCreatures > 0.6, 'creature names match their templates (' + nameMatches + ' of ' + namedCreatures + ')');
    console.log('creature names matching their template: %d of %d', nameMatches, namedCreatures);
  }
  console.log('%d saves: %d rebuilt byte-identical, %d read in recovery mode, %d multiplayer, %d edit round-trips (%d ms)',
    files.length, roundTrips, recovered, mp, edited, Date.now() - t0);
  console.log(failures ? failures + ' failure(s)' : 'all checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(2); });
