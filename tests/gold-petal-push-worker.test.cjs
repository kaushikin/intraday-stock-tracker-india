const test = require('node:test'),
  assert = require('node:assert/strict'),
  vm = require('node:vm'),
  fs = require('node:fs');
test('closed-page push displays a short-lived candidate, marks delayed messages expired and opens only Gold Petal', async () => {
  const listeners = {},
    notifications = [],
    opened = [];
  const self = {
    location: { origin: 'https://paper.example.test' },
    addEventListener: (name, fn) => (listeners[name] = fn),
    registration: {
      showNotification: async (title, options) =>
        notifications.push({ title, ...options }),
    },
    clients: {
      matchAll: async () => [],
      openWindow: async (url) => opened.push(url),
    },
  };
  vm.runInNewContext(
    fs.readFileSync(require.resolve('../public/sw.js'), 'utf8'),
    { self, Date, URL, Number, String },
  );
  let pending;
  const push = async (payload) => {
    listeners.push({
      data: { json: () => payload },
      waitUntil: (p) => (pending = p),
    });
    await pending;
  };
  await push({
    kind: 'CANDIDATE',
    title: 'Candidate to verify',
    body: 'Recheck fees and risk.',
    expiresAt: Date.now() + 30000,
    tag: 'bar',
  });
  assert.equal(notifications[0].title, 'Candidate to verify');
  await push({
    kind: 'CANDIDATE',
    title: 'Candidate',
    body: 'Old prices',
    expiresAt: Date.now() - 1,
  });
  assert.match(notifications[1].title, /expired/);
  assert.ok(!notifications[1].body.includes('Old prices'));
  listeners.notificationclick({
    notification: {
      data: { goldPetal: true, url: 'https://evil.test' },
      close() {},
    },
    waitUntil: (p) => (pending = p),
  });
  await pending;
  assert.deepEqual(opened, [
    'https://paper.example.test/commodities/gold-petal',
  ]);
});
