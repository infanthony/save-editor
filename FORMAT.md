# Save file format (version 37)

This describes the files written by Pool of Radiance: Ruins of Myth Drannor patch 1.4, as read by this
editor. All integers are little-endian. "Record" sizes are exact; fields not listed are preserved as read.

This description was produced through AI-based reverse engineering of the released game, without its source
code. It may be incomplete or wrong, and a future game update may change these formats; see the disclosure in
[README.md](README.md).

## Files

| File | Contents |
|---|---|
| `bas_<n>.sav` | The save container below. `<n>` is `4294967295 - <Unix time of saving>`, zero-padded to ten digits, so newer saves sort first. Single-player saves live in `savegames`, multiplayer saves in `mpsaves`. |
| `bas_<n>.sav.sta` | Object-state table: 46 blocks of 10,000 bytes, one per area id (460,000 bytes). |

The `.sav` has no checksum, magic number or length field; the game rejects a file only when the version is
too old, the single/multiplayer mode does not match the session, an entity tag is unknown, or a read runs
short.

## `.sav` layout, in file order

| # | Section | Layout |
|---:|---|---|
| 1 | Header (0x58) | `char name[80]` (NUL-terminated save name), `u32 version` (37), `u32 entityCount` |
| 2 | Current area | `u32 areaId` (0-45) |
| 3 | Mode | `u8 multiplayer` |
| 4 | Conversations | single player only: 1,500 records. An unused slot is the byte `FF`. A used slot is `00`, a NUL-terminated name, `u16`, 5 bytes, three 50-byte arrays, 100 node chains (`FF`, or `u8 n` + `n` byte pairs), 150 completed-node entries (`FF`, or 3 bytes), 150 bytes, and 50 hook lists (`u8 n` + `n` byte pairs) |
| 5 | World variables | single player only: `u16 value[1500]` |
| 6 | NPC roster | single player only: 22 records of 0x60 |
| — | Multiplayer world | multiplayer only, in place of 4-6: 84 bytes (`u32` world seed, `i32` dungeon, `i32` level, `i32` difficulty, `u32` encounter seed, then 16 four-byte area slots) |
| 7 | Time of day | `f32 hours` |
| 8 | Options | 4 bytes: run while exploring (0 walk, 1 run), indicator rings under characters, move-and-act (walk to an out-of-reach target, then act), floating combat text |
| 9 | Named states | `u32 n`, then `n` records of 0x14 |
| 10 | Maps | `u32 n`, then `n` map records |
| 11 | Cleared flags | `u32 cells`, then per cell `u32 n` + `n` bytes |
| 12 | Entities | exactly `entityCount` tagged records |
| 13 | Actor list (0x14) | `u32 selectedActor`, 5 latch bytes, 3 padding bytes, `u32 specialActor`, `i32 arrivalMarker` |
| 14 | Area state arrays | 46 times: `u32 n`, then `n` times `u32 length` + `length` bytes |
| 15 | Game master (0x3EC) | rest, encounter, pending item and party state (below) |
| 16 | Party group | `u32 leader`, `u32 followers`, `u8 active` + 3 padding, `f32 facing`, then per follower `u32 handle`, `f32 dx, dy, dz`; the file ends here |

### World variable names

The names of the 1,500 world variables are in the game's `data/Dialogue/test.cv`: records of
`name NUL script NUL`, separated by `FF`, in variable order.

### NPC roster record (0x60)

| Offset | Field |
|---:|---|
| 0x00 | `char name[12]` |
| 0x50 | `u8 dead` |
| 0x54 | `i32 clickState`: what clicking the NPC does: 3 talk, 11 trade, 12 join the party, anything else nothing. Conversations set 11, 3, 12 or 0 |
| 0x58 | `f32` rate the merchant buys at (0 for non-merchants) |
| 0x5C | `f32` rate the merchant sells at |

### Named state (0x14)

| Offset | Field |
|---:|---|
| 0x00 | stale pointer, ignored on load |
| 0x04 | `u8 kind`: 2 named state, 3 door or interactive object |
| 0x05 | `char name[8]`, not necessarily NUL-terminated |
| 0x0D | `u8 value` |

For kind 2 (named encounters) the game writes 2 when the party defeats the encounter (it then never spawns
again) and 1 when a fight with it ends without a party victory; scripts may write other values. For kind 3
(named doors and objects) the low six bits are the object's state minus 14 (0 initial, 1 broken, 2 open,
5 closed) and bit 0x40 marks a value written by the game's state-restore path.

### Map record

A 0x20-byte header, then `pins x 0x108`, then `markers x 0x28`, then `tilesX * tilesY * 16` exploration
bytes.

| Offset | Header field |
|---:|---|
| 0x00 | `u32 areaId` |
| 0x04 | `u8 region`, `u8 regionSeed`, padding, `u8 visited` |
| 0x08 | `i32 drawOriginX`, `i32 drawOriginY` |
| 0x10 | `i32 tilesX`, `i32 tilesY` |
| 0x18 | `i32 pins`, `i32 markers` |

A map note (pin) is `f32 across`, `f32 down` (both 0-1 across the drawn map) and `char label[256]`. A map
marker is `i32 handle`, `f32 across`, `f32 down`, `i32 width`, `i32 height`, `f32 direction[3]`,
`u32 ARGB`, `i32 type`. Each map tile has a 4x4 grid of explored bytes (0 or 1); tiles are stored row by row.

## Entities

Each entity starts with a `u32` tag.

| Tag | Kind | Layout after the tag |
|---:|---|---|
| 2 | Player character | actor chain + character record (0x150) |
| 3, 4 | Creature | actor chain + creature record (0x7C) |
| 7 | Treasure | treasure record (0x34) + `itemCount` inventory entries |
| 8 | Interactive object | `u32 kind` (0 plain, 1 door/obstruction, 2 consumer, 3 container, 4 effect generator, 5 transporter) + actor chain + object record (0xBC) |

The **actor chain** is:

1. actor record (0x84);
2. inventory pages: `u32 nextPageId`, `u32 n`, `u32 pageId[n]`;
3. character state (0x40);
4. `inventoryCount` inventory entries, each a 0x10 node and an 8-byte item record;
5. `effectCount` effect records of 0xB4.

### Actor record (0x84)

| Offset | Field |
|---:|---|
| 0x00 | `char name[80]` |
| 0x50 | `u32 type` (equals the entity tag) |
| 0x54 | `u32 handle` (party members are 200000000-299999999) |
| 0x58 | `u32 model` (see Models and textures) |
| 0x5C | `f32 x, y, z` |
| 0x68 | `f32 heading` |
| 0x6C | `i32` look (0 = the textures the model names), `i32` gloves overlay (98 or -1), `i32` boots overlay (99 or -1) |
| 0x78 | `u32` secondary colour |
| 0x7C | `f32 moveSpeed` |
| 0x80 | `u8` awareness latch |

### Character state (0x40)

| Offset | Field |
|---:|---|
| 0x00 | `i32` maximum HP including temporary HP |
| 0x04 | `i32` current HP including temporary HP |
| 0x08 | `i32` accumulated damage |
| 0x0C | `i32` temporary HP |
| 0x10 | `u8` arcane spell slots used, levels 0-9 |
| 0x1A | `u8` divine spell slots used, levels 0-9 |
| 0x24 | `i32 inventoryCount` |
| 0x28 | `u8 effectCount` (at most 10) |
| 0x29 | `i8` ability drain x6 |
| 0x2F | `i8` ability damage x6 |
| 0x35 | `char rosterName[8]` |
| 0x3D | `i8` HP adjustment from CON damage, `i8` from CON drain |

### Inventory entry

Node (0x10): pointer (ignored on load), `u8 worn`, `u8 hiddenFromGrid`, `u16 slotMask`, `u8 row`, `u8 column`,
`u8 page`, padding, pointer (ignored). Backpack pages are 14 columns by 7 rows.

Item record (8): `u16 itemId`, `u16 charges`, `u16 instanceHandle`, `u8 identified`, padding.

Worn slot bits: 0x2 neck, 0x4 body armour, 0x8 quiver, 0x10 hands, 0x20 off hand (shields and bows),
0x40 weapon hand, 0x80 and 0x100 rings, 0x200 feet.

### Effect record (0xB4)

| Offset | Field |
|---:|---|
| 0x00 | `i16` instance id |
| 0x02 | `i16` effect id |
| 0x04 | `f32` tick elapsed, `f32` total elapsed (ms) |
| 0x0C | `i32` duration in tenths (0 = permanent) |
| 0x14 | `u8` behaviour, `i8` magnitude, `u8` suppressed |
| 0x20 | `i32` caster handle |
| 0x24 | `i32` caster level parameter |
| 0x28 | `i32` affected handles x30 |
| 0xA0 | `f32` cast position x3 |
| 0xB0 | `u8` created in combat |

Pointer fields in the record are ignored on load.

### Character record (0x150)

| Offset | Field |
|---:|---|
| 0x00 | three appearance bytes (stored, but not used for drawing) |
| 0x03 | `u8` race: 0 Human, 1 Dwarf, 2 Elf, 3 Half-orc, 4 Halfling, 5 Half-elf |
| 0x04 | `u8` gender: 0 male, 1 female |
| 0x05 | `u8` alignment: 0 CE, 1 NE, 2 LE, 3 CN, 4 TN, 5 LN, 6 CG, 7 NG, 8 LG |
| 0x06 | `u8 classCount` |
| 0x08 | `u8` home area |
| 0x09 | `u8 classIds[8]` in the order taken (unused slots hold 50) |
| 0x11 | `u8 classLevels[8]`, indexed by class id: 0 Fighter, 1 Barbarian, 2 Ranger, 3 Sorcerer, 4 Cleric, 5 Rogue, 6 Paladin, 7 Monk |
| 0x19 | `u8` daily ability uses since rest x10 |
| 0x23 | `u8` base ability scores: STR, DEX, CON, INT, WIS, CHA |
| 0x29 | `u8` skill ranks x13 |
| 0x38 | `u32` feat bits (18 feats; higher bits unused) |
| 0x3C | `u32` class-feature bits shown on the character sheet |
| 0x40 | `i32 gold` |
| 0x44 | `i32 experience` |
| 0x48 | `u16 knownSpells[43]` (arcane spell ids) |
| 0x9E | `u16 knownSpellCount` |
| 0xA0 | `i32` base look picked at character creation |
| 0xA4 | `i32` quick action slots x40 |
| 0x144 | `u8` premade character |
| 0x146 | `u8` persisted flag |
| 0x148 | `u16` banked skill points |
| 0x14C | `i32` unique id |

Skill order: Hide, Move Silently, Listen, Spot, Danger Sense, Concentration, Spellcraft, Search, Open Lock,
Disable Device, Heal, Lay on Hands, Wholeness of Body.

### Creature record (0x7C)

| Offset | Field |
|---:|---|
| 0x00 | `u16` creature template: the 0-based position of its record in `monsters.mon` |
| 0x02 | `u8` AI mode, `u8` team |
| 0x04 | `i32` spawn handle |
| 0x08 | AI parameters x10 |
| 0x12 | `u8` patrol point count |
| 0x14 | patrol points (0x60 bytes) |
| 0x74 | `u8` patrol cursor, `u8` visible |
| 0x78 | `i32` pose restore marker |

### Treasure record (0x34)

`i32 marker`, `i32 equipmentSet`, `i32 itemCount`, `i32 gold`, `f32 forward[3]`, `f32 up[3]`,
`f32 position[3]`.

### Object record (0xBC)

| Offset | Field |
|---:|---|
| 0x00 | `f32` position x3 |
| 0x30 | `i32` model |
| 0x34 | `u16` home area, `i16` heading |
| 0x38 | `u8` opacity x100, `u8` brightness x10, `u8` colour mode, `u8` marker visible |
| 0x3C | `u32` ARGB |
| 0x40 | `char markerName[8]` |
| 0x48 | `u8` state (14 initial, 15 broken, 16 open, 19 closed; others authored) |
| 0x49 | `u8` carried, `u8` menu enabled, `u8` trap type |
| 0x4C | `i16` key item or trap damage |
| 0x4E | `char conversation[8]`, `u8` conversation type |
| 0x57 | `u8` kind |
| 0x58 | `u16` hit points |
| 0x5A | 10 bytes of kind-specific data |
| 0x88 | `i32` marker handle |
| 0x8C | `u8` lock or trap armed, `u8` trap found, `u8` trap resolved |
| 0x90 | `i32` trap attempt handles x10 |

## Game master record (0x3EC)

| Offset | Field |
|---:|---|
| 0x000 | `u8` rest enabled |
| 0x004 | `u32` area safe for rest |
| 0x008 | `i32` rest interruption encounters x10 |
| 0x030 | `u32` rest marker count |
| 0x034 | `i32` rest interruption encounters x10 |
| 0x05C | `u8` pending item spawn count |
| 0x060 | `u32` pending item ids x200 |
| 0x380 | ten `{i32 encounter, i32 state}` pairs (state is ignored when the id is negative) |
| 0x3D0 | `u32` party size (at most 6) |
| 0x3D4 | `u32` party handles x6 |

## Object-state file (`.sav.sta`)

Block `a` (bytes `a * 10000` to `a * 10000 + 9999`) belongs to area id `a`. Entry `n` of a block belongs to the
area object whose marker name is `1ZZ`, `2ZZ` or `3ZZ` followed by the number `n`. A value of 0 means the
object uses the state its area file gives it; otherwise the object's state is `13 + (value & 0x3F)`, and bit
0x40 marks a door whose lock has been cleared. A block of zeros is the game's own initial state.

## Game data used for names

Text in saves and game files is stored as bytes in the code page of the game's language: windows-1252
(English, French, German, Spanish, Italian), windows-1250 (Polish), windows-1251 (Russian) or Big5 (the
Traditional Chinese release); a fan Simplified Chinese translation uses GBK. No byte of a Big5 or GBK
character is 0x00, 0x0A, 0x0D or 0xFF, so files can be split on those bytes before the text is decoded.

| File | Format |
|---|---|
| `sfDat.dat` | `u32 count`, `u32 totalChars`, `u32 charOffset[count]`, then 16-bit units; in string `i` every unit's low byte is XORed with `(i + 0x55) & 0xFF` and its high byte with `(i + 0xBB) & 0xFF`. A unit whose high byte is 0, or 0xFF over a low byte of 0x80 and above (the Chinese release), holds one byte of text in the language's code page; other units are UTF-16 |
| `data/str/*.str` | one string per line; lines are numbered from 0, and runs of line breaks count as one |
| `data/TEE.trs` | item catalog; see Item catalog |
| `data/monsters.mon` | creature templates; see Creature template file |
| `data/LMM/<area>.lmm` | area marker file: version 3, cell grid size at 0x228, a cell index at 584, then 133-byte markers (kind at +0x0C; arrival id as decimal text at +0x32; object name at +0x40) |

## Conversation data

Conversations live in `data/Dialogue`:

| File | Format |
|---|---|
| `test.cv`, `test.ck`, `test.cj`, `test.cl` | name tables (world variables, named encounters, named doors and objects, NPCs): repeated `name NUL script NUL flag` |
| `all.idx` | one entry per conversation: `name NUL`, 3 padding bytes, `u32` offset into `all.db` |
| `all.db` | compiled conversations. Each record starts with four `u32` (three section sizes and the total); section 0 holds two operation chains and two node lists |
| `<conversation>.por` | the conversation's text: one row per line, tab-separated `id`, `text`, `speaker`, `direction` (`null` for none) |

An operation chain is `u16 count` followed by operations: `u8 opcode` (0x32-0xF0) and a fixed number of
operands per opcode, each `u8 type` plus a value (`u8` for types 1 and 4; `u16` for 2, 8, 0x10, 0x18 and 0x40;
`u16` plus an ignored `u16` for 0x20). A node list is `u8 count` of non-empty slots; each slot is `u8 nodes`, each
node `u16 line`, `u16`, an operation chain, then `u8 children` of the same shape. A node's `line` is the row of the
conversation's `.por` file that the node belongs to.

Operations the editor reads: 0x80 sets a world variable (`value`, `variable`; operand type 2 means the value is
another variable), 0x8D adds and 0x8E subtracts; 0x56-0x77 compare a world variable; 0x3C and 0x55 refer to
named encounters; 0x79 sets a named door or object; 0x7C sets an NPC's click state (operand 0, 1, 2 or 3 stores
11, 3, 12 or 0).

## Creature template file (`data/monsters.mon`)

`i32 122`, `u32 count`, then per creature a 0xE4-byte record followed by `attackCount` 9-byte attacks. Data after
the last record is not read by the game and is kept as is. The game reads templates while it runs, so a change
applies to creatures already in saves. Saves refer to a template by its position in the file; encounters in the
area files refer to it by its unique id.

| Offset | Field |
|---:|---|
| 0x00 | `i32` name line in `data/str/monsters.str` |
| 0x04 | `i32` model (see Models), `i32` look |
| 0x0C | `u8` size: 0 Fine ... 4 Medium ... 8 Colossal; attack modifier +8, +4, +2, +1, 0, -1, -2, -4, -8 |
| 0x0D | `u32` description bits 0-31, `u32` bits 32-63 (see below) |
| 0x15 | `i32` experience value; each party member gets the fight's total divided by 10 x party size (doubled in multiplayer) |
| 0x19 | `u8` hit die sides, `u8` hit dice (level), `u8` hit point bonus |
| 0x1C | `i8` initiative modifier (initiative is d20 plus this; not part of armour class) |
| 0x1D | `i16` movement speed (60 = 30 feet; creatures move at four fifths of it) |
| 0x21 | `u8` armour class before Dexterity, worn armour, shield and effects (includes 10, size and natural armour) |
| 0x24 | `i8` melee attack bonus (Strength and size are added), `i8` ranged attack bonus (Dexterity and size are added) |
| 0x26 | `u8 attackCount` |
| 0x28 | `u8` magical bonus a weapon needs to do damage |
| 0x29 | `u32` immunities, then `i8` saving throw bonuses x16 at 0x2D (slot n pairs with immunity bit n) |
| 0x3E | `u8` spell resistance |
| 0x41 | `u8` alignment |
| 0x49 | `i8` base saves: Fortitude, Reflex, Will |
| 0x4C | `u8` ability scores x6 |
| 0x52 | `u16` equipment set (random dungeons only) |
| 0x54 | `u8` special abilities x10 (255 empty), then `u8` turns between uses x10 at 0x5E |
| 0x6A | `i16` arcane spells x20, then `i16` divine spells x20 at 0x92 (-1 empty) |
| 0xBA | `u8` AI parameters x10 (random dungeons only) |
| 0xC4 | `i8` class ids x2 (-1 none), `u8` class levels x2 |
| 0xCC | `u32` feats (same bits as a character's feat word) |
| 0xD0 | `i8` skills: Hide, Move Silently, Listen, Spot, Danger Sense, Concentration (the game uses half the value) |
| 0xD6 | `u8` sound variants x9 (254 none, 255 the plain file, other values a numbered file) |
| 0xE0 | `i32` unique id |

Hit points: in random dungeons, hit dice x d(hit die) + bonus. Creatures in the campaign areas take their hit
points from their encounter. Armour class in play: the value at 0x21 + Dexterity modifier + worn armour + shield +
effects; touch attacks skip armour and shield, flat-footed skips Dexterity.

Description bits (0x0D, low word): 6 construct, 7 dragon, 10 fire attacks, 12 orc, 13 humanoid (person),
15 magical, 18 incorporeal, 19 mindless, 20 passes through creatures and walls, 21 gargoyle, 23 reptile, 26 undead,
28 light-sensitive, 29 drow, 30 cold attacks, 31 poison attacks. High word: 0 electricity, 1 evil, 2 neutral,
3 good (1-3 are also set from the alignment), 4 fear, 5 sleep, 6 charm, 7 acid, 8 mind-affecting, 9 hold,
10 death, 11 paralysis.

Immunity bits (0x29): 0 sleep (also critical hits, sneak attacks and favoured-enemy damage), 1 charm and
compulsion, 2 daze, confusion and feeblemind, 4 cold, 5 electricity, 6 hold, 7 death effects, 8 cannot be turned,
9 poison, 10 paralysis, 11 spells from casters below level 6, 12 magical weapon bonuses, 13 fire, 14 acid, 15 all
spells.

An attack row is `u8 kind` (0 natural melee, 1 natural ranged, 2 the equipped weapon), `u8` recharge turns, `u8`
(unused), `u16` range in feet, `u8` next row, `u8` damage die sides, `u8` damage dice, `u8` damage bonus.

## Item catalog (`data/TEE.trs`)

`u32 104`, `u32`, then three tables, each a `u32` count followed by fixed records: item effects (30 bytes), items
(72 bytes) and equipment sets (50 bytes). The data after the tables is not read by the game and is kept as is.
Saves refer to an item by the item id at +0x46, which equals its position; items are only ever added at the end.
Names are lines of `data/str/TEE.str`, which must never contain an empty line (runs of line breaks count as one).

| Offset | Item field |
|---:|---|
| 0x00 | `i16` type: 1 melee, 2 bow or sling, 3 thrown, 4 body armour, 5 shield, 6 ammunition or charged accessory, 7 document, 8 general, 9 potion, 10 scroll, 11 wand |
| 0x02 | `i32` unidentified name line, `i32` identified name line |
| 0x0A | `i32` 3D model (36 hand-held models; -1 none) |
| 0x0E | `i32` picture (87 pictures in `data/Interface`) |
| 0x12 | `u32` gold value |
| 0x16 | `i16` weight (may be negative) |
| 0x18 | `u8` backpack rows, `u8` backpack columns |
| 0x1A | `u16` worn slots: 0x2 neck, 0x4 body armour, 0x8 quiver, 0x10 hands, 0x20 off hand, 0x40 weapon hand, 0x80 and 0x100 rings, 0x200 feet |
| 0x1C | `u16` classes allowed (bit n = class n) |
| 0x1E | `u8` size: 3 Small, 4 Medium, 5 Large |
| 0x1F | `u8` damage type: 1 piercing, 2 slashing, 4 bludgeoning |
| 0x20 | `u8` damage die sides, `u8` damage dice, `u8` damage bonus |
| 0x23 | `u8` lowest critical threat roll, `u8` critical multiplier |
| 0x25 | `u16` reach or range increment in feet |
| 0x27 | `f32` missile speed |
| 0x2B | `i8` armour class bonus, `u8` maximum Dexterity bonus, `i8` armour check penalty, `u8` arcane spell failure % |
| 0x2F | `i8` speed change for 30-foot races, `i8` for 20-foot races |
| 0x31 | `i8` look when worn: -1 none, 0 leather, 1 chain, 2 plate, 98 gloves, 99 boots |
| 0x32 | `i16` missile drawn (2 = arrow) |
| 0x34 | `u8` maximum charges, `u8` starting charges |
| 0x36 | `u8` returns if its holder is destroyed, `u8` identified by resting |
| 0x38 | `i16` effects x3 (-1 none) |
| 0x3E | `char[8]` conversation started on pick-up |
| 0x46 | `u16` item id |

| Offset | Effect field |
|---:|---|
| 0x00 | `i32` description line |
| 0x04 | `u32` x2: applies only against creatures or attacks with these description bits (same bits as creatures) |
| 0x0C | `i8` attack, `i8` damage, `u8` damage multiplier, `i8` armour class |
| 0x10 | `i8` Fortitude, Reflex, Will |
| 0x13 | `u8` ability (0-5, 255 none), `i8` ability bonus |
| 0x15 | `i8` initiative, `u8` spell resistance |
| 0x19 | `u8` caster level |
| 0x1A | `i16` spell |
| 0x1C | `u8` bonus type: 0 untyped (adds up), others keep only the best bonus and worst penalty (2 enhancement, 6 luck) |
| 0x1D | `u8` spell list: 0 arcane, 1 divine, 2 creature ability, 255 none |

An equipment set is `u16` set number, then 8 slots of `i16` item (-1 empty, -2 gold), `u16` minimum, `u16`
maximum. The quantity is the minimum when the maximum is not larger, otherwise a random number from the minimum up
to one below the maximum. Sets are found by number.

## Models and textures

| File | Format |
|---|---|
| Model ids | an actor's model number selects a file under `data/Anims` from a fixed list of 327 (the editor carries the list); character bodies are named by race digit (3 halfling, 4 dwarf, 5 elf or half-elf, 6 human, 8 half-orc), gender (m/f) and build (f fighter, m spellcaster, t rogue, k monk) |
| `data/Anims/<folder>/<name>.nat` | text: `hierarchy` of bones, each with `t x y z` and `e` Euler angles in degrees (local transform = translate x rotate Z x rotate Y x rotate X, Z up); `geometry_physique` with vertices tied to one bone each (`xyz bone weight x y z`), texture coordinates and `texture` / `polyStrip` / `polyList` faces (`f vertex uv`); objects use `geometry_seg` with vertices in their bone's space |
| `data/INK/<name>.cnk` | texture pack: `u32 count`, `u32 size`, then 56-byte entries `char name[52]`, `u32 offset` |
| `.ink` | 68-byte header (alpha, red, green, blue masks at +0x10..+0x1C; width +0x34; height +0x38), then 16-bit pixels (RGB565 or ARGB4444) |

A look number replaces the one or two digits before the extension of each texture name the model uses (one
digit below 10, two digits from 10); a part without that texture keeps its own. Characters wear look armour +
10 x base look, where armour is the worn body armour's look (0 leather, 1 chain, 2 plate); gloves (98) and boots
(99) are drawn over it.
