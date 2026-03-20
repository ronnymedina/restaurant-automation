import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ADMIN_API_KEY } from './config';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (!ADMIN_API_KEY) throw new UnauthorizedException('Admin API key not configured');
    const req = context.switchToHttp().getRequest();
    const key = req.headers['x-admin-key'];
    if (!key || key !== ADMIN_API_KEY) throw new UnauthorizedException();
    return true;
  }
}
