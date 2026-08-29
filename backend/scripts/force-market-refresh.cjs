/**
 * FORCE MARKET REFRESH & CLEANUP SCRIPT
 * This script forces a new fetch from BRS, cleans old synthetic data, 
 * and regenerates the market summary for today.
 */
const { PrismaClient } = require('@prisma/client');
const marketHistoryService = require('../services/marketHistory.service.cjs');
const marketSummaryService = require('../services/marketSummary.service.cjs');
const brsService = require('../services/brs.service.cjs');

const prisma = new PrismaClient();

async function run() {
    console.log('🚀 Starting Force Market Refresh...');

    try {
        // 1. Clean Synthetic Data from History
        console.log('🧹 Step 1: Cleaning synthetic/fake records...');
        const deleteRes = await prisma.marketHistory.deleteMany({
            where: {
                OR: [
                    { overallIndex: 2150000 },
                    { equalIndex: 720000 },
                    { reason: 'SYNTHETIC_MARKET_DATA_REJECTED' }
                ]
            }
        });
        console.log(`✅ Removed ${deleteRes.count} invalid records.`);

        // 2. Trigger Fresh Ingest
        console.log('📥 Step 2: Fetching live data from BRS (Index & Symbols)...');
        // ما هم شاخص و هم نمادها را درخواست می‌کنیم
        const ingestResult = await marketHistoryService.ingestMarketData();
        
        if (!ingestResult || ingestResult.length === 0) {
            console.error('❌ Failed to fetch data. Market might be closed or API down.');
        } else {
            console.log(`✅ Ingested ${ingestResult.length} new records into MarketHistory.`);
        }

        // 3. Force Summary Generation for Today
        console.log('📊 Step 3: Regenerating Market Summary...');
        const summary = await marketSummaryService.generateMarketSummary();
        
        if (summary) {
            console.log('✨ Summary Generated Successfully:');
            console.log({
                id: summary.id,
                date: summary.summaryDate,
                overallIndex: summary.overallIndex,
                positiveStocks: summary.positiveStocks,
                negativeStocks: summary.negativeStocks,
                source: summary.sourceType
            });

            if (summary.positiveStocks === null) {
                console.warn('⚠️ Warning: Positive stocks is still NULL. BRS might not have returned symbols list.');
            }
        } else {
            console.error('❌ Summary generation failed.');
        }

    } catch (error) {
        console.error('💥 Critical Error during refresh:', error);
    } finally {
        await prisma.$disconnect();
        console.log('🏁 Process finished.');
    }
}

run();
