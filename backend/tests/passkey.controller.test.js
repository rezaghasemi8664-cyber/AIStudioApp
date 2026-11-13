jest.mock('../config/prisma.cjs', () => ({
  prisma: {
    userPreference: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    passkeyCredential: {
      findMany: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
    passkeyChallenge: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: jest.fn(),
  verifyRegistrationResponse: jest.fn(),
  generateAuthenticationOptions: jest.fn(),
  verifyAuthenticationResponse: jest.fn(),
}));

const prisma = require('../config/prisma.cjs').prisma;
const webauthn = require('@simplewebauthn/server');
const controller = require('../controllers/passkey.controller.cjs');

function response() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('Passkey controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'test';
  });

  test('returns only the authenticated user passkey devices and enabled preference', async () => {
    prisma.userPreference.findUnique.mockResolvedValue({ value: 'true' });
    prisma.passkeyCredential.findMany.mockResolvedValue([
      { id: 9, deviceName: 'iPhone', deviceType: 'multiDevice', backedUp: true, createdAt: new Date(), lastUsedAt: null },
    ]);
    const res = response();

    await controller.getSettings({ user: { userId: 42 } }, res);

    expect(prisma.passkeyCredential.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 42 } }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ enabled: true, devices: expect.arrayContaining([expect.objectContaining({ id: 9, deviceName: 'iPhone' })]) }),
    }));
  });

  test('does not enable passkey login before at least one credential is registered', async () => {
    prisma.passkeyCredential.count.mockResolvedValue(0);
    const res = response();

    await controller.updateEnabled({ user: { userId: 42 }, body: { enabled: true } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(prisma.userPreference.upsert).not.toHaveBeenCalled();
  });

  test('removing the last device also disables passkey login', async () => {
    prisma.passkeyCredential.deleteMany.mockResolvedValue({ count: 1 });
    prisma.passkeyCredential.count.mockResolvedValue(0);
    prisma.userPreference.upsert.mockResolvedValue({});
    const res = response();

    await controller.removeDevice({ user: { userId: 42 }, params: { credentialId: '9' } }, res);

    expect(prisma.passkeyCredential.deleteMany).toHaveBeenCalledWith({ where: { id: 9, userId: 42 } });
    expect(prisma.userPreference.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_key: { userId: 42, key: 'passkey.login.enabled' } },
      create: expect.objectContaining({ value: 'false' }),
    }));
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { remaining: 0, enabled: false } });
  });

  test('creates a short-lived discoverable login challenge only when passkeys are enabled', async () => {
    prisma.userPreference.findMany.mockResolvedValue([{ userId: 42 }]);
    prisma.passkeyCredential.count.mockResolvedValue(1);
    prisma.passkeyChallenge.deleteMany.mockResolvedValue({ count: 0 });
    prisma.passkeyChallenge.create.mockResolvedValue({});
    webauthn.generateAuthenticationOptions.mockResolvedValue({ challenge: 'random-challenge' });
    const res = response();

    await controller.loginOptions({ headers: { origin: 'https://roniya.example' } }, res);

    expect(webauthn.generateAuthenticationOptions).toHaveBeenCalledWith(expect.objectContaining({
      rpID: 'roniya.example', userVerification: 'required', allowCredentials: [],
    }));
    expect(prisma.passkeyChallenge.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ challenge: 'random-challenge', purpose: 'authentication', userId: null }),
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true, data: expect.objectContaining({ challenge: 'random-challenge' }),
    }));
  });
});
