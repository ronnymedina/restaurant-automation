import {
  Injectable,
  NotFoundException,
  ConflictException,
  GoneException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma.service';
import { GenerateLicenseDto } from './dto/generate-license.dto';
import { ActivateLicenseDto } from './dto/activate-license.dto';
import { DeactivateLicenseDto } from './dto/deactivate-license.dto';
import { RSA_PRIVATE_KEY } from '../config';

@Injectable()
export class LicensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async generate(dto: GenerateLicenseDto) {
    const key = this.generateKey();
    const license = await this.prisma.license.create({
      data: {
        key,
        mode: dto.mode ?? 'desktop',
        status: 'available',
      },
    });
    return { key: license.key, mode: license.mode, status: license.status };
  }

  async activate(dto: ActivateLicenseDto) {
    const license = await this.prisma.license.findUnique({
      where: { key: dto.licenseKey },
    });

    if (!license) throw new NotFoundException('License key not found');
    if (license.status === 'revoked') throw new GoneException('License revoked');
    if (license.machineId && license.machineId !== dto.machineId) {
      throw new ConflictException('License already in use on another machine');
    }

    const updatedLicense = await this.prisma.license.update({
      where: { key: dto.licenseKey },
      data: {
        machineId: dto.machineId,
        platform: dto.platform,
        status: 'active',
        activatedAt: new Date(),
      },
    });

    const token = this.jwt.sign(
      {
        licenseKey: dto.licenseKey,
        machineId: dto.machineId,
        platform: dto.platform,
        activatedAt: updatedLicense.activatedAt!.toISOString(),
      },
      {
        algorithm: 'RS256',
        privateKey: RSA_PRIVATE_KEY,
        expiresIn: '100y',
      },
    );

    return { token };
  }

  async deactivate(dto: DeactivateLicenseDto) {
    const license = await this.prisma.license.findUnique({
      where: { key: dto.licenseKey },
    });
    if (!license) throw new NotFoundException('License key not found');

    await this.prisma.license.update({
      where: { key: dto.licenseKey },
      data: { machineId: null, status: 'available', activatedAt: null },
    });
    return { message: 'Deactivated — machine slot freed' };
  }

  async getStatus(key: string) {
    const license = await this.prisma.license.findUnique({ where: { key } });
    if (!license) throw new NotFoundException('License key not found');
    return {
      key: license.key,
      status: license.status,
      platform: license.platform,
      mode: license.mode,
      activatedAt: license.activatedAt,
    };
  }

  private generateKey(): string {
    const segment = () => randomBytes(2).toString('hex').toUpperCase();
    return `${segment()}-${segment()}-${segment()}-${segment()}`;
  }
}
