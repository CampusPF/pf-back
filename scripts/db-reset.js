/* eslint-disable */
/**
 * ⚠️  BORRA TODO EL SCHEMA `public` de la base configurada  ⚠️
 *
 * Deja la base vacía para que las migraciones puedan correr desde cero. Se
 * usa una sola vez, para arreglar una base cuyo schema quedó inconsistente
 * (creado por `synchronize`, migraciones nunca corridas). Después de esto:
 *
 *   node scripts/db-migrate.js     # crea todo el schema, limpio
 *   npm run seed                   # (opcional) datos de demo
 *
 * ── Salvaguardas ─────────────────────────────────────────────────────────
 *   - No hace nada sin el flag  --force
 *   - Imprime las tablas y sus filas ANTES de borrar, y hace una pausa
 *   - Con  --dry-run  sólo muestra, no toca nada
 *
 * ── Uso ──────────────────────────────────────────────────────────────────
 *   node scripts/db-reset.js --dry-run
 *   node scripts/db-reset.js --force
 *
 * Conexión: DATABASE_URL, o DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_NAME.
 * SSL con DB_SSL=true.
 */

require('dotenv').config();

const { Client } = require('pg');

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

function connectionConfig() {
  const ssl = process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL, ssl };
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const client = new Client(connectionConfig());
  await client.connect();

  const { rows: dbInfo } = await client.query(
    'SELECT current_database() AS db, inet_server_addr() AS host',
  );
  console.log(`Base: ${dbInfo[0].db}  (host ${dbInfo[0].host ?? 'local'})\n`);

  const { rows: tables } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  if (tables.length === 0) {
    console.log('El schema public ya está vacío. Nada que borrar.');
    await client.end();
    return;
  }

  console.log('Tablas actuales y cantidad de filas:');
  for (const { table_name } of tables) {
    const { rows } = await client.query(`SELECT COUNT(*)::int AS n FROM "${table_name}"`);
    console.log(`  ${String(rows[0].n).padStart(6)}  ${table_name}`);
  }

  if (DRY_RUN) {
    console.log('\n[--dry-run] No se borra nada.');
    await client.end();
    return;
  }

  if (!FORCE) {
    console.log(
      '\nEsto BORRA todo lo de arriba. Si estás seguro, volvé a correrlo con  --force',
    );
    await client.end();
    process.exit(1);
  }

  console.log('\n--force detectado. Borrando en 5 segundos… (Ctrl+C para abortar)');
  await sleep(5000);

  await client.query('DROP SCHEMA public CASCADE');
  await client.query('CREATE SCHEMA public');
  // Permisos por defecto que espera Postgres en un schema public nuevo.
  await client.query('GRANT ALL ON SCHEMA public TO public');

  console.log('\nSchema public recreado, vacío.');
  console.log('Ahora corré:  node scripts/db-migrate.js');

  await client.end();
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
