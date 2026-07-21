import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DB_PATH || './data/asistente.db';

// Asegurar que exista la carpeta de la base
fs.mkdirSync(path.dirname(path.resolve(DB_PATH)), { recursive: true });

const db = new Database(path.resolve(DB_PATH));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Ejecutar el esquema (idempotente gracias a IF NOT EXISTS)
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Ruta absoluta del archivo de base (para backups)
export const DB_FILE = path.resolve(DB_PATH);

// Fuerza que los cambios del WAL pasen al archivo principal (antes de copiarlo)
export function checkpoint() {
  try { db.pragma('wal_checkpoint(TRUNCATE)'); } catch { /* noop */ }
}

export default db;
