/**
 * Shared LLM helper for transcript summarization and constitution recommendations.
 *
 * Provider preference:
 *   1. Anthropic Claude (ANTHROPIC_API_KEY) — recommended
 *   2. OpenAI (OPENAI_API_KEY) — legacy path kept for existing deployments
 *   3. null — callers fall back to deterministic/heuristic behavior
 */

import Anthropic from "@anthropic-ai/sdk";

export type LlmProvider = "anthropic" | "openai" | null;

export function llmProvider(): LlmProvider {
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return null;
}

async function callAnthropic(system: string, user: string, maxTokens: number): Promise<string | null> {
  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-opus-5",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    });

    if (response.stop_reason === "refusal") return null;
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    return text || null;
  } catch (err) {
    console.error("[llm] Anthropic call failed:", err);
    return null;
  }
}

async function callOpenAI(system: string, user: string, maxTokens: number): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.2,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) {
      console.error("[llm] OpenAI error", res.status, await res.text().catch(() => ""));
      return null;
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    return typeof content === "string" ? content.trim() : null;
  } catch (err) {
    console.error("[llm] OpenAI fetch failed:", err);
    return null;
  }
}

/**
 * Run a single system+user prompt against the configured provider.
 * Returns null when no provider is configured or the call fails —
 * callers must degrade gracefully.
 */
export async function callLLM(system: string, user: string, maxTokens = 1500): Promise<string | null> {
  const provider = llmProvider();
  if (provider === "anthropic") return callAnthropic(system, user, maxTokens);
  if (provider === "openai") return callOpenAI(system, user, maxTokens);
  return null;
}

/**
 * Extract the first JSON value (object or array) from an LLM response that may
 * wrap it in markdown fences or prose. Returns null when nothing parses.
 */
export function extractJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const candidates: string[] = [];
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) candidates.push(fence[1].trim());
  candidates.push(trimmed);
  const firstBracket = trimmed.search(/[[{]/);
  if (firstBracket > 0) candidates.push(trimmed.slice(firstBracket));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // try next candidate
    }
  }
  return null;
}
