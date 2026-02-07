import "server-only";

import { NextResponse } from "next/server";
import { generateTextOnce } from "@/lib/ai/generate-text";

export const runtime = "nodejs";

type GenerateTextRequest = {
  prompt?: string;
  system?: string;
  model?: string;
};

export async function POST(req: Request) {
  let body: GenerateTextRequest;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!body.prompt || typeof body.prompt !== "string") {
    return NextResponse.json(
      { error: "Missing `prompt` string." },
      { status: 400 }
    );
  }

  let result;
  try {
    result = await generateTextOnce({
      prompt: body.prompt,
      system: typeof body.system === "string" ? body.system : undefined,
      model: typeof body.model === "string" ? body.model : undefined,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: `Text generation failed. ${error}` },
      { status: 500 }
    );
  }

  return NextResponse.json(result);
}
