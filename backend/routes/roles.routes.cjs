const express = require('express');
const { prisma } = require('../config/prisma.cjs');
const authMiddleware = require('../middlewares/auth.middleware.cjs');

const router = express.Router();

function isAdmin(req) {
  const u = req.user || {};
  if (u.isAdmin === true || ['admin', 'ADMIN', 'SUPERADMIN'].includes(String(u.role || ''))) return true;
  return Array.isArray(u.roles) && u.roles.some((r) => String(typeof r === 'string' ? r : r?.name).toLowerCase() === 'admin');
}
function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(403).json({ success: false, message: 'دسترسی فقط برای مدیر سامانه مجاز است.' });
  next();
}
function idOf(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
function cleanText(value, max = 100) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
async function audit(req, action, details) {
  try {
    await prisma.$executeRawUnsafe(
      `IF OBJECT_ID(N'dbo.AdminAuditLog', N'U') IS NOT NULL INSERT INTO dbo.AdminAuditLog (adminUserId, action, moduleKey, method, path, statusCode, ip, userAgent, details) VALUES (@p0,@p1,N'roles',@p2,@p3,@p4,@p5,@p6,@p7)`,
      Number(req.user?.id ?? req.user?.userId ?? 0) || null, action, req.method, req.originalUrl, 200, req.ip || null, String(req.get('user-agent') || '').slice(0, 500), JSON.stringify(details || {})
    );
  } catch (_) {}
}

router.use(authMiddleware);
router.use(requireAdmin);

router.get('/', async (_req, res) => {
  try {
    const roles = await prisma.role.findMany({ orderBy: { id: 'asc' }, include: { users: { select: { id: true } }, permissions: { include: { permission: true } } } });
    return res.json({ success: true, data: roles.map((r) => ({ id: r.id, name: r.name, title: r.title, userCount: r.users.length, permissions: r.permissions.map((rp) => ({ id: rp.permission.id, key: rp.permission.key })) })) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'دریافت نقش‌ها ناموفق بود.', error: error.message });
  }
});

router.get('/permissions', async (_req, res) => {
  try {
    const permissions = await prisma.permission.findMany({ orderBy: { key: 'asc' } });
    return res.json({ success: true, data: permissions });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'دریافت مجوزها ناموفق بود.', error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  const id = idOf(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: 'شناسه نقش نامعتبر است.' });
  try {
    const role = await prisma.role.findUnique({ where: { id }, include: { users: { select: { id: true, username: true, email: true } }, permissions: { include: { permission: true } } } });
    if (!role) return res.status(404).json({ success: false, message: 'نقش پیدا نشد.' });
    return res.json({ success: true, data: { id: role.id, name: role.name, title: role.title, userCount: role.users.length, users: role.users, permissions: role.permissions.map((rp) => rp.permission) } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'دریافت نقش ناموفق بود.', error: error.message });
  }
});

router.post('/', async (req, res) => {
  const name = cleanText(req.body?.name, 80);
  const title = cleanText(req.body?.title, 120) || name;
  const permissionIds = Array.isArray(req.body?.permissionIds) ? req.body.permissionIds.map(idOf).filter(Boolean) : [];
  if (!name || !/^[A-Za-z0-9_-]+$/.test(name)) return res.status(400).json({ success: false, message: 'نام نقش باید شامل حروف لاتین، عدد، خط تیره یا زیرخط باشد.' });
  try {
    const role = await prisma.role.create({ data: { name, title } });
    if (permissionIds.length) await prisma.rolePermission.createMany({ data: [...new Set(permissionIds)].map((permissionId) => ({ roleId: role.id, permissionId })), skipDuplicates: true });
    await audit(req, 'CREATE_ROLE', { roleId: role.id, name, permissionIds });
    return res.status(201).json({ success: true, data: role });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ success: false, message: 'این نام نقش قبلاً ثبت شده است.' });
    return res.status(500).json({ success: false, message: 'ایجاد نقش ناموفق بود.', error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  const id = idOf(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: 'شناسه نقش نامعتبر است.' });
  const title = cleanText(req.body?.title, 120);
  const name = req.body?.name === undefined ? undefined : cleanText(req.body.name, 80);
  const permissionIds = req.body?.permissionIds === undefined ? undefined : (Array.isArray(req.body.permissionIds) ? req.body.permissionIds.map(idOf).filter(Boolean) : null);
  if (name !== undefined && (!name || !/^[A-Za-z0-9_-]+$/.test(name))) return res.status(400).json({ success: false, message: 'نام نقش نامعتبر است.' });
  if (permissionIds === null) return res.status(400).json({ success: false, message: 'فهرست مجوزها نامعتبر است.' });
  try {
    const existing = await prisma.role.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, message: 'نقش پیدا نشد.' });
    const role = await prisma.role.update({ where: { id }, data: { ...(name !== undefined ? { name } : {}), ...(title ? { title } : {}) } });
    if (permissionIds !== undefined) {
      await prisma.rolePermission.deleteMany({ where: { roleId: id } });
      if (permissionIds.length) await prisma.rolePermission.createMany({ data: [...new Set(permissionIds)].map((permissionId) => ({ roleId: id, permissionId })), skipDuplicates: true });
    }
    await audit(req, 'UPDATE_ROLE', { roleId: id, name, title, permissionIds });
    return res.json({ success: true, data: role });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ success: false, message: 'این نام نقش قبلاً ثبت شده است.' });
    return res.status(500).json({ success: false, message: 'ویرایش نقش ناموفق بود.', error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  const id = idOf(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: 'شناسه نقش نامعتبر است.' });
  try {
    const role = await prisma.role.findUnique({ where: { id }, include: { users: { select: { id: true } } } });
    if (!role) return res.status(404).json({ success: false, message: 'نقش پیدا نشد.' });
    if (['admin', 'ADMIN', 'superadmin', 'SUPERADMIN'].includes(String(role.name))) return res.status(409).json({ success: false, message: 'نقش‌های سیستمی قابل حذف نیستند.' });
    if (role.users.length) return res.status(409).json({ success: false, message: 'این نقش به کاربر متصل است و قابل حذف نیست.' });
    await prisma.rolePermission.deleteMany({ where: { roleId: id } });
    await prisma.role.delete({ where: { id } });
    await audit(req, 'DELETE_ROLE', { roleId: id, name: role.name });
    return res.json({ success: true, message: 'نقش با موفقیت حذف شد.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'حذف نقش ناموفق بود.', error: error.message });
  }
});

router.post('/permissions', async (req, res) => {
  const key = cleanText(req.body?.key, 120);
  if (!key || !/^[A-Za-z0-9_.:-]+$/.test(key)) return res.status(400).json({ success: false, message: 'کلید مجوز نامعتبر است.' });
  try {
    const permission = await prisma.permission.create({ data: { key } });
    await audit(req, 'CREATE_PERMISSION', { permissionId: permission.id, key });
    return res.status(201).json({ success: true, data: permission });
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ success: false, message: 'این مجوز قبلاً ثبت شده است.' });
    return res.status(500).json({ success: false, message: 'ایجاد مجوز ناموفق بود.', error: error.message });
  }
});

router.delete('/permissions/:id', async (req, res) => {
  const id = idOf(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: 'شناسه مجوز نامعتبر است.' });
  try {
    const permission = await prisma.permission.findUnique({ where: { id }, include: { roles: true } });
    if (!permission) return res.status(404).json({ success: false, message: 'مجوز پیدا نشد.' });
    if (permission.roles.length) return res.status(409).json({ success: false, message: 'این مجوز به نقش متصل است و قابل حذف نیست.' });
    await prisma.permission.delete({ where: { id } });
    await audit(req, 'DELETE_PERMISSION', { permissionId: id, key: permission.key });
    return res.json({ success: true, message: 'مجوز با موفقیت حذف شد.' });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'حذف مجوز ناموفق بود.', error: error.message });
  }
});

module.exports = router;
