const adjectives = [
  "blue",
  "red",
  "green",
  "bright",
  "dark",
  "quiet",
  "loud",
  "swift",
  "brave",
  "calm",
  "happy",
  "eager",
  "clever",
  "fuzzy",
  "gentle",
  "golden",
  "silver",
  "rusty",
  "mellow",
  "zany",
];

const animals = [
  "horse",
  "tiger",
  "panda",
  "otter",
  "eagle",
  "shark",
  "whale",
  "lynx",
  "falcon",
  "koala",
  "sloth",
  "wolf",
  "bear",
  "fox",
  "moose",
  "goose",
  "llama",
  "yak",
  "zebra",
  "sparrow",
];

function sample(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function fnv1a32(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function checksum4(input) {
  const hash = fnv1a32(input);
  const space = 26 ** 4;
  let n = hash % space;
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 4; i++) {
    const rem = n % 26;
    out = alphabet[rem] + out;
    n = Math.floor(n / 26);
  }
  return out;
}

export function checksumForWords(wordA, wordB) {
  const a = String(wordA || "")
    .trim()
    .toLowerCase();
  const b = String(wordB || "")
    .trim()
    .toLowerCase();
  return checksum4(`${a}-${b}`);
}

export function isAdjective(word) {
  const w = String(word || "")
    .trim()
    .toLowerCase();
  return adjectives.includes(w);
}

export function isAnimal(word) {
  const w = String(word || "")
    .trim()
    .toLowerCase();
  return animals.includes(w);
}

export function generateHumanSlug() {
  const adj = sample(adjectives);
  const ani = sample(animals);
  const orderAdjFirst = Math.random() < 0.5;
  const first = orderAdjFirst ? adj : ani;
  const second = orderAdjFirst ? ani : adj;
  const sum = checksum4(`${first}-${second}`);
  return `${first}-${second}-${sum}`;
}
