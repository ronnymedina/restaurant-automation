import {
  Controller,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  FileTypeValidator,
  MaxFileSizeValidator,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ThrottlerGuard, Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiProperty,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { OnboardingService } from './onboarding.service';
import { OnboardingRegisterDto, OnboardingRegisterSwaggerDto } from './dto';
import { MAX_FILE_SIZE } from '../config';

export class OnboardingResponse {
  @ApiProperty({ description: 'Número de productos creados durante el onboarding', example: 5 })
  productsCreated: number;
}

@ApiTags('Onboarding')
@Controller({ version: '1', path: 'onboarding' })
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @Post('register')
  @ApiOperation({
    summary: 'Registrar un nuevo restaurante',
    description:
      'Crea un restaurante y opcionalmente extrae productos desde una foto de menú usando IA. El email de activación se envía al finalizar todo el proceso.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: OnboardingRegisterSwaggerDto })
  @ApiResponse({ status: 201, description: 'Restaurante registrado exitosamente', type: OnboardingResponse })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos o archivo rechazado' })
  @ApiResponse({ status: 409, description: 'El email o nombre de restaurante ya está registrado' })
  @ApiResponse({ status: 429, description: 'Demasiadas solicitudes — intente más tarde' })
  @ApiResponse({ status: 500, description: 'Error interno durante el onboarding' })
  @UseInterceptors(FileInterceptor('photo'))
  async register(
    @Body() body: OnboardingRegisterDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_FILE_SIZE }),
          new FileTypeValidator({ fileType: /(jpeg|jpg|png)$/ }),
        ],
        fileIsRequired: false,
      }),
    )
    file?: Express.Multer.File,
  ): Promise<OnboardingResponse> {
    const photo = file ? { buffer: file.buffer, mimeType: file.mimetype } : undefined;

    const result = await this.onboardingService.registerRestaurant({
      email: body.email,
      restaurantName: body.restaurantName,
      timezone: body.timezone,
      createDemoData: body.createDemoData,
      photo,
    });

    return { productsCreated: result.productsCreated };
  }

}
