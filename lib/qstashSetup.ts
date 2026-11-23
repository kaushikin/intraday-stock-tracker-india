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
};
const messages: Record<SetupCode, string> = {
  'token-format':
    'Copy only the EU QSTASH_TOKEN value or its single QSTASH_TOKEN= line. Do not paste the whole Quickstart block, a signing key or a Redis token.',
  'free-unconfirmed':
    'Select QStash Free and confirm the Free-plan checkbox before connecting.',
  authentication:
    'QStash did not accept this token in the EU region. Copy QSTASH_TOKEN again from EU Quickstart; check that it has not been reset. Do not use a signing key or Redis token.',
  permission:
    'QStash refused access. Check the EU account status and use the regular QSTASH_TOKEN, not a read-only token. Keep the Free plan.',
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
  ) {
    super(`${messages[code]} No watch was enabled by this connection attempt.`);
    this.name = 'QStashSetupError';
  }
  diagnostic(at: string): SetupDiagnostic {
    return {
      at,
      code: this.code,
      stage: this.stage,
      httpStatus: this.httpStatus,
      message: this.message,
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
    // Provider text is used only to select a fixed message, never returned or saved.
    if ([400, 403, 429].includes(status)) {
      try {
        const body = await response.json();
        const error =
          typeof body?.error === 'string'
            ? body.error.slice(0, 2000).toLowerCase()
            : '';
        if (
          /(?:schedule.{0,60}(?:limit|quota)|(?:limit|quota).{0,60}schedule)/.test(
            error,
          )
        )
          code = 'schedule-limit';
        else if (/(?:quota|rate limit|daily limit|message limit)/.test(error))
          code = 'quota';
      } catch {
        /* Keep the HTTP-status category. */
      }
    }
    throw new QStashSetupError(code, stage, status);
  }
  try {
    return await response.json();
  } catch {
    throw new QStashSetupError('response', stage, response.status);
  }
}
