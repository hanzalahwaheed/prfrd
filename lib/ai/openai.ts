import "server-only";

import { createOpenAI } from "@ai-sdk/openai";

const rawApiKey = process.env.OPENAI_API_KEY ?? "";
const apiKey = rawApiKey.replace(/\s+/g, "");

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

export const openai = createOpenAI({ apiKey });

export const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-5.1";
