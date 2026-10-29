-- Adds a date-leading covering index for historical MarketDaily aggregates.
-- Apply only after review and production deployment approval.
-- Does not modify or delete existing indexes.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE object_id = OBJECT_ID(N'[dbo].[MarketDaily]')
      AND name = N'IX_MarketDaily_date_cover'
)
BEGIN
    CREATE NONCLUSTERED INDEX [IX_MarketDaily_date_cover]
        ON [dbo].[MarketDaily] ([date])
        INCLUDE ([symbol], [volume], [value]);
END;
