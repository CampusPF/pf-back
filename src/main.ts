import { NestFactory, Reflector } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import {
  ClassSerializerInterceptor,
  Logger,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  // rawBody: true → Nest guarda los bytes exactos del body en `req.rawBody`.
  // Lo necesita el webhook de Stripe (POST /payments/webhook): la firma se
  // verifica contra el body CRUDO, no contra el JSON ya parseado.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  const nodeEnv = config.get<string>('NODE_ENV') ?? 'development';
  const isProduction = nodeEnv === 'production';

  // --- Confianza en el reverse proxy (Railway / Render / Nginx) ---
  // Sin esto, req.ip es la IP del proxy (todas las requests parecen venir de
  // la misma) y el rate limiting se vuelve inútil; además req.secure siempre
  // sería false y las cookies `secure` no se enviarían.
  app.set('trust proxy', config.get<number>('TRUST_PROXY') ?? 1);

  // --- Cabeceras de seguridad ---
  // La CSP por defecto de helmet rompe la UI de Swagger (usa scripts/estilos
  // inline). Como Swagger solo se habilita fuera de producción, ahí la
  // desactivamos; en producción va la CSP completa.
  const swaggerEnabled =
    !isProduction || config.get<boolean>('SWAGGER_ENABLED') === true;

  app.use(
    helmet({
      contentSecurityPolicy: swaggerEnabled ? false : undefined,
      // La API se consume desde otro origen (el front): esta cabecera
      // bloquearía la lectura cross-origin de las respuestas.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // --- CORS ---
  // FRONTEND_URL admite varios dominios separados por coma (ej. preview + prod).
  // Con credentials:true el origin NUNCA puede ser '*': el navegador rechaza
  // esa combinación, así que devolvemos el origin exacto de la lista.
  const allowedOrigins = (config.get<string>('FRONTEND_URL') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (isProduction) {
    const invalid = allowedOrigins.filter(
      (origin) => origin === '*' || origin.includes('localhost'),
    );
    if (allowedOrigins.length === 0 || invalid.length > 0) {
      throw new Error(
        `FRONTEND_URL inválida para producción (${allowedOrigins.join(', ') || 'vacía'}). ` +
          'Debe ser una lista de dominios https reales, sin "*" ni localhost.',
      );
    }
  }

  app.enableCors({
    origin: (origin, callback) => {
      // Sin header Origin: requests server-to-server, curl, health checks del
      // hosting. No es un contexto de navegador, no aplica CORS.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true, // necesario si en algún momento usás cookies (ej. httpOnly para el JWT)
  });

  // --- Validación global de DTOs ---
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // descarta propiedades que no estén en el DTO
      forbidNonWhitelisted: true, // y además rechaza la request (anti mass-assignment)
      transform: true, // instancia el DTO y castea tipos primitivos
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Mantiene el shape de error del contrato con el front:
  // { statusCode, message, error }
  app.useGlobalFilters(new AllExceptionsFilter(isProduction));

  // --- Swagger ---
  // En producción queda apagado: expone el contrato completo de la API.
  // Se puede forzar con SWAGGER_ENABLED=true si alguna vez hace falta.
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Campus Lite API')
      .setDescription('Documentación de la API de Campus Lite')
      .setVersion('1.0')
      .addBearerAuth() // 👈 habilita el botón "Authorize" para probar rutas con JWT
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api', app, document); // disponible en /api
    logger.log('Swagger habilitado en /api');
  } else {
    logger.log('Swagger deshabilitado (NODE_ENV=production)');
  }

  const port = config.get<number>('PORT') ?? 4000;
  await app.listen(port);
  logger.log(`API escuchando en el puerto ${port} (NODE_ENV=${nodeEnv})`);
}
bootstrap();
