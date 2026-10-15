-- Durable intraday points for the market-index history chart.
IF OBJECT_ID(N'[dbo].[MarketIndexIntradaySnapshot]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[MarketIndexIntradaySnapshot] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [marketDate] DATE NOT NULL,
        [capturedAt] DATETIME2 NOT NULL CONSTRAINT [DF_MarketIndexIntradaySnapshot_capturedAt] DEFAULT SYSUTCDATETIME(),
        [overallIndex] DECIMAL(20,4) NULL,
        [equalIndex] DECIMAL(20,4) NULL,
        [totalTrades] BIGINT NULL,
        [totalVolume] BIGINT NULL,
        [totalValue] DECIMAL(24,2) NULL,
        [source] NVARCHAR(50) NULL,
        CONSTRAINT [PK_MarketIndexIntradaySnapshot] PRIMARY KEY CLUSTERED ([id])
    );

    CREATE INDEX [IX_MarketIndexIntradaySnapshot_marketDate_capturedAt]
        ON [dbo].[MarketIndexIntradaySnapshot] ([marketDate], [capturedAt]);
END;
