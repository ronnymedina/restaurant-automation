import {
  Controller,
  Post,
  Put,
  Param,
  Body,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { UploadsService } from './uploads.service';
import { PresignUploadDto } from './dto/presign-upload.dto';

@ApiTags('uploads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ version: '1', path: 'uploads' })
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('image')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (/^image\/(jpeg|png|webp)$/.test(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Solo se permiten imágenes JPG, PNG o WEBP'), false);
        }
      },
    }),
  )
  async uploadImage(@UploadedFile() file: Express.Multer.File): Promise<{ url: string }> {
    if (!file) {
      throw new BadRequestException('Debes subir un archivo de imagen');
    }
    const url = await this.uploadsService.saveProductImage(file);
    return { url };
  }

  @Post('presign')
  @Roles(Role.ADMIN, Role.MANAGER)
  @ApiOperation({ summary: 'Generate a presigned upload URL for a product image' })
  async presign(
    @CurrentUser() user: { restaurantId: string },
    @Body() dto: PresignUploadDto,
  ): Promise<{ presignedUrl: string; publicUrl: string }> {
    return this.uploadsService.getPresignedUpload(user.restaurantId, dto.mimetype);
  }

  @Put('local-put/:token')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Accept binary image upload in local/Electron mode (token-authenticated)' })
  async localPut(
    @Param('token') token: string,
    @Body() body: Buffer,
    @Headers('content-type') _contentType: string,
  ): Promise<void> {
    await this.uploadsService.saveLocalPut(token, body);
  }
}
