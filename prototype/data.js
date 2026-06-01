// Sample data for Shelf Organizer prototype
// All dimensions in mm. Real board games have wildly varying box sizes.

const uid = (() => {
  let n = 0;
  return (prefix) => `${prefix}-${(++n).toString(36)}`;
})();

// ---- Cabinets & shelves ----
// 3 cabinets, varied shelf sizes for realism.
const SHELF_DEFAULTS = { paddingReserveMm: 20, maxStackCount: 4, maxStackHeightMm: null };

const cabinetsData = [
  {
    id: "cab-A",
    name: "Living room — main wall",
    position: 0,
    shelves: [
      { id: "sh-A1", widthMm: 1100, heightMm: 410, depthMm: 320, orientation: "vertical" },
      { id: "sh-A2", widthMm: 1100, heightMm: 330, depthMm: 320, orientation: "vertical" },
      { id: "sh-A3", widthMm: 1100, heightMm: 330, depthMm: 320, orientation: "vertical" },
      { id: "sh-A4", widthMm: 1100, heightMm: 330, depthMm: 320, orientation: "mixed" },
      { id: "sh-A5", widthMm: 1100, heightMm: 240, depthMm: 320, orientation: "horizontal" },
    ],
  },
  {
    id: "cab-B",
    name: "Side cabinet",
    position: 1,
    shelves: [
      { id: "sh-B1", widthMm: 900, heightMm: 380, depthMm: 280, orientation: "vertical" },
      { id: "sh-B2", widthMm: 900, heightMm: 320, depthMm: 280, orientation: "vertical" },
      { id: "sh-B3", widthMm: 900, heightMm: 320, depthMm: 280, orientation: "mixed" },
      { id: "sh-B4", widthMm: 900, heightMm: 220, depthMm: 280, orientation: "horizontal" },
    ],
  },
  {
    id: "cab-C",
    name: "Hallway shelf",
    position: 2,
    shelves: [
      { id: "sh-C1", widthMm: 720, heightMm: 320, depthMm: 240, orientation: "vertical" },
      { id: "sh-C2", widthMm: 720, heightMm: 280, depthMm: 240, orientation: "vertical" },
      { id: "sh-C3", widthMm: 720, heightMm: 200, depthMm: 240, orientation: "horizontal" },
    ],
  },
];

// ---- Game catalogue ----
// Real game names with plausible dimensions.
// Format: [name, w, h, d, bggId, expansionOf?]
// w = box width (long side), h = height, d = depth (short / thickness when standing spine-out)
const RAW = [
  // Heavyweight / large square
  ["Twilight Imperium: Fourth Edition", 360, 295, 130, 233078],
  ["Prophecy of Kings", 360, 295, 80, 318898, "Twilight Imperium: Fourth Edition"],
  ["Gloomhaven", 365, 290, 175, 174430],
  ["Jaws of the Lion", 350, 280, 90, 291457, "Gloomhaven"],
  ["Frosthaven", 380, 320, 195, 295770],
  ["Spirit Island", 300, 300, 75, 162886],
  ["Branch & Claw", 240, 240, 50, 211147, "Spirit Island"],
  ["Jagged Earth", 305, 305, 90, 246900, "Spirit Island"],
  ["Nemesis", 305, 305, 130, 167355],
  ["Lockdown", 305, 305, 80, 285605, "Nemesis"],
  ["Aeon's End", 290, 290, 75, 191189],
  ["Outcasts", 290, 290, 75, 256680, "Aeon's End"],
  ["The New Age", 290, 290, 75, 269319, "Aeon's End"],
  ["Eldritch Horror", 300, 300, 70, 146021],
  ["Forsaken Lore", 240, 240, 50, 152658, "Eldritch Horror"],
  ["Mountains of Madness", 240, 240, 50, 168358, "Eldritch Horror"],
  ["Cthulhu: Death May Die", 305, 305, 100, 253344],

  // Standard square (~295 x 295)
  ["Wingspan", 305, 305, 75, 266192],
  ["European Expansion", 240, 240, 50, 290448, "Wingspan"],
  ["Oceania Expansion", 240, 240, 50, 300580, "Wingspan"],
  ["Asia Expansion", 240, 240, 50, 318184, "Wingspan"],
  ["Cascadia", 295, 295, 75, 295947],
  ["Landmarks", 230, 230, 40, 358989, "Cascadia"],
  ["Catan", 290, 290, 75, 13],
  ["Seafarers", 290, 290, 50, 926, "Catan"],
  ["Cities & Knights", 290, 290, 50, 1041, "Catan"],
  ["Carcassonne", 285, 285, 50, 822],
  ["Inns & Cathedrals", 235, 165, 30, 8203, "Carcassonne"],
  ["Traders & Builders", 235, 165, 30, 12533, "Carcassonne"],
  ["Ticket to Ride", 295, 295, 70, 9209],
  ["Europe", 295, 295, 70, 14996, "Ticket to Ride"],
  ["Rails & Sails", 305, 305, 70, 200561, "Ticket to Ride"],
  ["Pandemic", 295, 295, 65, 30549],
  ["On the Brink", 240, 240, 50, 69779, "Pandemic"],
  ["In the Lab", 240, 240, 50, 116285, "Pandemic"],
  ["Pandemic Legacy: Season 1", 295, 295, 75, 161936],
  ["Pandemic Legacy: Season 2", 295, 295, 75, 221107],
  ["Agricola", 295, 295, 70, 31260],
  ["Terraforming Mars", 305, 220, 70, 167791],
  ["Prelude", 220, 220, 30, 234487, "Terraforming Mars"],
  ["Hellas & Elysium", 295, 215, 30, 196091, "Terraforming Mars"],
  ["Venus Next", 305, 220, 40, 199907, "Terraforming Mars"],
  ["Scythe", 305, 305, 75, 169786],
  ["Invaders from Afar", 290, 215, 60, 192135, "Scythe"],
  ["The Wind Gambit", 240, 165, 40, 222746, "Scythe"],
  ["Rising Sun", 305, 305, 100, 205896],
  ["Blood Rage", 305, 305, 100, 170216],
  ["Mysthea", 305, 305, 80, 244603],
  ["Brass: Birmingham", 305, 230, 75, 224517],
  ["Brass: Lancashire", 305, 230, 75, 28720],
  ["Concordia", 295, 295, 55, 124361],
  ["Salsa", 215, 150, 35, 153945, "Concordia"],
  ["Gallia & Corsica", 230, 230, 25, 192389, "Concordia"],
  ["Power Grid", 295, 295, 70, 2651],
  ["The Crew: Mission Deep Sea", 110, 175, 35, 324856],
  ["The Quest for Planet Nine", 110, 175, 35, 284083],
  ["Dune: Imperium", 295, 220, 70, 316554],
  ["Rise of Ix", 220, 165, 40, 328047, "Dune: Imperium"],
  ["Immortality", 220, 165, 40, 351964, "Dune: Imperium"],
  ["Ark Nova", 305, 305, 75, 342942],
  ["Marine Worlds", 240, 240, 40, 368966, "Ark Nova"],
  ["Lost Ruins of Arnak", 305, 305, 75, 312484],
  ["Expedition Leaders", 240, 240, 40, 351040, "Lost Ruins of Arnak"],
  ["Heat: Pedal to the Metal", 305, 215, 75, 366013],
  ["Tournaments", 220, 160, 40, 396790, "Heat: Pedal to the Metal"],
  ["Everdell", 295, 295, 100, 199792],
  ["Pearlbrook", 220, 220, 50, 259933, "Everdell"],
  ["Spirecrest", 295, 220, 50, 269173, "Everdell"],
  ["Bellfaire", 220, 220, 50, 281658, "Everdell"],
  ["Newton", 295, 220, 70, 244711],
  ["Great Western Trail", 305, 230, 70, 193738],
  ["Rails to the North", 220, 220, 40, 263222, "Great Western Trail"],
  ["Argentina", 305, 230, 70, 364011],
  ["Viticulture", 295, 295, 75, 128621],
  ["Tuscany Essential", 285, 215, 40, 195260, "Viticulture"],
  ["Visit from the Rhine Valley", 220, 220, 40, 230406, "Viticulture"],

  // Long thin (CGE / Ravensburger / TTR-ish)
  ["Through the Ages: A New Story", 295, 215, 75, 182028],
  ["Codenames", 195, 295, 50, 178900],
  ["Codenames: Duet", 195, 295, 50, 224037],
  ["Codenames: Pictures", 195, 295, 50, 183343],
  ["7 Wonders", 295, 195, 75, 68448],
  ["Leaders", 220, 165, 35, 91312, "7 Wonders"],
  ["Cities", 220, 165, 35, 130753, "7 Wonders"],
  ["Babel", 220, 165, 35, 132458, "7 Wonders"],
  ["7 Wonders: Duel", 270, 195, 60, 173346],
  ["Pantheon", 220, 165, 35, 195886, "7 Wonders: Duel"],
  ["Agora", 220, 165, 35, 268708, "7 Wonders: Duel"],
  ["Lost Cities", 295, 195, 60, 50],
  ["Mystic Vale", 270, 200, 55, 174503],
  ["Quacks of Quedlinburg", 295, 215, 75, 244521],
  ["Herb Witches", 220, 165, 40, 280074, "Quacks of Quedlinburg"],
  ["Azul", 295, 295, 75, 230802],
  ["Stained Glass of Sintra", 295, 295, 70, 245643],
  ["Summer Pavilion", 295, 295, 70, 287083],
  ["Splendor", 295, 195, 55, 148228],
  ["Cities of Splendor", 220, 165, 35, 234277, "Splendor"],
  ["Marvel Splendor", 295, 195, 55, 309126],
  ["Castles of Burgundy", 295, 215, 65, 84876],
  ["Roll Player", 295, 215, 70, 169426],
  ["Monsters & Minions", 240, 165, 50, 226879, "Roll Player"],
  ["Fluxx", 145, 95, 35, 258],
  ["Star Trek Fluxx", 145, 95, 35, 144766],
  ["Monty Python Fluxx", 145, 95, 35, 53484],

  // Tall card boxes / small box
  ["Welcome To...", 240, 165, 50, 233867],
  ["Welcome To New Las Vegas", 240, 165, 50, 277659],
  ["The Crew: The Quest for Planet Nine", 110, 175, 35, 284083],
  ["Hanabi", 180, 110, 35, 98778],
  ["Love Letter", 100, 65, 35, 129622],
  ["Sushi Go!", 130, 80, 80, 133473],
  ["Sushi Go Party!", 230, 230, 50, 192291],
  ["The Mind", 150, 100, 30, 244992],
  ["For Sale", 195, 130, 35, 172],
  ["No Thanks!", 195, 130, 35, 12942],
  ["Coup", 180, 110, 35, 131357],
  ["Resistance: Avalon", 180, 110, 35, 128882],
  ["Citadels", 290, 145, 70, 478],
  ["Skull King", 180, 110, 35, 150145],
  ["Skull", 165, 165, 30, 92415],
  ["Tichu", 180, 110, 35, 215],
  ["Dixit", 295, 295, 75, 39856],
  ["Quest", 295, 295, 50, 152961, "Dixit"],
  ["Memories", 240, 165, 40, 197437, "Dixit"],
  ["Mysterium", 305, 305, 85, 181304],

  // Wargames / GMT-style long boxes
  ["Twilight Struggle", 305, 230, 50, 12333],
  ["Pax Pamir", 305, 305, 70, 256960],
  ["Root", 305, 230, 80, 237182],
  ["Underworld", 220, 165, 35, 281910, "Root"],
  ["Riverfolk", 220, 165, 35, 244524, "Root"],
  ["Marauders", 220, 165, 35, 295461, "Root"],

  // Quirky shapes
  ["Mage Knight", 305, 305, 130, 96848],
  ["Lost Legion", 240, 165, 35, 119860, "Mage Knight"],
  ["Krang", 240, 165, 35, 158842, "Mage Knight"],
  ["Shadows of Brimstone", 510, 305, 165, 134031],
  ["Star Wars: Rebellion", 380, 305, 90, 187645],
  ["Rise of the Empire", 305, 220, 50, 215146, "Star Wars: Rebellion"],
  ["Cosmic Encounter", 295, 220, 70, 39463],
  ["Cosmic Incursion", 230, 165, 40, 56708, "Cosmic Encounter"],

  // Wahoo / Friedemann Friese
  ["Friday", 130, 80, 35, 102795],
  ["Bohnanza", 195, 130, 35, 11],
  ["Hive", 295, 90, 60, 2655],
  ["Splotter weight", 305, 305, 90, 1],
  ["Food Chain Magnate", 305, 220, 60, 175914],
  ["Indonesia", 305, 220, 50, 11537],

  // Light family
  ["King of Tokyo", 295, 215, 70, 70323],
  ["Power Up!", 220, 165, 40, 199290, "King of Tokyo"],
  ["King of New York", 295, 215, 70, 139976],
  ["Camel Up", 295, 295, 80, 153938],
  ["Letters from Whitechapel", 305, 305, 65, 59959],
  ["Crokinole board", 720, 720, 25, 521],
  ["The Captain Is Dead", 295, 220, 70, 192458],
  ["Bargain Bin", 295, 220, 40, 257423, "The Captain Is Dead"],
  ["Cthulhu Wars", 510, 305, 130, 139976],
  ["Onslaught", 305, 220, 70, 191725, "Cthulhu Wars"],
  ["Cyclades", 295, 295, 75, 65244],
  ["Hades", 220, 165, 35, 100527, "Cyclades"],
  ["Inis", 295, 295, 75, 155821],
  ["Five Tribes", 295, 295, 75, 157354],
  ["Artisans of Naqala", 220, 165, 35, 174785, "Five Tribes"],
  ["Whims of the Sultan", 220, 165, 35, 213973, "Five Tribes"],
  ["Tales of the Arabian Nights", 295, 295, 80, 34119],

  // Tiny novelty
  ["Tiny Towns", 295, 215, 55, 265736],
  ["Forge Mage", 215, 150, 30, 322793, "Tiny Towns"],
  ["Calico", 295, 215, 65, 283155],
  ["Hadara", 295, 215, 65, 281867],
  ["Photosynthesis", 295, 295, 75, 218603],
  ["Under Falling Skies", 130, 195, 35, 306158],
  ["Patchwork", 220, 220, 60, 163412],
  ["Forbidden Island", 220, 220, 55, 65244],
  ["Forbidden Desert", 220, 220, 55, 136063],
  ["Forbidden Sky", 220, 220, 55, 233192],
];

// generate IDs and fill optional fields
function buildBoxes() {
  const byName = {};
  const boxes = [];

  for (const [name, w, h, d, bggId, expansionOf] of RAW) {
    const box = {
      id: `box-${boxes.length + 1}`,
      bggId,
      name,
      dimensions: { w, h, d },
      dimensionsFromBgg: { w, h, d },
      dimensionsSource: "bgg",
      preferredForwardFace: "auto",
      expansionOfName: expansionOf || null,
      expansionOfBoxId: null,
      bggLastFetchedAt: "2025-11-12T14:22:00Z",
    };
    boxes.push(box);
    byName[name] = box;
  }
  // resolve expansion links
  for (const b of boxes) {
    if (b.expansionOfName) {
      const parent = byName[b.expansionOfName];
      if (parent) b.expansionOfBoxId = parent.id;
    }
  }
  // a few games are manual / missing dims / overridden for realistic state
  const tweaks = [
    ["Codenames: Pictures", "manual", null],
    ["Crokinole board", "manual", null],
    ["Splotter weight", "override", { w: 295, h: 295, d: 110 }],
    ["Catan", "override", { w: 290, h: 290, d: 85 }],
  ];
  for (const [name, source, override] of tweaks) {
    const b = byName[name];
    if (!b) continue;
    b.dimensionsSource = source;
    if (override) b.dimensions = override;
  }
  // 3 missing-dimensions games
  for (const name of ["Sushi Go!", "Skull"]) {
    const b = byName[name];
    if (b) {
      b.dimensions = { w: 0, h: 0, d: 0 };
      b.dimensionsFromBgg = null;
      b.dimensionsSource = "manual";
    }
  }

  // Add a handful of unverified additions to round to ~150 games
  const filler = [
    ["Saboteur", 240, 145, 35],
    ["Saboteur 2", 240, 145, 35],
    ["Hoity Toity", 295, 215, 70],
    ["Modern Art", 295, 220, 60],
    ["High Society", 195, 130, 35],
    ["Ra", 295, 220, 60],
    ["Ra: The Dice Game", 195, 130, 35],
    ["6 Nimmt!", 145, 95, 30],
    ["X Nimmt!", 145, 95, 30],
    ["L.L.A.M.A.", 195, 195, 50],
    ["Just One", 195, 295, 50],
  ];
  for (const [name, w, h, d] of filler) {
    const box = {
      id: `box-${boxes.length + 1}`,
      bggId: 100000 + boxes.length,
      name,
      dimensions: { w, h, d },
      dimensionsFromBgg: { w, h, d },
      dimensionsSource: "bgg",
      preferredForwardFace: "auto",
      expansionOfName: null,
      expansionOfBoxId: null,
      bggLastFetchedAt: "2025-11-12T14:22:00Z",
    };
    boxes.push(box);
    byName[name] = box;
  }

  return boxes;
}

const BOXES = buildBoxes();

// Color hue per game family — for visual variety. Hash of name.
function hueForName(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  // Restricted palette: warm earthy hues 30..120 and 220..280, low chroma
  const choices = [30, 50, 65, 80, 100, 120, 200, 230, 260];
  return choices[Math.abs(h) % choices.length];
}
for (const b of BOXES) b.hue = hueForName(b.name);
// expansions inherit parent hue
for (const b of BOXES) {
  if (b.expansionOfBoxId) {
    const p = BOXES.find((x) => x.id === b.expansionOfBoxId);
    if (p) b.hue = p.hue;
  }
}

// Build flat shelves
const SHELVES = [];
for (const cab of cabinetsData) {
  cab.shelves.forEach((s, i) => {
    SHELVES.push({
      ...SHELF_DEFAULTS,
      ...s,
      cabinetId: cab.id,
      position: i,
    });
  });
}
const CABINETS = cabinetsData.map((c) => ({
  id: c.id,
  name: c.name,
  position: c.position,
  shelfIds: c.shelves.map((s) => s.id),
}));

window.APP_DATA = {
  cabinets: CABINETS,
  shelves: SHELVES,
  boxes: BOXES,
};
