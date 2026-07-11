import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PrismaService } from '../../prisma/prisma.service';
import { EntityNotFoundException } from '../exceptions';

export const RESOURCE_MODEL_KEY = 'resourceModel';

export const ResourceGuard = (model: string) =>
  (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    Reflect.defineMetadata(RESOURCE_MODEL_KEY, model, descriptor?.value ?? target);
    return descriptor ?? target;
  };

@Injectable()
export class RestaurantResourceGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const model = this.reflector.get<string>(RESOURCE_MODEL_KEY, context.getHandler());
    if (!model) return true;

    const request = context.switchToHttp().getRequest<{ params: Record<string, string>; user: { restaurantId: string } }>();
    const id = request.params.id;
    const { restaurantId } = request.user;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resource = await (this.prisma as any)[model].findFirst({
      where: { id, restaurantId },
    });

    if (!resource) throw new EntityNotFoundException(model, id);
    return true;
  }
}
