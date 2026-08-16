const { PrismaClient } = require("@prisma/client");
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

(async () => {
  const username = "r.ghasemi";
  const newPassword = "Rgh@951852";

  const hash = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { username },
    data: { password: hash },
  });

  console.log("? Admin password reset successfully");
  await prisma.$disconnect();
})();
