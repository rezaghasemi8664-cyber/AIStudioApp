import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function test() {
  const users = await prisma.user.findMany();
  console.log("Users:", users);
}

test()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.log("DB Error:", err);
    prisma.$disconnect();
  });
