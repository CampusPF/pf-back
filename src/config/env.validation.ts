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

  // Secret de los tokens de "recuperar contraseña". TIENE que ser distinto de
  // JWT_SECRET: así un token de reseteo filtrado no sirve como sesión ni al
  // revés. Mismas exigencias que JWT_SECRET (32+ chars en producción).
  JWT_RESET_SECRET: Joi.string()
    .required()
    .when(isProd, {
      is: 'production',
      then: Joi.string().min(32).invalid(Joi.ref('JWT_SECRET')),
    })
    .messages({
      'string.min':
        'JWT_RESET_SECRET debe tener al menos 32 caracteres en producción. Generá uno con: openssl rand -hex 32',
      'any.invalid':
        'JWT_RESET_SECRET no puede ser igual a JWT_SECRET: son secrets de propósitos distintos.',
    }),

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

  // --- Pagos: Stripe ---
  // STRIPE_SECRET_KEY: la secret key del backend (sk_test_... / sk_live_...).
  //   NUNCA la publishable — esa vive en el front
  //   (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).
  // STRIPE_WEBHOOK_SECRET: whsec_... — lo da `stripe listen` en local y el
  //   dashboard en producción. Sin él no se puede verificar la firma del
  //   webhook y ningún pago se confirma.
  // En dev son opcionales (se puede levantar la app sin pagos); los endpoints
  // de /payments responden 503 hasta que estén configuradas.
  STRIPE_SECRET_KEY: requiredInProd(Joi.string()),
  STRIPE_WEBHOOK_SECRET: requiredInProd(Joi.string()),

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

  // NOTA: el proyecto arrancó con notas para Mercado Pago pero el equipo fue
  // con Stripe (ver bloque STRIPE_* arriba). Las variables MP_* quedaron sin
  // uso y no se validan.

  // --- Archivos: Cloudinary ---
  // CLOUDINARY_API_SECRET vive SOLO en el backend: la subida pasa siempre por
  // la API (Multer + upload_stream), el front nunca ve la credencial.
  // En dev son opcionales (se puede levantar la app sin subir archivos); los
  // endpoints de upload responden 503 hasta que estén configuradas, igual que
  // hace /payments con STRIPE_SECRET_KEY.
  CLOUDINARY_CLOUD_NAME: requiredInProd(Joi.string()),
  CLOUDINARY_API_KEY: requiredInProd(Joi.string()),
  CLOUDINARY_API_SECRET: requiredInProd(Joi.string()),

  // --- Mails transaccionales: Brevo ---
  // En dev son opcionales: MailService NO llama a Brevo fuera de producción,
  // escribe el mail en el log (así no se queman los 300 mails/día del plan
  // gratuito probando en local).
  // MAIL_FROM_ADDRESS tiene que ser EXACTAMENTE un remitente verificado en el
  // dashboard de Brevo, o la API rechaza el envío con un 403.
  BREVO_API_KEY: requiredInProd(Joi.string()),
  MAIL_FROM_ADDRESS: requiredInProd(Joi.string().email()),
  MAIL_FROM_NAME: Joi.string().default('Campus'),
  // Fuerza el envío real a Brevo también fuera de producción. Sirve para
  // probar las plantillas contra una casilla propia; en false (default) los
  // mails de dev se escriben en el log.
  MAIL_FORCE_SEND: Joi.boolean().truthy('true').falsy('false').default(false),

  // URL pública del logo de los mails. Opcional: por defecto se usa
  // FRONTEND_URL + /logo-campus.png (pf-front/public). Ver src/mail/mail-templates.ts.
  MAIL_LOGO_URL: Joi.string().uri().empty(''),

  // --- Recordatorios semanales (cron) ---
  REMINDER_CRON: Joi.string().default('0 10 * * 1'),
  REMINDER_TZ: Joi.string().default('America/Argentina/Buenos_Aires'),
  STUDENT_INACTIVITY_DAYS: Joi.number().integer().positive().default(7),
  TEACHER_INACTIVITY_DAYS: Joi.number().integer().positive().default(30),
  // URL pública del BACK (sin barra final). Arma el link de baja de los
  // recordatorios, que apunta a GET /notifications/unsubscribe.
  API_PUBLIC_URL: Joi.string().uri().default('http://localhost:4000'),
  // Firma los links de "no quiero más recordatorios". Secret propio, igual
  // que JWT_RESET_SECRET: un link de baja filtrado no sirve de sesión.
  JWT_UNSUBSCRIBE_SECRET: requiredInProd(Joi.string().min(32)),
})
  // Permite variables extra en el entorno (PATH, HOME, las que inyecta el
  // hosting, etc.) sin hacer fallar el arranque.
  .unknown(true)
  // Reporta TODOS los errores de config de una sola vez, no solo el primero.
  .options({ abortEarly: false });
