import { randomUUID } from "node:crypto";
import { generateText, Output, type LanguageModel, type UserModelMessage } from "ai";
import { z } from "zod";
import { deriveUsername, type Profile } from "./profiles.js";
import type { GeneratedProfile } from "../../shared/contracts.js";

export interface GenerateProfilesOptions {
  model: LanguageModel;
  source: string;
  // CDN URLs of any photos attached to the source. The planner sees them so
  // the personas it designs can be tailored around what's actually in the
  // image (e.g. interior-design pros for a photo of a living room).
  imageUrls?: string[];
  count: number;
}

export interface GenerateProfilesResult {
  profiles: Profile[];
  costUsd: number;
  tokens: { input: number; output: number };
}

const personaSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(80)
    .describe("Full first + last name (e.g. 'Marcus Chen', 'Priya Subramanian')."),
  age: z.number().int().min(16).max(90).describe("Age in years, integer between 16 and 90."),
  occupation: z
    .string()
    .min(2)
    .max(120)
    .describe(
      "One short phrase describing what they do (e.g. 'indie iOS developer', 'high school history teacher', 'retired electrician'). Keep specific."
    ),
  location: z
    .string()
    .min(2)
    .max(120)
    .describe(
      "City + state/country (e.g. 'Austin, TX', 'Manchester, UK', 'Lagos, Nigeria'). Vary geography across the room."
    ),
  politics: z
    .string()
    .min(2)
    .max(120)
    .describe(
      "Short political label or stance (e.g. 'moderate liberal', 'libertarian-leaning', 'pragmatic conservative', 'apolitical', 'leftist'). Don't make every persona share the same politics."
    ),
  religion: z
    .string()
    .min(2)
    .max(120)
    .describe(
      "Short religion/spirituality label (e.g. 'atheist', 'lapsed Catholic', 'practicing Muslim', 'agnostic')."
    ),
  personality: z
    .string()
    .min(2)
    .max(160)
    .describe(
      "1–2 short adjectives capturing how they post (e.g. 'anxious overthinker', 'confident shitposter', 'dry-humored skeptic', 'earnest enthusiast')."
    ),
  interests: z
    .string()
    .min(2)
    .max(240)
    .describe(
      "Comma-separated list of 3–6 hobbies/topics they care about. Some should connect to the source material; some shouldn't."
    ),
  bio: z
    .string()
    .min(80)
    .max(900)
    .describe(
      "3–5 sentences in third person describing who this person is, what they do, and the LENS through which they'll read the source material. Make it specific — concrete jobs, concrete frustrations, concrete history. This is the meat of the persona; the agent reads it before posting."
    ),
});

const responseSchema = z.object({
  profiles: z.array(personaSchema),
});

const SYSTEM_PROMPT = `You are designing a roomful of distinct people who will roleplay in a Reddit-style comment section reacting to some source material. Your job is to generate ${"{N}".replace(/./g, "")}exactly the number of personas requested, each with a clearly different angle on the topic.

Goals:
- Each persona must bring a DISTINCT lens. No archetype repeats.
- Mix expertise levels: some genuine experts, some adjacent professionals, some informed laypeople with strong opinions, some outsiders who'd just chime in. Real comment sections have all of these.
- Vary politics, age, geography, and personality. A room of identical posters writes a boring thread.
- The bio is the most important field — make it specific and grounded. Concrete job, concrete history, concrete biases. The model will read the bio to decide how this person reacts.
- Personas are CHARACTERS, not avatars of the user. They can be wrong, biased, ignorant, or annoying. Real redditors are.

Worked example — if the source material were a news article titled *"Pixel 10 Pro outperforms iPhone 17 in third-party benchmarks"*, a good roster of 6 personas might look like:

1. An indie iOS developer in Portland who's been quietly considering switching for two years and has strong feelings about Android's app ecosystem.
2. A tech reviewer who's already had hands-on time with both phones and thinks benchmarks are a distraction from real-world battery life.
3. A retail electronics manager in suburban Ohio who watches what people actually buy versus what gets praised online.
4. A computer-science PhD student who has opinions about benchmark methodology and the marketing games both companies play.
5. A fifty-year-old paralegal who's used iPhones since the 3GS and doesn't care about specs but hates how Apple changed Messages.
6. A college freshman on a tight budget who's mostly upset that "good phones" now cost more than their textbooks.

Notice: different ages, jobs, geographies, expertise levels, and angles into the same story. None of them are interchangeable.

Output rules:
- Produce EXACTLY the requested count, in a single JSON array under the "profiles" key.
- Each persona must satisfy every field in the schema.
- Plan all the personas before emitting — don't duplicate archetypes.
- Do not reference the user, the AI, or this prompt in any field. The personas should read like real people who exist independently.
- Keep the bio in third person ("She is a…"), not first person.`;

function buildUserPrompt(source: string, count: number, imageCount: number): string {
  const photoLine =
    imageCount > 0
      ? `\nThe source material also includes ${imageCount === 1 ? "a photo" : `${imageCount} photos`} attached below — factor what's in the photo${imageCount === 1 ? "" : "s"} into the personas you design (e.g. an architecture nerd if the photo is a building, a stylist if it's a fit pic).\n`
      : "";
  return `Generate ${count} distinct personas for a Reddit-style comment section reacting to the following source material.

Aim for the spread described in the example: vary expertise, politics, age, location, and personality so the room argues with itself instead of echoing.${photoLine}

=== SOURCE MATERIAL ===

"""
${source}
"""

Now produce the JSON. Exactly ${count} personas. No archetype should repeat.`;
}

function buildPlannerUserMessage(
  source: string,
  count: number,
  imageUrls: string[]
): UserModelMessage {
  const text = buildUserPrompt(source, count, imageUrls.length);
  if (imageUrls.length === 0) {
    return { role: "user", content: text };
  }
  return {
    role: "user",
    content: [
      { type: "text", text },
      ...imageUrls.map((url) => ({ type: "image" as const, image: new URL(url) })),
    ],
  };
}

type Persona = z.infer<typeof personaSchema>;

function buildRawMarkdown(p: Persona, id: string): string {
  return `---
id: ${id}
name: ${p.name}
age: ${p.age}
occupation: ${p.occupation}
location: ${p.location}
politics: ${p.politics}
religion: ${p.religion}
personality: ${p.personality}
interests: ${p.interests}
---

${p.bio}`;
}

function extractCost(providerMetadata: unknown): number {
  const pm = providerMetadata as { openrouter?: { usage?: { cost?: number } } } | undefined;
  const cost = pm?.openrouter?.usage?.cost;
  return typeof cost === "number" ? cost : 0;
}

export async function generateProfiles(
  opts: GenerateProfilesOptions
): Promise<GenerateProfilesResult> {
  const { model, source, imageUrls = [], count } = opts;
  if (count < 1) throw new Error("count must be at least 1");
  if (!source.trim()) throw new Error("source must not be empty");

  const { output, totalUsage, providerMetadata } = await generateText({
    model,
    providerOptions: {
      openrouter: { usage: { include: true } },
    },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      buildPlannerUserMessage(source, count, imageUrls),
    ],
    output: Output.object({ schema: responseSchema }),
  });

  const generated = output.profiles;
  if (!Array.isArray(generated) || generated.length === 0) {
    throw new Error("model returned no profiles");
  }
  if (generated.length < count) {
    throw new Error(`model returned ${generated.length} profiles but ${count} were requested`);
  }

  // Take the first `count` if the model overshot, dedupe usernames in case
  // hash collisions slip past the derivation pool.
  const seen = new Set<string>();
  const profiles: Profile[] = [];
  for (const g of generated.slice(0, count)) {
    const id = randomUUID();
    let username = deriveUsername(id, g.name, g.age);
    let n = 2;
    const base = username;
    while (seen.has(username)) {
      username = `${base}${n}`;
      n++;
    }
    seen.add(username);
    profiles.push({
      id,
      username,
      name: g.name,
      age: g.age,
      occupation: g.occupation,
      location: g.location,
      politics: g.politics,
      religion: g.religion,
      personality: g.personality,
      interests: g.interests,
      bio: g.bio,
      raw: buildRawMarkdown(g, id),
    });
  }

  return {
    profiles,
    costUsd: extractCost(providerMetadata),
    tokens: {
      input: totalUsage?.inputTokens ?? 0,
      output: totalUsage?.outputTokens ?? 0,
    },
  };
}

// Strips the markdown `raw` field for serialization to the wire / DB row.
export function toGeneratedProfile(p: Profile): GeneratedProfile {
  return {
    username: p.username,
    name: p.name,
    age: p.age,
    occupation: p.occupation,
    location: p.location,
    politics: p.politics,
    religion: p.religion,
    personality: p.personality,
    interests: p.interests,
    bio: p.bio,
  };
}
