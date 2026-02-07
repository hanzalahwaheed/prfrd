import "server-only";

import {
  getSlackWebhookClient,
  type SlackWebhookAgentUpdatesPayload,
  type SlackWebhookAgentUpdatesResult,
} from "@/lib/services/slackWebhookClient";

export type { SlackWebhookAgentUpdatesPayload, SlackWebhookAgentUpdatesResult };

export async function sendAgentSlackWebhookUpdates(
  payload: SlackWebhookAgentUpdatesPayload
): Promise<SlackWebhookAgentUpdatesResult> {
  return getSlackWebhookClient().sendAgentUpdates(payload);
}
