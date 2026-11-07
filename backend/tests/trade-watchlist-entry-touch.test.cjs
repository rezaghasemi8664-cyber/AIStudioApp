'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const advanceEntryTouchState = require('../utils/tradeWatchlistEntryTouch.cjs');

function item() { return { entryPrice: 100, entryPriceArmed: false, entryPriceTriggered: false }; }

test('does not mark touch when first observed quote is above entry', () => {
  const row = item();
  assert.equal(advanceEntryTouchState(row, 120), false);
  assert.equal(row.entryPriceTriggered, false);
});

test('marks touch when quote exactly reaches entry', () => {
  const row = item();
  assert.equal(advanceEntryTouchState(row, 100), true);
  assert.equal(row.entryPriceTriggered, true);
});

test('arms below entry and marks touch on upward crossing', () => {
  const row = item();
  assert.equal(advanceEntryTouchState(row, 95), true);
  assert.equal(row.entryPriceArmed, true);
  assert.equal(advanceEntryTouchState(row, 105), true);
  assert.equal(row.entryPriceTriggered, true);
});

test('does not trigger while price remains below entry', () => {
  const row = item();
  advanceEntryTouchState(row, 95);
  assert.equal(advanceEntryTouchState(row, 98), false);
  assert.equal(row.entryPriceTriggered, false);
});

test('keeps triggered state after later price decline', () => {
  const row = item();
  advanceEntryTouchState(row, 95);
  advanceEntryTouchState(row, 105);
  assert.equal(advanceEntryTouchState(row, 90), false);
  assert.equal(row.entryPriceTriggered, true);
});
