ALTER TABLE [dbo].[User] ADD [referralCode] NVARCHAR(20) NULL;
GO

UPDATE [dbo].[User]
SET [referralCode] = UPPER(LEFT(REPLACE(CONVERT(VARCHAR(36), NEWID()), '-', ''), 10))
WHERE [referralCode] IS NULL;
GO

ALTER TABLE [dbo].[User] ALTER COLUMN [referralCode] NVARCHAR(20) NOT NULL;
GO

CREATE UNIQUE INDEX [UQ_User_referralCode] ON [dbo].[User]([referralCode]);
GO

CREATE TABLE [dbo].[ReferralInvite] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [inviterId] INT NOT NULL,
    [inviteeMobile] NVARCHAR(20) NOT NULL,
    [referralCode] NVARCHAR(20) NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_ReferralInvite_status] DEFAULT 'SENT',
    [redeemedByUserId] INT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_ReferralInvite_createdAt] DEFAULT SYSUTCDATETIME(),
    [redeemedAt] DATETIME2 NULL,
    CONSTRAINT [PK_ReferralInvite] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_ReferralInvite_Inviter] FOREIGN KEY ([inviterId]) REFERENCES [dbo].[User]([id]) ON DELETE CASCADE,
    CONSTRAINT [FK_ReferralInvite_RedeemedBy] FOREIGN KEY ([redeemedByUserId]) REFERENCES [dbo].[User]([id])
);
GO

CREATE UNIQUE INDEX [UQ_ReferralInvite_Inviter_Mobile] ON [dbo].[ReferralInvite]([inviterId], [inviteeMobile]);
GO
CREATE UNIQUE INDEX [UQ_ReferralInvite_RedeemedByUser] ON [dbo].[ReferralInvite]([redeemedByUserId]) WHERE [redeemedByUserId] IS NOT NULL;
GO
CREATE INDEX [IX_ReferralInvite_Code_Mobile_Status] ON [dbo].[ReferralInvite]([referralCode], [inviteeMobile], [status]);
GO
