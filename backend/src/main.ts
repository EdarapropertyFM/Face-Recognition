// MUST be first: populates process.env before app.module.ts is imported and
// TypeOrmModule.forRoot() reads the database settings. See load-env.ts.
import './config/load-env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { validateEnvironment } from './config/validate-environment';
import { isAllowedOrigin, parseFrontendOrigins } from './config/cors-origin';

validateEnvironment();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '3mb' }));
  app.use(urlencoded({ extended: true, limit: '3mb' }));
  app.setGlobalPrefix('api');

  // Enable CORS for frontend
  const configuredOrigins = parseFrontendOrigins(process.env.FRONTEND_ORIGINS);
  const isProduction = process.env.NODE_ENV === 'production';
  app.enableCors({
    origin: (origin, callback) => {
      // Never hand the callback an Error: express-cors turns that into an
      // opaque 500, which looks like a server fault instead of a blocked
      // origin. `false` produces a normal response the browser blocks, and
      // the reason is logged here once.
      const allowed = isAllowedOrigin(origin, configuredOrigins, isProduction);
      if (!allowed) {
        Logger.warn(`Blocked cross-origin request from ${origin}. `
          + 'Add it to FRONTEND_ORIGINS if this is expected.', 'CORS');
      }
      callback(null, allowed);
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
