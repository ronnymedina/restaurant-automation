import {
  Controller,
  Post,
  Body,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { OnboardingService, OnboardingResult } from './onboarding.service';
import { OnboardingRegisterDto } from './dto';

@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) { }

  @Post('register')
  @UseInterceptors(FilesInterceptor('photos', 10)) // Max 10 photos
  async register(
    @Body() body: OnboardingRegisterDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<OnboardingResult> {
    // Convert Express.Multer.File[] to our format
    const photos = files?.map((file) => ({
      buffer: file.buffer,
      mimeType: file.mimetype,
    }));

    // Check if skipProducts is a string "true" (form-data sends strings)
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
