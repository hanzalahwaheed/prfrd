import "server-only";

import type {
  MonthlySynthesisOutput,
  QuarterlySynthesisOutput,
} from "@/lib/ai/insightGenerator";
import type { EvidenceCatalogEntry } from "@/lib/ai/managerAnalysis";

export function buildEvidenceCatalog(input: {
  quarter: string;
  quarterly: QuarterlySynthesisOutput;
  monthlyHistory: Array<{ month: string; synthesis: MonthlySynthesisOutput }>;
}): EvidenceCatalogEntry[] {
  const entries: EvidenceCatalogEntry[] = [];

  function pushEntry(
    sourceType: EvidenceCatalogEntry["sourceType"],
    sourceKey: string,
    field: string,
    summary: string
  ) {
    const trimmed = summary.trim();
    if (!trimmed) return;
    const id = `E${entries.length + 1}`;
    entries.push({ id, sourceType, sourceKey, field, summary: trimmed });
  }

  pushEntry(
    "quarterly_synthesis",
    input.quarter,
    "trajectorySummary",
    input.quarterly.trajectorySummary
  );
  for (const [index, strength] of input.quarterly.keyStrengths.entries()) {
    pushEntry(
      "quarterly_synthesis",
      input.quarter,
      `keyStrengths[${index}]`,
      strength
    );
  }
  for (const [index, concern] of input.quarterly.keyConcerns.entries()) {
    pushEntry(
      "quarterly_synthesis",
      input.quarter,
      `keyConcerns[${index}]`,
      concern
    );
  }
  pushEntry(
    "quarterly_synthesis",
    input.quarter,
    "burnoutAssessment",
    input.quarterly.burnoutAssessment
  );
  pushEntry(
    "quarterly_synthesis",
    input.quarter,
    "growthAssessment",
    input.quarterly.growthAssessment
  );
  pushEntry(
    "quarterly_synthesis",
    input.quarter,
    "retentionAssessment",
    input.quarterly.retentionAssessment
  );
  for (const [index, action] of input.quarterly.recommendedActions.entries()) {
    pushEntry(
      "quarterly_synthesis",
      input.quarter,
      `recommendedActions[${index}]`,
      action
    );
  }
  for (const snapshot of input.quarterly.evidenceSnapshots) {
    for (const [index, evidence] of snapshot.evidence.entries()) {
      pushEntry(
        "quarterly_synthesis",
        input.quarter,
        `evidenceSnapshots.${snapshot.signalId}.evidence[${index}]`,
        evidence.summary
      );
    }
  }

  for (const monthly of input.monthlyHistory) {
    pushEntry(
      "monthly_synthesis",
      monthly.month,
      "overallSummary",
      monthly.synthesis.overallSummary
    );
    for (const [index, risk] of monthly.synthesis.identifiedRisks.entries()) {
      pushEntry(
        "monthly_synthesis",
        monthly.month,
        `identifiedRisks[${index}]`,
        risk
      );
    }
    for (const [index, opportunity] of monthly.synthesis.identifiedOpportunities.entries()) {
      pushEntry(
        "monthly_synthesis",
        monthly.month,
        `identifiedOpportunities[${index}]`,
        opportunity
      );
    }
  }

  return entries;
}
