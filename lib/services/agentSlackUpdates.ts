import "server-only";

import {
  getSlackClient,
  type SlackAgentUpdatesPayload,
  type SlackAgentUpdatesResult,
} from "@/lib/services/slackClient";

export type { SlackAgentUpdatesPayload, SlackAgentUpdatesResult };

export async function sendAgentSlackUpdates(
  payload: SlackAgentUpdatesPayload
): Promise<SlackAgentUpdatesResult> {
  return getSlackClient().sendAgentUpdates(payload);
}
