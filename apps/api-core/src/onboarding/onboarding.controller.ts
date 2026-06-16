import {
  Controller,
  Get,
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
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { OnboardingService } from './onboarding.service';
import { OnboardingRegisterDto, OnboardingRegisterSwaggerDto } from './dto';
import { MAX_FILE_SIZE } from '../config';
import { OnboardingResponseSerializer } from './serializers/onboarding-response.serializer';
import { LATAM_COUNTRIES } from './data/latam-countries';
import { CountryOptionSerializer } from './serializers/country-option.serializer';

@ApiTags('Onboarding')
@Controller({ version: '1', path: 'onboarding' })
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Public()
  @Get('countries')
  @ApiOperation({
    summary: 'Listar países soportados (LatAm)',
    description: 'Lista curada de países con su moneda y separador decimal por defecto, para el wizard de onboarding.',
  })
  @ApiResponse({ status: 200, description: 'Lista de países', type: CountryOptionSerializer, isArray: true })
  getCountries(): CountryOptionSerializer[] {
    return [...LATAM_COUNTRIES]
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      .map((c) => ({
        code: c.code,
        name: c.name,
        currency: c.currency,
        defaultDecimalSeparator: c.decimalSeparator,
      }));
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 900_000, limit: 5 } })
  @Post('register')
  @ApiOperation({
    summary: 'Registrar un nuevo restaurante',
    description:
      'Crea un restaurante y opcionalmente extrae productos desde una foto de menú usando IA. El email de activación se envía inmediatamente tras crear las entidades core, antes del procesamiento de productos.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: OnboardingRegisterSwaggerDto })
  @ApiResponse({ status: 201, description: 'Restaurante registrado exitosamente', type: OnboardingResponseSerializer })
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
  ): Promise<OnboardingResponseSerializer> {
    const photo = file ? { buffer: file.buffer, mimeType: file.mimetype } : undefined;

    const result = await this.onboardingService.registerRestaurant({
      email: body.email,
      restaurantName: body.restaurantName,
      timezone: body.timezone,
      createDemoData: body.createDemoData,
      photo,
    });

    return { productsCreated: result.productsCreated, productsWarning: result.productsWarning };
  }
}
