import "server-only";

import { createOpenAI } from "@ai-sdk/openai";

// The client is created lazily so importing this module during `next build`
// does not require an API key. Missing credentials fail at call time instead.
let cachedClient: ReturnType<typeof createOpenAI> | null = null;

function getApiKey(): string {
  const apiKey = (process.env.OPENAI_API_KEY ?? "").replace(/\s+/g, "");

  if (!apiKey) {
    throw new Error(
      "Missing OPENAI_API_KEY. Set it in your server environment (e.g. .env.local)."
    );
  }

  if (/[^\x21-\x7E]/.test(apiKey)) {
    throw new Error(
      "OPENAI_API_KEY contains invalid characters. Ensure it is plain ASCII with no whitespace or hidden characters."
    );
  }

  return apiKey;
}

export function getOpenAI() {
  if (!cachedClient) {
    cachedClient = createOpenAI({ apiKey: getApiKey() });
  }

  return cachedClient;
}

export const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.1";
