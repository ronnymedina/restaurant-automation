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
  ApiProperty,
} from '@nestjs/swagger';
import { OnboardingService } from './onboarding.service';
import { OnboardingRegisterDto, OnboardingRegisterSwaggerDto } from './dto';
import { MAX_FILE_SIZE, MAX_FILES } from '../config';

export class OnboardingResponse {
  @ApiProperty({ description: 'Número de productos creados durante el onboarding', example: 5 })
  productsCreated: number;
}

@ApiTags('Onboarding')
@Controller({ version: '1', path: 'onboarding' })
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Registrar un nuevo restaurante',
    description:
      'Crea un restaurante y opcionalmente extrae productos desde fotos de menú usando IA. El email de activación se envía al finalizar todo el proceso.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: OnboardingRegisterSwaggerDto })
  @ApiResponse({ status: 201, description: 'Restaurante registrado exitosamente', type: OnboardingResponse })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos (email, nombre) o archivo rechazado (tipo no permitido o tamaño excedido)' })
  @ApiResponse({ status: 409, description: 'El email ya está registrado' })
  @ApiResponse({ status: 500, description: 'Error interno durante el onboarding' })
  @UseInterceptors(FilesInterceptor('photos', MAX_FILES))
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
  ): Promise<OnboardingResponse> {
    const photos = files?.map((file) => ({
      buffer: file.buffer,
      mimeType: file.mimetype,
    }));

    const result = await this.onboardingService.registerRestaurant({
      email: body.email,
      restaurantName: body.restaurantName,
      createDemoData: body.createDemoData,
      photos,
    });

    return { productsCreated: result.productsCreated };
  }
}
