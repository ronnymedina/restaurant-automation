import { Command, CommandRunner, Option } from 'nest-commander';
import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { UsersService } from '../../users/users.service';
import { EmailService } from '../../email/email.service';

const EMAIL_TIMEOUT_MS = 10_000;

@Command({
  name: 'resend-activation',
  description: 'Resend activation emails to all inactive users (generates a new token for each)',
})
export class ResendActivationCommand extends CommandRunner {
  private readonly logger = new Logger(ResendActivationCommand.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
  ) {
    super();
  }

  async run(_passedParams: string[], options: { dryRun?: boolean }): Promise<void> {
    const dryRun = options.dryRun ?? false;

    if (dryRun) {
      this.logger.log('[DRY RUN] No emails will be sent and no tokens will be updated');
    }

    const users = await this.usersService.findInactiveUsers();

    if (users.length === 0) {
      this.logger.log('No inactive users found');
      return;
    }

    this.logger.log(`Found ${users.length} inactive user(s)`);

    let sent = 0;
    let failed = 0;

    for (const user of users) {
      const token = randomUUID();
      this.logger.log(`Processing ${user.email} (id: ${user.id})`);

      if (dryRun) {
        this.logger.log(`  [DRY RUN] Would generate token and send email to ${user.email}`);
        continue;
      }

      try {
        await this.usersService.refreshActivationToken(user.id, token);
        const ok = await this.emailService.sendActivationEmail(user.email, token, EMAIL_TIMEOUT_MS);
        if (ok) {
          this.logger.log(`  ✓ Email sent to ${user.email}`);
          sent++;
        } else {
          this.logger.warn(`  ✗ Email could not be sent to ${user.email}`);
          failed++;
        }
      } catch (error) {
        this.logger.error(`  ✗ Error processing ${user.email}`, error);
        failed++;
      }
    }

    if (!dryRun) {
      this.logger.log(`Done — sent: ${sent}, failed: ${failed}`);
    }
  }

  @Option({
    flags: '--dry-run',
    description: 'List affected users without sending emails or updating tokens',
  })
  parseDryRun(): boolean {
    return true;
  }
}
