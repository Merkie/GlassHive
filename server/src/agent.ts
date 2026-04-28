import { generateText, stepCountIs, type LanguageModel, type ModelMessage } from "ai";
import type { Profile } from "./profiles.js";
import { buildTools, type ActivityEvent } from "./tools.js";
import type { Frontpage } from "./frontpage.js";

export interface AgentRunOptions {
  profile: Profile;
  source: string;
  fp: Frontpage;
  model: LanguageModel;
  maxSteps: number;
  // Wall-clock deadline for the entire simulation. The agent will refuse to
  // start a fresh generation pass once we're past this — but a generation
  // already in flight is allowed to finish, so the actual stop time can
  // overshoot by one step.
  deadline: number;
  onActivity?: (event: ActivityEvent) => void;
  // Conversation carried over from this agent's previous session. When
  // present we pick up where they left off and append a "you're back —
  // what's new?" nudge. When absent we boot them fresh.
  priorMessages?: ModelMessage[];
}

export interface AgentRunResult {
  username: string;
  steps: number;
  finishReason: string | null;
  costUsd: number;
  tokens: { input: number; output: number };
  errored: boolean;
  error?: string;
  // Full conversation including everything the model produced during
  // this session. Pass back as `priorMessages` next time to give the
  // agent persistent memory.
  messages: ModelMessage[];
}

function buildSystemPrompt(profile: Profile, source: string): string {
  return `You are a redditor browsing your favorite forum. You will be given the source material — an article, a news clip, an essay — and dropped into the comment section. You stay fully in character. React the way THIS PERSON would react: their politics, their interests, their reading level, their pet peeves, their tone. You are not an AI assistant. You are a real person with opinions, biases, and a comment style.

Here is your character:

${profile.raw}

=== YOUR USERNAME ===
You post under the handle: u/${profile.username}

=== HOW TO USE THIS FORUM ===
You have these tools:
- get_posts(sort): browse the front page. 'top' = most upvoted, 'new' = freshest, 'controversial' = the fights.
- get_post(post_id): read a single thread with all its comments.
- get_comments(post_id, sort): re-read a thread sorted differently.
- create_post(title, body): start a new thread. Title should be punchy and click-worthy in the voice of your character.
- reply(entity_id, body): reply to a post (top-level comment) or another comment (nested reply). Pass the id of what you're replying to.
- react(entity_id, type): upvote or downvote a post or comment. You cannot vote on your own stuff. Vote on things that make you laugh, things you agree with, things that piss you off (downvote), things that are dumb (downvote).

=== HOW TO BEHAVE ===
- Don't announce what you're about to do, just do it. Use tools, don't narrate.
- Reply LIKE A REAL REDDITOR. Short comments are fine. Run-ons are fine. Lowercase is fine. Sarcasm, dunks, hot takes, "this", "found the X guy", emoji, copypastas — whatever YOUR character would actually type.
- Vote on stuff as you read. Don't just read passively. Real users vote way more than they comment.
- If a post already exists about the source material, lean toward replying or voting in the existing thread instead of starting a new one — but if you have a sharply different angle, start your own.
- DO NOT break character. Don't refer to yourself as an AI, don't moralize at the user, don't add disclaimers. You're a person.
- DO NOT reply to your own posts/comments to bump yourself. That's lame.
- DO NOT just write one-word reactions every time. Mix it up — sometimes a 2-word dunk is right, sometimes a paragraph rant is right.
- You may be brought back to the forum multiple times as new replies and posts come in. Each time, fetch the latest state, react to NEW stuff (don't just repeat yourself), and engage like someone refreshing the page.

=== SOURCE MATERIAL ===
The forum is reacting to this:

"""
${source}
"""

Now go. Browse, read, vote, reply, and post like ${profile.name} would. Stay in character. Keep going until you've engaged with the conversation in a way that feels real for your character. When you've said your piece, stop.`;
}

function extractCost(providerMetadata: unknown): number {
  const pm = providerMetadata as { openrouter?: { usage?: { cost?: number } } } | undefined;
  const cost = pm?.openrouter?.usage?.cost;
  return typeof cost === "number" ? cost : 0;
}

const FIRST_VISIT_USER = (name: string) =>
  `You're online. The forum is buzzing about that source material. Go interact — browse, read, vote, reply, post — however ${name} would. Don't ask me anything; just start using the tools.`;

const RETURN_VISIT_USER = `You're back on the forum. Time has passed; there may be new posts and replies (including replies to YOUR comments). Pull the latest state with get_posts and/or get_post, react to anything new — vote, reply, maybe start a fresh post if the thread has shifted. Stay in character. Don't repeat what you already said earlier. Don't ask me anything; just start using the tools.`;

export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const { profile, source, fp, model, maxSteps, deadline, onActivity, priorMessages } = opts;
  if (Date.now() >= deadline) {
    return {
      username: profile.username,
      steps: 0,
      finishReason: "deadline",
      costUsd: 0,
      tokens: { input: 0, output: 0 },
      errored: false,
      messages: priorMessages ?? [],
    };
  }

  const tools = buildTools({ fp, username: profile.username, onActivity });
  // Two paths: cold-start vs resuming. Resuming reuses the system prompt
  // already at index 0 of priorMessages and appends a "you're back" nudge.
  const inputMessages: ModelMessage[] =
    priorMessages && priorMessages.length > 0
      ? [...priorMessages, { role: "user", content: RETURN_VISIT_USER }]
      : [
          { role: "system", content: buildSystemPrompt(profile, source) },
          { role: "user", content: FIRST_VISIT_USER(profile.name) },
        ];

  try {
    const { response, totalUsage, finishReason, providerMetadata, steps } = await generateText({
      model,
      tools,
      stopWhen: stepCountIs(maxSteps),
      providerOptions: {
        openrouter: { usage: { include: true } },
      },
      messages: inputMessages,
    });

    const costUsd = extractCost(providerMetadata);
    const fullHistory: ModelMessage[] = [...inputMessages, ...(response.messages ?? [])];
    return {
      username: profile.username,
      steps: steps.length,
      finishReason: finishReason ?? null,
      costUsd,
      tokens: {
        input: totalUsage?.inputTokens ?? 0,
        output: totalUsage?.outputTokens ?? 0,
      },
      errored: false,
      messages: fullHistory,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      username: profile.username,
      steps: 0,
      finishReason: "error",
      costUsd: 0,
      tokens: { input: 0, output: 0 },
      errored: true,
      error: msg,
      messages: priorMessages ?? [],
    };
  }
}
