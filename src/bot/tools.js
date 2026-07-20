import db from '../db/index.js';
import { normalizarFecha, localAUTC, utcALegible } from '../util/dates.js';
import { fmtPesos } from '../util/money.js';

// ---------------------------------------------------------------------------
// Definiciones de tools (formato Anthropic tool use)
// ---------------------------------------------------------------------------
export const toolDefs = [
  // --- Finanzas y deudas ---
  {
    name: 'registrar_gasto',
    description: 'Registra un gasto del usuario. Usar cuando el usuario dice que gasto/pago/compro algo para si mismo.',
    input_schema: {
      type: 'object',
      properties: {
        monto: { type: 'number', description: 'Monto en pesos argentinos, ya convertido a numero (ej: 50000)' },
        categoria: { type: 'string', description: 'Categoria del gasto: comida, transporte, servicios, alquiler, sueldos, ocio, salud, otros, etc.' },
        descripcion: { type: 'string', description: 'Breve descripcion de en que fue el gasto' },
        fecha: { type: 'string', description: 'Fecha del gasto en formato YYYY-MM-DD. Omitir si es hoy.' }
      },
      required: ['monto', 'categoria']
    }
  },
  {
    name: 'registrar_ingreso',
    description: 'Registra un ingreso/cobro del usuario (plata que entra).',
    input_schema: {
      type: 'object',
      properties: {
        monto: { type: 'number', description: 'Monto en pesos, numero' },
        descripcion: { type: 'string', description: 'De donde viene el ingreso' },
        fecha: { type: 'string', description: 'YYYY-MM-DD. Omitir si es hoy.' }
      },
      required: ['monto']
    }
  },
  {
    name: 'registrar_deuda',
    description: 'Registra plata que EL USUARIO le debe a otra persona (ej: le debe el sueldo a un empleado). Aumenta el saldo pendiente con esa persona.',
    input_schema: {
      type: 'object',
      properties: {
        persona: { type: 'string', description: 'Nombre de la persona a la que se le debe' },
        monto: { type: 'number', description: 'Monto en pesos, numero' },
        concepto: { type: 'string', description: 'Por que se le debe (ej: horas del sabado)' },
        fecha: { type: 'string', description: 'YYYY-MM-DD. Omitir si es hoy.' }
      },
      required: ['persona', 'monto']
    }
  },
  {
    name: 'registrar_pago',
    description: 'Registra un pago que el usuario le hace a una persona para saldar (total o parcialmente) lo que le debe. Reduce el saldo pendiente.',
    input_schema: {
      type: 'object',
      properties: {
        persona: { type: 'string', description: 'Nombre de la persona a la que se le paga' },
        monto: { type: 'number', description: 'Monto pagado en pesos, numero' },
        fecha: { type: 'string', description: 'YYYY-MM-DD. Omitir si es hoy.' }
      },
      required: ['persona', 'monto']
    }
  },
  {
    name: 'consultar_saldo_persona',
    description: 'Devuelve cuanto le debe el usuario a una persona (SUM deudas - SUM pagos).',
    input_schema: {
      type: 'object',
      properties: { persona: { type: 'string' } },
      required: ['persona']
    }
  },
  {
    name: 'consultar_gastos',
    description: 'Consulta gastos en un rango de fechas y/o categoria. Devuelve total y detalle.',
    input_schema: {
      type: 'object',
      properties: {
        desde: { type: 'string', description: 'YYYY-MM-DD (inclusive)' },
        hasta: { type: 'string', description: 'YYYY-MM-DD (inclusive)' },
        categoria: { type: 'string' }
      }
    }
  },
  {
    name: 'listar_personas',
    description: 'Lista todas las personas registradas con su saldo pendiente actual.',
    input_schema: { type: 'object', properties: {} }
  },

  // --- Agenda y recordatorios ---
  {
    name: 'crear_recordatorio',
    description: 'Crea un recordatorio que el bot enviara al usuario en la fecha/hora indicada. Resolver fechas relativas contra la fecha actual dada en el system prompt.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string', description: 'Que recordar' },
        fecha_hora: { type: 'string', description: 'Fecha y hora local en formato "YYYY-MM-DD HH:mm" (24hs)' }
      },
      required: ['texto', 'fecha_hora']
    }
  },
  {
    name: 'listar_recordatorios',
    description: 'Lista recordatorios pendientes (aun no enviados), opcionalmente en un rango.',
    input_schema: {
      type: 'object',
      properties: {
        desde: { type: 'string', description: 'YYYY-MM-DD' },
        hasta: { type: 'string', description: 'YYYY-MM-DD' }
      }
    }
  },
  {
    name: 'borrar_recordatorio',
    description: 'Borra un recordatorio por su id.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'number' } },
      required: ['id']
    }
  },

  // --- Notas ---
  {
    name: 'guardar_nota',
    description: 'Guarda una nota o anotacion libre del usuario.',
    input_schema: {
      type: 'object',
      properties: {
        texto: { type: 'string' },
        etiqueta: { type: 'string', description: 'Etiqueta opcional para agrupar' }
      },
      required: ['texto']
    }
  },
  {
    name: 'buscar_notas',
    description: 'Busca notas por texto (coincidencia parcial).',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    }
  },

  // --- Exportar ---
  {
    name: 'exportar_datos',
    description: 'Genera un reporte con los datos del usuario y se lo manda como archivo. Usar cuando el usuario pide un excel, una planilla, un pdf, un reporte o "pasame mis datos". Podés acotar por rango de fechas (resolviendo fechas relativas como "de junio" contra la fecha actual), por tipo de dato, y/o por una persona puntual.',
    input_schema: {
      type: 'object',
      properties: {
        formato: { type: 'string', enum: ['excel', 'pdf'], description: 'excel o pdf. Si el usuario no aclara, usar excel.' },
        tipo: { type: 'string', enum: ['todo', 'gastos', 'ingresos', 'personas', 'notas', 'recordatorios'], description: 'Qué exportar. "gastos" = solo gastos; "personas" = deudas/pagos por persona; "todo" = todo (default).' },
        persona: { type: 'string', description: 'Nombre de una persona puntual para exportar solo sus deudas/pagos (ej: "Juan"). Opcional.' },
        desde: { type: 'string', description: 'Fecha inicial YYYY-MM-DD (opcional). Omitir para incluir todo.' },
        hasta: { type: 'string', description: 'Fecha final YYYY-MM-DD (opcional). Omitir para incluir todo.' }
      },
      required: ['formato']
    }
  }
];

// ---------------------------------------------------------------------------
// Helpers de personas
// ---------------------------------------------------------------------------
function buscarPersonaExacta(userId, nombre) {
  return db.prepare(
    'SELECT * FROM personas WHERE user_id = ? AND lower(nombre) = lower(?)'
  ).get(userId, nombre.trim());
}

function obtenerOCrearPersona(userId, nombre) {
  const n = nombre.trim();
  let p = buscarPersonaExacta(userId, n);
  if (!p) {
    const info = db.prepare('INSERT INTO personas (user_id, nombre) VALUES (?, ?)').run(userId, n);
    p = { id: info.lastInsertRowid, user_id: userId, nombre: n };
  }
  return p;
}

function saldoPersona(userId, personaId) {
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN tipo='deuda' THEN monto ELSE 0 END), 0) AS deudas,
      COALESCE(SUM(CASE WHEN tipo='pago'  THEN monto ELSE 0 END), 0) AS pagos
    FROM movimientos_persona
    WHERE user_id = ? AND persona_id = ?
  `).get(userId, personaId);
  return row.deudas - row.pagos;
}

// ---------------------------------------------------------------------------
// Ejecucion de tools. ctx = { userId, chatId }
// ---------------------------------------------------------------------------
export function ejecutarTool(nombre, input, ctx) {
  const { userId, chatId } = ctx;
  switch (nombre) {
    case 'registrar_gasto': {
      const fecha = normalizarFecha(input.fecha);
      const info = db.prepare(
        'INSERT INTO gastos (user_id, monto, categoria, descripcion, fecha) VALUES (?, ?, ?, ?, ?)'
      ).run(userId, input.monto, input.categoria || 'otros', input.descripcion || null, fecha);
      return { ok: true, id: info.lastInsertRowid, monto: input.monto, categoria: input.categoria || 'otros', descripcion: input.descripcion || null, fecha };
    }

    case 'registrar_ingreso': {
      const fecha = normalizarFecha(input.fecha);
      const info = db.prepare(
        'INSERT INTO ingresos (user_id, monto, descripcion, fecha) VALUES (?, ?, ?, ?)'
      ).run(userId, input.monto, input.descripcion || null, fecha);
      return { ok: true, id: info.lastInsertRowid, monto: input.monto, descripcion: input.descripcion || null, fecha };
    }

    case 'registrar_deuda': {
      const fecha = normalizarFecha(input.fecha);
      const persona = obtenerOCrearPersona(userId, input.persona);
      db.prepare(
        "INSERT INTO movimientos_persona (user_id, persona_id, tipo, monto, concepto, fecha) VALUES (?, ?, 'deuda', ?, ?, ?)"
      ).run(userId, persona.id, input.monto, input.concepto || null, fecha);
      const saldo = saldoPersona(userId, persona.id);
      return { ok: true, persona: persona.nombre, monto: input.monto, concepto: input.concepto || null, fecha, saldo_actual: saldo, saldo_texto: fmtPesos(saldo) };
    }

    case 'registrar_pago': {
      const fecha = normalizarFecha(input.fecha);
      const persona = buscarPersonaExacta(userId, input.persona) || obtenerOCrearPersona(userId, input.persona);
      db.prepare(
        "INSERT INTO movimientos_persona (user_id, persona_id, tipo, monto, fecha) VALUES (?, ?, 'pago', ?, ?)"
      ).run(userId, persona.id, input.monto, fecha);
      const saldo = saldoPersona(userId, persona.id);
      return { ok: true, persona: persona.nombre, monto: input.monto, fecha, saldo_restante: saldo, saldo_texto: fmtPesos(saldo) };
    }

    case 'consultar_saldo_persona': {
      const persona = buscarPersonaExacta(userId, input.persona);
      if (!persona) return { ok: false, error: `No hay ninguna persona registrada como "${input.persona}".` };
      const saldo = saldoPersona(userId, persona.id);
      return { ok: true, persona: persona.nombre, saldo, saldo_texto: fmtPesos(saldo), estado: saldo > 0 ? 'le debes' : 'saldado' };
    }

    case 'consultar_gastos': {
      const cond = ['user_id = ?'];
      const args = [userId];
      if (input.desde) { cond.push('fecha >= ?'); args.push(normalizarFecha(input.desde)); }
      if (input.hasta) { cond.push('fecha <= ?'); args.push(normalizarFecha(input.hasta)); }
      if (input.categoria) { cond.push('lower(categoria) = lower(?)'); args.push(input.categoria); }
      const where = cond.join(' AND ');
      const total = db.prepare(`SELECT COALESCE(SUM(monto),0) AS t FROM gastos WHERE ${where}`).get(...args).t;
      const detalle = db.prepare(
        `SELECT id, monto, categoria, descripcion, fecha FROM gastos WHERE ${where} ORDER BY fecha DESC, id DESC LIMIT 50`
      ).all(...args);
      const porCategoria = db.prepare(
        `SELECT categoria, SUM(monto) AS total FROM gastos WHERE ${where} GROUP BY categoria ORDER BY total DESC`
      ).all(...args);
      return { ok: true, total, total_texto: fmtPesos(total), cantidad: detalle.length, por_categoria: porCategoria, detalle };
    }

    case 'listar_personas': {
      const personas = db.prepare('SELECT * FROM personas WHERE user_id = ? ORDER BY nombre').all(userId);
      const salida = personas.map(p => {
        const saldo = saldoPersona(userId, p.id);
        return { id: p.id, nombre: p.nombre, saldo, saldo_texto: fmtPesos(saldo) };
      });
      return { ok: true, personas: salida };
    }

    case 'crear_recordatorio': {
      const iso = localAUTC(input.fecha_hora);
      if (!iso) return { ok: false, error: 'No pude entender la fecha/hora. Formato esperado: YYYY-MM-DD HH:mm.' };
      const info = db.prepare(
        'INSERT INTO recordatorios (user_id, chat_id, texto, fecha_hora) VALUES (?, ?, ?, ?)'
      ).run(userId, chatId, input.texto, iso);
      return { ok: true, id: info.lastInsertRowid, texto: input.texto, cuando: utcALegible(iso) };
    }

    case 'listar_recordatorios': {
      const cond = ['user_id = ?', 'enviado = 0'];
      const args = [userId];
      if (input.desde) { cond.push('date(fecha_hora) >= date(?)'); args.push(normalizarFecha(input.desde)); }
      if (input.hasta) { cond.push('date(fecha_hora) <= date(?)'); args.push(normalizarFecha(input.hasta)); }
      const rows = db.prepare(
        `SELECT id, texto, fecha_hora FROM recordatorios WHERE ${cond.join(' AND ')} ORDER BY fecha_hora ASC`
      ).all(...args);
      return { ok: true, recordatorios: rows.map(r => ({ id: r.id, texto: r.texto, cuando: utcALegible(r.fecha_hora) })) };
    }

    case 'borrar_recordatorio': {
      const info = db.prepare('DELETE FROM recordatorios WHERE id = ? AND user_id = ?').run(input.id, userId);
      return info.changes > 0 ? { ok: true, borrado: input.id } : { ok: false, error: 'No encontre ese recordatorio.' };
    }

    case 'guardar_nota': {
      const info = db.prepare(
        'INSERT INTO notas (user_id, texto, etiqueta) VALUES (?, ?, ?)'
      ).run(userId, input.texto, input.etiqueta || null);
      return { ok: true, id: info.lastInsertRowid, texto: input.texto, etiqueta: input.etiqueta || null };
    }

    case 'buscar_notas': {
      const q = `%${input.query}%`;
      const rows = db.prepare(
        'SELECT id, texto, etiqueta, creado_en FROM notas WHERE user_id = ? AND (texto LIKE ? OR etiqueta LIKE ?) ORDER BY id DESC LIMIT 30'
      ).all(userId, q, q);
      return { ok: true, resultados: rows };
    }

    case 'exportar_datos': {
      const formato = input.formato === 'pdf' ? 'pdf' : 'excel';
      const pedido = {
        formato,
        tipo: input.tipo || 'todo',
        persona: input.persona || null,
        desde: input.desde || null,
        hasta: input.hasta || null
      };
      // Registramos el pedido; el bot genera y envia el archivo despues de responder.
      if (Array.isArray(ctx.archivos)) ctx.archivos.push(pedido);
      return { ok: true, ...pedido, nota: 'El archivo se envía a continuación.' };
    }

    default:
      return { ok: false, error: `Tool desconocida: ${nombre}` };
  }
}

// Lista de personas (para inyectar en el system prompt y ayudar a normalizar nombres)
export function personasDelUsuario(userId) {
  return db.prepare('SELECT nombre FROM personas WHERE user_id = ? ORDER BY nombre').all(userId).map(r => r.nombre);
}
