import * as Joi from 'joi';

/**
 * Esquema de validación de variables de entorno.
 *
 * Se ejecuta al arrancar la app (ConfigModule.forRoot({ validationSchema })).
 * Si falta una variable requerida o tiene un formato inválido, el proceso
 * falla en el arranque en vez de romper en runtime con un 500 raro.
 *
 * Convención: `requiredInProd` marca las variables que son opcionales en
 * desarrollo (para que un dev pueda levantar el proyecto sin todas las
 * credenciales) pero obligatorias cuando NODE_ENV === 'production'.
 */

const isProd = Joi.ref('NODE_ENV');

/** Requerida siempre que NODE_ENV sea 'production'; opcional en el resto. */
const requiredInProd = <T extends Joi.AnySchema>(schema: T): T =>
  schema.when(isProd, {
    is: 'production',
    then: Joi.any().required(),
    otherwise: Joi.any().optional(),
  }) as T;

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),

  PORT: Joi.number().port().default(4000),

  // --- Base de datos ---
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().required(),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').required(),
  DB_NAME: Joi.string().required(),
  // SSL obligatorio para bases gestionadas (Railway/Render/Neon/Supabase).
  DB_SSL: Joi.boolean().truthy('true').falsy('false').default(false),

  // --- Auth / JWT ---
  // Secret largo y aleatorio. En prod exigimos al menos 32 chars para que
  // nadie deploye con el "tu secret" del .env.example.
  JWT_SECRET: Joi.string()
    .required()
    .when(isProd, {
      is: 'production',
      then: Joi.string().min(32),
    })
    .messages({
      'string.min':
        'JWT_SECRET debe tener al menos 32 caracteres en producción. Generá uno con: openssl rand -hex 32',
    }),
  // Segundos de validez del access token (se pasa a signOptions.expiresIn).
  JWT_EXPIRES_IN: Joi.number().integer().positive().default(3600),

  // --- Frontend / CORS ---
  // Lista separada por comas. En prod es obligatoria y no puede ser '*'.
  FRONTEND_URL: requiredInProd(Joi.string()).default('http://localhost:3000'),

  // --- Confianza en el reverse proxy (Railway/Render/Nginx) ---
  TRUST_PROXY: Joi.number().integer().min(0).default(1),

  // --- Rate limiting ---
  THROTTLE_TTL: Joi.number().integer().positive().default(60),
  THROTTLE_LIMIT: Joi.number().integer().positive().default(100),
  THROTTLE_AUTH_LIMIT: Joi.number().integer().positive().default(10),
  THROTTLE_AI_LIMIT: Joi.number().integer().positive().default(20),

  // --- Google OAuth ---
  GOOGLE_CLIENT_ID: requiredInProd(Joi.string()),
  GOOGLE_CLIENT_SECRET: requiredInProd(Joi.string()),
  GOOGLE_CALLBACK_URL: requiredInProd(Joi.string().uri()),

  // --- Swagger ---
  // Por defecto Swagger queda deshabilitado en producción (ver main.ts).
  SWAGGER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(false),

  // --- Proveedor de IA (tutor) ---
  // Hoy el binding activo es MockAiProvider, así que ninguna de estas es
  // requerida todavía. Cuando se conecte un proveedor real hay que moverla
  // a requiredInProd().
  // TODO(seguridad): decidir proveedor de IA (Anthropic u OpenAI) y marcar
  // su API key como requerida en producción.
  ANTHROPIC_API_KEY: Joi.string().optional(),
  OPENAI_API_KEY: Joi.string().optional(),

  // TODO(seguridad): cuando se integre la pasarela de pagos real (Mercado
  // Pago), agregar acá MP_ACCESS_TOKEN y MP_WEBHOOK_SECRET como requeridas
  // en producción. Hoy el flujo de pago de subscriptions es una simulación
  // (ver subscriptions.service.ts) y no hay SDK de MP instalado.

  // TODO(seguridad): cuando se integre Cloudinary, agregar CLOUDINARY_CLOUD_NAME,
  // CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET como requeridas en producción.
  // Hoy no existe ningún endpoint de upload en la API.
})
  // Permite variables extra en el entorno (PATH, HOME, las que inyecta el
  // hosting, etc.) sin hacer fallar el arranque.
  .unknown(true)
  // Reporta TODOS los errores de config de una sola vez, no solo el primero.
  .options({ abortEarly: false });
