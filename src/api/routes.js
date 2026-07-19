import { Router } from 'express';
import db from '../db/index.js';
import { authMiddleware } from './auth.js';
import { normalizarFecha, utcALegible, ZONA } from '../util/dates.js';
import { DateTime } from 'luxon';

const router = Router();

// Todas las rutas requieren initData valido
router.use(authMiddleware);

// Primer y ultimo dia del mes actual (por defecto)
function rangoMesActual() {
  const now = DateTime.now().setZone(ZONA);
  return { desde: now.startOf('month').toISODate(), hasta: now.endOf('month').toISODate() };
}

// GET /api/resumen?desde=&hasta=
router.get('/resumen', (req, res) => {
  const { desde: dMes, hasta: hMes } = rangoMesActual();
  const desde = normalizarFecha(req.query.desde || dMes);
  const hasta = normalizarFecha(req.query.hasta || hMes);
  const uid = req.userId;

  const gastos = db.prepare(
    'SELECT COALESCE(SUM(monto),0) AS t FROM gastos WHERE user_id=? AND fecha>=? AND fecha<=?'
  ).get(uid, desde, hasta).t;
  const ingresos = db.prepare(
    'SELECT COALESCE(SUM(monto),0) AS t FROM ingresos WHERE user_id=? AND fecha>=? AND fecha<=?'
  ).get(uid, desde, hasta).t;

  res.json({ desde, hasta, gastos, ingresos, balance: ingresos - gastos });
});

// GET /api/gastos?desde=&hasta=
router.get('/gastos', (req, res) => {
  const { desde: dMes, hasta: hMes } = rangoMesActual();
  const desde = normalizarFecha(req.query.desde || dMes);
  const hasta = normalizarFecha(req.query.hasta || hMes);
  const uid = req.userId;

  const detalle = db.prepare(
    'SELECT id, monto, categoria, descripcion, fecha FROM gastos WHERE user_id=? AND fecha>=? AND fecha<=? ORDER BY fecha DESC, id DESC'
  ).all(uid, desde, hasta);
  const porCategoria = db.prepare(
    'SELECT categoria, SUM(monto) AS total FROM gastos WHERE user_id=? AND fecha>=? AND fecha<=? GROUP BY categoria ORDER BY total DESC'
  ).all(uid, desde, hasta);
  const total = detalle.reduce((s, g) => s + g.monto, 0);

  res.json({ desde, hasta, total, por_categoria: porCategoria, detalle });
});

// GET /api/gastos/mensual?meses=6  -> serie mensual gastos vs ingresos
router.get('/gastos/mensual', (req, res) => {
  const meses = Math.min(Math.max(parseInt(req.query.meses) || 6, 1), 24);
  const uid = req.userId;
  const now = DateTime.now().setZone(ZONA);
  const serie = [];

  for (let i = meses - 1; i >= 0; i--) {
    const m = now.minus({ months: i });
    const desde = m.startOf('month').toISODate();
    const hasta = m.endOf('month').toISODate();
    const gastos = db.prepare(
      'SELECT COALESCE(SUM(monto),0) AS t FROM gastos WHERE user_id=? AND fecha>=? AND fecha<=?'
    ).get(uid, desde, hasta).t;
    const ingresos = db.prepare(
      'SELECT COALESCE(SUM(monto),0) AS t FROM ingresos WHERE user_id=? AND fecha>=? AND fecha<=?'
    ).get(uid, desde, hasta).t;
    serie.push({
      mes: m.toFormat('LL/yyyy'),
      etiqueta: m.setLocale('es').toFormat('LLL').replace('.', ''),
      gastos,
      ingresos
    });
  }

  res.json({ meses, serie });
});

// GET /api/personas  -> lista con saldo y ultimos movimientos
router.get('/personas', (req, res) => {
  const uid = req.userId;
  const personas = db.prepare('SELECT id, nombre FROM personas WHERE user_id=? ORDER BY nombre').all(uid);

  const saldoStmt = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN tipo='deuda' THEN monto ELSE -monto END),0) AS saldo
    FROM movimientos_persona WHERE user_id=? AND persona_id=?
  `);
  const movStmt = db.prepare(
    'SELECT id, tipo, monto, concepto, fecha FROM movimientos_persona WHERE user_id=? AND persona_id=? ORDER BY fecha DESC, id DESC LIMIT 20'
  );

  const salida = personas.map(p => ({
    id: p.id,
    nombre: p.nombre,
    saldo: saldoStmt.get(uid, p.id).saldo,
    movimientos: movStmt.all(uid, p.id)
  }));

  res.json({ personas: salida });
});

// GET /api/recordatorios?desde=&hasta=  (pendientes)
router.get('/recordatorios', (req, res) => {
  const uid = req.userId;
  const cond = ['user_id=?', 'enviado=0'];
  const args = [uid];
  if (req.query.desde) { cond.push('date(fecha_hora) >= date(?)'); args.push(normalizarFecha(req.query.desde)); }
  if (req.query.hasta) { cond.push('date(fecha_hora) <= date(?)'); args.push(normalizarFecha(req.query.hasta)); }

  const rows = db.prepare(
    `SELECT id, texto, fecha_hora FROM recordatorios WHERE ${cond.join(' AND ')} ORDER BY fecha_hora ASC`
  ).all(...args);

  res.json({
    recordatorios: rows.map(r => ({ id: r.id, texto: r.texto, fecha_hora: r.fecha_hora, cuando: utcALegible(r.fecha_hora) }))
  });
});

// GET /api/notas?query=
router.get('/notas', (req, res) => {
  const uid = req.userId;
  const query = req.query.query;
  let rows;
  if (query) {
    const q = `%${query}%`;
    rows = db.prepare(
      'SELECT id, texto, etiqueta, creado_en FROM notas WHERE user_id=? AND (texto LIKE ? OR etiqueta LIKE ?) ORDER BY id DESC'
    ).all(uid, q, q);
  } else {
    rows = db.prepare('SELECT id, texto, etiqueta, creado_en FROM notas WHERE user_id=? ORDER BY id DESC').all(uid);
  }
  res.json({ notas: rows });
});

export default router;
