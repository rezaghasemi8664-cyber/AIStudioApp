CREATE TABLE [dbo].[TelegramReferralLink] (
    [id] INT IDENTITY(1,1) NOT NULL,
    [inviterId] INT NOT NULL,
    [channelId] NVARCHAR(100) NOT NULL,
    [inviteLink] NVARCHAR(512) NOT NULL,
    [inviteName] NVARCHAR(32) NULL,
    [isActive] BIT NOT NULL CONSTRAINT [DF_TelegramReferralLink_isActive] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_TelegramReferralLink_createdAt] DEFAULT SYSUTCDATETIME(),
    [revokedAt] DATETIME2 NULL,
    CONSTRAINT [PK_TelegramReferralLink] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_TelegramReferralLink_User] FOREIGN KEY ([inviterId])
        REFERENCES [dbo].[User]([id]) ON DELETE CASCADE
);

CREATE UNIQUE INDEX [UQ_TelegramReferralLink_inviteLink]
    ON [dbo].[TelegramReferralLink]([inviteLink]);

CREATE UNIQUE INDEX [UQ_TelegramReferralLink_Inviter_Channel]
    ON [dbo].[TelegramReferralLink]([inviterId], [channelId]);

CREATE INDEX [IX_TelegramReferralLink_Inviter_Channel_Active]
    ON [dbo].[TelegramReferralLink]([inviterId], [channelId], [isActive]);
