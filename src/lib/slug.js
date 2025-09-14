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

const nouns = [
  "apple",
  "river",
  "forest",
  "mountain",
  "ocean",
  "comet",
  "ember",
  "shadow",
  "glow",
  "storm",
  "breeze",
  "meadow",
  "pebble",
  "flame",
  "cloud",
  "stone",
  "leaf",
  "spark",
  "echo",
  "drift",
];

function sample(array) {
  return array[Math.floor(Math.random() * array.length)];
}

export function generateHumanSlug() {
  const words = [sample(adjectives), sample(animals), sample(nouns)];
  return words.join("-");
}
