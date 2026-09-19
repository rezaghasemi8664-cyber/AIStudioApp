-- Keep ScalpingRun aligned with the scalping service.
-- The IF guards make this safe if the columns already exist in SQL Server.
IF COL_LENGTH(N'dbo.ScalpingRun', N'meta') IS NULL
BEGIN
    ALTER TABLE [dbo].[ScalpingRun] ADD [meta] NVARCHAR(MAX) NULL;
END;

IF COL_LENGTH(N'dbo.ScalpingRun', N'finishedAt') IS NULL
BEGIN
    ALTER TABLE [dbo].[ScalpingRun] ADD [finishedAt] DATETIME2 NULL;
END;
