// This lock coordinates refreshed tabs on the same origin/browser profile only.
// It never touches either journal and does not replace the server's rate limits.
export const CANDLE_FEED_LOCK = 'angel-candle-feed-v1';

function browserLocks() {
  return typeof navigator === 'undefined' ? undefined : navigator.locks;
}

export async function runScannerFeed<T>(
  signal: AbortSignal,
  read: () => Promise<T>
): Promise<T> {
  signal.throwIfAborted();
  const locks = browserLocks();
  // Older browsers retain the existing single-tab behavior.
  if (!locks) return read();
  return locks.request(CANDLE_FEED_LOCK, { signal }, async () => {
    signal.throwIfAborted();
    return read();
  });
}

export async function tryBackgroundCandleFeed(read: () => Promise<void>) {
  const locks = browserLocks();
  if (!locks) return read();
  // Skip, rather than queue, polling while a scan or another poll owns the feed.
  // The normal polling timer will try again after the active work finishes.
  await locks.request(CANDLE_FEED_LOCK, { ifAvailable: true }, async (lock) => {
    if (lock) await read();
  });
}
