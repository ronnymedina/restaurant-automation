import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { NODE_ENV, PORT, FRONTEND_URL } from './config';

const isProduction = NODE_ENV === 'production';
const port = PORT;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  app.enableCors({
    origin: isProduction ? FRONTEND_URL : true,
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
    }),
  );

  // Setup Swagger only in development
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('Restaurant API')
      .setDescription('API para gestión de restaurantes y productos')
      .setVersion('1.0')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen(port);
}
void bootstrap();
