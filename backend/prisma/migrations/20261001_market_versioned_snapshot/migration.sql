-- Versioned market snapshot with staged validation and atomic activation.
-- Supports a variable number of symbols; there is no hard-coded 1348 limit.

IF OBJECT_ID(N'[dbo].[MarketSnapshot]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[MarketSnapshot] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [status] NVARCHAR(20) NOT NULL,
        [symbolCount] INT NOT NULL,
        [symbolsJson] NVARCHAR(MAX) NOT NULL,
        [derivedJson] NVARCHAR(MAX) NULL,
        [source] NVARCHAR(50) NOT NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_MarketSnapshot_createdAt] DEFAULT SYSDATETIME(),
        [verifiedAt] DATETIME2 NULL,
        [activatedAt] DATETIME2 NULL,
        CONSTRAINT [PK_MarketSnapshot] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [CK_MarketSnapshot_status] CHECK ([status] IN ('PREPARED','VERIFIED','ACTIVE'))
    );

    CREATE INDEX [IX_MarketSnapshot_status_createdAt]
        ON [dbo].[MarketSnapshot]([status], [createdAt]);

    CREATE INDEX [IX_MarketSnapshot_activatedAt]
        ON [dbo].[MarketSnapshot]([activatedAt]);
END;
