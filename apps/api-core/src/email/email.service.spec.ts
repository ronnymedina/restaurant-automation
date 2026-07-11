import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from './email.service';
import { emailConfig } from './email.config';

const mockEmailsSend = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockEmailsSend },
  })),
}));

const mockConfig = {
  resendApiKey: 're_test_key',
  emailFrom: 'noreply@test.com',
  frontendUrl: 'http://localhost:4321',
};

describe('EmailService', () => {
  let service: EmailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailService,
        { provide: emailConfig.KEY, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<EmailService>(EmailService);
    jest.clearAllMocks();
  });

  describe('sendActivationEmail', () => {
    it('returns true without calling Resend when no API key is configured', async () => {
      const module = await Test.createTestingModule({
        providers: [
          EmailService,
          { provide: emailConfig.KEY, useValue: { ...mockConfig, resendApiKey: null } },
        ],
      }).compile();
      const noKeyService = module.get<EmailService>(EmailService);

      const result = await noKeyService.sendActivationEmail('user@test.com', 'token', 5000);

      expect(result).toBe(true);
      expect(mockEmailsSend).not.toHaveBeenCalled();
    });

    it('returns true on successful send', async () => {
      mockEmailsSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });

      const result = await service.sendActivationEmail('user@test.com', 'token', 5000);

      expect(result).toBe(true);
      expect(mockEmailsSend).toHaveBeenCalledTimes(1);
    });

    it('returns false when Resend API returns an error object', async () => {
      mockEmailsSend.mockResolvedValue({ data: null, error: { message: 'Invalid recipient' } });

      const result = await service.sendActivationEmail('user@test.com', 'token', 5000);

      expect(result).toBe(false);
      expect(mockEmailsSend).toHaveBeenCalledTimes(1);
    });

    it('retries up to 2 times on network failure and succeeds on the third attempt', async () => {
      mockEmailsSend
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({ data: { id: 'email-1' }, error: null });

      const result = await service.sendActivationEmail('user@test.com', 'token', 5000);

      expect(result).toBe(true);
      expect(mockEmailsSend).toHaveBeenCalledTimes(3);
    }, 10000);

    it('returns false after exhausting all retries (initial + 2 retries = 3 total calls)', async () => {
      mockEmailsSend.mockRejectedValue(new Error('Persistent error'));

      const result = await service.sendActivationEmail('user@test.com', 'token', 5000);

      expect(result).toBe(false);
      expect(mockEmailsSend).toHaveBeenCalledTimes(3);
    }, 10000);

    it('returns false when the send exceeds the timeout on every attempt', async () => {
      // Never resolves — RxJS timeout operator will fire after timeoutMs
      mockEmailsSend.mockImplementation(() => new Promise(() => {}));

      const result = await service.sendActivationEmail('user@test.com', 'token', 50);

      expect(result).toBe(false);
    }, 10000);
  });

  describe('isEnabled', () => {
    it('returns true when an API key is configured', () => {
      expect(service.isEnabled()).toBe(true);
    });

    it('returns false when no API key is configured', async () => {
      const module = await Test.createTestingModule({
        providers: [
          EmailService,
          { provide: emailConfig.KEY, useValue: { ...mockConfig, resendApiKey: null } },
        ],
      }).compile();
      const noKeyService = module.get<EmailService>(EmailService);
      expect(noKeyService.isEnabled()).toBe(false);
    });
  });

  describe('buildActivationUrl', () => {
    it('builds the activation URL from the configured frontend URL', () => {
      expect(service.buildActivationUrl('abc')).toBe('http://localhost:4321/activate?token=abc');
    });
  });
});
