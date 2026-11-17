// Companion object-state file (.sav.sta): one 10,000-byte table per area id, 46 areas.
// Entry n belongs to the area object whose marker name is 1ZZ/2ZZ/3ZZ followed by n.
// A value of 0 means "use the area's authored state"; otherwise state = 13 + (value & 0x3F) and
// bit 0x40 records that a door's lock has been cleared.
(function (root) {
  'use strict';

  const B = root.PorBytes || require('./bytes.js');
  const { FormatError } = B;

  const SLOT_SIZE = 10000;
  const SLOT_COUNT = 46;
  const FILE_SIZE = SLOT_SIZE * SLOT_COUNT;
  const STATE_BASE = 13;
  const STATE_MASK = 0x3F;
  const LOCK_CLEARED = 0x40;

  class ObjectStateFile {
    constructor(bytes) {
      if (bytes.length !== FILE_SIZE) {
        throw new FormatError('object-state file is ' + bytes.length + ' bytes; expected ' + FILE_SIZE);
      }
      this.bytes = bytes;
    }
    static empty() { return new ObjectStateFile(new Uint8Array(FILE_SIZE)); }
    clone() { return new ObjectStateFile(this.bytes.slice()); }
    slot(level) {
      if (level < 0 || level >= SLOT_COUNT) throw new FormatError('area id out of range');
      return this.bytes.subarray(level * SLOT_SIZE, (level + 1) * SLOT_SIZE);
    }
    get(level, index) { return this.slot(level)[index]; }
    set(level, index, value) {
      if (index < 0 || index >= SLOT_SIZE) throw new FormatError('object index out of range');
      this.slot(level)[index] = value & 0xFF;
    }
    clearLevel(level) { this.slot(level).fill(0); }
    usedCount(level) {
      const s = this.slot(level);
      let n = 0;
      for (let i = 0; i < s.length; i += 1) if (s[i]) n += 1;
      return n;
    }
    entries(level) {
      const s = this.slot(level);
      const out = [];
      for (let i = 0; i < s.length; i += 1) if (s[i]) out.push(Object.assign({ index: i, value: s[i] }, decode(s[i])));
      return out;
    }
  }

  function decode(value) {
    if (!value) return { state: null, lockCleared: false };
    return { state: STATE_BASE + (value & STATE_MASK), lockCleared: (value & LOCK_CLEARED) !== 0 };
  }

  function encode(state, lockCleared) {
    if (state === null || state === undefined) return 0;
    const v = state - STATE_BASE;
    if (v < 1 || v > STATE_MASK) throw new FormatError('object state must be 14 or higher');
    return v | (lockCleared ? LOCK_CLEARED : 0);
  }

  const api = { ObjectStateFile, SLOT_SIZE, SLOT_COUNT, FILE_SIZE, decode, encode };
  root.PorState = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
