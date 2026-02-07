import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_SLACK_API_BASE_URL = "https://slack.com/api";

export type SlackClientConfig = {
  appId: string;
  clientId: string;
  clientSecret: string;
  signingSecret: string;
  verificationToken?: string;
  appToken?: string;
  botToken?: string;
  apiBaseUrl?: string;
};

type SlackApiBaseResponse = {
  ok: boolean;
  error?: string;
};

type SlackUserLookupResponse = SlackApiBaseResponse & {
  user?: {
    id?: string;
  };
};

type SlackConversationsOpenResponse = SlackApiBaseResponse & {
  channel?: {
    id?: string;
  };
};

type SlackPostMessageResponse = SlackApiBaseResponse & {
  channel?: string;
  ts?: string;
};

type SlackOAuthResponse = SlackApiBaseResponse & {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  authed_user?: {
    id?: string;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  team?: {
    id?: string;
    name?: string;
  };
};

export type SlackMessageBlock = Record<string, unknown>;

export type SlackDirectMessageResult = {
  email: string;
  userId: string;
  channelId: string;
  ts: string;
};

export type SlackEmployeeUpdate = {
  employeeEmail: string;
  message: string;
  blocks?: SlackMessageBlock[];
};

export type SlackManagerUpdate = {
  managerEmail: string;
  message: string;
  blocks?: SlackMessageBlock[];
};

export type SlackAgentUpdatesPayload = {
  employeeUpdates: SlackEmployeeUpdate[];
  managerUpdate: SlackManagerUpdate;
  accessToken?: string;
};

export type SlackAgentUpdatesResult = {
  employeeResults: SlackDirectMessageResult[];
  managerResult: SlackDirectMessageResult;
};

export class SlackApiError extends Error {
  constructor(
    message: string,
    readonly method: string,
    readonly statusCode: number,
    readonly slackError?: string
  ) {
    super(message);
  }
}

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name}. Set it in your server environment (e.g. .env.local).`
    );
  }
  return value;
}

function readOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export class SlackClient {
  readonly appId: string;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly signingSecret: string;
  readonly verificationToken?: string;
  readonly appToken?: string;
  readonly botToken?: string;
  readonly apiBaseUrl: string;

  constructor(config: SlackClientConfig) {
    this.appId = config.appId;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.signingSecret = config.signingSecret;
    this.verificationToken = config.verificationToken;
    this.appToken = config.appToken;
    this.botToken = config.botToken;
    this.apiBaseUrl = config.apiBaseUrl ?? DEFAULT_SLACK_API_BASE_URL;
  }

  static fromEnv(overrides: Partial<SlackClientConfig> = {}): SlackClient {
    return new SlackClient({
      appId: overrides.appId ?? readRequiredEnv("SLACK_APP_ID"),
      clientId: overrides.clientId ?? readRequiredEnv("SLACK_CLIENT_ID"),
      clientSecret:
        overrides.clientSecret ?? readRequiredEnv("SLACK_CLIENT_SECRET"),
      signingSecret:
        overrides.signingSecret ?? readRequiredEnv("SLACK_SIGNING_SECRET"),
      verificationToken:
        overrides.verificationToken ??
        readOptionalEnv("SLACK_VERIFICATION_TOKEN"),
      appToken: overrides.appToken ?? readOptionalEnv("SLACK_APP_TOKEN"),
      botToken: overrides.botToken ?? readOptionalEnv("SLACK_BOT_TOKEN"),
      apiBaseUrl:
        overrides.apiBaseUrl ??
        readOptionalEnv("SLACK_API_BASE_URL") ??
        DEFAULT_SLACK_API_BASE_URL,
    });
  }

  private resolveAccessToken(accessToken?: string): string {
    const token = accessToken ?? this.botToken;
    if (!token) {
      throw new Error(
        "Missing Slack access token. Provide `accessToken` or set SLACK_BOT_TOKEN."
      );
    }
    if (token.startsWith("xapp-")) {
      throw new Error(
        "SLACK_BOT_TOKEN must be a bot/user token (xoxb- or xoxp-). xapp- tokens are app-level and cannot call chat.postMessage."
      );
    }
    return token;
  }

  private async postJson<T extends SlackApiBaseResponse>(
    method: string,
    payload: Record<string, unknown>,
    accessToken: string
  ): Promise<T> {
    const response = await fetch(`${this.apiBaseUrl}/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    const rawResponse = await response.text();
    let parsed: T;

    try {
      parsed = JSON.parse(rawResponse) as T;
    } catch {
      throw new SlackApiError(
        `Slack ${method} returned non-JSON response.`,
        method,
        response.status
      );
    }

    if (!response.ok) {
      throw new SlackApiError(
        `Slack ${method} failed with HTTP ${response.status}.`,
        method,
        response.status,
        parsed.error
      );
    }

    if (!parsed.ok) {
      throw new SlackApiError(
        `Slack ${method} failed: ${parsed.error ?? "unknown_error"}.`,
        method,
        response.status,
        parsed.error
      );
    }

    return parsed;
  }

  async exchangeOAuthCode(params: {
    code: string;
    redirectUri?: string;
  }): Promise<SlackOAuthResponse> {
    const payload = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code: params.code,
    });

    if (params.redirectUri) {
      payload.set("redirect_uri", params.redirectUri);
    }

    const response = await fetch(`${this.apiBaseUrl}/oauth.v2.access`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: payload.toString(),
    });

    const rawResponse = await response.text();
    let parsed: SlackOAuthResponse;

    try {
      parsed = JSON.parse(rawResponse) as SlackOAuthResponse;
    } catch {
      throw new SlackApiError(
        "Slack oauth.v2.access returned non-JSON response.",
        "oauth.v2.access",
        response.status
      );
    }

    if (!response.ok || !parsed.ok) {
      throw new SlackApiError(
        `Slack oauth.v2.access failed: ${parsed.error ?? `HTTP ${response.status}`}.`,
        "oauth.v2.access",
        response.status,
        parsed.error
      );
    }

    return parsed;
  }

  async lookupUserIdByEmail(
    email: string,
    accessToken?: string
  ): Promise<string> {
    const token = this.resolveAccessToken(accessToken);
    const response = await this.postJson<SlackUserLookupResponse>(
      "users.lookupByEmail",
      { email },
      token
    );
    const userId = response.user?.id;

    if (!userId) {
      throw new SlackApiError(
        `Slack users.lookupByEmail returned no user id for ${email}.`,
        "users.lookupByEmail",
        200
      );
    }

    return userId;
  }

  async openDirectMessageChannel(
    userId: string,
    accessToken?: string
  ): Promise<string> {
    const token = this.resolveAccessToken(accessToken);
    const response = await this.postJson<SlackConversationsOpenResponse>(
      "conversations.open",
      { users: userId },
      token
    );
    const channelId = response.channel?.id;

    if (!channelId) {
      throw new SlackApiError(
        `Slack conversations.open returned no channel id for user ${userId}.`,
        "conversations.open",
        200
      );
    }

    return channelId;
  }

  async sendMessageToChannel(params: {
    channelId: string;
    text: string;
    blocks?: SlackMessageBlock[];
    accessToken?: string;
  }): Promise<{ channelId: string; ts: string }> {
    const token = this.resolveAccessToken(params.accessToken);
    const response = await this.postJson<SlackPostMessageResponse>(
      "chat.postMessage",
      {
        channel: params.channelId,
        text: params.text,
        blocks: params.blocks,
      },
      token
    );

    const channelId = response.channel;
    const ts = response.ts;

    if (!channelId || !ts) {
      throw new SlackApiError(
        "Slack chat.postMessage returned no message metadata.",
        "chat.postMessage",
        200
      );
    }

    return { channelId, ts };
  }

  async sendDirectMessageByEmail(params: {
    email: string;
    text: string;
    blocks?: SlackMessageBlock[];
    accessToken?: string;
  }): Promise<SlackDirectMessageResult> {
    const userId = await this.lookupUserIdByEmail(params.email, params.accessToken);
    const channelId = await this.openDirectMessageChannel(userId, params.accessToken);
    const message = await this.sendMessageToChannel({
      channelId,
      text: params.text,
      blocks: params.blocks,
      accessToken: params.accessToken,
    });

    return {
      email: params.email,
      userId,
      channelId: message.channelId,
      ts: message.ts,
    };
  }

  async sendEmployeeUpdate(
    update: SlackEmployeeUpdate,
    accessToken?: string
  ): Promise<SlackDirectMessageResult> {
    return this.sendDirectMessageByEmail({
      email: update.employeeEmail,
      text: update.message,
      blocks: update.blocks,
      accessToken,
    });
  }

  async sendManagerUpdate(
    update: SlackManagerUpdate,
    accessToken?: string
  ): Promise<SlackDirectMessageResult> {
    return this.sendDirectMessageByEmail({
      email: update.managerEmail,
      text: update.message,
      blocks: update.blocks,
      accessToken,
    });
  }

  async sendAgentUpdates(
    payload: SlackAgentUpdatesPayload
  ): Promise<SlackAgentUpdatesResult> {
    const employeeResults: SlackDirectMessageResult[] = [];

    for (const update of payload.employeeUpdates) {
      employeeResults.push(
        await this.sendEmployeeUpdate(update, payload.accessToken)
      );
    }

    const managerResult = await this.sendManagerUpdate(
      payload.managerUpdate,
      payload.accessToken
    );

    return { employeeResults, managerResult };
  }

  verifyRequestSignature(params: {
    rawBody: string;
    timestamp: string;
    signature: string;
    toleranceSeconds?: number;
  }): boolean {
    const tolerance = params.toleranceSeconds ?? 60 * 5;
    const timestampNumber = Number(params.timestamp);

    if (!Number.isFinite(timestampNumber)) {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestampNumber) > tolerance) {
      return false;
    }

    const base = `v0:${params.timestamp}:${params.rawBody}`;
    const expected = `v0=${createHmac("sha256", this.signingSecret)
      .update(base, "utf8")
      .digest("hex")}`;

    const providedBuffer = Buffer.from(params.signature, "utf8");
    const expectedBuffer = Buffer.from(expected, "utf8");

    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(providedBuffer, expectedBuffer);
  }

  verifyLegacyToken(token: string): boolean {
    return Boolean(this.verificationToken && token === this.verificationToken);
  }
}

let cachedSlackClient: SlackClient | null = null;

export function getSlackClient(): SlackClient {
  if (!cachedSlackClient) {
    cachedSlackClient = SlackClient.fromEnv();
  }
  return cachedSlackClient;
}
