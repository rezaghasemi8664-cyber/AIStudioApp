BEGIN TRY

BEGIN TRAN;

-- AlterTable

-- DropTable
-- DropTable
-- DropTable
-- DropTable
-- DropTable
-- CreateTable
CREATE TABLE [dbo].[SmsOtp] (
    [id] INT NOT NULL IDENTITY(1,1),
    [userId] INT,
    [mobile] NVARCHAR(20) NOT NULL,
    [codeHash] NVARCHAR(255) NOT NULL,
    [purpose] NVARCHAR(50) NOT NULL,
    [expiresAt] DATETIME2 NOT NULL,
    [verifiedAt] DATETIME2,
    [attempts] INT NOT NULL CONSTRAINT [SmsOtp_attempts_df] DEFAULT 0,
    [maxAttempts] INT NOT NULL CONSTRAINT [SmsOtp_maxAttempts_df] DEFAULT 5,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [SmsOtp_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [SmsOtp_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[SmsQueue] (
    [id] INT NOT NULL IDENTITY(1,1),
    [userId] INT,
    [mobile] NVARCHAR(20) NOT NULL,
    [patternCode] NVARCHAR(50) NOT NULL,
    [variablesJson] NVARCHAR(max),
    [sender] NVARCHAR(30),
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [SmsQueue_status_df] DEFAULT 'pending',
    [attempts] INT NOT NULL CONSTRAINT [SmsQueue_attempts_df] DEFAULT 0,
    [maxAttempts] INT NOT NULL CONSTRAINT [SmsQueue_maxAttempts_df] DEFAULT 3,
    [scheduledAt] DATETIME2,
    [startedAt] DATETIME2,
    [sentAt] DATETIME2,
    [nextRetryAt] DATETIME2,
    [providerId] NVARCHAR(100),
    [lastError] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [SmsQueue_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [SmsQueue_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[SmsLog] (
    [id] INT NOT NULL IDENTITY(1,1),
    [queueId] INT,
    [userId] INT,
    [mobile] NVARCHAR(20) NOT NULL,
    [patternCode] NVARCHAR(50),
    [sender] NVARCHAR(30),
    [provider] NVARCHAR(30) NOT NULL CONSTRAINT [SmsLog_provider_df] DEFAULT 'farazsms',
    [providerId] NVARCHAR(100),
    [status] NVARCHAR(20) NOT NULL,
    [messageType] NVARCHAR(50),
    [errorCode] NVARCHAR(100),
    [errorMessage] NVARCHAR(1000),
    [metadataJson] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [SmsLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [SmsLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SmsOtp_mobile_purpose_createdAt_idx] ON [dbo].[SmsOtp]([mobile], [purpose], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SmsOtp_userId_idx] ON [dbo].[SmsOtp]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SmsOtp_expiresAt_idx] ON [dbo].[SmsOtp]([expiresAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SmsQueue_status_nextRetryAt_idx] ON [dbo].[SmsQueue]([status], [nextRetryAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SmsQueue_scheduledAt_idx] ON [dbo].[SmsQueue]([scheduledAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SmsQueue_userId_idx] ON [dbo].[SmsQueue]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SmsQueue_mobile_idx] ON [dbo].[SmsQueue]([mobile]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SmsLog_userId_createdAt_idx] ON [dbo].[SmsLog]([userId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SmsLog_mobile_createdAt_idx] ON [dbo].[SmsLog]([mobile], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SmsLog_status_createdAt_idx] ON [dbo].[SmsLog]([status], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SmsLog_providerId_idx] ON [dbo].[SmsLog]([providerId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [SmsLog_queueId_idx] ON [dbo].[SmsLog]([queueId]);

-- AddForeignKey
ALTER TABLE [dbo].[SmsOtp] ADD CONSTRAINT [SmsOtp_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[SmsQueue] ADD CONSTRAINT [SmsQueue_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[SmsLog] ADD CONSTRAINT [SmsLog_queueId_fkey] FOREIGN KEY ([queueId]) REFERENCES [dbo].[SmsQueue]([id]) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[SmsLog] ADD CONSTRAINT [SmsLog_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
