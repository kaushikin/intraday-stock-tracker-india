// Server only. These keys never overlap the Angel limiter or any journal.
import { createHash } from 'node:crypto';
export type AlertRedis = (command: (string | number)[]) => Promise<any>;
export function alertStoreKey(suffix: string) {
  const client = process.env.ANGEL_CLIENT_CODE?.trim().toUpperCase();
  if (!client) throw new Error('Alert storage is not configured.');
  return (
    'gold-petal:alerts:v1:' +
    createHash('sha256').update(client).digest('hex') +
    ':' +
    suffix
  );
}
export const alertRedis: AlertRedis = async (command) => {
  const prefix = [
    'ANGEL_RATE_REDIS_REST',
    'UPSTASH_REDIS_REST',
    'KV_REST_API',
  ].find((p) => process.env[p + '_URL'] || process.env[p + '_TOKEN']);
  const url = prefix && process.env[prefix + '_URL'];
  const token = prefix && process.env[prefix + '_TOKEN'];
  if (!url || !token) throw new Error('Alert storage is unavailable.');
  const u = new URL(url);
  if (
    u.protocol !== 'https:' ||
    !u.hostname.endsWith('.upstash.io') ||
    u.port ||
    u.username ||
    u.password ||
    u.pathname !== '/' ||
    u.search ||
    u.hash
  )
    throw new Error('Alert storage is unavailable.');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error('Alert storage is unavailable.');
  const data = await response.json();
  if (data.error || !Object.hasOwn(data, 'result'))
    throw new Error('Alert storage is unavailable.');
  return data.result;
};
