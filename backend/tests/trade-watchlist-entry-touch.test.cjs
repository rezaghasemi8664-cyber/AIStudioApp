'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const advanceEntryTouchState = require('../utils/tradeWatchlistEntryTouch.cjs');

function item() {
  return { entryPrice: 100, entryPriceLastObserved: null, entryPriceTriggered: false };
}

test('does not mark touch when the first observed quote is above entry', () => {
  const row = item();
  assert.equal(advanceEntryTouchState(row, 120), true);
  assert.equal(row.entryPriceTriggered, false);
  assert.equal(row.entryPriceLastObserved, 120);
});

test('marks touch when a later quote exactly reaches entry from above', () => {
  const row = item();
  advanceEntryTouchState(row, 110);
  assert.equal(advanceEntryTouchState(row, 100), true);
  assert.equal(row.entryPriceTriggered, true);
});

test('marks touch when price falls across entry without an exact quote', () => {
  const row = item();
  advanceEntryTouchState(row, 120);
  assert.equal(advanceEntryTouchState(row, 99), true);
  assert.equal(row.entryPriceTriggered, true);
});

test('does not mark touch merely because the first quote is below entry', () => {
  const row = item();
  advanceEntryTouchState(row, 95);
  assert.equal(advanceEntryTouchState(row, 98), true);
  assert.equal(row.entryPriceTriggered, false);
});

test('marks touch when price rises across entry from below', () => {
  const row = item();
  advanceEntryTouchState(row, 95);
  advanceEntryTouchState(row, 98);
  assert.equal(advanceEntryTouchState(row, 101), true);
  assert.equal(row.entryPriceTriggered, true);
});

test('marks touch immediately when the first post-add quote equals entry', () => {
  const row = item();
  assert.equal(advanceEntryTouchState(row, 100), true);
  assert.equal(row.entryPriceTriggered, true);
});

test('keeps triggered state after later price changes', () => {
  const row = item();
  advanceEntryTouchState(row, 110);
  advanceEntryTouchState(row, 100);
  assert.equal(advanceEntryTouchState(row, 90), false);
  assert.equal(row.entryPriceTriggered, true);
});
