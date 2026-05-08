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
      this.logger.warn(
        `[DEV] RESEND_API_KEY not set — email NOT sent. Activation URL for ${email}: ${activationUrl}`,
      );
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

  async sendPasswordResetEmail(email: string, token: string): Promise<boolean> {
    const resetUrl = `${this.configService.frontendUrl}/reset-password?token=${token}`;

    if (!this.resend) {
      this.logger.warn(
        `[DEV] RESEND_API_KEY not set — email NOT sent. Reset URL for ${email}: ${resetUrl}`,
      );
      return true;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.configService.emailFrom,
        to: email,
        subject: 'Restablece tu contraseña',
        html: this.buildPasswordResetHtml(resetUrl),
      });

      if (error) {
        this.logger.error(`Resend API error for ${email}: ${error.message}`);
        return false;
      }

      this.logger.log(`Password reset email sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${email}`, error);
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

  async sendOperationConfirmationEmail(
    adminEmail: string,
    op: { type: string; description: string; confirmUrl: string },
  ): Promise<boolean> {
    if (!this.resend) {
      this.logger.warn(`[DEV] Confirm operation email for ${adminEmail}: ${op.confirmUrl}`);
      return true;
    }

    try {
      const { error } = await this.resend.emails.send({
        from: this.configService.emailFrom,
        to: adminEmail,
        subject: `Confirma la operación: ${op.description}`,
        html: this.buildConfirmationHtml(op),
      });

      if (error) {
        this.logger.error(`Resend API error for confirmation email ${adminEmail}: ${error.message}`);
        return false;
      }

      this.logger.log(`Operation confirmation email sent to ${adminEmail}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send confirmation email to ${adminEmail}`, error);
      return false;
    }
  }

  private buildConfirmationHtml(op: { type: string; description: string; confirmUrl: string }): string {
    return `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 40px 20px; background-color: #f5f5f5;">
        <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <h1 style="margin: 0 0 16px; font-size: 24px; color: #111;">Confirmación requerida</h1>
          <p style="color: #555; line-height: 1.6; margin: 0 0 8px;">
            Se ha solicitado la siguiente operación en tu cuenta:
          </p>
          <div style="background: #f8f9fa; border-left: 4px solid #e53e3e; padding: 12px 16px; border-radius: 4px; margin: 0 0 24px;">
            <p style="margin: 0; font-weight: 600; color: #111;">${op.description}</p>
          </div>
          <p style="color: #555; line-height: 1.6; margin: 0 0 24px;">
            Haz clic en el botón para confirmar. El enlace expira en <strong>15 minutos</strong>.
          </p>
          <a href="${op.confirmUrl}" style="display: inline-block; background-color: #e53e3e; color: white; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: 500;">
            Confirmar operación
          </a>
          <p style="color: #999; font-size: 13px; margin: 24px 0 0; line-height: 1.5;">
            Si no solicitaste esta acción, ignora este correo. La operación se cancelará automáticamente.
          </p>
        </div>
      </body>
      </html>
    `;
  }

  private buildActivationHtml(activationUrl: string): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Activá tu cuenta — DaikuLab</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <div style="display:none;max-height:0;overflow:hidden;">Tu restaurante ya tiene un lugar. Activá tu cuenta para empezar.</div>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F4F5;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:10px;overflow:hidden;border:1px solid #E4E4E7;">

          <!-- Top orange bar -->
          <tr>
            <td style="background-color:#F47C20;height:3px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- Logo -->
          <tr>
            <td style="padding:32px 40px 24px;">
              <span style="font-size:20px;font-weight:400;color:#111111;letter-spacing:-0.3px;">Daiku<strong>Lab</strong></span>
              <span style="display:block;font-size:9px;font-weight:600;letter-spacing:2px;color:#A1A1AA;text-transform:uppercase;margin-top:2px;">Para Restaurantes</span>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="padding:0 40px;"><div style="height:1px;background-color:#E4E4E7;"></div></td></tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px 28px;">
              <h1 style="margin:0 0 14px;font-size:24px;font-weight:700;color:#111111;line-height:1.25;letter-spacing:-0.4px;">
                ¡Bienvenido a DaikuLab!
              </h1>
              <p style="margin:0 0 10px;font-size:15px;color:#52525B;line-height:1.65;">
                Tu cuenta está casi lista. Hacé clic en el botón para activarla y establecer tu contraseña.
              </p>
              <p style="margin:0 0 28px;font-size:15px;color:#52525B;line-height:1.65;">
                Desde ahí vas a poder gestionar pedidos, cocina, inventario y caja — todo en un solo sistema.
              </p>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius:7px;background-color:#F47C20;">
                    <a href="${activationUrl}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:7px;">
                      Activar cuenta
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:20px 0 0;font-size:13px;color:#A1A1AA;line-height:1.5;">
                Si no creaste esta cuenta, podés ignorar este correo.
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="padding:0 40px;"><div style="height:1px;background-color:#E4E4E7;"></div></td></tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;">
              <p style="margin:0;font-size:12px;color:#A1A1AA;">
                DaikuLab &nbsp;·&nbsp;
                <a href="${this.configService.frontendUrl}" style="color:#F47C20;text-decoration:none;">daikulab.com</a>
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;
  }

  private buildPasswordResetHtml(resetUrl: string): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Restablece tu contraseña — DaikuLab</title>
</head>
<body style="margin:0;padding:0;background-color:#F4F4F5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <div style="display:none;max-height:0;overflow:hidden;">Solicitud de restablecimiento de contraseña.</div>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F4F5;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:10px;overflow:hidden;border:1px solid #E4E4E7;">

          <tr>
            <td style="background-color:#F47C20;height:3px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <tr>
            <td style="padding:32px 40px 24px;">
              <span style="font-size:20px;font-weight:400;color:#111111;letter-spacing:-0.3px;">Daiku<strong>Lab</strong></span>
              <span style="display:block;font-size:9px;font-weight:600;letter-spacing:2px;color:#A1A1AA;text-transform:uppercase;margin-top:2px;">Para Restaurantes</span>
            </td>
          </tr>

          <tr><td style="padding:0 40px;"><div style="height:1px;background-color:#E4E4E7;"></div></td></tr>

          <tr>
            <td style="padding:36px 40px 28px;">
              <h1 style="margin:0 0 14px;font-size:24px;font-weight:700;color:#111111;line-height:1.25;letter-spacing:-0.4px;">
                Restablece tu contraseña
              </h1>
              <p style="margin:0 0 10px;font-size:15px;color:#52525B;line-height:1.65;">
                Recibimos una solicitud para restablecer la contraseña de tu cuenta.
              </p>
              <p style="margin:0 0 28px;font-size:15px;color:#52525B;line-height:1.65;">
                Hacé clic en el botón para crear una nueva contraseña.
              </p>

              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-radius:7px;background-color:#F47C20;">
                    <a href="${resetUrl}" style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:7px;">
                      Restablecer contraseña
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:20px 0 0;font-size:13px;color:#A1A1AA;line-height:1.5;">
                Si no solicitaste este cambio, podés ignorar este correo.
              </p>
            </td>
          </tr>

          <tr><td style="padding:0 40px;"><div style="height:1px;background-color:#E4E4E7;"></div></td></tr>

          <tr>
            <td style="padding:20px 40px;">
              <p style="margin:0;font-size:12px;color:#A1A1AA;">
                DaikuLab &nbsp;·&nbsp;
                <a href="${this.configService.frontendUrl}" style="color:#F47C20;text-decoration:none;">daikulab.com</a>
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>`;
  }
}
