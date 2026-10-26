IF OBJECT_ID(N'dbo.CodalAnnouncement', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.CodalAnnouncement (
    AnnouncementKey NVARCHAR(64) NOT NULL CONSTRAINT PK_CodalAnnouncement PRIMARY KEY,
    Symbol NVARCHAR(100) NULL,
    Category NVARCHAR(50) NULL,
    Title NVARCHAR(1000) NULL,
    PublishedAt NVARCHAR(40) NULL,
    PayloadJson NVARCHAR(MAX) NOT NULL,
    LastSnapshotId UNIQUEIDENTIFIER NULL,
    FirstSeenAt DATETIME2 NOT NULL CONSTRAINT DF_CodalAnnouncement_FirstSeenAt DEFAULT SYSUTCDATETIME(),
    LastSeenAt DATETIME2 NOT NULL CONSTRAINT DF_CodalAnnouncement_LastSeenAt DEFAULT SYSUTCDATETIME()
  );
  CREATE INDEX IX_CodalAnnouncement_Symbol_Category_PublishedAt
    ON dbo.CodalAnnouncement (Symbol, Category, PublishedAt);
  CREATE INDEX IX_CodalAnnouncement_PublishedAt
    ON dbo.CodalAnnouncement (PublishedAt);
END;
IF OBJECT_ID(N'dbo.CodalSnapshotState', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.CodalSnapshotState (
    StateId INT NOT NULL CONSTRAINT PK_CodalSnapshotState PRIMARY KEY,
    ActiveSnapshotId UNIQUEIDENTIFIER NULL,
    LastAttemptAt DATETIME2 NULL,
    LastSuccessAt DATETIME2 NULL,
    LastError NVARCHAR(4000) NULL,
    AnnouncementCount INT NOT NULL CONSTRAINT DF_CodalSnapshotState_AnnouncementCount DEFAULT 0,
    PageCount INT NOT NULL CONSTRAINT DF_CodalSnapshotState_PageCount DEFAULT 0,
    CONSTRAINT CK_CodalSnapshotState_Singleton CHECK (StateId = 1)
  );
END;
IF OBJECT_ID(N'dbo.CodalApiDailyUsage', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.CodalApiDailyUsage (
    RequestDate NVARCHAR(10) NOT NULL CONSTRAINT PK_CodalApiDailyUsage PRIMARY KEY,
    RequestCount INT NOT NULL,
    UpdatedAt DATETIME2 NOT NULL CONSTRAINT DF_CodalApiDailyUsage_UpdatedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_CodalApiDailyUsage_RequestCount CHECK (RequestCount >= 0 AND RequestCount <= 400)
  );
END;

IF OBJECT_ID(N'dbo.CodalSnapshotAnnouncement', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.CodalSnapshotAnnouncement (
    SnapshotId UNIQUEIDENTIFIER NOT NULL,
    AnnouncementKey NVARCHAR(64) NOT NULL,
    Symbol NVARCHAR(100) NULL,
    Category NVARCHAR(50) NULL,
    Title NVARCHAR(1000) NULL,
    PublishedAt NVARCHAR(40) NULL,
    PayloadJson NVARCHAR(MAX) NOT NULL,
    CONSTRAINT PK_CodalSnapshotAnnouncement PRIMARY KEY (SnapshotId, AnnouncementKey)
  );
  CREATE INDEX IX_CodalSnapshotAnnouncement_Snapshot_Symbol_Category_Date
    ON dbo.CodalSnapshotAnnouncement (SnapshotId, Symbol, Category, PublishedAt);
END;
