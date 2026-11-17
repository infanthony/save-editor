// Editor application: file handling, undo, and the editor views for saves and creature templates.
(function () {
  'use strict';

  const { h, clear, fieldGrid, hexEditor, toast, confirm, dialog, table, section, download, parseValue, formatValue, numClass } = PorUI;
  const S = PorSave;
  const T = PorTables;
  const ST = PorState;
  const G = PorGameData;
  const OFF = S.OFF;

  const UNDO_DEPTH = 40;
  const WORLD_VAR_PAGE = 100;
  const HEADER_PEEK = 0x5D;
  // The release version is the ?v= tag index.html puts on every script, so a reload never mixes versions.
  const VERSION = ((document.currentScript && /[?&]v=([^&#]+)/.exec(document.currentScript.src)) || [])[1] || '';

  const state = {
    save: null,
    sta: null,
    fileName: '',
    original: null,
    originalSta: null,
    baseline: [],
    dir: null,
    folder: null,
    game: new G.GameData(),
    bundled: null,
    gameDir: null,
    gameFiles: null,
    encodingChosen: false,
    creatureFile: null,
    itemFile: null,
    assets: null,
    modelLoader: null,
    namedObjectIndex: null,
    undo: [],
    redo: [],
    dirty: false,
    view: 'home',
    saveAsNew: false,
    keepBackup: true,
    sel: {},
  };

  const $ = (id) => document.getElementById(id);

  // ---- labels --------------------------------------------------------------------------------

  const label = {
    sys(id, fallback) { return (id >= 0 && state.game.systemString(id)) || fallback; },
    cls(id) { const c = T.CLASSES[id]; return c ? label.sys(c[1], c[0]) : 'Class ' + id; },
    race(id) { const r = T.RACES[id]; return r ? label.sys(r[1], r[0]) : 'Race ' + id; },
    alignment(id) { const a = T.ALIGNMENTS[id]; return a ? label.sys(a[1], a[0]) : 'Alignment ' + id; },
    gender(id) { return T.GENDERS[id] || 'Gender ' + id; },
    level(id) {
      const l = T.LEVELS[id];
      if (!l) return 'Area ' + id;
      return label.sys(l[1], l[2]) + (l[3] ? ' (multiplayer)' : '');
    },
    levelFull(id) {
      const l = T.LEVELS[id];
      return id + ' - ' + label.level(id) + (l && l[0] ? ' [' + l[0] + ']' : '');
    },
    skill(i) { const s = T.SKILLS[i]; return s ? label.sys(s[1], s[0]) : 'Skill ' + i; },
    feat(i) { const f = T.FEATS[i]; return f ? label.sys(f[1], f[0]) : 'Unused feat bit ' + i; },
    classFeature(i) { const f = T.CLASS_FEATURES[i]; return f ? label.sys(f[1], f[0]) : 'Unused bit ' + i; },
    spell(id) { const s = T.ARCANE_SPELLS[id]; return s ? label.sys(s[1], s[0]) : 'Spell ' + id; },
    spellLevel(id) { const s = T.ARCANE_SPELLS[id]; return s ? s[2] : null; },
    divine(id) { const s = T.DIVINE_SPELLS[id]; return s ? label.sys(s[1], s[0]) : 'Divine spell ' + id; },
    special(id) { const s = T.SPECIAL_ABILITIES[id]; return s ? s[0] : 'Ability ' + id; },
    effect(id) {
      const e = T.EFFECTS[id];
      if (!e) return 'Effect ' + id;
      return e[1] >= 0 ? label.sys(e[1], e[0]) : 'Effect ' + id;
    },
    item(id) {
      if (id === -1) return 'empty';
      if (id === -2) return 'gold';
      return state.game.itemName(id) || 'Item ' + id;
    },
    desc(ids, i) { return ids && ids[i] !== undefined ? state.game.systemString(ids[i]) || '' : ''; },
    creature(id) { return state.game.creatureName(id) || 'Creature ' + id; },
    worldVar(i) { const v = state.game.worldVar(i); return v ? v.name : ''; },
    slotMask(mask) {
      const names = T.EQUIP_SLOTS.filter(([bit]) => mask & bit).map(([, n]) => n);
      return names.length ? names.join(', ') : '0x' + mask.toString(16);
    },
    model(id) { return T.MODEL_PATHS[id] ? T.modelLabel(id) : 'Model ' + id; },
    modelFull(id) { return id + ' - ' + label.model(id) + (T.MODEL_PATHS[id] ? ' (' + T.modelTag(id) + ')' : ''); },
    // A look number explained for the given model.
    look(model, v) {
      if (v === 0) return 'textures as modelled';
      if (T.isBodyModel(model)) {
        if (v === 98) return 'gloves';
        if (v === 99) return 'boots';
        if (v >= 10 && v < 98) return 'look ' + Math.floor(v / 10) + ' in ' + (['leather', 'chain', 'plate'][v % 10] || 'armour ' + (v % 10)) + ' armour';
        return 'look ' + v + ', no body armour';
      }
      const users = (state.game.creatures || []).filter((c) => c.model === model && c.look === v).map((c) => c.name).filter(Boolean);
      return users.length ? Array.from(new Set(users)).slice(0, 4).join(', ') : 'look ' + v;
    },
    equipSet(id) {
      const set = state.game.equipSet(id);
      if (!set) return id === -1 || id === 0xFFFF ? 'none' : state.game.equipSets ? 'no such set' : '';
      if (!set.length) return 'empty set';
      return set.map(([item, min, max]) => {
        const qty = max > min ? min + '-' + (max - 1) : String(min);
        return item === -2 ? qty + ' gold' : (qty !== '1' ? qty + ' x ' : '') + label.item(item);
      }).join(', ');
    },
    dice(count, sides, bonus) { return count + 'd' + sides + (bonus ? (bonus > 0 ? '+' : '') + bonus : ''); },
  };

  const signed = (n) => (n >= 0 ? '+' + n : String(n));
  const abilityMod = (score) => Math.floor((score - 10) / 2);

  // Look choices for a model, from the texture packs; null when unknown (the field stays a number).
  function lookEnum(model) {
    const info = state.game.modelLooks(model);
    if (!info) return null;
    const values = Object.keys(info.looks).map(Number);
    if (!values.includes(0)) values.push(0);
    values.sort((a, b) => a - b);
    return {
      options: values.map((v) => {
        const parts = info.looks[v];
        const partial = parts !== undefined && parts < info.parts ? ' (' + parts + ' of ' + info.parts + ' parts)' : '';
        return [v, v + ' - ' + label.look(model, v) + partial];
      }),
    };
  }

  function enums() {
    const none = (v, text) => [[v, v + ' - ' + (text || 'none')]];
    return {
      race: { options: T.RACES.map((_, i) => [i, label.race(i), label.desc(T.RACE_DESC, i)]) },
      alignment: { options: T.ALIGNMENTS.map((_, i) => [i, label.alignment(i), label.desc(T.ALIGNMENT_DESC, i)]) },
      gender: { options: T.GENDERS.map((_, i) => [i, label.gender(i)]) },
      level: { options: [[-1, '-1 - none']].concat(T.LEVELS.map((_, i) => [i, label.levelFull(i)])) },
      objectState: { options: [[0, '0']].concat(Object.entries(T.OBJECT_STATES).map(([k, v]) => [Number(k), v])) },
      objectSubtype: { options: T.OBJECT_SUBTYPES.map((n, i) => [i, i + ' - ' + n, T.OBJECT_SUBTYPE_HELP[i]]) },
      item: { list: 'dl-items', hint: (v) => label.item(v), pick: () => pickItem() },
      keyItem: { list: 'dl-items', hint: (v) => (v > 0 && state.game.item(v) ? 'as a key: ' + label.item(v) : '') },
      setItem: { list: 'dl-items', hint: (v) => label.item(v), pick: () => pickItem() },
      monster: { list: 'dl-creatures', hint: (v) => label.creature(v), pick: () => pickCreature() },
      effect: { list: 'dl-effects', hint: (v) => label.effect(v) },
      model: { options: T.MODEL_PATHS.map((_, i) => [i, label.modelFull(i)]) },
      look: (block, c) => (c && c.lookModel ? lookEnum(c.lookModel()) : null),
      overlay98: { options: [[-1, '-1 - no gloves drawn'], [98, '98 - gloves drawn']] },
      overlay99: { options: [[-1, '-1 - no boots drawn'], [99, '99 - boots drawn']] },
      creatureSize: { options: T.CREATURE_SIZES.map((n, i) => [i, i + ' - ' + n + ' (attack ' + signed(T.SIZE_ATTACK_MOD[i]) + ')']) },
      classOrNone: { options: none(-1).concat(T.CLASSES.map((_, i) => [i, i + ' - ' + label.cls(i), label.desc(T.CLASS_DESC, i)])) },
      specialAbility: { options: none(255).concat(T.SPECIAL_ABILITIES.map(([n, tip], i) => [i, i + ' - ' + n, tip])) },
      arcaneSpell: { options: none(-1).concat(T.ARCANE_SPELLS.map((s, i) => [i, i + ' - ' + label.spell(i) + ' (level ' + s[2] + ')', label.desc(T.ARCANE_SPELL_DESC, i)])) },
      divineSpell: { options: none(-1).concat(T.DIVINE_SPELLS.map((_, i) => [i, i + ' - ' + label.divine(i), label.desc(T.DIVINE_SPELL_DESC, i)])) },
      soundVariant: { options: [[254, '254 - no sound'], [255, '255 - plain file']].concat([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => [v, v + ' - file ' + v])) },
      attackKind: { options: T.ATTACK_KINDS },
      equipSet: { list: 'dl-equipsets', hint: (v) => label.equipSet(v), pick: () => pickEquipSet() },
      itemType: { options: T.ITEM_TYPES },
      itemIcon: { options: T.ITEM_ICONS.map((n, i) => [i, i + ' - ' + n, T.ICON_RULES[i] || '']), pick: () => pickIcon() },
      itemModel: { options: none(-1, 'nothing drawn').concat(T.ITEM_MODELS.map(([file, n], i) => [i, i + ' - ' + n + ' (' + file + ')'])) },
      itemSize: { options: T.CREATURE_SIZES.map((n, i) => [i, i + ' - ' + n]) },
      yesNo: { options: [[0, '0 - no'], [1, '1 - yes']] },
      bodyLook: { options: T.BODY_LOOKS },
      missileVisual: { options: [[0, '0 - none'], [2, '2 - arrow']] },
      itemEffect: { list: 'dl-item-effects' },
      abilityOrNone: { options: T.ABILITY_NAMES.map((n, i) => [i, i + ' - ' + n]).concat([[255, '255 - none']]) },
      spellSource: { options: T.SPELL_SOURCES },
      bonusType: { options: T.BONUS_TYPES },
      effectSpell: (block) => {
        const source = block.u8(0x1D);
        if (source === 0) return enums().arcaneSpell;
        if (source === 1) return enums().divineSpell;
        if (source === 2) return { options: none(-1).concat(T.SPECIAL_ABILITIES.map(([n], i) => [i, i + ' - ' + n])) };
        return { options: none(-1) };
      },
      conversation: { hint: (name) => conversationTitle(name) },
    };
  }

  function conversationTitle(name) {
    if (!name) return '';
    const c = state.game.conversation(name);
    if (!c) return '';
    const who = (c.speakers || []).filter(Boolean).slice(0, 3).join(', ');
    return (who ? who + ': ' : '') + (c.first ? '"' + c.first.slice(0, 60) + (c.first.length > 60 ? '...' : '') + '"' : '');
  }

  function ctx(extra) {
    return Object.assign({ commit: (fn) => commit(fn), enums: enums() }, extra || {});
  }

  function rebuildDatalists() {
    const host = $('datalists');
    clear(host);
    const list = (id, rows) => h('datalist', { id }, rows.map(([v, text]) => h('option', { value: String(v) }, text)));
    const items = state.game.items ? state.game.items.map((it) => [it.id, it.id + ' - ' + label.item(it.id)]) : [];
    const creatures = state.game.creatures ? state.game.creatures.map((c) => [c.id, c.id + ' - ' + label.creature(c.id)]) : [];
    host.appendChild(list('dl-items', items));
    host.appendChild(list('dl-creatures', creatures));
    host.appendChild(list('dl-effects', T.EFFECTS.map((_, i) => [i, i + ' - ' + label.effect(i)])));
    const fxFile = state.itemFile;
    host.appendChild(list('dl-item-effects', fxFile ? fxFile.model.effects.map((fx, i) => [i, i + ' - ' + (lineText(fxFile.names, fx.i32(0)) || effectText(fx)).slice(0, 80)]) : []));
    host.appendChild(list('dl-equipsets', state.game.equipSets ? Array.from(state.game.equipSets.keys()).map((k) => [k, k + ' - ' + label.equipSet(k).slice(0, 80)]) : []));
    const idx = state.game.index;
    host.appendChild(list('dl-named-2', idx ? idx.encounters.map((e) => [e.name, 'encounter from ' + e.script]) : []));
    host.appendChild(list('dl-named-3', idx ? idx.doors.map((d) => [d.name, 'object from ' + d.script]) : []));
    state.namedObjectIndex = null;
  }

  // ---- edits and undo ------------------------------------------------------------------------

  function snapshot() {
    return {
      sav: state.save ? S.serialize(state.save) : null,
      sta: state.sta ? state.sta.bytes.slice() : null,
      mon: state.creatureFile ? G.serializeCreatureFile(state.creatureFile.model) : null,
      tee: state.itemFile ? G.serializeItemFile(state.itemFile.model) : null,
      teeNames: state.itemFile && state.itemFile.names ? copyLines(state.itemFile.names) : null,
    };
  }

  function restore(snap) {
    state.save = snap.sav ? S.parse(snap.sav) : null;
    state.sta = snap.sta ? new ST.ObjectStateFile(snap.sta.slice()) : null;
    if (state.creatureFile && snap.mon) state.creatureFile.model = G.parseCreatureFile(snap.mon);
    if (state.itemFile && snap.tee) state.itemFile.model = G.parseItemFile(snap.tee);
    if (state.itemFile && snap.teeNames) state.itemFile.names = snap.teeNames;
  }

  // Applies an edit. A failed edit is rolled back so a half-applied change never stays in memory.
  function commit(fn, opts) {
    const snap = snapshot();
    try {
      fn();
    } catch (error) {
      restore(snap);
      toast(error.message, 'error');
      if (opts && opts.rerender) render();
      return false;
    }
    state.undo.push(snap);
    if (state.undo.length > UNDO_DEPTH) state.undo.shift();
    state.redo = [];
    markDirty();
    if (opts && opts.rerender) render();
    else updateChrome();
    return true;
  }

  function undo() {
    if (!state.undo.length) return;
    state.redo.push(snapshot());
    restore(state.undo.pop());
    markDirty();
    render();
  }

  function redo() {
    if (!state.redo.length) return;
    state.undo.push(snapshot());
    restore(state.redo.pop());
    markDirty();
    render();
  }

  // ---- files ---------------------------------------------------------------------------------

  async function readFile(file) { return new Uint8Array(await file.arrayBuffer()); }

  async function loadSave(name, bytes, staBytes, dir) {
    if (state.dirty && !(await confirm('Discard unsaved changes?', 'The open save has edits that have not been written.', 'Discard'))) return;
    let save;
    try {
      save = S.parse(bytes);
    } catch (error) {
      await dialog('This save could not be read', name + ': ' + error.message, [['Close', true, 'primary']]);
      return;
    }
    let sta = null;
    let staNote = null;
    if (staBytes) {
      try { sta = new ST.ObjectStateFile(staBytes.slice()); } catch (error) { staNote = error.message; }
    }
    Object.assign(state, {
      save, sta, fileName: name, original: bytes, originalSta: staBytes, baseline: S.checkInvariants(save),
      dir, undo: [], redo: [], dirty: false, view: 'overview', saveAsNew: false, sel: {},
    });
    render();
    if (save.recovered) toast('The map section could not be read directly and is kept unchanged: ' + save.recoveryReason, 'error');
    if (!staBytes) toast('No .sav.sta file was opened with this save; object states cannot be edited until one is added.', 'info');
    if (staNote) toast('.sav.sta: ' + staNote, 'error');
  }

  async function openFiles(fileList) {
    const files = Array.from(fileList);
    const sav = files.find((f) => /\.sav$/i.test(f.name));
    if (!sav) {
      const sta = files.find((f) => /\.sta$/i.test(f.name));
      if (sta && state.save) {
        try {
          const file = new ST.ObjectStateFile(await readFile(sta));
          commit(() => { state.sta = file; }, { rerender: true });
          toast('Object-state file attached.');
        } catch (error) {
          toast(error.message, 'error');
        }
        return;
      }
      toast('Choose a .sav file (and its .sav.sta companion).', 'error');
      return;
    }
    const sta = files.find((f) => f.name.toLowerCase() === sav.name.toLowerCase() + '.sta') || files.find((f) => /\.sta$/i.test(f.name));
    await loadSave(sav.name, await readFile(sav), sta ? await readFile(sta) : null, null);
  }

  async function findEntry(dir, name) {
    const want = name.toLowerCase();
    for await (const [entryName, handle] of dir.entries()) if (entryName.toLowerCase() === want) return handle;
    return null;
  }

  async function openSavesFolder() {
    if (!window.showDirectoryPicker) {
      $('folder-input').click();
      return;
    }
    let dir;
    try {
      dir = await window.showDirectoryPicker({ id: 'savegames', mode: 'readwrite' });
    } catch (error) {
      return;
    }
    const files = [];
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'file') files.push({ name, getFile: () => handle.getFile() });
    }
    await listFolder(files, dir);
  }

  async function refreshFolder() {
    const dir = state.folder && state.folder.dirHandle;
    if (!dir) return;
    const files = [];
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'file') files.push({ name, getFile: () => handle.getFile() });
    }
    const view = state.view;
    await listFolder(files, dir);
    state.view = view;
    render();
  }

  async function listFolder(files, dirHandle) {
    const byName = new Map(files.map((f) => [f.name.toLowerCase(), f]));
    const saves = [];
    for (const f of files) {
      const slot = S.slotFromFileName(f.name);
      if (slot === null) continue;
      const file = await f.getFile();
      const head = S.peekHeader(new Uint8Array(await file.slice(0, HEADER_PEEK).arrayBuffer()));
      saves.push({ name: f.name, slot, size: file.size, head, hasSta: byName.has(f.name.toLowerCase() + '.sta'), entry: f });
    }
    saves.sort((a, b) => a.slot - b.slot);
    state.folder = { saves, byName, dirHandle };
    state.view = 'folder';
    render();
  }

  async function openFromFolder(entry) {
    const file = await entry.entry.getFile();
    const staEntry = state.folder.byName.get(entry.name.toLowerCase() + '.sta');
    const staBytes = staEntry ? await readFile(await staEntry.getFile()) : null;
    await loadSave(entry.name, await readFile(file), staBytes, state.folder.dirHandle ? { handle: state.folder.dirHandle } : null);
  }

  // Collects the game files the editor reads from an install folder (or its data folder).
  async function collectGameFiles(dir) {
    const out = [];
    const add = (path, handle) => out.push({ path, read: async () => readFile(await handle.getFile()) });
    const sub = async (base, name) => {
      const d = await findEntry(base, name);
      return d && d.kind === 'directory' ? d : null;
    };
    const roots = [{ dir, prefix: '' }];
    const dataDir = await sub(dir, 'data');
    if (dataDir) roots.push({ dir: dataDir, prefix: 'data/' });
    const sys = await findEntry(dir, 'sfDat.dat');
    if (sys) add('sfDat.dat', sys);
    for (const r of roots) {
      for (const name of ['TEE.trs', 'monsters.mon']) {
        const f = await findEntry(r.dir, name);
        if (f && f.kind === 'file') add(r.prefix + name, f);
      }
      const str = await sub(r.dir, 'str');
      if (str) {
        for (const name of ['tee.str', 'monsters.str']) {
          const f = await findEntry(str, name);
          if (f) add(r.prefix + 'str/' + name, f);
        }
      }
      const dlg = await sub(r.dir, 'Dialogue');
      if (dlg) {
        for await (const [name, handle] of dlg.entries()) {
          if (handle.kind === 'file' && /^(test\.(cv|ck|cj|cl)|all\.(idx|db)|.*\.por)$/i.test(name)) add(r.prefix + 'Dialogue/' + name, handle);
        }
      }
      const lmm = await sub(r.dir, 'LMM');
      if (lmm) {
        for await (const [name, handle] of lmm.entries()) {
          if (handle.kind === 'file' && /\.lmm$/i.test(name)) add(r.prefix + 'LMM/' + name, handle);
        }
      }
    }
    return out;
  }

  async function loadGameFolder() {
    if (!window.showDirectoryPicker) {
      $('game-input').click();
      return;
    }
    let dir;
    try {
      dir = await window.showDirectoryPicker({ id: 'gamefolder', mode: 'read' });
    } catch (error) {
      return;
    }
    if (await applyGameFiles(await collectGameFiles(dir), dirAssets(dir))) state.gameDir = dir;
  }

  // Reads the game's text files in the code page they look most like, unless one was chosen. inGameLoad
  // is set while a game folder is being loaded, which reads its own text afterwards.
  async function detectEncoding(files, inGameLoad) {
    if (state.encodingChosen) return;
    const texts = [];
    for (const f of files) {
      if (!f) continue;
      try { texts.push(await f.read()); } catch (error) { /* an unreadable file is reported when it is loaded */ }
    }
    const all = new Uint8Array(texts.reduce((n, t) => n + t.length + 1, 0));
    let at = 0;
    for (const t of texts) { all.set(t, at); at += t.length; all[at] = 0x0A; at += 1; }
    const label = PorBytes.Codec.guess(all);
    if (!label || label === PorBytes.Codec.label) return;
    await setEncoding(label, inGameLoad);
    const opt = $('encoding').selectedOptions[0];
    toast('Game text is read as ' + (opt ? opt.textContent : label) + '. If names look wrong, choose another code page under Text at the top right.');
  }

  // Switches the code page and reads already-loaded text again with it. Edited template names stay as
  // they are.
  async function setEncoding(label, skipGameReload) {
    PorBytes.Codec.setLabel(label);
    $('encoding').value = PorBytes.Codec.label;
    if (state.save) restore(snapshot());
    const it = state.itemFile;
    if (it && it.names && !it.names.dirty) it.names = editableLines(it.names.bytes);
    const ct = state.creatureFile;
    if (ct && ct.namesBytes) ct.names = G.parseLineTable(ct.namesBytes);
    if (state.gameFiles && !skipGameReload) await applyGameFiles(state.gameFiles, state.assets, true);
    rebuildDatalists();
    render();
  }

  // Loads game data from files ({path, read}); assets reads files below the data folder for models.
  // Returns false, keeping the previous game folder, when the files hold no game data.
  async function applyGameFiles(files, assets, quiet) {
    const shortest = (re) => files.filter((f) => re.test(f.path.replace(/\\/g, '/'))).sort((a, b) => a.path.length - b.path.length)[0];
    await detectEncoding([shortest(/(^|\/)str\/tee\.str$/i), shortest(/(^|\/)str\/monsters\.str$/i)], true);
    const game = new G.GameData();
    const progress = $('game-status');
    const notes = await game.load(files, (t) => { progress.textContent = t + '...'; });
    if (!game.loaded) {
      toast('No game data files were found there. Choose the folder that contains sfDat.dat and the data folder.', 'error');
      updateChrome();
      return false;
    }
    state.gameFiles = files;
    setAssets(assets);
    const fallback = bundledGame();
    for (const key of ['system', 'items', 'itemById', 'creatures', 'equipSets', 'icons', 'looks', 'worldVars', 'index']) {
      if (!game[key] || (game[key] instanceof Map && !game[key].size)) game[key] = fallback[key];
    }
    for (const [k, v] of fallback.areaSummaries) if (!game.areaFiles.has(k) && !game.areaSummaries.has(k)) game.areaSummaries.set(k, v);
    state.game = game;
    rebuildDatalists();
    render();
    const parts = [];
    if (game.system) parts.push('text');
    if (files.some((f) => /tee\.trs$/i.test(f.path))) parts.push(game.items.length + ' items');
    if (files.some((f) => /monsters\.mon$/i.test(f.path))) parts.push(game.creatures.length + ' creatures');
    if (files.some((f) => /all\.db$/i.test(f.path))) parts.push('conversation scripts');
    if (game.areaFiles.size) parts.push(game.areaFiles.size + ' area files');
    if (!quiet) {
      toast('Game folder loaded: ' + parts.join(', ') + '.');
      for (const n of notes) toast(n, 'error');
    }
    return true;
  }

  async function writeFile(dirHandle, name, bytes) {
    const fh = await dirHandle.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(bytes);
    await w.close();
  }

  async function fileExists(dirHandle, name) {
    try { await dirHandle.getFileHandle(name); return true; } catch (error) { return false; }
  }

  async function saveOut(forceDownload) {
    if (!state.save) return;
    const v = S.validate(state.save, state.baseline);
    if (!v.ok) {
      const readable = !v.problems.some((p) => p.startsWith('the rebuilt file'));
      const body = h('div', null, h('p', null, 'The edited save has problems the game may not handle:'),
        h('ul', null, v.problems.map((p) => h('li', null, p))));
      if (!readable) {
        await dialog('The save cannot be written', body, [['Close', false, 'primary']]);
        return;
      }
      if (!(await dialog('Write anyway?', body, [['Cancel', false], ['Write anyway', true, 'danger']]))) return;
    }
    const target = state.saveAsNew ? S.slotFileName(S.newSlotNumber()) : state.fileName;
    const staBytes = state.sta ? state.sta.bytes.slice() : null;
    let wrote = false;
    if (state.dir && state.dir.handle && !forceDownload) {
      try {
        const dir = state.dir.handle;
        if (!state.saveAsNew && state.keepBackup) {
          if (!(await fileExists(dir, target + '.bak')) && state.original) await writeFile(dir, target + '.bak', state.original);
          if (staBytes && state.originalSta && !(await fileExists(dir, target + '.sta.bak'))) await writeFile(dir, target + '.sta.bak', state.originalSta);
        }
        await writeFile(dir, target, v.bytes);
        if (staBytes) await writeFile(dir, target + '.sta', staBytes);
        wrote = true;
        toast('Saved ' + target + (staBytes ? ' and ' + target + '.sta' : '') + '.');
      } catch (error) {
        toast('Could not write to the folder (' + error.message + '); downloading instead.', 'error');
      }
    }
    if (!wrote) {
      download(target, v.bytes);
      if (staBytes) setTimeout(() => download(target + '.sta', staBytes), 400);
      toast('Downloaded ' + target + (staBytes ? ' and its .sta file' : '') + '. Copy both into the game\'s savegames folder.');
    }
    state.original = v.bytes;
    state.originalSta = staBytes;
    state.fileName = target;
    state.baseline = S.checkInvariants(state.save);
    state.dirty = false;
    state.saveAsNew = false;
    render();
    if (wrote) await refreshFolder();
  }

  // ---- chrome --------------------------------------------------------------------------------

  const NAV = [
    ['overview', 'Overview', 'Save name, area, time of day, game options and a summary of the party.'],
    ['party', 'Party', 'Edit each party member: stats, classes, skills, feats, spells, inventory and effects.'],
    ['world', 'World variables', 'The story and quest variables, described by the journal and dialogue that use them.'],
    ['named', 'Named states', 'Remembered outcomes of named encounters and states of named doors and objects.'],
    ['roster', 'NPC roster', 'Named NPCs: alive or dead, what clicking them does, merchant prices.'],
    ['creatures', 'Creatures & NPCs', 'Creatures and characters in the current area, other than the party.'],
    ['objects', 'Objects & doors', 'Doors, levers, containers, transporters and breakables in the current area.'],
    ['treasure', 'Treasure', 'Treasure piles and containers in the current area, their gold and items.'],
    ['maps', 'Maps', 'Map exploration and the notes you placed on the map.'],
    ['objectStates', 'Object states (.sta)', 'Remembered states of doors, chests and breakables in every area.'],
    ['placement', 'Party placement', 'Move the party by clicking a map, or send it to another area.'],
    ['gameMaster', 'Rest & encounters', 'Resting rules, encounters in progress and items waiting to respawn.'],
    ['areaArrays', 'Area state arrays', 'Per-area records of markers the game has already activated.'],
    ['cleared', 'Cleared flags', 'Which markers of the current area are used up.'],
    ['conversations', 'Conversations', 'How far each conversation has gone.'],
    ['multiplayer', 'Multiplayer world', 'Random-world settings of a multiplayer save.'],
    ['layout', 'File layout & hex', 'Where each section sits in the file, and a hex view of the whole save.'],
  ];

  function navCount(key) {
    const s = state.save;
    switch (key) {
      case 'party': return S.partyHandles(s).length;
      case 'named': return s.namedStates.length;
      case 'creatures': return s.entities.filter((e) => (e.tag === 3 || e.tag === 4 || e.tag === 2) && !S.isPartyHandle(s, S.entityHandle(e))).length;
      case 'objects': return s.entities.filter((e) => e.tag === 8).length;
      case 'treasure': return s.entities.filter((e) => e.tag === 7).length;
      case 'maps': return s.maps ? s.maps.length : null;
      case 'conversations': return s.conversations ? s.conversations.filter((c) => c.present).length : null;
      default: return null;
    }
  }

  function navVisible(key) {
    const s = state.save;
    if (key === 'multiplayer') return Boolean(s.mp);
    if (key === 'world' || key === 'roster' || key === 'conversations') return !s.mp;
    if (key === 'maps' || key === 'cleared') return !s.mapRegionRaw;
    return true;
  }

  function updateChrome() {
    const inFolder = Boolean(state.dir && state.dir.handle);
    $('btn-undo').disabled = !state.undo.length;
    $('btn-redo').disabled = !state.redo.length;
    $('btn-save').disabled = !state.save;
    $('btn-save').textContent = inFolder ? 'Save to folder' : 'Download save';
    $('btn-download').disabled = !state.save;
    $('btn-download').hidden = !inFolder;
    $('dirty').textContent = state.save && state.dirty ? 'Unsaved changes' : '';
    $('dirty').className = state.dirty ? 'dirty on' : 'dirty';
    const g = state.game;
    $('game-status').textContent = g.origin === 'folder' ? 'Game data: your game folder' : g.loaded ? 'Game data: built in (English, patch 1.4)' : 'Game data: none';
    $('game-status').className = g.loaded ? 'game-status ok' : 'game-status';
    $('game-status').title = g.origin === 'folder'
      ? 'Names and descriptions come from the game folder you loaded.'
      : 'Names and descriptions come from data built into the editor. Load your game folder to use your own language or game files.';
  }

  function renderNav() {
    const nav = clear($('nav'));
    const item = (key, text, cls, count, tip) => h('button', { class: 'nav-item' + (state.view === key ? ' active' : '') + (cls ? ' ' + cls : ''), title: tip || null, onclick: () => go(key) },
      text, count !== null && count !== undefined ? h('span', { class: 'badge' }, String(count)) : null);
    if (!state.save) {
      nav.appendChild(h('p', { class: 'muted pad' }, 'Open a save, or edit creature templates.'));
      nav.appendChild(item('home', 'Start'));
      if (state.folder) nav.appendChild(item('folder', 'Saves in folder'));
      nav.appendChild(item('creatures-templates', 'Creature templates', state.creatureFile && state.creatureFile.dirty ? 'unsaved' : '', null, 'Edit the statistics of every creature type (data/monsters.mon).'));
      nav.appendChild(item('items-templates', 'Item templates', state.itemFile && state.itemFile.dirty ? 'unsaved' : '', null, 'Edit or add items in the game catalog (data/TEE.trs).'));
      nav.appendChild(item('help', 'Help & disclosure', 'subtle'));
      return;
    }
    nav.appendChild(h('div', { class: 'nav-file' }, h('strong', null, S.displayName(state.save) || '(unnamed)'), h('small', null, state.fileName)));
    for (const [key, text, tip] of NAV) {
      if (!navVisible(key)) continue;
      nav.appendChild(item(key, text, '', navCount(key), tip));
    }
    nav.appendChild(h('div', { class: 'nav-sep' }));
    nav.appendChild(item('creatures-templates', 'Creature templates', 'subtle', null, 'Edit the statistics of every creature type (data/monsters.mon).'));
    nav.appendChild(item('items-templates', 'Item templates', 'subtle', null, 'Edit or add items in the game catalog (data/TEE.trs).'));
    if (state.folder) nav.appendChild(item('folder', 'Saves in folder', 'subtle'));
    nav.appendChild(item('help', 'Help & disclosure', 'subtle'));
  }

  function go(view) {
    state.view = view;
    render();
    $('main').scrollTop = 0;
  }

  function render() {
    updateChrome();
    renderNav();
    const main = clear($('main'));
    let view;
    try {
      view = renderView();
    } catch (error) {
      console.error(error);
      view = h('div', { class: 'card error' }, h('h3', null, 'This view could not be shown'), h('pre', null, error.stack || error.message));
    }
    main.appendChild(view);
  }

  function renderView() {
    if (state.view === 'creatures-templates') return viewCreatureTemplates();
    if (state.view === 'items-templates') return viewItemTemplates();
    if (state.view === 'help') return viewHelp();
    if (state.view === 'folder' && state.folder) return viewFolder();
    if (state.view === 'home' || !state.save) return viewHome();
    switch (state.view) {
      case 'overview': return viewOverview();
      case 'party': return viewParty();
      case 'world': return viewWorldVars();
      case 'named': return viewNamedStates();
      case 'roster': return viewRoster();
      case 'creatures': return viewEntities('creatures');
      case 'objects': return viewEntities('objects');
      case 'treasure': return viewEntities('treasure');
      case 'maps': return viewMaps();
      case 'objectStates': return viewObjectStates();
      case 'placement': return viewPlacement();
      case 'gameMaster': return viewGameMaster();
      case 'areaArrays': return viewAreaArrays();
      case 'cleared': return viewCleared();
      case 'conversations': return viewConversations();
      case 'multiplayer': return viewMultiplayer();
      case 'layout': return viewLayout();
      default: return viewOverview();
    }
  }

  function page(title, intro, ...children) {
    return h('div', { class: 'page' }, h('h2', null, title), intro ? h('p', { class: 'intro' }, intro) : null, children);
  }

  // A field label with an explanation shown on hover.
  function tipLabel(text, help) {
    return h('label', { class: 'field-label has-help', title: help }, text);
  }

  function button(text, onclick, cls, attrs) {
    return h('button', Object.assign({ class: 'btn ' + (cls || ''), onclick }, attrs || {}), text);
  }

  // A row of buttons inside a table cell, kept on one line with even spacing.
  function actions(...buttons) {
    return h('div', { class: 'cell-actions' }, buttons);
  }

  // ---- start / folder / help -----------------------------------------------------------------

  function viewHome() {
    return page('Pool of Radiance: Ruins of Myth Drannor editor',
      'Edit saves and creature templates from game patch 1.4. Everything happens in this browser tab; files are never uploaded.',
      section('1. Open a save',
        h('p', null, 'Each save is a pair of files in the game\'s ', h('code', null, 'savegames'), ' folder: ',
          h('code', null, 'bas_<number>.sav'), ' and ', h('code', null, 'bas_<number>.sav.sta'), '. Open both together.'),
        h('div', { class: 'row' },
          button('Open save files...', () => $('file-input').click(), 'primary'),
          button('Open a savegames folder...', openSavesFolder)),
        h('div', { class: 'dropzone', id: 'dropzone' }, 'Or drop the .sav and .sav.sta files here.')),
      section('2. Optional: load your game folder',
        h('p', null, 'Item, creature, area, conversation and world-variable names are built in (English, patch 1.4). Load your installed game '
          + 'folder (the one containing ', h('code', null, 'sfDat.dat'), ' and ', h('code', null, 'data'), ') to use your own game\'s language and '
          + 'files instead, and to edit creature templates in place.'),
        h('div', { class: 'row' }, button('Load game folder...', loadGameFolder), button('Edit creature templates...', () => go('creatures-templates')),
          button('Edit item templates...', () => go('items-templates')))),
      section('Before you edit',
        h('ul', null,
          h('li', null, 'Keep a copy of your savegames folder. When the editor writes into a folder it keeps the first original as ', h('code', null, '.bak'), '.'),
          h('li', null, 'Close the game, or at least return to the main menu, before replacing a save it might be using.'),
          h('li', null, 'Every write is rebuilt and read back before it is offered; edits that would break the file are refused.'))),
      disclosure());
  }

  function viewFolder() {
    const f = state.folder;
    if (!f) return viewHome();
    const rows = f.saves.map((s) => h('tr', { class: 'clickable', onclick: () => openFromFolder(s) },
      h('td', null, s.head ? s.head.name || '(unnamed)' : '(unreadable)'),
      h('td', null, s.head ? (s.head.version === S.SAVE_VERSION ? label.level(s.head.mapId) : 'version ' + s.head.version) : ''),
      h('td', null, S.slotDate(s.slot).toLocaleString()),
      h('td', null, s.head && s.head.mp ? 'Multiplayer' : 'Single player'),
      h('td', null, s.hasSta ? 'yes' : h('span', { class: 'warn' }, 'missing')),
      h('td', { class: 'mono' }, s.name)));
    return page('Saves in folder', f.dirHandle ? 'Changes can be written straight back into this folder.' : 'This browser can read the folder but not write to it; edited saves are downloaded.',
      panel(table(['Name', 'Area', 'Saved', 'Mode', '.sta', 'File'], rows)));
  }

  function viewHelp() {
    return page('Help & disclosure', null,
      disclosure(),
      section('Files',
        h('p', null, 'A save is two files. The .sav holds the party, world variables, maps, creatures and objects of the current area. '
          + 'The .sav.sta holds the remembered state of doors, chests and breakables in every area (one table per area).'),
        h('p', null, 'The file name number is the save time: newer saves have smaller numbers. "Save as a new slot" creates a new number so the original is kept. '
          + 'The in-game list shows the save name; if two saves share a name, the game replaces the older one the next time you save with that name.'),
        h('p', null, 'Creature templates live in the game\'s data/monsters.mon. Editing them changes the game for every save.')),
      section('Safety',
        h('ul', null,
          h('li', null, 'Unedited bytes are written back exactly as they were read.'),
          h('li', null, 'Counts and lengths (inventory size, effect count, entity count and so on) are recalculated automatically.'),
          h('li', null, 'Raw hex editors keep the length of what they edit; use the structured editors to add or remove records.'),
          h('li', null, '"Move to another area" is experimental. Keep the original save.'))),
      section('Game folder',
        h('p', null, 'Loading the game folder reads sfDat.dat, data/TEE.trs, data/monsters.mon, data/str/tee.str, data/str/monsters.str, '
          + 'the conversation files in data/Dialogue and the area files in data/LMM. Only the creature template editor writes to it, '
          + 'and only when you choose to save.')),
      section('Keyboard', h('p', null, 'Ctrl+Z undo, Ctrl+Y or Ctrl+Shift+Z redo, Ctrl+S save. Hover any field name for an explanation.')),
      section('Version',
        h('p', null, 'Myth Drannor Editor ' + (VERSION || '(version unknown)') + '. After updating the files, reload the page with '
          + 'Ctrl+F5 if it still acts like the old version, then load the game folder again.')));
  }

  // ---- overview ------------------------------------------------------------------------------

  function viewOverview() {
    const s = state.save;
    const slot = S.slotFromFileName(state.fileName);
    const nameInput = h('input', { type: 'text', class: 'in-text wide', value: S.displayName(s), maxlength: S.NAME_SIZE - 1 });
    nameInput.addEventListener('change', () => commit(() => S.setDisplayName(s, nameInput.value), { rerender: true }));
    const timeInput = h('input', { type: 'text', class: numClass('f32'), value: formatValue('f32', s.time.f32(0)) });
    timeInput.addEventListener('change', () => {
      try {
        const v = parseValue('f32', timeInput.value);
        if (v < 0 || v >= 24) throw new Error('hours must be 0 to 24');
        commit(() => s.time.setF32(0, v));
      } catch (error) { toast(error.message, 'error'); }
    });
    const options = T.OPTION_FLAGS.map(([text, help], i) => {
      const cb = h('input', { type: 'checkbox', checked: s.options.u8(i) !== 0, title: help });
      cb.addEventListener('change', () => commit(() => s.options.setU8(i, cb.checked ? 1 : 0)));
      return h('label', { class: 'check has-help', title: help }, cb, ' ', text);
    });
    const saveAsNew = h('input', { type: 'checkbox', checked: state.saveAsNew });
    saveAsNew.addEventListener('change', () => { state.saveAsNew = saveAsNew.checked; });
    const backup = h('input', { type: 'checkbox', checked: state.keepBackup });
    backup.addEventListener('change', () => { state.keepBackup = backup.checked; });

    const members = S.party(s).map((m) => {
      if (!m.entity) return h('tr', null, h('td', null, '#' + (m.index + 1)), h('td', { colspan: 6, class: 'warn' }, 'handle ' + m.handle + ' has no character record'));
      const e = m.entity;
      const classes = S.pcClasses(e).map((c) => label.cls(c.id) + ' ' + c.level).join(' / ');
      return h('tr', { class: 'clickable', onclick: () => { state.sel.member = m.index; go('party'); } },
        h('td', null, '#' + (m.index + 1)),
        h('td', null, S.entityName(e)),
        h('td', null, label.race(e.data.u8(OFF.pcRace))),
        h('td', null, classes),
        h('td', null, e.actor.dnd.i32(OFF.dndCurHp) + ' / ' + e.actor.dnd.i32(OFF.dndMaxHp)),
        h('td', null, String(e.data.i32(OFF.pcXp))),
        h('td', null, String(e.data.i32(OFF.pcGold))));
    });

    const problems = S.checkInvariants(s);
    const known = new Set(state.baseline);
    const counts = { 2: 0, 3: 0, 4: 0, 7: 0, 8: 0 };
    for (const e of s.entities) counts[e.tag] += 1;

    return page('Overview', null,
      section('Save',
        h('div', { class: 'fields' },
          tipLabel('Save name (shown in the game)', 'The name in the game\'s load and save lists. Saving later under the same name in the game replaces this save.'),
          h('div', { class: 'field-value' }, nameInput),
          tipLabel('File', 'The file name. The number is 4294967295 minus the time the save was made, so newer saves have smaller numbers.'),
          h('div', { class: 'field-value mono' }, state.fileName + (slot !== null ? '  (saved ' + S.slotDate(slot).toLocaleString() + ')' : '')),
          tipLabel('Current area', 'The area the save loads into. Use Party placement to move the party or change area safely.'),
          h('div', { class: 'field-value' }, label.levelFull(s.mapId), ' ', button('Change...', () => go('placement'), 'small')),
          tipLabel('Mode', 'Single-player and multiplayer saves are stored differently and only load in the matching mode.'),
          h('div', { class: 'field-value' }, s.mp ? 'Multiplayer' : 'Single player'),
          tipLabel('Time of day (hours)', 'In-game clock, 0 to 24 (for example 13.5 is half past one in the afternoon). It drives daylight.'),
          h('div', { class: 'field-value' }, timeInput),
          tipLabel('Saved game options', 'Game options stored in each save rather than in the game\'s settings. Hover each one for what it does.'),
          h('div', { class: 'field-value checks' }, options),
          tipLabel('Object-state file', 'The companion .sav.sta file that remembers doors, chests and breakables in every area. Saves need it.'),
          h('div', { class: 'field-value' }, state.sta ? 'loaded' : h('span', { class: 'warn' }, 'not loaded')),
          tipLabel('Contents', 'What the save holds for the area it was made in.'),
          h('div', { class: 'field-value' },
            counts[2] + ' characters, ' + (counts[3] + counts[4]) + ' creatures, ' + counts[8] + ' objects, ' + counts[7] + ' treasure containers'
            + (s.maps ? ', ' + s.maps.length + ' maps' : ''))),
        h('div', { class: 'row' },
          h('label', { class: 'check has-help', title: 'Write the edited save under a new file name, so the original file stays untouched. Both appear in the game\'s load list; give the copy a different name to tell them apart.' }, saveAsNew, ' Save as a new slot (keeps the original file)'),
          state.dir && state.dir.handle ? h('label', { class: 'check has-help', title: 'Before a file in the folder is overwritten for the first time, its original is copied to <name>.bak. Later saves keep that first copy.' }, backup, ' Keep the first original as .bak when overwriting') : null)),
      section('Party', table(['', 'Name', 'Race', 'Classes', 'HP', 'XP', 'Gold'], members),
        h('div', { class: 'row' },
          button('Rest the party (restore HP, spells and daily uses)', () => commit(() => S.party(s).forEach((m) => m.entity && S.rest(m.entity)), { rerender: true })),
          s.maps && s.maps.length ? button('Reveal every map', () => commit(() => s.maps.forEach((m) => S.setMapExplored(m, true)), { rerender: true })) : null)),
      section('Checks',
        problems.length
          ? h('ul', null, problems.map((p) => h('li', { class: known.has(p) ? 'muted' : 'warn' }, p + (known.has(p) ? ' (already in the file when it was opened)' : ''))))
          : h('p', { class: 'ok' }, 'No problems found.'),
        s.recovered ? h('p', { class: 'warn' }, 'The map section could not be read directly and is kept unchanged (' + s.recoveryReason + ').') : null));
  }

  // ---- party ---------------------------------------------------------------------------------

  const PARTY_TABS = [
    ['character', 'Character'], ['classes', 'Classes & abilities'], ['skills', 'Skills & feats'], ['spells', 'Spells'],
    ['inventory', 'Inventory'], ['effects', 'Effects'], ['appearance', 'Appearance & position'], ['raw', 'Raw records'],
  ];

  function viewParty() {
    const s = state.save;
    const members = S.party(s);
    if (!members.length) return page('Party', 'This save has no party members.');
    if (state.sel.member === undefined || state.sel.member >= members.length) state.sel.member = 0;
    const m = members[state.sel.member];
    const tab = state.sel.partyTab || 'character';
    const selected = s.actorList.u32(OFF.alCurrent);
    const tabs = h('div', { class: 'tabs' }, members.map((x) => h('button', {
      class: 'tab' + (x.index === m.index ? ' active' : ''),
      onclick: () => { state.sel.member = x.index; render(); },
    }, x.entity ? S.entityName(x.entity) : 'Missing #' + (x.index + 1), x.handle === selected ? ' *' : '')));
    if (!m.entity) return page('Party', null, tabs, h('p', { class: 'warn' }, 'This party slot has no character record.'));
    const e = m.entity;
    const subtabs = h('div', { class: 'tabs sub' }, PARTY_TABS.map(([k, text]) => h('button', {
      class: 'tab' + (k === tab ? ' active' : ''), onclick: () => { state.sel.partyTab = k; render(); },
    }, text)));
    const handles = S.partyHandles(s);
    const move = (dir) => {
      const order = handles.slice();
      const i = m.index;
      const j = i + dir;
      if (j < 0 || j >= order.length) return;
      [order[i], order[j]] = [order[j], order[i]];
      commit(() => S.setPartyOrder(s, order));
      state.sel.member = j;
      render();
    };
    const actions = h('div', { class: 'row' },
      button(m.handle === selected ? 'Selected when the save loads' : 'Select when the save loads', () => commit(() => S.setSelectedMember(s, m.handle), { rerender: true }), '', { disabled: m.handle === selected }),
      button('Move left', () => move(-1), '', { disabled: m.index === 0 }),
      button('Move right', () => move(1), '', { disabled: m.index === handles.length - 1 }),
      button('Heal', () => commit(() => S.heal(e), { rerender: true })),
      button('Rest', () => commit(() => S.rest(e), { rerender: true })));
    let body;
    switch (tab) {
      case 'classes': body = partyClasses(e); break;
      case 'skills': body = partySkills(e); break;
      case 'spells': body = partySpells(e); break;
      case 'inventory': body = inventoryEditor(e); break;
      case 'effects': body = effectsEditor(e); break;
      case 'appearance': body = partyAppearance(e); break;
      case 'raw': body = rawActor(e); break;
      default: body = partyCharacter(e);
    }
    return page('Party', null, tabs, actions, subtabs, body);
  }

  function pcFields(keys) { return T.PC_FIELDS.filter((f) => keys.includes(f.k)); }
  function dndFields(keys) { return T.DND_FIELDS.filter((f) => keys.includes(f.k)); }
  function actorFields(keys) { return T.ACTOR_FIELDS.filter((f) => keys.includes(f.k)); }

  function partyCharacter(e) {
    return h('div', null,
      section('Identity',
        fieldGrid(e.actor.base, actorFields(['name']), ctx({ onChange: () => renderNav() })),
        fieldGrid(e.actor.dnd, dndFields(['roster']), ctx()),
        fieldGrid(e.data, pcFields(['race', 'gender', 'alignment', 'homeLevel', 'premade']), ctx()),
        h('p', { class: 'muted' }, 'Handle ' + S.entityHandle(e) + ', unique id ' + e.data.i32(0x14C) + '.')),
      section('Progress', fieldGrid(e.data, pcFields(['xp', 'gold', 'bankedSkill']), ctx())),
      section('Hit points',
        fieldGrid(e.actor.dnd, dndFields(['maxHp', 'curHp', 'tempHp', 'damage', 'conDamageHp', 'conDrainHp']), ctx()),
        h('p', { class: 'muted' }, 'Maximum and current values include temporary hit points. The game does not recalculate maximum HP from class and level.')));
  }

  function partyClasses(e) {
    const classes = S.pcClasses(e);
    const apply = (list) => commit(() => S.setPcClasses(e, list), { rerender: true });
    const rows = classes.map((c, i) => {
      const sel = h('select', { class: 'in-select', title: label.desc(T.CLASS_DESC, c.id) || null }, T.CLASSES.map((_, id) => h('option', { value: String(id), title: label.desc(T.CLASS_DESC, id) || null }, label.cls(id))));
      if (c.id >= T.CLASSES.length) sel.appendChild(h('option', { value: String(c.id) }, '(invalid ' + c.id + ')'));
      sel.value = String(c.id);
      sel.addEventListener('change', () => apply(classes.map((x, k) => (k === i ? { id: Number(sel.value), level: x.level || 1 } : x))));
      const lvl = h('input', { type: 'text', class: numClass('u8'), value: String(c.level) });
      lvl.addEventListener('change', () => {
        try {
          const v = parseValue('u8', lvl.value);
          apply(classes.map((x, k) => (k === i ? { id: x.id, level: v } : x)));
        } catch (error) { toast(error.message, 'error'); }
      });
      return h('tr', null, h('td', null, String(i + 1)), h('td', null, sel), h('td', null, lvl),
        h('td', null, button('Remove', () => apply(classes.filter((_, k) => k !== i)), 'small', { disabled: classes.length <= 1 })));
    });
    const unused = T.CLASSES.map((_, id) => id).filter((id) => !classes.some((c) => c.id === id));
    const addSel = h('select', { class: 'in-select' }, unused.map((id) => h('option', { value: String(id) }, label.cls(id))));
    const abil = e.data;
    return h('div', null,
      section('Classes',
        table(['Order', 'Class', 'Level', ''], rows),
        h('div', { class: 'row' }, addSel, button('Add class', () => apply(classes.concat([{ id: Number(addSel.value), level: 1 }])), '', { disabled: !unused.length || classes.length >= S.CLASS_SLOTS }),
          h('span', { class: 'muted' }, 'Total level ' + S.totalLevel(e) + '. Levels are stored per class; the list keeps the order classes were taken.'))),
      section('Ability scores',
        h('div', { class: 'ability-grid' },
          h('span'), h('strong', null, 'Base'), h('strong', null, 'Drain'), h('strong', null, 'Damage'),
          T.ABILITIES.map((_, i) => [
            h('span', { title: T.ABILITY_NAMES[i] }, label.sys(-1, T.ABILITY_NAMES[i])),
            numberCell(abil, OFF.pcAbilities + i, 'u8'),
            numberCell(e.actor.dnd, 0x29 + i, 'i8'),
            numberCell(e.actor.dnd, 0x2F + i, 'i8'),
          ]))),
      section('Uses since last rest',
        fieldGrid(e.data, pcFields(['dailyUses']), ctx()),
        fieldGrid(e.actor.dnd, dndFields(['arcaneUsed', 'divineUsed']), ctx()),
        button('Clear all', () => commit(() => S.rest(e), { rerender: true }))));
  }

  function numberCell(block, off, type) {
    const input = h('input', { type: 'text', class: numClass(type), value: formatValue(type, block.get(type, off)) });
    input.addEventListener('change', () => {
      try {
        const v = parseValue(type, input.value);
        commit(() => block.set(type, off, v));
      } catch (error) {
        toast(error.message, 'error');
        input.value = formatValue(type, block.get(type, off));
      }
    });
    return input;
  }

  function bitChecklist(block, off, count, labelFn, known, descFn) {
    const box = (bit) => {
      const cb = h('input', { type: 'checkbox', checked: ((block.u32(off) >>> bit) & 1) === 1 });
      cb.addEventListener('change', () => commit(() => {
        const v = block.u32(off);
        block.setU32(off, cb.checked ? (v | (1 << bit)) >>> 0 : (v & ~(1 << bit)) >>> 0);
      }));
      const tip = descFn ? descFn(bit) : '';
      return h('label', { class: 'check' + (tip ? ' has-help' : ''), title: tip || null }, cb, ' ', labelFn(bit));
    };
    const named = [];
    const spare = [];
    for (let bit = 0; bit < count; bit += 1) (bit < known ? named : spare).push(box(bit));
    return h('div', null, h('div', { class: 'checks-grid' }, named),
      spare.length ? h('details', { class: 'spare' }, h('summary', null, 'Unused bits (' + spare.length + ') - stored but ignored by the game'),
        h('div', { class: 'checks-grid' }, spare)) : null);
  }

  function partySkills(e) {
    const skills = h('div', { class: 'skill-grid' }, T.SKILLS.map((_, i) => h('label', { class: 'skill-cell has-help', title: label.desc(T.SKILL_DESC, i) || null },
      h('span', null, label.skill(i)), numberCell(e.data, OFF.pcSkills + i, 'u8'))));
    return h('div', null,
      section('Skill ranks', skills),
      section('Feats', bitChecklist(e.data, OFF.pcFeats, 32, label.feat, T.FEATS.length, (b) => label.desc(T.FEAT_DESC, b))),
      section('Class features shown on the character sheet', bitChecklist(e.data, OFF.pcClassFeatures, 32, label.classFeature, T.CLASS_FEATURES.length, (b) => label.desc(T.CLASS_FEATURE_DESC, b)),
        h('p', { class: 'muted' }, 'These flags drive the character sheet list. Class abilities in play follow class levels.')));
  }

  function partySpells(e) {
    const known = S.knownSpells(e);
    const setList = (list) => commit(() => S.setKnownSpells(e, list), { rerender: true });
    const rows = known.map((id, i) => h('tr', { title: label.desc(T.ARCANE_SPELL_DESC, id) || null },
      h('td', null, String(id)), h('td', null, label.spell(id)), h('td', null, String(label.spellLevel(id) ?? '')),
      h('td', null, actions(button('Remove', () => setList(known.filter((_, k) => k !== i)), 'small danger')))));
    const add = h('select', { class: 'in-select' });
    for (let lvl = 0; lvl <= 9; lvl += 1) {
      const ids = [];
      for (let id = 0; id < T.ARCANE_LEARNABLE; id += 1) if (T.ARCANE_SPELLS[id][2] === lvl && !known.includes(id)) ids.push(id);
      if (!ids.length) continue;
      add.appendChild(h('optgroup', { label: 'Level ' + lvl }, ids.map((id) => h('option', { value: String(id), title: label.desc(T.ARCANE_SPELL_DESC, id) || null }, label.spell(id)))));
    }
    const learnAll = () => {
      const list = known.slice();
      for (let id = 0; id < T.ARCANE_LEARNABLE && list.length < S.KNOWN_SPELL_CAPACITY; id += 1) if (!list.includes(id)) list.push(id);
      setList(list);
    };
    return h('div', null,
      section('Known arcane spells (' + known.length + ' of ' + S.KNOWN_SPELL_CAPACITY + ')',
        h('p', { class: 'muted' }, 'The spells a Sorcerer has learned. Divine casters draw on their class list and keep no list here. '
          + 'The game cannot store more than 43; there are 60 learnable spells.'),
        known.length ? table(['Id', 'Spell', 'Level', ''], rows) : h('p', { class: 'muted' }, 'No spells learned.'),
        h('div', { class: 'row' }, add,
          button('Learn spell', () => add.value !== '' && setList(known.concat([Number(add.value)])), 'primary', { disabled: known.length >= S.KNOWN_SPELL_CAPACITY || !add.options.length }),
          button('Fill to 43 in table order', learnAll, '', { disabled: known.length >= S.KNOWN_SPELL_CAPACITY }))),
      section('Spell slots used since last rest', fieldGrid(e.actor.dnd, dndFields(['arcaneUsed', 'divineUsed']), ctx())));
  }

  function itemSizeOf(id) {
    const it = state.game.item(id);
    return it ? { w: it.w || 1, h: it.h || 1 } : null;
  }

  function inventoryEditor(e) {
    const s = state.save;
    const items = S.itemList(e);
    const isTreasure = e.tag === 7;
    const rows = items.map((it, i) => {
      const id = it.equip.u16(OFF.equipTemplate);
      const cat = state.game.item(id);
      const worn = !isTreasure && it.node.u8(OFF.nodeEquipped);
      const where = isTreasure ? 'container'
        : worn ? 'worn: ' + label.slotMask(it.node.u16(OFF.nodeSlotMask))
          : 'pack ' + it.node.u8(OFF.nodePage) + ' / ' + it.node.u8(OFF.nodeRow) + ', ' + it.node.u8(OFF.nodeCol);
      const idCell = fieldGrid(it.equip, T.EQUIP_FIELDS.filter((f) => f.k === 'template'), ctx({ onChange: () => render(), inline: true }));
      const charges = numberCell(it.equip, OFF.equipCharges, 'u16');
      const ident = h('input', { type: 'checkbox', checked: it.equip.u8(OFF.equipIdentified) !== 0, title: 'Identified items show their full name and properties' });
      ident.addEventListener('change', () => commit(() => it.equip.setU8(OFF.equipIdentified, ident.checked ? 1 : 0)));
      const open = state.sel.itemOpen === i;
      return [
        h('tr', { title: cat ? 'Value ' + cat.value + ', weight ' + cat.weight + ', size ' + cat.w + 'x' + cat.h
          + (itemDamageText(cat) ? ', damage ' + itemDamageText(cat) : '')
          + (cat.baseName && cat.baseName !== cat.name ? '\nUnidentified name: ' + cat.baseName : '') : null },
          h('td', { class: 'icon-cell' }, cat ? iconImg(cat.category, 'item-icon tiny') : null),
          h('td', null, String(i)),
          h('td', { class: 'item-cell' }, idCell),
          h('td', null, charges),
          h('td', null, ident),
          h('td', { title: isTreasure ? null : 'Backpack page / row, column' }, where),
          h('td', null, actions(
            button(open ? 'Close' : 'Details', () => { state.sel.itemOpen = open ? null : i; render(); }, 'small'),
            worn ? button('Unequip', () => commit(() => S.unequipItem(e, i, state.game.items ? itemSizeOf : null), { rerender: true }), 'small') : null,
            button('Remove', () => { state.sel.itemOpen = null; commit(() => S.removeItem(e, i), { rerender: true }); }, 'small danger')))),
        open ? h('tr', { class: 'detail-row' }, h('td', { colspan: 7 },
          isTreasure ? null : fieldGrid(it.node, T.INV_NODE_FIELDS, ctx({ onChange: () => render() })),
          fieldGrid(it.equip, T.EQUIP_FIELDS.filter((f) => f.k !== 'template'), ctx()))) : null,
      ];
    });

    const pick = h('input', { type: 'text', class: 'in-num wide', list: 'dl-items', placeholder: 'item name or number' });
    const info = h('p', { class: 'hint' });
    const dest = h('select', { class: 'in-select' });
    const charges = h('input', { type: 'text', class: numClass('u16'), value: '0' });
    const ident = h('input', { type: 'checkbox', checked: true });
    const freeSlots = () => {
      if (isTreasure) return [];
      const used = e.actor.items.filter((x) => x.node.u8(OFF.nodeEquipped)).reduce((m, x) => m | x.node.u16(OFF.nodeSlotMask), 0);
      return T.EQUIP_SLOTS.filter(([bit]) => !(used & bit));
    };
    const refresh = () => {
      const id = parseInt(pick.value, 10);
      const cat = Number.isFinite(id) ? state.game.item(id) : null;
      info.textContent = !Number.isFinite(id) ? ''
        : label.item(id) + (cat ? ' - value ' + cat.value + ', weight ' + cat.weight + ', size ' + cat.w + 'x' + cat.h + (itemDamageText(cat) ? ', damage ' + itemDamageText(cat) : '') + (cat.slotMask ? ', worn on: ' + label.slotMask(cat.slotMask) : ', not wearable') : '');
      if (cat) charges.value = String(cat.initialCharges);
      clear(dest);
      dest.appendChild(h('option', { value: '0' }, isTreasure ? 'Into the container' : 'Into the backpack'));
      for (const [bit, name] of freeSlots()) {
        if (cat && !(cat.slotMask & bit)) continue;
        dest.appendChild(h('option', { value: String(bit) }, 'Wear: ' + name));
      }
    };
    pick.addEventListener('input', refresh);
    refresh();
    const browse = async () => {
      const id = await pickItem('Choose an item to add');
      if (id === null) return;
      pick.value = String(id);
      refresh();
    };
    const addItem = () => {
      const id = parseInt(pick.value, 10);
      if (!Number.isFinite(id) || id < 0 || id > 0xFFFF) { toast('Choose an item first.', 'error'); return; }
      if (state.game.items && !state.game.item(id)) { toast('Item ' + id + ' is not in the item catalog.', 'error'); return; }
      let ch;
      try { ch = parseValue('u16', charges.value); } catch (error) { toast(error.message, 'error'); return; }
      const slotMask = Number(dest.value);
      commit(() => S.addItem(s, e, id, {
        slotMask, charges: ch, identified: ident.checked, size: itemSizeOf(id), sizeOf: state.game.items ? itemSizeOf : null,
      }), { rerender: true });
    };
    return h('div', null,
      section('Items (' + items.length + ')', items.length ? table(['', '#', 'Item', 'Charges', 'Identified', 'Where', ''], rows) : h('p', { class: 'muted' }, 'No items.')),
      section('Add an item',
        h('div', { class: 'row' }, button('Browse items...', browse, 'primary'), pick),
        info,
        h('div', { class: 'row' }, h('label', null, 'Put it', dest), h('label', null, 'Charges', charges), h('label', { class: 'check has-help', title: 'Identified items show their full magical name and properties. Unidentified ones show their plain name until identified in the game.' }, ident, ' Identified'),
          button('Add item', addItem, 'primary'))));
  }

  function effectsEditor(e) {
    const effects = e.actor.effects;
    const open = state.sel.effectOpen;
    const rows = effects.map((fx, i) => h('tr', null,
      h('td', null, String(i)),
      h('td', null, fx.i16(2) + ' - ' + label.effect(fx.i16(2))),
      h('td', null, fx.i32(0x0C) === 0 ? 'permanent' : String(fx.i32(0x0C))),
      h('td', null, String(fx.i8(0x15))),
      h('td', null, fx.u8(0x16) ? 'yes' : ''),
      h('td', null, String(fx.i32(0x20))),
      h('td', null, actions(
        button(open === i ? 'Close' : 'Edit', () => { state.sel.effectOpen = open === i ? null : i; render(); }, 'small'),
        button('Remove', () => { state.sel.effectOpen = null; commit(() => S.removeEffect(e, i), { rerender: true }); }, 'small danger')))));
    return h('div', null,
      section('Active effects (' + effects.length + ' of ' + S.MAX_EFFECTS + ')',
        effects.length ? table(['#', 'Effect', 'Duration', 'Magnitude', 'Suppressed', 'Caster', ''], rows) : h('p', { class: 'muted' }, 'No active effects.'),
        effects.length ? button('Remove all effects', () => commit(() => { e.actor.effects = []; }, { rerender: true }), 'danger') : null),
      open !== null && open !== undefined && effects[open] ? section('Effect ' + open,
        fieldGrid(effects[open], T.EFFECT_FIELDS, ctx()),
        hexEditor(effects[open].bytes, { commit: (fn) => commit(fn, { rerender: true }) })) : null);
  }

  function partyAppearance(e) {
    return h('div', null,
      section('Model', actorModelPanel(e),
        h('p', { class: 'muted' }, 'The game recalculates the look from the worn body armour when equipment changes: armour look (0 leather, 1 chain, 2 plate) '
          + '+ 10 x base look, with gloves (98) and boots (99) drawn over it.')),
      section('Base look and appearance bytes', fieldGrid(e.data, pcFields(['bodyVariant', 'appearanceA', 'appearanceB', 'appearanceC']), ctx())),
      section('Position and movement', fieldGrid(e.actor.base, T.ACTOR_FIELDS.filter((f) => !['name', 'model', 'texBase', 'tex98', 'tex99'].includes(f.k)), ctx())));
  }

  function rawActor(e) {
    const rr = (fn) => commit(fn, { rerender: true });
    const parts = [
      section('Actor record (' + e.actor.base.length + ' bytes)', hexEditor(e.actor.base.bytes, { commit: rr })),
      section('Inventory pages', h('p', null, 'Next page id ' + e.actor.paging.nextPageId + '; pages ' + (e.actor.paging.pageIds.join(', ') || 'none') + '.')),
      section('Character state (' + e.actor.dnd.length + ' bytes)', fieldGrid(e.actor.dnd, T.DND_FIELDS, ctx()), hexEditor(e.actor.dnd.bytes, { commit: rr })),
    ];
    if (e.tag === 2) {
      parts.push(section('Character record (' + e.data.length + ' bytes)',
        fieldGrid(e.data, T.PC_FIELDS.filter((f) => !['skills', 'abilities'].includes(f.k)), ctx()),
        hexEditor(e.data.bytes, { commit: rr })));
    } else {
      parts.push(section('Entity record (' + e.data.length + ' bytes)', hexEditor(e.data.bytes, { commit: rr })));
    }
    return h('div', null, parts);
  }

  // ---- other entities ------------------------------------------------------------------------

  function entityKindFilter(kind) {
    const s = state.save;
    if (kind === 'creatures') return (e) => (e.tag === 3 || e.tag === 4 || e.tag === 2) && !S.isPartyHandle(s, S.entityHandle(e));
    if (kind === 'objects') return (e) => e.tag === 8;
    return (e) => e.tag === 7;
  }

  function entitySummary(e) {
    if (e.tag === 7) {
      const gold = e.head.i32(OFF.treasureGold);
      const marker = e.head.i32(0);
      return {
        name: marker === -1 ? 'Treasure pile' : 'Treasure container',
        info: (gold > 0 ? gold + ' gold, ' : '') + e.items.length + ' item' + (e.items.length === 1 ? '' : 's'),
        pos: [e.head.f32(0x28), e.head.f32(0x2C), e.head.f32(0x30)],
      };
    }
    const base = e.actor.base;
    const pos = [base.f32(0x5C), base.f32(0x60), base.f32(0x64)];
    const hp = e.actor.dnd.i32(OFF.dndCurHp) + '/' + e.actor.dnd.i32(OFF.dndMaxHp) + ' HP';
    if (e.tag === 8) {
      const st = e.data.u8(0x48);
      const marker = e.data.str(0x40, 8);
      return { name: marker || S.entityName(e), info: (T.OBJECT_SUBTYPES[e.subtype] || 'kind ' + e.subtype) + ', ' + (T.OBJECT_STATES[st] || 'state ' + st).replace(/^\d+ - /, ''), pos };
    }
    if (e.tag === 2) return { name: S.entityName(e), info: 'Player character (not in party), ' + hp, pos };
    const template = label.creature(e.data.u16(0));
    return { name: S.entityName(e), info: (template !== S.entityName(e) ? template + ', ' : '') + 'team ' + e.data.u8(3) + ', ' + hp, pos };
  }

  function viewEntities(kind) {
    const s = state.save;
    const titles = {
      creatures: ['Creatures & NPCs', 'Creatures and characters present in the current area, other than the party.'],
      objects: ['Objects & doors', 'Interactive objects of the current area: doors, levers, containers, transporters and breakables.'],
      treasure: ['Treasure', 'Treasure piles and containers in the current area.'],
    }[kind];
    const keep = entityKindFilter(kind);
    const filterKey = 'filter_' + kind;
    const filter = (state.sel[filterKey] || '').toLowerCase();
    const list = [];
    s.entities.forEach((e, index) => { if (keep(e)) list.push({ e, index, sum: entitySummary(e) }); });
    const shown = list.filter((x) => !filter || (x.sum.name + ' ' + x.sum.info).toLowerCase().includes(filter));
    const search = h('input', { type: 'search', class: 'in-text', placeholder: 'Filter', value: state.sel[filterKey] || '' });
    search.addEventListener('input', () => { state.sel[filterKey] = search.value; render(); setTimeout(() => { const el = document.querySelector('input[type=search]'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0); });
    const selKey = 'entity_' + kind;
    const listHost = h('div', { class: 'split-list' });
    const renderList = () => {
      const rows = shown.map((x) => {
        const sum = entitySummary(x.e);
        return h('tr', { class: 'clickable' + (state.sel[selKey] === x.index ? ' selected' : ''), onclick: () => { state.sel[selKey] = x.index; render(); } },
          h('td', null, String(x.index)), h('td', null, sum.name), h('td', null, sum.info));
      });
      clear(listHost).appendChild(table(['#', 'Name', 'Details'], rows, { compact: true }));
    };
    renderList();
    const selIndex = state.sel[selKey];
    const selected = selIndex !== undefined && s.entities[selIndex] && keep(s.entities[selIndex]) ? s.entities[selIndex] : null;
    return page(titles[0], titles[1],
      h('div', { class: 'row' }, search, h('span', { class: 'muted' }, shown.length + ' of ' + list.length)),
      kind === 'creatures' && list.length ? h('div', { class: 'row' },
        button('Heal all', () => commit(() => list.forEach((x) => S.heal(x.e)), { rerender: true })),
        button('Remove all from this save', async () => {
          if (await confirm('Remove every creature?', 'All creatures and NPCs in the current area (not the party) are removed from this save. The area\'s encounters may bring new ones.', 'Remove')) {
            commit(() => { s.entities = s.entities.filter((e) => !keep(e)); }, { rerender: true });
          }
        }, 'danger')) : null,
      h('div', { class: 'split' },
        listHost,
        h('div', { class: 'split-detail' }, selected ? entityDetail(selected, selIndex, renderList) : h('p', { class: 'muted' }, 'Select an entry to edit it.'))));
  }

  // Explains what a save stores per creature and links to the shared template.
  function templateNote(id) {
    const c = state.game.creature(id);
    const open = async () => {
      if (!state.creatureFile) {
        if (state.gameDir || state.assets) await openCreatureFromGameDir();
        else { toast('Open data/monsters.mon on the Creature templates page first.', 'error'); go('creatures-templates'); return; }
      }
      if (state.creatureFile && id < state.creatureFile.model.records.length) { state.sel.ctSel = id; go('creatures-templates'); }
    };
    const name = c && c.name ? c.name : '#' + id;
    const rec = state.creatureFile && state.creatureFile.model.records[id];
    return h('div', { class: 'note' },
      h('p', null, h('strong', null, 'This creature and its template. '), 'The save stores only what is particular to this one creature: its name, '
        + 'position, hit points, damage taken, ability damage and drain, spells used, effects, inventory, AI mode, team and visibility. '
        + 'Everything else (armour class, attacks, saves, abilities, immunities, spells, size, speed) is read from its template "' + name + '"'
        + (c ? ' (' + c.level + ' hit dice, ' + c.xp + ' XP)' : '') + ' while the game runs, and every creature of the same kind shares it.'),
      h('p', null, 'To make only this creature tougher or weaker, change its hit points below or switch it to another template. To change every '
        + 'creature of the kind, edit the template (a game file, not this save).'),
      rec ? h('details', null, h('summary', null, 'Template statistics'), summaryList(creatureStats(rec.rec, rec.attacks))) : null,
      button('Edit the template "' + name + '"', open, 'small'));
  }

  function entityDetail(e, index, refreshList) {
    const s = state.save;
    const ctx = (extra) => Object.assign({ commit: (fn) => commit(fn), enums: enums(), onChange: refreshList }, extra || {});
    const removeBtn = button('Remove from save', async () => {
      if (await confirm('Remove this entry?', 'It is deleted from the save file. This cannot be undone after you save.', 'Remove')) {
        commit(() => S.removeEntity(s, index), { rerender: true });
      }
    }, 'danger');
    if (e.tag === 7) {
      return h('div', null,
        section('Treasure', fieldGrid(e.head, T.TREASURE_FIELDS, ctx()), removeBtn),
        inventoryEditor(e),
        section('Raw', hexEditor(e.head.bytes, { commit: (fn) => commit(fn, { rerender: true }) })));
    }
    const parts = [
      section(e.tag === 8 ? 'Object' : 'Creature',
        fieldGrid(e.actor.base, actorFields(['name', 'handle', 'x', 'y', 'z', 'heading']), ctx()),
        e.tag === 8 ? fieldGrid(e.data, T.OBJECT_FIELDS, ctx()) : null,
        e.tag === 3 || e.tag === 4 ? fieldGrid(e.data, T.MONSTER_FIELDS, ctx({ onChange: () => render() })) : null,
        e.tag === 3 || e.tag === 4 ? templateNote(e.data.u16(0)) : null,
        h('div', { class: 'row' }, button('Heal', () => commit(() => S.heal(e), { rerender: true })), removeBtn)),
      section('Hit points', fieldGrid(e.actor.dnd, dndFields(['maxHp', 'curHp', 'tempHp', 'damage']), ctx())),
      section('Model', actorModelPanel(e)),
    ];
    if (e.tag === 8) parts.push(h('p', { class: 'muted' }, 'Clearing "Lock / trap armed" leaves a door unlocked or a trap disarmed in this save. Re-entering the area later rebuilds objects from the area files and the object-state table.'));
    parts.push(inventoryEditor(e));
    parts.push(effectsEditor(e));
    parts.push(rawActor(e));
    return h('div', null, parts);
  }

  // ---- world variables, named states, roster -------------------------------------------------

  function viewWorldVars() {
    const s = state.save;
    const sel = state.sel;
    const text = (sel.wvFilter || '').toLowerCase();
    const sources = state.game.worldVars ? Array.from(new Set(state.game.worldVars.map((v) => v.source))).sort() : [];
    const rows = [];
    for (let i = 0; i < S.WORLD_VAR_COUNT; i += 1) {
      const v = S.worldVar(s, i);
      const info = state.game.worldVar(i);
      if (sel.wvNonZero && !v) continue;
      if (sel.wvSource && (!info || info.source !== sel.wvSource)) continue;
      const desc = describeVar(i);
      if (text && !(String(i) === text || (info && info.name.toLowerCase().includes(text)) || desc.full.toLowerCase().includes(text))) continue;
      rows.push({ i, v, info, desc });
    }
    if (text) {
      const rank = (r) => {
        const n = r.info ? r.info.name.toLowerCase() : '';
        return String(r.i) === text || n === text ? 0 : n.includes(text) ? 1 : 2;
      };
      rows.sort((x, y) => rank(x) - rank(y) || x.i - y.i);
    }
    const pages = Math.max(1, Math.ceil(rows.length / WORLD_VAR_PAGE));
    sel.wvPage = Math.min(sel.wvPage || 0, pages - 1);
    const slice = rows.slice(sel.wvPage * WORLD_VAR_PAGE, (sel.wvPage + 1) * WORLD_VAR_PAGE);
    const search = h('input', { type: 'search', class: 'in-text wide', placeholder: 'Search names, quests and dialogue', value: sel.wvFilter || '' });
    search.addEventListener('change', () => { sel.wvFilter = search.value; sel.wvPage = 0; render(); });
    const nz = h('input', { type: 'checkbox', checked: Boolean(sel.wvNonZero) });
    nz.addEventListener('change', () => { sel.wvNonZero = nz.checked; sel.wvPage = 0; render(); });
    const src = h('select', { class: 'in-select', title: 'The script file that declares the variable' }, h('option', { value: '' }, 'All scripts'), sources.map((x) => h('option', { value: x }, x)));
    src.value = sel.wvSource || '';
    src.addEventListener('change', () => { sel.wvSource = src.value; sel.wvPage = 0; render(); });
    const body = [];
    for (const r of slice) {
      const listId = 'wv-values-' + r.i;
      const input = h('input', { type: 'text', class: numClass('u16'), value: String(r.v), list: r.desc.values.length ? listId : null, title: 'Value (0-65535)' });
      input.addEventListener('change', () => {
        try {
          const v = parseValue('u16', input.value.replace(/\s.*$/, ''));
          commit(() => S.setWorldVar(s, r.i, v));
          input.value = String(v);
        } catch (error) {
          toast(error.message, 'error');
          input.value = String(S.worldVar(s, r.i));
        }
      });
      const open = sel.wvOpen === r.i;
      body.push(h('tr', { title: r.desc.full || null },
        h('td', null, String(r.i)),
        h('td', { class: 'mono' }, r.info ? r.info.name : ''),
        h('td', { class: 'desc-cell' }, r.desc.short || h('span', { class: 'muted' }, 'No description available')),
        h('td', null, input, r.desc.values.length ? h('datalist', { id: listId }, r.desc.values.map(([v, t]) => h('option', { value: String(v) }, v + ' - ' + t.slice(0, 90)))) : null),
        h('td', null, r.desc.full ? button(open ? 'Hide' : 'Details', () => { sel.wvOpen = open ? null : r.i; render(); }, 'small') : null)));
      if (open) {
        const d = r.desc.info;
        body.push(h('tr', { class: 'detail-row' }, h('td', { colspan: 5 },
          h('p', null, h('strong', null, r.info ? r.info.name : '#' + r.i), ' is declared in ', h('code', null, d.script), '.'),
          d.journal.length ? h('div', null, h('h4', null, 'Journal entries that depend on it'),
            h('ul', null, d.journal.map((j) => h('li', null, h('strong', null, 'Value ' + j.value + ': '), j.text)))) : null,
          d.set.length ? h('div', null, h('h4', null, 'Where conversations set it'),
            h('ul', null, d.set.map((x) => h('li', null, h('strong', null, x.how + ' ' + x.value), ' in ', h('code', null, x.conv),
              /^protagonist$/i.test(x.speaker || '') ? ' when you choose' : x.speaker ? ' (' + x.speaker + ')' : '',
              x.text ? h('span', { class: 'quote' }, ' "' + x.text + '"') : null)))) : null,
          d.check.length ? h('div', null, h('h4', null, 'Where conversations check it'),
            h('p', null, d.check.map((c) => c.conv + ' (value ' + c.value + ')').join(', '))) : null)));
      }
    }
    return page('World variables', 'The 1,500 story variables that quests and conversations read and set. Descriptions come from the '
      + 'conversations that use each variable: the journal entries it controls, the lines spoken when it is set, and where it is checked. '
      + 'Hover a row for the full description; the value box suggests the values the game itself uses.',
      h('div', { class: 'row' }, search, h('label', { class: 'check has-help', title: 'Show only variables that are not 0, which are usually things that have happened in your game.' }, nz, ' Non-zero only'), sources.length ? src : null,
        h('span', { class: 'muted' }, rows.length + ' shown')),
      panel(table(['Index', 'Name', 'What it is', 'Value', ''], body, { compact: true }),
        pager(sel.wvPage, pages, (p) => { sel.wvPage = p; render(); })));
  }

  function pager(current, pages, onPage) {
    if (pages <= 1) return null;
    return h('div', { class: 'row pager' },
      button('Previous', () => onPage(current - 1), 'small', { disabled: current === 0 }),
      h('span', null, 'Page ' + (current + 1) + ' of ' + pages),
      button('Next', () => onPage(current + 1), 'small', { disabled: current >= pages - 1 }));
  }

  function viewNamedStates() {
    const s = state.save;
    const filter = (state.sel.nsFilter || '').toLowerCase();
    const search = h('input', { type: 'search', class: 'in-text', placeholder: 'Filter', value: state.sel.nsFilter || '' });
    search.addEventListener('change', () => { state.sel.nsFilter = search.value; render(); });
    const rows = [];
    s.namedStates.forEach((b, i) => {
      const kindValue = b.u8(OFF.namedKind);
      const nm = b.str(OFF.namedName, 8);
      const desc = describeNamedState(kindValue, nm);
      if (filter && !(nm + ' ' + desc.full).toLowerCase().includes(filter)) return;
      const kind = h('select', { class: 'in-select', title: 'Kind of named state' }, Object.entries(T.NAMED_STATE_KINDS).map(([k, v]) => h('option', { value: k }, v)));
      if (!T.NAMED_STATE_KINDS[kindValue]) kind.appendChild(h('option', { value: String(kindValue) }, 'Kind ' + kindValue));
      kind.value = String(kindValue);
      kind.addEventListener('change', () => commit(() => b.setU8(OFF.namedKind, Number(kind.value)), { rerender: true }));
      const name = h('input', { type: 'text', class: 'in-text short', value: nm, maxlength: 8, list: 'dl-named-' + kindValue });
      name.addEventListener('change', () => commit(() => b.setStr(OFF.namedName, 8, name.value, true), { rerender: true }));
      rows.push(h('tr', { title: desc.full },
        h('td', null, String(i)), h('td', null, kind), h('td', null, name), h('td', null, namedValueControl(b)),
        h('td', { class: 'desc-cell' }, desc.short),
        h('td', null, actions(button('Remove', () => commit(() => s.namedStates.splice(i, 1), { rerender: true }), 'small danger')))));
    });
    const kind = h('select', { class: 'in-select' }, Object.entries(T.NAMED_STATE_KINDS).map(([k, v]) => h('option', { value: k }, v)));
    const name = h('input', { type: 'text', class: 'in-text', maxlength: 8, placeholder: 'name (8 characters)', list: 'dl-named-2' });
    kind.addEventListener('change', () => name.setAttribute('list', 'dl-named-' + kind.value));
    const value = h('input', { type: 'text', class: numClass('u8'), value: '2' });
    return page('Named states', 'Named states remember things by name rather than by number. Encounter states record how a named '
      + 'fight ended (2 means defeated: it will not happen again). Object states record the state of named doors, gates and levers '
      + 'that scripts refer to. Hover a row for details.',
      h('div', { class: 'row' }, search, h('span', { class: 'muted' }, rows.length + ' of ' + s.namedStates.length)),
      panel(rows.length ? table(['#', 'Kind', 'Name', 'Value', 'What it is', ''], rows, { compact: true }) : h('p', { class: 'muted' }, 'No named states.')),
      section('Add or change',
        h('div', { class: 'row' }, h('label', null, 'Kind', kind), h('label', null, 'Name', name), h('label', null, 'Value', value), button('Set', () => {
          let v;
          try { v = parseValue('u8', value.value); } catch (error) { toast(error.message, 'error'); return; }
          if (!name.value) { toast('Enter a name.', 'error'); return; }
          commit(() => S.setNamedState(s, Number(kind.value), name.value, v), { rerender: true });
        }, 'primary')),
        h('p', { class: 'muted' }, 'If a state with the same kind and name exists, its value is changed instead. The name box suggests '
          + 'every name the game\'s scripts declare.')));
  }

  function viewRoster() {
    const s = state.save;
    const rows = s.roster.map((b, i) => {
      const internal = b.str(0, 12);
      const npc = state.game.npcInfo(internal);
      const dead = h('input', { type: 'checkbox', checked: b.u8(OFF.rosterDead) !== 0, title: 'Dead NPCs no longer appear' });
      dead.addEventListener('change', () => commit(() => b.setU8(OFF.rosterDead, dead.checked ? 1 : 0)));
      const click = h('select', { class: 'in-select', title: 'What happens when you click this NPC in the world' }, T.NPC_CLICK_STATES.map(([v, t]) => h('option', { value: String(v) }, t)));
      const cur = b.i32(0x54);
      if (!T.NPC_CLICK_STATES.some(([v]) => v === cur)) click.appendChild(h('option', { value: String(cur) }, cur + ' - nothing happens when clicked'));
      click.value = String(cur);
      click.addEventListener('change', () => commit(() => b.setI32(0x54, Number(click.value))));
      const changes = npc && npc.modes.length
        ? npc.modes.map((m) => (T.NPC_CLICK_STATES.find(([v]) => v === m.state) || [0, String(m.state)])[1].replace(/^\d+ - /, '') + ' after ' + m.conv + (m.text ? ': "' + m.text + '"' : '')).join('\n')
        : '';
      const open = state.sel.rosterOpen === i;
      return [
        h('tr', { title: changes ? 'Conversations that change this:\n' + changes : null },
          h('td', null, String(i)),
          h('td', null, h('strong', null, npc ? npc.display : internal), h('br'), h('span', { class: 'muted mono' }, internal)),
          h('td', null, dead), h('td', null, click),
          h('td', null, numberCell(b, 0x58, 'f32')), h('td', null, numberCell(b, 0x5C, 'f32')),
          h('td', null, actions(button(open ? 'Hide' : 'Raw', () => { state.sel.rosterOpen = open ? null : i; render(); }, 'small')))),
        open ? h('tr', { class: 'detail-row' }, h('td', { colspan: 7 },
          fieldGrid(b, T.ROSTER_FIELDS.filter((f) => f.k === 'name'), ctx()),
          hexEditor(b.bytes, { commit: (fn) => commit(fn, { rerender: true }) }))) : null,
      ];
    });
    return page('NPC roster', 'The game\'s fixed list of named NPCs. "When clicked" decides what clicking the NPC in the world does; '
      + 'conversations change it as the story moves on (hover a row to see where). Buy and sell rates are merchant price factors '
      + '(0 for non-merchants).',
      panel(table(['#', 'NPC', 'Dead', 'When clicked', 'Buys at', 'Sells at', ''], rows, { compact: true })));
  }

  // ---- maps ----------------------------------------------------------------------------------

  function viewMaps() {
    const s = state.save;
    if (!s.maps.length) return page('Maps', 'This save has no map records yet.');
    if (state.sel.map === undefined || state.sel.map >= s.maps.length) state.sel.map = 0;
    const map = s.maps[state.sel.map];
    const pick = h('select', { class: 'in-select' }, s.maps.map((m, i) => h('option', { value: String(i) }, label.levelFull(m.head.u32(OFF.mapLevel)))));
    pick.value = String(state.sel.map);
    pick.addEventListener('change', () => { state.sel.map = Number(pick.value); render(); });
    const gx = map.head.i32(OFF.mapGridX);
    const gy = map.head.i32(OFF.mapGridY);
    const explored = map.tiles.reduce((n, b) => n + (b ? 1 : 0), 0);
    const pinRows = map.pins.map((p, i) => h('tr', null, h('td', null, String(i)),
      h('td', null, numberCell(p, 0, 'f32')), h('td', null, numberCell(p, 4, 'f32')),
      h('td', { class: 'wide-cell' }, fieldGrid(p, T.MAP_PIN_FIELDS.filter((f) => f.k === 'label'), ctx({ inline: true }))),
      h('td', null, actions(button('Remove', () => commit(() => map.pins.splice(i, 1), { rerender: true }), 'small danger')))));
    const objRows = map.objects.map((o, i) => h('details', null, h('summary', null, 'Marker ' + i + ' (handle ' + o.i32(0) + ', type ' + o.i32(0x24) + ')'),
      fieldGrid(o, T.MAP_OBJECT_FIELDS, ctx())));
    return page('Maps', 'Map exploration, the notes you placed on the map, and the markers the map shows for each visited area.',
      h('div', { class: 'row' }, pick),
      section('Map record', fieldGrid(map.head, T.MAP_FIELDS, ctx())),
      section('Exploration (' + explored + ' of ' + map.tiles.length + ' cells)',
        h('div', { class: 'row' },
          button('Reveal all', () => commit(() => S.setMapExplored(map, true), { rerender: true })),
          button('Hide all', () => commit(() => S.setMapExplored(map, false), { rerender: true })),
          h('span', { class: 'muted' }, 'Click or drag on the map to toggle cells. Click with Shift to place a note.')),
        explorationCanvas(map, gx, gy)),
      section('Map notes (' + map.pins.length + ')',
        pinRows.length ? table(['#', 'Across (0-1)', 'Down (0-1)', 'Label', ''], pinRows, { compact: true }) : h('p', { class: 'muted' }, 'No notes on this map.'),
        button('Add note at centre', () => commit(() => S.addMapPin(map, 0.5, 0.5, 'New note'), { rerender: true }))),
      section('Area markers (' + map.objects.length + ')', objRows.length ? objRows : h('p', { class: 'muted' }, 'None.')));
  }

  // Each map tile holds a 4x4 grid of explored bytes, tiles stored row by row.
  function explorationCanvas(map, gx, gy) {
    const cols = gx * 4;
    const rows = gy * 4;
    if (!cols || !rows) return h('p', { class: 'muted' }, 'This map has no exploration grid.');
    const scale = Math.max(2, Math.min(28, Math.floor(720 / Math.max(cols, rows))));
    const canvas = h('canvas', { class: 'explore', width: cols * scale, height: rows * scale });
    const indexOf = (cx, cy) => ((Math.floor(cy / 4) * gx + Math.floor(cx / 4)) * 16) + (cy % 4) * 4 + (cx % 4);
    const draw = () => {
      const g = canvas.getContext('2d');
      const styles = getComputedStyle(document.documentElement);
      g.fillStyle = styles.getPropertyValue('--fog').trim() || '#222';
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.fillStyle = styles.getPropertyValue('--seen').trim() || '#6a8';
      for (let cy = 0; cy < rows; cy += 1) for (let cx = 0; cx < cols; cx += 1) if (map.tiles[indexOf(cx, cy)]) g.fillRect(cx * scale, cy * scale, scale, scale);
      g.strokeStyle = styles.getPropertyValue('--grid').trim() || '#444';
      g.lineWidth = 1;
      for (let tx = 0; tx <= gx; tx += 1) { g.beginPath(); g.moveTo(tx * 4 * scale + 0.5, 0); g.lineTo(tx * 4 * scale + 0.5, canvas.height); g.stroke(); }
      for (let ty = 0; ty <= gy; ty += 1) { g.beginPath(); g.moveTo(0, ty * 4 * scale + 0.5); g.lineTo(canvas.width, ty * 4 * scale + 0.5); g.stroke(); }
      g.fillStyle = styles.getPropertyValue('--pin').trim() || '#e44';
      for (const p of map.pins) {
        g.beginPath();
        g.arc(p.f32(0) * canvas.width, p.f32(4) * canvas.height, Math.max(4, scale), 0, Math.PI * 2);
        g.fill();
      }
    };
    let painting = null;
    let snap = null;
    const cellAt = (ev) => {
      const r = canvas.getBoundingClientRect();
      return [Math.floor((ev.clientX - r.left) / r.width * cols), Math.floor((ev.clientY - r.top) / r.height * rows)];
    };
    canvas.addEventListener('pointerdown', (ev) => {
      const r = canvas.getBoundingClientRect();
      if (ev.shiftKey) {
        const fx = (ev.clientX - r.left) / r.width;
        const fy = (ev.clientY - r.top) / r.height;
        commit(() => S.addMapPin(map, fx, fy, 'New note'), { rerender: true });
        return;
      }
      const [cx, cy] = cellAt(ev);
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;
      snap = snapshot();
      painting = map.tiles[indexOf(cx, cy)] ? 0 : 1;
      map.tiles[indexOf(cx, cy)] = painting;
      canvas.setPointerCapture(ev.pointerId);
      draw();
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (painting === null) return;
      const [cx, cy] = cellAt(ev);
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;
      map.tiles[indexOf(cx, cy)] = painting;
      draw();
    });
    const finish = () => {
      if (painting === null) return;
      painting = null;
      state.undo.push(snap);
      if (state.undo.length > UNDO_DEPTH) state.undo.shift();
      state.redo = [];
      state.dirty = true;
      updateChrome();
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);
    requestAnimationFrame(draw);
    return h('div', { class: 'canvas-wrap' }, canvas);
  }

  function viewCleared() {
    const s = state.save;
    const cells = s.regionFlags;
    const items = cells.map((c, i) => h('details', null, h('summary', null, 'Cell ' + i + ' - ' + c.length + ' markers, ' + c.reduce((n, b) => n + (b ? 1 : 0), 0) + ' flagged'),
      hexEditor(c, { commit: (fn) => commit(fn, { rerender: true }) })));
    return page('Cleared flags', 'One byte per area marker, grouped by map cell, recording which markers of the current area are cleared or used up. '
      + 'The game reads these against the current area\'s marker file.',
      cells.length ? button('Clear every flag', () => commit(() => cells.forEach((c) => c.fill(0)), { rerender: true }), 'danger') : null,
      items.length ? items : h('p', { class: 'muted' }, 'No cleared-flag cells are stored.'));
  }

  // ---- object states (.sta) ------------------------------------------------------------------

  function viewObjectStates() {
    const intro = h('div', { class: 'explain' },
      h('p', null, 'Every area has many doors, chests, barrels, crates and other objects whose names start with ', h('code', null, '1ZZ'), ', ',
        h('code', null, '2ZZ'), ' or ', h('code', null, '3ZZ'), ' followed by a number. The game remembers what happened to each of them '
        + 'in the ', h('code', null, '.sav.sta'), ' file: one table per area, one entry per numbered object. That is how a smashed barrel '
        + 'stays smashed and an opened door stays open when you come back to an area.'),
      h('p', null, 'An object with no entry is shown as the area placed it ("area default"). Changing an entry changes how the object '
        + 'appears the next time the area is loaded. Clearing an area makes every object in it return to its starting state, for example '
        + 'to refill containers or restore doors. "Lock cleared" records that a door\'s lock has been dealt with.'));
    if (!state.sta) {
      return page('Object states (.sta)', null, intro,
        h('p', null, 'No object-state file is open. Drop the matching .sav.sta file here, or create an empty one (every object then uses its starting state).'),
        h('div', { class: 'row' },
          button('Add .sav.sta file...', () => $('sta-input').click(), 'primary'),
          button('Create empty object-state file', () => commit(() => { state.sta = ST.ObjectStateFile.empty(); }, { rerender: true }))));
    }
    const sta = state.sta;
    if (state.sel.staLevel === undefined) state.sel.staLevel = state.save.mapId < ST.SLOT_COUNT ? state.save.mapId : 0;
    if (state.sel.staAll === undefined) state.sel.staAll = true;
    const level = state.sel.staLevel;
    const pick = h('select', { class: 'in-select' });
    for (let i = 0; i < ST.SLOT_COUNT; i += 1) {
      const n = sta.usedCount(i);
      pick.appendChild(h('option', { value: String(i) }, label.levelFull(i) + (n ? ' - ' + n + ' recorded' : '')));
    }
    pick.value = String(level);
    pick.addEventListener('change', () => { state.sel.staLevel = Number(pick.value); render(); });
    const showAll = h('input', { type: 'checkbox', checked: Boolean(state.sel.staAll) });
    showAll.addEventListener('change', () => { state.sel.staAll = showAll.checked; render(); });
    const body = h('div', null, h('p', { class: 'muted' }, 'Loading...'));
    const file = T.LEVELS[level] ? T.LEVELS[level][0] : '';
    (async () => {
      let markers = null;
      try { markers = await state.game.areaMarkers(file); } catch (error) { toast(error.message, 'error'); }
      const byIndex = new Map();
      if (markers) for (const m of markers) if (m.stateIndex !== undefined && m.stateIndex !== null && m.stateIndex < ST.SLOT_SIZE) byIndex.set(m.stateIndex, m);
      const indices = new Set(sta.entries(level).map((x) => x.index));
      if (state.sel.staAll) for (const k of byIndex.keys()) indices.add(k);
      const rows = Array.from(indices).sort((a, b) => a - b).map((idx) => staRow(level, idx, byIndex.get(idx)));
      clear(body);
      body.appendChild(rows.length ? table(['Index', 'Object', 'Kind', 'Area default', 'Position', 'Saved state', 'Lock cleared', 'Stored'], rows, { compact: true })
        : h('p', { class: 'muted' }, 'Nothing recorded for this area; every object uses its starting state.'));
      if (!markers) body.appendChild(h('p', { class: 'muted' }, 'This area has no marker data, so objects are shown by number only.'));
    })();
    const idxInput = h('input', { type: 'text', class: numClass('u16'), placeholder: 'number' });
    const stateSel = h('select', { class: 'in-select' }, Object.entries(T.OBJECT_STATES).map(([k, v]) => h('option', { value: k, title: T.OBJECT_STATE_HELP[k] }, v)));
    return page('Object states (.sta)', null, intro,
      h('div', { class: 'row' }, pick, h('label', { class: 'check has-help', title: 'Also list the area\'s numbered objects that have nothing recorded yet, so you can set their state.' }, showAll, ' Also list objects with no entry'),
        button('Clear this area', async () => {
          if (await confirm('Reset every object in ' + label.level(level) + '?', 'All remembered door, container and breakable states for this area are cleared.', 'Clear')) {
            commit(() => sta.clearLevel(level), { rerender: true });
          }
        }, 'danger')),
      panel(body),
      section('What the states mean',
        h('dl', { class: 'legend' }, Object.entries(T.OBJECT_STATES).map(([k, v]) => [h('dt', null, v), h('dd', null, T.OBJECT_STATE_HELP[k])])),
        h('dl', { class: 'legend' }, T.OBJECT_SUBTYPES.map((n, i) => [h('dt', null, n), h('dd', null, T.OBJECT_SUBTYPE_HELP[i])]))),
      section('Set an entry by number', h('div', { class: 'row' }, h('label', null, 'Object number', idxInput), h('label', null, 'State', stateSel), button('Set', () => {
        let idx;
        try { idx = parseValue('u16', idxInput.value); } catch (error) { toast(error.message, 'error'); return; }
        if (idx >= ST.SLOT_SIZE) { toast('The number must be below ' + ST.SLOT_SIZE + '.', 'error'); return; }
        commit(() => sta.set(level, idx, ST.encode(Number(stateSel.value), false)), { rerender: true });
      }, 'primary'))));
  }

  function staRow(level, idx, marker) {
    const sta = state.sta;
    const value = sta.get(level, idx);
    const dec = ST.decode(value);
    const sel = h('select', { class: 'in-select', title: 'The state the object will have when the area loads' }, h('option', { value: '' }, 'area default'),
      Object.entries(T.OBJECT_STATES).map(([k, v]) => h('option', { value: k, title: T.OBJECT_STATE_HELP[k] }, v)));
    if (dec.state !== null && !T.OBJECT_STATES[dec.state]) sel.appendChild(h('option', { value: String(dec.state) }, String(dec.state)));
    sel.value = dec.state === null ? '' : String(dec.state);
    const lock = h('input', { type: 'checkbox', checked: dec.lockCleared, disabled: dec.state === null, title: 'The door\'s lock has been dealt with' });
    const apply = () => commit(() => sta.set(level, idx, sel.value === '' ? 0 : ST.encode(Number(sel.value), lock.checked)), { rerender: true });
    sel.addEventListener('change', apply);
    lock.addEventListener('change', apply);
    const subtype = marker && marker.subtype !== undefined ? marker.subtype : null;
    const initial = marker && marker.initialState ? T.OBJECT_STATES[marker.initialState] || String(marker.initialState) : '';
    return h('tr', null,
      h('td', null, String(idx)),
      h('td', { class: 'mono' }, marker ? marker.name : ''),
      h('td', { title: subtype !== null ? T.OBJECT_SUBTYPE_HELP[subtype] || '' : null }, subtype !== null ? T.OBJECT_SUBTYPES[subtype] || String(subtype) : ''),
      h('td', { class: 'muted' }, initial),
      h('td', { class: 'mono nowrap' }, marker ? [marker.x, marker.y].map((v) => Math.round(v)).join(', ') : ''),
      h('td', null, sel), h('td', null, lock),
      h('td', { class: 'muted mono', title: 'Raw byte stored in the .sta file' }, value ? '0x' + value.toString(16).toUpperCase().padStart(2, '0') : ''));
  }

  // ---- placement -----------------------------------------------------------------------------

  function viewPlacement() {
    const s = state.save;
    const members = S.party(s);
    const centre = members.some((m) => m.entity) ? S.partyCentroid(s) : [0, 0, 0];
    const current = h('select', { class: 'in-select' }, members.map((m) => h('option', { value: String(m.handle) }, m.entity ? S.entityName(m.entity) : String(m.handle))));
    const curHandle = s.actorList.u32(OFF.alCurrent);
    if (!members.some((m) => m.handle === curHandle)) current.appendChild(h('option', { value: String(curHandle) }, String(curHandle) + ' (not in party)'));
    current.value = String(curHandle);
    current.addEventListener('change', () => commit(() => S.setSelectedMember(s, Number(current.value))));

    const xyz = centre.map((v) => h('input', { type: 'text', class: numClass('f32'), value: formatValue('f32', v) }));
    const setXYZ = (p) => p.forEach((v, k) => { xyz[k].value = formatValue('f32', v); });
    const curFile = T.LEVELS[s.mapId] ? T.LEVELS[s.mapId][0] : '';
    const points = [];
    for (const e of s.entities) {
      if (!e.actor) continue;
      const inParty = S.isPartyHandle(s, S.entityHandle(e));
      if (!inParty && e.tag !== 3 && e.tag !== 4) continue;
      points.push({ x: e.actor.base.f32(0x5C), y: e.actor.base.f32(0x60), colour: inParty ? '#f2c14e' : '#e2584c', r: inParty ? 6 : 4 });
    }
    const map = areaMap(curFile, {
      points,
      legend: [h('span', { class: 'swatch party' }), 'party', h('span', { class: 'swatch creature' }), 'creature'],
    }, setXYZ);
    const markerPick = h('select', { class: 'in-select wide' }, h('option', { value: '' }, 'Loading markers...'));
    fillMarkers(markerPick, curFile, [0, 2, 5, 7, 8, 9], (m) => setXYZ([m.x, m.y, m.z]));
    const relocate = () => {
      let p;
      try { p = xyz.map((x) => parseValue('f32', x.value)); } catch (error) { toast(error.message, 'error'); return; }
      commit(() => S.relocateParty(s, p), { rerender: true });
      toast('Party moved; it keeps its formation and loads at the new position.');
    };

    const arrivalInput = h('input', { type: 'text', class: numClass('i32'), value: String(s.actorList.i32(OFF.alArrival)) });
    const arrivalPick = h('select', { class: 'in-select wide' }, h('option', { value: '' }, 'Loading arrivals...'));
    fillMarkers(arrivalPick, curFile, [0], (m) => { arrivalInput.value = String(m.arrivalId); });
    const setArrival = () => {
      let v;
      try { v = parseValue('i32', arrivalInput.value); } catch (error) { toast(error.message, 'error'); return; }
      commit(() => S.setArrivalMarker(s, v), { rerender: true });
    };

    const destSel = h('select', { class: 'in-select wide' }, T.LEVELS.map((l, i) => (i === 0 || l[3] ? null : h('option', { value: String(i) }, label.levelFull(i)))));
    destSel.value = String(state.sel.dest || (s.mapId > 0 ? s.mapId : 4));
    const destArrival = h('input', { type: 'text', class: numClass('i32'), value: '0' });
    const destPick = h('select', { class: 'in-select wide' });
    const destXYZ = [0, 0, 0].map(() => h('input', { type: 'text', class: numClass('f32'), value: '' }));
    const mode = h('select', { class: 'in-select' }, h('option', { value: 'arrival' }, 'Arrive at an arrival marker'), h('option', { value: 'point' }, 'Arrive at a point chosen on the map'));
    mode.value = state.sel.destMode || 'arrival';
    const clearSta = h('input', { type: 'checkbox', checked: true });
    const destMapHost = h('div');
    const refreshDest = () => {
      state.sel.dest = Number(destSel.value);
      const file = T.LEVELS[state.sel.dest][0];
      clear(destPick);
      destPick.appendChild(h('option', { value: '' }, 'Loading...'));
      fillMarkers(destPick, file, [0], (m) => { destArrival.value = String(m.arrivalId); });
      clear(destMapHost);
      if (mode.value === 'point') destMapHost.appendChild(areaMap(file, null, (p) => p.forEach((v, k) => { destXYZ[k].value = formatValue('f32', v); })));
    };
    destSel.addEventListener('change', refreshDest);
    mode.addEventListener('change', () => { state.sel.destMode = mode.value; render(); });
    refreshDest();
    const moveArea = async () => {
      const level = Number(destSel.value);
      let placement;
      try {
        placement = mode.value === 'point' ? { point: destXYZ.map((x) => parseValue('f32', x.value)) } : { arrival: parseValue('i32', destArrival.value) };
      } catch (error) { toast(mode.value === 'point' ? 'Click the destination map to choose a point.' : error.message, 'error'); return; }
      const ok = await confirm('Move the party to ' + label.level(level) + '?',
        'Every creature, object and treasure of the current area is removed from this save, the destination\'s area state is reset, '
        + 'and the party arrives ' + (placement.point ? 'at the chosen point' : 'at arrival marker ' + placement.arrival) + '. This is experimental: keep your original save.', 'Move party');
      if (!ok) return;
      commit(() => {
        S.moveToArea(s, level, placement);
        if (clearSta.checked && state.sta) state.sta.clearLevel(level);
      }, { rerender: true });
    };

    return page('Party placement', null,
      section('On load',
        h('div', { class: 'fields' },
          h('label', { class: 'field-label', title: 'The character selected when the save loads' }, 'Selected character'), h('div', { class: 'field-value' }, current),
          h('label', { class: 'field-label' }, 'Current area'), h('div', { class: 'field-value' }, label.levelFull(s.mapId)),
          h('label', { class: 'field-label' }, 'Party centre'), h('div', { class: 'field-value mono' }, centre.map((v) => v.toFixed(1)).join(', ')),
          h('label', { class: 'field-label', title: 'If set, the game places the party at this arrival marker when the save loads' }, 'Arrival marker'),
          h('div', { class: 'field-value' }, String(s.actorList.i32(OFF.alArrival)),
            h('span', { class: 'muted' }, s.actorList.i32(OFF.alArrival) === -1 ? '(party loads at its saved positions)' : '(the game places the party at this marker on load)')))),
      section('Move the party within this area',
        h('p', { class: 'muted' }, 'Click the map (north is up) or pick a marker to choose a point, then move the party. The whole party moves '
          + 'together and keeps its formation, centred on the point.'),
        map,
        h('div', { class: 'row' }, markerPick),
        h('div', { class: 'row' }, h('label', null, 'X', xyz[0]), h('label', null, 'Y', xyz[1]), h('label', null, 'Height', xyz[2]), button('Move party here', relocate, 'primary'))),
      section('Place at an arrival marker',
        h('p', { class: 'muted' }, 'Arrival markers are the entry points the game uses when you travel. With one set, the game lines the party up '
          + 'at it when the save loads. -1 keeps the saved positions.'),
        h('div', { class: 'row' }, arrivalPick, h('label', null, 'Marker', arrivalInput), button('Set arrival', setArrival, 'primary'))),
      section('Move to another area (experimental)',
        h('p', { class: 'muted' }, 'Keeps the party and its inventory, removes the current area\'s creatures, objects and cleared flags, '
          + 'clears pending rest and encounter state, resets the destination\'s area state, and places the party in the destination.'),
        h('div', { class: 'row' }, h('label', null, 'Destination', destSel), h('label', null, 'Arrive', mode)),
        mode.value === 'arrival' ? h('div', { class: 'row' }, destPick, h('label', null, 'Marker', destArrival)) : h('div', null, destMapHost,
          h('div', { class: 'row' }, h('label', null, 'X', destXYZ[0]), h('label', null, 'Y', destXYZ[1]), h('label', null, 'Height', destXYZ[2]))),
        h('label', { class: 'check has-help', title: 'Resets the destination\'s doors, chests and breakables to their starting states, as on a first visit. Recommended, because the current area\'s objects are removed from the save.' }, clearSta, ' Also clear the destination\'s object states in the .sta file'),
        h('div', { class: 'row' }, button('Move party', moveArea, 'danger'), s.mapRegionRaw ? h('span', { class: 'warn' }, 'Not available for this save.') : null)),
      section('Party group', fieldGrid(s.group.head, T.GROUP_FIELDS, ctx()),
        s.group.followers.map((f, i) => h('details', null, h('summary', null, 'Follower ' + i + ' (handle ' + f.u32(0) + ')'), fieldGrid(f, T.FOLLOWER_FIELDS, ctx())))),
      section('Actor list record', fieldGrid(s.actorList, T.ACTOR_LIST_FIELDS, ctx())));
  }

  async function fillMarkers(select, file, kinds, onPick) {
    let markers = null;
    try { markers = await state.game.areaMarkers(file); } catch (error) { markers = null; }
    clear(select);
    if (!markers) {
      select.appendChild(h('option', { value: '' }, 'No marker data for this area'));
      select.disabled = true;
      return;
    }
    const list = markers.filter((m) => kinds.includes(m.kind) && (m.kind !== 0 || m.arrivalId !== null));
    select.disabled = false;
    select.appendChild(h('option', { value: '' }, 'Choose a marker (' + list.length + ')'));
    for (const m of list) {
      select.appendChild(h('option', { value: String(m.index) }, m.kindName + ': ' + (m.label || '#' + m.index) + '  (' + [m.x, m.y].map((v) => Math.round(v)).join(', ') + ')'));
    }
    select.addEventListener('change', () => {
      const m = markers.find((x) => x.index === Number(select.value));
      if (select.value !== '' && m) onPick(m);
    });
  }

  // ---- game master, arrays, conversations, multiplayer -------------------------------------

  function viewGameMaster() {
    const s = state.save;
    const gm = s.gameMaster;
    const count = gm.u8(OFF.gmPendingCount);
    const pending = [];
    for (let i = 0; i < Math.min(count, 200); i += 1) {
      const id = gm.u32(OFF.gmPending + i * 4);
      pending.push(h('tr', null, h('td', null, String(i)), h('td', null, numberCell(gm, OFF.gmPending + i * 4, 'u32')), h('td', null, label.item(id))));
    }
    const encounters = [];
    for (let i = 0; i < 10; i += 1) {
      encounters.push(h('tr', null, h('td', null, String(i)), h('td', null, numberCell(gm, OFF.gmEncounters + i * 8, 'i32')),
        h('td', null, numberCell(gm, OFF.gmEncounters + i * 8 + 4, 'i32'))));
    }
    return page('Rest & encounters', 'Resting rules for the current area, encounters in progress, items waiting to re-enter the world, and the party list.',
      section('Rest and party', fieldGrid(gm, T.GAME_MASTER_FIELDS, ctx())),
      section('Active encounters',
        h('p', { class: 'muted' }, 'Encounters the game is tracking in the current area. An id of -1 is an empty slot; the state is ignored for empty slots.'),
        table(['Slot', 'Encounter id', 'State'], encounters, { compact: true })),
      section('Pending item spawns (' + count + ')',
        h('p', { class: 'muted' }, 'Important items waiting to reappear in the world after the creature or container holding them was destroyed.'),
        pending.length ? table(['#', 'Item id', 'Item'], pending, { compact: true }) : h('p', { class: 'muted' }, 'None.'),
        button('Clear rest and encounter state', () => commit(() => S.clearAreaEncounterState(s), { rerender: true }))),
      section('Raw', hexEditor(gm.bytes, { commit: (fn) => commit(fn, { rerender: true }) })));
  }

  function viewAreaArrays() {
    const s = state.save;
    const rows = s.levelArrays.map((items, i) => {
      const bytes = items.reduce((n, b) => n + b.length, 0);
      return h('tr', null, h('td', null, label.levelFull(i)), h('td', null, String(items.length)), h('td', null, String(bytes)),
        h('td', null, items.length ? actions(
          button(state.sel.arrayOpen === i ? 'Hide' : 'View', () => { state.sel.arrayOpen = state.sel.arrayOpen === i ? null : i; render(); }, 'small'),
          button('Reset', () => commit(() => S.resetLevelArray(s, i), { rerender: true }), 'small danger')) : null));
    });
    const open = state.sel.arrayOpen;
    return page('Area state arrays', 'Per-area state the game keeps for markers it has activated (one list per area). Resetting an area makes its markers behave as on a first visit.',
      panel(table(['Area', 'Entries', 'Bytes', ''], rows, { compact: true })),
      open !== null && open !== undefined && s.levelArrays[open] ? section(label.levelFull(open),
        s.levelArrays[open].map((b, k) => h('details', null, h('summary', null, 'Entry ' + k + ' (' + b.length + ' bytes)'),
          hexEditor(b, { commit: (fn) => commit(fn, { rerender: true }) })))) : null);
  }

  function viewConversations() {
    const s = state.save;
    const filter = (state.sel.convFilter || '').toLowerCase();
    const search = h('input', { type: 'search', class: 'in-text', placeholder: 'Filter by name or speaker', value: state.sel.convFilter || '' });
    search.addEventListener('change', () => { state.sel.convFilter = search.value; render(); });
    const rows = [];
    s.conversations.forEach((c, i) => {
      if (!c.present) return;
      const info = state.game.conversation(c.name);
      const speakers = info ? info.speakers : [];
      const first = info ? info.first : '';
      if (filter && !(c.name + ' ' + speakers.join(' ') + ' ' + first).toLowerCase().includes(filter)) return;
      const open = state.sel.convOpen === i;
      const title = speakers.length ? speakers.map((x) => (/^protagonist$/i.test(x) ? 'you' : x)).join(', ') : (first ? 'Narration' : 'Script only');
      rows.push(h('tr', { title: first ? 'Opens with: "' + first + '"' : 'This conversation has no spoken lines.' },
        h('td', null, String(i)),
        h('td', null, h('strong', null, title), h('br'), h('span', { class: 'muted mono' }, c.name)),
        h('td', { class: 'desc-cell quote' }, first ? '"' + first + '"' : ''),
        h('td', null, String(c.raw.length)),
        h('td', null, actions(button(open ? 'Hide' : 'Bytes', () => { state.sel.convOpen = open ? null : i; render(); }, 'small')))));
      if (open) rows.push(h('tr', { class: 'detail-row' }, h('td', { colspan: 5 }, hexEditor(c.raw, { commit: (fn) => commit(fn, { rerender: true }) }))));
    });
    return page('Conversations', 'The game remembers how far each conversation has gone: which lines have been seen and which answers chosen. '
      + 'Byte edits must keep each record\'s length.',
      h('div', { class: 'row' }, search, h('span', { class: 'muted' }, rows.length + ' shown')),
      panel(table(['Slot', 'Conversation', 'Opening line', 'Bytes', ''], rows, { compact: true })));
  }

  function viewMultiplayer() {
    const s = state.save;
    return page('Multiplayer world', 'The random-world settings of a multiplayer save.',
      section('World', fieldGrid(s.mpWorld, T.MP_WORLD_FIELDS, ctx())),
      section('Raw (including the 16 area slots)', hexEditor(s.mpWorld.bytes, { commit: (fn) => commit(fn, { rerender: true }) })));
  }

  // ---- layout ---------------------------------------------------------------------------------

  function viewLayout() {
    const layout = [];
    const bytes = S.serialize(state.save, layout);
    const changes = state.original ? PorBytes.diffRanges(state.original, bytes, 500) : [];
    const rows = layout.filter((l) => !l.nested).map((l) => h('tr', null, h('td', null, l.name),
      h('td', { class: 'mono' }, '0x' + l.start.toString(16).toUpperCase()), h('td', { class: 'mono' }, '0x' + l.end.toString(16).toUpperCase()),
      h('td', null, String(l.end - l.start))));
    return page('File layout & hex', 'Where each section sits in the file as it would be written now.',
      section('Sections (' + bytes.length + ' bytes)', table(['Section', 'Start', 'End', 'Bytes'], rows, { compact: true })),
      section('Changes since opened',
        !state.original ? h('p', null, 'No original to compare.')
          : bytes.length !== state.original.length ? h('p', null, 'Size changed from ' + state.original.length + ' to ' + bytes.length + ' bytes; '
            + changes.length + (changes.length >= 500 ? '+' : '') + ' differing ranges.')
            : h('p', null, changes.length ? changes.length + (changes.length >= 500 ? '+' : '') + ' changed byte ranges.' : 'No byte changes.')),
      section('Whole file (read only)', hexEditor(bytes, { readOnly: true, pageSize: 4096 })));
  }

  // Short and full descriptions of a world variable, from the conversations that use it.
  function describeVar(i) {
    const info = state.game.varInfo(i);
    if (!info) return { short: '', full: '', values: [] };
    const isPlayer = (sp) => /^protagonist$/i.test(sp || '');
    const speakers = [];
    const addSpeaker = (sp) => { if (sp && sp !== 'Narrator' && !isPlayer(sp) && !speakers.includes(sp)) speakers.push(sp); };
    for (const x of info.set) {
      addSpeaker(x.speaker);
      for (const sp of state.game.conversationSpeakers(x.conv) || []) addSpeaker(sp);
    }
    let short;
    if (info.journal.length) short = 'Journal: ' + info.journal[info.journal.length - 1].text;
    else if (info.set.length) {
      const said = info.set.find((x) => x.text && !isPlayer(x.speaker));
      const chosen = info.set.find((x) => x.text && isPlayer(x.speaker));
      short = (speakers.length ? 'Set in conversation with ' + speakers.slice(0, 3).join(', ') : 'Set in ' + Array.from(new Set(info.set.map((x) => x.conv))).slice(0, 3).join(', '))
        + (said ? ': "' + said.text + '"' : chosen ? ' when you choose "' + chosen.text + '"' : '');
    } else if (info.check.length) short = 'Checked by ' + info.check.length + ' conversation step' + (info.check.length === 1 ? '' : 's') + ', never set by one';
    else short = 'Not used by any conversation';
    const lines = ['Script: ' + info.script];
    for (const j of info.journal) lines.push('Journal (value ' + j.value + '): ' + j.text);
    for (const s of info.set) {
      const who = isPlayer(s.speaker) ? 'when you choose' : s.speaker ? '(' + s.speaker + ')' : '';
      lines.push('Set ' + s.how + ' ' + s.value + ' in ' + s.conv + (who ? ' ' + who : '') + (s.text ? ': "' + s.text + '"' : ''));
    }
    if (info.check.length) lines.push('Checked in: ' + info.check.map((c) => c.conv + ' (' + c.value + ')').join(', '));
    const values = new Map();
    for (const j of info.journal) if (Number.isInteger(j.value)) values.set(j.value, 'journal: ' + j.text);
    for (const s of info.set) if (Number.isInteger(s.value) && s.how === '=' && !values.has(s.value)) values.set(s.value, s.text ? s.speaker + ': ' + s.text : 'set in ' + s.conv);
    for (const c of info.check) if (Number.isInteger(c.value) && !values.has(c.value)) values.set(c.value, 'checked in ' + c.conv);
    return { short, full: lines.join('\n'), values: Array.from(values).sort((a, b) => a[0] - b[0]), info };
  }

  function panel(...children) {
    return h('section', { class: 'card' }, children);
  }

  // Finds a named object in the bundled or loaded area data: [areaId, marker] or null.
  function namedObjectLocation(name) {
    const want = name.trim().toLowerCase();
    if (!state.namedObjectIndex) {
      const idx = new Map();
      const sources = [state.game.areaSummaries, bundledGame().areaSummaries];
      for (const [file, sum] of sources.flatMap((m) => Array.from(m))) {
        const level = T.LEVELS.findIndex((l) => l[0].toLowerCase() === file);
        for (const o of sum.objects) {
          const key = String(o[0]).trim().toLowerCase();
          if (key && !/^[123]zz/.test(key) && !idx.has(key)) idx.set(key, { level, x: o[3], y: o[4], subtype: o[1] });
        }
      }
      state.namedObjectIndex = idx;
    }
    return state.namedObjectIndex.get(want) || null;
  }

  function describeNamedState(kind, name) {
    const lines = [];
    let short = '';
    if (kind === 2) {
      const e = state.game.encounterInfo(name);
      short = 'Encounter';
      if (e) {
        lines.push('Declared in ' + e.script + '.');
        if (e.check.length) lines.push('Checked in: ' + e.check.map((c) => c.conv).join(', '));
        for (const x of e.set) lines.push('Used by ' + x.conv + (x.text ? ': "' + x.text + '"' : ''));
        short = 'Encounter from ' + e.script + (e.check.length ? ', checked by ' + e.check.map((c) => c.conv).slice(0, 3).join(', ') : '');
      }
    } else if (kind === 3) {
      const d = state.game.doorInfo(name);
      const where = namedObjectLocation(name);
      short = 'Named object';
      if (where) {
        short += ' (' + (T.OBJECT_SUBTYPES[where.subtype] || 'object').toLowerCase() + ') in ' + label.level(where.level) + ' at ' + where.x + ', ' + where.y;
        lines.push(short + '.');
      }
      if (d) {
        lines.push('Declared in ' + d.script + '.');
        for (const x of d.set) lines.push('Set to ' + x.value + ' by ' + x.conv + (x.text ? ': "' + x.text + '"' : ''));
      }
    }
    lines.push(T.NAMED_STATE_HELP[kind] || '');
    return { short, full: lines.filter(Boolean).join('\n') };
  }

  function namedValueControl(b) {
    const kind = b.u8(OFF.namedKind);
    const value = b.u8(OFF.namedState);
    const sel = h('select', { class: 'in-select' });
    let options = [];
    if (kind === 2) options = T.ENCOUNTER_VALUES;
    else if (kind === 3) {
      options = Object.entries(T.OBJECT_STATES).map(([st, text]) => [(Number(st) - 14) | (value & 0x40), text.replace(/^\d+ - /, '')]);
    }
    if (!options.some(([v]) => v === value)) options = options.concat([[value, String(value) + ' (custom)']]);
    for (const [v, text] of options) sel.appendChild(h('option', { value: String(v) }, kind === 3 ? text : text));
    sel.value = String(value);
    sel.addEventListener('change', () => commit(() => b.setU8(OFF.namedState, Number(sel.value)), { rerender: true }));
    sel.title = T.NAMED_STATE_HELP[kind] || '';
    return h('div', { class: 'field-value nowrap-flex' }, sel, numberCell(b, OFF.namedState, 'u8'));
  }

  // Top-down plot of an area with north up. Grey dots are walkable and scenery positions; coloured
  // marks are arrivals, objects and conversation spots; extra.points are drawn on top. Clicking
  // reports the world position (height taken from the nearest known point).
  function areaMap(file, extra, onPick) {
    const wrap = h('div', { class: 'area-map' }, h('p', { class: 'muted' }, 'Loading the area map...'));
    const status = h('div', { class: 'map-status muted' }, 'Click the map to choose a position.');
    (async () => {
      const cloud = await state.game.areaCloud(file);
      const markers = (await state.game.areaMarkers(file)) || [];
      clear(wrap);
      if (!cloud || !cloud.length) {
        wrap.appendChild(h('p', { class: 'muted' }, 'No map data is available for this area.'));
        return;
      }
      let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
      for (let i = 0; i < cloud.length; i += 3) {
        minX = Math.min(minX, cloud[i]); maxX = Math.max(maxX, cloud[i]);
        minY = Math.min(minY, cloud[i + 1]); maxY = Math.max(maxY, cloud[i + 1]);
      }
      const pad = 200;
      minX -= pad; maxX += pad; minY -= pad; maxY += pad;
      let zoom = state.sel.mapZoom || 1;
      const baseW = 860;
      const canvas = h('canvas', { class: 'area-canvas' });
      let target = null;
      let scale = 1;
      const toScreen = (x, y) => [(x - minX) * scale, (maxY - y) * scale];
      const toWorld = (sx, sy) => [sx / scale + minX, maxY - sy / scale];
      const draw = () => {
        scale = (baseW * zoom) / Math.max(maxX - minX, maxY - minY);
        canvas.width = Math.ceil((maxX - minX) * scale);
        canvas.height = Math.ceil((maxY - minY) * scale);
        const g = canvas.getContext('2d');
        const css = getComputedStyle(document.documentElement);
        const col = (n, d) => css.getPropertyValue(n).trim() || d;
        g.fillStyle = col('--fog', '#222');
        g.fillRect(0, 0, canvas.width, canvas.height);
        g.fillStyle = col('--map-floor', '#56606e');
        const dot = Math.max(3, 120 * scale);
        for (let i = 0; i < cloud.length; i += 3) {
          const [sx, sy] = toScreen(cloud[i], cloud[i + 1]);
          g.fillRect(sx - dot / 2, sy - dot / 2, dot, dot);
        }
        const mark = (m, colour, size) => {
          const [sx, sy] = toScreen(m.x, m.y);
          g.fillStyle = colour;
          g.fillRect(sx - size / 2, sy - size / 2, size, size);
        };
        for (const m of markers) {
          if (m.kind === 2) mark(m, col('--map-object', '#b9a46b'), 3);
          else if (m.kind === 8) mark(m, col('--map-talk', '#6fa8dc'), 5);
          else if (m.kind === 0) mark(m, col('--map-arrival', '#7fd18f'), 6);
        }
        for (const p of (extra && extra.points) || []) {
          const [sx, sy] = toScreen(p.x, p.y);
          g.beginPath();
          g.arc(sx, sy, p.r || 5, 0, Math.PI * 2);
          g.fillStyle = p.colour;
          g.fill();
          g.strokeStyle = '#000';
          g.lineWidth = 1;
          g.stroke();
        }
        if (target) {
          const [sx, sy] = toScreen(target[0], target[1]);
          g.strokeStyle = col('--pin', '#e44');
          g.lineWidth = 2;
          g.beginPath(); g.moveTo(sx - 10, sy); g.lineTo(sx + 10, sy); g.moveTo(sx, sy - 10); g.lineTo(sx, sy + 10); g.stroke();
          g.beginPath(); g.arc(sx, sy, 7, 0, Math.PI * 2); g.stroke();
        }
      };
      const nearestZ = (x, y) => {
        let best = Infinity; let z = 0;
        for (let i = 0; i < cloud.length; i += 3) {
          const d = (cloud[i] - x) ** 2 + (cloud[i + 1] - y) ** 2;
          if (d < best) { best = d; z = cloud[i + 2]; }
        }
        return { z, distance: Math.sqrt(best) };
      };
      const nearestMarker = (x, y) => {
        let best = Infinity; let found = null;
        for (const m of markers) {
          if (m.kind !== 0 && m.kind !== 2 && m.kind !== 8) continue;
          const d = (m.x - x) ** 2 + (m.y - y) ** 2;
          if (d < best) { best = d; found = m; }
        }
        return best < (60 / scale) ** 2 * 4 ? found : null;
      };
      const at = (ev) => {
        const r = canvas.getBoundingClientRect();
        return toWorld((ev.clientX - r.left) * (canvas.width / r.width), (ev.clientY - r.top) * (canvas.height / r.height));
      };
      canvas.addEventListener('mousemove', (ev) => {
        const [x, y] = at(ev);
        const m = nearestMarker(x, y);
        canvas.title = Math.round(x) + ', ' + Math.round(y) + (m ? '\n' + m.kindName + ': ' + (m.label || m.name || '') : '');
      });
      canvas.addEventListener('click', (ev) => {
        const [x, y] = at(ev);
        const near = nearestZ(x, y);
        target = [x, y];
        draw();
        status.textContent = 'Chosen point ' + Math.round(x) + ', ' + Math.round(y) + ', height ' + Math.round(near.z)
          + (near.distance > 150 ? ' - this is ' + Math.round(near.distance) + ' units from the nearest known walkable spot; choose a lit area.' : '');
        status.className = 'map-status' + (near.distance > 150 ? ' warn' : '');
        onPick([x, y, near.z]);
      });
      const zoomBtn = (text, f) => button(text, () => { zoom = Math.max(0.5, Math.min(6, f(zoom))); state.sel.mapZoom = zoom; draw(); }, 'small');
      wrap.appendChild(h('div', { class: 'row' }, zoomBtn('Zoom out', (z) => z / 1.5), zoomBtn('Zoom in', (z) => z * 1.5), zoomBtn('Fit', () => 1),
        h('span', { class: 'legend-inline' },
          h('span', { class: 'swatch floor' }), 'walkable', h('span', { class: 'swatch arrival' }), 'arrival point',
          h('span', { class: 'swatch object' }), 'object', h('span', { class: 'swatch talk' }), 'conversation',
          (extra && extra.legend) || null)));
      wrap.appendChild(h('div', { class: 'canvas-wrap map-scroll' }, canvas));
      wrap.appendChild(status);
      draw();
    })();
    return wrap;
  }

  // ---- game folder assets and 3D models ---------------------------------------------------------

  // Reads files below the game's data folder through a directory handle, caching folder listings.
  function dirAssets(rootDir) {
    const listings = new Map();
    const list = (dir) => {
      if (!listings.has(dir)) {
        listings.set(dir, (async () => {
          const m = new Map();
          for await (const [n, hd] of dir.entries()) m.set(n.toLowerCase(), hd);
          return m;
        })());
      }
      return listings.get(dir);
    };
    let base = null;
    const dataDir = () => {
      if (!base) base = list(rootDir).then((m) => { const d = m.get('data'); return d && d.kind === 'directory' ? d : rootDir; });
      return base;
    };
    const entry = async (rel) => {
      let cur = await dataDir();
      const parts = rel.split('/');
      for (let k = 0; k < parts.length; k += 1) {
        const e = (await list(cur)).get(parts[k].toLowerCase());
        if (!e) return null;
        if (k === parts.length - 1) return e;
        if (e.kind !== 'directory') return null;
        cur = e;
      }
      return null;
    };
    return {
      name: rootDir.name,
      async read(rel) {
        const e = await entry(rel);
        return e && e.kind === 'file' ? readFile(await e.getFile()) : null;
      },
      async hasFolder(rel) {
        const e = await entry(rel);
        return Boolean(e && e.kind === 'directory');
      },
    };
  }

  // Files chosen with a folder input, in browsers without folder access. The game's own data folder is
  // the shallowest folder named data (one holding TEE.trs when two are equally deep); data folders
  // further down, such as backups or other languages' copies, are left out. Returns the reader for
  // files below that data folder and the list of game files to load.
  function folderInputGame(fileList) {
    const entries = fileList.map((f) => {
      const path = (f.webkitRelativePath || f.name).replace(/\\/g, '/');
      return { f, path, lower: path.toLowerCase() };
    });
    const candidates = new Map();
    for (const e of entries) {
      const parts = e.lower.split('/');
      const k = parts.indexOf('data');
      if (k < 0 || k === parts.length - 1) continue;
      const prefix = parts.slice(0, k + 1).join('/') + '/';
      if (!candidates.has(prefix)) candidates.set(prefix, { prefix, depth: k, tee: false });
      if (e.lower === prefix + 'tee.trs') candidates.get(prefix).tee = true;
    }
    let data = null;
    for (const c of candidates.values()) {
      if (!data || c.depth < data.depth || (c.depth === data.depth && c.tee && !data.tee)) data = c;
    }
    const first = entries.length ? entries[0].lower.split('/')[0] : '';
    const prefix = data ? data.prefix : first + '/';
    const gameRoot = data ? prefix.slice(0, -'data/'.length) : null;
    const map = new Map();
    const files = [];
    for (const e of entries) {
      if (gameRoot !== null && e.lower === gameRoot + 'sfdat.dat') {
        files.push({ path: 'sfDat.dat', read: async () => readFile(e.f) });
        continue;
      }
      if (!e.lower.startsWith(prefix)) continue;
      const rel = e.path.slice(prefix.length);
      map.set(rel.toLowerCase(), e.f);
      if (/(\.(trs|str|mon|cv|ck|cj|cl|idx|db|por|lmm)|sfdat\.dat)$/i.test(rel)) files.push({ path: 'data/' + rel, read: async () => readFile(e.f) });
    }
    const assets = {
      name: entries.length ? entries[0].path.split('/')[0] : '',
      async read(rel) { const f = map.get(rel.toLowerCase()); return f ? readFile(f) : null; },
      async hasFolder(rel) {
        const p = rel.toLowerCase() + '/';
        for (const k of map.keys()) if (k.startsWith(p)) return true;
        return false;
      },
    };
    return { assets, files };
  }

  function setAssets(assets) {
    state.assets = assets;
    state.modelLoader = assets ? PorModel.createLoader(assets, (b) => PorBytes.Codec.decode(b)) : null;
    for (const v of Object.values(viewers)) v.key = null;
  }

  // Browsers allow only a few WebGL canvases, so pages share one viewer and the chooser has another.
  const viewers = {};
  function viewer(key, w, ht) {
    if (!viewers[key]) {
      viewers[key] = PorModel.createViewer(w, ht);
      viewers[key].statusEl = h('p', { class: 'muted small model-status' });
    }
    return viewers[key];
  }

  // A 3D view of a model, drawn from the loaded game folder. spec = {model, look, overlays}.
  function modelView(key, spec, size) {
    const v = viewer(key, size ? size[0] : 260, size ? size[1] : 320);
    const box = h('div', { class: 'model-view' }, v.el, v.statusEl);
    const say = (t) => { v.statusText = t; v.statusEl.textContent = t; };
    if (!v.supported) { say('This browser cannot draw 3D models (WebGL is unavailable).'); return box; }
    const path = T.MODEL_PATHS[spec.model];
    if (!path) { v.key = null; v.clear(); say('There is no model ' + spec.model + '.'); return box; }
    if (!state.modelLoader) { v.key = null; v.clear(); say('Load your game folder (Load game folder, at the top) to see this model in 3D.'); return box; }
    const want = path + '|' + (spec.look || 0) + '|' + (spec.overlays || []).join(',');
    if (v.key === want) { v.statusEl.textContent = v.statusText || ''; return box; }
    v.key = want;
    say('Loading data/Anims/' + path + '...');
    state.modelLoader.load(path, spec.look || 0, spec.overlays || []).then((r) => {
      if (v.key !== want) return;
      v.show(r.geometry, r.images);
      say(label.model(spec.model) + ' (data/Anims/' + path + ')' + (r.found < r.textures ? ', ' + (r.textures - r.found) + ' of ' + r.textures + ' textures not found' : '')
        + '. Drag to turn, scroll to zoom. Shown in its rest pose.');
    }).catch(async (error) => {
      if (v.key !== want) return;
      v.clear();
      const assets = state.assets;
      if (!/not found/.test(error.message) || !assets) { say('Could not draw this model: ' + error.message + '.'); return; }
      const folder = assets.name ? ' "' + assets.name + '"' : '';
      let hasAnims = true;
      try { hasAnims = await assets.hasFolder('Anims'); } catch (e) { hasAnims = true; }
      if (v.key !== want) return;
      say(hasAnims
        ? 'Could not draw this model: data/Anims/' + path + ' is not in the game folder you loaded' + folder + '.'
        : 'Could not draw this model: the folder you loaded' + folder + ' has no data/Anims folder. Load the game folder that holds sfDat.dat and the data folder.');
    });
    return box;
  }

  const modelKind = (i) => (T.isBodyModel(i) ? 'body' : (T.MODEL_PATHS[i] || '').startsWith('objects/') ? 'object' : 'creature');

  // Browse models with a live preview. Resolves to {model, look} or null.
  function chooseModel(current, currentLook, kind) {
    return new Promise((resolve) => {
      const dlg = h('dialog', { class: 'dlg picker model-chooser' });
      const close = (v) => { dlg.close(); dlg.remove(); resolve(v); };
      let sel = current;
      let look = currentLook || 0;
      const search = h('input', { type: 'search', class: 'in-text wide', placeholder: 'Search models' });
      const kindSel = h('select', { class: 'in-select', title: 'Kind of model' },
        [['', 'All models'], ['body', 'Characters'], ['creature', 'Creatures'], ['object', 'Objects']].map(([v, t]) => h('option', { value: v }, t)));
      kindSel.value = kind || '';
      const body = h('tbody');
      const lookSel = h('select', { class: 'in-select', title: 'Look (texture variant)' });
      const preview = h('div', { class: 'chooser-preview' });
      const users = (i) => Array.from(new Set((state.game.creatures || []).filter((c) => c.model === i && c.name).map((c) => c.name)));
      const showPreview = () => {
        clear(lookSel);
        const le = lookEnum(sel);
        const opts = le ? le.options : [[look, look + ' - ' + label.look(sel, look)]];
        if (!opts.some(([v]) => v === look)) look = opts.some(([v]) => v === 1) && T.isBodyModel(sel) ? 1 : opts[0][0];
        for (const [v, t] of opts) lookSel.appendChild(h('option', { value: String(v) }, t));
        lookSel.value = String(look);
        clear(preview).appendChild(modelView('chooser', { model: sel, look }, [320, 380]));
      };
      lookSel.addEventListener('change', () => { look = Number(lookSel.value); showPreview(); });
      const draw = () => {
        const q = search.value.trim().toLowerCase();
        clear(body);
        T.MODEL_PATHS.forEach((path, i) => {
          if (kindSel.value && modelKind(i) !== kindSel.value) return;
          const who = users(i).join(', ');
          if (q && !(i + ' ' + label.model(i) + ' ' + path + ' ' + who).toLowerCase().includes(q)) return;
          body.appendChild(h('tr', {
            class: 'clickable' + (i === sel ? ' selected' : ''), tabindex: '0',
            onclick: () => { sel = i; draw(); showPreview(); },
            onkeydown: (e) => { if (e.key === 'Enter') close({ model: i, look }); },
          }, h('td', { class: 'mono' }, String(i)), h('td', null, label.model(i)), h('td', { class: 'muted' }, who.slice(0, 60))));
        });
      };
      search.addEventListener('input', draw);
      kindSel.addEventListener('change', draw);
      dlg.appendChild(h('h3', null, 'Choose a model'));
      dlg.appendChild(h('div', { class: 'row' }, search, kindSel));
      dlg.appendChild(h('div', { class: 'chooser' },
        h('div', { class: 'picker-list' }, h('table', { class: 'grid compact' }, h('thead', null, h('tr', null, h('th', null, 'Id'), h('th', null, 'Model'), h('th', null, 'Creatures using it'))), body)),
        h('div', { class: 'chooser-side' }, h('label', null, 'Look ', lookSel), preview)));
      dlg.appendChild(h('div', { class: 'dlg-buttons' },
        h('button', { class: 'btn', onclick: () => close(null) }, 'Cancel'),
        h('button', { class: 'btn primary', onclick: () => close({ model: sel, look }) }, 'Use this model')));
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(null); });
      document.body.appendChild(dlg);
      draw();
      showPreview();
      dlg.showModal();
      search.focus();
    });
  }

  // Model, look and overlay controls with the 3D view, for an actor record (party, creatures, objects).
  function actorModelPanel(e) {
    const base = e.actor.base;
    const overlays = () => [base.i32(0x70) === 98 ? 98 : null, base.i32(0x74) === 99 ? 99 : null].filter(Boolean);
    const choose = async () => {
      const r = await chooseModel(base.u32(0x58), base.i32(0x6C), e.tag === 8 ? 'object' : e.tag === 2 ? 'body' : '');
      if (!r) return;
      commit(() => { base.setU32(0x58, r.model); base.setI32(0x6C, r.look); }, { rerender: true });
    };
    const fields = T.ACTOR_FIELDS.filter((f) => ['model', 'texBase', 'tex98', 'tex99'].includes(f.k));
    return h('div', { class: 'model-panel' },
      modelView('page', { model: base.u32(0x58), look: base.i32(0x6C), overlays: overlays() }),
      h('div', null,
        fieldGrid(base, fields, ctx({ lookModel: () => base.u32(0x58), onChange: () => render() })),
        h('div', { class: 'row' }, button('Choose a model...', choose, 'primary', { title: 'Browse every model with a 3D preview' }))));
  }

  // ---- item and creature pickers ----------------------------------------------------------------

  function iconImg(n, cls) {
    const url = state.game.icon(n);
    return url ? h('img', { src: url, class: cls || 'item-icon', alt: '' }) : null;
  }

  function itemDamageText(it) {
    if (!it || !it.dieCount) return '';
    return label.dice(it.dieCount, it.dieSides, it.dmgBonus) + (it.critMin && it.critMin < 20 ? ', ' + it.critMin + '-20' : '') + (it.critMult > 1 ? ' x' + it.critMult : '');
  }

  // Opens the searchable item list; resolves to an item id or null.
  async function pickItem(title) {
    const items = state.game.items;
    if (!items) { toast('No item catalog is available.', 'error'); return null; }
    const row = await PorUI.picker({
      title: title || 'Choose an item',
      placeholder: 'Search by name or number',
      rows: items,
      text: (it) => it.id + ' ' + (it.name || '') + ' ' + (it.baseName || ''),
      tooltip: (it) => (it.baseName && it.baseName !== it.name ? 'Unidentified: ' + it.baseName + '\n' : '')
        + 'Value ' + it.value + ', weight ' + it.weight + ', size ' + it.w + 'x' + it.h + (it.slotMask ? '\nWorn: ' + label.slotMask(it.slotMask) : '')
        + (itemDamageText(it) ? '\nDamage ' + itemDamageText(it) : '') + (it.acBonus && (it.type === 4 || it.type === 5) ? '\nArmour class +' + it.acBonus : ''),
      filters: [{
        label: 'Worn on',
        options: [['none', 'Not wearable']].concat(T.EQUIP_SLOTS.map(([bit, n]) => [bit, n])),
        test: (it, v) => (v === 'none' ? !it.slotMask : (it.slotMask & Number(v)) !== 0),
      }, {
        label: 'Type',
        options: T.ITEM_TYPES.map(([v, t]) => [v, t.replace(/^\d+ - /, '')]),
        test: (it, v) => it.type === Number(v),
      }],
      columns: [
        { label: '', get: (it) => iconImg(it.category, 'item-icon tiny') || '', cls: 'icon-cell' },
        { label: 'Id', get: (it) => String(it.id), cls: 'mono' },
        { label: 'Name', get: (it) => it.name || '(unnamed)' },
        { label: 'Value', get: (it) => String(it.value), cls: 'num' },
        { label: 'Weight', get: (it) => String(it.weight), cls: 'num' },
        { label: 'Size', get: (it) => it.w + 'x' + it.h },
        { label: 'Worn on', get: (it) => (it.slotMask ? label.slotMask(it.slotMask) : '') },
      ],
    });
    return row ? row.id : null;
  }

  async function pickCreature() {
    const list = state.game.creatures;
    if (!list) { toast('No creature list is available.', 'error'); return null; }
    const row = await PorUI.picker({
      title: 'Choose a creature template',
      placeholder: 'Search by name or number',
      rows: list,
      text: (c) => c.id + ' ' + (c.name || ''),
      columns: [
        { label: 'Id', get: (c) => String(c.id), cls: 'mono' },
        { label: 'Name', get: (c) => c.name || '(unnamed)' },
        { label: 'Hit dice', get: (c) => String(c.level), cls: 'num' },
        { label: 'XP', get: (c) => String(c.xp), cls: 'num' },
        { label: 'Model', get: (c) => (c.model !== undefined ? label.model(c.model) : '') },
      ],
    });
    return row ? row.id : null;
  }

  async function pickEquipSet() {
    const sets = state.game.equipSets;
    if (!sets) { toast('No equipment sets are available.', 'error'); return null; }
    const rows = Array.from(sets.keys()).map((k) => ({ id: k, text: label.equipSet(k) }));
    const row = await PorUI.picker({
      title: 'Choose an equipment set',
      placeholder: 'Search by number or item',
      rows,
      text: (r) => r.id + ' ' + r.text,
      columns: [{ label: 'Set', get: (r) => String(r.id), cls: 'mono' }, { label: 'Contents', get: (r) => r.text }],
    });
    return row ? row.id : null;
  }

  async function pickIcon() {
    const rows = T.ITEM_ICONS.map((n, i) => ({ i, n }));
    const row = await PorUI.picker({
      title: 'Choose a picture',
      placeholder: 'Search by number or file name',
      rows,
      text: (r) => r.i + ' ' + r.n,
      columns: [
        { label: '', get: (r) => iconImg(r.i, 'item-icon small') || '', cls: 'icon-cell' },
        { label: 'Id', get: (r) => String(r.i), cls: 'mono' },
        { label: 'File', get: (r) => r.n + '.bmp' },
        { label: 'Rule', get: (r) => T.ICON_RULES[r.i] || '' },
      ],
    });
    return row ? row.i : null;
  }

  // ---- creature templates -----------------------------------------------------------------------

  const CREATURE_GROUPS = [
    ['id', 'Identity and appearance'], ['hp', 'Hit points'], ['def', 'Defence'], ['off', 'Offence'],
    ['abil', 'Abilities, saves and skills'], ['imm', 'Immunities'], ['props', 'What it is'], ['feat', 'Classes and feats'],
    ['spec', 'Special abilities'], ['spell', 'Spells'], ['gear', 'Equipment, AI and sounds'],
  ];

  const bitNames = (bits, v) => bits.filter(([m]) => (v & m) !== 0).map(([, n]) => n);

  // Worked-out statistics of a creature template, following the game's own formulas.
  function creatureStats(rec, attacks) {
    const ab = [0, 1, 2, 3, 4, 5].map((k) => rec.u8(0x4C + k));
    const mod = ab.map(abilityMod);
    const size = rec.u8(0x0C);
    const sizeMod = T.SIZE_ATTACK_MOD[size] || 0;
    const hd = rec.u8(0x1A);
    const die = rec.u8(0x19);
    const hpBonus = rec.u8(0x1B);
    const base = rec.u8(0x21);
    const setId = rec.u16(0x52);
    const set = state.game.equipSet(setId);
    let armour = null;
    let shield = null;
    if (set) {
      for (const [id] of set) {
        const it = state.game.item(id);
        if (!it) continue;
        if (it.type === 4 && (!armour || it.acBonus > armour.ac)) armour = { ac: it.acBonus, name: label.item(id) };
        if (it.type === 5 && (!shield || it.acBonus > shield.ac)) shield = { ac: it.acBonus, name: label.item(id) };
      }
    }
    const gearAc = (armour ? armour.ac : 0) + (shield ? shield.ac : 0);
    const melee = rec.i8(0x24) + mod[0] + sizeMod;
    const ranged = rec.i8(0x25) + mod[1] + sizeMod;
    const out = [];
    out.push(['Hit points', hd + 'd' + die + (hpBonus ? '+' + hpBonus : '') + ': average ' + (Math.floor((hd * (die + 1)) / 2) + hpBonus)
      + ' (' + (hd + hpBonus) + ' to ' + (hd * die + hpBonus) + ') when a random dungeon places it. Creatures in the campaign areas get the hit points written in their encounter.']);
    let acText = base + ' + Dexterity ' + signed(mod[1]);
    if (armour) acText += ' + armour ' + signed(armour.ac) + ' (' + armour.name + ')';
    if (shield) acText += ' + shield ' + signed(shield.ac) + ' (' + shield.name + ')';
    acText += ' = ' + (base + mod[1] + gearAc) + '; touch ' + (base + mod[1]) + ', flat-footed ' + (base + gearAc) + '.';
    if (!set) acText += ' Armour and shield it carries add to this.';
    else if (!armour && !shield) acText += ' Its equipment set has no armour or shield.';
    else acText += ' Armour from its equipment set (random dungeons); in the campaign areas its encounter decides what it carries.';
    out.push(['Armour class', acText + ' Spell effects change it in play.']);
    out.push(['Attack', 'Melee ' + signed(melee) + ' (base ' + signed(rec.i8(0x24)) + ', Strength ' + signed(mod[0]) + ', size ' + signed(sizeMod) + '); ranged '
      + signed(ranged) + ' (base ' + signed(rec.i8(0x25)) + ', Dexterity ' + signed(mod[1]) + ', size ' + signed(sizeMod) + ').']);
    const atk = attacks.map((a, k) => {
      const kind = a.u8(0);
      const what = (T.ATTACK_KINDS.find(([v]) => v === kind) || [0, 'kind ' + kind])[1].replace(/^\d+ - /, '');
      const dmg = kind === 2 ? '' : ', ' + label.dice(a.u8(7), a.u8(6), a.u8(8)) + (mod[0] && kind === 0 ? ' ' + signed(mod[0]) + ' Strength' : '');
      return 'row ' + k + ': ' + what + dmg + ', ' + Math.max(9, a.u16(3)) + ' ft';
    });
    if (atk.length) out.push(['Attack rows', atk.join('; ') + '.']);
    out.push(['Saves', 'Fortitude ' + signed(rec.i8(0x49) + mod[2]) + ', Reflex ' + signed(rec.i8(0x4A) + mod[1]) + ', Will ' + signed(rec.i8(0x4B) + mod[4]) + ' (base plus Constitution, Dexterity and Wisdom).']);
    out.push(['Initiative', 'd20 ' + signed(rec.i8(0x1C)) + '.']);
    const speed = rec.i16(0x1D);
    out.push(['Speed', speed + ' = ' + speed / 2 + ' ft; it moves at ' + Math.round(speed * 0.4 * 10) / 10 + ' ft (four fifths).']);
    const xp = rec.i32(0x15);
    out.push(['Experience', xp + '; with four party members each receives ' + Math.floor(xp / 40) + ' (the total divided by ten times the party size).']);
    const imm = bitNames(T.COND_SAVE_BITS, rec.u32(0x29));
    out.push(['Immune to', imm.length ? imm.join(', ') : 'nothing']);
    const what = bitNames(T.DESCRIPTOR_LO_BITS, rec.u32(0x0D)).concat(bitNames(T.DESCRIPTOR_HI_BITS, rec.u32(0x11)));
    out.push(['Description', what.length ? what.join(', ') : 'nothing special']);
    const extra = [];
    if (rec.u8(0x3E)) extra.push('spell resistance ' + rec.u8(0x3E));
    if (rec.u8(0x28)) extra.push('needs a +' + rec.u8(0x28) + ' weapon to be hurt');
    const spec = [];
    for (let k = 0; k < 10; k += 1) if (rec.u8(0x54 + k) !== 255) spec.push(label.special(rec.u8(0x54 + k)));
    if (spec.length) extra.push('special: ' + spec.join(', '));
    const spells = [];
    for (let k = 0; k < 20; k += 1) { const s = rec.i16(0x6A + k * 2); if (s >= 0) spells.push(label.spell(s)); }
    for (let k = 0; k < 20; k += 1) { const s = rec.i16(0x92 + k * 2); if (s >= 0) spells.push(label.divine(s)); }
    if (spells.length) extra.push('spells: ' + Array.from(new Set(spells)).join(', '));
    if (extra.length) out.push(['Also', extra.join('; ') + '.']);
    return out;
  }

  function summaryList(rows) {
    return h('dl', { class: 'summary' }, rows.map(([k, v]) => [h('dt', null, k), h('dd', null, v)]));
  }

  function viewCreatureTemplates() {
    const intro = 'Creature templates are the statistics every creature of a kind uses: hit dice, armour class, attacks, saves, '
      + 'abilities, spells and loot. They live in the game\'s data/monsters.mon file, not in a save. The game reads them live, so a change '
      + 'affects every creature of that kind in every game played with this installation, including creatures already in saves. '
      + 'To change one creature in one save instead, edit it under Creatures & NPCs.';
    const c = state.creatureFile;
    if (!c) {
      return page('Creature templates', intro,
        section('Open the template file',
          h('p', null, 'Open ', h('code', null, 'data/monsters.mon'), ' from your game folder. Names come from the game data (built in, or ',
            h('code', null, 'data/str/monsters.str'), ' if you open it too).'),
          h('div', { class: 'row' },
            state.gameDir || state.assets ? button('Open from the loaded game folder', openCreatureFromGameDir, 'primary') : null,
            button('Open monsters.mon...', () => $('mon-input').click(), state.gameDir || state.assets ? '' : 'primary'))),
        section('Before editing', h('ul', null,
          h('li', null, 'Keep a copy of monsters.mon. When writing into the game folder the editor keeps the first original as monsters.mon.bak.'),
          h('li', null, 'Saves refer to templates by their position in the file and encounters by their unique id, so the editor never reorders or removes templates.'),
          h('li', null, 'This is a game file, not a save: undo works while the editor is open, but reinstalling or verifying the game restores the original.'))));
    }
    const list = c.model.records;
    const names = c.names;
    const search = h('input', { type: 'search', class: 'in-text', placeholder: 'Filter by name or number', value: state.sel.ctFilter || '' });
    search.addEventListener('input', () => { state.sel.ctFilter = search.value; renderList(); });
    if (state.sel.ctSel === undefined || state.sel.ctSel >= list.length) state.sel.ctSel = 0;
    const listHost = h('div', { class: 'split-list' });
    const nameOf = (i) => (names && names[list[i].rec.i32(0)]) || (state.game.creatureName(i)) || 'Creature ' + i;
    const renderList = () => {
      const f = (state.sel.ctFilter || '').toLowerCase();
      const rows = [];
      list.forEach((r, i) => {
        const n = nameOf(i);
        if (f && !(i + ' ' + n).toLowerCase().includes(f)) return;
        rows.push(h('tr', { class: 'clickable' + (state.sel.ctSel === i ? ' selected' : ''), onclick: () => { state.sel.ctSel = i; render(); } },
          h('td', null, String(i)), h('td', null, n), h('td', { class: 'num' }, String(r.rec.u8(0x1A))), h('td', { class: 'num' }, String(r.rec.i32(0x15)))));
      });
      clear(listHost).appendChild(table(['#', 'Creature', 'Hit dice', 'XP'], rows, { compact: true }));
    };
    renderList();
    const r = list[state.sel.ctSel];
    const rec = r.rec;
    const cctx = ctx({ onChange: () => render(), lookModel: () => rec.i32(0x04) });
    const fieldsOf = (g) => T.CREATURE_TEMPLATE_FIELDS.filter((f) => f.group === g);
    const attackRows = r.attacks.map((a, k) => h('tr', null, h('td', null, String(k)),
      T.CREATURE_ATTACK_FIELDS.map((f) => h('td', { title: f.help || null }, fieldGrid(a, [f], ctx({ inline: true, onChange: () => render() })))),
      h('td', null, a.u8(0) === 2 ? 'weapon' : label.dice(a.u8(7), a.u8(6), a.u8(8))),
      h('td', null, actions(button('Remove', () => commit(() => r.attacks.splice(k, 1), { rerender: true }), 'small danger')))));
    const addAttack = () => commit(() => {
      const b = PorBytes.Block.zero(9);
      if (r.attacks.length) b.bytes.set(r.attacks[r.attacks.length - 1].bytes);
      r.attacks.push(b);
    }, { rerender: true });
    const chooseFor = async () => {
      const res = await chooseModel(rec.i32(0x04), rec.i32(0x08), 'creature');
      if (res) commit(() => { rec.setI32(0x04, res.model); rec.setI32(0x08, res.look); }, { rerender: true });
    };
    const groupSection = (g, title) => {
      const extra = [];
      if (g === 'id') {
        return section(title, h('div', { class: 'model-panel' },
          modelView('page', { model: rec.i32(0x04), look: rec.i32(0x08) }),
          h('div', null, fieldGrid(rec, fieldsOf(g), cctx),
            h('div', { class: 'row' }, button('Choose a model...', chooseFor, 'primary', { title: 'Browse every model with a 3D preview' })))));
      }
      if (g === 'hp') extra.push(h('p', { class: 'muted' }, 'Hit dice are the creature\'s level: hit points are rolled as that many dice of the size given by Hit die, plus the bonus. '
        + 'A creature with 8 hit dice and a d10 hit die has 8d10 hit points (8 to 80, 44 on average) before the bonus.'));
      if (g === 'off') {
        extra.push(h('h4', null, 'Attack rows (' + r.attacks.length + ')'),
          r.attacks.length ? table(['#'].concat(T.CREATURE_ATTACK_FIELDS.map((f) => f.label)).concat(['Damage', '']), attackRows, { compact: true }) : h('p', { class: 'muted' }, 'No attacks.'),
          button('Add attack row', addAttack));
      }
      return section(title, fieldGrid(rec, fieldsOf(g), cctx), extra);
    };
    return page('Creature templates', intro,
      h('div', { class: 'row' },
        button(state.gameDir && c.fromGameDir ? 'Save to game folder' : 'Download monsters.mon', () => saveCreatureFile(false), 'primary'),
        state.gameDir && c.fromGameDir ? button('Download copy', () => saveCreatureFile(true)) : null,
        button('Close file', () => { state.creatureFile = null; render(); }),
        h('span', { class: c.dirty ? 'warn' : 'muted' }, c.dirty ? 'Unsaved template changes' : c.source)),
      h('div', { class: 'row' }, search),
      h('div', { class: 'split' }, listHost,
        h('div', { class: 'split-detail' },
          section(nameOf(state.sel.ctSel) + ' (template ' + state.sel.ctSel + ')', summaryList(creatureStats(rec, r.attacks))),
          CREATURE_GROUPS.map(([g, title]) => groupSection(g, title)),
          section('Raw record', hexEditor(rec.bytes, { commit: (fn) => commit(fn, { rerender: true }) })))));
  }

  async function openCreatureFromGameDir() {
    const dir = state.gameDir;
    if (!dir) {
      // A folder chosen without write access: read the files, and download edits.
      if (!state.assets) return;
      const mon = await state.assets.read('Monsters.mon');
      if (!mon) { toast('monsters.mon was not found in the game folder.', 'error'); return; }
      const str = await state.assets.read('str/monsters.str');
      await setCreatureFile(mon, str, 'from the game folder (edits are downloaded)', null);
      return;
    }
    try {
      const data = await findEntry(dir, 'data');
      const base = data && data.kind === 'directory' ? data : dir;
      const mon = await findEntry(base, 'monsters.mon');
      if (!mon) { toast('monsters.mon was not found in the game folder.', 'error'); return; }
      let names = null;
      const str = await findEntry(base, 'str');
      if (str && str.kind === 'directory') {
        const f = await findEntry(str, 'monsters.str');
        if (f) names = await readFile(await f.getFile());
      }
      await setCreatureFile(await readFile(await mon.getFile()), names, 'from the game folder', { dir: base, handle: mon });
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  // namesBytes is monsters.str, or null when it was not opened.
  async function setCreatureFile(bytes, namesBytes, source, location) {
    let model;
    try {
      model = G.parseCreatureFile(bytes);
    } catch (error) {
      toast(error.message, 'error');
      return;
    }
    if (namesBytes) await detectEncoding([{ read: async () => namesBytes }]);
    state.creatureFile = {
      model, names: namesBytes ? G.parseLineTable(namesBytes) : null, namesBytes,
      original: bytes, source, location: location || null, fromGameDir: Boolean(location), dirty: false,
    };
    state.sel.ctSel = 0;
    go('creatures-templates');
  }

  async function saveCreatureFile(forceDownload) {
    const c = state.creatureFile;
    const bytes = G.serializeCreatureFile(c.model);
    let wrote = false;
    if (c.location && !forceDownload) {
      try {
        const dir = c.location.dir;
        const name = c.location.handle.name;
        if (dir.requestPermission && (await dir.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('permission to write was not given');
        if (!(await fileExists(dir, name + '.bak'))) await writeFile(dir, name + '.bak', c.original);
        await writeFile(dir, name, bytes);
        wrote = true;
        toast('Saved ' + name + ' to the game folder (the first original is kept as ' + name + '.bak).');
      } catch (error) {
        toast('Could not write to the game folder (' + error.message + '); downloading instead.', 'error');
      }
    }
    if (!wrote) {
      download('monsters.mon', bytes);
      toast('Downloaded monsters.mon. Replace data/monsters.mon in the game folder with it (keep a copy of the original).');
    }
    c.original = bytes;
    c.dirty = false;
    render();
  }

  function markDirty() {
    if (state.view === 'creatures-templates' && state.creatureFile) state.creatureFile.dirty = true;
    else if (state.view === 'items-templates' && state.itemFile) state.itemFile.dirty = true;
    else state.dirty = true;
  }

  // Line tables keep each line's original bytes, so only edited or added lines are encoded again when
  // the file is written. Lines are split on LF bytes, which never occur inside a double-byte character.
  function editableLines(bytes) {
    const lines = [];
    const raw = [];
    let start = 0;
    for (let i = 0; i <= bytes.length; i += 1) {
      if (i === bytes.length || bytes[i] === 0x0A) {
        const part = bytes.slice(start, i);
        raw.push(part);
        lines.push(PorBytes.Codec.decode(part));
        start = i + 1;
      }
    }
    const index = [];
    lines.forEach((l, i) => { if (l.replace(/\r$/, '') !== '') index.push(i); });
    return { lines, raw, index, bytes, dirty: false };
  }
  function copyLines(t) {
    return { lines: t.lines.slice(), raw: t.raw.slice(), index: t.index.slice(), bytes: t.bytes, dirty: t.dirty };
  }
  function lineText(t, n) {
    if (!t) return null;
    const i = t.index[n];
    if (i === undefined) return null;
    return (t.raw[i] ? PorBytes.Codec.decode(t.raw[i]) : t.lines[i]).replace(/\r$/, '');
  }
  function setLineText(t, n, text) {
    const i = t.index[n];
    if (i === undefined) throw new Error('line ' + n + ' does not exist');
    if (/[\r\n]/.test(text)) throw new Error('names cannot contain line breaks');
    if (!text) throw new Error('names cannot be empty');
    t.lines[i] = text + (t.lines[i].endsWith('\r') ? '\r' : '');
    t.raw[i] = null;
    t.dirty = true;
  }
  // Adds a line after the last one and returns its line number.
  function appendLine(t, text) {
    const crlf = t.lines.some((l) => l.endsWith('\r'));
    const entry = text + (crlf ? '\r' : '');
    const endsWithBreak = t.lines.length > 0 && t.lines[t.lines.length - 1] === '';
    let at;
    if (endsWithBreak) { at = t.lines.length - 1; t.lines.splice(at, 0, entry); t.raw.splice(at, 0, null); }
    else { t.lines.push(entry); t.raw.push(null); at = t.lines.length - 1; }
    t.index.push(at);
    t.dirty = true;
    return t.index.length - 1;
  }
  function linesBytes(t) {
    const parts = t.lines.map((l, i) => t.raw[i] || PorBytes.Codec.encode(l));
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0) + Math.max(0, parts.length - 1));
    let at = 0;
    parts.forEach((p, i) => {
      if (i) { out[at] = 0x0A; at += 1; }
      out.set(p, at);
      at += p.length;
    });
    return out;
  }

  async function openItemsFromGameDir() {
    const dir = state.gameDir;
    if (!dir) {
      if (!state.assets) return;
      const trs = await state.assets.read('TEE.trs');
      if (!trs) { toast('TEE.trs was not found in the game folder.', 'error'); return; }
      const str = await state.assets.read('str/TEE.str');
      await setItemFile(trs, str, 'from the game folder (edits are downloaded)', null);
      return;
    }
    try {
      const data = await findEntry(dir, 'data');
      const base = data && data.kind === 'directory' ? data : dir;
      const trs = await findEntry(base, 'TEE.trs');
      if (!trs) { toast('TEE.trs was not found in the game folder.', 'error'); return; }
      let names = null;
      let namesHandle = null;
      const str = await findEntry(base, 'str');
      if (str && str.kind === 'directory') {
        namesHandle = await findEntry(str, 'tee.str');
        if (namesHandle) names = await readFile(await namesHandle.getFile());
      }
      await setItemFile(await readFile(await trs.getFile()), names, 'from the game folder',
        { dir: base, handle: trs, namesDir: str, namesHandle });
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  // namesBytes is TEE.str, or null when it was not opened.
  async function setItemFile(bytes, namesBytes, source, location) {
    let model;
    try { model = G.parseItemFile(bytes); } catch (error) { toast(error.message, 'error'); return; }
    if (namesBytes) await detectEncoding([{ read: async () => namesBytes }]);
    const names = namesBytes ? editableLines(namesBytes) : null;
    state.itemFile = { model, names, original: bytes, originalNames: namesBytes, source, location: location || null, dirty: false };
    state.sel.itSel = 0;
    rebuildDatalists();
    go('items-templates');
  }

  async function saveItemFile(forceDownload) {
    const c = state.itemFile;
    const bytes = G.serializeItemFile(c.model);
    const nameBytes = c.names && c.names.dirty ? linesBytes(c.names) : null;
    let wrote = false;
    if (c.location && !forceDownload) {
      try {
        const loc = c.location;
        if (loc.dir.requestPermission && (await loc.dir.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('permission to write was not given');
        const name = loc.handle.name;
        if (!(await fileExists(loc.dir, name + '.bak'))) await writeFile(loc.dir, name + '.bak', c.original);
        await writeFile(loc.dir, name, bytes);
        if (nameBytes && loc.namesHandle) {
          const sn = loc.namesHandle.name;
          if (!(await fileExists(loc.namesDir, sn + '.bak'))) await writeFile(loc.namesDir, sn + '.bak', c.originalNames);
          await writeFile(loc.namesDir, sn, nameBytes);
        }
        wrote = true;
        toast('Saved the item catalog to the game folder (first originals kept as .bak).');
      } catch (error) {
        toast('Could not write to the game folder (' + error.message + '); downloading instead.', 'error');
      }
    }
    if (!wrote) {
      download('TEE.trs', bytes);
      if (nameBytes) setTimeout(() => download('TEE.str', nameBytes), 400);
      toast('Downloaded TEE.trs' + (nameBytes ? ' and TEE.str' : '') + '. Put them in data/ and data/str/ of the game folder (keep copies of the originals).');
    }
    c.original = bytes;
    if (nameBytes) { c.originalNames = nameBytes; c.names.dirty = false; }
    c.dirty = false;
    render();
  }

  function itemTemplateName(i) {
    const c = state.itemFile;
    const rec = c.model.items[i];
    return (c.names && lineText(c.names, rec.i32(0x06))) || state.game.itemName(i) || 'Item ' + i;
  }

  const descriptorNames = (lo, hi) => bitNames(T.DESCRIPTOR_LO_BITS, lo).concat(bitNames(T.DESCRIPTOR_HI_BITS, hi));

  // What an item effect does, worked out from its numbers (the stored description is only a label).
  function effectText(fx) {
    const parts = [];
    const add = (v, what) => { if (v) parts.push(signed(v) + ' ' + what); };
    add(fx.i8(0x0C), 'to attack');
    add(fx.i8(0x0D), 'damage');
    if (fx.u8(0x0E) > 1) parts.push('damage x' + fx.u8(0x0E));
    add(fx.i8(0x0F), 'armour class');
    const sv = [fx.i8(0x10), fx.i8(0x11), fx.i8(0x12)];
    if (sv[0] && sv[0] === sv[1] && sv[1] === sv[2]) add(sv[0], 'to all saves');
    else { add(sv[0], 'Fortitude'); add(sv[1], 'Reflex'); add(sv[2], 'Will'); }
    const ab = fx.u8(0x13);
    if (ab < 6) add(fx.i8(0x14), T.ABILITY_NAMES[ab]);
    add(fx.i8(0x15), 'initiative');
    if (fx.u8(0x16)) parts.push('spell resistance ' + fx.u8(0x16));
    const spell = fx.i16(0x1A);
    const src = fx.u8(0x1D);
    if (spell >= 0 && src !== 255) {
      const name = src === 0 ? label.spell(spell) : src === 1 ? label.divine(spell) : label.special(spell);
      parts.push('casts ' + name + ' (caster level ' + fx.u8(0x19) + ')');
    }
    let text = parts.length ? parts.join(', ') : 'no rule of its own (the description is a label; the item\'s fields carry the rule)';
    const bt = fx.u8(0x1C);
    if (bt && parts.length) text += ' - ' + (bt === 2 ? 'enhancement' : bt === 6 ? 'luck' : 'type ' + bt) + ' bonus';
    const cond = descriptorNames(fx.u32(0x04), fx.u32(0x08));
    if (cond.length) text += '; only against: ' + cond.join(', ');
    return text;
  }

  function itemEffectSummary(id) {
    if (id === -1) return 'none';
    const c = state.itemFile;
    if (!c || id < 0) return '';
    const fx = c.model.effects[id];
    if (!fx) return 'no such effect';
    const d = lineText(c.names, fx.i32(0));
    return (d ? d + ': ' : '') + effectText(fx);
  }

  function itemSummary(r) {
    const type = r.i16(0);
    const parts = [(T.ITEM_TYPES.find(([v]) => v === type) || [0, 'type ' + type])[1].replace(/^\d+ - /, '')];
    if (r.u8(0x21)) {
      const kinds = bitNames(T.DAMAGE_TYPE_BITS, r.u8(0x1F)).map((n) => n.toLowerCase());
      parts.push(label.dice(r.u8(0x21), r.u8(0x20), r.u8(0x22)) + (kinds.length ? ' ' + kinds.join('/') : '')
        + (r.u8(0x23) && r.u8(0x23) < 20 ? ', threat ' + r.u8(0x23) + '-20' : '') + (r.u8(0x24) > 1 ? ' x' + r.u8(0x24) : ''));
    }
    if ((type === 4 || type === 5) && r.i8(0x2B)) parts.push('armour class ' + signed(r.i8(0x2B)));
    parts.push(r.u32(0x12) + ' gold', 'weight ' + r.i16(0x16), r.u8(0x19) + 'x' + r.u8(0x18) + ' cells');
    return parts.join(', ');
  }

  function viewItemTemplates() {
    const intro = 'Item templates define every item in the game: names, value, weight, size, where it is worn, who can use it, damage, '
      + 'armour values, charges and magical effects. They live in the game\'s data/TEE.trs (names in data/str/TEE.str), not in a save. '
      + 'The game reads them live, so a change affects that item in every game played with this installation, including copies already in saves.';
    const c = state.itemFile;
    if (!c) {
      return page('Item templates', intro,
        section('Open the item catalog',
          h('p', null, 'Open ', h('code', null, 'data/TEE.trs'), ' (and ', h('code', null, 'data/str/TEE.str'), ' to see and edit names) from your game folder.'),
          h('div', { class: 'row' },
            state.gameDir || state.assets ? button('Open from the loaded game folder', openItemsFromGameDir, 'primary') : null,
            button('Open TEE.trs...', () => $('tee-input').click(), state.gameDir || state.assets ? '' : 'primary'))),
        section('Before editing', h('ul', null,
          h('li', null, 'Keep copies of TEE.trs and TEE.str. When writing into the game folder the editor keeps the first originals as .bak files.'),
          h('li', null, 'Saves refer to items by number. Removing or reordering items would break existing saves, so the editor only edits and adds.'))));
    }
    const tab = state.sel.itTab || 'items';
    const tabs = h('div', { class: 'tabs sub' }, [['items', 'Items (' + c.model.items.length + ')'], ['sets', 'Equipment sets (' + c.model.sets.length + ')']].map(([k, t]) => h('button', {
      class: 'tab' + (k === tab ? ' active' : ''), onclick: () => { state.sel.itTab = k; render(); },
    }, t)));
    const head = h('div', { class: 'row' },
      button(c.location ? 'Save to game folder' : 'Download TEE.trs', () => saveItemFile(false), 'primary'),
      c.location ? button('Download copy', () => saveItemFile(true)) : null,
      button('Close file', () => { state.itemFile = null; rebuildDatalists(); render(); }),
      h('span', { class: c.dirty ? 'warn' : 'muted' }, c.dirty ? 'Unsaved item changes' : c.source));
    return page('Item templates', intro, head, tabs, tab === 'sets' ? equipSetEditor(c) : itemEditor(c));
  }

  function itemEditor(c) {
    const list = c.model.items;
    if (state.sel.itSel === undefined || state.sel.itSel >= list.length) state.sel.itSel = 0;
    const search = h('input', { type: 'search', class: 'in-text', placeholder: 'Filter by name or number', value: state.sel.itFilter || '' });
    const listHost = h('div', { class: 'split-list' });
    const renderList = () => {
      const f = (state.sel.itFilter || '').toLowerCase();
      const rows = [];
      list.forEach((r, i) => {
        const n = itemTemplateName(i);
        if (f && !(i + ' ' + n).toLowerCase().includes(f)) return;
        rows.push(h('tr', { class: 'clickable' + (state.sel.itSel === i ? ' selected' : ''), onclick: () => { state.sel.itSel = i; render(); } },
          h('td', { class: 'icon-cell' }, iconImg(r.i32(0x0E), 'item-icon tiny')), h('td', null, String(i)), h('td', null, n), h('td', { class: 'num' }, String(r.u32(0x12)))));
      });
      clear(listHost).appendChild(table(['', '#', 'Item', 'Value'], rows, { compact: true }));
    };
    search.addEventListener('input', () => { state.sel.itFilter = search.value; renderList(); });
    renderList();
    const i = state.sel.itSel;
    const r = list[i];
    const ictx = ctx({ onChange: () => render() });
    const lineRow = (labelText, n, help) => {
      const text = lineText(c.names, n);
      if (text === null) return [tipLabel(labelText, 'Open data/str/TEE.str as well to edit text.'), h('div', { class: 'field-value muted' }, c.names ? 'line ' + n + ' not found' : 'line ' + n)];
      const input = h('input', { type: 'text', class: 'in-text wide', value: text });
      input.addEventListener('change', () => {
        try { commit(() => setLineText(c.names, n, input.value), { rerender: true }); } catch (error) { toast(error.message, 'error'); input.value = text; }
      });
      return [tipLabel(labelText, (help ? help + '\n' : '') + 'Line ' + n + ' of TEE.str. Everything else using the same line changes too.'), h('div', { class: 'field-value' }, input)];
    };
    const type = r.i16(0);
    const fieldsOf = (g) => T.ITEM_TEMPLATE_FIELDS.filter((f) => f.group === g);
    const weaponish = [1, 2, 3, 6].includes(type) || r.u8(0x21) > 0;
    const armourish = [4, 5].includes(type) || r.i8(0x2B) || r.u8(0x2E) || r.i8(0x2F) || r.i8(0x30) || r.i8(0x31) !== -1;
    const usersOf = (effectId) => list.filter((x) => [0, 1, 2].some((k) => x.i16(0x38 + k * 2) === effectId)).length;
    const effects = [];
    for (let k = 0; k < 3; k += 1) {
      const id = r.i16(0x38 + k * 2);
      if (id < 0 || id >= c.model.effects.length) continue;
      const fx = c.model.effects[id];
      const users = usersOf(id);
      effects.push(section('Effect ' + id + (lineText(c.names, fx.i32(0)) ? ': ' + lineText(c.names, fx.i32(0)) : ''),
        h('p', { class: 'effect-text' }, effectText(fx)),
        users > 1 ? h('p', { class: 'warn' }, 'Shared: ' + users + ' items use effect ' + id + ', and they all change together.') : null,
        h('div', { class: 'fields' }, lineRow('Description', fx.i32(0), 'Shown in the item\'s tooltip.')),
        fieldGrid(fx, T.ITEM_EFFECT_FIELDS, ictx),
        h('details', null, h('summary', null, 'Raw effect bytes'), hexEditor(fx.bytes, { commit: (fn) => commit(fn, { rerender: true }) }))));
    }
    const freeSlot = [0, 1, 2].find((k) => r.i16(0x38 + k * 2) < 0);
    const newEffect = () => commit(() => {
      const fx = PorBytes.Block.zero(30);
      fx.setI32(0, appendLine(c.names, 'New effect'));
      fx.setU8(0x13, 255);
      fx.setI16(0x1A, -1);
      fx.setU8(0x1D, 255);
      c.model.effects.push(fx);
      r.setI16(0x38 + freeSlot * 2, c.model.effects.length - 1);
    }, { rerender: true });
    const duplicate = () => commit(() => {
      const copy = r.clone();
      const newId = list.length;
      copy.setU16(0x46, newId);
      if (c.names) {
        const base = lineText(c.names, r.i32(0x02));
        const full = lineText(c.names, r.i32(0x06));
        if (base !== null) copy.setI32(0x02, appendLine(c.names, base + ' (copy)'));
        if (full !== null) copy.setI32(0x06, r.i32(0x06) === r.i32(0x02) ? copy.i32(0x02) : appendLine(c.names, full + ' (copy)'));
      }
      list.push(copy);
      state.sel.itSel = newId;
    }, { rerender: true });
    const iconBig = iconImg(r.i32(0x0E), 'item-icon big');
    return h('div', { class: 'split' }, h('div', null, h('div', { class: 'row' }, search), listHost),
      h('div', { class: 'split-detail' },
        section(itemTemplateName(i) + ' (item ' + i + ')',
          h('div', { class: 'item-head' }, iconBig, h('div', null,
            h('p', null, itemSummary(r)),
            T.ICON_RULES[r.i32(0x0E)] ? h('p', { class: 'muted' }, 'Picture rule: ' + T.ICON_RULES[r.i32(0x0E)]) : null)),
          h('div', { class: 'fields' }, lineRow('Identified name', r.i32(0x06), 'The true name, shown once the item is identified.'),
            lineRow('Unidentified name', r.i32(0x02), 'The plain name shown before the item is identified.')),
          h('div', { class: 'row' }, button('Duplicate as a new item', duplicate, '', { title: 'Adds a copy at the end of the catalog with its own names. Saves can then hold the new item by its number.' }))),
        section('Basics', fieldGrid(r, fieldsOf('basic'), ictx)),
        section('Who can use it', fieldGrid(r, fieldsOf('use'), ictx)),
        section('Weapon' + (weaponish ? '' : ' (not used by this item type)'), fieldGrid(r, fieldsOf('weapon'), ictx)),
        section('Armour and movement' + (armourish ? '' : ' (not used by this item type)'), fieldGrid(r, fieldsOf('armour'), ictx)),
        section('Charges and effects', fieldGrid(r, fieldsOf('charges'), ictx),
          freeSlot !== undefined ? button('Add a new effect', newEffect, '', {
            disabled: !c.names,
            title: c.names ? 'Creates a new effect record and puts it in the first empty effect position of this item.'
              : 'Open data/str/TEE.str together with TEE.trs to add effects: each effect needs its own description line.',
          }) : null),
        effects,
        section('Raw record', hexEditor(r.bytes, { commit: (fn) => commit(fn, { rerender: true }) }))));
  }

  const SET_SLOT_FIELDS = [];
  for (let k = 0; k < T.EQUIP_SET_SLOTS; k += 1) {
    SET_SLOT_FIELDS.push([
      { k: 'item' + k, label: 'Item', o: 2 + k * 6, t: 'i16', enumOf: 'setItem', help: 'An item number, -1 for an empty slot or -2 for gold.' },
      { k: 'min' + k, label: 'Minimum', o: 4 + k * 6, t: 'u16' },
      { k: 'max' + k, label: 'Maximum (exclusive)', o: 6 + k * 6, t: 'u16' },
    ]);
  }

  function setContents(b) {
    const parts = [];
    for (let k = 0; k < T.EQUIP_SET_SLOTS; k += 1) {
      const item = b.i16(2 + k * 6);
      if (item === -1) continue;
      const min = b.u16(4 + k * 6);
      const max = b.u16(6 + k * 6);
      const qty = max > min ? min + '-' + (max - 1) : String(min);
      parts.push(item === -2 ? qty + ' gold' : (qty !== '1' ? qty + ' x ' : '') + (state.itemFile && state.itemFile.model.items[item] ? itemTemplateName(item) : label.item(item)));
    }
    return parts.join(', ') || 'empty';
  }

  function equipSetEditor(c) {
    const sets = c.model.sets;
    if (state.sel.esSel === undefined || state.sel.esSel >= sets.length) state.sel.esSel = 0;
    const search = h('input', { type: 'search', class: 'in-text', placeholder: 'Filter by number or item', value: state.sel.esFilter || '' });
    const listHost = h('div', { class: 'split-list' });
    const renderList = () => {
      const f = (state.sel.esFilter || '').toLowerCase();
      const rows = [];
      sets.forEach((b, i) => {
        const text = setContents(b);
        if (f && !(b.u16(0) + ' ' + text).toLowerCase().includes(f)) return;
        rows.push(h('tr', { class: 'clickable' + (state.sel.esSel === i ? ' selected' : ''), onclick: () => { state.sel.esSel = i; render(); } },
          h('td', { class: 'mono' }, String(b.u16(0))), h('td', null, text.length > 70 ? text.slice(0, 70) + '...' : text)));
      });
      clear(listHost).appendChild(table(['Set', 'Contents'], rows, { compact: true }));
    };
    search.addEventListener('input', () => { state.sel.esFilter = search.value; renderList(); });
    renderList();
    const b = sets[state.sel.esSel];
    const sctx = ctx({ inline: true, onChange: () => render() });
    const labels = new Map();
    for (const x of sets) labels.set(x.u16(0), (labels.get(x.u16(0)) || 0) + 1);
    const rows = SET_SLOT_FIELDS.map((fields, k) => {
      const item = b.i16(2 + k * 6);
      const min = b.u16(4 + k * 6);
      const max = b.u16(6 + k * 6);
      const meaning = item === -1 ? 'empty' : (max > min ? 'random ' + min + ' to ' + (max - 1) : 'exactly ' + min) + (item === -2 ? ' gold, shared among the living party' : '');
      return h('tr', null, h('td', null, String(k)), fields.map((f) => h('td', { title: f.help || null }, fieldGrid(b, [f], sctx))), h('td', { class: 'muted' }, meaning));
    });
    const addSet = () => commit(() => {
      const nb = PorBytes.Block.zero(T.EQUIP_SET_SIZE);
      let next = 1;
      for (const x of sets) next = Math.max(next, x.u16(0) + 1);
      nb.setU16(0, Math.min(next, 0xFFFF));
      for (let k = 0; k < T.EQUIP_SET_SLOTS; k += 1) nb.setI16(2 + k * 6, -1);
      sets.push(nb);
      state.sel.esSel = sets.length - 1;
    }, { rerender: true });
    return h('div', { class: 'split' }, h('div', null, h('div', { class: 'row' }, search, button('Add a set', addSet, '', { title: 'Adds an empty set with the next free number.' })), listHost),
      h('div', { class: 'split-detail' },
        section('Equipment set ' + b.u16(0),
          h('p', { class: 'muted' }, 'An equipment set is a loot table. Chests, placed treasure, broken containers, scripts that award treasure and creatures '
            + 'placed by random dungeons find their set by this number. Each slot gives an item and a quantity: the minimum when the maximum is not larger, '
            + 'otherwise a random number from the minimum up to one below the maximum. Creatures receive one of each item.'),
          fieldGrid(b, [{ k: 'label', label: 'Set number', o: 0, t: 'u16', help: 'Treasure, containers and creatures refer to the set by this number. It must be unique.' }], ctx({ onChange: () => render() })),
          labels.get(b.u16(0)) > 1 ? h('p', { class: 'warn' }, 'Another set has the same number; the game uses the first one it finds.') : null,
          table(['Slot', 'Item', 'Minimum', 'Maximum (exclusive)', 'Meaning'], rows, { compact: true })),
        section('Raw record', hexEditor(b.bytes, { commit: (fn) => commit(fn, { rerender: true }) }))));
  }

  function bundledGame() {
    if (!state.bundled) state.bundled = G.GameData.fromBundle(window.PorBundledData || null);
    return state.bundled;
  }

  function disclosure() {
    return section('Disclosure',
      h('ul', { class: 'disclosure' },
        h('li', null, h('strong', null, 'Unofficial. '), 'This is a fan-made tool. It is not affiliated with, endorsed by or approved by the '
          + 'developers or publishers of Pool of Radiance: Ruins of Myth Drannor.'),
        h('li', null, h('strong', null, 'Made with Claude. '), 'It was created with Claude, an AI model made by Anthropic, by reverse engineering '
          + 'the current release of the game (patch 1.4). No source code for the game was available or used. Its understanding of the save '
          + 'files and game data may be incomplete or wrong, and it may not function correctly.'),
        h('li', null, h('strong', null, 'No support. '), 'It is provided as is. Questions, bug reports and requests may go unanswered, and no '
          + 'fixes or updates are promised.'),
        h('li', null, h('strong', null, 'Future updates. '), 'We do not know whether it will continue to work with future updates or other releases '
          + 'of the game. A game update may change the files it reads and writes.'),
        h('li', null, h('strong', null, 'Use at your own risk. '), 'Keep backups of your saves and of any game file you edit.'),
        h('li', null, h('strong', null, 'Your own versions. '), 'You are free to fork the editor, change it and publish your own versions.'),
        h('li', null, h('strong', null, 'License. '), 'The editor\'s code is released under the MIT license (see LICENSE). We ask that it not be '
          + 'used commercially, and that the source code stays available with any copy you share. The built-in item, creature, '
          + 'conversation and area data and item pictures are extracted from the game\'s files and belong to their rights holders; '
          + 'they are not covered by the MIT license. Models are read from your own game folder and are not included.')));
  }

  // ---- boot -----------------------------------------------------------------------------------

  function boot() {
    $('btn-open').addEventListener('click', () => $('file-input').click());
    $('btn-folder').addEventListener('click', openSavesFolder);
    $('btn-game').addEventListener('click', loadGameFolder);
    $('btn-undo').addEventListener('click', undo);
    $('btn-redo').addEventListener('click', redo);
    $('btn-save').addEventListener('click', () => saveOut(false));
    $('btn-download').addEventListener('click', () => saveOut(true));
    $('file-input').addEventListener('change', (ev) => { openFiles(ev.target.files); ev.target.value = ''; });
    $('sta-input').addEventListener('change', (ev) => { openFiles(ev.target.files); ev.target.value = ''; });
    $('folder-input').addEventListener('change', async (ev) => {
      const files = Array.from(ev.target.files).map((f) => ({ name: f.name, getFile: async () => f }));
      ev.target.value = '';
      await listFolder(files, null);
    });
    $('game-input').addEventListener('change', async (ev) => {
      const { assets, files } = folderInputGame(Array.from(ev.target.files));
      ev.target.value = '';
      if (await applyGameFiles(files, assets)) state.gameDir = null;
    });
    $('tee-input').addEventListener('change', async (ev) => {
      const files = Array.from(ev.target.files);
      ev.target.value = '';
      const trs = files.find((f) => /\.trs$/i.test(f.name));
      if (!trs) { toast('Choose TEE.trs (and optionally TEE.str).', 'error'); return; }
      const str = files.find((f) => /\.str$/i.test(f.name));
      await setItemFile(await readFile(trs), str ? await readFile(str) : null, 'opened from ' + trs.name, null);
    });
    $('mon-input').addEventListener('change', async (ev) => {
      const files = Array.from(ev.target.files);
      ev.target.value = '';
      const mon = files.find((f) => /\.mon$/i.test(f.name));
      if (!mon) { toast('Choose monsters.mon (and optionally monsters.str).', 'error'); return; }
      const str = files.find((f) => /\.str$/i.test(f.name));
      await setCreatureFile(await readFile(mon), str ? await readFile(str) : null, 'opened from ' + mon.name, null);
    });
    const enc = $('encoding');
    enc.addEventListener('change', async () => {
      state.encodingChosen = true;
      await setEncoding(enc.value);
    });
    document.addEventListener('dragover', (ev) => { ev.preventDefault(); document.body.classList.add('dragging'); });
    document.addEventListener('dragleave', (ev) => { if (ev.target === document.documentElement || ev.target === document.body) document.body.classList.remove('dragging'); });
    document.addEventListener('drop', (ev) => {
      ev.preventDefault();
      document.body.classList.remove('dragging');
      if (ev.dataTransfer && ev.dataTransfer.files.length) openFiles(ev.dataTransfer.files);
    });
    document.addEventListener('keydown', (ev) => {
      if (!(ev.ctrlKey || ev.metaKey)) return;
      const k = ev.key.toLowerCase();
      if (k === 's') {
        ev.preventDefault();
        if (state.view === 'creatures-templates' && state.creatureFile) saveCreatureFile(false);
        else if (state.view === 'items-templates' && state.itemFile) saveItemFile(false);
        else saveOut(false);
      }
      else if (k === 'z' && !ev.shiftKey) { if (ev.target.tagName !== 'INPUT' && ev.target.tagName !== 'TEXTAREA') { ev.preventDefault(); undo(); } }
      else if (k === 'y' || (k === 'z' && ev.shiftKey)) { if (ev.target.tagName !== 'INPUT' && ev.target.tagName !== 'TEXTAREA') { ev.preventDefault(); redo(); } }
    });
    window.addEventListener('beforeunload', (ev) => {
      if (state.dirty || (state.creatureFile && state.creatureFile.dirty) || (state.itemFile && state.itemFile.dirty)) { ev.preventDefault(); ev.returnValue = ''; }
    });
    if (!window.showDirectoryPicker) $('fs-note').textContent = 'This browser downloads edited files; Chrome and Edge can also write them straight into a folder.';
    state.game = bundledGame();
    rebuildDatalists();
    render();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
