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
      'Crea un restaurante + usuario ADMIN + categoría por defecto. El email de activación se envía inmediatamente si hay proveedor configurado; en modo self-hosted (sin RESEND_API_KEY) la respuesta incluye activationUrl para que la UI muestre el link.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: OnboardingRegisterSwaggerDto })
  @ApiResponse({ status: 201, description: 'Restaurante registrado exitosamente', type: OnboardingResponseSerializer })
  @ApiResponse({
    status: 400,
    description: 'Validación de DTO o archivo rechazado. Ver docs/onboarding-error-mapping.md.',
    schema: { example: { message: ['country must be a supported LATAM ISO code'], code: 'VALIDATION_ERROR', statusCode: 400 } },
  })
  @ApiResponse({
    status: 409,
    description: 'El email ya está registrado',
    schema: { example: { message: ["Email 'x@y.com' is already registered"], code: 'EMAIL_ALREADY_EXISTS', statusCode: 409, details: { email: 'x@y.com' } } },
  })
  @ApiResponse({ status: 429, description: 'Demasiadas solicitudes — intente más tarde (rate limit 5/15min)' })
  @ApiResponse({
    status: 500,
    description: 'Error interno durante el onboarding: ONBOARDING_FAILED | RESTAURANT_CREATION_FAILED | USER_CREATION_FAILED | DEFAULT_CATEGORY_CREATION_FAILED',
    schema: { example: { message: ['Failed to create the restaurant'], code: 'RESTAURANT_CREATION_FAILED', statusCode: 500 } },
  })
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
      country: body.country,
      timezone: body.timezone,
      decimalSeparator: body.decimalSeparator,
      createDemoData: body.createDemoData,
      photo,
    });

    return {
      productsCreated: result.productsCreated,
      productsWarning: result.productsWarning,
      activationUrl: result.activationUrl,
    };
  }
}
