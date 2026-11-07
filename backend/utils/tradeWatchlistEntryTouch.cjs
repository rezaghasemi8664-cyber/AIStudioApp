'use strict';

// Track the last observed quote and detect a real crossing of the entry level.
// The first quote establishes the post-add/edit baseline; it is not a touch
// unless it is exactly equal to the entry price.
function advanceEntryTouchState(item, currentPrice) {
  if (!item || item.entryPriceTriggered === true || !Number.isFinite(currentPrice)) return false;

  const entryPrice = Number(item.entryPrice);
  if (!Number.isFinite(entryPrice) || entryPrice <= 0) return false;

  const previousPrice = Number(item.entryPriceLastObserved);
  if (!Number.isFinite(previousPrice) || previousPrice <= 0) {
    item.entryPriceLastObserved = currentPrice;
    if (currentPrice === entryPrice) item.entryPriceTriggered = true;
    return true;
  }

  const crossedEntry = currentPrice === entryPrice
    || (previousPrice < entryPrice && currentPrice > entryPrice)
    || (previousPrice > entryPrice && currentPrice < entryPrice);

  item.entryPriceLastObserved = currentPrice;
  if (crossedEntry) item.entryPriceTriggered = true;
  return true;
}

module.exports = advanceEntryTouchState;
