import { registerAs } from '@nestjs/config';
import { RESEND_API_KEY, EMAIL_FROM, FRONTEND_URL } from '../config';

export const emailConfig = registerAs('email', () => ({
  resendApiKey: RESEND_API_KEY,
  emailFrom: EMAIL_FROM,
  frontendUrl: FRONTEND_URL,
}));
