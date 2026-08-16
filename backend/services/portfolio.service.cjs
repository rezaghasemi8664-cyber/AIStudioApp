"use strict";

const { prisma } = require("./db.service.cjs");

/* ===================== CREATE PORTFOLIO ===================== */

async function createPortfolio(userId, data) {
  if (!userId) {
    throw new Error("USER_ID_REQUIRED");
  }

  return prisma.portfolio.create({
    data: {
      userId,
      name: typeof data?.name === "string" ? data.name.trim() : null,
      description:
        typeof data?.description === "string"
          ? data.description.trim()
          : null,
    },
  });
}

/* ===================== GET USER PORTFOLIOS ===================== */

async function getUserPortfolios(userId) {
  if (!userId) {
    return [];
  }

  const portfolios = await prisma.portfolio.findMany({
    where: { userId },
    include: {
      positions: true,
    },
    orderBy: {
      id: "desc",
    },
  });

  // ? Always return array
  return Array.isArray(portfolios) ? portfolios : [];
}

/* ===================== ADD POSITION ===================== */

async function addPosition(portfolioId, position, userId) {
  if (!Number.isInteger(portfolioId) || portfolioId <= 0) {
    throw new Error("INVALID_PORTFOLIO_ID");
  }

  /* =====================
     OWNERSHIP CHECK
  ===================== */
  const portfolio = await prisma.portfolio.findFirst({
    where: {
      id: portfolioId,
      userId,
    },
    select: {
      id: true,
    },
  });

  if (!portfolio) {
    const err = new Error("PORTFOLIO_NOT_FOUND_OR_FORBIDDEN");
    err.status = 404;
    err.publicMessage = "portfolio not found";
    throw err;
  }

  return prisma.portfolioPosition.create({
    data: {
      portfolioId,
      symbol: position.symbol,
      volume: position.volume,
      buyPrice: position.buyPrice,
    },
  });
}

/* ===================== DELETE POSITION ===================== */

async function deletePosition(positionId, userId) {
  if (!Number.isInteger(positionId) || positionId <= 0) {
    throw new Error("INVALID_POSITION_ID");
  }

  /* =====================
     OWNERSHIP CHECK
  ===================== */
  const position = await prisma.portfolioPosition.findFirst({
    where: {
      id: positionId,
      portfolio: {
        userId,
      },
    },
    select: { id: true },
  });

  if (!position) {
    const err = new Error("POSITION_NOT_FOUND_OR_FORBIDDEN");
    err.status = 404;
    err.publicMessage = "position not found";
    throw err;
  }

  return prisma.portfolioPosition.delete({
    where: { id: positionId },
  });
}

/* ===================== EXPORT ===================== */

module.exports = {
  createPortfolio,
  getUserPortfolios,
  addPosition,
  deletePosition,
};
