import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config(); // carga las variables del .env

/**
 * DataSource que usa el CLI de TypeORM (npm run migration:*).
 * Es independiente de la conexión que arma Nest en app.module.ts.
 *
 * Apunta a `dist/`, así que hay que compilar antes de generar o correr
 * migraciones: `npm run build && npm run migration:generate -- src/migrations/NombreDeLaMigracion`
 *
 * TODO(seguridad): no hay ninguna migración generada todavía. Antes del
 * primer deploy a producción hay que generar la migración inicial contra el
 * esquema actual y correrla (`npm run migration:run`), porque en producción
 * synchronize queda en false y las tablas no se crean solas.
 */
export const AppDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    // Las bases gestionadas (Railway/Render/Neon) exigen TLS.
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    entities: ['dist/**/*.entity.js'],
    migrations: ['dist/migrations/*.js'],
    synchronize: false, // acá siempre false — las migraciones son las que mandan
});
