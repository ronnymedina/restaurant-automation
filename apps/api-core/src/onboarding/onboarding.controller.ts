import {
  Controller,
  Post,
  Body,
  UploadedFiles,
  UseInterceptors,
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

@ApiTags('Onboarding')
@Controller('onboarding')
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
          description: 'Fotos del menú para extraer productos (máximo 10)',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Restaurante registrado exitosamente',
  })
  @UseInterceptors(FilesInterceptor('photos', 10))
  async register(
    @Body() body: OnboardingRegisterDto,
    @UploadedFiles() files?: Express.Multer.File[],
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
