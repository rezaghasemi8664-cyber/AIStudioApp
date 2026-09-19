-- Persian calendar payment reporting aggregates.
-- Daily rows are retained only for the current Jalali month.
-- Monthly rows are retained only for the current Jalali year.
-- Yearly rows are permanent and are never deleted by retention cleanup.

IF OBJECT_ID(N'dbo.PaymentDailySummary', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[PaymentDailySummary] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [jalaliYear] INT NOT NULL,
        [jalaliMonth] INT NOT NULL,
        [jalaliDay] INT NOT NULL,
        [paymentCount] BIGINT NOT NULL CONSTRAINT [DF_PaymentDailySummary_paymentCount] DEFAULT 0,
        [totalAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [DF_PaymentDailySummary_totalAmount] DEFAULT 0,
        [updatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_PaymentDailySummary_updatedAt] DEFAULT SYSDATETIME(),
        CONSTRAINT [PK_PaymentDailySummary] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [UX_PaymentDailySummary_JalaliDate] UNIQUE ([jalaliYear], [jalaliMonth], [jalaliDay])
    );
END;

IF OBJECT_ID(N'dbo.PaymentMonthlySummary', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[PaymentMonthlySummary] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [jalaliYear] INT NOT NULL,
        [jalaliMonth] INT NOT NULL,
        [paymentCount] BIGINT NOT NULL CONSTRAINT [DF_PaymentMonthlySummary_paymentCount] DEFAULT 0,
        [totalAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [DF_PaymentMonthlySummary_totalAmount] DEFAULT 0,
        [updatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_PaymentMonthlySummary_updatedAt] DEFAULT SYSDATETIME(),
        CONSTRAINT [PK_PaymentMonthlySummary] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [UX_PaymentMonthlySummary_JalaliMonth] UNIQUE ([jalaliYear], [jalaliMonth])
    );
END;

IF OBJECT_ID(N'dbo.PaymentYearlySummary', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[PaymentYearlySummary] (
        [id] INT IDENTITY(1,1) NOT NULL,
        [jalaliYear] INT NOT NULL,
        [paymentCount] BIGINT NOT NULL CONSTRAINT [DF_PaymentYearlySummary_paymentCount] DEFAULT 0,
        [totalAmount] DECIMAL(18,2) NOT NULL CONSTRAINT [DF_PaymentYearlySummary_totalAmount] DEFAULT 0,
        [updatedAt] DATETIME2 NOT NULL CONSTRAINT [DF_PaymentYearlySummary_updatedAt] DEFAULT SYSDATETIME(),
        CONSTRAINT [PK_PaymentYearlySummary] PRIMARY KEY CLUSTERED ([id]),
        CONSTRAINT [UX_PaymentYearlySummary_JalaliYear] UNIQUE ([jalaliYear])
    );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_PaymentDailySummary_YearMonth' AND object_id=OBJECT_ID(N'dbo.PaymentDailySummary'))
    CREATE INDEX [IX_PaymentDailySummary_YearMonth] ON [dbo].[PaymentDailySummary]([jalaliYear], [jalaliMonth]);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name=N'IX_PaymentMonthlySummary_Year' AND object_id=OBJECT_ID(N'dbo.PaymentMonthlySummary'))
    CREATE INDEX [IX_PaymentMonthlySummary_Year] ON [dbo].[PaymentMonthlySummary]([jalaliYear]);
