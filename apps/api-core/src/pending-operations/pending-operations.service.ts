import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PendingOperationType, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { PendingOperationRepository } from './pending-operation.repository';
import { UserRepository } from '../users/user.repository';
import { EmailService } from '../email/email.service';
import { FRONTEND_URL } from '../config';
import {
  EmailAlreadyExistsException,
  InvalidRoleException,
} from '../users/exceptions/users.exceptions';
import { EntityNotFoundException } from '../common/exceptions';
import { userConfig } from '../users/users.config';
import { Inject } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';

const TTL_MINUTES = 15;

@Injectable()
export class PendingOperationsService {
  private readonly logger = new Logger(PendingOperationsService.name);

  constructor(
    private readonly repo: PendingOperationRepository,
    private readonly userRepository: UserRepository,
    private readonly emailService: EmailService,
    @Inject(userConfig.KEY)
    private readonly configService: ConfigType<typeof userConfig>,
  ) {}

  async requestCreateUser(
    adminEmail: string,
    restaurantId: string,
    payload: { email: string; password: string; role: Role },
  ) {
    const existing = await this.userRepository.findByEmail(payload.email);
    if (existing) throw new EmailAlreadyExistsException(payload.email);
    if (payload.role === Role.ADMIN) throw new InvalidRoleException(payload.role);

    const passwordHash = await bcrypt.hash(payload.password, this.configService.bcryptSaltRounds);

    const op = await this.repo.create({
      type: PendingOperationType.CREATE_USER,
      payload: JSON.stringify({ email: payload.email, passwordHash, role: payload.role, restaurantId }),
      adminEmail,
      restaurantId,
      expiresAt: this.expiresAt(),
    });

    await this.emailService.sendOperationConfirmationEmail(adminEmail, {
      type: 'CREATE_USER',
      description: `Crear usuario ${payload.email} con rol ${payload.role}`,
      confirmUrl: `${FRONTEND_URL}/confirm-operation?token=${op.token}`,
    });

    this.logger.log(`Pending CREATE_USER requested by ${adminEmail} for ${payload.email}`);
    return { pending: true, message: 'Revisa tu correo para confirmar la operación' };
  }

  async requestDeleteUser(
    adminEmail: string,
    restaurantId: string,
    userId: string,
  ) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new EntityNotFoundException('User', userId);
    if (user.restaurantId !== restaurantId) throw new BadRequestException('Acceso denegado');

    const op = await this.repo.create({
      type: PendingOperationType.DELETE_USER,
      payload: JSON.stringify({ userId }),
      adminEmail,
      restaurantId,
      expiresAt: this.expiresAt(),
    });

    await this.emailService.sendOperationConfirmationEmail(adminEmail, {
      type: 'DELETE_USER',
      description: `Eliminar usuario ${user.email}`,
      confirmUrl: `${FRONTEND_URL}/confirm-operation?token=${op.token}`,
    });

    this.logger.log(`Pending DELETE_USER requested by ${adminEmail} for user ${userId}`);
    return { pending: true, message: 'Revisa tu correo para confirmar la operación' };
  }

  async requestUpdateUserRole(
    adminEmail: string,
    restaurantId: string,
    userId: string,
    newRole: Role,
  ) {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new EntityNotFoundException('User', userId);
    if (user.restaurantId !== restaurantId) throw new BadRequestException('Acceso denegado');
    if (newRole === Role.ADMIN) throw new InvalidRoleException(newRole);

    const op = await this.repo.create({
      type: PendingOperationType.UPDATE_USER_ROLE,
      payload: JSON.stringify({ userId, role: newRole }),
      adminEmail,
      restaurantId,
      expiresAt: this.expiresAt(),
    });

    await this.emailService.sendOperationConfirmationEmail(adminEmail, {
      type: 'UPDATE_USER_ROLE',
      description: `Cambiar rol de ${user.email} a ${newRole}`,
      confirmUrl: `${FRONTEND_URL}/confirm-operation?token=${op.token}`,
    });

    this.logger.log(`Pending UPDATE_USER_ROLE requested by ${adminEmail} for user ${userId}`);
    return { pending: true, message: 'Revisa tu correo para confirmar la operación' };
  }

  async confirmOperation(token: string) {
    const op = await this.repo.findByToken(token);

    if (!op) throw new BadRequestException('Token inválido o no encontrado');
    if (op.confirmedAt) throw new BadRequestException('Esta operación ya fue confirmada');
    if (op.expiresAt < new Date()) throw new BadRequestException('El token ha expirado');

    const payload = JSON.parse(op.payload);

    if (op.type === PendingOperationType.CREATE_USER) {
      await this.userRepository.create({
        email: payload.email,
        passwordHash: payload.passwordHash,
        role: payload.role,
        isActive: true,
        restaurantId: payload.restaurantId,
      });
      this.logger.log(`Confirmed CREATE_USER for ${payload.email}`);
    } else if (op.type === PendingOperationType.DELETE_USER) {
      await this.userRepository.delete(payload.userId);
      this.logger.log(`Confirmed DELETE_USER for userId ${payload.userId}`);
    } else if (op.type === PendingOperationType.UPDATE_USER_ROLE) {
      await this.userRepository.update(payload.userId, { role: payload.role });
      this.logger.log(`Confirmed UPDATE_USER_ROLE for userId ${payload.userId} to ${payload.role}`);
    }

    await this.repo.markConfirmed(op.id);
    return { success: true, message: 'Operación confirmada exitosamente' };
  }

  private expiresAt(): Date {
    const d = new Date();
    d.setMinutes(d.getMinutes() + TTL_MINUTES);
    return d;
  }
}
