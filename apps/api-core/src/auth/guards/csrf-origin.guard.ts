import {
  CanActivate, ExecutionContext, Injectable, Inject,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { Request } from 'express';

import { csrfConfig } from '../csrf.config';
import { OriginRequiredException, OriginNotAllowedException } from '../exceptions/auth.exceptions';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  private readonly allowed: Set<string>;

  constructor(
    @Inject(csrfConfig.KEY)
    cfg: ConfigType<typeof csrfConfig>,
  ) {
    this.allowed = new Set(cfg.corsAllowedOrigins);
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;

    const origin = this.resolveOrigin(req);
    if (!origin) throw new OriginRequiredException();
    if (!this.allowed.has(origin)) {
      throw new OriginNotAllowedException();
    }
    return true;
  }

  private resolveOrigin(req: Request): string | null {
    const headerOrigin = req.headers.origin;
    if (typeof headerOrigin === 'string' && headerOrigin.length > 0) return headerOrigin;
    const referer = req.headers.referer;
    if (typeof referer !== 'string') return null;
    try { return new URL(referer).origin; } catch { return null; }
  }
}
