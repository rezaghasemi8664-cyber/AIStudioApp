'use strict';

const { listBackupFiles, safeBackupPath } = require('./backup.service.cjs');

async function syncFilesystemBackups(prisma, createdBy = null) {
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
    if (known.has(key)) {
      const jobId = known.get(key);
      synced.push({ ...file, id: jobId, jobId });
      continue;
    }

    const startedAt = new Date(file.modifiedAt);
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
    synced.push({ ...file, id: jobId, jobId });
  }

  return synced;
}

module.exports = { syncFilesystemBackups };
