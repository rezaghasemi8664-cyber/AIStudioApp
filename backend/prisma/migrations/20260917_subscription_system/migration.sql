-- Roniya Analyzer subscription system
-- SQL Server safe migration: preserve legacy User subscription fields.

IF OBJECT_ID(N'[dbo].[SubscriptionPlan]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[SubscriptionPlan] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [name] NVARCHAR(150) NOT NULL,
        [code] NVARCHAR(100) NOT NULL,
        [durationMonths] INT NOT NULL,
        [price] DECIMAL(18,2) NOT NULL,
        [currency] NVARCHAR(10) NOT NULL CONSTRAINT [DF_SubscriptionPlan_currency] DEFAULT N'IRR',
        [isActive] BIT NOT NULL CONSTRAINT [DF_SubscriptionPlan_isActive] DEFAULT 1,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_SubscriptionPlan_createdAt] DEFAULT SYSDATETIME(),
        [updatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_SubscriptionPlan_updatedAt] DEFAULT SYSDATETIME(),
        CONSTRAINT [PK_SubscriptionPlan] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [UQ_SubscriptionPlan_code] UNIQUE ([code]),
        CONSTRAINT [CK_SubscriptionPlan_durationMonths] CHECK ([durationMonths] > 0),
        CONSTRAINT [CK_SubscriptionPlan_price] CHECK ([price] >= 0)
    );
END;
GO

IF OBJECT_ID(N'[dbo].[Subscription]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[Subscription] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [userId] INT NOT NULL,
        [planId] INT NULL,
        [type] NVARCHAR(30) NOT NULL,
        [status] NVARCHAR(30) NOT NULL,
        [startsAt] DATETIME2 NOT NULL,
        [expiresAt] DATETIME2 NOT NULL,
        [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_Subscription_createdAt] DEFAULT SYSDATETIME(),
        [updatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_Subscription_updatedAt] DEFAULT SYSDATETIME(),
        CONSTRAINT [PK_Subscription] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [FK_Subscription_User] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]),
        CONSTRAINT [FK_Subscription_SubscriptionPlan] FOREIGN KEY ([planId]) REFERENCES [dbo].[SubscriptionPlan]([id]),
        CONSTRAINT [CK_Subscription_type] CHECK ([type] IN (N'FREE_TRIAL', N'PAID')),
        CONSTRAINT [CK_Subscription_status] CHECK ([status] IN (N'ACTIVE', N'EXPIRED', N'CANCELLED')),
        CONSTRAINT [CK_Subscription_dates] CHECK ([expiresAt] > [startsAt])
    );
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_Subscription_userId_expiresAt'
      AND object_id = OBJECT_ID(N'[dbo].[Subscription]')
)
BEGIN
    CREATE INDEX [IX_Subscription_userId_expiresAt]
        ON [dbo].[Subscription] ([userId], [expiresAt]);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_Subscription_status_expiresAt'
      AND object_id = OBJECT_ID(N'[dbo].[Subscription]')
)
BEGIN
    CREATE INDEX [IX_Subscription_status_expiresAt]
        ON [dbo].[Subscription] ([status], [expiresAt]);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_Subscription_planId'
      AND object_id = OBJECT_ID(N'[dbo].[Subscription]')
)
BEGIN
    CREATE INDEX [IX_Subscription_planId]
        ON [dbo].[Subscription] ([planId]);
END;
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'IX_Subscription_userId_createdAt'
      AND object_id = OBJECT_ID(N'[dbo].[Subscription]')
)
BEGIN
    CREATE INDEX [IX_Subscription_userId_createdAt]
        ON [dbo].[Subscription] ([userId], [createdAt]);
END;
GO
