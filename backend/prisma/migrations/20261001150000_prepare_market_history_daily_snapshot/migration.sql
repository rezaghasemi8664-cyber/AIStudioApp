-- Prepare MarketHistory for one successful snapshot per trading day.
-- Columns stay nullable until existing rows are backfilled and duplicates are removed.

IF COL_LENGTH(N'dbo.MarketHistory', N'marketDate') IS NULL
BEGIN
    ALTER TABLE [dbo].[MarketHistory]
    ADD [marketDate] DATE NULL;
END;

IF COL_LENGTH(N'dbo.MarketHistory', N'updatedAt') IS NULL
BEGIN
    ALTER TABLE [dbo].[MarketHistory]
    ADD [updatedAt] DATETIME2 NULL;
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'IX_MarketHistory_marketDate'
      AND object_id = OBJECT_ID(N'[dbo].[MarketHistory]')
)
BEGIN
    CREATE INDEX [IX_MarketHistory_marketDate]
        ON [dbo].[MarketHistory]([marketDate]);
END;

IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = N'UX_MarketHistory_marketDate_not_null'
      AND object_id = OBJECT_ID(N'[dbo].[MarketHistory]')
)
BEGIN
    CREATE UNIQUE INDEX [UX_MarketHistory_marketDate_not_null]
        ON [dbo].[MarketHistory]([marketDate])
        WHERE [marketDate] IS NOT NULL;
END;
