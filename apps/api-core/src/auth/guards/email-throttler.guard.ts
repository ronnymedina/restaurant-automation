import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class EmailThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const body = req['body'] as { email?: string } | undefined;
    return body?.email ?? (req['ip'] as string) ?? 'unknown';
  }
}
