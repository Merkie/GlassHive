import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILES_DIR = join(__dirname, "..", "profiles");

export interface Profile {
  id: string;
  username: string;
  name: string;
  age: number;
  occupation: string;
  location: string;
  politics: string;
  religion: string;
  personality: string;
  interests: string;
  bio: string;
  raw: string;
}

function parseProfile(filename: string, content: string): Profile {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`Profile ${filename} is missing frontmatter`);
  const [, fm, body] = match;

  const fields: Record<string, string> = {};
  for (const line of fm.split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (!m) continue;
    fields[m[1]] = m[2].trim();
  }

  const required = [
    "id",
    "name",
    "age",
    "occupation",
    "location",
    "politics",
    "religion",
    "personality",
    "interests",
  ] as const;
  for (const key of required) {
    if (!fields[key]) {
      throw new Error(`Profile ${filename} is missing field: ${key}`);
    }
  }

  const age = Number.parseInt(fields.age, 10);
  if (!Number.isFinite(age)) {
    throw new Error(`Profile ${filename} has invalid age: ${fields.age}`);
  }

  return {
    id: fields.id,
    username: fields.username || deriveUsername(fields.id, fields.name, age),
    name: fields.name,
    age,
    occupation: fields.occupation,
    location: fields.location,
    politics: fields.politics,
    religion: fields.religion,
    personality: fields.personality,
    interests: fields.interests,
    bio: body.trim(),
    raw: content,
  };
}

// Stable hash so the same id always maps to the same username pattern.
function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const SUFFIXES = [
  "",
  "_42",
  "69",
  "420",
  "_irl",
  "_official",
  "1990",
  "_xx",
  "_84",
  "_ttv",
  "_real",
  "1986",
  "2002",
  "_mn",
  "_tx",
];

const PREFIXES = [
  "",
  "the_",
  "real_",
  "u_",
  "iam_",
  "mr_",
  "ms_",
  "lord_",
  "dr_",
  "big_",
];

// Build a reddit-style username deterministically from the profile id.
// Real reddit handles are messy — first names, weird suffixes, leetspeak,
// year-of-birth tails. Picking from a small pool of patterns gives the
// agents handles that read like a real comment section without needing
// the LLM to invent them.
function deriveUsername(id: string, fullName: string, age: number): string {
  const first = fullName.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "user";
  const last = fullName.split(/\s+/).slice(-1)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? "x";
  const initial = last[0] ?? "x";
  const yearTail = String(2025 - age).slice(-2);
  const h = hash(id);

  const patterns: string[] = [
    `${first}_${last}`,
    `${first}${initial}${yearTail}`,
    `${first}_${yearTail}`,
    `${PREFIXES[h % PREFIXES.length]}${first}${SUFFIXES[(h >> 3) % SUFFIXES.length]}`,
    `${first}${last[0]}${last[1] ?? ""}_${yearTail}`,
    `${first}${SUFFIXES[h % SUFFIXES.length]}`,
    `${first}_${last}${SUFFIXES[(h >> 5) % SUFFIXES.length]}`,
  ];
  const chosen = patterns[h % patterns.length];
  return chosen.replace(/^_+|_+$/g, "").replace(/__+/g, "_");
}

let _profiles: Profile[] | null = null;

export function loadProfiles(): Profile[] {
  if (_profiles) return _profiles;
  const files = readdirSync(PROFILES_DIR)
    .filter((f) => /^\d+-.+\.md$/.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const seenUsernames = new Set<string>();
  const profiles: Profile[] = [];
  for (const file of files) {
    const content = readFileSync(join(PROFILES_DIR, file), "utf8");
    const p = parseProfile(file, content);
    let u = p.username;
    let n = 2;
    while (seenUsernames.has(u)) {
      u = `${p.username}${n}`;
      n++;
    }
    seenUsernames.add(u);
    profiles.push({ ...p, username: u });
  }
  _profiles = profiles;
  return profiles;
}

export function sampleProfiles(all: Profile[], n: number): Profile[] {
  const count = Math.min(Math.max(1, Math.floor(n)), all.length);
  const arr = [...all];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}
