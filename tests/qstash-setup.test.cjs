require('./load-ts.cjs');
const test = require('node:test'),
  assert = require('node:assert/strict');
const {
  normalizeQStashToken,
  qstashRequest,
} = require('../lib/qstashSetup.ts');
test('QStash setup accepts common single-token copy formats and rejects credential blocks', () => {
  const token = 'eyJ_private.value-' + 'x'.repeat(30) + '==';
  for (const value of [
    token,
    `  ${token}\n`,
    `"${token}"`,
    `'${token}'`,
    `QSTASH_TOKEN="${token}"`,
    `export QSTASH_TOKEN = '${token}'`,
    `Bearer ${token}`,
  ])
    assert.equal(normalizeQStashToken(value), token);
  for (const value of [
    null,
    {},
    '',
    'short',
    `"${token}`,
    `QSTASH_CURRENT_SIGNING_KEY=${token}`,
    `UPSTASH_REDIS_REST_TOKEN=${token}`,
    `QSTASH_TOKEN=${token}\nQSTASH_NEXT_SIGNING_KEY=private`,
    `${token}\r\nX-Secret: data`,
    `${token}\u0000`,
    `QSTASH_TOKEN=${token}QSTASH_URL=https://private`,
    'x'.repeat(4201),
  ])
    assert.throws(() => normalizeQStashToken(value), {
      code: 'token-format',
      stage: 'input',
    });
});
test('QStash failures retain only safe categories and the HTTP status, never arbitrary provider details', async () => {
  const secret = 'never-display-this-secret';
  for (const [status, body, code] of [
    [401, secret, 'authentication'],
    [403, secret, 'permission'],
    [429, secret, 'quota'],
    [400, secret, 'schedule-settings'],
    [500, secret, 'service'],
    [502, secret, 'service'],
    [404, secret, 'response'],
    [400, 'maximum schedule limit exceeded ' + secret, 'schedule-limit'],
    [403, 'daily message limit ' + secret, 'quota'],
  ]) {
    await assert.rejects(
      qstashRequest(
        async () => new Response(JSON.stringify({ error: body }), { status }),
        '/v2/schedules/destination',
        {},
        'schedule',
      ),
      (e) => {
        assert.equal(e.code, code);
        assert.equal(e.httpStatus, status);
        assert.ok(!JSON.stringify(e.diagnostic('now')).includes(secret));
        assert.ok(!e.message.includes(secret));
        return true;
      },
    );
  }
  await assert.rejects(
    qstashRequest(
      async () => {
        throw Error(secret);
      },
      '/v2/schedules',
      {},
      'token-check',
    ),
    { code: 'network', stage: 'token-check', httpStatus: null },
  );
  await assert.rejects(
    qstashRequest(
      async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw Error(secret);
        },
      }),
      '/v2/schedules',
      {},
      'token-check',
    ),
    { code: 'response', stage: 'token-check', httpStatus: 200 },
  );
});
test('provider details distinguish write restrictions, account activation and destination refusals without private data', async () => {
  const token = 'a-valid-but-private-token-value';
  const callback = 'private-callback-secret-for-this-test';
  for (const [body, expected] of [
    [
      JSON.stringify({ message: 'Read-only token cannot create schedules' }),
      /read-only token cannot create schedules/,
    ],
    [
      JSON.stringify({
        error: { message: 'Account is disabled until verification' },
      }),
      /account is disabled until verification/,
    ],
    [
      'Custom schedule id is not allowed for this plan',
      /custom schedule id is not allowed for this plan/,
    ],
    [
      JSON.stringify({
        detail:
          'Destination is blocked: https://private.example/path?secret=' +
          token,
      }),
      /destination is blocked/,
    ],
    [
      JSON.stringify({
        reason:
          'Permission denied for user person@example.com token ' +
          token +
          ' header ' +
          callback,
      }),
      /permission denied/,
    ],
    [
      '<html><body>Forbidden ' + token + '</body></html>',
      /Non-JSON access error/,
    ],
  ]) {
    await assert.rejects(
      qstashRequest(
        async () => new Response(body, { status: 403 }),
        '/v2/schedules/destination',
        {
          headers: {
            Authorization: 'Bearer ' + token,
            'Upstash-Forward-Authorization': 'Bearer ' + callback,
          },
        },
        'schedule',
      ),
      (error) => {
        assert.equal(error.code, 'permission');
        assert.match(error.providerDetail, expected);
        const saved = JSON.stringify(error.diagnostic('now'));
        for (const privateValue of [
          token,
          callback,
          'person@example.com',
          'private.example',
          '<html>',
        ])
          assert.ok(!saved.includes(privateValue), privateValue);
        return true;
      },
    );
  }
});
