import speakeasy from "speakeasy";

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
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-UserType": "USER",
    "X-SourceID": "WEB",
    "X-ClientLocalIP": "127.0.0.1",
    "X-ClientPublicIP": "127.0.0.1",
    "X-MACAddress": "00:00:00:00:00:00",
    "X-PrivateKey": requiredEnv("ANGEL_API_KEY"),
  };

  if (jwtToken) {
    headers.Authorization = `Bearer ${jwtToken}`;
  }

  return headers;
}

export async function getAngelSession() {
  const now = Date.now();

  if (
    global.angelSessionCache?.jwtToken &&
    global.angelSessionCache.expiresAt &&
    global.angelSessionCache.expiresAt > now
  ) {
    return global.angelSessionCache;
  }

  const clientCode = requiredEnv("ANGEL_CLIENT_CODE");
  const pin = requiredEnv("ANGEL_PIN");
  const totpSecret = requiredEnv("ANGEL_TOTP_SECRET");

  const totp = speakeasy.totp({
    secret: totpSecret,
    encoding: "base32",
  });

  const response = await fetch(
    "https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword",
    {
      method: "POST",
      headers: angelHeaders(),
      body: JSON.stringify({
        clientcode: clientCode,
        password: pin,
        totp,
      }),
      cache: "no-store",
    }
  );

  const data = await response.json();

  if (!response.ok || !data?.data?.jwtToken) {
    console.error("Angel login failed:", data);
    throw new Error(data?.message || "Angel One login failed");
  }

  const session: AngelSessionCache = {
    jwtToken: data.data.jwtToken,
    refreshToken: data.data.refreshToken,
    feedToken: data.data.feedToken,
    expiresAt: now + 10 * 60 * 60 * 1000,
  };

  global.angelSessionCache = session;

  return session;
}
export async function getAngelMarketData(
  exchangeTokens: Record<string, string[]>
) {
  const session = await getAngelSession();

  const response = await fetch(
    "https://apiconnect.angelone.in/rest/secure/angelbroking/market/v1/quote/",
    {
      method: "POST",
      headers: angelHeaders(session.jwtToken),
      body: JSON.stringify({
        mode: "FULL",
        exchangeTokens,
      }),
      cache: "no-store",
    }
  );

  const raw = await response.text();

  let data: any;

  try {
    data = JSON.parse(raw);
  } catch {
    console.error("Angel returned non-JSON response:", {
      status: response.status,
      raw: raw.slice(0, 300),
      exchangeTokens,
    });

    throw new Error(
      raw.toLowerCase().includes("access")
        ? "Angel API access denied. Check IP whitelist, segment permission, or commodity/MCX access."
        : "Angel returned invalid non-JSON response"
    );
  }

  if (!response.ok || data?.status === false) {
    console.error("Angel market data failed:", data);
    throw new Error(data?.message || "Failed to fetch Angel market data");
  }

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

export async function getAngelCandleData(request: AngelCandleRequest) {
  const session = await getAngelSession();

  const response = await fetch(
    'https://apiconnect.angelone.in/rest/secure/angelbroking/historical/v1/getCandleData',
    {
      method: 'POST',
      headers: angelHeaders(session.jwtToken),
      body: JSON.stringify(request),
      cache: 'no-store',
    }
  );

  const raw = await response.text();

  let data: any;

  try {
    data = JSON.parse(raw);
  } catch {
    console.error('Angel candle API returned non-JSON response:', {
      status: response.status,
      raw: raw.slice(0, 300),
      request,
    });

    throw new Error('Angel candle API returned invalid non-JSON response');
  }

  if (!response.ok || data?.status === false) {
    console.error('Angel candle data failed:', data);
    throw new Error(data?.message || 'Failed to fetch Angel candle data');
  }

  return data;
}
