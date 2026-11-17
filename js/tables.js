// Identifier tables and record field layouts for version-37 saves. Labels are English fallbacks;
// when a game folder is loaded the editor replaces them with the installed language's own strings.
(function (root) {
  'use strict';

  // Each entry: fallback label and the system string id (sfDat.dat) the game shows for it.
  const CLASSES = [
    ['Fighter', 37], ['Barbarian', 42], ['Ranger', 41], ['Sorcerer', 38],
    ['Cleric', 39], ['Rogue', 40], ['Paladin', 353], ['Monk', 354],
  ];
  const RACES = [
    ['Human', 43], ['Dwarf', 44], ['Elf', 45], ['Half-orc', 46], ['Halfling', 47], ['Half-elf', 355],
  ];
  // Alignment byte n is shown with system string 91 + n.
  const ALIGNMENTS = [
    ['Chaotic Evil', 91], ['Neutral Evil', 92], ['Lawful Evil', 93], ['Chaotic Neutral', 94],
    ['True Neutral', 95], ['Lawful Neutral', 96], ['Chaotic Good', 97], ['Neutral Good', 98],
    ['Lawful Good', 99],
  ];
  // Description string ids (sfDat.dat), in the same order as the tables above.
  const CLASS_DESC = [76, 77, 78, 79, 80, 81, 357, 358];
  const RACE_DESC = [71, 72, 73, 74, 75, 356];
  const ALIGNMENT_DESC = [82, 83, 84, 85, 86, 87, 88, 89, 90];
  const ABILITIES = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
  const ABILITY_NAMES = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'];
  const SKILLS = [
    ['Hide', 13], ['Move Silently', 14], ['Listen', 30], ['Spot', 31], ['Danger Sense', 32],
    ['Concentration', 257], ['Spellcraft', 258], ['Search', 12], ['Open Lock', 15],
    ['Disable Device', 16], ['Heal', 17], ['Lay on Hands', 359], ['Wholeness of Body', 404],
  ];
  const SKILL_DESC = [720, 721, 722, 723, 987, 724, 725, 726, 727, 728, 729, 988, 989];
  // Feat word bit n. Bits 18..31 are unused by the game but are stored and round-trip.
  const FEATS = [
    ['Improved Initiative', 202], ['Combat Reflexes', 203], ['Point Blank Shot', 204],
    ['Precise Shot', 217], ['Great Fortitude', 205], ['Iron Will', 206], ['Lightning Reflexes', 207],
    ['Mobility', 208], ['Run', 209], ['Spell Penetration', 210], ['Combat Casting', 211],
    ['Power Attack', 212], ['Cleave', 213], ['Improved Critical', 214], ['Blind-Fight', 318],
    ['Toughness', 215], ['Skill Focus', 216], ['Extra Turning', 430],
  ];
  const FEAT_DESC = [545, 546, 547, 548, 549, 550, 551, 552, 553, 554, 555, 556, 557, 558, 559, 560, 561, 562];
  // Class-feature word bit n. These bits drive the character sheet list; rules read class levels.
  const CLASS_FEATURES = [
    ['Divine Grace', 563], ['Lay on Hands', 564], ['Smite Evil', 567], ['Turn Undead', 569],
    ['Barbarian Rage', 571], ['Sneak Attack', 573], ['Unarmed Strike', 575], ['Stunning Attack', 577],
    ['Evasion', 579], ['Deflect Arrows', 581], ['Fast Movement', 583], ['Still Mind', 585],
    ['Wholeness of Body', 587], ['Ki Strike', 589], ['Diamond Body', 591], ['Diamond Soul', 593],
    ['Quivering Palm', 595], ['Uncanny Dodge', 597], ['Favored Enemy: Orcs', 599],
    ['Favored Enemy: Reptiles', 601], ['Favored Enemy: Drow', 603], ['Favored Enemy: Dragons', 605],
    ['Aura of Courage', 730],
  ];
  const CLASS_FEATURE_DESC = [565, 566, 568, 570, 572, 574, 576, 578, 580, 582, 584, 586, 588, 590, 592, 594, 596, 598, 600, 602, 604, 606, 731];
  // Known arcane spells are stored as indices into this 66-row table: [label, string id, spell level].
  const ARCANE_SPELLS = [
    ['Daze', 135, 0], ['Detect Magic', 160, 0], ['Disrupt Undead', 127, 0], ['Light', 162, 0],
    ['Resistance', 107, 0], ['Mage Armor', 63, 1], ['Burning Hands', 67, 1], ['Charm Person', 181, 1],
    ['Chill Touch', 174, 1], ['Identify', 161, 1], ['Magic Missile', 66, 1],
    ['Protection from Evil', 130, 1], ['Protection from Good', 131, 1], ['Shield', 168, 1],
    ['Shocking Grasp', 148, 1], ['Sleep', 169, 1], ['Blindness', 128, 2], ["Cat's Grace", 103, 2],
    ['Darkness', 163, 2], ['Ghoul Touch', 186, 2], ['Invisibility', 164, 2],
    ["Melf's Acid Arrow", 136, 2], ['Mage Armor', 63, 2], ['Mage Armor', 63, 2],
    ['See Invisibility', 172, 2], ["Bull's Strength", 104, 2], ['Web', 196, 2], ['Blink', 189, 3],
    ['Dispel Magic', 193, 3], ['Displacement', 118, 3], ['Fireball', 151, 3], ['Haste', 187, 3],
    ['Hold Person', 138, 3], ['Halt Undead', 156, 3], ['Invisibility Sphere', 171, 3],
    ['Lightning Bolt', 157, 3], ['Slow', 188, 3], ['Stinking Cloud', 197, 3],
    ['Vampiric Touch', 146, 3], ['Charm Monster', 182, 4], ['Confusion', 191, 4], ['Fear', 170, 4],
    ['Fire Shield', 194, 4], ['Improved Invisibility', 165, 4],
    ['Minor Globe of Invulnerability', 175, 4], ['Cloudkill', 198, 5], ['Cone of Cold', 154, 5],
    ['Dominate Person', 184, 5], ['Feeblemind', 178, 5], ['Hold Monster', 140, 5],
    ['Chain Lightning', 199, 6], ['Circle of Death', 153, 6], ['Disintegrate', 147, 6],
    ['Globe of Invulnerability', 176, 6], ['Mass Suggestion', 185, 6], ['Repulsion', 192, 6],
    ['True Seeing', 201, 6], ['Control Undead', 183, 7], ['Finger of Death', 119, 7],
    ['Incendiary Cloud', 200, 8], ['Ghoul Touch', 186, 2], ['Repulsion', 192, 6], ['Web', 196, 2],
    ['Stinking Cloud', 197, 3], ['Cloudkill', 198, 5], ['Incendiary Cloud', 200, 8],
  ];
  const ARCANE_SPELL_DESC = [
    637, 661, 632, 663, 613, 703, 704, 682, 675, 662, 705, 634, 635, 669, 649, 670, 633, 706, 664, 687, 665, 638,
    703, 703, 673, 612, 697, 690, 694, 624, 652, 688, 640, 657, 672, 658, 689, 698, 647, 683, 692, 671, 695, 666,
    676, 699, 655, 685, 679, 641, 700, 654, 648, 677, 686, 693, 702, 684, 625, 701, 687, 693, 697, 698, 699, 701,
  ];
  // Rows 0..59 are the spells a player can learn; 60..65 are creature-only copies.
  const ARCANE_LEARNABLE = 60;
  // Game-effect definitions by effect id: [label, string id] (string id -1 has no name).
  const EFFECTS = [
    ["At Death's Door", 256], ['Rage', 35], ['Winded', 255], ['Turn Undead', 36], ["At Death's Door", 256],
    ['Mage Armor', 63], ["Bull's Strength", 105], ['Resistance', 107], ['Bless', 108], ['Bane', 109],
    ['Shield of Faith', 110], ['Bestow Curse', 112], ['Prayer', 114], ['Under evil Prayer', 254],
    ['Aid', 115], [null, -1], ['Fear', 170], ['Displacement', 118], ['Divine Power', 120],
    ['Blindness', 129], ['Protection from Evil', 132], ['Protection from Good', 133], ['Daze', 135],
    ['Chill Touch', 174], ["Melf's Acid Arrow", 136], ['Spell Resistance', 137], ['Paralyze', 902],
    ['Hold Monster', 140], ['Delay Poison', 143], ['Poison', 144], ['Freedom of Movement', 145],
    ['Vampiric Touch', 146], ['Protected from Poison', 253], ['Detect Magic', 160], ['Light', 162],
    ['Darkness', 163], ['Invisibility Sphere', 171], ['Invisibility', 164], ['Improved Invisibility', 165],
    ['True Seeing', 201], ['Sleep', 169], ['Shield', 168], ['Remove Fear', 166], ['See Invisibility', 172],
    [null, -1], ['Minor Globe of Invulnerability', 175], [null, -1], ['Globe of Invulnerability', 176],
    [null, -1], ['Silence', 177], ['Feeblemind', 178], ['Command', 179], ['Find Traps', 180],
    ['Charm Monster', 182], ['Charm Person', 181], ['Mass Suggestion', 185], ['Dominate Person', 184],
    ['Ghoul Touch', 186], ['Ghoul Touch', 186], ['Blink', 189], ['Haste', 187], ['Slow', 188],
    ['Spiritual Weapon', 190], [null, -1], ['Repulsion', 192], [null, -1], ['Web', 196], [null, -1],
    ['Entangle', 195], [null, -1], ['Stinking Cloud', 197], [null, -1], ['Cloudkill', 198], [null, -1],
    ['Incendiary Cloud', 200], ['Fire Shield', 194], ['Level Drained', 252], ['Greater Rage', 776],
    ["Cat's Grace", 103], ['Protection from Paralysis', 778], ['Defending', 814], ['Poison', 144],
    ['Hold Person', 138], ['Level Drained', 252],
  ];
  // Level id -> [area file name, system string id of the area name, fallback label, multiplayer-only].
  const LEVELS = [
    ['', -1, '(none)', false], ['test', 437, 'Test area', false], ['TestDung', 437, 'Test dungeon', false],
    ['rand', 437, 'Random Dungeon', false], ['drannor', 438, 'Myth Drannor', false],
    ['nr_shrine', 439, 'Stillwater Shrine', false], ['dwlvl1', 440, 'Halls of Light', false],
    ['dwlvl2', 441, 'Halls of Stone', false], ['dwlvl3', 442, 'Main Halls', false],
    ['dwlvl4', 443, 'Deep Halls', false], ['rhon', 444, 'Rhonglyn Room', false],
    ['HOW', 445, 'Hall of Wizards', false], ['hgint1', 446, 'Safekeep Halls', false],
    ['hgint2', 447, 'Hearthhame Halls', false], ['h_twr1', 448, 'Tower, Ground Floor', false],
    ['h_twr2', 449, 'Tower, Upper Floor', false], ['h_twr3', 450, 'The Room of Words', false],
    ['drbarrow', 451, "Dwarven Ruins - The Cold Knight's Barrow", false],
    ['drtrap', 452, 'Dwarven Ruins - Ancient Tomb', false], ['ellvl1', 453, 'Catacombs - First Cellar', false],
    ['ellvl2', 454, 'Catacombs - Second Cellar', false], ['ellvl3', 455, 'Catacombs - Lower Keep', false],
    ['ellvl4', 456, 'Catacombs - The Prisons', false], ['cc1', 457, 'Castle Cormanthor - DragonKin Aerie', false],
    ['cc2', 458, 'Castle Cormanthor - Silverspear Armory', false],
    ['cc3', 459, 'Castle Cormanthor - Hall of Armathors', false], ['pcav', 460, 'The Pool Cavern', false],
    ['liztunn', 461, 'Lizardfolk Tunnel', false], ['castlepass', 462, 'Castle Passage', false],
    ['tumble', 463, 'Hoard Chamber', false], ['kcache', 1034, "Knight's Cache", false],
    ['tut', 464, 'Tutorial', false], ['ruins', 1035, 'Stillwater', false],
    ['cp', 1036, 'Windrider Glade', false], ['marshes', 1038, 'Sullymarsh', false],
    ['hog', 1041, 'House of Gems', false], ['spec', 1042, 'Speculum Grounds', false],
    ['castle', 1040, 'Castle Cormanthor', false], ['druins', 1037, 'The Glim-Gardens', false],
    ['swruins', 1039, 'Nightingale Court', false], ['tut1', 997, 'Tutorial One', false],
    ['tut2', 998, 'Tutorial Two', false], ['mp_castle', 1040, 'Castle Cormanthor (multiplayer)', true],
    ['mp_cp', 1036, 'Windrider Glade (multiplayer)', true], ['mp_spec', 1042, 'Speculum Grounds (multiplayer)', true],
    ['mp_swruins', 1039, 'Nightingale Court (multiplayer)', true],
  ];
  const LEVEL_COUNT = 46;

  // Model id -> model file under data/Anims (the id is the row of the game's figure table).
  const MODEL_PATHS = [
    "arracat/arr.nat", "dracolich/dra.nat", "dragonkin/drg.nat", "dwarfstatue/dwa.nat", "gargoyle/gar.nat", "lizardman/liz.nat",
    "naga/nag.nat", "orc/orc.nat", "ormyrr/orm.nat", "shadow/sha.nat", "wraith/wra.nat", "undeaddrow/udr.nat",
    "undeadorog/uor.nat", "ghoul/gho.nat", "anorrweyn/ano.nat", "beriand/ber.nat", "caalenfaire/caa.nat", "cultfighter/cuf.nat",
    "cultmage/cum.nat", "drowsorcerer/drs.nat", "drowwarrior/drw.nat", "harldain/har.nat", "6mm/6mm.nat", "mordrayn/mor.nat",
    "malgi/mal.nat", "baelnorn/bae.nat", "nashar/nas.nat", "nathlilik/nat.nat", "nottle/not.nat", "6ff/6ff.nat",
    "6mf/6mf.nat", "6ff/6ff.nat", "6mf/6mf.nat", "6mf/6mf.nat", "6fm/6fm.nat", "6mf/6mf.nat",
    "volun/vol.nat", "5FF/5FF.nat", "5MF/5MF.nat", "5MF/5MF.nat", "6mf/6mf.nat", "6ft/6ft.nat",
    "4mf/4mf.nat", "4mt/4mt.nat", "6ff/6ff.nat", "6fm/6fm.nat", "6mm/6mm.nat", "6mt/6mt.nat",
    "8mf/8mf.nat", "3mt/3mt.nat", "3MF/3MF.nat", "3MM/3MM.nat", "4MK/4MK.nat", "4MM/4MM.nat",
    "5FF/5FF.nat", "5FM/5FM.nat", "5FT/5FT.nat", "5MF/5MF.nat", "5MK/5MK.nat", "5MM/5MM.nat",
    "5MT/5MT.nat", "6MK/6MK.nat", "8MK/8MK.nat", "8MM/8MM.nat", "8MT/8MT.nat", "3MK/3MK.nat",
    "objects/Slug.nat", "objects/Door1.nat", "objects/Door2.nat", "objects/Door3.nat", "objects/Door4.nat", "objects/Door5.nat",
    "objects/Door6.nat", "objects/Door7.nat", "objects/Door8.nat", "objects/Door9.nat", "objects/Door10.nat", "objects/Door11.nat",
    "objects/Door12.nat", "objects/Door13.nat", "objects/barrel.nat", "objects/BeerKeg.nat", "objects/BoxSm.nat", "objects/BoxTall.nat",
    "objects/CrateVt.nat", "objects/CrateHz.nat", "objects/ScreenSt.nat", "objects/Bed.nat", "objects/BkCase1.nat", "objects/BkCase2.nat",
    "objects/BkCase3.nat", "objects/BkCase4.nat", "objects/BkCase5.nat", "objects/BkCase6.nat", "objects/BkCase7.nat", "objects/BkCase8.nat",
    "objects/Shelf1.nat", "objects/Shelf2.nat", "objects/Shelf3.nat", "objects/Shelf4.nat", "objects/Shelf5.nat", "objects/Shelf6.nat",
    "objects/Shelf7.nat", "objects/Shelf8.nat", "objects/Table1.nat", "objects/Table2.nat", "objects/Table3.nat", "objects/Table4.nat",
    "objects/Bench1.nat", "objects/Bench2.nat", "objects/Chair.nat", "objects/Stool.nat", "objects/ChestM.nat", "objects/ChestW.nat",
    "objects/Lamp.nat", "objects/ArchT.nat", "objects/Obelsk.nat", "objects/Pillar1.nat", "objects/Pillar2.nat", "objects/Pillar3.nat",
    "objects/Pillar4.nat", "objects/Pillar5.nat", "objects/Pillar6.nat", "objects/DwrvMrkr.nat", "objects/Marker1.nat", "objects/Marker2.nat",
    "objects/Marker3.nat", "objects/Marker4.nat", "objects/Spire.nat", "objects/Rocks1.nat", "objects/Rocks2.nat", "objects/Rocks3.nat",
    "objects/Rocks4.nat", "objects/Pyramid.nat", "objects/Chevron.nat", "objects/Platfrm1.nat", "objects/Platfrm2.nat", "objects/Platfrm3.nat",
    "objects/Platfrm4.nat", "objects/Platfrm5.nat", "objects/Fountan1.nat", "objects/Fountan2.nat", "objects/Well1.nat", "objects/Well2.nat",
    "objects/Coffin.nat", "objects/StairInd.nat", "objects/Stairs.nat", "objects/Beam1.nat", "objects/Beam2.nat", "objects/walkway.nat",
    "objects/RackT.nat", "objects/IronMdn.nat", "objects/Furnace.nat", "objects/Torch.nat", "objects/LampWall.nat", "objects/Tapestry.nat",
    "objects/RugLrg.nat", "objects/RugSml.nat", "objects/Fence.nat", "objects/ScrnLrg1.nat", "objects/ScrnSml1.nat", "objects/bkcase9.nat",
    "objects/LampFlam.nat", "objects/WallFlam.nat", "objects/g_dragon.nat", "objects/g_gobtdn.nat", "objects/g_mystra.nat", "objects/g_song.nat",
    "objects/g_water.nat", "objects/r_clngdn.nat", "objects/r_dmthon.nat", "objects/r_knight.nat", "objects/r_protcr.nat", "objects/wagndoor.nat",
    "objects/portal.nat", "objects/headpole.nat", "objects/rockj.nat", "objects/trnsprtr.nat", "objects/orrypole.nat", "objects/wagndoor.nat",
    "objects/wagndoor.nat", "objects/wagndoor.nat", "objects/boulder.nat", "objects/wagndoor.nat", "objects/nagaidol.nat", "objects/spdridol.nat",
    "objects/treeramp.nat", "objects/trapfall.nat", "objects/ringarm.nat", "objects/wagndoor.nat", "objects/wagndoor.nat", "objects/soulvesl.nat",
    "objects/soulclmn.nat", "objects/wagndoor.nat", "objects/soulglas.nat", "objects/soulhole.nat", "objects/orcidol.nat", "objects/sapphire.nat",
    "objects/eggbody.nat", "objects/eggsac.nat", "objects/orreryA.nat", "objects/orreryB.nat", "objects/bgplanet.nat", "objects/blplanet.nat",
    "objects/grplanet.nat", "objects/orplanet.nat", "objects/rdplanet.nat", "objects/rvplanet.nat", "objects/viplanet.nat", "objects/whplanet.nat",
    "objects/ylplanet.nat", "objects/g_safekp.nat", "objects/r_trap.nat", "objects/emerald.nat", "objects/gemhide.nat", "objects/mossdead.nat",
    "objects/mosslive.nat", "objects/orycage.nat", "objects/spnspire.nat", "objects/omyrmrkr.nat", "objects/pillarSF.nat", "objects/wallfake.nat",
    "objects/scmirror.nat", "objects/g_mythan.nat", "objects/walkway.nat", "objects/rhntran1.nat", "objects/rhntran2.nat", "objects/rhntran3.nat",
    "objects/rhntran4.nat", "objects/rhntran5.nat", "objects/rhonglen.nat", "objects/rhonblue.nat", "objects/rhongren.nat", "objects/rhonred.nat",
    "objects/rhonviol.nat", "objects/rhonyelo.nat", "objects/rhongice.nat", "objects/rhonice2.nat", "objects/flag.nat", "objects/cofnopen.nat",
    "objects/drawbrdg.nat", "objects/hogdoor.nat", "objects/h_water1.nat", "objects/s_water1.nat", "objects/cavnbubl.nat", "objects/poolcav.nat",
    "objects/hogstatu.nat", "objects/specgate.nat", "objects/hogdoor2.nat", "objects/gshrine.nat", "objects/dwdoor.nat", "objects/specdoor.nat",
    "objects/dwdoor2.nat", "objects/dwdoor3.nat", "objects/sedoor.nat", "objects/vineladr.nat", "objects/theatrdr.nat", "objects/hogdrext.nat",
    "objects/stream.nat", "objects/icedoor.nat", "objects/orrise.nat", "objects/orrise1.nat", "objects/orrise2.nat", "objects/orrise3.nat",
    "objects/orrise4.nat", "objects/orhover.nat", "objects/orhover1.nat", "objects/orhover2.nat", "objects/orhover3.nat", "objects/orhover4.nat",
    "objects/orhover5.nat", "objects/orhover6.nat", "objects/orhover7.nat", "objects/orhover8.nat", "objects/orplanet.nat", "objects/orplanet1.nat",
    "objects/orplanet2.nat", "objects/orplanet3.nat", "objects/orplanet4.nat", "objects/orplanet5.nat", "objects/orplanet6.nat", "objects/orplanet7.nat",
    "objects/orplanet8.nat", "objects/dummytot.nat", "objects/orycage.nat", "objects/orychest.nat", "objects/wizseal.nat", "objects/niadwell.nat",
    "objects/swrdbaro.nat", "objects/g_hide.nat", "objects/niadwatr.nat", "objects/trapwall.nat", "objects/cpbridge.nat", "objects/poolgrn.nat",
    "objects/pcavfx.nat", "objects/ca_tor.nat", "objects/spawnh2o.nat", "objects/signmrkb.nat", "objects/signmrkg.nat", "objects/signmrkp.nat",
    "objects/signmrkr.nat", "objects/signmrky.nat", "objects/barlgold.nat", "objects/sarcoph.nat", "objects/trapbox.nat", "objects/tablrect.nat",
    "objects/bedgold.nat", "objects/bkcsgld1.nat", "objects/bkcsgld2.nat", "objects/bkcsgld3.nat", "objects/bkcsgld4.nat", "objects/shlfgld1.nat",
    "objects/shlfgld2.nat", "objects/shlfgld3.nat", "objects/shlfgld4.nat", "objects/bkcsgld5.nat", "objects/spawnanm.nat", "objects/cultstnd.nat",
    "objects/br_platform.nat", "objects/trnsmoss.nat", "objects/dummytra.nat", "objects/trnsmirr.nat", "objects/trnsbook.nat", "objects/trnscave.nat",
    "objects/glyphm_b.nat", "objects/glyphm_r.nat", "objects/glyphm_y.nat",
  ];
  const BODY_RACES = { 3: 'Halfling', 4: 'Dwarf', 5: 'Elf or half-elf', 6: 'Human', 8: 'Half-orc' };
  const BODY_BUILDS = { f: 'fighter build', m: 'spellcaster build', t: 'rogue build', k: 'monk build' };
  // A readable name for a model: character bodies are coded race digit, gender, build letter.
  function modelLabel(id) {
    const path = MODEL_PATHS[id];
    if (!path) return 'Model ' + id;
    const [folder, file] = path.split('/');
    const tag = (file || '').replace(/\.nat$/i, '');
    if (folder === 'objects') return 'Object: ' + tag;
    const body = /^([3-8])([mf])([fmtk])$/i.exec(folder);
    if (body) {
      const race = BODY_RACES[body[1]] || 'Race ' + body[1];
      return race + ' ' + (body[2].toLowerCase() === 'm' ? 'male' : 'female') + ', ' + (BODY_BUILDS[body[3].toLowerCase()] || body[3]);
    }
    return folder.replace(/^./, (c) => c.toUpperCase());
  }
  function isBodyModel(id) {
    const path = MODEL_PATHS[id];
    return Boolean(path && /^[3-8][mf][fmtk]\//i.test(path));
  }
  function modelTag(id) {
    const path = MODEL_PATHS[id];
    return path ? (path.split('/')[1] || '').replace(/\.nat$/i, '') : '';
  }

  const GENDERS = ['Male', 'Female'];

  // Worn-slot bits of an inventory node's slot mask, named after the catalog items that allow each bit.
  const EQUIP_SLOTS = [
    [0x0002, 'Neck'], [0x0004, 'Body armour'], [0x0008, 'Quiver'], [0x0010, 'Hands'],
    [0x0020, 'Off hand (shield or bow)'], [0x0040, 'Weapon hand'], [0x0080, 'Ring 1'], [0x0100, 'Ring 2'],
    [0x0200, 'Feet'],
  ];

  const ENTITY_KINDS = { 2: 'Player character', 3: 'Creature', 4: 'Creature', 7: 'Treasure', 8: 'Object' };
  const OBJECT_SUBTYPES = ['Plain', 'Door / obstruction', 'Consumer', 'Container', 'Effect generator', 'Transporter'];
  const OBJECT_SUBTYPE_HELP = [
    'A scenery object that can be broken but has no other use.',
    'A door, gate or barrier: it opens, closes, can be locked or trapped, and can block the way.',
    'An object that takes an item from the party (for example a slot that accepts a key or gem).',
    'A chest, barrel, crate or other container holding items.',
    'An object that casts a spell or applies an effect when used (fountains, altars, glyphs).',
    'A stairway, ladder, portal or exit that moves the party to another place or area.',
  ];
  // Object states written by the game's open, close and break handlers; 17 and 18 are used by
  // individual object scripts.
  const OBJECT_STATES = {
    14: '14 - initial', 15: '15 - broken', 16: '16 - open', 17: '17 - object specific', 18: '18 - object specific', 19: '19 - closed',
  };
  const OBJECT_STATE_HELP = {
    14: 'The state the object starts in, as placed in the area.',
    15: 'Broken or smashed. Broken doors and barrels stay broken.',
    16: 'Open. Doors are open and passable; containers are open.',
    17: 'A state set by this object\'s own script.',
    18: 'A state set by this object\'s own script.',
    19: 'Closed again after having been opened. A used transporter is also stored as 19.',
  };

  // What clicking a named NPC does, chosen by the roster's script state.
  const NPC_CLICK_STATES = [
    [3, '3 - talks when clicked'], [11, '11 - opens trade when clicked'], [12, '12 - joins the party when clicked'],
    [0, '0 - nothing happens when clicked'],
  ];

  // Named-state kinds and their values.
  const NAMED_STATE_KINDS = { 2: 'Encounter', 3: 'Named object' };
  const NAMED_STATE_HELP = {
    2: 'Remembers the outcome of a named encounter. Value 2 means the party won: the encounter is cleared and does not '
      + 'spawn again. Value 1 means the fight ended without a party victory. Scripts may set other values.',
    3: 'Remembers the state of a named door or object (doors, gates and levers that scripts refer to by name). '
      + 'The low six bits hold the state minus 14: 0 initial, 1 broken, 2 open, 5 closed. Bit 0x40 marks a value the '
      + 'game restored from its own records.',
  };
  const ENCOUNTER_VALUES = [[1, '1 - not won'], [2, '2 - defeated']];

  // The four game options a save carries: [label, explanation].
  const OPTION_FLAGS = [
    ['Run while exploring', 'On: the party runs when you order it to move outside combat. Off: it walks. The game toggles this with Right Shift.'],
    ['Indicators', 'On: a ring is drawn under every character, showing who is where and who is selected.'],
    ['Move and act', 'On: ordering an action on something out of reach (talking, attacking, opening) makes the character walk there first and then act. Off: the order is refused until you are close enough.'],
    ['Floating text', 'On: combat and status messages (damage, misses, effects) float above characters\' heads.'],
  ];

  // Field layouts. Offsets are relative to the start of each fixed record.
  // t: u8 i8 u16 i16 u32 i32 f32 str hex hex16 rgba argb; n = element count; len = string buffer size;
  // help is shown as a tooltip; derived fields are recalculated when the file is written.
  const F = (k, label, o, t, extra) => Object.assign({ k, label, o, t }, extra || {});

  const ACTOR_FIELDS = [
    F('name', 'Name', 0x00, 'str', { len: 80, help: 'The name shown in the game.' }),
    F('type', 'Entity type', 0x50, 'u32', { ro: true, help: '2 player character, 3 or 4 creature, 8 object.' }),
    F('handle', 'Handle', 0x54, 'u32', { ro: true, help: 'The number the game uses to refer to this entity. Party members use 200000000 and up.' }),
    F('model', 'Model', 0x58, 'u32', { enumOf: 'model', help: 'Which 3D model is drawn. For player characters the model encodes race, gender and build.' }),
    F('x', 'Position X', 0x5C, 'f32', { help: 'East-west position in world units.' }),
    F('y', 'Position Y', 0x60, 'f32', { help: 'North-south position in world units (north is larger).' }),
    F('z', 'Position Z', 0x64, 'f32', { help: 'Height in world units.' }),
    F('heading', 'Heading (degrees)', 0x68, 'f32', { help: 'Facing direction.' }),
    F('texBase', 'Look (texture variant)', 0x6C, 'i32', { enumOf: 'look', help: 'Which set of textures the model wears; 0 uses the textures the model names. For characters the game recalculates it from the worn body armour: armour look + 10 x base look.' }),
    F('tex98', 'Gloves look', 0x70, 'i32', { enumOf: 'overlay98', help: '98 when worn gloves are drawn on the hands and lower arms.' }),
    F('tex99', 'Boots look', 0x74, 'i32', { enumOf: 'overlay99', help: '99 when worn boots are drawn on the feet and lower legs.' }),
    F('tint', 'Secondary colour', 0x78, 'rgba', { help: 'Tint colour stored as red, green, blue and alpha bytes.' }),
    F('speed', 'Movement speed', 0x7C, 'f32'),
    F('aware', 'Awareness latch', 0x80, 'u8', { help: 'Set once the actor has noticed the party.' }),
  ];

  const DND_FIELDS = [
    F('maxHp', 'Maximum HP (incl. temporary)', 0x00, 'i32', { help: 'Maximum hit points. The game does not recalculate this from class and level.' }),
    F('curHp', 'Current HP (incl. temporary)', 0x04, 'i32', { help: 'Current hit points. 0 or less is dying or dead.' }),
    F('damage', 'Accumulated damage', 0x08, 'i32'),
    F('tempHp', 'Temporary HP', 0x0C, 'i32', { help: 'Hit points granted by spells such as Aid.' }),
    F('arcaneUsed', 'Arcane slots used (levels 0-9)', 0x10, 'u8', { n: 10, help: 'Arcane spells cast at each spell level since the last rest.' }),
    F('divineUsed', 'Divine slots used (levels 0-9)', 0x1A, 'u8', { n: 10, help: 'Divine spells cast at each spell level since the last rest.' }),
    F('invCount', 'Inventory count', 0x24, 'i32', { ro: true, derived: true }),
    F('fxCount', 'Effect count', 0x28, 'u8', { ro: true, derived: true }),
    F('drain', 'Ability drain', 0x29, 'i8', { n: 6, labels: ABILITIES, help: 'Long-lasting ability loss.' }),
    F('abilityDamage', 'Ability damage', 0x2F, 'i8', { n: 6, labels: ABILITIES, help: 'Temporary ability loss that heals with rest.' }),
    F('roster', 'Roster name', 0x35, 'str', { len: 8, full: true, help: 'Short internal name that links the character to the NPC roster.' }),
    F('conDamageHp', 'CON damage HP adjustment', 0x3D, 'i8'),
    F('conDrainHp', 'CON drain HP adjustment', 0x3E, 'i8'),
  ];

  const PC_FIELDS = [
    F('appearanceA', 'Appearance byte A', 0x00, 'u8', { help: 'Stored and loaded, but nothing that draws the character reads it.' }),
    F('appearanceB', 'Appearance byte B', 0x01, 'u8', { help: 'Stored and loaded, but nothing that draws the character reads it.' }),
    F('appearanceC', 'Appearance byte C', 0x02, 'u8', { help: 'Stored and loaded, but nothing that draws the character reads it.' }),
    F('race', 'Race', 0x03, 'u8', { enumOf: 'race' }),
    F('gender', 'Gender', 0x04, 'u8', { enumOf: 'gender' }),
    F('alignment', 'Alignment', 0x05, 'u8', { enumOf: 'alignment' }),
    F('classCount', 'Class count', 0x06, 'u8', { help: 'How many entries of the class list are in use.' }),
    F('rosterFlag', 'Roster write flag', 0x07, 'u8'),
    F('homeLevel', 'Home area', 0x08, 'i8', { enumOf: 'level', help: 'The area the character belongs to; -1 (stored as 255) means none, which is normal for the party.' }),
    F('classIds', 'Class ids (slot order)', 0x09, 'u8', { n: 8, help: 'Classes in the order taken: 0 Fighter, 1 Barbarian, 2 Ranger, 3 Sorcerer, 4 Cleric, 5 Rogue, 6 Paladin, 7 Monk. 50 marks an unused slot.' }),
    F('classLevels', 'Class levels (by class id)', 0x11, 'u8', { n: 8, help: 'Level in each class, indexed by class id (not by slot).' }),
    F('dailyUses', 'Daily ability uses since rest', 0x19, 'u8', { n: 10, help: 'Uses of limited class abilities (turning, rage, lay on hands and so on) since the last rest.' }),
    F('abilities', 'Base ability scores', 0x23, 'u8', { n: 6, labels: ABILITIES }),
    F('skills', 'Skill ranks', 0x29, 'u8', { n: 13 }),
    F('feats', 'Feat flags', 0x38, 'hex', { help: 'One bit per feat; see Skills & feats.' }),
    F('classFeatures', 'Class feature flags', 0x3C, 'hex', { help: 'Class features listed on the character sheet.' }),
    F('gold', 'Gold', 0x40, 'i32', { help: 'Gold carried by this character.' }),
    F('xp', 'Experience', 0x44, 'i32', { help: 'Experience points. Levels are not raised automatically by editing this.' }),
    F('knownSpells', 'Known spell ids', 0x48, 'u16', { n: 43, ro: true, derived: true }),
    F('knownSpellCount', 'Known spell count', 0x9E, 'u16', { ro: true, derived: true }),
    F('bodyVariant', 'Base look', 0xA0, 'i32', { help: 'The look picked at character creation (1 to 4; ready-made characters use others). With body armour the model wears look armour + 10 x this number.' }),
    F('actionSlots', 'Quick action slots', 0xA4, 'i32', { n: 40, help: 'The quick-bar assignments.' }),
    F('premade', 'Premade character', 0x144, 'u8', { help: '1 for the game\'s ready-made characters.' }),
    F('persistFlag', 'Persisted flag', 0x146, 'u8'),
    F('bankedSkill', 'Banked skill points', 0x148, 'u16', { help: 'Skill points not yet spent.' }),
    F('uniqueId', 'Unique id', 0x14C, 'i32'),
  ];

  const MONSTER_FIELDS = [
    F('monsterId', 'Creature template', 0x00, 'u16', { enumOf: 'monster', help: 'Which creature template (statistics, attacks, sounds) this creature uses. Changing it changes what the creature is.' }),
    F('aiMode', 'AI mode', 0x02, 'u8', { help: 'How the creature behaves when not fighting.' }),
    F('team', 'Team', 0x03, 'u8', { help: 'Creatures on the same team do not fight each other.' }),
    F('spawn', 'Spawn / encounter handle', 0x04, 'i32', { help: 'The encounter this creature was spawned by.' }),
    F('aiParams', 'AI parameters', 0x08, 'u8', { n: 10 }),
    F('patrolCount', 'Patrol point count', 0x12, 'u8'),
    F('patrolCursor', 'Patrol cursor', 0x74, 'u8'),
    F('visible', 'Visible in world', 0x75, 'u8', { help: '0 hides the creature.' }),
    F('anim', 'Pose restore marker', 0x78, 'i32', { help: '5 restores a lying-down pose on load; -1 none.' }),
  ];

  const TREASURE_FIELDS = [
    F('marker', 'Marker id', 0x00, 'i32', { help: 'The area marker this treasure belongs to (-1 for a dropped pile).' }),
    F('equipSet', 'Equipment set', 0x04, 'i32', { enumOf: 'equipSet', help: 'The loot table the treasure was filled from (-1 none).' }),
    F('itemCount', 'Item count', 0x08, 'i32', { ro: true, derived: true }),
    F('gold', 'Gold', 0x0C, 'i32', { help: 'Gold in the pile (-1 none).' }),
    F('fwd', 'Forward vector', 0x10, 'f32', { n: 3 }),
    F('up', 'Up vector', 0x1C, 'f32', { n: 3 }),
    F('pos', 'Position', 0x28, 'f32', { n: 3 }),
  ];

  const OBJECT_FIELDS = [
    F('pos', 'Marker position', 0x00, 'f32', { n: 3, help: 'Position stored with the object record.' }),
    F('model', 'Model', 0x30, 'i32', { enumOf: 'model' }),
    F('homeLevel', 'Home area', 0x34, 'u16', { enumOf: 'level' }),
    F('heading', 'Marker heading', 0x36, 'i16'),
    F('alpha', 'Opacity (x100)', 0x38, 'u8', { help: '100 is fully visible.' }),
    F('brightness', 'Brightness (x10)', 0x39, 'u8'),
    F('colorMode', 'Colour mode', 0x3A, 'u8'),
    F('markerVisible', 'Marker visible', 0x3B, 'u8'),
    F('argb', 'Colour', 0x3C, 'rgba', { help: 'Object colour stored as red, green, blue and alpha bytes.' }),
    F('objName', 'Marker name', 0x40, 'str', { len: 8, full: true, help: 'Names starting 1ZZ, 2ZZ or 3ZZ are remembered in the .sav.sta file; other names are remembered as named states.' }),
    F('state', 'State', 0x48, 'u8', { enumOf: 'objectState' }),
    F('carried', 'Carried', 0x49, 'u8'),
    F('menu', 'Menu enabled', 0x4A, 'u8', { help: '1 if clicking the object shows its action menu.' }),
    F('trapType', 'Trap type', 0x4B, 'u8', { help: '255 = no trap.' }),
    F('keyOrDamage', 'Key item / trap damage', 0x4C, 'i16', { enumOf: 'keyItem', help: 'For a locked door the item that opens it; for a trap its damage.' }),
    F('dialogue', 'Conversation', 0x4E, 'str', { len: 8, full: true, conversation: true, help: 'Conversation started by using the object.' }),
    F('dialogueType', 'Conversation type', 0x56, 'u8'),
    F('kind', 'Interaction kind', 0x57, 'u8', { enumOf: 'objectSubtype' }),
    F('hp', 'Hit points', 0x58, 'u16', { help: 'Damage the object can take before it breaks.' }),
    F('payload', 'Kind payload', 0x5A, 'u8', { n: 10, help: 'Data specific to the interaction kind (for transporters, the destination).' }),
    F('markerId', 'Marker handle', 0x88, 'i32'),
    F('lockTrapArmed', 'Lock / trap armed', 0x8C, 'u8', { help: '1 while the lock or trap is active. 0 leaves it unlocked or disarmed in this save.' }),
    F('trapFound', 'Trap found', 0x8D, 'u8'),
    F('trapResolved', 'Trap resolved', 0x8E, 'u8'),
    F('trapAttempts', 'Trap attempt handles', 0x90, 'i32', { n: 10, help: 'Characters who already tried to disarm the trap.' }),
  ];

  const INV_NODE_FIELDS = [
    F('equipped', 'Equipped', 0x04, 'u8', { help: '1 when worn.' }),
    F('hidden', 'Hidden from grid', 0x05, 'u8'),
    F('slotMask', 'Worn slot', 0x06, 'hex16', { bits: EQUIP_SLOTS, help: 'The slot the item is worn in (only for equipped items).' }),
    F('row', 'Grid row', 0x08, 'u8', { help: 'Backpack row, 0-6.' }),
    F('col', 'Grid column', 0x09, 'u8', { help: 'Backpack column, 0-13.' }),
    F('page', 'Page id', 0x0A, 'u8', { help: 'Backpack page.' }),
  ];
  const EQUIP_FIELDS = [
    F('template', 'Item', 0x00, 'u16', { enumOf: 'item' }),
    F('charges', 'Charges', 0x02, 'u16', { help: 'Uses left for wands, scrolls and potions.' }),
    F('handle', 'Instance handle', 0x04, 'u16', { help: 'Number that tells copies of the same item apart. Must be unique.' }),
    F('identified', 'Identified', 0x06, 'u8', { help: '1 shows the item\'s full name and properties.' }),
  ];

  const EFFECT_FIELDS = [
    F('instance', 'Instance id', 0x00, 'i16'),
    F('def', 'Effect', 0x02, 'i16', { enumOf: 'effect' }),
    F('tick', 'Tick elapsed (ms)', 0x04, 'f32'),
    F('total', 'Total elapsed (ms)', 0x08, 'f32'),
    F('duration', 'Duration (tenths; 0 = permanent)', 0x0C, 'i32', { help: 'How long the effect lasts, in tenths of a second. 0 means it never runs out.' }),
    F('behavior', 'Behaviour', 0x14, 'u8'),
    F('magnitude', 'Magnitude', 0x15, 'i8', { help: 'Strength of the effect, such as a bonus or penalty.' }),
    F('suppressed', 'Suppressed', 0x16, 'u8', { help: '1 while the effect is temporarily inactive.' }),
    F('caster', 'Caster handle', 0x20, 'i32'),
    F('levelParam', 'Caster level parameter', 0x24, 'i32'),
    F('affected', 'Affected handles', 0x28, 'i32', { n: 30 }),
    F('castPos', 'Cast position', 0xA0, 'f32', { n: 3 }),
    F('inCombat', 'Created in combat', 0xB0, 'u8', { help: 'Effects created in combat may end when combat ends.' }),
  ];

  const ROSTER_FIELDS = [
    F('name', 'Name', 0x00, 'str', { len: 12 }),
    F('dead', 'Dead', 0x50, 'u8'),
    F('setchar', 'Script state', 0x54, 'i32'),
    F('buyRate', 'Buys from party at', 0x58, 'f32'),
    F('sellRate', 'Sells to party at', 0x5C, 'f32'),
  ];

  const GAME_MASTER_FIELDS = [
    F('restEnabled', 'Rest enabled', 0x00, 'u8', { help: '1 if the party may rest here.' }),
    F('restSafe', 'Area safe for rest', 0x04, 'u32', { help: '1 if resting here is never interrupted.' }),
    F('restEncA', 'Rest interruption encounters A', 0x08, 'i32', { n: 10, help: 'Encounters that may interrupt a rest (-1 empty).' }),
    F('restMarkers', 'Rest marker count', 0x30, 'u32'),
    F('restEncB', 'Rest interruption encounters B', 0x34, 'i32', { n: 10, help: 'Encounters that may interrupt a rest (-1 empty).' }),
    F('pendingCount', 'Pending item spawn count', 0x5C, 'u8', { help: 'Items waiting to reappear in the world, listed below.' }),
    F('partyCount', 'Party size', 0x3D0, 'u32'),
    F('party', 'Party handles', 0x3D4, 'u32', { n: 6, help: 'Party members in portrait order. Reorder them on the Party page.' }),
  ];

  const ACTOR_LIST_FIELDS = [
    F('current', 'Selected actor handle', 0x00, 'u32', { help: 'The character selected when the save loads.' }),
    F('latches', 'Broadcast latches', 0x04, 'u8', { n: 5 }),
    F('special', 'Special actor handle', 0x0C, 'u32'),
    F('arrival', 'Arrival marker on load (-1 = keep positions)', 0x10, 'i32', { help: 'If set, the game places the party at this arrival marker when the save loads.' }),
  ];

  const GROUP_FIELDS = [
    F('leader', 'Leader handle', 0x00, 'u32'),
    F('followers', 'Follower count', 0x04, 'u32', { ro: true, derived: true }),
    F('active', 'Formation active', 0x08, 'u8', { help: '1 when the party walks in formation.' }),
    F('facing', 'Leader facing', 0x0C, 'f32'),
  ];
  const FOLLOWER_FIELDS = [
    F('handle', 'Handle', 0x00, 'u32'),
    F('dx', 'Offset X', 0x04, 'f32', { help: 'Formation offset from the leader.' }),
    F('dy', 'Offset Y', 0x08, 'f32'), F('dz', 'Offset Z', 0x0C, 'f32'),
  ];

  const MAP_FIELDS = [
    F('level', 'Area', 0x00, 'u32', { enumOf: 'level', ro: true }),
    F('region', 'Region id', 0x04, 'u8'),
    F('seed', 'Region seed index', 0x05, 'u8'),
    F('visited', 'Visited', 0x07, 'u8', { help: '1 once the party has been here.' }),
    F('originX', 'Draw origin X', 0x08, 'i32'), F('originY', 'Draw origin Y', 0x0C, 'i32'),
    F('gridX', 'Tiles across', 0x10, 'i32', { ro: true }), F('gridY', 'Tiles down', 0x14, 'i32', { ro: true }),
  ];
  const MAP_PIN_FIELDS = [
    F('fx', 'Across (0-1)', 0x00, 'f32'), F('fy', 'Down (0-1)', 0x04, 'f32'),
    F('label', 'Label', 0x08, 'str', { len: 256 }),
  ];
  const MAP_OBJECT_FIELDS = [
    F('marker', 'Marker handle', 0x00, 'i32'),
    F('fx', 'Across (0-1)', 0x04, 'f32'), F('fy', 'Down (0-1)', 0x08, 'f32'),
    F('w', 'Width', 0x0C, 'i32'), F('h', 'Height', 0x10, 'i32'),
    F('dir', 'Direction', 0x14, 'f32', { n: 3 }),
    F('argb', 'Colour', 0x20, 'argb', { help: 'Marker colour stored as alpha, red, green and blue bytes.' }),
    F('type', 'Marker type', 0x24, 'i32'),
  ];

  const MP_WORLD_FIELDS = [
    F('worldSeed', 'World seed', 0x00, 'u32', { help: 'Seed for the randomly generated dungeons.' }),
    F('dungeon', 'Current dungeon', 0x04, 'i32'),
    F('level', 'Current level', 0x08, 'i32'),
    F('difficulty', 'Difficulty', 0x0C, 'i32'),
    F('encounterSeed', 'Encounter seed', 0x10, 'u32'),
  ];

  const SLOT_BITS = EQUIP_SLOTS;
  const CLASS_BITS = CLASSES.map(([name], id) => [1 << id, name]);
  // Feats with no rule for creatures; they still carry over if the creature joins the party.
  const FEATS_INERT_ON_CREATURES = [0, 8, 11, 15, 17];
  const FEAT_BITS = FEATS.map(([name], i) => [1 << i, name,
    FEATS_INERT_ON_CREATURES.includes(i) ? 'No effect on a creature; carries over if it joins the party.' : '']);

  // Divine spells, in the order creature spell lists and item effects refer to them: [label, string id].
  const DIVINE_SPELLS = [
    ['Cure Minor Wounds', 100], ['Detect Magic', 160], ['Light', 162], ['Resistance', 106], ['Bless', 108],
    ['Cause Fear', 116], ['Command', 179], ['Cure Light Wounds', 64], ['Bane', 109], ['Entangle', 195],
    ['Inflict Light Wounds', 122], ['Protection from Evil', 132], ['Protection from Good', 133], ['Remove Fear', 166],
    ['Shield of Faith', 110], ['Aid', 115], ['Cure Moderate Wounds', 65], ['Darkness', 163], ['Find Traps', 180],
    ['Hold Person', 139], ['Inflict Moderate Wounds', 123], ['Remove Paralysis', 167], ['Silence', 177],
    ['Delay Poison', 143], ['Spiritual Weapon', 190], ["Bull's Strength", 104], ['Bestow Curse', 112],
    ['Blindness', 129], ['Remove Blindness', 111], ['Cure Serious Wounds', 101], ['Dispel Magic', 193],
    ['Hold Poison', 150], ['Inflict Serious Wounds', 124], ['Prayer', 114], ['Remove Curse', 113],
    ['Searing Light', 134], ['Cure Critical Wounds', 102], ['Divine Power', 120], ['Inflict Critical Wounds', 125],
    ['Freedom of Movement', 145], ['Neutralize Poison', 142], ['Poison', 144], ['Restoration', 173],
    ['Flame Strike', 155], ['Spell Resistance', 137], ['Raise Dead', 158], ['Slay Living', 141], ['True Seeing', 201],
    ['Harm', 121], ['Heal', 149], ['Destruction', 117], ['Resurrection', 159], ['Fire Storm', 152], ['Entangle', 195],
    ['Sleep', 169],
  ];
  const DIVINE_SPELL_DESC = [
    707, 661, 663, 613, 614, 622, 680, 708, 615, 696, 628, 634, 635, 667, 616, 621, 709, 664, 681, 640, 629, 668, 678,
    644, 691, 612, 618, 633, 617, 710, 694, 651, 630, 620, 619, 636, 711, 626, 631, 646, 643, 645, 674, 656, 639, 659,
    642, 702, 627, 650, 623, 660, 653, 696, 781,
  ];

  // Creature special abilities (monsters.mon slots, 255 = empty). Names describe the effect each one applies.
  const SPECIAL_ABILITIES = [
    ['Divine power', 'Applies Divine Power. A creature with this ability also sees invisible creatures permanently.'],
    ['Fear aura', 'A permanent aura that frightens nearby enemies; applied when the creature appears.'],
    ['Breath weapon (16d10)', 'A breath attack dealing 16d10 damage.'],
    ['Holding gaze', 'A gaze that holds its target in place.'],
    ['Cold touch (2d8)', 'A touch dealing 2d8 cold damage.'],
    ['Paralysing touch (A)', 'A touch that paralyses its target.'],
    ['Paralysing touch (B)', 'A touch that paralyses its target.'],
    ['Paralysing touch (C)', 'A touch that paralyses its target.'],
    ['Poison', 'A poisonous attack.'],
    ['Strength drain', 'An attack that drains Strength.'],
    ['Level drain (A)', 'An attack that drains levels.'],
    ['Constitution drain', 'An attack that drains Constitution.'],
    ['Slow poison (A)', 'A poison whose damage arrives over time.'],
    ['Slow poison (B)', 'A poison whose damage arrives over time.'],
    ['Level drain (B)', 'An attack that drains levels.'],
    ['Stun', 'An attack that stuns its target.'],
    ['Quivering palm', 'A touch that can kill outright.'],
  ];

  // The 64-bit creature description the game builds from monsters.mon (+0x0D low word, +0x11 high word). The same
  // bit numbers describe attacks: an immunity on the target (see COND_SAVE_BITS) blocks attacks carrying the bit,
  // and item effects use them to apply only against matching creatures. [mask, label, explanation].
  const DESCRIPTOR_LO_BITS = [
    [1 << 0, 'Unnamed bit 0', 'Set on arraccats and nagas; no rule that reads it was found.'],
    [1 << 2, 'Unnamed bit 2', 'No rule that reads it was found.'],
    [1 << 3, 'Unarmed attack', 'Marks a monk\'s unarmed strike. Item effects use it to apply only to unarmed attacks.'],
    [1 << 5, 'Unnamed bit 5', 'No rule that reads it was found.'],
    [1 << 6, 'Construct', 'Searing Light deals 1d6 per two caster levels to it. Immune to Stunning Attack and Quivering Palm.'],
    [1 << 7, 'Dragon', 'Rangers of level 15 or higher have dragons as a favoured enemy.'],
    [1 << 8, 'Unnamed bit 8', 'Set on statues and gargoyles; no rule that reads it was found.'],
    [1 << 10, 'Fire', 'Its attacks are fire attacks: creatures immune to fire ignore them.'],
    [1 << 12, 'Orc', 'Rangers have orcs as a favoured enemy from level 1.'],
    [1 << 13, 'Humanoid (person)', 'Charm Person, Hold Person and Dominate Person can affect it if it is Medium or smaller. Player characters always count as humanoid.'],
    [1 << 15, 'Magical', 'Shows up under Detect Magic. Every spell carries this bit, so creatures immune to magic ignore spells.'],
    [1 << 17, 'Unnamed bit 17', 'Set on dragon-kin; no rule that reads it was found.'],
    [1 << 18, 'Incorporeal', 'Its attacks are touch attacks that ignore armour and shields. It does not block movement or line of sight and can appear overlapping others.'],
    [1 << 19, 'Mindless', 'Gets no saving throw against Halt Undead.'],
    [1 << 20, 'Passes through things', 'Does not block movement or line of sight, like an incorporeal creature, but its attacks are normal.'],
    [1 << 21, 'Gargoyle', 'Immune to Stunning Attack and Quivering Palm.'],
    [1 << 22, 'Unnamed kind (bit 22)', 'Immune to Stunning Attack and Quivering Palm.'],
    [1 << 23, 'Reptile', 'Rangers of level 5 or higher have reptiles as a favoured enemy.'],
    [1 << 26, 'Undead', 'Can be turned. Heal and Harm work in reverse; Disrupt, Halt and Control Undead affect it; immune to several effects; does not bleed.'],
    [1 << 27, 'Trap rune', 'Used by item effects that apply only against trap runes.'],
    [1 << 28, 'Light-sensitive', '-1 to attack outdoors between 10:00 and 14:00 unless under Darkness. Searing Light deals 1d8 per caster level to it.'],
    [1 << 29, 'Drow', 'Together with Humanoid and Light-sensitive, rangers of level 10 or higher have it as a favoured enemy.'],
    [1 << 30, 'Cold', 'Its attacks are cold attacks: creatures immune to cold ignore them.'],
    [1 << 31, 'Poison', 'Its attacks are poison attacks: creatures immune to poison ignore them.'],
  ];
  const DESCRIPTOR_HI_BITS = [
    [1 << 0, 'Electricity', 'Its attacks are electricity attacks.'],
    [1 << 1, 'Evil', 'The game also sets this from an evil alignment.'],
    [1 << 2, 'Neutral', 'The game also sets this from a neutral alignment.'],
    [1 << 3, 'Good', 'The game also sets this from a good alignment.'],
    [1 << 4, 'Fear', 'Its attacks are fear effects.'],
    [1 << 5, 'Sleep', 'Its attacks are sleep effects.'],
    [1 << 6, 'Charm', 'Its attacks are charm effects.'],
    [1 << 7, 'Acid', 'Its attacks are acid attacks.'],
    [1 << 8, 'Mind-affecting', 'Its attacks are mind-affecting.'],
    [1 << 9, 'Hold', 'Its attacks hold the target.'],
    [1 << 10, 'Death', 'Its attacks are death effects.'],
    [1 << 11, 'Paralysis', 'Its attacks paralyse.'],
  ];

  // Immunities (monsters.mon +0x29). Bit n pairs with saving-throw bonus slot n at +0x2D.
  const COND_SAVE_BITS = [
    [1 << 0, 'Sleep', 'Immune to sleep. Also immune to critical hits, sneak attacks and favoured-enemy damage.'],
    [1 << 1, 'Charm and compulsion', 'Immune to charm and compulsion effects.'],
    [1 << 2, 'Daze, confusion, feeblemind', 'Immune to daze, confusion and feeblemind.'],
    [1 << 3, 'Unnamed bit 3', 'Set on some templates; no rule that reads it was found.'],
    [1 << 4, 'Cold', 'Immune to cold attacks and spells.'],
    [1 << 5, 'Electricity', 'Immune to electricity attacks and spells.'],
    [1 << 6, 'Hold', 'Immune to hold effects.'],
    [1 << 7, 'Death effects', 'Immune to death effects.'],
    [1 << 8, 'Cannot be turned', 'Turn Undead has no effect on it.'],
    [1 << 9, 'Poison', 'Immune to poison.'],
    [1 << 10, 'Paralysis', 'Immune to paralysis.'],
    [1 << 11, 'Low-level casters', 'Unaffected by spells from casters below level 6.'],
    [1 << 12, 'Magic weapons', 'A weapon\'s magical bonus does not count against it: the bonus is taken off attack and damage.'],
    [1 << 13, 'Fire', 'Immune to fire, including the damage from touching a Fire Shield.'],
    [1 << 14, 'Acid', 'Immune to acid.'],
    [1 << 15, 'All spells', 'Immune to every spell.'],
    [1 << 16, 'Unnamed bit 16', 'Set on some templates; no rule that reads it was found.'],
  ];
  const COND_SAVE_SHORT = ['Sleep', 'Charm', 'Daze', 'Bit 3', 'Cold', 'Elec.', 'Hold', 'Death', 'Turn', 'Poison', 'Paral.', 'Low lvl', 'Magic wpn', 'Fire', 'Acid', 'Spells'];

  // Size: [label, attack modifier]. Size does not change armour class; fold that into the base armour class.
  const CREATURE_SIZES = ['Fine', 'Diminutive', 'Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Colossal'];
  const SIZE_ATTACK_MOD = [8, 4, 2, 1, 0, -1, -2, -4, -8];
  const ATTACK_KINDS = [
    [0, '0 - natural melee', 'A bite, claw or slam using the dice of this row.'],
    [1, '1 - natural ranged', 'A ranged natural attack using the dice of this row.'],
    [2, '2 - equipped weapon', 'Attacks with the weapon the creature carries; the dice of this row are ignored.'],
  ];
  const SOUND_CATEGORIES = ['Cat. 0', 'Cat. 1', 'Cat. 2', 'Attacks', 'Cat. 4', 'Cat. 5', 'Cat. 6', 'Cat. 7', 'Cat. 8'];

  // Creature template record in monsters.mon (0xE4 bytes), followed by attackCount 9-byte attack rows.
  // group places the field in a section of the template editor.
  const CREATURE_TEMPLATE_FIELDS = [
    F('nameStr', 'Name line', 0x00, 'i32', { group: 'id', help: 'Line of data/str/monsters.str holding the creature\'s name.' }),
    F('uniqueId', 'Unique id', 0xE0, 'i32', { group: 'id', help: 'Encounters in the area files find their creature by this number; saves use the template\'s position in the file instead. Each template needs its own value.' }),
    F('asset', 'Model', 0x04, 'i32', { group: 'id', enumOf: 'model', help: 'The 3D model drawn for this creature.' }),
    F('texture', 'Look (texture variant)', 0x08, 'i32', { group: 'id', enumOf: 'look', help: 'Which set of textures the model wears. Several creatures share a model and differ only in look, for example zombie, ghoul, ghast and skeleton.' }),
    F('size', 'Size', 0x0C, 'u8', { group: 'id', enumOf: 'creatureSize', help: 'Changes attack rolls (+1 Small, -1 Large and so on) and Hide checks. Charm Person, Hold Person and Dominate Person need Medium or smaller. Size does not change armour class.' }),
    F('alignment', 'Alignment', 0x41, 'u8', { group: 'id', enumOf: 'alignment', help: 'Adds the evil, neutral or good description bit. Also used if the creature joins the party.' }),
    F('xp', 'Experience value', 0x15, 'i32', { group: 'id', help: 'Experience for defeating it. Each party member gets the total for the fight divided by ten times the party size (doubled in multiplayer).' }),
    F('level', 'Hit dice (level)', 0x1A, 'u8', { group: 'hp', help: 'How many hit dice the creature has. In random dungeons its hit points are rolled as this many dice (see Hit die). It also limits Sleep and Circle of Death, sets how hard it is to turn, and sets the level of its spawn effects. It does not change attacks, saves or experience.' }),
    F('hitDie', 'Hit die (sides)', 0x19, 'u8', { group: 'hp', help: 'The die rolled once per hit die for hit points, for example 10 for d10. The info bubble shows "HD 8D10".' }),
    F('hpBonus', 'Hit point bonus', 0x1B, 'u8', { group: 'hp', help: 'A flat amount added to the rolled hit points. Constitution is not added on top.' }),
    F('ac', 'Armour class before Dexterity and gear', 0x21, 'u8', { group: 'def', help: 'The creature\'s whole armour class apart from its Dexterity bonus, worn armour, shield and spell effects. It already includes the base 10, size and natural armour. Touch attacks still face it. Example: 13 here, Dexterity 15 (+2) and chain armour (+5) give armour class 20.' }),
    F('sr', 'Spell resistance', 0x3E, 'u8', { group: 'def', help: 'A caster must roll at least this on d20 + caster level for a spell to affect it. 0 = none.' }),
    F('combatFlags', 'Weapon needed to hurt it', 0x28, 'u8', { group: 'def', help: 'Attacks need a weapon of at least this magical bonus to do damage; weaker weapons do none ("Your weapon is ineffective"). 0 = any weapon.' }),
    F('condSave', 'Immunities', 0x29, 'hex', { group: 'imm', bits: COND_SAVE_BITS, help: 'Attacks and spells of a ticked kind have no effect on the creature.' }),
    F('condSaveBonus', 'Saving throw bonus against', 0x2D, 'i8', { group: 'imm', n: 16, labels: COND_SAVE_SHORT, help: 'Bonus to saving throws against the kind of attack in the same position. It only counts where an immunity is bypassed, such as the half damage of Flame Strike. Bit 3, Turn, Low lvl and Magic wpn are never read.' }),
    F('propsLo', 'Description (part 1)', 0x0D, 'hex', { group: 'props', bits: DESCRIPTOR_LO_BITS, help: 'What the creature is. These bits drive favoured enemies, spells that only work on some creatures, and the kind of damage its attacks do.' }),
    F('propsHi', 'Description (part 2)', 0x11, 'hex', { group: 'props', bits: DESCRIPTOR_HI_BITS, help: 'Further attack kinds. Evil, neutral and good are added from the alignment.' }),
    F('dexAc', 'Initiative modifier', 0x1C, 'i8', { group: 'off', help: 'Initiative is d20 plus this number. Despite its position next to the armour fields, it is not part of armour class.' }),
    F('speed', 'Movement speed', 0x1D, 'i16', { group: 'off', help: 'Same scale as player races: 60 is 30 feet. Creatures move at four fifths of it, and half that while slowed.' }),
    F('melee', 'Melee attack bonus', 0x24, 'i8', { group: 'off', help: 'Base melee attack bonus. Strength and size are added; each extra attack in a round is 5 lower.' }),
    F('ranged', 'Ranged attack bonus', 0x25, 'i8', { group: 'off', help: 'Base ranged attack bonus. Dexterity and size are added.' }),
    F('saves', 'Base saving throws', 0x49, 'i8', { group: 'abil', n: 3, labels: ['Fort', 'Ref', 'Will'], help: 'Constitution, Dexterity and Wisdom modifiers, spell effects and feats are added.' }),
    F('abilities', 'Ability scores', 0x4C, 'u8', { group: 'abil', n: 6, labels: ABILITIES, help: 'Modifiers for attack, damage, armour class and saves are worked out from these scores. Ability damage and drain change the score shown in the game but not those modifiers.' }),
    F('skills', 'Skill values', 0xD0, 'i8', { group: 'abil', n: 6, labels: ['Hide', 'Move Sil.', 'Listen', 'Spot', 'Danger', 'Conc.'], help: 'The game uses half of each stored value.' }),
    F('creatureFlags', 'Feats', 0xCC, 'hex', { group: 'feat', bits: FEAT_BITS, help: 'Same bits as a player character\'s feats. They are copied over if the creature joins the party.' }),
    F('classIds', 'Classes', 0xC4, 'i8', { group: 'feat', n: 2, enumOf: 'classOrNone', help: 'Up to two classes. They give favoured enemies, sneak attack, smiting, turning, spells per day (Sorcerer for arcane, Cleric for divine) and the class shown in the info bubble.' }),
    F('classLevels', 'Class levels', 0xC6, 'u8', { group: 'feat', n: 2, help: 'Level in the class in the same position.' }),
    F('special', 'Special abilities', 0x54, 'u8', { group: 'spec', n: 10, enumOf: 'specialAbility', help: 'Abilities the creature uses in combat. Some fire automatically on a hit; others are used by its AI.' }),
    F('specialRecharge', 'Turns between uses', 0x5E, 'u8', { group: 'spec', n: 10, help: 'Turns the ability in the same position needs before it can be used again. 0 = every turn.' }),
    F('arcane', 'Arcane spells', 0x6A, 'i16', { group: 'spell', n: 20, enumOf: 'arcaneSpell', help: 'Arcane spells the creature can cast. Spells per day follow its Sorcerer level.' }),
    F('divine', 'Divine spells', 0x92, 'i16', { group: 'spell', n: 20, enumOf: 'divineSpell', help: 'Divine spells the creature can cast. Spells per day follow its Cleric level.' }),
    F('equipSet', 'Equipment set (random dungeons)', 0x52, 'u16', { group: 'gear', enumOf: 'equipSet', help: 'Items the creature carries when placed by a random dungeon. Creatures in the campaign areas get their items from the encounter instead.' }),
    F('aiDefaults', 'AI parameters (random dungeons)', 0xBA, 'u8', { group: 'gear', n: 10, help: 'Behaviour settings copied to creatures placed by a random dungeon. Positions 0, 2, 3 and 7 are read; their meaning is not known.' }),
    F('sounds', 'Sounds', 0xD6, 'u8', { group: 'gear', n: 9, labels: SOUND_CATEGORIES, enumOf: 'soundVariant', help: 'Which sound file variant plays for each kind of sound: 254 none, 255 the plain file, other numbers a numbered file.' }),
  ];

  const CREATURE_ATTACK_FIELDS = [
    F('kind', 'Kind', 0x0, 'u8', { enumOf: 'attackKind' }),
    F('charge', 'Recharge', 0x1, 'u8', { help: 'Turns before this attack can be used again. 0 = every turn.' }),
    F('range', 'Range (ft)', 0x3, 'u16', { help: 'Reach or range in feet. Values below 9 count as 9.' }),
    F('select', 'Next', 0x5, 'u8', { help: 'The attack row used after this one.' }),
    F('dieCount', 'Dice', 0x7, 'u8', { help: 'Number of damage dice.' }),
    F('dieSides', 'Sides', 0x6, 'u8', { help: 'Sides of each damage die.' }),
    F('bonus', 'Bonus', 0x8, 'u8', { help: 'Added to the dice, with the Strength modifier (ranged attacks only take a Strength penalty). At least 1 damage is dealt.' }),
  ];

  // ---- item catalog (TEE.trs) ----------------------------------------------------------------

  const ITEM_TYPES = [
    [0, '0 - dummy', 'Placeholder record.'],
    [1, '1 - melee weapon', ''],
    [2, '2 - bow or sling', 'Fires ammunition from the quiver (slings need none).'],
    [3, '3 - thrown weapon', ''],
    [4, '4 - body armour', 'Its armour class bonus counts; it sets the body look and footsteps.'],
    [5, '5 - shield', 'Its armour class bonus counts.'],
    [6, '6 - ammunition or charged accessory', 'Quivers, salves and some rings. Used up when its charges reach 0.'],
    [7, '7 - document', ''],
    [8, '8 - general item', ''],
    [9, '9 - potion', 'Used up when its charges reach 0.'],
    [10, '10 - scroll', 'Used up when its charges reach 0.'],
    [11, '11 - wand', 'Used up when its charges reach 0.'],
  ];
  // 3D models drawn in the hand and on the ground (data/WSM/<name>.wsm).
  const ITEM_MODELS = [
    ['2hndswd', 'Two-handed sword'], ['arrow', 'Arrow'], ['axe', 'Axe'], ['battleaxe', 'Battleaxe'], ['brdaxe', 'Broad axe'],
    ['dagger', 'Dagger'], ['falchion', 'Falchion'], ['halberd', 'Halberd'], ['longbow', 'Longbow'], ['mase', 'Mace'],
    ['pike', 'Pike'], ['scimitar', 'Scimitar'], ['shield', 'Large shield'], ['shortbow', 'Shortbow'], ['shortsword', 'Short sword'],
    ['slingshot', 'Sling'], ['spear', 'Spear'], ['staff', 'Staff'], ['2hwarhammer', 'Two-handed warhammer'], ['warhammer', 'Warhammer'],
    ['combathammer', 'Combat hammer'], ['deathbane', 'Deathbane'], ['flameblade', 'Flame blade'], ['helmcleaver', 'Helmcleaver'],
    ['magichammer', 'Magic hammer'], ['mountinfist', 'Mountain fist'], ['spikemase', 'Spiked mace'], ['stfoflight', 'Staff of light'],
    ['wand', 'Wand'], ['pouch', 'Pouch'], ['book', 'Book'], ['shieldsm', 'Small shield'], ['club', 'Club'],
    ['cultshld', 'Cult shield'], ['drowshld', 'Drow shield'], ['mnstshld', 'Monster shield'],
  ];
  // Inventory pictures (data/Interface/<name>.bmp), by the item's picture number.
  const ITEM_ICONS = [
    '2hwarhmr', 'arrow', 'broadaxe', 'btlaxe', 'halberd', 'longbow', 'mase', 'pike', 'scimitar', 'shrtbow', 'shrtswrd',
    'slngshot', 'spear', 'staff', 'warhmr', 'falchion', 'shldlrg', 'bootsmgc', 'blustone', 'helmclvr', 'deathbn', 'emrldwv',
    'skllprst', 'flamebld', '2hsword', 'dagger', 'axe', 'gnltmgc', 'armrplt2', 'armrplt1', 'armrchn2', 'armrchn1', 'armrlthr2',
    'armrlthr1', 'mntnfist', 'ringclng', 'healposA', 'cmbthmr', 'wtrbell', 'hgkey', 'wand', 'hideword', 'spkmase', 'magichmr',
    'KeyDmthn', 'boreabld', 'wztorc', 'wztorcng', 'StfLight', 'MageShld', 'crsdneck', 'necklace', 'tumblebar', 'cultmdln',
    'mdlmstra', 'hideword', 'shldsml', 'club', 'ringarm', 'book', 'bookmtl', 'gldcoins', 'stonehead', 'ring', 'ruby',
    'starstone', 'quiver', 'letter', 'gems', 'gnltmoan', 'ekeygren', 'ekeyprpl', 'ekeyred', 'ekeyyelo', 'dkeygren',
    'dkeyprpl', 'dkeyred', 'dkeyyelo', 'keyblue', 'gnltlthr', 'boots', 'ring2', 'potion2', 'potion3', 'scroll2', 'wand2',
    'salvejar',
  ];
  // Picture numbers with rules attached to them.
  const ICON_RULES = {
    1: 'Counts as ammunition in menus.', 66: 'Counts as ammunition in menus.', 11: 'A sling: fires without a quiver.',
    28: 'Metal armour: Shocking Grasp gets +3 against the wearer.', 29: 'Metal armour: Shocking Grasp gets +3 against the wearer.',
    30: 'Metal armour: Shocking Grasp gets +3 against the wearer.', 31: 'Metal armour: Shocking Grasp gets +3 against the wearer.',
    86: 'Used like a potion.',
  };
  const DAMAGE_TYPE_BITS = [
    [1, 'Piercing', 'Skeletons take half damage from piercing weapons.'],
    [2, 'Slashing', 'Skeletons take half damage from slashing weapons.'],
    [4, 'Bludgeoning', ''],
  ];
  const BODY_LOOKS = [
    [-1, '-1 - none', 'Wearing it does not change the body.'],
    [0, '0 - leather or hide', 'Body armour drawn as leather; sets leather footsteps.'],
    [1, '1 - chain', 'Body armour drawn as chain mail; sets chain footsteps.'],
    [2, '2 - plate', 'Body armour drawn as plate; sets plate footsteps.'],
    [98, '98 - gloves', 'Draws gloves on the hands and lower arms.'],
    [99, '99 - boots', 'Draws boots on the feet and lower legs.'],
  ];
  const BONUS_TYPES = [
    [0, '0 - untyped (always adds up)'], [1, '1'], [2, '2 - enhancement'], [3, '3'], [4, '4'], [5, '5'], [6, '6 - luck'],
    [7, '7'], [8, '8'], [9, '9'], [10, '10'], [11, '11'], [12, '12'], [13, '13'],
  ];
  const SPELL_SOURCES = [[0, '0 - arcane spell'], [1, '1 - divine spell'], [2, '2 - creature ability'], [255, '255 - none']];

  // Item template record in TEE.trs (72 bytes); saves refer to an item by its item id.
  const ITEM_TEMPLATE_FIELDS = [
    F('type', 'Item type', 0x00, 'i16', { group: 'basic', enumOf: 'itemType' }),
    F('icon', 'Picture', 0x0E, 'i32', { group: 'basic', enumOf: 'itemIcon', help: 'The inventory picture. Some pictures carry rules: arrows and quivers count as ammunition, the sling picture needs no quiver, chain and plate pictures count as metal armour.' }),
    F('model', '3D model', 0x0A, 'i32', { group: 'basic', enumOf: 'itemModel', help: 'Drawn in the hand and on the ground. The dagger and two-handed warhammer models also change the stance.' }),
    F('value', 'Gold value', 0x12, 'u32', { group: 'basic', help: 'Base price; merchants multiply it by their buying or selling rate.' }),
    F('weight', 'Weight', 0x16, 'i16', { group: 'basic', help: 'Negative values lighten the load (Gauntlets of Light Burden are -50). The carried total never goes below 0.' }),
    F('gridW', 'Backpack columns', 0x19, 'u8', { group: 'basic', help: 'Width in backpack cells (25 pixels each).' }),
    F('gridH', 'Backpack rows', 0x18, 'u8', { group: 'basic', help: 'Height in backpack cells.' }),
    F('slotMask', 'Can be worn on', 0x1A, 'hex16', { group: 'use', bits: EQUIP_SLOTS, help: 'Slots that accept the item. None ticked: it cannot be equipped, but its effects still work from the backpack.' }),
    F('classMask', 'Usable by classes', 0x1C, 'hex16', { group: 'use', bits: CLASS_BITS, help: 'Classes allowed to equip or use the item. Effects only work for these classes.' }),
    F('size', 'Size', 0x1E, 'u8', { group: 'use', enumOf: 'itemSize', help: 'For weapons: larger than the wielder makes it two-handed (with extra Strength damage); more than one size larger cannot be used. Large body armour counts as heavy and slows running.' }),
    F('pickup', 'Conversation on pick-up', 0x3E, 'str', { group: 'use', len: 8, full: true, help: 'A conversation started when the item enters the inventory.' }),
    F('respawn', 'Returns if its holder is destroyed', 0x36, 'u8', { group: 'use', enumOf: 'yesNo', help: 'For quest items: put back into the world if the container, treasure or creature holding it is destroyed. Single player only.' }),
    F('autoIdentify', 'Identified by resting', 0x37, 'u8', { group: 'use', enumOf: 'yesNo', help: 'Resting marks the item identified. Once identified, its tooltip shows the plain name above the true name.' }),
    F('damageType', 'Damage type', 0x1F, 'u8', { group: 'weapon', bits: DAMAGE_TYPE_BITS }),
    F('dieCount', 'Damage dice', 0x21, 'u8', { group: 'weapon', help: 'Damage is dice x d(sides) + bonus, shown as for example 1d8+1.' }),
    F('dieSides', 'Damage die sides', 0x20, 'u8', { group: 'weapon' }),
    F('dmgBonus', 'Damage bonus', 0x22, 'u8', { group: 'weapon', help: 'Added to every damage roll (0 to 255).' }),
    F('critMin', 'Critical threat from', 0x23, 'u8', { group: 'weapon', help: 'Lowest d20 roll that threatens a critical hit: 19 means 19-20. Improved Critical doubles the range.' }),
    F('critMult', 'Critical multiplier', 0x24, 'u8', { group: 'weapon', help: 'Damage dice rolled this many times on a critical hit.' }),
    F('range', 'Reach or range (feet)', 0x25, 'u16', { group: 'weapon', help: 'Melee: reach (5, or 10 for reach weapons). Ranged and thrown: range increment; the most is ten increments.' }),
    F('missileSpeed', 'Missile speed', 0x27, 'f32', { group: 'weapon', help: 'Projectile speed. When firing a bow the quiver\'s value is used.' }),
    F('missileVisual', 'Missile drawn', 0x32, 'i16', { group: 'weapon', enumOf: 'missileVisual', help: 'Without a quiver, 2 still shows an arrow in flight and other values show none. With a quiver the arrow is always shown.' }),
    F('acBonus', 'Armour class bonus', 0x2B, 'i8', { group: 'armour', help: 'Counts only for body armour and shields.' }),
    F('maxDex', 'Maximum Dexterity bonus', 0x2C, 'u8', { group: 'armour', help: 'Body armour only: the largest Dexterity bonus to armour class the wearer keeps.' }),
    F('checkPenalty', 'Armour check penalty', 0x2D, 'i8', { group: 'armour', help: 'Added up over everything worn; applies to skills such as Hide and Move Silently.' }),
    F('spellFail', 'Arcane spell failure (%)', 0x2E, 'u8', { group: 'armour', help: 'Added up over everything worn.' }),
    F('speed30', 'Speed change, 30-ft races', 0x2F, 'i8', { group: 'armour', help: 'Body armour: speed change in half-feet (-20 is -10 feet). Other equipped items: change in feet ("Movement +10").' }),
    F('speed20', 'Speed change, 20-ft races', 0x30, 'i8', { group: 'armour', help: 'The same for dwarves and halflings.' }),
    F('bodyLook', 'Look when worn', 0x31, 'i8', { group: 'armour', enumOf: 'bodyLook', help: 'How wearing it changes the character\'s textures.' }),
    F('maxCharges', 'Maximum charges', 0x34, 'u8', { group: 'charges', help: 'Shown as "( n )" in the tooltip when not 0. For quivers: arrows.' }),
    F('initialCharges', 'Starting charges', 0x35, 'u8', { group: 'charges', help: 'Charges a new copy of the item starts with.' }),
    F('effects', 'Effects', 0x38, 'i16', { group: 'charges', n: 3, enumOf: 'itemEffect', help: 'Magical effects of the item (-1 = none); edited below. Any effect in the first position makes the item glow as magic.' }),
    F('id', 'Item id', 0x46, 'u16', { group: 'basic', ro: true, help: 'Saves refer to the item by this number.' }),
  ];

  // Item effect record in TEE.trs (30 bytes).
  const ITEM_EFFECT_FIELDS = [
    F('condLo', 'Only against (part 1)', 0x04, 'hex', { bits: DESCRIPTOR_LO_BITS, help: 'If any box is ticked, the effect applies only during attacks or saves against matching creatures or attacks, and does not show on the character sheet.' }),
    F('condHi', 'Only against (part 2)', 0x08, 'hex', { bits: DESCRIPTOR_HI_BITS }),
    F('toHit', 'Attack bonus', 0x0C, 'i8'),
    F('damage', 'Damage bonus', 0x0D, 'i8'),
    F('dmgMult', 'Damage multiplier', 0x0E, 'u8', { help: '2 doubles damage, 3 triples it (the damage is rolled that many times). 0 or 1 = normal.' }),
    F('ac', 'Armour class bonus', 0x0F, 'i8'),
    F('saves', 'Saving throw bonus', 0x10, 'i8', { n: 3, labels: ['Fort', 'Ref', 'Will'] }),
    F('ability', 'Ability raised', 0x13, 'u8', { enumOf: 'abilityOrNone' }),
    F('abilityBonus', 'Ability bonus', 0x14, 'i8'),
    F('initiative', 'Initiative bonus', 0x15, 'i8'),
    F('sr', 'Spell resistance', 0x16, 'u8'),
    F('unread', 'Unread bytes', 0x17, 'u8', { n: 2, help: 'No game code reading these was found.' }),
    F('source', 'Spell source', 0x1D, 'u8', { enumOf: 'spellSource', help: 'Which spell list the spell number refers to.' }),
    F('spell', 'Spell', 0x1A, 'i16', { enumOf: 'effectSpell', help: 'A spell the item casts when used. The first effect with a spell is the item\'s power.' }),
    F('casterLevel', 'Caster level', 0x19, 'u8', { help: 'Sets the spell\'s range and strength.' }),
    F('bonusType', 'Bonus type', 0x1C, 'u8', { enumOf: 'bonusType', help: 'Untyped bonuses always add up. Bonuses of the same other type do not: only the best bonus and the worst penalty count. On one item, only one effect per bonus type counts.' }),
  ];

  // Equipment set (loot table) record in TEE.trs: label, then 8 slots of item / minimum / maximum.
  const EQUIP_SET_SIZE = 50;
  const EQUIP_SET_SLOTS = 8;

  // Every system string the editor labels or describes with, for the built-in data file.
  function stringIds() {
    const ids = new Set();
    for (const t of [CLASSES, RACES, ALIGNMENTS, SKILLS, FEATS, CLASS_FEATURES, ARCANE_SPELLS, EFFECTS, LEVELS]) for (const r of t) if (r[1] >= 0) ids.add(r[1]);
    for (const r of DIVINE_SPELLS) ids.add(r[1]);
    for (const t of [CLASS_DESC, RACE_DESC, ALIGNMENT_DESC, SKILL_DESC, FEAT_DESC, CLASS_FEATURE_DESC, ARCANE_SPELL_DESC, DIVINE_SPELL_DESC]) for (const id of t) ids.add(id);
    return Array.from(ids).sort((a, b) => a - b);
  }

  const api = {
    MODEL_PATHS, modelLabel, modelTag,
    CLASS_DESC, RACE_DESC, ALIGNMENT_DESC, SKILL_DESC, FEAT_DESC, CLASS_FEATURE_DESC, ARCANE_SPELL_DESC, stringIds,
    CLASSES, RACES, ALIGNMENTS, ABILITIES, ABILITY_NAMES, SKILLS, FEATS, CLASS_FEATURES, ARCANE_SPELLS,
    ARCANE_LEARNABLE, EFFECTS, LEVELS, LEVEL_COUNT, GENDERS, EQUIP_SLOTS, ENTITY_KINDS, OBJECT_SUBTYPES,
    OBJECT_SUBTYPE_HELP, OBJECT_STATES, OBJECT_STATE_HELP, NPC_CLICK_STATES, NAMED_STATE_KINDS, NAMED_STATE_HELP,
    ENCOUNTER_VALUES, OPTION_FLAGS, CREATURE_SIZES,
    ACTOR_FIELDS, DND_FIELDS, PC_FIELDS, MONSTER_FIELDS, TREASURE_FIELDS, OBJECT_FIELDS, INV_NODE_FIELDS,
    EQUIP_FIELDS, EFFECT_FIELDS, ROSTER_FIELDS, GAME_MASTER_FIELDS, ACTOR_LIST_FIELDS, GROUP_FIELDS,
    FOLLOWER_FIELDS, MAP_FIELDS, MAP_PIN_FIELDS, MAP_OBJECT_FIELDS, MP_WORLD_FIELDS,
    CREATURE_TEMPLATE_FIELDS, CREATURE_ATTACK_FIELDS, ITEM_TEMPLATE_FIELDS, SLOT_BITS, CLASS_BITS, FEAT_BITS,
    DIVINE_SPELLS, DIVINE_SPELL_DESC, SPECIAL_ABILITIES, DESCRIPTOR_LO_BITS, DESCRIPTOR_HI_BITS, COND_SAVE_BITS, COND_SAVE_SHORT,
    SIZE_ATTACK_MOD, ATTACK_KINDS, SOUND_CATEGORIES, ITEM_TYPES, ITEM_MODELS, ITEM_ICONS, ICON_RULES, DAMAGE_TYPE_BITS, BODY_LOOKS,
    BONUS_TYPES, SPELL_SOURCES, ITEM_EFFECT_FIELDS, EQUIP_SET_SIZE, EQUIP_SET_SLOTS, isBodyModel,
  };
  root.PorTables = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
