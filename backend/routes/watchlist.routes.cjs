async function readWatchlists(userId) {
  const row = await prisma.userPreference.findUnique({ where: { userId_key: { userId, key: PREF_KEY } } });
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value);
    const watchlists = Array.isArray(parsed) ? parsed.map(normalizeWatchlist).filter(Boolean) : [];
    if (!watchlists.length) return watchlists;

    // The shared market snapshot is the authoritative source for watchlist
    // quotes. Do not depend on a previously saved user-preference quote:
    // older watchlists may contain no quote or a partial quote.
    const sharedRows = await sharedMarketService.getSymbols({ limit: 10000 });
    const sharedBySymbol = new Map(sharedRows.map(item => [normalizeSymbol(item.symbol), item]));

    return watchlists.map(watchlist => ({
      ...watchlist,
      symbols: watchlist.symbols.map(item => {
        const market = sharedBySymbol.get(item.symbol);
        if (!market) return item;

        let yesterday = null;
        if (market.dataJson) {
          try {
            const raw = JSON.parse(market.dataJson);
            yesterday = Number(raw?.yesterday ?? raw?.previousPrice ?? raw?.yesterdayPrice);
            if (!Number.isFinite(yesterday)) yesterday = null;
          } catch (_) {}
        }

        const closePrice = Number.isFinite(Number(market.closePrice)) ? Number(market.closePrice) : null;
        const closeChangePercent = Number.isFinite(Number(market.closeChangePercent))
          ? Number(market.closeChangePercent)
          : closePrice != null && yesterday > 0
            ? ((closePrice - yesterday) / yesterday) * 100
            : null;

        return {
          ...item,
          name: market.name || item.name,
          quote: {
            volume: Number.isFinite(Number(market.volume)) ? Number(market.volume) : null,
            lastPrice: Number.isFinite(Number(market.lastPrice)) ? Number(market.lastPrice) : null,
            lastChangePercent: Number.isFinite(Number(market.lastChangePercent))
              ? Number(market.lastChangePercent)
              : Number.isFinite(Number(market.changePercent)) ? Number(market.changePercent) : null,
            closePrice,
            closeChangePercent,
            updatedAt: market.updatedAt ? new Date(market.updatedAt).toISOString() : new Date().toISOString(),
            dataStatus: market.isStale ? 'CACHED' : 'LIVE',
            source: market.source ? String(market.source) : 'shared-db',
            stale: Boolean(market.isStale),
          },
        };
      }),
    }));
  } catch (_) { return []; }
}