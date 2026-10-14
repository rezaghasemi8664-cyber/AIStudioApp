-- Keep only the latest fully validated option-market snapshot and its analysis.
-- The singleton row is replaced only after both fetching and analysis succeed.
IF OBJECT_ID(N'[dbo].[OptionMarketCurrent]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[OptionMarketCurrent] (
        [id] INT NOT NULL,
        [contractCount] INT NOT NULL,
        [contractsJson] NVARCHAR(MAX) NOT NULL,
        [analysisJson] NVARCHAR(MAX) NOT NULL,
        [source] NVARCHAR(50) NOT NULL,
        [fetchedAt] DATETIME2 NOT NULL,
        [analyzedAt] DATETIME2 NOT NULL,
        [updatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_OptionMarketCurrent_updatedAt] DEFAULT SYSDATETIME(),
        CONSTRAINT [PK_OptionMarketCurrent] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [CK_OptionMarketCurrent_singleton] CHECK ([id] = 1),
        CONSTRAINT [CK_OptionMarketCurrent_contractCount] CHECK ([contractCount] >= 0)
    );
END;
