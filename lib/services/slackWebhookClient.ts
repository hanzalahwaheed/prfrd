import "server-only";

export type SlackWebhookMessageBlock = Record<string, unknown>;

export type SlackWebhookUpdate = {
  recipient: string;
  message: string;
  blocks?: SlackWebhookMessageBlock[];
  webhookUrl?: string;
};

export type SlackWebhookAgentUpdatesPayload = {
  employeeUpdates: SlackWebhookUpdate[];
  managerUpdate?: SlackWebhookUpdate;
};

export type SlackWebhookSendResult = {
  recipient: string;
  statusCode: number;
  responseBody: string;
};

export type SlackWebhookAgentUpdatesResult = {
  employeeResults: SlackWebhookSendResult[];
  managerResult?: SlackWebhookSendResult;
};

export const SLACK_WEBHOOK_RECIPIENT_ENV_MAP = {
  alice: "SLACK_WEBHOOK_ALICE_URL",
  bob: "SLACK_WEBHOOK_BOB_URL",
  eve: "SLACK_WEBHOOK_EVE_URL",
  manager: "SLACK_WEBHOOK_MANAGER_URL",
} as const;

type RecipientEnvKey = keyof typeof SLACK_WEBHOOK_RECIPIENT_ENV_MAP;

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function normalizeRecipient(recipient: string): string {
  return recipient.trim().toLowerCase();
}

function ensureWebhookUrl(url: string, recipient: string): string {
  const normalized = url.trim();
  if (!normalized.startsWith("https://hooks.slack.com/services/")) {
    throw new Error(
      `Invalid Slack webhook URL for recipient "${recipient}". Expected an incoming webhook URL.`
    );
  }
  return normalized;
}

function addRecipientMappings(
  map: Record<string, string>,
  recipient: RecipientEnvKey,
  webhookUrl: string
): void {
  map[recipient] = webhookUrl;

  if (recipient !== "manager") {
    map[`${recipient}@company.com`] = webhookUrl;
  }
}

export class SlackWebhookClient {
  private readonly recipientWebhookMap: Map<string, string>;

  constructor(recipientWebhookMap: Record<string, string>) {
    this.recipientWebhookMap = new Map(
      Object.entries(recipientWebhookMap).map(([key, value]) => [
        normalizeRecipient(key),
        ensureWebhookUrl(value, key),
      ])
    );
  }

  static fromEnv(overrides: Partial<Record<string, string>> = {}): SlackWebhookClient {
    const map: Record<string, string> = {};

    for (const [recipient, envKey] of Object.entries(
      SLACK_WEBHOOK_RECIPIENT_ENV_MAP
    ) as [RecipientEnvKey, string][]) {
      const value = overrides[recipient] ?? readOptionalEnv(envKey);
      if (!value) {
        continue;
      }
      addRecipientMappings(map, recipient, value);
    }

    return new SlackWebhookClient(map);
  }

  listConfiguredRecipients(): string[] {
    return [...new Set(this.recipientWebhookMap.keys())];
  }

  hasRecipient(recipient: string): boolean {
    return this.recipientWebhookMap.has(normalizeRecipient(recipient));
  }

  private resolveWebhookUrl(update: SlackWebhookUpdate): string {
    if (update.webhookUrl) {
      return ensureWebhookUrl(update.webhookUrl, update.recipient);
    }

    const mappedUrl = this.recipientWebhookMap.get(
      normalizeRecipient(update.recipient)
    );

    if (!mappedUrl) {
      throw new Error(
        `No Slack webhook is configured for recipient "${update.recipient}".`
      );
    }

    return mappedUrl;
  }

  async sendUpdate(update: SlackWebhookUpdate): Promise<SlackWebhookSendResult> {
    const webhookUrl = this.resolveWebhookUrl(update);
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        text: update.message,
        blocks: update.blocks,
      }),
    });

    const responseBody = await response.text();
    if (!response.ok) {
      throw new Error(
        `Slack webhook request failed for "${update.recipient}" with HTTP ${response.status}: ${responseBody}`
      );
    }

    const normalizedResponse = responseBody.trim().toLowerCase();
    if (normalizedResponse !== "ok") {
      throw new Error(
        `Slack webhook request for "${update.recipient}" returned unexpected response: ${responseBody}`
      );
    }

    return {
      recipient: update.recipient,
      statusCode: response.status,
      responseBody,
    };
  }

  async sendAgentUpdates(
    payload: SlackWebhookAgentUpdatesPayload
  ): Promise<SlackWebhookAgentUpdatesResult> {
    const employeeResults: SlackWebhookSendResult[] = [];
    for (const update of payload.employeeUpdates) {
      employeeResults.push(await this.sendUpdate(update));
    }

    const managerResult = payload.managerUpdate
      ? await this.sendUpdate(payload.managerUpdate)
      : undefined;

    return {
      employeeResults,
      managerResult,
    };
  }
}

let cachedSlackWebhookClient: SlackWebhookClient | null = null;

export function getSlackWebhookClient(): SlackWebhookClient {
  if (!cachedSlackWebhookClient) {
    cachedSlackWebhookClient = SlackWebhookClient.fromEnv();
  }
  return cachedSlackWebhookClient;
}
