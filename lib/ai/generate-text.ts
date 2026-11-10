import "server-only";

import { generateText } from "ai";
import { DEFAULT_OPENAI_MODEL, getOpenAI } from "@/lib/ai/openai";

export type GenerateTextInput = {
  prompt: string;
  system?: string;
  model?: string;
};

export type GenerateTextOutput = {
  text: string;
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
};

export async function generateTextOnce(
  input: GenerateTextInput
): Promise<GenerateTextOutput> {
  const modelId = input.model?.trim() || DEFAULT_OPENAI_MODEL;

  const result = await generateText({
    model: getOpenAI()(modelId),
    system: input.system,
    prompt: input.prompt,
  });

  return {
    text: result.text,
    model: modelId,
    usage: result.usage
      ? {
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          totalTokens: result.usage.totalTokens,
        }
      : undefined,
  };
}
