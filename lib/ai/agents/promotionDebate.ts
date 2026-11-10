import "server-only";

import {
  generateObject,
  stepCountIs,
  streamText,
  tool,
} from "ai";
import { z } from "zod";

import type { DataSufficiency } from "@/lib/ai/insightGenerator";
import type { EvidenceCatalogEntry } from "@/lib/ai/managerAnalysis";
import { DEFAULT_OPENAI_MODEL, getOpenAI } from "@/lib/ai/openai";

const MODEL_NAME = process.env.OPENAI_MODEL ?? DEFAULT_OPENAI_MODEL;
const MODEL_VERSION = process.env.OPENAI_MODEL_VERSION ?? "unspecified";

const PEER_COMPARISON_PATTERN =
  /\b(peers?|team average|other employees|relative to (?:peers?|the team)|compared to (?:peers?|other employees))\b/i;
const COMPENSATION_PATTERN =
  /\b(bonus|salary|compensation|equity|stock options?|pay raise)\b/i;

export type DebateAgentRole = "advocate" | "examiner";
export type DebatePhase = "opening" | "rebuttal";

export type DebateTurn = {
  round: number;
  turnIndex: number;
  agentRole: DebateAgentRole;
  phase: DebatePhase;
  content: string;
  evidenceRefs: string[];
  toolCalls: Array<{
    name: string;
    input: unknown;
  }>;
  model: string;
  modelVersion: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
};

export type DebateReadiness =
  | "strong_case"
  | "mixed"
  | "not_yet"
  | "insufficient_evidence";

export type DebateSummary = {
  readiness: DebateReadiness;
  summary: string;
  strongestFor: Array<{ claim: string; evidenceRefs: string[] }>;
  strongestAgainst: Array<{ claim: string; evidenceRefs: string[] }>;
  openQuestions: string[];
  whatWouldChange: string[];
  confidence: "low" | "medium" | "high";
};

export type PromotionDebateEvent =
  | {
      type: "run_started";
      runId: number;
      participants: DebateAgentRole[];
      rounds: number;
    }
  | {
      type: "turn_started";
      turn: {
        round: number;
        turnIndex: number;
        agentRole: DebateAgentRole;
        phase: DebatePhase;
      };
    }
  | {
      type: "delta";
      agentRole: DebateAgentRole;
      round: number;
      text: string;
    }
  | {
      type: "tool_call";
      agentRole: DebateAgentRole;
      round: number;
      name: string;
      input: unknown;
    }
  | {
      type: "tool_result";
      agentRole: DebateAgentRole;
      round: number;
      name: string;
      output: unknown;
    }
  | { type: "turn_completed"; turn: DebateTurn }
  | { type: "summary"; summary: DebateSummary }
  | { type: "run_completed"; runId: number }
  | { type: "error"; message: string };

export type PromotionDebateInput = {
  runId: number;
  employeeEmail: string;
  employeeName: string;
  role: string;
  quarter: string;
  promotionEligible: boolean;
  dataSufficiency: DataSufficiency;
  evidenceCatalog: EvidenceCatalogEntry[];
  signal?: AbortSignal;
  onEvent: (event: PromotionDebateEvent) => void;
  onTurnComplete: (turn: DebateTurn) => Promise<void>;
};

export const debateSummarySchema = z
  .object({
    readiness: z.enum([
      "strong_case",
      "mixed",
      "not_yet",
      "insufficient_evidence",
    ]),
    summary: z.string().min(1),
    strongestFor: z
      .array(
        z
          .object({
            claim: z.string().min(1),
            evidenceRefs: z.array(z.string()),
          })
          .strict()
      ),
    strongestAgainst: z
      .array(
        z
          .object({
            claim: z.string().min(1),
            evidenceRefs: z.array(z.string()),
          })
          .strict()
      ),
    openQuestions: z.array(z.string().min(1)),
    whatWouldChange: z.array(z.string().min(1)),
    confidence: z.enum(["low", "medium", "high"]),
  })
  .strict();

const MODERATOR_SYSTEM_PROMPT = `You are the moderator of a promotion-readiness debate between two agents.
Synthesize the transcript into a balanced decision aid for a manager.

Rules:
- Do not pick a winner and do not recommend promotion or rejection.
- Summarize the strongest evidence-backed argument on each side.
- Use only the supplied evidence catalog. Cite evidence IDs like [E2].
- Surface unresolved questions and what additional evidence would change the assessment.
- Never compare the engineer to peers, team averages, or other employees.
- Never mention bonus, salary, compensation, or equity.
- If coverage is insufficient, set readiness to "insufficient_evidence" and confidence to "low".
- If coverage is partial, do not claim high confidence.
- Return JSON only.`;

function buildEvidenceBlock(catalog: EvidenceCatalogEntry[]): string {
  return catalog
    .map(
      (entry) =>
        `${entry.id} [${entry.sourceType}:${entry.sourceKey}:${entry.field}] ${entry.summary}`
    )
    .join("\n");
}

function buildSystemPrompt(role: DebateAgentRole): string {
  const roleInstruction =
    role === "advocate"
      ? "You argue the strongest evidence-backed case that this engineer is ready for promotion to the next level."
      : "You argue the strongest evidence-backed case that this engineer is not yet ready for promotion, or that the evidence is insufficient. Surface gaps, risks, and sustainability concerns.";

  return `${roleInstruction}

You are one side of a structured promotion-readiness debate.

Global rules:
- Use only the supplied evidence catalog.
- Cite every substantive claim with one or more evidence IDs in square brackets, for example [E2] or [E4,E7].
- Never compare the engineer to peers, team averages, or other employees.
- Never mention bonus, salary, compensation, or equity.
- Do not make a final HR decision. You are arguing one side.
- If evidence is thin or contradictory, say so explicitly.
- Keep the response between 170 and 240 words.`;
}

function stripProhibitedSentences(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter(
      (sentence) =>
        !PEER_COMPARISON_PATTERN.test(sentence) &&
        !COMPENSATION_PATTERN.test(sentence)
    )
    .join(" ")
    .trim();
}

function extractEvidenceRefs(text: string, validIds: Set<string>): string[] {
  const refs = new Set<string>();
  for (const match of text.matchAll(/\bE\d+\b/g)) {
    if (validIds.has(match[0])) {
      refs.add(match[0]);
    }
  }
  return Array.from(refs);
}

function sanitizeBullets(
  bullets: Array<{ claim: string; evidenceRefs: string[] }>,
  validIds: Set<string>
): Array<{ claim: string; evidenceRefs: string[] }> {
  return bullets
    .map((bullet) => ({
      claim: stripProhibitedSentences(bullet.claim),
      evidenceRefs: bullet.evidenceRefs.filter((ref) => validIds.has(ref)),
    }))
    .filter((bullet) => bullet.claim.length > 0 && bullet.evidenceRefs.length > 0);
}

function fallbackBullet(
  turn: DebateTurn | undefined,
  fallbackRef: string
): { claim: string; evidenceRefs: string[] } {
  const claim = turn?.content.trim().slice(0, 280);
  return {
    claim: claim && claim.length > 0
      ? claim
      : "The debate did not produce a grounded argument for this side.",
    evidenceRefs:
      turn && turn.evidenceRefs.length > 0
        ? turn.evidenceRefs
        : [fallbackRef],
  };
}

function buildTurnPrompt(input: {
  role: DebateAgentRole;
  phase: DebatePhase;
  round: number;
  employeeName: string;
  employeeEmail: string;
  roleTitle: string;
  quarter: string;
  promotionEligible: boolean;
  dataSufficiency: DataSufficiency;
  evidenceCatalog: EvidenceCatalogEntry[];
  opponentTurns: DebateTurn[];
}): string {
  const opponentBlock =
    input.opponentTurns.length > 0
      ? input.opponentTurns
          .map(
            (turn) =>
              `[Round ${turn.round} ${turn.agentRole}] ${turn.content}`
          )
          .join("\n\n")
      : "None. This is your opening statement.";

  const task =
    input.phase === "opening"
      ? "Write your opening case. Lead with your strongest evidence-backed claim."
      : "Write your rebuttal. Respond directly to the opponent's strongest point, concede anything that is valid, and introduce at most one new piece of evidence.";

  return `Employee: ${input.employeeName} (${input.employeeEmail})
Role: ${input.roleTitle}
Quarter: ${input.quarter}
Promotion eligibility on file: ${input.promotionEligible ? "yes" : "not configured or not eligible"}
Data sufficiency: ${input.dataSufficiency.level} — ${input.dataSufficiency.notes}
Weeks covered: ${input.dataSufficiency.weeks}; months covered: ${input.dataSufficiency.months}
Sources: GitHub ${input.dataSufficiency.sources.github ? "yes" : "no"}, Slack ${input.dataSufficiency.sources.slack ? "yes" : "no"}

Evidence catalog:
${buildEvidenceBlock(input.evidenceCatalog)}

Opponent transcript:
${opponentBlock}

Task: ${task}`;
}

async function runTurn(input: {
  debate: PromotionDebateInput;
  round: number;
  turnIndex: number;
  agentRole: DebateAgentRole;
  phase: DebatePhase;
  opponentTurns: DebateTurn[];
  validIds: Set<string>;
}): Promise<DebateTurn> {
  const { debate } = input;

  debate.onEvent({
    type: "turn_started",
    turn: {
      round: input.round,
      turnIndex: input.turnIndex,
      agentRole: input.agentRole,
      phase: input.phase,
    },
  });

  const prompt = buildTurnPrompt({
    role: input.agentRole,
    phase: input.phase,
    round: input.round,
    employeeName: debate.employeeName,
    employeeEmail: debate.employeeEmail,
    roleTitle: debate.role,
    quarter: debate.quarter,
    promotionEligible: debate.promotionEligible,
    dataSufficiency: debate.dataSufficiency,
    evidenceCatalog: debate.evidenceCatalog,
    opponentTurns: input.opponentTurns,
  });

  const lookupEvidence = tool({
    description:
      "Look up one evidence entry by ID from the shared evidence catalog.",
    inputSchema: z.object({
      id: z
        .string()
        .regex(/^E\d+$/)
        .describe("Evidence ID such as E3"),
    }),
    execute: async ({ id }) => {
      const entry = debate.evidenceCatalog.find((item) => item.id === id);
      return entry ?? { error: `Unknown evidence id: ${id}` };
    },
  });

  const result = streamText({
    model: getOpenAI()(MODEL_NAME),
    system: buildSystemPrompt(input.agentRole),
    prompt,
    tools: { lookupEvidence },
    stopWhen: stepCountIs(4),
    abortSignal: debate.signal,
  });

  let content = "";
  const toolCalls: DebateTurn["toolCalls"] = [];

  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      content += part.text;
      debate.onEvent({
        type: "delta",
        agentRole: input.agentRole,
        round: input.round,
        text: part.text,
      });
      continue;
    }

    if (part.type === "tool-call") {
      toolCalls.push({ name: part.toolName, input: part.input });
      debate.onEvent({
        type: "tool_call",
        agentRole: input.agentRole,
        round: input.round,
        name: part.toolName,
        input: part.input,
      });
      continue;
    }

    if (part.type === "tool-result") {
      debate.onEvent({
        type: "tool_result",
        agentRole: input.agentRole,
        round: input.round,
        name: part.toolName,
        output: part.output,
      });
      continue;
    }

    if (part.type === "error") {
      throw part.error;
    }
  }

  const usage = await result.usage;
  const sanitized =
    stripProhibitedSentences(content.trim()) ||
    "The agent could not produce a grounded response from the available evidence.";

  const turn: DebateTurn = {
    round: input.round,
    turnIndex: input.turnIndex,
    agentRole: input.agentRole,
    phase: input.phase,
    content: sanitized,
    evidenceRefs: extractEvidenceRefs(sanitized, input.validIds),
    toolCalls,
    model: MODEL_NAME,
    modelVersion: MODEL_VERSION,
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    },
  };

  await debate.onTurnComplete(turn);
  debate.onEvent({ type: "turn_completed", turn });

  return turn;
}

export async function runPromotionDebate(
  input: PromotionDebateInput
): Promise<{
  turns: DebateTurn[];
  summary: DebateSummary;
  model: string;
  modelVersion: string;
}> {
  const validIds = new Set(input.evidenceCatalog.map((entry) => entry.id));

  input.onEvent({
    type: "run_started",
    runId: input.runId,
    participants: ["advocate", "examiner"],
    rounds: 2,
  });

  const advocateOpening = await runTurn({
    debate: input,
    round: 1,
    turnIndex: 0,
    agentRole: "advocate",
    phase: "opening",
    opponentTurns: [],
    validIds,
  });

  const examinerOpening = await runTurn({
    debate: input,
    round: 1,
    turnIndex: 1,
    agentRole: "examiner",
    phase: "opening",
    opponentTurns: [],
    validIds,
  });

  const advocateRebuttal = await runTurn({
    debate: input,
    round: 2,
    turnIndex: 0,
    agentRole: "advocate",
    phase: "rebuttal",
    opponentTurns: [examinerOpening],
    validIds,
  });

  const examinerRebuttal = await runTurn({
    debate: input,
    round: 2,
    turnIndex: 1,
    agentRole: "examiner",
    phase: "rebuttal",
    opponentTurns: [advocateOpening, advocateRebuttal],
    validIds,
  });

  const turns = [
    advocateOpening,
    examinerOpening,
    advocateRebuttal,
    examinerRebuttal,
  ];

  const transcript = turns
    .map(
      (turn) =>
        `[Round ${turn.round} · ${turn.agentRole} · ${turn.phase}] ${turn.content}`
    )
    .join("\n\n");

  const moderation = await generateObject({
    model: getOpenAI()(MODEL_NAME),
    schema: debateSummarySchema,
    system: MODERATOR_SYSTEM_PROMPT,
    prompt: `Employee: ${input.employeeName} (${input.employeeEmail})
Role: ${input.role}
Quarter: ${input.quarter}
Promotion eligibility on file: ${input.promotionEligible ? "yes" : "not configured or not eligible"}
Data sufficiency: ${input.dataSufficiency.level} — ${input.dataSufficiency.notes}

Evidence catalog:
${buildEvidenceBlock(input.evidenceCatalog)}

Debate transcript:
${transcript}`,
  });

  const raw = debateSummarySchema.parse(moderation.object);
  const strongestFor = sanitizeBullets(raw.strongestFor, validIds);
  const strongestAgainst = sanitizeBullets(raw.strongestAgainst, validIds);
  const fallbackRef = input.evidenceCatalog[0]?.id ?? "E1";

  let readiness: DebateReadiness = raw.readiness;
  let confidence = raw.confidence;

  if (input.dataSufficiency.level === "insufficient") {
    readiness = "insufficient_evidence";
    confidence = "low";
  } else if (input.dataSufficiency.level === "partial" && confidence === "high") {
    confidence = "medium";
  }

  const summary: DebateSummary = {
    readiness,
    summary:
      stripProhibitedSentences(raw.summary) ||
      "The debate produced arguments on both sides. Review the transcript and open questions before deciding.",
    strongestFor:
      strongestFor.length > 0
        ? strongestFor
        : [fallbackBullet(advocateOpening, fallbackRef)],
    strongestAgainst:
      strongestAgainst.length > 0
        ? strongestAgainst
        : [fallbackBullet(examinerOpening, fallbackRef)],
    openQuestions: raw.openQuestions
      .map(stripProhibitedSentences)
      .filter((question) => question.length > 0),
    whatWouldChange: raw.whatWouldChange
      .map(stripProhibitedSentences)
      .filter((change) => change.length > 0),
    confidence,
  };

  if (summary.openQuestions.length === 0) {
    summary.openQuestions = [
      "What context is missing from the recorded evidence that a manager should confirm directly?",
    ];
  }
  if (summary.whatWouldChange.length === 0) {
    summary.whatWouldChange = [
      "Additional evidence from the next review period that addresses the open questions.",
    ];
  }

  input.onEvent({ type: "summary", summary });

  return {
    turns,
    summary,
    model: MODEL_NAME,
    modelVersion: MODEL_VERSION,
  };
}
