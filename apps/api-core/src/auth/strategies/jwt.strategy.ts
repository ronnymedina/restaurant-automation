import { Injectable, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { ConfigType } from '@nestjs/config';
import type { Request } from 'express';

import { authConfig } from '../auth.config';
import { COOKIE_NAMES } from '../cookies/auth-cookies';

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  restaurantId: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(authConfig.KEY)
    private readonly configService: ConfigType<typeof authConfig>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => (req?.cookies?.[COOKIE_NAMES.access] as string | undefined) ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.jwtSecret,
    });
  }

  validate(payload: JwtPayload) {
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      restaurantId: payload.restaurantId,
    };
  }
}
