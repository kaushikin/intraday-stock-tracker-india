require('./load-ts.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  COMMODITY_REVIEW,
  COMMODITY_SPECS,
  commodityRiskFloor,
  commodityAlertReadiness,
} = require('../lib/commodityValidation.ts');

test('MCX price units produce the correct rupee movement for one standard lot', () => {
  assert.equal(commodityRiskFloor('CRUDEOIL').tickValue, 100);
  assert.equal(commodityRiskFloor('COPPER').tickValue, 125);
  // Gold is quoted per 10 grams: 1 kg = 100 quoted units, not 1 or 1,000.
  assert.equal(commodityRiskFloor('GOLD').tickValue, 100);
  assert.equal(COMMODITY_SPECS.GOLD.priceMultiplier, 100);
});

test('risk review reserves slippage on both legs and normal brokerage with GST', () => {
  assert.deepEqual(commodityRiskFloor('CRUDEOIL'), {
    tickValue: 100,
    stopLoss: 100,
    slippageAllowance: 200,
    brokerageWithGST: 47.2,
    riskFloor: 347.2,
  });
  assert.equal(commodityRiskFloor('COPPER').riskFloor, 422.2);
  assert.equal(commodityRiskFloor('GOLD').riskFloor, 347.2);
});

test('all standard contracts fail even the whole daily ceiling; review never claims operational enforcement or validation', () => {
  for (const symbol of Object.keys(COMMODITY_SPECS)) {
    const status = commodityAlertReadiness(symbol);
    assert.equal(status.buy, 'BLOCKED');
    assert.equal(status.exit, 'NOT_MONITORED');
    assert.equal(status.strategyValidated, false);
    assert.equal(status.dailyLimitEnforced, false);
    assert.equal(status.exceedsDailyCeiling, true);
    assert.ok(status.tickValue > COMMODITY_REVIEW.existingTradeRisk);
  }
  assert.equal(COMMODITY_REVIEW.dailyLossCeiling, 250);
  assert.equal(COMMODITY_REVIEW.capital, 10000);
  assert.equal(COMMODITY_REVIEW.existingTradeRisk, 50);
});

test('validation screen is renderable without storage access and makes unavailable alerts and incomplete cost floor explicit', () => {
  const original = Object.getOwnPropertyDescriptor(global, 'localStorage');
  Object.defineProperty(global, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('Validation must not access either journal');
    },
  });
  try {
    const React = require('react');
    const { renderToStaticMarkup } = require('react-dom/server');
    const Panel = require('../components/CommodityValidationPanel.tsx').default;
    const html = renderToStaticMarkup(React.createElement(Panel));
    assert.equal((html.match(/BUY BLOCKED/g) || []).length, 3);
    assert.match(html, /Exit alerts are not active/);
    assert.match(html, /Planning limit · monitoring not active/);
    assert.match(html, /remaining daily balance is not available/);
    assert.match(html, /Other charges add more/);
    assert.match(html, /₹347.20/);
    assert.match(html, /₹422.20/);
    assert.doesNotMatch(html, /<button|<input|<form/);
  } finally {
    if (original) Object.defineProperty(global, 'localStorage', original);
    else delete global.localStorage;
  }
});
