-- One active commodity snapshot; id is fixed to 1.
IF OBJECT_ID(N'dbo.CommoditySnapshot', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.CommoditySnapshot (
    id TINYINT NOT NULL CONSTRAINT PK_CommoditySnapshot PRIMARY KEY,
    snapshotJson NVARCHAR(MAX) NOT NULL,
    fetchedAt DATETIME2(3) NOT NULL CONSTRAINT DF_CommoditySnapshot_fetchedAt DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_CommoditySnapshot_singleton CHECK (id = 1),
    CONSTRAINT CK_CommoditySnapshot_json CHECK (ISJSON(snapshotJson) = 1)
  );
END;
