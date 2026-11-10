/**
 * SQL Server notification/analysis timestamps are stored as Tehran wall-clock
 * values (DATETIME2/SYSDATETIME) but Prisma serializes them with a UTC suffix.
 * Convert that serialized value back to the real instant before formatting.
 */
export function parseSqlServerTehranDate(value?: string | null): Date | null {
  if (!value) return null;
  const input = String(value).trim();
  const hasZone = /(?:Z|[+-]\\d{2}:?\\d{2})$/i.test(input);
  const milliseconds = Date.parse(hasZone ? input : `${input}Z`);
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds - 210 * 60 * 1000);
}

export function formatSqlServerTehranDate(value?: string | null): string {
  const date = parseSqlServerTehranDate(value);
  return date ? date.toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' }) : '—';
}
