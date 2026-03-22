// Mock config before any imports that might read the RSA key from disk
jest.mock('../config', () => ({
  RSA_PRIVATE_KEY: 'mock-private-key',
  JWT_ISSUER: 'test-issuer',
}));

import { LicensesService } from './licenses.service';

describe('LicensesService', () => {
  let service: LicensesService;

  const mockPrisma = {
    license: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockJwt = {
    sign: jest.fn().mockReturnValue('signed-token'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LicensesService(mockPrisma as any, mockJwt as any);
  });

  it('generate: creates a license with available status', async () => {
    mockPrisma.license.create.mockResolvedValue({
      key: 'ABCD-1234-EFGH-5678',
      status: 'available',
      mode: 'desktop',
    });
    const result = await service.generate({ mode: 'desktop' });
    expect(result.key).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(mockPrisma.license.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'available' }) }),
    );
  });

  it('activate: rejects unknown key with 404', async () => {
    mockPrisma.license.findUnique.mockResolvedValue(null);
    await expect(
      service.activate({ licenseKey: 'BAD-KEY', machineId: 'abc', platform: 'win32' }),
    ).rejects.toThrow('License key not found');
  });

  it('activate: rejects revoked license with 410', async () => {
    mockPrisma.license.findUnique.mockResolvedValue({ status: 'revoked', machineId: null });
    await expect(
      service.activate({ licenseKey: 'KEY', machineId: 'abc', platform: 'win32' }),
    ).rejects.toThrow('License revoked');
  });

  it('activate: rejects license already bound to different machine with 409', async () => {
    mockPrisma.license.findUnique.mockResolvedValue({
      status: 'active',
      machineId: 'other-machine',
    });
    await expect(
      service.activate({ licenseKey: 'KEY', machineId: 'my-machine', platform: 'win32' }),
    ).rejects.toThrow('License already in use on another machine');
  });

  it('activate: returns JWT token for valid unused license', async () => {
    mockPrisma.license.findUnique.mockResolvedValue({
      status: 'available',
      machineId: null,
      key: 'KEY',
    });
    mockPrisma.license.update.mockResolvedValue({ activatedAt: new Date('2026-01-01T00:00:00.000Z') });
    const result = await service.activate({
      licenseKey: 'KEY',
      machineId: 'my-machine',
      platform: 'darwin',
    });
    expect(result.token).toBe('signed-token');
    expect(mockJwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({ machineId: 'my-machine', licenseKey: 'KEY' }),
      expect.objectContaining({ algorithm: 'RS256' }),
    );
  });

  it('deactivate: resets machineId and sets status to available', async () => {
    mockPrisma.license.findUnique.mockResolvedValue({ status: 'active', key: 'KEY' });
    mockPrisma.license.update.mockResolvedValue({});
    await service.deactivate({ licenseKey: 'KEY' });
    expect(mockPrisma.license.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ machineId: null, status: 'available' }),
      }),
    );
  });
});
