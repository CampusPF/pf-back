/* eslint-disable */
/**
 * Corre las migraciones pendientes contra la base configurada.
 *
 * Es JS plano y programático (no usa `typeorm-ts-node-commonjs` ni ts-node),
 * así que funciona en producción aunque `ts-node` sea devDependency. Sólo
 * necesita `typeorm` + `pg`, que son dependencias.
 *
 * Requiere que `dist/` ya esté compilado (las migraciones viven en
 * `dist/migrations/*.js` y alguna importa helpers de `dist/`). En Render el
 * build corre antes; en local, `npm run build` primero.
 *
 * ── Uso ──────────────────────────────────────────────────────────────────
 *   node scripts/db-migrate.js
 *
 * Conexión: usa DATABASE_URL si está, si no arma la cadena con DB_HOST /
 * DB_PORT / DB_USERNAME / DB_PASSWORD / DB_NAME. SSL con DB_SSL=true.
 *
 * ── En Render ────────────────────────────────────────────────────────────
 * Ponelo como "Pre-Deploy Command" del Web Service:
 *   npm run db:migrate
 * Si falla, Render aborta el deploy y la versión anterior sigue sirviendo.
 */

require('dotenv').config();

const path = require('node:path');
const { DataSource } = require('typeorm');

function buildConnectionOptions() {
  const useSsl = process.env.DB_SSL === 'true';
  const ssl = useSsl ? { rejectUnauthorized: false } : false;

  if (process.env.DATABASE_URL) {
    return { url: process.env.DATABASE_URL, ssl };
  }

  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl,
  };
}

async function main() {
  const dist = path.join(__dirname, '..', 'dist');

  const dataSource = new DataSource({
    type: 'postgres',
    ...buildConnectionOptions(),
    // runMigrations() no necesita metadata de entidades.
    entities: [],
    migrations: [path.join(dist, 'migrations', '*.js')],
    synchronize: false,
    migrationsTableName: 'migrations',
    logging: ['error', 'warn', 'schema'],
  });

  await dataSource.initialize();

  const pending = await dataSource.showMigrations();
  if (!pending) {
    console.log('No hay migraciones pendientes. La base ya está al día.');
    await dataSource.destroy();
    return;
  }

  const applied = await dataSource.runMigrations({ transaction: 'each' });

  if (applied.length === 0) {
    console.log('No se aplicó ninguna migración.');
  } else {
    console.log(`Migraciones aplicadas (${applied.length}):`);
    applied.forEach((m) => console.log(`  - ${m.name}`));
  }

  await dataSource.destroy();
}

main().catch((error) => {
  console.error('Error corriendo migraciones:', error.message);
  process.exit(1);
});
