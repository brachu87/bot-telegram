// Control de acceso multi-cliente.
// - ADMINS: dueños del bot (env ADMIN_IDS). Pueden dar de alta/baja clientes.
// - Clientes: usuarios autorizados. Se guardan en la base (tabla clientes) y se
//   administran en vivo con los comandos /autorizar y /baja. Tambien se aceptan
//   IDs fijos por env (ALLOWED_USER_IDS) para compatibilidad.
// - Si NO hay admins, ni IDs por env, ni clientes cargados => el bot es ABIERTO.

import db from '../db/index.js';

db.exec(`CREATE TABLE IF NOT EXISTS clientes (
  user_id  INTEGER PRIMARY KEY,
  alias    TEXT,
  alta_en  TEXT NOT NULL DEFAULT (datetime('now'))
);`);

function idsEnv(nombre) {
  const raw = process.env[nombre] || '';
  return new Set(raw.split(',').map(s => s.trim()).filter(Boolean));
}

export function idsAdmin() {
  return idsEnv('ADMIN_IDS');
}

export function esAdmin(userId) {
  return idsAdmin().has(String(userId));
}

// IDs autorizados por env (compatibilidad)
export function idsPermitidosEnv() {
  return idsEnv('ALLOWED_USER_IDS');
}

// --- Clientes en la base ---
export function agregarCliente(userId, alias = null) {
  db.prepare(`INSERT INTO clientes (user_id, alias) VALUES (?, ?)
    ON CONFLICT(user_id) DO UPDATE SET alias = COALESCE(excluded.alias, clientes.alias)`)
    .run(userId, alias);
}

export function quitarCliente(userId) {
  return db.prepare('DELETE FROM clientes WHERE user_id = ?').run(userId).changes > 0;
}

export function listarClientes() {
  return db.prepare('SELECT user_id, alias, alta_en FROM clientes ORDER BY alta_en DESC').all();
}

function hayCliente(userId) {
  return !!db.prepare('SELECT 1 FROM clientes WHERE user_id = ?').get(userId);
}

function cantidadClientes() {
  return db.prepare('SELECT COUNT(*) AS n FROM clientes').get().n;
}

// El bot es privado si hay admins, o IDs por env, o al menos un cliente cargado.
export function esPrivado() {
  return idsAdmin().size > 0 || idsPermitidosEnv().size > 0 || cantidadClientes() > 0;
}

export function estaAutorizado(userId) {
  if (!esPrivado()) return true;                 // sin restriccion configurada
  const id = String(userId);
  if (idsAdmin().has(id)) return true;           // los admins siempre
  if (idsPermitidosEnv().has(id)) return true;   // IDs fijos por env
  return hayCliente(userId);                      // clientes de la base
}
