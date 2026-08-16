// services/fontConfig.service.cjs
const prisma = require('../config/prisma.cjs');

const DEFAULT_PERSIAN_FONT = 'B Nazanin';
const DEFAULT_LATIN_FONT = 'Roboto';
const GLOBAL_FONTS_KEY = 'fontsList';

function safeJsonParse(value, fallback = null) {
  if (value == null) return fallback;

  if (typeof value === 'object') {
    return value;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function normalizeFontItem(font) {
  if (!font || typeof font !== 'object') return null;

  const name = String(font.name || '').trim();
  const type = String(font.type || '').trim().toLowerCase();
  const url = String(font.url || '').trim();

  if (!name || !url) return null;

  return {
    name,
    type: type === 'latin' ? 'latin' : 'persian',
    url,
  };
}

function normalizeFontsList(value) {
  const raw = safeJsonParse(value, []);
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.fonts)
      ? raw.fonts
      : Array.isArray(raw?.items)
        ? raw.items
        : [];

  return list.map(normalizeFontItem).filter(Boolean);
}

function normalizeSelectedFonts(value) {
  const raw = safeJsonParse(value, {});
  const fonts = raw?.fonts && typeof raw.fonts === 'object' ? raw.fonts : raw;

  return {
    persian: fonts?.persian || DEFAULT_PERSIAN_FONT,
    latin: fonts?.latin || DEFAULT_LATIN_FONT,
  };
}

async function getUIConfigModel() {
  if (!prisma) {
    throw new Error('Prisma client is not available');
  }

  return prisma.uIConfig || prisma.uiConfig || null;
}

async function getGlobalFontsList() {
  const model = await getUIConfigModel();

  if (model) {
    const record = await model.findFirst({
      where: { key: GLOBAL_FONTS_KEY },
    });

    if (!record) return [];

    return normalizeFontsList(record.valueJson ?? record.value);
  }

  const rows = await prisma.$queryRawUnsafe(`
    SELECT TOP 1 id, [key], valueJson, value
    FROM [dbo].[UIConfig]
    WHERE [key] = '${GLOBAL_FONTS_KEY}'
  `);

  if (!rows || !rows.length) return [];

  return normalizeFontsList(rows[0].valueJson ?? rows[0].value);
}

async function saveGlobalFontsList(fonts) {
  const normalizedFonts = normalizeFontsList(fonts);
  const valueJson = JSON.stringify(normalizedFonts);
  const model = await getUIConfigModel();

  if (model) {
    const existing = await model.findFirst({
      where: { key: GLOBAL_FONTS_KEY },
    });

    if (existing) {
      await model.update({
        where: { id: existing.id },
        data: { valueJson },
      });
    } else {
      await model.create({
        data: {
          key: GLOBAL_FONTS_KEY,
          valueJson,
        },
      });
    }

    return normalizedFonts;
  }

  const existingRows = await prisma.$queryRawUnsafe(`
    SELECT TOP 1 id
    FROM [dbo].[UIConfig]
    WHERE [key] = '${GLOBAL_FONTS_KEY}'
  `);

  if (existingRows && existingRows.length) {
    await prisma.$executeRawUnsafe(`
      UPDATE [dbo].[UIConfig]
      SET valueJson = '${valueJson.replace(/'/g, "''")}'
      WHERE id = ${existingRows[0].id}
    `);
  } else {
    await prisma.$executeRawUnsafe(`
      INSERT INTO [dbo].[UIConfig] ([key], valueJson)
      VALUES ('${GLOBAL_FONTS_KEY}', '${valueJson.replace(/'/g, "''")}')
    `);
  }

  return normalizedFonts;
}

async function addGlobalFont(font) {
  const normalizedFont = normalizeFontItem(font);

  if (!normalizedFont) {
    throw new Error('Invalid font payload');
  }

  const fonts = await getGlobalFontsList();

  const exists = fonts.some(
    (item) =>
      item.name.toLowerCase() === normalizedFont.name.toLowerCase() &&
      item.type === normalizedFont.type
  );

  if (exists) {
    throw new Error('Font already exists');
  }

  fonts.push(normalizedFont);
  const saved = await saveGlobalFontsList(fonts);

  return {
    added: normalizedFont,
    fonts: saved,
  };
}

async function getUserSelectedFonts(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { uiConfig: true },
  });

  const uiConfig = safeJsonParse(user?.uiConfig, {});
  return normalizeSelectedFonts(uiConfig?.fonts || uiConfig?.selectedFonts || {});
}

async function saveUserSelectedFonts(userId, selected) {
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { uiConfig: true },
  });

  const currentConfig = safeJsonParse(currentUser?.uiConfig, {});
  const currentFonts = normalizeSelectedFonts(currentConfig?.fonts || {});

  const nextFonts = {
    persian: selected?.persian || currentFonts.persian,
    latin: selected?.latin || currentFonts.latin,
  };

  const nextConfig = {
    ...currentConfig,
    fonts: nextFonts,
  };

  await prisma.user.update({
    where: { id: userId },
    data: {
      uiConfig: JSON.stringify(nextConfig),
    },
  });

  return nextFonts;
}

module.exports = {
  DEFAULT_PERSIAN_FONT,
  DEFAULT_LATIN_FONT,
  getGlobalFontsList,
  saveGlobalFontsList,
  addGlobalFont,
  getUserSelectedFonts,
  saveUserSelectedFonts,
  normalizeFontsList,
  normalizeSelectedFonts,
};
