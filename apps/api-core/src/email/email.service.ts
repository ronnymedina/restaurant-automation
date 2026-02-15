import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

import { RESEND_API_KEY, EMAIL_FROM, FRONTEND_URL } from '../config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null = null;

  constructor() {
    if (RESEND_API_KEY) {
      this.resend = new Resend(RESEND_API_KEY);
    } else {
      this.logger.warn(
        'RESEND_API_KEY not configured. Emails will not be sent.',
      );
    }
  }

  async sendActivationEmail(email: string, token: string): Promise<boolean> {
    const activationUrl = `${FRONTEND_URL}/activate?token=${token}`;

    if (!this.resend) {
      this.logger.warn(
        `[DEV] Activation email for ${email}: ${activationUrl}`,
      );
      return true;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: EMAIL_FROM,
        to: email,
        subject: 'Activa tu cuenta',
        html: this.buildActivationHtml(activationUrl),
      });

      if (error) {
        this.logger.error(
          `Resend API error for ${email}: ${error.message}`,
        );
        return false;
      }

      this.logger.log(`Activation email sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send activation email to ${email}`, error);
      return false;
    }
  }

  private buildActivationHtml(activationUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 40px 20px; background-color: #f5f5f5;">
        <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h1 style="margin: 0 0 16px; font-size: 24px; color: #111;">Activa tu cuenta</h1>
          <p style="color: #555; line-height: 1.6; margin: 0 0 24px;">
            Haz clic en el botón para activar tu cuenta y establecer tu contraseña.
          </p>
          <a href="${activationUrl}" style="display: inline-block; background-color: #111; color: white; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 500;">
            Activar cuenta
          </a>
          <p style="color: #999; font-size: 13px; margin: 24px 0 0; line-height: 1.5;">
            Si no solicitaste esta cuenta, puedes ignorar este email.
          </p>
        </div>
      </body>
      </html>
    `;
  }
}
