-- ============================================================================
--  BOOTSTRAP DE SUPABASE  —  Campus (pf-back)
-- ============================================================================
--  Cómo usarlo:
--    Supabase -> SQL Editor -> New query -> pegar TODO esto -> Run.
--
--  Qué hace:
--    1. Borra el schema `public` entero y lo recrea vacío.
--    2. Crea el schema completo del proyecto (tablas, tipos, indices, FKs),
--       identico a lo que produce `npm run db:migrate`.
--    3. Registra la migracion InitialSchema como aplicada, asi los proximos
--       deploys de Render (que corren `db:migrate`) no la vuelven a correr.
--
--  BORRA todo lo que haya hoy en `public`. Es data de test, se reconstruye.
--  Despues de esto, opcional: `npm run seed` para los cursos de demo.
-- ============================================================================

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- Roles de Supabase (no existen en un Postgres comun; el bloque los saltea).
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    GRANT ALL ON SCHEMA public TO anon, authenticated, service_role;
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TYPE public.ai_tutor_messages_role_enum AS ENUM (
    'user',
    'assistant'
);
CREATE TYPE public.courses_difficulty_enum AS ENUM (
    'beginner',
    'intermediate',
    'advanced'
);
CREATE TYPE public.payments_plan_enum AS ENUM (
    'free',
    'premium'
);
CREATE TYPE public.payments_status_enum AS ENUM (
    'pending',
    'succeeded',
    'failed'
);
CREATE TYPE public.payments_type_enum AS ENUM (
    'course',
    'subscription'
);
CREATE TYPE public.subscriptions_plan_enum AS ENUM (
    'free',
    'premium'
);
CREATE TYPE public.subscriptions_status_enum AS ENUM (
    'active',
    'cancelled',
    'expired'
);
CREATE TYPE public.users_role_enum AS ENUM (
    'student',
    'teacher',
    'admin'
);
CREATE TYPE public.users_status_enum AS ENUM (
    'active',
    'inactive',
    'banned',
    'deleted'
);
CREATE TABLE public.ai_tutor_conversations (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    "studentId" uuid,
    "lessonId" uuid
);
CREATE TABLE public.ai_tutor_messages (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    role public.ai_tutor_messages_role_enum NOT NULL,
    content text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    "conversationId" uuid
);
CREATE TABLE public.categories (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    name character varying NOT NULL,
    description character varying,
    "imageUrl" character varying,
    color character varying,
    icon character varying,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.course_enrollments (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    progress_percent integer DEFAULT 0 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    completed_at timestamp without time zone,
    enrolled_at timestamp without time zone DEFAULT now() NOT NULL,
    "studentId" uuid,
    "courseId" uuid
);
CREATE TABLE public.course_modules (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    title character varying NOT NULL,
    order_index integer NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "courseId" uuid
);
CREATE TABLE public.courses (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    title character varying NOT NULL,
    slug character varying NOT NULL,
    description text,
    difficulty public.courses_difficulty_enum DEFAULT 'beginner'::public.courses_difficulty_enum NOT NULL,
    image_url character varying,
    price_in_cents integer DEFAULT 0 NOT NULL,
    currency character varying(3) DEFAULT 'usd'::character varying NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "instructorId" uuid,
    "categoryId" uuid
);
CREATE TABLE public.lesson_progress (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    completed boolean DEFAULT false NOT NULL,
    completed_at timestamp without time zone,
    "enrollmentId" uuid,
    "lessonId" uuid
);
CREATE TABLE public.lessons (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    title character varying NOT NULL,
    content text,
    video_url character varying,
    order_index integer NOT NULL,
    duration_minutes integer DEFAULT 0 NOT NULL,
    is_free boolean DEFAULT false NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "moduleId" uuid
);
CREATE TABLE public.migrations (
    id integer NOT NULL,
    "timestamp" bigint NOT NULL,
    name character varying NOT NULL
);
CREATE SEQUENCE public.migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
ALTER SEQUENCE public.migrations_id_seq OWNED BY public.migrations.id;
CREATE TABLE public.payments (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    type public.payments_type_enum NOT NULL,
    plan public.payments_plan_enum,
    stripe_payment_intent_id character varying NOT NULL,
    status public.payments_status_enum DEFAULT 'pending'::public.payments_status_enum NOT NULL,
    amount_in_cents integer NOT NULL,
    currency character varying(3) DEFAULT 'usd'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    "userId" uuid NOT NULL,
    "courseId" uuid
);
CREATE TABLE public.subscriptions (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    plan public.subscriptions_plan_enum NOT NULL,
    status public.subscriptions_status_enum DEFAULT 'active'::public.subscriptions_status_enum NOT NULL,
    start_date timestamp without time zone NOT NULL,
    end_date timestamp without time zone NOT NULL,
    last_payment_amount numeric(10,2) NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "userId" uuid
);
CREATE TABLE public.users (
    id uuid DEFAULT uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    email character varying NOT NULL,
    "passwordHash" character varying,
    "googleId" character varying,
    role public.users_role_enum DEFAULT 'student'::public.users_role_enum NOT NULL,
    status public.users_status_enum DEFAULT 'active'::public.users_status_enum NOT NULL,
    "birthDate" date,
    phone character varying,
    address character varying(200),
    city character varying(100),
    country character varying(100),
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);
ALTER TABLE ONLY public.migrations ALTER COLUMN id SET DEFAULT nextval('public.migrations_id_seq'::regclass);
INSERT INTO public.migrations VALUES (1, 1788798058686, 'InitialSchema1788798058686');
ALTER TABLE ONLY public.payments
    ADD CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY (id);
ALTER TABLE ONLY public.categories
    ADD CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY (id);
ALTER TABLE ONLY public.courses
    ADD CONSTRAINT "PK_3f70a487cc718ad8eda4e6d58c9" PRIMARY KEY (id);
ALTER TABLE ONLY public.course_modules
    ADD CONSTRAINT "PK_4c195db0718e8845a6e09075ebc" PRIMARY KEY (id);
ALTER TABLE ONLY public.course_enrollments
    ADD CONSTRAINT "PK_609f6e4f0fc9a6149a35211b380" PRIMARY KEY (id);
ALTER TABLE ONLY public.migrations
    ADD CONSTRAINT "PK_8c82d7f526340ab734260ea46be" PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_tutor_messages
    ADD CONSTRAINT "PK_975661e0bd8f65ed85182117539" PRIMARY KEY (id);
ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT "PK_9b9a8d455cac672d262d7275730" PRIMARY KEY (id);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id);
ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT "PK_a87248d73155605cf782be9ee5e" PRIMARY KEY (id);
ALTER TABLE ONLY public.ai_tutor_conversations
    ADD CONSTRAINT "PK_c730da0e75ff46600be3d63c692" PRIMARY KEY (id);
ALTER TABLE ONLY public.lesson_progress
    ADD CONSTRAINT "PK_e6223ebbc5f8f5fce40e0193de1" PRIMARY KEY (id);
ALTER TABLE ONLY public.lesson_progress
    ADD CONSTRAINT "UQ_36b8a65b9550e0b692d83da75e9" UNIQUE ("enrollmentId", "lessonId");
ALTER TABLE ONLY public.categories
    ADD CONSTRAINT "UQ_8b0be371d28245da6e4f4b61878" UNIQUE (name);
ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE (email);
ALTER TABLE ONLY public.courses
    ADD CONSTRAINT "UQ_a3bb2d01cfa0f95bc5e034e1b7a" UNIQUE (slug);
ALTER TABLE ONLY public.course_enrollments
    ADD CONSTRAINT "UQ_aa0733fce70a4a97704f1d4a340" UNIQUE ("studentId", "courseId");
ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_f382af58ab36057334fb262efd5" UNIQUE ("googleId");
CREATE UNIQUE INDEX "IDX_94c6e6376625bc6710d7dbb4b6" ON public.payments USING btree (stripe_payment_intent_id);
ALTER TABLE ONLY public.payments
    ADD CONSTRAINT "FK_00097d3b3147848e3585aabb433" FOREIGN KEY ("courseId") REFERENCES public.courses(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.course_enrollments
    ADD CONSTRAINT "FK_0533bdb161365ccbec0c8906408" FOREIGN KEY ("studentId") REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.course_modules
    ADD CONSTRAINT "FK_0a332e19d988804687be4637bfc" FOREIGN KEY ("courseId") REFERENCES public.courses(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.lessons
    ADD CONSTRAINT "FK_16e7969589c0b789d9868782259" FOREIGN KEY ("moduleId") REFERENCES public.course_modules(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.lesson_progress
    ADD CONSTRAINT "FK_5bc4ad7572c19f8c12a67fee6b1" FOREIGN KEY ("enrollmentId") REFERENCES public.course_enrollments(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_tutor_conversations
    ADD CONSTRAINT "FK_5be72a4fb0f29b03558674aa356" FOREIGN KEY ("studentId") REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.ai_tutor_messages
    ADD CONSTRAINT "FK_9577a05822ff78a1a7f9ccc9050" FOREIGN KEY ("conversationId") REFERENCES public.ai_tutor_conversations(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.courses
    ADD CONSTRAINT "FK_c730473dfb837b3e62057cd9447" FOREIGN KEY ("categoryId") REFERENCES public.categories(id) ON DELETE SET NULL;
ALTER TABLE ONLY public.ai_tutor_conversations
    ADD CONSTRAINT "FK_d0d815a6097bae3be2e67bbb407" FOREIGN KEY ("lessonId") REFERENCES public.lessons(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.payments
    ADD CONSTRAINT "FK_d35cb3c13a18e1ea1705b2817b1" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.course_enrollments
    ADD CONSTRAINT "FK_d77e489db35c7d325700d799be6" FOREIGN KEY ("courseId") REFERENCES public.courses(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.lesson_progress
    ADD CONSTRAINT "FK_df13299d2740b302dd44a368df9" FOREIGN KEY ("lessonId") REFERENCES public.lessons(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.courses
    ADD CONSTRAINT "FK_e6714597bea722629fa7d32124a" FOREIGN KEY ("instructorId") REFERENCES public.users(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT "FK_fbdba4e2ac694cf8c9cecf4dc84" FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;
