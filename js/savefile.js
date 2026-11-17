// Version-37 Pool of Radiance: Ruins of Myth Drannor save container (.sav): parse, edit and rebuild.
// Every byte the editor does not model is kept as read, so an unedited save rebuilds byte-identical.
(function (root) {
  'use strict';

  const B = root.PorBytes || require('./bytes.js');
  const { FormatError, Block, Reader, Writer, hex, Codec } = B;

  const SAVE_VERSION = 37;
  const HEADER_SIZE = 0x58;
  const NAME_SIZE = 80;
  const DIALOGUE_SLOTS = 1500;
  const WORLD_VAR_COUNT = 1500;
  const ROSTER_COUNT = 22;
  const ROSTER_SIZE = 0x60;
  const NAMED_STATE_SIZE = 0x14;
  const MP_WORLD_SIZE = 84;
  const MAP_HEADER_SIZE = 0x20;
  const MAP_PIN_SIZE = 0x108;
  const MAP_OBJECT_SIZE = 0x28;
  const TILE_VISIT_BYTES = 16;          // every shipped area uses a 4x4 visited sub-grid per map tile
  const MAX_MAP_RECORDS = 46;
  const ACTOR_SIZE = 0x84;
  const DND_SIZE = 0x40;
  const INV_NODE_SIZE = 0x10;
  const EQUIP_SIZE = 8;
  const EFFECT_SIZE = 0xB4;
  const MAX_EFFECTS = 10;
  const PC_SIZE = 0x150;
  const MONSTER_SIZE = 0x7C;
  const OBJECT_SIZE = 0xBC;
  const TREASURE_SIZE = 0x34;
  const ACTOR_LIST_SIZE = 0x14;
  const LEVEL_ARRAY_COUNT = 46;
  const GAME_MASTER_SIZE = 0x3EC;
  const GROUP_HEADER_SIZE = 0x10;
  const FOLLOWER_SIZE = 0x10;
  const PARTY_CAPACITY = 6;
  const PARTY_HANDLE_MIN = 200000000;
  const PARTY_HANDLE_MAX = 300000000;
  const MAX_LIST = 4096;
  const MAX_PAGES = 1024;
  const GRID_ROWS = 7;
  const GRID_COLS = 14;
  const CLASS_SLOTS = 8;
  const UNUSED_CLASS_ID = 50;
  const KNOWN_SPELL_CAPACITY = 43;

  // Offsets inside the fixed records.
  const OFF = {
    headerVersion: 0x50, headerEntityCount: 0x54,
    actorType: 0x50, actorHandle: 0x54, actorPos: 0x5C, actorHeading: 0x68,
    dndMaxHp: 0x00, dndCurHp: 0x04, dndArcaneUsed: 0x10, dndDivineUsed: 0x1A,
    dndInvCount: 0x24, dndFxCount: 0x28,
    pcRace: 0x03, pcClassCount: 0x06, pcClassIds: 0x09, pcClassLevels: 0x11, pcDailyUses: 0x19,
    pcAbilities: 0x23, pcSkills: 0x29, pcFeats: 0x38, pcClassFeatures: 0x3C, pcGold: 0x40, pcXp: 0x44,
    pcKnownSpells: 0x48, pcKnownSpellCount: 0x9E,
    nodeEquipped: 0x04, nodeHidden: 0x05, nodeSlotMask: 0x06, nodeRow: 0x08, nodeCol: 0x09, nodePage: 0x0A,
    equipTemplate: 0x00, equipCharges: 0x02, equipHandle: 0x04, equipIdentified: 0x06,
    treasureItemCount: 0x08, treasureGold: 0x0C,
    namedKind: 0x04, namedName: 0x05, namedState: 0x0D,
    mapLevel: 0x00, mapVisited: 0x07, mapGridX: 0x10, mapGridY: 0x14, mapPinCount: 0x18, mapObjectCount: 0x1C,
    gmRestEnabled: 0x00, gmRestSafe: 0x04, gmRestEncA: 0x08, gmRestMarkers: 0x30, gmRestEncB: 0x34,
    gmPendingCount: 0x5C, gmPending: 0x60, gmEncounters: 0x380, gmPartyCount: 0x3D0, gmParty: 0x3D4,
    alCurrent: 0x00, alSpecial: 0x0C, alArrival: 0x10,
    groupLeader: 0x00, groupFollowers: 0x04,
    rosterDead: 0x50,
  };

  function check(condition, message) {
    if (!condition) throw new FormatError(message);
  }

  // ---- conversation registry ----------------------------------------------------------------

  // Returns the end offset of one serialized conversation context starting at `at`.
  function conversationEnd(bytes, at) {
    const end = bytes.length;
    const need = (c, n, what) => check(c + n <= end, 'conversation record ' + what + ' runs past the end of the file');
    need(at, 1, 'marker');
    const marker = bytes[at];
    let c = at + 1;
    if (marker === 0xFF) return { end: c, present: false, name: '' };
    check(marker === 0, 'conversation record at ' + hex(at) + ' has an invalid presence byte');
    const limit = Math.min(end, c + 4096);
    let term = -1;
    for (let i = c; i < limit; i += 1) if (bytes[i] === 0) { term = i; break; }
    check(term >= 0, 'conversation name at ' + hex(at) + ' is not terminated');
    const name = Codec.decode(bytes.subarray(c, term));
    c = term + 1;
    need(c, 2 + 5 + 150, 'header');
    c += 2 + 5 + 150;
    for (let i = 0; i < 100; i += 1) {
      need(c, 1, 'node chain');
      const count = bytes[c++];
      if (count === 0xFF) continue;
      need(c, count * 2, 'node chain');
      c += count * 2;
    }
    for (let i = 0; i < 150; i += 1) {
      need(c, 1, 'completed-node list');
      c += bytes[c] === 0xFF ? 1 : 3;
    }
    need(c, 150, 'working nodes');
    c += 150;
    for (let i = 0; i < 50; i += 1) {
      need(c, 1, 'hook list');
      const count = bytes[c++];
      need(c, count * 2, 'hook list');
      c += count * 2;
    }
    return { end: c, present: true, name };
  }

  // ---- entities ------------------------------------------------------------------------------

  function readInventory(r, count) {
    const items = [];
    for (let i = 0; i < count; i += 1) {
      items.push({ node: r.block(INV_NODE_SIZE, 'inventory node'), equip: r.block(EQUIP_SIZE, 'item record') });
    }
    return items;
  }

  function readActor(r, expectedType) {
    const base = r.block(ACTOR_SIZE, 'actor record');
    check(base.u32(OFF.actorType) === expectedType,
      'actor record type ' + base.u32(OFF.actorType) + ' does not match entity tag ' + expectedType);
    const nextPageId = r.u32('inventory pages');
    const pageCount = r.u32('inventory pages');
    check(pageCount <= MAX_PAGES, 'implausible inventory page count ' + pageCount);
    const pageIds = [];
    for (let i = 0; i < pageCount; i += 1) pageIds.push(r.u32('inventory page id'));
    const dnd = r.block(DND_SIZE, 'character state');
    const invCount = dnd.i32(OFF.dndInvCount);
    const fxCount = dnd.u8(OFF.dndFxCount);
    check(invCount >= 0 && invCount <= MAX_LIST, 'implausible inventory count ' + invCount);
    check(fxCount <= MAX_EFFECTS, 'implausible effect count ' + fxCount);
    const items = readInventory(r, invCount);
    const effects = [];
    for (let i = 0; i < fxCount; i += 1) effects.push(r.block(EFFECT_SIZE, 'effect record'));
    return { base, paging: { nextPageId, pageIds }, dnd, items, effects };
  }

  function readEntity(r) {
    const start = r.pos;
    const tag = r.u32('entity tag');
    if (tag === 7) {
      const head = r.block(TREASURE_SIZE, 'treasure record');
      const count = head.i32(OFF.treasureItemCount);
      check(count >= 0 && count <= MAX_LIST, 'implausible treasure item count ' + count);
      return { tag, start, head, items: readInventory(r, count) };
    }
    let subtype = null;
    if (tag === 8) {
      subtype = r.u32('object kind');
      check(subtype <= 5, 'unknown object kind ' + subtype);
    }
    let size;
    if (tag === 2) size = PC_SIZE;
    else if (tag === 3 || tag === 4) size = MONSTER_SIZE;
    else if (tag === 8) size = OBJECT_SIZE;
    else throw new FormatError('unknown entity tag ' + tag + ' at ' + hex(start));
    const actor = readActor(r, tag);
    const data = r.block(size, 'entity record');
    return { tag, start, subtype, actor, data };
  }

  function writeEntity(w, e) {
    w.u32(e.tag);
    if (e.tag === 7) {
      e.head.setI32(OFF.treasureItemCount, e.items.length);
      w.block(e.head);
      for (const it of e.items) { w.block(it.node); w.block(it.equip); }
      return;
    }
    if (e.tag === 8) w.u32(e.subtype);
    const a = e.actor;
    w.block(a.base);
    w.u32(a.paging.nextPageId);
    w.u32(a.paging.pageIds.length);
    for (const id of a.paging.pageIds) w.u32(id);
    a.dnd.setI32(OFF.dndInvCount, a.items.length);
    a.dnd.setU8(OFF.dndFxCount, a.effects.length);
    w.block(a.dnd);
    for (const it of a.items) { w.block(it.node); w.block(it.equip); }
    for (const fx of a.effects) w.block(fx);
    w.block(e.data);
  }

  // ---- map records ---------------------------------------------------------------------------

  function readMaps(r) {
    const count = r.u32('map record count');
    check(count <= MAX_MAP_RECORDS, 'implausible map record count ' + count);
    const maps = [];
    for (let i = 0; i < count; i += 1) {
      const head = r.block(MAP_HEADER_SIZE, 'map record');
      const gx = head.i32(OFF.mapGridX);
      const gy = head.i32(OFF.mapGridY);
      const pinCount = head.i32(OFF.mapPinCount);
      const objCount = head.i32(OFF.mapObjectCount);
      check(gx >= 0 && gy >= 0 && pinCount >= 0 && objCount >= 0, 'negative count in map record');
      check(pinCount <= MAX_LIST && objCount <= MAX_LIST && gx * gy <= 65536, 'implausible map record size');
      const pins = [];
      for (let k = 0; k < pinCount; k += 1) pins.push(r.block(MAP_PIN_SIZE, 'map pin'));
      const objects = [];
      for (let k = 0; k < objCount; k += 1) objects.push(r.block(MAP_OBJECT_SIZE, 'map marker'));
      const tiles = r.take(gx * gy * TILE_VISIT_BYTES, 'map exploration');
      maps.push({ head, pins, objects, tiles });
    }
    return maps;
  }

  function readRegionFlags(r) {
    const count = r.u32('cleared-flag cell count');
    check(count <= r.remaining / 4, 'implausible cleared-flag cell count ' + count);
    const cells = [];
    for (let i = 0; i < count; i += 1) {
      const n = r.u32('cleared-flag cell');
      check(n <= r.remaining, 'cleared-flag cell overruns the file');
      cells.push(r.take(n));
    }
    return cells;
  }

  // ---- tail ----------------------------------------------------------------------------------

  function readLevelArrays(r) {
    const arrays = [];
    for (let i = 0; i < LEVEL_ARRAY_COUNT; i += 1) {
      const count = r.u32('area state array');
      check(count <= r.remaining / 4, 'implausible area state array count');
      const items = [];
      for (let k = 0; k < count; k += 1) {
        const len = r.u32('area state entry');
        check(len <= r.remaining, 'area state entry overruns the file');
        items.push(r.take(len));
      }
      arrays.push(items);
    }
    return arrays;
  }

  function readTail(r) {
    const actorList = r.block(ACTOR_LIST_SIZE, 'actor list');
    const levelArrays = readLevelArrays(r);
    const gameMaster = r.block(GAME_MASTER_SIZE, 'game master');
    const groupHead = r.block(GROUP_HEADER_SIZE, 'party group');
    const followerCount = groupHead.u32(OFF.groupFollowers);
    check(followerCount <= 64, 'implausible follower count ' + followerCount);
    const followers = [];
    for (let i = 0; i < followerCount; i += 1) followers.push(r.block(FOLLOWER_SIZE, 'follower'));
    check(r.remaining === 0, 'unexpected ' + r.remaining + ' bytes after the party group record');
    return { actorList, levelArrays, gameMaster, group: { head: groupHead, followers } };
  }

  // ---- parse ---------------------------------------------------------------------------------

  function readPrefix(bytes) {
    check(bytes.length >= HEADER_SIZE + 5, 'file is too short to be a save');
    const r = new Reader(bytes, 0);
    const header = r.block(HEADER_SIZE);
    const version = header.u32(OFF.headerVersion);
    check(version === SAVE_VERSION,
      'save format version ' + version + ' is not supported (this editor reads version ' + SAVE_VERSION + ', game patch 1.4)');
    const mapId = r.u32();
    const mp = r.u8();
    const save = { header, mapId, mp };
    if (mp) {
      save.mpWorld = r.block(MP_WORLD_SIZE, 'multiplayer world record');
    } else {
      save.conversations = [];
      for (let i = 0; i < DIALOGUE_SLOTS; i += 1) {
        const info = conversationEnd(bytes, r.pos);
        save.conversations.push({ raw: bytes.slice(r.pos, info.end), present: info.present, name: info.name });
        r.pos = info.end;
      }
      save.worldVars = r.block(WORLD_VAR_COUNT * 2, 'world variables');
      save.roster = [];
      for (let i = 0; i < ROSTER_COUNT; i += 1) save.roster.push(r.block(ROSTER_SIZE, 'NPC roster'));
    }
    save.time = r.block(4, 'time of day');
    save.options = r.block(4, 'options');
    const namedCount = r.u32('named state count');
    check(namedCount <= r.remaining / NAMED_STATE_SIZE, 'named state list overruns the file');
    save.namedStates = [];
    for (let i = 0; i < namedCount; i += 1) save.namedStates.push(r.block(NAMED_STATE_SIZE));
    return { save, r };
  }

  function readEntitiesExactly(bytes, start, end, count) {
    const r = new Reader(bytes.subarray(0, end), start);
    const entities = [];
    for (let i = 0; i < count; i += 1) entities.push(readEntity(r));
    check(r.pos === end, 'entity sequence does not end at the actor list');
    return entities;
  }

  function parseForward(bytes) {
    const { save, r } = readPrefix(bytes);
    save.maps = readMaps(r);
    save.regionFlags = readRegionFlags(r);
    const count = save.header.u32(OFF.headerEntityCount);
    check(count <= 100000, 'implausible entity count ' + count);
    save.entities = [];
    for (let i = 0; i < count; i += 1) save.entities.push(readEntity(r));
    Object.assign(save, readTail(r));
    save.recovered = false;
    return save;
  }

  // Locates the tail from the end of the file when the map section cannot be read forward. The
  // map and cleared-flag sections are then kept as one raw span.
  function parseFromTail(bytes) {
    const { save, r } = readPrefix(bytes);
    const prefixEnd = r.pos;
    const count = save.header.u32(OFF.headerEntityCount);
    const len = bytes.length;
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u32 = (o) => dv.getUint32(o, true);
    const candidates = [];
    for (let m = 0; m < 64; m += 1) {
      const groupOff = len - GROUP_HEADER_SIZE - FOLLOWER_SIZE * m;
      if (groupOff < prefixEnd) break;
      if (u32(groupOff + 4) !== m || bytes[groupOff + 8] > 1) continue;
      const gmOff = groupOff - GAME_MASTER_SIZE;
      if (gmOff < prefixEnd || u32(gmOff + OFF.gmPartyCount) > PARTY_CAPACITY) continue;
      for (let a = gmOff - 4 * LEVEL_ARRAY_COUNT - ACTOR_LIST_SIZE; a > prefixEnd; a -= 1) {
        let ok = true;
        for (let k = 4; k < 9; k += 1) if (bytes[a + k] > 1) { ok = false; break; }
        if (!ok) continue;
        const arrival = dv.getInt32(a + OFF.alArrival, true);
        if (arrival < -1 || arrival > 10000000) continue;
        try {
          const tr = new Reader(bytes.subarray(0, gmOff), a + ACTOR_LIST_SIZE);
          readLevelArrays(tr);
          if (tr.pos !== gmOff) continue;
        } catch (error) {
          continue;
        }
        candidates.push(a);
      }
    }
    for (const actorListOff of candidates) {
      for (let s = prefixEnd + 4; s <= actorListOff - (count ? 4 : 0); s += 1) {
        if (count && !(bytes[s] in { 2: 1, 3: 1, 4: 1, 7: 1, 8: 1 } && bytes[s + 1] === 0 && bytes[s + 2] === 0 && bytes[s + 3] === 0)) continue;
        if (!count && s !== actorListOff) continue;
        let entities;
        try {
          entities = readEntitiesExactly(bytes, s, actorListOff, count);
        } catch (error) {
          continue;
        }
        save.mapRegionRaw = bytes.slice(prefixEnd, s);
        save.entities = entities;
        const tr = new Reader(bytes, actorListOff);
        Object.assign(save, readTail(tr));
        save.recovered = true;
        return save;
      }
    }
    throw new FormatError('the save structure could not be located');
  }

  function parse(bytes) {
    let forwardError;
    try {
      return parseForward(bytes);
    } catch (error) {
      if (!(error instanceof FormatError)) throw error;
      forwardError = error;
    }
    try {
      const save = parseFromTail(bytes);
      save.recoveryReason = forwardError.message;
      return save;
    } catch (error) {
      throw forwardError;
    }
  }

  // ---- serialize -----------------------------------------------------------------------------

  function serialize(save, layout) {
    const w = new Writer();
    const section = (name, fn, detail) => {
      const start = w.length;
      fn();
      if (layout) layout.push({ name, start, end: w.length, detail });
    };
    section('Header', () => {
      save.header.setU32(OFF.headerEntityCount, save.entities.length);
      w.block(save.header);
    });
    section('Current area', () => w.u32(save.mapId));
    section('Mode', () => w.u8(save.mp));
    if (save.mp) {
      section('Multiplayer world', () => w.block(save.mpWorld));
    } else {
      section('Conversations', () => { for (const c of save.conversations) w.bytes(c.raw); });
      section('World variables', () => w.block(save.worldVars));
      section('NPC roster', () => { for (const b of save.roster) w.block(b); });
    }
    section('Time of day', () => w.block(save.time));
    section('Options', () => w.block(save.options));
    section('Named states', () => { w.u32(save.namedStates.length); for (const b of save.namedStates) w.block(b); });
    if (save.mapRegionRaw) {
      section('Maps and cleared flags (raw)', () => w.bytes(save.mapRegionRaw));
    } else {
      section('Maps', () => {
        w.u32(save.maps.length);
        for (const m of save.maps) {
          m.head.setI32(OFF.mapPinCount, m.pins.length);
          m.head.setI32(OFF.mapObjectCount, m.objects.length);
          w.block(m.head);
          for (const p of m.pins) w.block(p);
          for (const o of m.objects) w.block(o);
          w.bytes(m.tiles);
        }
      });
      section('Cleared flags', () => {
        w.u32(save.regionFlags.length);
        for (const cell of save.regionFlags) { w.u32(cell.length); w.bytes(cell); }
      });
    }
    section('Entities', () => {
      save.entities.forEach((e, i) => {
        const start = w.length;
        writeEntity(w, e);
        if (layout) layout.push({ name: 'Entity ' + i, start, end: w.length, entity: i, nested: true });
      });
    });
    section('Actor list', () => w.block(save.actorList));
    section('Area state arrays', () => {
      for (const items of save.levelArrays) {
        w.u32(items.length);
        for (const it of items) { w.u32(it.length); w.bytes(it); }
      }
    });
    section('Game master', () => w.block(save.gameMaster));
    section('Party group', () => {
      save.group.head.setU32(OFF.groupFollowers, save.group.followers.length);
      w.block(save.group.head);
      for (const f of save.group.followers) w.block(f);
    });
    return w.toBytes();
  }

  // ---- queries -------------------------------------------------------------------------------

  function displayName(save) { return save.header.str(0, NAME_SIZE); }
  function setDisplayName(save, name) { save.header.setStr(0, NAME_SIZE, name); }

  function entityHandle(e) { return e.actor ? e.actor.base.u32(OFF.actorHandle) : null; }
  function entityName(e) { return e.actor ? e.actor.base.str(0, NAME_SIZE) : ''; }

  function partyHandles(save) {
    const gm = save.gameMaster;
    const count = Math.min(gm.u32(OFF.gmPartyCount), PARTY_CAPACITY);
    const out = [];
    for (let i = 0; i < count; i += 1) out.push(gm.u32(OFF.gmParty + i * 4));
    return out;
  }

  function findEntity(save, handle) {
    return save.entities.find((e) => e.actor && entityHandle(e) === handle) || null;
  }

  function party(save) {
    return partyHandles(save).map((handle, index) => ({ index, handle, entity: findEntity(save, handle) }));
  }

  function isPartyHandle(save, handle) { return partyHandles(save).includes(handle); }

  // ---- edits: characters ---------------------------------------------------------------------

  function pcClasses(e) {
    const d = e.data;
    const count = Math.min(d.u8(OFF.pcClassCount), CLASS_SLOTS);
    const out = [];
    for (let i = 0; i < count; i += 1) {
      const id = d.u8(OFF.pcClassIds + i);
      out.push({ slot: i, id, level: id < CLASS_SLOTS ? d.u8(OFF.pcClassLevels + id) : 0 });
    }
    return out;
  }

  function totalLevel(e) {
    return pcClasses(e).reduce((sum, c) => sum + c.level, 0);
  }

  // Levels are stored by class id while ids are listed in the order the classes were taken.
  function setPcClasses(e, list) {
    check(list.length >= 1 && list.length <= CLASS_SLOTS, 'a character needs one to eight classes');
    const seen = new Set();
    for (const c of list) {
      check(c.id >= 0 && c.id < CLASS_SLOTS, 'class id must be 0-7');
      check(!seen.has(c.id), 'a class may be listed once');
      check(c.level >= 1 && c.level <= 255, 'class level must be 1 or more');
      seen.add(c.id);
    }
    const d = e.data;
    d.setU8(OFF.pcClassCount, list.length);
    for (let i = 0; i < CLASS_SLOTS; i += 1) d.setU8(OFF.pcClassIds + i, i < list.length ? list[i].id : UNUSED_CLASS_ID);
    for (let i = 0; i < CLASS_SLOTS; i += 1) d.setU8(OFF.pcClassLevels + i, 0);
    for (const c of list) d.setU8(OFF.pcClassLevels + c.id, c.level);
  }

  function knownSpells(e) {
    const d = e.data;
    const count = Math.min(d.u16(OFF.pcKnownSpellCount), KNOWN_SPELL_CAPACITY);
    const out = [];
    for (let i = 0; i < count; i += 1) out.push(d.u16(OFF.pcKnownSpells + i * 2));
    return out;
  }

  function setKnownSpells(e, ids) {
    check(ids.length <= KNOWN_SPELL_CAPACITY, 'a character can know at most ' + KNOWN_SPELL_CAPACITY + ' spells');
    const d = e.data;
    for (let i = 0; i < KNOWN_SPELL_CAPACITY; i += 1) d.setU16(OFF.pcKnownSpells + i * 2, i < ids.length ? ids[i] : 0);
    d.setU16(OFF.pcKnownSpellCount, ids.length);
  }

  function heal(e) {
    const dnd = e.actor.dnd;
    dnd.setI32(OFF.dndCurHp, dnd.i32(OFF.dndMaxHp));
  }

  // Clears used spell slots and daily ability uses, and restores hit points.
  function rest(e) {
    const dnd = e.actor.dnd;
    for (let i = 0; i < 10; i += 1) {
      dnd.setU8(OFF.dndArcaneUsed + i, 0);
      dnd.setU8(OFF.dndDivineUsed + i, 0);
    }
    if (e.tag === 2) for (let i = 0; i < 10; i += 1) e.data.setU8(OFF.pcDailyUses + i, 0);
    heal(e);
  }

  function removeEffect(e, index) {
    e.actor.effects.splice(index, 1);
  }

  // ---- edits: inventory ----------------------------------------------------------------------

  function itemList(e) { return e.tag === 7 ? e.items : e.actor.items; }

  function usedItemHandles(save) {
    const used = new Set();
    for (const e of save.entities) for (const it of itemList(e)) used.add(it.equip.u16(OFF.equipHandle));
    return used;
  }

  function freeItemHandle(save) {
    const used = usedItemHandles(save);
    for (let h = 1; h < 0x10000; h += 1) if (!used.has(h)) return h;
    throw new FormatError('no free item handle remains');
  }

  // Finds a free backpack cell for a w x h item. sizeOf(templateId) returns {w, h} or null when the
  // item catalog is unavailable; without sizes the item goes on a page of its own.
  function placeInBackpack(e, w, h, sizeOf) {
    const a = e.actor;
    const backpack = a.items.filter((it) => !it.node.u8(OFF.nodeEquipped) && !it.node.u8(OFF.nodeHidden));
    const sizes = backpack.map((it) => (sizeOf ? sizeOf(it.equip.u16(OFF.equipTemplate)) : null));
    if (w && h && sizes.every(Boolean)) {
      for (const pageId of a.paging.pageIds) {
        const grid = Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(false));
        backpack.forEach((it, i) => {
          if (it.node.u8(OFF.nodePage) !== (pageId & 0xFF)) return;
          const r0 = it.node.u8(OFF.nodeRow);
          const c0 = it.node.u8(OFF.nodeCol);
          for (let r = r0; r < Math.min(GRID_ROWS, r0 + sizes[i].h); r += 1) {
            for (let c = c0; c < Math.min(GRID_COLS, c0 + sizes[i].w); c += 1) grid[r][c] = true;
          }
        });
        for (let r = 0; r + h <= GRID_ROWS; r += 1) {
          for (let c = 0; c + w <= GRID_COLS; c += 1) {
            let free = true;
            for (let rr = r; rr < r + h && free; rr += 1) for (let cc = c; cc < c + w; cc += 1) if (grid[rr][cc]) { free = false; break; }
            if (free) return { page: pageId, row: r, col: c };
          }
        }
      }
    }
    const pageId = a.paging.nextPageId;
    check(pageId <= 0xFF, 'no further inventory page can be added');
    a.paging.pageIds.push(pageId);
    a.paging.nextPageId = pageId + 1;
    return { page: pageId, row: 0, col: 0 };
  }

  function makeItem(save, templateId, opts) {
    const node = Block.zero(INV_NODE_SIZE);
    const equip = Block.zero(EQUIP_SIZE);
    equip.setU16(OFF.equipTemplate, templateId);
    equip.setU16(OFF.equipCharges, opts.charges || 0);
    equip.setU16(OFF.equipHandle, freeItemHandle(save));
    equip.setU8(OFF.equipIdentified, opts.identified === false ? 0 : 1);
    return { node, equip };
  }

  // Adds an item to a character's backpack, to a worn slot (opts.slotMask), or to a treasure container.
  function addItem(save, e, templateId, opts) {
    opts = opts || {};
    check(templateId >= 0 && templateId <= 0xFFFF, 'item id must fit in 16 bits');
    const item = makeItem(save, templateId, opts);
    if (e.tag === 7) {
      e.items.push(item);
      return item;
    }
    if (opts.slotMask) {
      const taken = e.actor.items.find((it) => it.node.u8(OFF.nodeEquipped) && (it.node.u16(OFF.nodeSlotMask) & opts.slotMask));
      check(!taken, 'that worn slot is already occupied');
      item.node.setU8(OFF.nodeEquipped, 1);
      item.node.setU16(OFF.nodeSlotMask, opts.slotMask);
    } else {
      const size = opts.size || null;
      const spot = placeInBackpack(e, size && size.w, size && size.h, opts.sizeOf);
      item.node.setU8(OFF.nodePage, spot.page);
      item.node.setU8(OFF.nodeRow, spot.row);
      item.node.setU8(OFF.nodeCol, spot.col);
    }
    e.actor.items.push(item);
    return item;
  }

  function removeItem(e, index) {
    itemList(e).splice(index, 1);
  }

  // Moves a worn item into the backpack.
  function unequipItem(e, index, sizeOf) {
    const it = e.actor.items[index];
    const size = sizeOf ? sizeOf(it.equip.u16(OFF.equipTemplate)) : null;
    it.node.setU8(OFF.nodeEquipped, 0);
    it.node.setU16(OFF.nodeSlotMask, 0);
    const others = e.actor.items;
    e.actor.items = others.filter((x) => x !== it);
    const spot = placeInBackpack(e, size && size.w, size && size.h, sizeOf);
    e.actor.items = others;
    it.node.setU8(OFF.nodePage, spot.page);
    it.node.setU8(OFF.nodeRow, spot.row);
    it.node.setU8(OFF.nodeCol, spot.col);
  }

  // ---- edits: world --------------------------------------------------------------------------

  function worldVar(save, i) { return save.worldVars.u16(i * 2); }
  function setWorldVar(save, i, v) {
    check(i >= 0 && i < WORLD_VAR_COUNT, 'world variable index out of range');
    check(v >= 0 && v <= 0xFFFF, 'world variable values are 0-65535');
    save.worldVars.setU16(i * 2, v);
  }

  function namedState(b) {
    return { kind: b.u8(OFF.namedKind), name: b.str(OFF.namedName, 8), state: b.u8(OFF.namedState) };
  }

  function setNamedState(save, kind, name, value) {
    check(kind >= 0 && kind <= 0xFF && value >= 0 && value <= 0xFF, 'kind and value are one byte each');
    const existing = save.namedStates.find((b) => b.u8(OFF.namedKind) === kind && b.str(OFF.namedName, 8).toLowerCase() === name.toLowerCase());
    if (existing) {
      existing.setU8(OFF.namedState, value);
      return existing;
    }
    const b = Block.zero(NAMED_STATE_SIZE);
    b.setU8(OFF.namedKind, kind);
    b.setStr(OFF.namedName, 8, name, true);
    b.setU8(OFF.namedState, value);
    save.namedStates.push(b);
    return b;
  }

  // ---- edits: party placement ----------------------------------------------------------------

  function setSelectedMember(save, handle) {
    check(isPartyHandle(save, handle), 'the selected actor must be a party member');
    save.actorList.setU32(OFF.alCurrent, handle);
  }

  function setPartyOrder(save, handles) {
    const current = partyHandles(save);
    check(handles.length === current.length && handles.every((h) => current.includes(h)), 'party order must list the same members');
    handles.forEach((h, i) => save.gameMaster.setU32(OFF.gmParty + i * 4, h));
  }

  function partyCentroid(save) {
    const members = party(save).filter((m) => m.entity);
    check(members.length > 0, 'no party member records were found');
    const c = [0, 0, 0];
    for (const m of members) for (let k = 0; k < 3; k += 1) c[k] += m.entity.actor.base.f32(OFF.actorPos + k * 4);
    return c.map((v) => v / members.length);
  }

  // Moves every party actor by the same offset so the formation centre lands on `point`, and
  // stops the game from replacing those positions with an arrival marker on load.
  function relocateParty(save, point) {
    const centre = partyCentroid(save);
    const delta = point.map((v, k) => v - centre[k]);
    for (const m of party(save)) {
      if (!m.entity) continue;
      const base = m.entity.actor.base;
      for (let k = 0; k < 3; k += 1) base.setF32(OFF.actorPos + k * 4, base.f32(OFF.actorPos + k * 4) + delta[k]);
    }
    save.actorList.setI32(OFF.alArrival, -1);
  }

  function setArrivalMarker(save, id) {
    save.actorList.setI32(OFF.alArrival, id);
  }

  function resetLevelArray(save, levelId) {
    check(levelId >= 0 && levelId < LEVEL_ARRAY_COUNT, 'area id out of range');
    save.levelArrays[levelId] = [];
  }

  // Clears rest, pending item spawn and active encounter state carried over from the current area.
  function clearAreaEncounterState(save) {
    const gm = save.gameMaster;
    gm.setU8(OFF.gmRestEnabled, 0);
    gm.setU32(OFF.gmRestSafe, 0);
    for (let i = 0; i < 10; i += 1) gm.setI32(OFF.gmRestEncA + i * 4, -1);
    gm.setU32(OFF.gmRestMarkers, 0);
    for (let i = 0; i < 10; i += 1) gm.setI32(OFF.gmRestEncB + i * 4, -1);
    gm.setU8(OFF.gmPendingCount, 0);
    for (let i = 0; i < 20; i += 1) gm.setI32(OFF.gmEncounters + i * 4, -1);
  }

  // Moves the party into another area. The destination's own creatures, objects and cleared flags
  // are rebuilt by the game; everything from the source area except the party is removed.
  function moveToArea(save, levelId, placement) {
    check(!save.mp, 'multiplayer saves cannot be moved between areas');
    check(levelId > 0 && levelId < LEVEL_ARRAY_COUNT, 'area id out of range');
    const handles = new Set(partyHandles(save));
    const kept = save.entities.filter((e) => e.actor && handles.has(entityHandle(e)));
    check(kept.length > 0, 'no party member records were found');
    save.entities = kept;
    if (save.mapRegionRaw) {
      throw new FormatError('this save could only be read in recovery mode; area moves need the full map section');
    }
    save.regionFlags = [];
    resetLevelArray(save, levelId);
    clearAreaEncounterState(save);
    const current = save.actorList.u32(OFF.alCurrent);
    if (!handles.has(current)) save.actorList.setU32(OFF.alCurrent, entityHandle(kept[0]));
    const special = save.actorList.u32(OFF.alSpecial);
    if (special !== 0xFFFFFFFF && !handles.has(special)) save.actorList.setU32(OFF.alSpecial, 0xFFFFFFFF);
    save.mapId = levelId;
    if (placement.point) relocateParty(save, placement.point);
    else setArrivalMarker(save, placement.arrival);
  }

  function removeEntity(save, index) {
    const e = save.entities[index];
    check(!(e.actor && isPartyHandle(save, entityHandle(e))), 'party members cannot be removed');
    save.entities.splice(index, 1);
  }

  // ---- edits: maps ---------------------------------------------------------------------------

  function setMapExplored(map, explored) {
    map.tiles.fill(explored ? 1 : 0);
    if (explored) map.head.setU8(OFF.mapVisited, 1);
  }

  function addMapPin(map, fx, fy, label) {
    const b = Block.zero(MAP_PIN_SIZE);
    b.setF32(0, fx);
    b.setF32(4, fy);
    b.setStr(8, 256, label || '');
    map.pins.push(b);
    return b;
  }

  // ---- validation ----------------------------------------------------------------------------

  // Rebuilds the file, reads it back and checks the cross-references the game relies on. Problems
  // listed in `baseline` (found in the file as it was opened) are reported separately as pre-existing.
  function validate(save, baseline) {
    const bytes = serialize(save);
    let reread;
    try {
      reread = parse(bytes);
    } catch (error) {
      return { ok: false, bytes, problems: ['the rebuilt file does not read back: ' + error.message], existing: [] };
    }
    const problems = checkInvariants(save);
    if (!B.bytesEqual(serialize(reread), bytes)) problems.push('the rebuilt file does not round-trip');
    const known = new Set(baseline || []);
    const fresh = problems.filter((p) => !known.has(p));
    const existing = problems.filter((p) => known.has(p));
    return { ok: fresh.length === 0, bytes, problems: fresh, existing };
  }

  function checkInvariants(save) {
    const problems = [];
    const handles = partyHandles(save);
    if (save.gameMaster.u32(OFF.gmPartyCount) > PARTY_CAPACITY) problems.push('party size is larger than 6');
    if (new Set(handles).size !== handles.length) problems.push('a party handle is listed twice');
    for (const h of handles) {
      const e = findEntity(save, h);
      if (!e) problems.push('party handle ' + h + ' has no character record');
      else if (e.tag !== 2) problems.push('party handle ' + h + ' is not a player character');
    }
    const current = save.actorList.u32(OFF.alCurrent);
    if (handles.length && !handles.includes(current)) problems.push('the selected actor is not a party member');
    for (const e of save.entities) {
      if (e.tag === 2) {
        const ids = pcClasses(e).map((c) => c.id);
        if (ids.some((id) => id >= CLASS_SLOTS)) problems.push(entityName(e) + ' has an invalid class id');
        if (e.data.u16(OFF.pcKnownSpellCount) > KNOWN_SPELL_CAPACITY) problems.push(entityName(e) + ' knows more than 43 spells');
      }
      if (e.actor) {
        const worn = new Map();
        for (const it of e.actor.items) {
          if (!it.node.u8(OFF.nodeEquipped)) continue;
          const mask = it.node.u16(OFF.nodeSlotMask);
          for (const [m] of worn) if (m & mask) problems.push(entityName(e) + ' wears two items in one slot');
          worn.set(mask, true);
        }
      }
    }
    const itemHandles = new Map();
    for (const e of save.entities) {
      for (const it of itemList(e)) {
        const h = it.equip.u16(OFF.equipHandle);
        itemHandles.set(h, (itemHandles.get(h) || 0) + 1);
      }
    }
    for (const [h, n] of itemHandles) if (n > 1 && h !== 0) problems.push('item handle ' + h + ' is used ' + n + ' times');
    return problems;
  }

  // ---- slots ---------------------------------------------------------------------------------

  // The game names a save after 0xFFFFFFFF minus the Unix time it was written, so newer saves sort first.
  function slotFileName(slot) { return 'bas_' + String(slot >>> 0).padStart(10, '0') + '.sav'; }
  function newSlotNumber(date) {
    const seconds = Math.floor((date ? date.getTime() : Date.now()) / 1000);
    return (0xFFFFFFFF - seconds) >>> 0;
  }
  function slotFromFileName(name) {
    const m = /^bas_(\d{1,10})\.sav$/i.exec(name);
    return m ? Number(m[1]) : null;
  }
  function slotDate(slot) { return new Date((0xFFFFFFFF - slot) * 1000); }

  // Reads only the header fields needed for a save list.
  function peekHeader(bytes) {
    if (bytes.length < HEADER_SIZE + 5) return null;
    const b = new Block(bytes.slice(0, HEADER_SIZE + 5));
    return { name: b.str(0, NAME_SIZE), version: b.u32(OFF.headerVersion), entities: b.u32(OFF.headerEntityCount), mapId: b.u32(HEADER_SIZE), mp: b.u8(HEADER_SIZE + 4) };
  }

  const api = {
    SAVE_VERSION, NAME_SIZE, WORLD_VAR_COUNT, ROSTER_COUNT, LEVEL_ARRAY_COUNT, PARTY_CAPACITY, GRID_ROWS, GRID_COLS,
    KNOWN_SPELL_CAPACITY, CLASS_SLOTS, MAX_EFFECTS, PARTY_HANDLE_MIN, PARTY_HANDLE_MAX, OFF,
    parse, serialize, validate, checkInvariants, peekHeader,
    displayName, setDisplayName, entityHandle, entityName, partyHandles, party, findEntity, isPartyHandle,
    pcClasses, totalLevel, setPcClasses, knownSpells, setKnownSpells, heal, rest, removeEffect,
    itemList, addItem, removeItem, unequipItem, freeItemHandle,
    worldVar, setWorldVar, namedState, setNamedState,
    setSelectedMember, setPartyOrder, partyCentroid, relocateParty, setArrivalMarker, resetLevelArray,
    clearAreaEncounterState, moveToArea, removeEntity, setMapExplored, addMapPin,
    slotFileName, newSlotNumber, slotFromFileName, slotDate,
  };
  root.PorSave = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
