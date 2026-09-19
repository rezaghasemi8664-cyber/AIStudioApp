-- Payment transaction ledger for subscription purchases.
-- This migration is intentionally idempotent for the production SQL Server database.
-- SubscriptionPlan and Subscription are created by the following migration,
-- so their foreign keys are added there after those tables exist.

IF OBJECT_ID(N'dbo.PaymentTransaction', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[PaymentTransaction] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [userId] INT NOT NULL,
        [planId] INT NULL,
        [subscriptionId] INT NULL,
        [amount] DECIMAL(18,2) NOT NULL,
        [currency] NVARCHAR(10) NOT NULL CONSTRAINT [DF_PaymentTransaction_currency] DEFAULT N'IRR',
        [provider] NVARCHAR(30) NOT NULL CONSTRAINT [DF_PaymentTransaction_provider] DEFAULT N'zarinpal',
        [authority] NVARCHAR(100) NULL,
        [refId] NVARCHAR(100) NULL,
        [status] NVARCHAR(30) NOT NULL CONSTRAINT [DF_PaymentTransaction_status] DEFAULT N'PENDING',
        [description] NVARCHAR(500) NULL,
        [errorCode] NVARCHAR(100) NULL,
        [errorMessage] NVARCHAR(1000) NULL,
        [metadataJson] NVARCHAR(MAX) NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_PaymentTransaction_createdAt] DEFAULT SYSDATETIME(),
        [paidAt] DATETIME2 NULL,
        [updatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_PaymentTransaction_updatedAt] DEFAULT SYSDATETIME(),
        CONSTRAINT [PK_PaymentTransaction] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [FK_PaymentTransaction_User] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE CASCADE
    );
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_PaymentTransaction_User_CreatedAt'
      AND object_id = OBJECT_ID(N'dbo.PaymentTransaction')
)
BEGIN
    CREATE INDEX [IX_PaymentTransaction_User_CreatedAt]
        ON [dbo].[PaymentTransaction]([userId], [createdAt]);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_PaymentTransaction_Status_CreatedAt'
      AND object_id = OBJECT_ID(N'dbo.PaymentTransaction')
)
BEGIN
    CREATE INDEX [IX_PaymentTransaction_Status_CreatedAt]
        ON [dbo].[PaymentTransaction]([status], [createdAt]);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_PaymentTransaction_PlanId'
      AND object_id = OBJECT_ID(N'dbo.PaymentTransaction')
)
BEGIN
    CREATE INDEX [IX_PaymentTransaction_PlanId]
        ON [dbo].[PaymentTransaction]([planId]);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_PaymentTransaction_Provider_Authority'
      AND object_id = OBJECT_ID(N'dbo.PaymentTransaction')
)
BEGIN
    CREATE INDEX [IX_PaymentTransaction_Provider_Authority]
        ON [dbo].[PaymentTransaction]([provider], [authority]);
END;

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UX_PaymentTransaction_Authority'
      AND object_id = OBJECT_ID(N'dbo.PaymentTransaction')
)
BEGIN
    CREATE UNIQUE INDEX [UX_PaymentTransaction_Authority]
        ON [dbo].[PaymentTransaction]([authority])
        WHERE [authority] IS NOT NULL;
END;
