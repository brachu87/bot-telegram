-- Esquema de la base de datos (SQLite)
-- Todas las tablas llevan user_id (id de Telegram) para soportar varios usuarios.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS personas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  nombre     TEXT NOT NULL,
  creado_en  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, nombre)
);

-- Movimientos de deuda con una persona: tipo = 'deuda' (el usuario le debe)
-- o 'pago' (el usuario le paga y salda deuda).
CREATE TABLE IF NOT EXISTS movimientos_persona (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  persona_id  INTEGER NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('deuda','pago')),
  monto       REAL NOT NULL,
  concepto    TEXT,
  fecha       TEXT NOT NULL,
  creado_en   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gastos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  monto       REAL NOT NULL,
  categoria   TEXT NOT NULL DEFAULT 'otros',
  medio_pago  TEXT,
  descripcion TEXT,
  fecha       TEXT NOT NULL,
  creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ingresos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  monto       REAL NOT NULL,
  categoria   TEXT NOT NULL DEFAULT 'otros',
  medio_pago  TEXT,
  descripcion TEXT,
  fecha       TEXT NOT NULL,
  creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recordatorios (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  chat_id     INTEGER NOT NULL,
  texto       TEXT NOT NULL,
  fecha_hora  TEXT NOT NULL,         -- ISO en UTC
  enviado     INTEGER NOT NULL DEFAULT 0,
  creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  texto       TEXT NOT NULL,
  etiqueta    TEXT,
  creado_en   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS historial_chat (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  chat_id    INTEGER NOT NULL,
  rol        TEXT NOT NULL CHECK (rol IN ('user','assistant')),
  contenido  TEXT NOT NULL,          -- JSON: content blocks de Anthropic
  creado_en  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mov_persona     ON movimientos_persona (user_id, persona_id);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha     ON gastos (user_id, fecha);
CREATE INDEX IF NOT EXISTS idx_ingresos_fecha   ON ingresos (user_id, fecha);
CREATE INDEX IF NOT EXISTS idx_recordatorios    ON recordatorios (enviado, fecha_hora);
CREATE INDEX IF NOT EXISTS idx_historial        ON historial_chat (user_id, chat_id, id);
