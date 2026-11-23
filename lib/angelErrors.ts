export type AngelFailureKind =
  | 'RATE_LIMIT'
  | 'AUTH'
  | 'ACCESS'
  | 'UPSTREAM'
  | 'FORMAT'
  | 'NETWORK'
  | 'REJECTED'
  | 'SHARED_LIMIT'
  | 'TRACKING_UNAVAILABLE'
  | 'TRACKING_WARMUP';
export class AngelRequestError extends Error {
  constructor(
    public kind: AngelFailureKind,
    public httpStatus: number,
    public retryable: boolean,
    message: string,
    public retryAfterMs = 0
  ) {
    super(message);
  }
}
