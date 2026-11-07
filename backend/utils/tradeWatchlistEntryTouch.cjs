'use strict';

// Track a genuine touch after the item has entered the watchlist.
// A quote above entry does not prove that entry was reached; first observe
// a quote below entry, then accept an exact touch or an upward crossing.
function advanceEntryTouchState(item, currentPrice) {
  if (!item || item.entryPriceTriggered === true || !Number.isFinite(currentPrice)) return false;
  // An initial quote on either side of entry is only a baseline, not a touch.
  // After the baseline, any subsequent quote at or below entry confirms the
  // first touch, including a decline from above entry.
  if (item.entryPriceArmed !== true) {
    item.entryPriceArmed = true;
    return false;
  }
  if (currentPrice <= Number(item.entryPrice)) {
    item.entryPriceTriggered = true;
    item.entryPriceArmed = false;
    return true;
  }
  return false;
}

module.exports = advanceEntryTouchState;
