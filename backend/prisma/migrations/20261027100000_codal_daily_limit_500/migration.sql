/*
  Raise the SQL Server Codal daily request counter constraint to match
  the application default/configuration ceiling of 500.
*/
IF OBJECT_ID(N'dbo.CodalApiDailyUsage', N'U') IS NOT NULL
BEGIN
  IF EXISTS (
    SELECT 1
    FROM sys.check_constraints
    WHERE name = N'CK_CodalApiDailyUsage_RequestCount'
      AND parent_object_id = OBJECT_ID(N'dbo.CodalApiDailyUsage')
  )
  BEGIN
    ALTER TABLE dbo.CodalApiDailyUsage
      DROP CONSTRAINT CK_CodalApiDailyUsage_RequestCount;
  END;

  ALTER TABLE dbo.CodalApiDailyUsage
    ADD CONSTRAINT CK_CodalApiDailyUsage_RequestCount
      CHECK (RequestCount >= 0 AND RequestCount <= 500);
END;
