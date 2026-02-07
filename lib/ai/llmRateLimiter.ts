import "server-only";

type QueueKey = string;

const queueByKey = new Map<QueueKey, Promise<void>>();
const lastCallAtByKey = new Map<QueueKey, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runWithLlmRateLimit<T>(input: {
  key: QueueKey;
  minIntervalMs: number;
  fn: () => Promise<T>;
}): Promise<T> {
  const previous = queueByKey.get(input.key) ?? Promise.resolve();
  let releaseQueue: () => void = () => {};

  const current = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });
  queueByKey.set(input.key, current);

  await previous;

  const elapsed = Date.now() - (lastCallAtByKey.get(input.key) ?? 0);
  const waitMs = Math.max(0, input.minIntervalMs - elapsed);
  if (waitMs > 0) {
    await sleep(waitMs);
  }

  try {
    return await input.fn();
  } finally {
    lastCallAtByKey.set(input.key, Date.now());
    releaseQueue();
  }
}
