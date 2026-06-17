import 'dotenv/config';
import './instrumentation';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { validationExceptionFactory } from './common/validation-exception.factory';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import * as express from 'express';
import { NODE_ENV, PORT, FRONTEND_URL, UPLOADS_PATH, CORS_ORIGIN } from './config';

const isProduction = NODE_ENV === 'production';
const port = PORT;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use('/uploads', express.static(UPLOADS_PATH));

  app.use(helmet());
  app.use(cookieParser());

  app.enableCors({
    origin: CORS_ORIGIN.length > 0 ? CORS_ORIGIN : FRONTEND_URL,
    credentials: true,
  });

  app.enableVersioning({
    type: VersioningType.URI,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      // Contrato de error unificado (ADR 0007): los 400 de validación emiten
      // { message: string[], code: 'VALIDATION_ERROR', statusCode: 400 }.
      exceptionFactory: validationExceptionFactory,
    }),
  );

  // Setup Swagger only in development
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('Restaurant API')
      .setDescription('API para gestión de restaurantes y productos')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(port);
}
void bootstrap();
