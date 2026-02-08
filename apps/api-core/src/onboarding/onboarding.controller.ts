import {
  Controller,
  Post,
  Body,
  UploadedFiles,
  UseInterceptors,
  ParseFilePipe,
  FileTypeValidator,
  MaxFileSizeValidator,
} from '@nestjs/common';

import { FilesInterceptor } from '@nestjs/platform-express';

import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { OnboardingService, OnboardingResult } from './onboarding.service';
import { OnboardingRegisterDto } from './dto';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

@ApiTags('Onboarding')
@Controller({ version: '1', path: 'onboarding' })
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) { }

  @Post('register')
  @ApiOperation({
    summary: 'Registrar un nuevo restaurante',
    description:
      'Crea un restaurante y opcionalmente extrae productos desde fotos de menú usando IA',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['restaurantName'],
      properties: {
        restaurantName: {
          type: 'string',
          description: 'Nombre del restaurante',
          example: 'Mi Restaurante',
        },
        skipProducts: {
          type: 'boolean',
          description: 'Si es true, crea 3 productos demo',
          default: false,
        },
        photos: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
          description:
            'Fotos del menú para extraer productos (máximo 3, solo PNG/JPG)',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Restaurante registrado exitosamente',
  })
  @ApiResponse({
    status: 400,
    description: 'Archivo inválido (tipo no soportado o tamaño excedido)',
  })
  @UseInterceptors(FilesInterceptor('photos', 3))
  async register(
    @Body() body: OnboardingRegisterDto,
    @UploadedFiles(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE }),
          new FileTypeValidator({ fileType: /(jpeg|jpg|png)$/ }),
        ],
        fileIsRequired: false,
      }),
    )
    files?: Express.Multer.File[],
  ): Promise<OnboardingResult> {
    const photos = files?.map((file) => ({
      buffer: file.buffer,
      mimeType: file.mimetype,
    }));

    const skipProducts =
      body.skipProducts === true ||
      (body.skipProducts as unknown as string) === 'true';

    return this.onboardingService.registerRestaurant({
      restaurantName: body.restaurantName,
      skipProducts,
      photos,
    });
  }
}
