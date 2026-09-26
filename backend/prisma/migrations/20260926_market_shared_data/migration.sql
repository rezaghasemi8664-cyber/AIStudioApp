-- Shared market-data storage for the central market worker.
-- SQL Server safe migration. No GO batch separators.

IF OBJECT_ID(N'[dbo].[MarketCurrent]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[MarketCurrent] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [marketDate] DATE NOT NULL,
        [marketStatus] NVARCHAR(30) NOT NULL,
        [overallIndex] DECIMAL(20,4) NULL,
        [overallChange] DECIMAL(20,4) NULL,
        [equalIndex] DECIMAL(20,4) NULL,
        [equalChange] DECIMAL(20,4) NULL,
        [totalTrades] BIGINT NULL,
        [totalVolume] BIGINT NULL,
        [totalValue] DECIMAL(24,2) NULL,
        [positiveStocks] INT NULL,
        [negativeStocks] INT NULL,
        [neutralStocks] INT NULL,
        [updatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_MarketCurrent_updatedAt] DEFAULT SYSDATETIME(),
        [source] NVARCHAR(50) NULL,
        [isStale] BIT NOT NULL CONSTRAINT [DF_MarketCurrent_isStale] DEFAULT 0,
        [dataJson] NVARCHAR(MAX) NULL,
        CONSTRAINT [PK_MarketCurrent] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [UQ_MarketCurrent_marketDate] UNIQUE ([marketDate])
    );

    CREATE INDEX [IX_MarketCurrent_updatedAt] ON [dbo].[MarketCurrent]([updatedAt]);
END;

IF OBJECT_ID(N'[dbo].[MarketSymbolCurrent]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[MarketSymbolCurrent] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [symbol] NVARCHAR(100) NOT NULL,
        [name] NVARCHAR(200) NULL,
        [insCode] NVARCHAR(100) NULL,
        [lastPrice] DECIMAL(18,2) NULL,
        [closePrice] DECIMAL(18,2) NULL,
        [change] DECIMAL(18,4) NULL,
        [changePercent] DECIMAL(10,4) NULL,
        [volume] BIGINT NULL,
        [value] DECIMAL(24,2) NULL,
        [tradeCount] BIGINT NULL,
        [sector] NVARCHAR(200) NULL,
        [realBuyVolume] BIGINT NULL,
        [realSellVolume] BIGINT NULL,
        [legalBuyVolume] BIGINT NULL,
        [legalSellVolume] BIGINT NULL,
        [updatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_MarketSymbolCurrent_updatedAt] DEFAULT SYSDATETIME(),
        [source] NVARCHAR(50) NULL,
        [isStale] BIT NOT NULL CONSTRAINT [DF_MarketSymbolCurrent_isStale] DEFAULT 0,
        [dataJson] NVARCHAR(MAX) NULL,
        CONSTRAINT [PK_MarketSymbolCurrent] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [UQ_MarketSymbolCurrent_symbol] UNIQUE ([symbol])
    );

    CREATE INDEX [IX_MarketSymbolCurrent_insCode] ON [dbo].[MarketSymbolCurrent]([insCode]);
    CREATE INDEX [IX_MarketSymbolCurrent_sector] ON [dbo].[MarketSymbolCurrent]([sector]);
    CREATE INDEX [IX_MarketSymbolCurrent_updatedAt] ON [dbo].[MarketSymbolCurrent]([updatedAt]);
END;

IF OBJECT_ID(N'[dbo].[MarketMoverCurrent]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[MarketMoverCurrent] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [category] NVARCHAR(30) NOT NULL,
        [symbol] NVARCHAR(100) NOT NULL,
        [price] DECIMAL(18,2) NULL,
        [changePercent] DECIMAL(10,4) NULL,
        [volume] BIGINT NULL,
        [value] DECIMAL(24,2) NULL,
        [rank] INT NOT NULL,
        [updatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_MarketMoverCurrent_updatedAt] DEFAULT SYSDATETIME(),
        CONSTRAINT [PK_MarketMoverCurrent] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [UQ_MarketMoverCurrent_category_symbol] UNIQUE ([category], [symbol])
    );

    CREATE INDEX [IX_MarketMoverCurrent_category] ON [dbo].[MarketMoverCurrent]([category]);
    CREATE INDEX [IX_MarketMoverCurrent_updatedAt] ON [dbo].[MarketMoverCurrent]([updatedAt]);
END;

IF OBJECT_ID(N'[dbo].[MarketIndustryCurrent]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[MarketIndustryCurrent] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [industryCode] NVARCHAR(100) NULL,
        [industryName] NVARCHAR(200) NOT NULL,
        [symbolCount] INT NOT NULL,
        [changePercent] DECIMAL(10,4) NULL,
        [value] DECIMAL(24,2) NULL,
        [rank] INT NOT NULL,
        [updatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_MarketIndustryCurrent_updatedAt] DEFAULT SYSDATETIME(),
        [source] NVARCHAR(50) NULL,
        [isStale] BIT NOT NULL CONSTRAINT [DF_MarketIndustryCurrent_isStale] DEFAULT 0,
        CONSTRAINT [PK_MarketIndustryCurrent] PRIMARY KEY CLUSTERED ([id])
    );

    CREATE INDEX [IX_MarketIndustryCurrent_industryCode] ON [dbo].[MarketIndustryCurrent]([industryCode]);
    CREATE INDEX [IX_MarketIndustryCurrent_industryName] ON [dbo].[MarketIndustryCurrent]([industryName]);
    CREATE INDEX [IX_MarketIndustryCurrent_updatedAt] ON [dbo].[MarketIndustryCurrent]([updatedAt]);
END;

IF OBJECT_ID(N'[dbo].[MarketScalpingOpportunity]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[MarketScalpingOpportunity] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [symbol] NVARCHAR(100) NOT NULL,
        [score] DECIMAL(10,4) NULL,
        [signal] NVARCHAR(50) NULL,
        [entryPrice] DECIMAL(18,2) NULL,
        [stopLoss] DECIMAL(18,2) NULL,
        [takeProfit] DECIMAL(18,2) NULL,
        [currentPrice] DECIMAL(18,2) NULL,
        [confidence] DECIMAL(10,4) NULL,
        [strategyName] NVARCHAR(100) NOT NULL,
        [recommendationText] NVARCHAR(1000) NULL,
        [marketDate] DATE NOT NULL,
        [status] NVARCHAR(30) NOT NULL,
        [meta] NVARCHAR(MAX) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_MarketScalpingOpportunity_createdAt] DEFAULT SYSDATETIME(),
        [updatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_MarketScalpingOpportunity_updatedAt] DEFAULT SYSDATETIME(),
        [expiresAt] DATETIME2 NULL,
        [source] NVARCHAR(50) NULL,
        CONSTRAINT [PK_MarketScalpingOpportunity] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [UQ_MarketScalpingOpportunity_symbol_date_strategy] UNIQUE ([symbol], [marketDate], [strategyName])
    );

    CREATE INDEX [IX_MarketScalpingOpportunity_symbol] ON [dbo].[MarketScalpingOpportunity]([symbol]);
    CREATE INDEX [IX_MarketScalpingOpportunity_status] ON [dbo].[MarketScalpingOpportunity]([status]);
    CREATE INDEX [IX_MarketScalpingOpportunity_score] ON [dbo].[MarketScalpingOpportunity]([score]);
    CREATE INDEX [IX_MarketScalpingOpportunity_marketDate] ON [dbo].[MarketScalpingOpportunity]([marketDate]);
    CREATE INDEX [IX_MarketScalpingOpportunity_updatedAt] ON [dbo].[MarketScalpingOpportunity]([updatedAt]);
END;
