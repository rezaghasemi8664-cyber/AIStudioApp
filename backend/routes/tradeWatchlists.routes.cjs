'use strict';

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth.middleware.cjs');
const watchlistService = require('../services/tradeWatchlist.service.cjs');

function handleError(res, error) {
  const status = Number(error?.statusCode) || 500;
  if (status >= 500) console.error('[TRADE-WATCHLIST] Request failed:', error);
  return res.status(status).json({ success: false, message: error?.message || 'خطا در پردازش سبد.' });
}
router.get('/:listType', authMiddleware, async (req, res) => {
  try {
    const userId = watchlistService.getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    return res.json({ success: true, data: await watchlistService.getWatchlist(userId, req.params.listType) });
  } catch (error) { return handleError(res, error); }
});
router.post('/:listType', authMiddleware, async (req, res) => {
  try {
    const userId = watchlistService.getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    const item = await watchlistService.addWatchlistItem(userId, req.params.listType, req.body || {});
    return res.status(201).json({ success: true, data: item });
  } catch (error) { return handleError(res, error); }
});
router.delete('/:listType/:id', authMiddleware, async (req, res) => {
  try {
    const userId = watchlistService.getUserId(req);
    if (!userId) return res.status(401).json({ success: false, message: 'کاربر احراز هویت نشده است.' });
    await watchlistService.deleteWatchlistItem(userId, req.params.listType, req.params.id);
    return res.json({ success: true, data: { id: req.params.id } });
  } catch (error) { return handleError(res, error); }
});
module.exports = router;
