CREATE TABLE [dbo].[TelegramReferralMember] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [channelId] NVARCHAR(100) NOT NULL,
  [telegramUserId] NVARCHAR(32) NOT NULL,
  [inviterId] INT NOT NULL,
  [inviteLinkId] INT NOT NULL,
  [joinedAt] DATETIME2 NOT NULL,
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_TelegramReferralMember_createdAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [PK_TelegramReferralMember] PRIMARY KEY CLUSTERED ([id]),
  CONSTRAINT [FK_TelegramReferralMember_User] FOREIGN KEY ([inviterId]) REFERENCES [dbo].[User]([id]) ON DELETE CASCADE,
  CONSTRAINT [FK_TelegramReferralMember_InviteLink] FOREIGN KEY ([inviteLinkId]) REFERENCES [dbo].[TelegramReferralLink]([id]) ON DELETE NO ACTION
);
CREATE UNIQUE INDEX [UQ_TelegramReferralMember_Channel_TelegramUser] ON [dbo].[TelegramReferralMember]([channelId], [telegramUserId]);
CREATE INDEX [IX_TelegramReferralMember_Inviter_JoinedAt] ON [dbo].[TelegramReferralMember]([inviterId], [joinedAt]);
CREATE INDEX [IX_TelegramReferralMember_InviteLink] ON [dbo].[TelegramReferralMember]([inviteLinkId]);

CREATE TABLE [dbo].[TelegramReferralReward] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [inviterId] INT NOT NULL,
  [milestone] INT NOT NULL,
  [memberCount] INT NOT NULL,
  [days] INT NOT NULL CONSTRAINT [DF_TelegramReferralReward_days] DEFAULT 5,
  [completedAt] DATETIME2 NOT NULL,
  [grantedAt] DATETIME2 NOT NULL CONSTRAINT [DF_TelegramReferralReward_grantedAt] DEFAULT SYSUTCDATETIME(),
  [startsAt] DATETIME2 NOT NULL,
  [expiresAt] DATETIME2 NOT NULL,
  [subscriptionId] INT NULL,
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_TelegramReferralReward_createdAt] DEFAULT SYSUTCDATETIME(),
  CONSTRAINT [PK_TelegramReferralReward] PRIMARY KEY CLUSTERED ([id])
);
CREATE UNIQUE INDEX [UQ_TelegramReferralReward_Inviter_Milestone] ON [dbo].[TelegramReferralReward]([inviterId], [milestone]);
CREATE INDEX [IX_TelegramReferralReward_Inviter_CompletedAt] ON [dbo].[TelegramReferralReward]([inviterId], [completedAt]);

CREATE TABLE [dbo].[TelegramWebhookUpdate] (
  [updateId] BIGINT NOT NULL,
  [status] NVARCHAR(20) NOT NULL CONSTRAINT [DF_TelegramWebhookUpdate_status] DEFAULT N'RECEIVED',
  [receivedAt] DATETIME2 NOT NULL CONSTRAINT [DF_TelegramWebhookUpdate_receivedAt] DEFAULT SYSUTCDATETIME(),
  [processedAt] DATETIME2 NULL,
  [errorCode] NVARCHAR(100) NULL,
  CONSTRAINT [PK_TelegramWebhookUpdate] PRIMARY KEY CLUSTERED ([updateId])
);
CREATE INDEX [IX_TelegramWebhookUpdate_Status_ReceivedAt] ON [dbo].[TelegramWebhookUpdate]([status], [receivedAt]);
