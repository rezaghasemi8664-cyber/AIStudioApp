CREATE TABLE [dbo].[PasskeyCredential] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [userId] INT NOT NULL,
  [credentialId] NVARCHAR(2000) NOT NULL,
  [credentialIdHash] NVARCHAR(64) NOT NULL,
  [publicKey] VARBINARY(MAX) NOT NULL,
  [counter] BIGINT NOT NULL CONSTRAINT [DF_PasskeyCredential_counter] DEFAULT 0,
  [transportsJson] NVARCHAR(MAX) NULL,
  [deviceName] NVARCHAR(120) NOT NULL,
  [deviceType] NVARCHAR(30) NULL,
  [backedUp] BIT NOT NULL CONSTRAINT [DF_PasskeyCredential_backedUp] DEFAULT 0,
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_PasskeyCredential_createdAt] DEFAULT SYSDATETIME(),
  [lastUsedAt] DATETIME2 NULL,
  CONSTRAINT [PK_PasskeyCredential] PRIMARY KEY CLUSTERED ([id]),
  CONSTRAINT [FK_PasskeyCredential_User] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE CASCADE
);

CREATE UNIQUE INDEX [UQ_PasskeyCredential_credentialIdHash]
  ON [dbo].[PasskeyCredential]([credentialIdHash]);
CREATE INDEX [IX_PasskeyCredential_userId_createdAt]
  ON [dbo].[PasskeyCredential]([userId], [createdAt]);

CREATE TABLE [dbo].[PasskeyChallenge] (
  [id] INT IDENTITY(1,1) NOT NULL,
  [userId] INT NULL,
  [challenge] NVARCHAR(128) NOT NULL,
  [purpose] NVARCHAR(30) NOT NULL,
  [expiresAt] DATETIME2 NOT NULL,
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [DF_PasskeyChallenge_createdAt] DEFAULT SYSDATETIME(),
  CONSTRAINT [PK_PasskeyChallenge] PRIMARY KEY CLUSTERED ([id]),
  CONSTRAINT [FK_PasskeyChallenge_User] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE CASCADE
);

CREATE UNIQUE INDEX [UQ_PasskeyChallenge_challenge] ON [dbo].[PasskeyChallenge]([challenge]);
CREATE INDEX [IX_PasskeyChallenge_expiresAt] ON [dbo].[PasskeyChallenge]([expiresAt]);
CREATE INDEX [IX_PasskeyChallenge_userId_purpose] ON [dbo].[PasskeyChallenge]([userId], [purpose]);
