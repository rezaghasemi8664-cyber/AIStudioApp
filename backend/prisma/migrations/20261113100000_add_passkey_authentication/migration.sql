IF OBJECT_ID(N'dbo.PasskeyCredential', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.PasskeyCredential (
    id INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_PasskeyCredential PRIMARY KEY,
    userId INT NOT NULL,
    credentialId NVARCHAR(2048) NOT NULL,
    credentialIdHash VARCHAR(64) NOT NULL,
    publicKey NVARCHAR(MAX) NOT NULL,
    counter INT NOT NULL CONSTRAINT DF_PasskeyCredential_counter DEFAULT (0),
    transports NVARCHAR(500) NULL,
    deviceName NVARCHAR(200) NULL,
    deviceType NVARCHAR(30) NULL,
    backedUp BIT NOT NULL CONSTRAINT DF_PasskeyCredential_backedUp DEFAULT (0),
    createdAt DATETIME2 NOT NULL CONSTRAINT DF_PasskeyCredential_createdAt DEFAULT (SYSDATETIME()),
    lastUsedAt DATETIME2 NULL,
    CONSTRAINT UQ_PasskeyCredential_credentialIdHash UNIQUE (credentialIdHash),
    CONSTRAINT FK_PasskeyCredential_User FOREIGN KEY (userId) REFERENCES dbo.[User](id) ON DELETE CASCADE
  );
  CREATE INDEX IX_PasskeyCredential_userId ON dbo.PasskeyCredential(userId);
END;

IF OBJECT_ID(N'dbo.WebAuthnChallenge', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.WebAuthnChallenge (
    id NVARCHAR(36) NOT NULL CONSTRAINT PK_WebAuthnChallenge PRIMARY KEY,
    userId INT NULL,
    purpose NVARCHAR(30) NOT NULL,
    challenge NVARCHAR(255) NOT NULL,
    expiresAt DATETIME2 NOT NULL,
    createdAt DATETIME2 NOT NULL CONSTRAINT DF_WebAuthnChallenge_createdAt DEFAULT (SYSDATETIME()),
    CONSTRAINT FK_WebAuthnChallenge_User FOREIGN KEY (userId) REFERENCES dbo.[User](id) ON DELETE CASCADE
  );
  CREATE INDEX IX_WebAuthnChallenge_userId_expiresAt ON dbo.WebAuthnChallenge(userId, expiresAt);
  CREATE INDEX IX_WebAuthnChallenge_expiresAt ON dbo.WebAuthnChallenge(expiresAt);
END;
