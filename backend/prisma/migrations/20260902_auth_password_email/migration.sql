ALTER TABLE [dbo].[User] ADD [passwordEncrypted] NVARCHAR(MAX) NULL;
ALTER TABLE [dbo].[User] ADD [passwordChangedAt] DATETIME2 NULL;
