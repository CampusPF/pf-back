import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { CategoriesModule } from './categories/categories.module';
import { CoursesModule } from './courses/courses.module';
import { CourseModulesModule } from './course-modules/course-modules.module';
import { LessonsModule } from './lessons/lessons.module';
import { LessonProgressModule } from './lesson-progress/lesson-progress.module';
import { CourseEnrollmentsModule } from './course-enrollments/course-enrollments.module';
import { AuthModule } from './auth/auth.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { AiTutorModule } from './aiTutor/aiTutor.module';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { RequestLoggerMiddleware } from './common/middleware/request-logger.middleware';
import { envValidationSchema } from './config/env.validation';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { UserOrIpThrottlerGuard } from './common/guards/user-or-ip-throttler.guard';
import { HealthModule } from './health/health.module';



@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      // Falla rápido en el arranque si falta o está mal una env var crítica.
      // @nestjs/config v12 valida vía Standard Schema; Joi 18 lo implementa
      // y reporta todos los errores de golpe, no solo el primero.
      validationSchema: envValidationSchema,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get('DB_USERNAME'),
        password: config.get('DB_PASSWORD'),
        database: config.get('DB_NAME'),
        // Bases gestionadas (Railway/Render/Neon) exigen TLS.
        ssl: config.get<boolean>('DB_SSL')
          ? { rejectUnauthorized: false }
          : false,
        autoLoadEntities: true,
        // NUNCA synchronize en producción: puede borrar columnas/tablas al
        // detectar drift. En prod mandan las migraciones (npm run migration:run).
        synchronize: config.get<string>('NODE_ENV') !== 'production',
      }),
    }),
    // Rate limiting global. El ttl va en milisegundos desde throttler v5,
    // por eso el * 1000 sobre THROTTLE_TTL (que se configura en segundos).
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'default',
            ttl: (config.get<number>('THROTTLE_TTL') ?? 60) * 1000,
            limit: config.get<number>('THROTTLE_LIMIT') ?? 100,
          },
        ],
      }),
    }),
    HealthModule,
    UsersModule,
    CategoriesModule,
    CoursesModule,
    CourseModulesModule,
    LessonsModule,
    CourseEnrollmentsModule,
    LessonProgressModule,
    AuthModule,
    SubscriptionsModule,
    AiTutorModule
  ],
  controllers: [AppController],
  providers: [
    AppService,

    // --- Guards globales ---
    // El ORDEN de este array es el orden de ejecución.
    //
    // 1) JwtAuthGuard primero: toda ruta exige JWT salvo las marcadas
    //    @Public(). Para una ruta pública devuelve true de inmediato (no toca
    //    la DB), así que va barato. Su efecto útil acá es dejar `request.user`
    //    disponible para el guard siguiente.
    // 2) UserOrIpThrottlerGuard segundo: necesita `request.user` para poder
    //    contar por usuario en vez de por IP. En las rutas públicas (login,
    //    register) no hay usuario y cae al conteo por IP, que es justo lo que
    //    frena la fuerza bruta.
    // 3) RolesGuard último: solo tiene sentido una vez que ya sabemos quién es
    //    el usuario.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: UserOrIpThrottlerGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}