'use strict';

const { listBackupFiles, safeBackupPath } = require('./backup.service.cjs');

async function ensureBackupJobTable(prisma) {
  await prisma.$executeRawUnsafe(`
    IF OBJECT_ID(N'dbo.AdminBackupJob',N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.AdminBackupJob(
        id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        type NVARCHAR(30) NOT NULL DEFAULT N'database',
        filePath NVARCHAR(500) NULL,
        status NVARCHAR(30) NOT NULL,
        startedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
        finishedAt DATETIME2 NULL,
        sizeBytes BIGINT NULL,
        errorMessage NVARCHAR(1000) NULL,
        createdBy INT NULL
      );
      CREATE INDEX IX_AdminBackupJob_startedAt ON dbo.AdminBackupJob(startedAt);
    END
  `);
}

async function syncFilesystemBackups(prisma, createdBy = null) {
  await ensureBackupJobTable(prisma);
  const files = listBackupFiles();
  const existing = await prisma.$queryRawUnsafe(
    `SELECT id,filePath FROM dbo.AdminBackupJob WHERE filePath IS NOT NULL`
  );
  const known = new Map(existing.map((row) => [String(row.filePath).toLowerCase(), Number(row.id)]));
  const synced = [];

  for (const file of files) {
    const safePath = safeBackupPath(file.path);
    if (!safePath) continue;
    const key = safePath.toLowerCase();
    const startedAt = new Date(file.modifiedAt);
    const metadata = {
      status: 'completed',
      startedAt: startedAt.toISOString(),
      finishedAt: startedAt.toISOString(),
      errorMessage: null
    };

    if (known.has(key)) {
      const jobId = known.get(key);
      synced.push({ ...file, ...metadata, id: jobId, jobId });
      continue;
    }

    const rows = await prisma.$queryRawUnsafe(
      `INSERT INTO dbo.AdminBackupJob(type,filePath,status,startedAt,finishedAt,sizeBytes,createdBy)
       OUTPUT INSERTED.id
       VALUES(@p1,@p2,N'completed',@p3,@p3,@p4,@p5)`,
      file.type,
      safePath,
      startedAt,
      Number(file.sizeBytes || 0),
      createdBy
    );

    const jobId = Number(rows[0].id);
    known.set(key, jobId);
    synced.push({ ...file, ...metadata, id: jobId, jobId });
  }

  return synced;
}

module.exports = { syncFilesystemBackups, ensureBackupJobTable };
