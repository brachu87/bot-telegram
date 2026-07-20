import db from '../db/index.js';
import { utcALegible } from '../util/dates.js';

// Decide que secciones incluir segun el tipo pedido (y persona).
function seccionesPara(tipo, persona) {
  if (persona) return { personas: true };
  switch (tipo) {
    case 'gastos': return { resumen: true, gastos: true };
    case 'ingresos': return { resumen: true, ingresos: true };
    case 'personas': return { personas: true };
    case 'notas': return { notas: true };
    case 'recordatorios': return { recordatorios: true };
    default: return { resumen: true, gastos: true, ingresos: true, personas: true, notas: true, recordatorios: true };
  }
}

// Reune los datos de un usuario para exportar.
// desde / hasta: opcionales (YYYY-MM-DD). opciones: { tipo, persona }.
export function reunirDatos(userId, desde, hasta, opciones = {}) {
  const { tipo = 'todo', persona = null } = opciones;
  const incluir = seccionesPara(tipo, persona);

  const dLow = desde || '0000-01-01';
  const dHigh = hasta || '9999-12-31';

  const gastos = db.prepare(
    'SELECT fecha, categoria, descripcion, monto FROM gastos WHERE user_id=? AND fecha>=? AND fecha<=? ORDER BY fecha DESC, id DESC'
  ).all(userId, dLow, dHigh);

  const ingresos = db.prepare(
    'SELECT fecha, descripcion, monto FROM ingresos WHERE user_id=? AND fecha>=? AND fecha<=? ORDER BY fecha DESC, id DESC'
  ).all(userId, dLow, dHigh);

  const porCategoria = db.prepare(
    'SELECT categoria, SUM(monto) AS total FROM gastos WHERE user_id=? AND fecha>=? AND fecha<=? GROUP BY categoria ORDER BY total DESC'
  ).all(userId, dLow, dHigh);

  const totalGastos = gastos.reduce((s, g) => s + g.monto, 0);
  const totalIngresos = ingresos.reduce((s, g) => s + g.monto, 0);

  // Personas (con filtro opcional por nombre)
  let personasRows = db.prepare('SELECT id, nombre FROM personas WHERE user_id=? ORDER BY nombre').all(userId);
  if (persona) {
    const q = persona.toLowerCase();
    personasRows = personasRows.filter(p => p.nombre.toLowerCase().includes(q));
  }
  const saldoStmt = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN tipo='deuda' THEN monto ELSE -monto END),0) AS saldo
    FROM movimientos_persona WHERE user_id=? AND persona_id=?
  `);
  const movStmt = db.prepare(
    'SELECT tipo, monto, concepto, fecha FROM movimientos_persona WHERE user_id=? AND persona_id=? ORDER BY fecha DESC, id DESC'
  );
  const personasFull = personasRows.map(p => ({
    nombre: p.nombre,
    saldo: saldoStmt.get(userId, p.id).saldo,
    movimientos: movStmt.all(userId, p.id)
  }));

  const notas = db.prepare(
    'SELECT texto, etiqueta, creado_en FROM notas WHERE user_id=? ORDER BY id DESC'
  ).all(userId);

  const recordatorios = db.prepare(
    'SELECT texto, fecha_hora, enviado FROM recordatorios WHERE user_id=? ORDER BY fecha_hora DESC'
  ).all(userId).map(r => ({ texto: r.texto, cuando: utcALegible(r.fecha_hora), enviado: r.enviado }));

  return {
    incluir,
    persona,
    rango: { desde: desde || null, hasta: hasta || null },
    totalGastos, totalIngresos, balance: totalIngresos - totalGastos,
    gastos, ingresos, porCategoria,
    personas: personasFull, notas, recordatorios
  };
}
