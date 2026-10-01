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
