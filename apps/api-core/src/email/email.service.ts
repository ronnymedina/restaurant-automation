import { Inject, Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { type ConfigType } from '@nestjs/config';

import { emailConfig } from './email.config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null = null;

  constructor(
    @Inject(emailConfig.KEY)
    private readonly configService: ConfigType<typeof emailConfig>,
  ) {
    if (this.configService.resendApiKey) {
      this.resend = new Resend(this.configService.resendApiKey);
    } else {
      this.logger.warn(
        'RESEND_API_KEY not configured. Emails will not be sent.',
      );
    }
  }

  async sendActivationEmail(email: string, token: string): Promise<boolean> {
    const activationUrl = `${this.configService.frontendUrl}/activate?token=${token}`;

    if (!this.resend) {
      this.logger.warn(`[DEV] Activation email for ${email}: ${activationUrl}`);
      return true;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.configService.emailFrom,
        to: email,
        subject: 'Activa tu cuenta',
        html: this.buildActivationHtml(activationUrl),
      });

      if (error) {
        this.logger.error(`Resend API error for ${email}: ${error.message}`);
        return false;
      }

      this.logger.log(`Activation email sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send activation email to ${email}`, error);
      return false;
    }
  }

  async sendReceiptEmail(
    email: string,
    receipt: {
      restaurantName: string;
      orderNumber: number;
      date: string;
      items: Array<{
        productName: string;
        quantity: number;
        unitPrice: number;
        subtotal: number;
        notes?: string;
      }>;
      totalAmount: number;
      paymentMethod: string;
    },
  ): Promise<boolean> {
    if (!this.resend) {
      this.logger.warn(
        `[DEV] Receipt email for ${email}: Order #${receipt.orderNumber} - $${receipt.totalAmount}`,
      );
      return true;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.configService.emailFrom,
        to: email,
        subject: `Recibo - Pedido #${receipt.orderNumber} - ${receipt.restaurantName}`,
        html: this.buildReceiptHtml(receipt),
      });

      if (error) {
        this.logger.error(
          `Resend API error for receipt ${email}: ${error.message}`,
        );
        return false;
      }

      this.logger.log(`Receipt email sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send receipt email to ${email}`, error);
      return false;
    }
  }

  private buildReceiptHtml(receipt: {
    restaurantName: string;
    orderNumber: number;
    date: string;
    items: Array<{
      productName: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      notes?: string;
    }>;
    totalAmount: number;
    paymentMethod: string;
  }): string {
    const itemsHtml = receipt.items
      .map(
        (item) => `
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${item.productName}${item.notes ? `<br><small style="color: #999;">${item.notes}</small>` : ''}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">$${item.unitPrice.toFixed(2)}</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">$${item.subtotal.toFixed(2)}</td>
        </tr>`,
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 40px 20px; background-color: #f5f5f5;">
        <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h1 style="margin: 0 0 4px; font-size: 24px; color: #111;">${receipt.restaurantName}</h1>
          <p style="color: #999; margin: 0 0 24px; font-size: 14px;">Pedido #${receipt.orderNumber} - ${new Date(receipt.date).toLocaleString()}</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <thead>
              <tr style="border-bottom: 2px solid #111;">
                <th style="text-align: left; padding: 8px 0;">Producto</th>
                <th style="text-align: center; padding: 8px 0;">Cant.</th>
                <th style="text-align: right; padding: 8px 0;">Precio</th>
                <th style="text-align: right; padding: 8px 0;">Subtotal</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          <div style="margin-top: 16px; padding-top: 16px; border-top: 2px solid #111; text-align: right;">
            <strong style="font-size: 18px;">Total: $${receipt.totalAmount.toFixed(2)}</strong>
          </div>
          <p style="color: #999; font-size: 13px; margin: 16px 0 0;">Método de pago: ${receipt.paymentMethod}</p>
        </div>
      </body>
      </html>
    `;
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
