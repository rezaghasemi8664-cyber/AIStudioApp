'use strict';

jest.mock('../config/prisma.cjs', () => ({
  session: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    findMany: jest.fn(),
    deleteMany: jest.fn(),
  },
}));

jest.mock('../middlewares/securityPolicy.middleware.cjs', () => ({
  getSecurityPolicy: jest.fn(),
}));

const prisma = require('../config/prisma.cjs');
const { getSecurityPolicy } = require('../middlewares/securityPolicy.middleware.cjs');
const { enforceSession } = require('../services/sessionSecurity.service.cjs');

const policy = {
  sessionMaxAgeHours: 24,
  maxSessionsPerUser: 5,
};

function makeSession(userId = 7) {
  return { id: 101, userId, createdAt: new Date() };
}

beforeEach(() => {
  jest.clearAllMocks();
  getSecurityPolicy.mockResolvedValue(policy);
  prisma.session.findUnique.mockResolvedValue(null);
  prisma.session.create.mockResolvedValue(makeSession());
  prisma.session.findMany.mockResolvedValue([]);
  prisma.session.delete.mockResolvedValue({});
  prisma.session.deleteMany.mockResolvedValue({ count: 0 });
});

test('coalesces concurrent requests for the same token into one insert', async () => {
  const session = makeSession();
  prisma.session.create.mockResolvedValue(session);

  const results = await Promise.all([
    enforceSession('same-token', 7),
    enforceSession('same-token', 7),
    enforceSession('same-token', 7),
    enforceSession('same-token', 7),
  ]);

  expect(prisma.session.create).toHaveBeenCalledTimes(1);
  expect(prisma.session.findUnique).toHaveBeenCalledTimes(1);
  expect(results.every((result) => result.valid)).toBe(true);
  expect(prisma.session.findMany).toHaveBeenCalledTimes(1);
});

test('recovers from a unique-key conflict created by another process', async () => {
  const session = makeSession();
  prisma.session.findUnique
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(session);
  prisma.session.create.mockRejectedValue({ code: 'P2002' });

  const result = await enforceSession('cross-process-token', 7);

  expect(result.valid).toBe(true);
  expect(prisma.session.create).toHaveBeenCalledTimes(1);
  expect(prisma.session.findUnique).toHaveBeenCalledTimes(2);
});

test('does not delete a session when the token belongs to another user', async () => {
  prisma.session.findUnique.mockResolvedValue(makeSession(7));

  const result = await enforceSession('foreign-token', 8);

  expect(result).toEqual({ valid: false, code: 'SESSION_USER_MISMATCH' });
  expect(prisma.session.delete).not.toHaveBeenCalled();
  expect(prisma.session.deleteMany).not.toHaveBeenCalled();
});

test('surfaces non-unique database errors instead of treating them as token races', async () => {
  prisma.session.create.mockRejectedValue({ code: 'P1001', message: 'database unavailable' });

  await expect(enforceSession('db-error-token', 7)).rejects.toMatchObject({ code: 'P1001' });
  expect(prisma.session.findUnique).toHaveBeenCalledTimes(1);
});
