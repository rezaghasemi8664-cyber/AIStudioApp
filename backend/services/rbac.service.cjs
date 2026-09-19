'use strict';

const { prisma } = require('../config/prisma.cjs');

const MODULES = ['dashboard','users','subscriptions','analysis','market','scalping','ai','prompts','history','plugins','farazsms','notifications','monitoring','reports','security','settings','maintenance','updates','backup','payments','roles','audit','sessions','api','infrastructure'];
const PERMISSIONS = MODULES.map((moduleKey) => `admin.${moduleKey}.${['dashboard','monitoring','reports','audit'].includes(moduleKey) ? 'view' : 'manage'}`);

let bootstrapPromise = null;

async function ensurePermissions() {
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = (async () => {
    for (const key of PERMISSIONS) {
      await prisma.permission.upsert({ where: { key }, update: {}, create: { key } });
    }

    const adminRoles = await prisma.role.findMany({
      where: { name: { in: ['ADMIN', 'SUPERADMIN'] } },
      select: { id: true, name: true },
    });

    for (const role of adminRoles) {
      for (const key of PERMISSIONS) {
        const permission = await prisma.permission.findUnique({
          where: { key },
          select: { id: true },
        });
        if (!permission) continue;

        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
          update: {},
          create: { roleId: role.id, permissionId: permission.id },
        });
      }
    }
  })().catch((error) => {
    bootstrapPromise = null;
    throw error;
  });

  return bootstrapPromise;
}

async function hasPermission(userId, permissionKey) {
  await ensurePermissions();
  const user = await prisma.user.findUnique({
    where: { id: Number(userId) },
    select: { Role: { select: { id: true, name: true } } },
  });
  const role = user?.Role;
  if (!role) return false;
  if (String(role.name).toUpperCase() === 'SUPERADMIN') return true;

  const direct = await prisma.userPermission.findFirst({
    where: {
      userId: Number(userId),
      permission: { key: permissionKey },
    },
    select: { id: true },
  });
  if (direct) return true;

  return !!(await prisma.rolePermission.findFirst({
    where: {
      roleId: role.id,
      permission: { key: permissionKey },
    },
    select: { id: true },
  }));
}

async function listRolePermissions(roleId) {
  await ensurePermissions();
  const id = Number(roleId);
  const role = await prisma.role.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!role) throw new Error('نقش پیدا نشد.');

  const permissions = await prisma.permission.findMany({
    orderBy: { key: 'asc' },
    select: { id: true, key: true },
  });
  const assigned = await prisma.rolePermission.findMany({
    where: { roleId: id },
    select: { permissionId: true },
  });
  const assignedSet = new Set(assigned.map((item) => item.permissionId));

  return permissions.map((permission) => ({
    ...permission,
    assigned: String(role.name).toUpperCase() === 'SUPERADMIN' || assignedSet.has(permission.id),
  }));
}

async function setRolePermissions(roleId, permissionKeys) {
  await ensurePermissions();
  const id = Number(roleId);
  const role = await prisma.role.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!role) throw new Error('نقش پیدا نشد.');

  if (String(role.name).toUpperCase() === 'SUPERADMIN') {
    return { roleId: id, permissionCount: PERMISSIONS.length, protected: true };
  }

  const keys = Array.isArray(permissionKeys)
    ? [...new Set(permissionKeys.map(String))]
    : [];
  const invalidKeys = keys.filter((key) => !PERMISSIONS.includes(key));
  if (invalidKeys.length) throw new Error('یک یا چند مجوز نامعتبر است.');

  const permissions = await prisma.permission.findMany({
    where: { key: { in: keys } },
    select: { id: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.rolePermission.deleteMany({ where: { roleId: id } });
    if (permissions.length > 0) {
      await tx.rolePermission.createMany({
        data: permissions.map((permission) => ({ roleId: id, permissionId: permission.id })),
      });
    }
  });

  return { roleId: id, permissionCount: permissions.length };
}

async function listUserPermissions(userId) {
  await ensurePermissions();
  const id = Number(userId);
  if (!id) throw new Error('شناسه کاربر نامعتبر است.');
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, email: true, Role: { select: { id: true, name: true, title: true } } },
  });
  if (!user) throw new Error('کاربر پیدا نشد.');
  const permissions = await prisma.permission.findMany({
    orderBy: { key: 'asc' },
    select: { id: true, key: true },
  });
  const assigned = await prisma.userPermission.findMany({
    where: { userId: id },
    select: { permissionId: true },
  });
  const assignedSet = new Set(assigned.map((item) => item.permissionId));
  return {
    user: { id: user.id, username: user.username, email: user.email, role: user.Role },
    permissions: permissions.map((permission) => ({ ...permission, assigned: assignedSet.has(permission.id) })),
  };
}

async function setUserPermissions(userId, permissionKeys) {
  await ensurePermissions();
  const id = Number(userId);
  if (!id) throw new Error('شناسه کاربر نامعتبر است.');
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, Role: { select: { name: true } } },
  });
  if (!user) throw new Error('کاربر پیدا نشد.');
  if (String(user.Role?.name || '').toUpperCase() === 'SUPERADMIN') {
    return { userId: id, permissionCount: PERMISSIONS.length, protected: true };
  }
  const keys = Array.isArray(permissionKeys) ? [...new Set(permissionKeys.map(String))] : [];
  const invalidKeys = keys.filter((key) => !PERMISSIONS.includes(key));
  if (invalidKeys.length) throw new Error('یک یا چند مجوز نامعتبر است.');
  const permissions = await prisma.permission.findMany({ where: { key: { in: keys } }, select: { id: true } });
  await prisma.$transaction(async (tx) => {
    await tx.userPermission.deleteMany({ where: { userId: id } });
    if (permissions.length) {
      await tx.userPermission.createMany({
        data: permissions.map((permission) => ({ userId: id, permissionId: permission.id })),
      });
    }
  });
  return { userId: id, permissionCount: permissions.length };
}

module.exports = {
  MODULES,
  PERMISSIONS,
  ensurePermissions,
  hasPermission,
  listRolePermissions,
  setRolePermissions,
  listUserPermissions,
  setUserPermissions,
};

