import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Filtro global de excepciones.
 *
 * Objetivo: que en producción el cliente NUNCA vea stack traces, mensajes de
 * TypeORM/Postgres ni detalles internos. El detalle completo se loguea del
 * lado del servidor; al cliente le llega un mensaje genérico.
 *
 * Mantiene el shape de error del contrato con el front:
 *   { statusCode, message, error }
 * que es el mismo que devuelve Nest por defecto para las HttpException, así
 * que el front no necesita ningún cambio.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(private readonly isProduction: boolean) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // --- Excepciones esperadas (NotFound, Forbidden, Validation, etc.) ---
    // Son mensajes escritos para el usuario, no filtran nada interno.
    // Se devuelven tal cual para no romper el contrato con el front.
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();

      // Los 5xx lanzados a mano igual merecen quedar en el log del servidor.
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logError(request, exception);
      }

      return response
        .status(status)
        .json(
          typeof body === 'string'
            ? { statusCode: status, message: body, error: exception.name }
            : body,
        );
    }

    // --- Todo lo demás: errores no controlados ---
    // Acá caen los QueryFailedError de TypeORM, TypeError, etc. El mensaje
    // original puede incluir nombres de tablas/columnas o fragmentos de SQL.
    this.logError(request, exception);

    const status = HttpStatus.INTERNAL_SERVER_ERROR;
    const payload: Record<string, unknown> = {
      statusCode: status,
      message: 'Error interno del servidor',
      error: 'Internal Server Error',
    };

    // Fuera de producción sí devolvemos el detalle, que es lo que hace
    // debuggear posible en desarrollo.
    if (!this.isProduction) {
      payload.detail =
        exception instanceof Error ? exception.message : String(exception);
      payload.stack =
        exception instanceof Error ? exception.stack?.split('\n') : undefined;
    }

    return response.status(status).json(payload);
  }

  /**
   * Loguea el detalle completo del lado del servidor.
   * No incluye el body de la request: en /auth/login y /auth/register ese body
   * contiene contraseñas.
   */
  private logError(request: Request, exception: unknown) {
    const { method, originalUrl } = request;
    const message =
      exception instanceof Error ? exception.message : String(exception);
    const stack = exception instanceof Error ? exception.stack : undefined;

    this.logger.error(`${method} ${originalUrl} -> ${message}`, stack);
  }
}
