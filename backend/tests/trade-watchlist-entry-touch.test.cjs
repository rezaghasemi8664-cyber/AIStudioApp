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

test('marks touch when a later quote exactly reaches entry', () => {
  const row = item();
  assert.equal(advanceEntryTouchState(row, 110), false); // baseline at add time
  assert.equal(advanceEntryTouchState(row, 100), true);
  assert.equal(row.entryPriceTriggered, true);
});

test('marks touch when price falls from above entry to below it', () => {
  const row = item();
  assert.equal(advanceEntryTouchState(row, 120), false); // above-entry baseline
  assert.equal(advanceEntryTouchState(row, 99), true);
  assert.equal(row.entryPriceTriggered, true);
});

test('marks touch when price falls from below entry to at-or-below entry after baseline', () => {
  const row = item();
  assert.equal(advanceEntryTouchState(row, 95), false); // baseline below entry
  assert.equal(advanceEntryTouchState(row, 100), true);
  assert.equal(row.entryPriceTriggered, true);
});

test('does not trigger while price remains below entry', () => {
  const row = item();
  advanceEntryTouchState(row, 95); // baseline
  assert.equal(advanceEntryTouchState(row, 98), true);
  assert.equal(row.entryPriceTriggered, false);
});

test('keeps triggered state after later price decline', () => {
  const row = item();
  advanceEntryTouchState(row, 95); // baseline
  advanceEntryTouchState(row, 100);
  assert.equal(advanceEntryTouchState(row, 90), false);
  assert.equal(row.entryPriceTriggered, true);
});
