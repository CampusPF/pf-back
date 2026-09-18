import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { Achievement } from '../../achievements/entities/achievement.entity';
import { seedAchievements } from './achievement.seed';

config();

/**
 * Siembra SOLO el catálogo de logros: `npm run seed:achievements`.
 *
 * Separado de `npm run seed` a propósito. Ese siembra además cursos, usuarios
 * y lecciones de demo, que están bien en una base local pero no en la base
 * compartida — correrlo contra Supabase le metería cursos de prueba al
 * catálogo real. Los logros, en cambio, SÍ hay que sembrarlos en todos los
 * entornos: sin ellos la sección de logros del dashboard sale vacía aunque el
 * código esté perfecto.
 *
 * Es idempotente: se puede correr las veces que haga falta.
 */
const useSsl = process.env.DB_SSL === 'true';
const ssl = useSsl ? { rejectUnauthorized: false } : false;

const connectionOptions = process.env.DATABASE_URL
    ? { url: process.env.DATABASE_URL, ssl }
    : {
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT),
        username: process.env.DB_USERNAME,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        ssl,
    };

const dataSource = new DataSource({
    type: 'postgres',
    ...connectionOptions,
    entities: [Achievement],
    synchronize: false, // el seeder nunca toca el esquema
});

async function run() {
    await dataSource.initialize();
    console.log(`📦 Conectado a ${process.env.DB_HOST ?? 'DATABASE_URL'}`);

    await seedAchievements(dataSource);

    await dataSource.destroy();
    console.log('🔌 Conexión cerrada');
}

run().catch((err) => {
    console.error('❌ Error al sembrar los logros:', err);
    process.exit(1);
});
