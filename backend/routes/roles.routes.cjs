// backend/routes/roles.routes.cjs
'use strict';

const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma.cjs').prisma || require('../config/prisma.cjs');
const auth = require('../middlewares/auth.middleware.cjs');

const authenticate = auth.authenticate || auth;
const requireAdmin = auth.requireAdmin;

async function ensureAuditTable() {
  await prisma.$executeRawUnsafe(`
    IF OBJECT_ID(N'dbo.AdminAuditLog', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.AdminAuditLog (
        id INT IDENTITY(1,1) PRIMARY KEY,
        adminUserId INT NULL,
        action NVARCHAR(100) NOT NULL,
        moduleKey NVARCHAR(100) NULL,
        method NVARCHAR(20) NULL,
        path NVARCHAR(500) NULL,
        statusCode INT NULL,
        ip NVARCHAR(100) NULL,
        userAgent NVARCHAR(500) NULL,
        details NVARCHAR(MAX) NULL,
        createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
      )
    END
  `);
}

async function audit(req, action, statusCode, details) {
  try {
    await ensureAuditTable();
    await prisma.$executeRawUnsafe(
      `INSERT INTO dbo.AdminAuditLog (adminUserId, action, moduleKey, method, path, statusCode, ip, userAgent, details)
       VALUES (@p0,@p1,@p2,@p3,@p4,@p5,@p6,@p7,@p8)`,
      Number(req.user?.id || 0) || null,
      action,
      'roles',
      req.method,
      req.originalUrl,
      statusCode,
      req.ip || null,
      String(req.get('user-agent') || '').slice(0, 500),
      details ? JSON.stringify(details) : null
    );
  } catch (e) {
    console.error('[ROLES] audit error:', e.message);
  }
}

function cleanText(value, max = 100) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.use(authenticate, requireAdmin);

// GET /api/v1/roles/permissions - همه مجوزهای قابل تخصیص
router.get('/permissions', async (req, res) => {
  try {
    const permissions = await prisma.permission.findMany({ orderBy: { id: 'asc' }, select: { id: true, key: true } });
    await audit(req, 'roles.permissions.list', 200, { count: permissions.length });
    return res.json({ success: true, data: permissions });
  } catch (error) {
    await audit(req, 'roles.permissions.list', 500, { error: error.message });
    return res.status(500).json({ success: false, message: 'خطا در دریافت مجوزها.' });
  }
});

// GET /api/v1/roles - نقش‌ها همراه مجوزهایشان
router.get('/', async (req, res) => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true, name: true, title: true,
        permissions: { select: { permission: { select: { id: true, key: true } } } },
        _count: { select: { users: true } }
      }
    });
    const data = roles.map(r => ({
      id: r.id,
      name: r.name,
      title: r.title || r.name,
      userCount: r._count.users,
      permissions: (r.permissions || []).map(x => x.permission).filter(Boolean)
    }));
    await audit(req, 'roles.list', 200, { count: data.length });
    return res.json({ success: true, data });
  } catch (error) {
    await audit(req, 'roles.list', 500, { error: error.message });
    return res.status(500).json({ success: false, message: 'خطا در دریافت نقش‌ها.' });
  }
});

// GET /api/v1/roles/:id
router.get('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: 'شناسه نقش نامعتبر است.' });
  try {
    const role = await prisma.role.findUnique({
      where: { id },
      select: { id: true, name: true, title: true, permissions: { select: { permission: { select: { id: true, key: true } } } }, _count: { select: { users: true } } }
    });
    if (!role) return res.status(404).json({ success: false, message: 'نقش یافت نشد.' });
    await audit(req, 'roles.get', 200, { roleId: id });
    return res.json({ success: true, data: { id: role.id, name: role.name, title: role.title || role.name, userCount: role._count.users, permissions: role.permissions.map(x => x.permission).filter(Boolean) } });
  } catch (error) {
    await audit(req, 'roles.get', 500, { roleId: id, error: error.message });
    return res.status(500).json({ success: false, message: 'خطا در دریافت نقش.' });
  }
});

// POST /api/v1/roles - ایجاد نقش
router.post('/', async (req, res) => {
  const name = cleanText(req.body?.name, 80);
  const title = cleanText(req.body?.title, 100) || name;
  if (!name) return res.status(400).json({ success: false, message: 'نام نقش الزامی است.' });
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) return res.status(400).json({ success: false, message: 'نام فنی نقش فقط می‌تواند شامل حروف انگلیسی، عدد، نقطه، خط تیره و زیرخط باشد.' });
  try {
    const role = await prisma.role.create({ data: { name, title } });
    await audit(req, 'roles.create', 201, { roleId: role.id, name });
    return res.status(201).json({ success: true, data: { ...role, permissions: [], userCount: 0 }, message: 'نقش با موفقیت ایجاد شد.' });
  } catch (error) {
    const duplicate = String(error?.code) === 'P2002';
    await audit(req, 'roles.create', duplicate ? 409 : 500, { name, error: error.message });
    return res.status(duplicate ? 409 : 500).json({ success: false, message: duplicate ? 'این نام نقش قبلاً استفاده شده است.' : 'خطا در ایجاد نقش.' });
  }
});

// PUT /api/v1/roles/:id - ویرایش مشخصات و/یا مجوزها
router.put('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: 'شناسه نقش نامعتبر است.' });
  try {
    const existing = await prisma.role.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!existing) return res.status(404).json({ success: false, message: 'نقش یافت نشد.' });

    const name = req.body?.name !== undefined ? cleanText(req.body.name, 80) : undefined;
    const title = req.body?.title !== undefined ? cleanText(req.body.title, 100) : undefined;
    if (name !== undefined && (!name || !/^[A-Za-z0-9_.-]+$/.test(name))) return res.status(400).json({ success: false, message: 'نام فنی نقش نامعتبر است.' });
    if (existing.name.toUpperCase() === 'ADMIN' && name && name.toUpperCase() !== 'ADMIN') return res.status(400).json({ success: false, message: 'نام نقش مدیر اصلی قابل تغییر نیست.' });

    const permissionIds = req.body?.permissionIds;
    if (permissionIds !== undefined && (!Array.isArray(permissionIds) || permissionIds.some(x => !parseId(x)))) {
      return res.status(400).json({ success: false, message: 'فهرست مجوزها نامعتبر است.' });
    }

    const result = await prisma.$transaction(async tx => {
      const updated = await tx.role.update({ where: { id }, data: { ...(name !== undefined ? { name } : {}), ...(title !== undefined ? { title } : {}) } });
      if (permissionIds !== undefined) {
        const ids = [...new Set(permissionIds.map(parseId))];
        const valid = ids.length ? await tx.permission.findMany({ where: { id: { in: ids } }, select: { id: true } }) : [];
        if (valid.length !== ids.length) throw new Error('یکی از مجوزهای انتخاب‌شده وجود ندارد.');
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (ids.length) await tx.rolePermission.createMany({ data: ids.map(permissionId => ({ roleId: id, permissionId })) });
      }
      return updated;
    });

    await audit(req, 'roles.update', 200, { roleId: id, permissionIds: permissionIds === undefined ? undefined : [...new Set(permissionIds.map(parseId))] });
    return res.json({ success: true, data: result, message: 'نقش و مجوزهای آن به‌روزرسانی شد.' });
  } catch (error) {
    const duplicate = String(error?.code) === 'P2002';
    await audit(req, 'roles.update', duplicate ? 409 : 500, { roleId: id, error: error.message });
    return res.status(duplicate ? 409 : 500).json({ success: false, message: duplicate ? 'این نام نقش قبلاً استفاده شده است.' : (error.message || 'خطا در به‌روزرسانی نقش.') });
  }
});

// DELETE /api/v1/roles/:id - حذف فقط نقش بدون کاربر و غیرسیستمی
router.delete('/:id', async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: 'شناسه نقش نامعتبر است.' });
  try {
    const role = await prisma.role.findUnique({ where: { id }, select: { id: true, name: true, _count: { select: { users: true } } } });
    if (!role) return res.status(404).json({ success: false, message: 'نقش یافت نشد.' });
    if (['ADMIN', 'USER'].includes(String(role.name).toUpperCase())) return res.status(400).json({ success: false, message: 'نقش‌های سیستمی ADMIN و USER قابل حذف نیستند.' });
    if (role._count.users > 0) return res.status(409).json({ success: false, message: 'این نقش به کاربر اختصاص دارد و قابل حذف نیست.' });
    await prisma.rolePermission.deleteMany({ where: { roleId: id } });
    await prisma.role.delete({ where: { id } });
    await audit(req, 'roles.delete', 200, { roleId: id, name: role.name });
    return res.json({ success: true, message: 'نقش حذف شد.' });
  } catch (error) {
    await audit(req, 'roles.delete', 500, { roleId: id, error: error.message });
    return res.status(500).json({ success: false, message: 'خطا در حذف نقش.' });
  }
});

module.exports = router;
