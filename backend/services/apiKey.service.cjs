const crypto = require("crypto");
const { prisma } = require("./db.service.cjs");

// Generate random key
function generateKey() {
  return crypto.randomBytes(32).toString("hex");
}

// Create API Key
async function createKey(userId, name) {
  const keyValue = generateKey();

  const key = await prisma.apiKey.create({
    data: {
      userId,
      name,
      value: keyValue
    }
  });

  return key;
}

// Get all API keys for a user
async function getKeysByUserId(userId) {
  return prisma.apiKey.findMany({
    where: { userId }
  });
}

// Find API key by value (for incoming requests)
async function findKeyByValue(value) {
  return prisma.apiKey.findUnique({
    where: { value }
  });
}

module.exports = {
  createKey,
  getKeysByUserId,
  findKeyByValue
};
