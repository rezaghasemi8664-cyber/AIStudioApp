// helpers/userHelper.cjs
// ===================================================
// Helper functions for User model - Schema Compatible
// Shared across all controllers
// ===================================================

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Split a full name into firstName and lastName
 * Handles Persian/English names
 */
function splitName(fullName) {
  if (!fullName || typeof fullName !== 'string') {
    return { firstName: '', lastName: '' };
  }
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
}

/**
 * Combine firstName and lastName into a single name
 */
function combineName(firstName, lastName) {
  return [firstName, lastName].filter(Boolean).join(' ').trim() || null;
}

/**
 * Parse user ID - handles both numeric and string (UUID) IDs
 */
function parseUserId(id) {
  if (id === null || id === undefined) return null;
  const num = Number(id);
  if (!isNaN(num) && Number.isInteger(num) && num > 0) return num;
  if (typeof id === 'string' && id.length > 0) return id;
  return null;
}

/**
 * Safe user select object - only fields that exist in the actual schema
 * Adjust this based on your actual schema.prisma
 */
function getSafeUserSelect() {
  return {
    id: true,
    email: true,
    name: true,
    // avatar: true,      // uncomment if exists
    // createdAt: true,    // uncomment if exists
    // updatedAt: true,    // uncomment if exists
    // isActive: true,     // uncomment if exists
    // isDeleted: true,    // uncomment if exists
    Role: {
      select: {
        id: true,
        name: true
      }
    }
  };
}

/**
 * Safe user select without Role relation (fallback)
 */
function getSafeUserSelectMinimal() {
  return {
    id: true,
    email: true,
    name: true
  };
}

/**
 * Transform a raw DB user object into frontend-compatible format
 */
function transformUserForFrontend(dbUser) {
  if (!dbUser) return null;

  const { firstName, lastName } = splitName(dbUser.name);

  // Determine role name
  let roleName = 'USER';
  let isAdmin = false;

  if (dbUser.Role) {
    if (typeof dbUser.Role === 'object' && dbUser.Role.name) {
      roleName = dbUser.Role.name;
    } else if (typeof dbUser.Role === 'string') {
      roleName = dbUser.Role;
    }
  }

  isAdmin = roleName === 'ADMIN' || roleName === 'admin';

  return {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name || '',
    firstName,
    lastName,
    role: roleName,
    isAdmin,
    avatar: dbUser.avatar || null,
    createdAt: dbUser.createdAt || null,
    updatedAt: dbUser.updatedAt || null,
    isActive: dbUser.isActive !== undefined ? dbUser.isActive : true,
  };
}

/**
 * Find user by ID with multiple fallback strategies
 */
async function findUserById(userId) {
  const parsedId = parseUserId(userId);
  if (!parsedId) return null;

  // Strategy 1: Full query with Role relation
  try {
    const user = await prisma.user.findUnique({
      where: { id: parsedId },
      select: getSafeUserSelect()
    });
    if (user) return user;
  } catch (err) {
    console.warn('[findUserById] Strategy 1 failed:', err.message);
  }

  // Strategy 2: Minimal query without Role
  try {
    const user = await prisma.user.findUnique({
      where: { id: parsedId },
      select: getSafeUserSelectMinimal()
    });
    if (user) return user;
  } catch (err) {
    console.warn('[findUserById] Strategy 2 failed:', err.message);
  }

  // Strategy 3: Raw query as last resort
  try {
    const results = await prisma.$queryRaw`
      SELECT id, email, name FROM [User] WHERE id = ${parsedId}
    `;
    if (results && results.length > 0) return results[0];
  } catch (err) {
    console.warn('[findUserById] Strategy 3 (raw) failed:', err.message);
  }

  return null;
}

/**
 * Find user by email with multiple fallback strategies
 */
async function findUserByEmail(email) {
  if (!email) return null;

  // Strategy 1: Full query with Role + password
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        ...getSafeUserSelect(),
        password: true
      }
    });
    if (user) return user;
  } catch (err) {
    console.warn('[findUserByEmail] Strategy 1 failed:', err.message);
  }

  // Strategy 2: Minimal + password
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      select: {
        ...getSafeUserSelectMinimal(),
        password: true
      }
    });
    if (user) return user;
  } catch (err) {
    console.warn('[findUserByEmail] Strategy 2 failed:', err.message);
  }

  return null;
}

module.exports = {
  splitName,
  combineName,
  parseUserId,
  getSafeUserSelect,
  getSafeUserSelectMinimal,
  transformUserForFrontend,
  findUserById,
  findUserByEmail,
  prisma
};
