export const QSTASH_EU_URL = 'https://qstash-eu-central-1.upstash.io';
export type SetupStage = 'input' | 'token-check' | 'schedule' | 'storage';
export type SetupCode =
  | 'token-format'
  | 'free-unconfirmed'
  | 'authentication'
  | 'permission'
  | 'quota'
  | 'schedule-limit'
  | 'schedule-settings'
  | 'service'
  | 'network'
  | 'response'
  | 'storage';
export type SetupDiagnostic = {
  at: string;
  code: SetupCode | 'connected';
  stage: SetupStage;
  httpStatus: number | null;
  message: string;
  providerDetail?: string;
};
const messages: Record<SetupCode, string> = {
  'token-format':
    'Copy only the EU QSTASH_TOKEN value or its single QSTASH_TOKEN= line. Do not paste the whole Quickstart block, a signing key or a Redis token.',
  'free-unconfirmed':
    'Select QStash Free and confirm the Free-plan checkbox before connecting.',
  authentication:
    'QStash did not accept this token in the EU region. Copy QSTASH_TOKEN again from EU Quickstart; check that it has not been reset. Do not use a signing key or Redis token.',
  permission:
    'QStash refused permission for this operation. Keep the Free plan; check the provider detail before changing account settings.',
  quota:
    'QStash reported a request or account limit. Check EU usage and limits in its console, then retry when available. No paid upgrade is needed for this check.',
  'schedule-limit':
    'QStash reported a schedule limit. Check existing schedules in the EU console. Keep the Free plan; do not create another paid account or schedule.',
  'schedule-settings':
    'QStash rejected the schedule settings. The app needs a setup correction; copying the same token again will not resolve this response.',
  service:
    'QStash is temporarily unavailable. Wait a moment, then retry connecting on the Free plan.',
  network:
    'The app could not finish contacting QStash. Retry connecting; the fixed schedule name prevents duplicates if the earlier request arrived.',
  response:
    'QStash returned an unexpected setup response. Check EU schedules for intraday-india-gold-petal-v1 before retrying.',
  storage:
    'The app could not save the scheduler status. Check alert status, then retry connecting; the fixed schedule name prevents duplicates.',
};
export class QStashSetupError extends Error {
  constructor(
    readonly code: SetupCode,
    readonly stage: SetupStage,
    readonly httpStatus: number | null = null,
    readonly providerDetail?: string,
  ) {
    super(
      `${messages[code]} No watch was enabled by this connection attempt.${providerDetail ? ` Provider detail (filtered): ${providerDetail}` : ''}`,
    );
    this.name = 'QStashSetupError';
  }
  diagnostic(at: string): SetupDiagnostic {
    return {
      at,
      code: this.code,
      stage: this.stage,
      httpStatus: this.httpStatus,
      message: this.message,
      ...(this.providerDetail ? { providerDetail: this.providerDetail } : {}),
    };
  }
}
export function normalizeQStashToken(input: unknown): string {
  if (typeof input !== 'string' || input.length > 4200)
    throw new QStashSetupError('token-format', 'input');
  let value = input.trim();
  // Accept a single copied environment assignment, never a block of credentials.
  if (/[\r\n\x00-\x1f\x7f]/.test(value))
    throw new QStashSetupError('token-format', 'input');
  value = value.replace(/^(?:export +)?QSTASH_TOKEN *= */, '');
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  )
    value = value.slice(1, -1);
  value = value.replace(/^Bearer +/i, '');
  if (
    value.length < 20 ||
    value.length > 4000 ||
    !/^[A-Za-z0-9_.+/-]+={0,2}$/.test(value)
  )
    throw new QStashSetupError('token-format', 'input');
  return value;
}
// Only these diagnostic words may leave the server. Unknown words, IDs,
// addresses and numbers are hidden; this is a filtered excerpt, not a quote.
const diagnosticWords = new Set(
  `a an the this that these those your you user users account accounts
is are was were has have had be been being not no non only can cannot could may must should will
to for from of on in at by with without and or but as it its all any more than
qstash upstash free paid plan plans tier tiers pricing payment payments billing card credit
required requires require needing needs need upgrade upgraded enabled enable disabled disable
active inactive suspended suspension blocked block blocking restricted restriction restrictions
read-only readonly read write read-write permission permissions access allowed allow allows
denied deny forbidden unauthorized authorized authentication authorization token tokens invalid
expired revoked reset valid missing wrong incorrect verification verified verify unverified email
operation operations resource resources request requests rejected refused unsupported supported
support contact please error errors failed failure unable unexpected internal service unavailable
schedule schedules scheduling scheduled create creates creating creation update updating overwrite
delete deleting custom id ids identifier identifiers existing already exists duplicate conflict
cron expression frequency interval minimum maximum limit limits limited exceeded quota quotas
daily monthly message messages retry retries retrying rate burst timeout duration seconds minutes
destination destinations url urls endpoint endpoints address addresses domain domains public private
header headers content type method body format malformed length size response reason details
not-found precondition exceeded until before after try again later too many reached due usage
setting settings set setting-id schedule-id pending activation activated activate region eu us
different mismatch ownership owner organization team teams policy policies security ip network
mustn't don't doesn't isn't aren't wasn't weren't can't couldn't won't shouldn't`.split(
    /\s+/,
  ),
);
function filterProviderDetail(
  value: string,
  options: RequestInit,
): string | undefined {
  let detail = value.slice(0, 8000);
  const headers = new Headers(options.headers);
  for (const name of ['Authorization', 'Upstash-Forward-Authorization']) {
    const secret = headers.get(name)?.replace(/^Bearer\s+/i, '');
    if (secret)
      for (const encoded of [secret, encodeURIComponent(secret)])
        detail = detail.split(encoded).join(' [hidden] ');
  }
  detail = detail.replace(/https?:\/\/\S+|\b\S+@\S+\b/gi, ' [hidden] ');
  const words =
    detail.toLowerCase().match(/[a-z0-9]+(?:[-_'][a-z0-9]+)*/g) || [];
  const filtered = words
    .slice(0, 90)
    .map((word) => (diagnosticWords.has(word) ? word : '[hidden]'))
    .join(' ')
    .replace(/(?:\[hidden\] ?)+/g, '[hidden] ')
    .trim()
    .slice(0, 600);
  return filtered && filtered !== '[hidden]' ? filtered : undefined;
}
async function providerErrorDetail(response: Response, options: RequestInit) {
  const text = (await response.text()).slice(0, 8000);
  if (/^\s*</.test(text))
    return 'Non-JSON access error; no safe provider explanation was available.';
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    value = text;
  }
  if (typeof value === 'string') return filterProviderDetail(value, options);
  if (!value || typeof value !== 'object') return undefined;
  const body = value as Record<string, unknown>;
  const parts = [body.error, body.message, body.detail, body.reason];
  if (body.error && typeof body.error === 'object') {
    const nested = body.error as Record<string, unknown>;
    parts.push(nested.message, nested.detail, nested.reason);
  }
  return filterProviderDetail(
    parts.filter((part) => typeof part === 'string').join(' '),
    options,
  );
}
export async function qstashRequest(
  fetcher: typeof fetch,
  path: string,
  options: RequestInit,
  stage: 'token-check' | 'schedule',
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(QSTASH_EU_URL + path, {
      ...options,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(6000),
    });
  } catch {
    // Never propagate fetch errors, which may contain credentials or URLs.
    throw new QStashSetupError('network', stage);
  }
  if (!response.ok) {
    const status = response.status;
    let code: SetupCode =
      status === 401
        ? 'authentication'
        : status === 403
          ? 'permission'
          : status === 429
            ? 'quota'
            : status >= 500
              ? 'service'
              : stage === 'schedule' && status === 400
                ? 'schedule-settings'
                : 'response';
    let detail: string | undefined;
    // Retain only allowlisted diagnostic words, never arbitrary provider text.
    try {
      detail = await providerErrorDetail(response, options);
      if ([400, 403, 429].includes(status) && detail) {
        if (
          /(?:schedule.{0,60}(?:limit|quota)|(?:limit|quota).{0,60}schedule)/.test(
            detail,
          )
        )
          code = 'schedule-limit';
        else if (/(?:quota|rate limit|daily limit|message limit)/.test(detail))
          code = 'quota';
      }
    } catch {
      /* Keep the HTTP-status category if the response cannot be read. */
    }
    throw new QStashSetupError(code, stage, status, detail);
  }
  try {
    return await response.json();
  } catch {
    throw new QStashSetupError('response', stage, response.status);
  }
}
