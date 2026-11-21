require('./load-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateCash3RPlan } = require('../lib/cashPlan.ts');
const base = {
  entry: 200,
  stop: 198,
  quantity: 15,
  spread: 0.05,
  tickSize: 0.05,
};

test('3R cash plan fits a small position with higher cost reserves and fails honestly when costs rise', () => {
  const plan = evaluateCash3RPlan(base);
  assert.equal(plan.target, 206);
  assert.equal(plan.atTarget.total, 12.9);
  assert.equal(plan.executionReserve, 5);
  assert.equal(plan.taxReserve, 1);
  assert.equal(plan.risk, 48.9);
  assert.equal(plan.reward, 71.1);
  assert.equal(plan.cashRequired, 3018.9);
  assert.equal(plan.costFeasible, true);
  assert.equal(
    evaluateCash3RPlan({ ...base, measuredSlippage: 8 }).costFeasible,
    false
  );
  const reduced = evaluateCash3RPlan({
    ...base,
    quantity: 13,
    measuredSlippage: 8,
  });
  assert.equal(reduced.risk, 47.75);
  assert.equal(reduced.reward, 56.25);
  assert.equal(reduced.costFeasible, false);
  assert.equal(
    evaluateCash3RPlan({ ...base, extraCharges: 2 }).costFeasible,
    false
  );
  assert.equal(
    evaluateCash3RPlan({ ...base, quantity: 16 }).costFeasible,
    false
  );
  assert.equal(
    evaluateCash3RPlan({ ...base, riskBudget: 48 }).costFeasible,
    false
  );
  assert.equal(evaluateCash3RPlan({ ...base, cash: 3000 }).costFeasible, false);
  assert.equal(
    evaluateCash3RPlan({ ...base, roundingReserve: 0 }).taxReserve,
    1
  );
  const smallerMove = evaluateCash3RPlan({
    entry: 500,
    stop: 497.5,
    quantity: 10,
    spread: 0.05,
    tickSize: 0.05,
  });
  assert.equal(smallerMove.target, 507.5);
  assert.equal(smallerMove.risk, 44.69);
  assert.equal(smallerMove.reward, 55.31);
  assert.equal(smallerMove.costFeasible, true);
});

test('3R plan keeps observed spread limits, enforces the new execution guard and never allows leverage or increased risk', () => {
  assert.equal(
    evaluateCash3RPlan({ ...base, spread: 0.3 }).costFeasible,
    false
  );
  assert.equal(
    evaluateCash3RPlan({ ...base, stop: 199, quantity: 15 }).costFeasible,
    false
  );
  assert.match(
    evaluateCash3RPlan({
      ...base,
      entry: 600,
      stop: 598,
      quantity: 10,
    }).reasons.join(' '),
    /₹5,000/
  );
  for (const delta of [
    { riskBudget: 51 },
    { cash: 10000 },
    { measuredSlippage: -1 },
    { spread: NaN },
    { quantity: 1.5 },
  ])
    assert.throws(() => evaluateCash3RPlan({ ...base, ...delta }));
});
