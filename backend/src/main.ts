// MUST be first: populates process.env before app.module.ts is imported and
// TypeOrmModule.forRoot() reads the database settings. See load-env.ts.
import './config/load-env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { validateEnvironment } from './config/validate-environment';

validateEnvironment();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '3mb' }));
  app.use(urlencoded({ extended: true, limit: '3mb' }));
  app.setGlobalPrefix('api');

  // Enable CORS for frontend
  const configuredOrigins = new Set((process.env.FRONTEND_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean));
  app.enableCors({
    origin: (origin, callback) => {
      // Mobile enrollment is opened from the machine's LAN address, while
      // local development may use localhost or 127.0.0.1.
      if (!origin || configuredOrigins.has(origin) || /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Origin not allowed by CORS'));
      }
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Swagger API Docs Setup
  const config = new DocumentBuilder()
    .setTitle('STMC API')
    .setDescription('Security Tracking Management Community API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
    
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger UI is running on: http://localhost:${port}/api`);
}
bootstrap();
