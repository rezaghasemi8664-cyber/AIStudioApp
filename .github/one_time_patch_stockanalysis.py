from pathlib import Path
import re

p = Path('src/components/StockAnalysis.tsx')
s = p.read_text(encoding='utf-8-sig')

pattern = re.compile(
    r"  useEffect\(\(\) => \{\n"
    r"    if \(activeTab !== 'marketSummary'\) return;\n\n"
    r"    let isMounted = true;\n\n"
    r"    const loadMarketSummary = async \(\) => \{.*?"
    r"    return \(\) => \{\n"
    r"      isMounted = false;\n"
    r"    \};\n"
    r"  \}, \[activeTab\]\);",
    re.S,
)

replacement = '''  useEffect(() => {
    if (activeTab !== 'marketSummary') return;

    let isMounted = true;

    const loadMarketSummary = async () => {
      setIsLoadingMarketSummaryHistory(true);

      try {
        const [latest, history] = await Promise.all([
          fetchMarketSummary(),
          fetchMarketSummaryHistory(),
        ]);

        if (!isMounted) return;

        setMarketSummaryHistory(history);

        // The main tab always shows the live/latest summary. Historical
        // snapshots are shown only after the user explicitly selects one.
        if (latest?.content?.trim()) {
          setMarketSummary(latest);
          setSelectedMarketSummaryId(null);
        } else if (selectedMarketSummaryId !== null) {
          const selected = history.find((item) => item.id === selectedMarketSummaryId);
          if (selected) {
            setMarketSummary(selected);
          } else {
            setSelectedMarketSummaryId(null);
            setMarketSummary(null);
          }
        } else {
          setMarketSummary(null);
        }

        setHasUnreadMarketSummary(false);
      } catch (error) {
        console.error('[MarketSummary] failed to load latest/history:', error);
      } finally {
        if (isMounted) setIsLoadingMarketSummaryHistory(false);
      }
    };

    void loadMarketSummary();

    const interval = window.setInterval(() => {
      void loadMarketSummary();
    }, 30000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [activeTab]);'''

s, count = pattern.subn(replacement, s, count=1)
if count != 1:
    raise SystemExit('Target market summary effect not found exactly once')

p.write_text(s, encoding='utf-8')
print('StockAnalysis.tsx patched successfully')
