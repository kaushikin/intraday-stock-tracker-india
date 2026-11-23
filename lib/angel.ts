import speakeasy from 'speakeasy';
import { readAngel } from './angelTransport';

type AngelSessionCache = {
  jwtToken?: string;
  feedToken?: string;
  refreshToken?: string;
  expiresAt?: number;
};

declare global {
  // eslint-disable-next-line no-var
  var angelSessionCache: AngelSessionCache | undefined;
}

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function angelHeaders(jwtToken?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-UserType': 'USER',
    'X-SourceID': 'WEB',
    'X-ClientLocalIP': '127.0.0.1',
    'X-ClientPublicIP': '127.0.0.1',
    'X-MACAddress': '00:00:00:00:00:00',
    'X-PrivateKey': requiredEnv('ANGEL_API_KEY'),
  };

  if (jwtToken) {
    headers.Authorization = `Bearer ${jwtToken}`;
  }

  return headers;
}

let pendingSession: Promise<AngelSessionCache> | undefined;
export async function getAngelSession(): Promise<AngelSessionCache> {
  const now = Date.now();

  if (
    global.angelSessionCache?.jwtToken &&
    global.angelSessionCache.expiresAt &&
    global.angelSessionCache.expiresAt > now
  ) {
    return global.angelSessionCache;
  }
  if (pendingSession) return pendingSession;
  pendingSession = loginAngel();
  try {
    return await pendingSession;
  } finally {
    pendingSession = undefined;
  }
}

async function loginAngel(): Promise<AngelSessionCache> {
  const clientCode = requiredEnv('ANGEL_CLIENT_CODE');
  const pin = requiredEnv('ANGEL_PIN');
  const totpSecret = requiredEnv('ANGEL_TOTP_SECRET');

  const totp = speakeasy.totp({
    secret: totpSecret,
    encoding: 'base32',
  });

  const data = await readAngel(
    'https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword',
    {
      method: 'POST',
      headers: angelHeaders(),
      body: JSON.stringify({
        clientcode: clientCode,
        password: pin,
        totp,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    },
    'login',
    false
  );
  if (!data?.data?.jwtToken) {
    throw new Error(
      'Angel One login did not return a session. Check server credentials.'
    );
  }

  const session: AngelSessionCache = {
    jwtToken: data.data.jwtToken,
    refreshToken: data.data.refreshToken,
    feedToken: data.data.feedToken,
    expiresAt: Date.now() + 10 * 60 * 60 * 1000,
  };

  global.angelSessionCache = session;

  return session;
}
export async function getAngelMarketData(
  exchangeTokens: Record<string, string[]>,
  signal?: AbortSignal
) {
  const session = await getAngelSession();

  const data = await readAngel(
    'https://apiconnect.angelone.in/rest/secure/angelbroking/market/v1/quote/',
    {
      method: 'POST',
      headers: angelHeaders(session.jwtToken),
      body: JSON.stringify({
        mode: 'FULL',
        exchangeTokens,
      }),
      cache: 'no-store',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000),
    },
    'quotes'
  );

  return data;
}
export type AngelCandleInterval =
  | 'ONE_MINUTE'
  | 'THREE_MINUTE'
  | 'FIVE_MINUTE'
  | 'TEN_MINUTE'
  | 'FIFTEEN_MINUTE'
  | 'THIRTY_MINUTE'
  | 'ONE_HOUR'
  | 'ONE_DAY';

export type AngelCandleRequest = {
  exchange: string;
  symboltoken: string;
  interval: AngelCandleInterval;
  fromdate: string;
  todate: string;
};

export async function getAngelCandleData(
  request: AngelCandleRequest,
  signal?: AbortSignal
) {
  const session = await getAngelSession();

  const data = await readAngel(
    'https://apiconnect.angelone.in/rest/secure/angelbroking/historical/v1/getCandleData',
    {
      method: 'POST',
      headers: angelHeaders(session.jwtToken),
      body: JSON.stringify(request),
      cache: 'no-store',
      signal,
    },
    'candles'
  );
  if (!Array.isArray(data?.data))
    throw new Error('Angel candles response contains no candle series.');

  return data;
}
