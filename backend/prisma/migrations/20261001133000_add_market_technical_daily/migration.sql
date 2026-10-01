IF OBJECT_ID(N'[dbo].[MarketTechnicalDaily]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[MarketTechnicalDaily] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [marketDate] DATE NOT NULL,
        [overallIndex] DECIMAL(20,4) NULL,
        [overallChange] DECIMAL(20,4) NULL,
        [equalIndex] DECIMAL(20,4) NULL,
        [equalChange] DECIMAL(20,4) NULL,
        [source] NVARCHAR(50) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_MarketTechnicalDaily_createdAt] DEFAULT sysdatetime(),
        CONSTRAINT [PK_MarketTechnicalDaily] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [UQ_MarketTechnicalDaily_marketDate] UNIQUE ([marketDate])
    );

    CREATE INDEX [IX_MarketTechnicalDaily_marketDate]
        ON [dbo].[MarketTechnicalDaily]([marketDate]);
END;
