import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);


  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true, // necesario si en algún momento usás cookies (ej. httpOnly para el JWT)
  });


  const config = new DocumentBuilder()
    .setTitle('Campus Lite API')
    .setDescription('Documentación de la API de Campus Lite')
    .setVersion('1.0')
    .addBearerAuth() // 👈 habilita el botón "Authorize" para probar rutas con JWT
    .build();

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document); // disponible en /api
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
