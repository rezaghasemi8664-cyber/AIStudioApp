'use strict';

// Track a genuine touch after the item has entered the watchlist.
// A quote above entry does not prove that entry was reached; first observe
// a quote below entry, then accept an exact touch or an upward crossing.
function advanceEntryTouchState(item, currentPrice) {
  if (!item || item.entryPriceTriggered === true || !Number.isFinite(currentPrice)) return false;
  if (currentPrice === Number(item.entryPrice)) {
    item.entryPriceTriggered = true;
    item.entryPriceArmed = false;
    return true;
  }
  if (currentPrice < Number(item.entryPrice)) {
    if (item.entryPriceArmed !== true) {
      item.entryPriceArmed = true;
      return true;
    }
    return false;
  }
  if (currentPrice > Number(item.entryPrice) && item.entryPriceArmed === true) {
    item.entryPriceTriggered = true;
    item.entryPriceArmed = false;
    return true;
  }
  return false;
}

module.exports = advanceEntryTouchState;
