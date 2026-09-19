const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function seedRoles() {
  const roles = ["USER", "ADMIN", "SUPPORT"];
  for (const name of roles) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log("✅ Roles seeded successfully");
}

async function upsertGlobalSetting(category, key, value) {
  const existing = await prisma.globalSetting.findUnique({
    where: { category_key: { category, key } },
  });

  if (!existing) {
    return prisma.globalSetting.create({
      data: { category, key, value, version: 1 },
    });
  }

  // فقط اگر مقدار تغییر کرده بود آپدیت/افزایش نسخه
  if (existing.value !== value) {
    return prisma.globalSetting.update({
      where: { category_key: { category, key } },
      data: { value, version: { increment: 1 } },
    });
  }

  return existing;
}

async function seedFonts() {
  const fonts = [
    { name: "B Nazanin", type: "persian", url: "/fonts/b-nazanin.woff2", isDefault: true, isEnabled: true },
    { name: "Vazirmatn", type: "persian", url: "/fonts/vazirmatn.woff2", isDefault: false, isEnabled: true },
    { name: "Sahel", type: "persian", url: "/fonts/sahel.woff2", isDefault: false, isEnabled: true },
    { name: "Estedad", type: "persian", url: "/fonts/estedad.woff2", isDefault: false, isEnabled: true },
    { name: "Roboto", type: "latin", url: "/fonts/roboto.woff2", isDefault: true, isEnabled: true },
  ];

  await upsertGlobalSetting("fonts", "list", JSON.stringify(fonts));
  await upsertGlobalSetting("fonts", "selected_persian", "B Nazanin");
  await upsertGlobalSetting("fonts", "selected_latin", "Roboto");
  await upsertGlobalSetting("fonts", "published", "true");

  console.log("✅ Fonts seeded in GlobalSetting successfully");
}

async function main() {
  await seedRoles();
  await seedFonts();
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
