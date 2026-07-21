import db from '../db/index.js';
import { normalizarFecha, localAUTC, utcALegible } from '../util/dates.js';
import { fmtPesos } from '../util/money.js';
import { gestumio, estaVinculado, guardarUltimo, getUltimo } from '../gestumio/api.js';

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
        medio_pago: { type: 'string', description: 'Como se pago: efectivo, tarjeta, debito, credito, transferencia, mercadopago, etc. Solo si el usuario lo aclara; sino omitir.' },
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
        categoria: { type: 'string', description: 'Categoria del ingreso: ventas, sueldo, honorarios, alquileres, reintegros, otros, etc.' },
        medio_pago: { type: 'string', description: 'Como lo cobro: efectivo, transferencia, mercadopago, cheque, tarjeta, etc. Solo si el usuario lo aclara; sino omitir.' },
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
  {
    name: 'consultar_ingresos',
    description: 'Consulta ingresos en un rango de fechas. Devuelve total y detalle. Usar para "cuanto cobre/facture/ingrese".',
    input_schema: {
      type: 'object',
      properties: {
        desde: { type: 'string', description: 'YYYY-MM-DD (inclusive)' },
        hasta: { type: 'string', description: 'YYYY-MM-DD (inclusive)' }
      }
    }
  },
  {
    name: 'consultar_balance',
    description: 'Devuelve ingresos, gastos y balance (ingresos - gastos) de un periodo. Usar para "como vengo", "cuanto me queda", "balance del mes".',
    input_schema: {
      type: 'object',
      properties: {
        desde: { type: 'string', description: 'YYYY-MM-DD (inclusive)' },
        hasta: { type: 'string', description: 'YYYY-MM-DD (inclusive)' }
      }
    }
  },
  {
    name: 'borrar_ultimo',
    description: 'Borra el ultimo movimiento cargado. Usar para "borra eso", "borra el ultimo gasto", "deshace lo ultimo", "eliminá el ingreso que acabo de cargar".',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['ultimo', 'gasto', 'ingreso', 'nota', 'recordatorio'], description: 'Que borrar. "ultimo" (default) = el ultimo gasto o ingreso, el que sea mas reciente.' }
      }
    }
  },
  {
    name: 'corregir_ultimo',
    description: 'Corrige el ultimo gasto o ingreso cargado (por ejemplo si se transcribio mal el monto). Usar para "corregi, eran 5 lucas no 50", "cambiá la categoria del ultimo gasto".',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['gasto', 'ingreso'], description: 'Que corregir (default gasto).' },
        monto: { type: 'number', description: 'Nuevo monto en pesos (numero). Opcional.' },
        descripcion: { type: 'string', description: 'Nueva descripcion. Opcional.' },
        categoria: { type: 'string', description: 'Nueva categoria. Opcional.' },
        medio_pago: { type: 'string', description: 'Nuevo medio de pago. Opcional.' }
      }
    }
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
  },

  // --- GESTUMIO (CRM del negocio) ---
  {
    name: 'gestumio_cargar_gasto',
    description: 'Carga un GASTO/compra del NEGOCIO en Gestumio (el CRM). Usar cuando el usuario quiere registrar un gasto del negocio, o manda la foto/PDF de una factura de compra. Si manda una imagen de factura, extraé monto, categoria y descripcion de la imagen.',
    input_schema: {
      type: 'object',
      properties: {
        monto: { type: 'number', description: 'Monto total en pesos, numero' },
        categoria: { type: 'string', description: 'Categoria del gasto (ej: mercaderia, servicios, alquiler, sueldos, impuestos, otros)' },
        descripcion: { type: 'string', description: 'Descripcion o proveedor del gasto' },
        medio_pago: { type: 'string', description: 'efectivo, transferencia, tarjeta, debito, credito, mercadopago. Solo si se aclara.' },
        fecha: { type: 'string', description: 'YYYY-MM-DD. Omitir si es hoy.' }
      },
      required: ['monto', 'categoria']
    }
  },
  {
    name: 'gestumio_registrar_cobro',
    description: 'Registra un COBRO/ingreso del NEGOCIO en Gestumio (plata que entra). Opcionalmente asociado a un cliente por su nombre.',
    input_schema: {
      type: 'object',
      properties: {
        monto: { type: 'number', description: 'Monto cobrado en pesos, numero' },
        descripcion: { type: 'string', description: 'Concepto del cobro (ej: cuota de julio, corte de pelo)' },
        cliente: { type: 'string', description: 'Nombre del cliente, si corresponde. Se busca en el negocio.' },
        medio_pago: { type: 'string', description: 'efectivo, transferencia, mercadopago, tarjeta, etc. Solo si se aclara.' },
        fecha: { type: 'string', description: 'YYYY-MM-DD. Omitir si es hoy.' }
      },
      required: ['monto', 'descripcion']
    }
  },
  {
    name: 'gestumio_crear_cliente',
    description: 'Da de alta un CLIENTE nuevo en el negocio en Gestumio.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre y apellido del cliente' },
        telefono: { type: 'string' },
        email: { type: 'string' },
        dni: { type: 'string' },
        cuit: { type: 'string' },
        notas: { type: 'string' }
      },
      required: ['nombre']
    }
  },
  {
    name: 'gestumio_consultar',
    description: 'Consulta datos del NEGOCIO en Gestumio. tipo="resumen" (ingresos/gastos/por cobrar del mes), tipo="deuda" (cuanto debe un cliente, requiere cliente), tipo="turnos" (turnos de hoy).',
    input_schema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['resumen', 'deuda', 'turnos'], description: 'Que consultar' },
        cliente: { type: 'string', description: 'Nombre del cliente (solo para tipo=deuda)' }
      },
      required: ['tipo']
    }
  },
  {
    name: 'gestumio_crear_turno',
    description: 'Crea un TURNO en Gestumio para un cliente. Si es con un servicio, pasá el servicio y la hora; si es un trabajo suelto, pasá descripcion y precio.',
    input_schema: {
      type: 'object',
      properties: {
        cliente: { type: 'string', description: 'Nombre del cliente' },
        servicio: { type: 'string', description: 'Nombre del servicio (opcional). Si no hay, es un turno/trabajo simple.' },
        fecha: { type: 'string', description: 'Fecha YYYY-MM-DD' },
        hora: { type: 'string', description: 'Hora de inicio HH:MM (ej: 15:00)' },
        empleado: { type: 'string', description: 'Empleado asignado (opcional)' },
        precio: { type: 'number', description: 'Precio (opcional; si hay servicio se toma el del servicio)' },
        descripcion: { type: 'string', description: 'Descripcion del trabajo (para turnos sin servicio)' }
      },
      required: ['cliente', 'fecha']
    }
  },
  {
    name: 'gestumio_reprogramar_turno',
    description: 'Mueve/reprograma un turno de un cliente a otra fecha y/o hora.',
    input_schema: {
      type: 'object',
      properties: {
        cliente: { type: 'string' },
        fecha_actual: { type: 'string', description: 'Fecha actual del turno YYYY-MM-DD (si el cliente tiene varios)' },
        nueva_fecha: { type: 'string', description: 'Nueva fecha YYYY-MM-DD' },
        nueva_hora: { type: 'string', description: 'Nueva hora HH:MM' }
      },
      required: ['cliente']
    }
  },
  {
    name: 'gestumio_cancelar_turno',
    description: 'Cancela un turno de un cliente.',
    input_schema: {
      type: 'object',
      properties: {
        cliente: { type: 'string' },
        fecha: { type: 'string', description: 'Fecha del turno YYYY-MM-DD (si tiene varios)' }
      },
      required: ['cliente']
    }
  },
  {
    name: 'gestumio_cobrar_cuota',
    description: 'Registra el cobro de la CUOTA pendiente de un cliente inscripto (paga la mas vieja). Distinto de un cobro suelto.',
    input_schema: {
      type: 'object',
      properties: {
        cliente: { type: 'string' },
        monto: { type: 'number', description: 'Monto cobrado (opcional; por defecto la cuota completa)' },
        medio_pago: { type: 'string' }
      },
      required: ['cliente']
    }
  },
  {
    name: 'gestumio_liquidacion',
    description: 'Liquidacion de un empleado. confirmar=false (default) solo CALCULA y muestra; confirmar=true la REGISTRA en Gestumio. Periodo por defecto: mes actual.',
    input_schema: {
      type: 'object',
      properties: {
        empleado: { type: 'string' },
        desde: { type: 'string', description: 'YYYY-MM-DD (opcional)' },
        hasta: { type: 'string', description: 'YYYY-MM-DD (opcional)' },
        confirmar: { type: 'boolean', description: 'true para registrarla' },
        marcar_pagada: { type: 'boolean', description: 'true si ya se la pagaste' }
      },
      required: ['empleado']
    }
  },
  {
    name: 'gestumio_borrar_ultimo',
    description: 'Borra lo ULTIMO que se cargo en Gestumio por el bot (gasto, cobro, cliente o turno). Usar para "borra eso", "eliminá lo ultimo", "me equivoque".',
    input_schema: { type: 'object', properties: {} }
  },
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
export async function ejecutarTool(nombre, input, ctx) {
  const { userId, chatId } = ctx;
  switch (nombre) {
    case 'registrar_gasto': {
      const fecha = normalizarFecha(input.fecha);
      const info = db.prepare(
        'INSERT INTO gastos (user_id, monto, categoria, medio_pago, descripcion, fecha) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(userId, input.monto, input.categoria || 'otros', input.medio_pago || null, input.descripcion || null, fecha);
      return { ok: true, id: info.lastInsertRowid, monto: input.monto, categoria: input.categoria || 'otros', medio_pago: input.medio_pago || null, descripcion: input.descripcion || null, fecha };
    }

    case 'registrar_ingreso': {
      const fecha = normalizarFecha(input.fecha);
      const info = db.prepare(
        'INSERT INTO ingresos (user_id, monto, categoria, medio_pago, descripcion, fecha) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(userId, input.monto, input.categoria || 'otros', input.medio_pago || null, input.descripcion || null, fecha);
      return { ok: true, id: info.lastInsertRowid, monto: input.monto, categoria: input.categoria || 'otros', medio_pago: input.medio_pago || null, descripcion: input.descripcion || null, fecha };
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
        `SELECT id, monto, categoria, medio_pago, descripcion, fecha FROM gastos WHERE ${where} ORDER BY fecha DESC, id DESC LIMIT 50`
      ).all(...args);
      const porCategoria = db.prepare(
        `SELECT categoria, SUM(monto) AS total FROM gastos WHERE ${where} GROUP BY categoria ORDER BY total DESC`
      ).all(...args);
      const porMedio = db.prepare(
        `SELECT COALESCE(medio_pago,'sin especificar') AS medio_pago, SUM(monto) AS total FROM gastos WHERE ${where} GROUP BY medio_pago ORDER BY total DESC`
      ).all(...args);
      return { ok: true, total, total_texto: fmtPesos(total), cantidad: detalle.length, por_categoria: porCategoria, por_medio_pago: porMedio, detalle };
    }

    case 'listar_personas': {
      const personas = db.prepare('SELECT * FROM personas WHERE user_id = ? ORDER BY nombre').all(userId);
      const salida = personas.map(p => {
        const saldo = saldoPersona(userId, p.id);
        return { id: p.id, nombre: p.nombre, saldo, saldo_texto: fmtPesos(saldo) };
      });
      return { ok: true, personas: salida };
    }

    case 'consultar_ingresos': {
      const cond = ['user_id = ?'];
      const args = [userId];
      if (input.desde) { cond.push('fecha >= ?'); args.push(normalizarFecha(input.desde)); }
      if (input.hasta) { cond.push('fecha <= ?'); args.push(normalizarFecha(input.hasta)); }
      const where = cond.join(' AND ');
      const total = db.prepare(`SELECT COALESCE(SUM(monto),0) AS t FROM ingresos WHERE ${where}`).get(...args).t;
      const detalle = db.prepare(
        `SELECT id, monto, categoria, medio_pago, descripcion, fecha FROM ingresos WHERE ${where} ORDER BY fecha DESC, id DESC LIMIT 50`
      ).all(...args);
      const porCategoria = db.prepare(
        `SELECT categoria, SUM(monto) AS total FROM ingresos WHERE ${where} GROUP BY categoria ORDER BY total DESC`
      ).all(...args);
      const porMedio = db.prepare(
        `SELECT COALESCE(medio_pago,'sin especificar') AS medio_pago, SUM(monto) AS total FROM ingresos WHERE ${where} GROUP BY medio_pago ORDER BY total DESC`
      ).all(...args);
      return { ok: true, total, total_texto: fmtPesos(total), cantidad: detalle.length, por_categoria: porCategoria, por_medio_pago: porMedio, detalle };
    }

    case 'consultar_balance': {
      const cond = ['user_id = ?'];
      const args = [userId];
      if (input.desde) { cond.push('fecha >= ?'); args.push(normalizarFecha(input.desde)); }
      if (input.hasta) { cond.push('fecha <= ?'); args.push(normalizarFecha(input.hasta)); }
      const where = cond.join(' AND ');
      const ingresos = db.prepare(`SELECT COALESCE(SUM(monto),0) AS t FROM ingresos WHERE ${where}`).get(...args).t;
      const gastos = db.prepare(`SELECT COALESCE(SUM(monto),0) AS t FROM gastos WHERE ${where}`).get(...args).t;
      const balance = ingresos - gastos;
      return { ok: true, ingresos, gastos, balance, ingresos_texto: fmtPesos(ingresos), gastos_texto: fmtPesos(gastos), balance_texto: fmtPesos(balance) };
    }

    case 'borrar_ultimo': {
      const tipo = input.tipo || 'ultimo';
      const borrarDe = (tabla, etiqueta) => {
        const row = db.prepare(`SELECT * FROM ${tabla} WHERE user_id = ? ORDER BY id DESC LIMIT 1`).get(userId);
        if (!row) return null;
        db.prepare(`DELETE FROM ${tabla} WHERE id = ?`).run(row.id);
        return { etiqueta, row };
      };
      if (tipo === 'gasto') { const r = borrarDe('gastos', 'gasto'); return r ? { ok: true, borrado: r.etiqueta, monto: r.row.monto, monto_texto: fmtPesos(r.row.monto), descripcion: r.row.descripcion } : { ok: false, error: 'No hay gastos para borrar.' }; }
      if (tipo === 'ingreso') { const r = borrarDe('ingresos', 'ingreso'); return r ? { ok: true, borrado: r.etiqueta, monto: r.row.monto, monto_texto: fmtPesos(r.row.monto), descripcion: r.row.descripcion } : { ok: false, error: 'No hay ingresos para borrar.' }; }
      if (tipo === 'nota') { const r = borrarDe('notas', 'nota'); return r ? { ok: true, borrado: r.etiqueta, texto: r.row.texto } : { ok: false, error: 'No hay notas para borrar.' }; }
      if (tipo === 'recordatorio') { const r = borrarDe('recordatorios', 'recordatorio'); return r ? { ok: true, borrado: r.etiqueta, texto: r.row.texto } : { ok: false, error: 'No hay recordatorios para borrar.' }; }
      // 'ultimo': el mas reciente entre gasto e ingreso
      const ug = db.prepare('SELECT id, monto, descripcion, creado_en FROM gastos WHERE user_id=? ORDER BY id DESC LIMIT 1').get(userId);
      const ui = db.prepare('SELECT id, monto, descripcion, creado_en FROM ingresos WHERE user_id=? ORDER BY id DESC LIMIT 1').get(userId);
      if (!ug && !ui) return { ok: false, error: 'No hay movimientos para borrar.' };
      let cual = 'gasto', row = ug;
      if (ug && ui) { if (String(ui.creado_en) > String(ug.creado_en)) { cual = 'ingreso'; row = ui; } }
      else if (ui) { cual = 'ingreso'; row = ui; }
      db.prepare(`DELETE FROM ${cual === 'gasto' ? 'gastos' : 'ingresos'} WHERE id = ?`).run(row.id);
      return { ok: true, borrado: cual, monto: row.monto, monto_texto: fmtPesos(row.monto), descripcion: row.descripcion };
    }

    case 'corregir_ultimo': {
      const tipo = input.tipo === 'ingreso' ? 'ingreso' : 'gasto';
      const tabla = tipo === 'ingreso' ? 'ingresos' : 'gastos';
      const row = db.prepare(`SELECT * FROM ${tabla} WHERE user_id = ? ORDER BY id DESC LIMIT 1`).get(userId);
      if (!row) return { ok: false, error: `No hay ${tipo}s para corregir.` };
      const sets = [];
      const args = [];
      if (input.monto != null) { sets.push('monto = ?'); args.push(input.monto); }
      if (input.descripcion != null) { sets.push('descripcion = ?'); args.push(input.descripcion); }
      if (input.categoria != null) { sets.push('categoria = ?'); args.push(input.categoria); }
      if (input.medio_pago != null) { sets.push('medio_pago = ?'); args.push(input.medio_pago); }
      if (sets.length === 0) return { ok: false, error: 'No indicaste que corregir (monto, descripcion, categoria o medio de pago).' };
      args.push(row.id);
      db.prepare(`UPDATE ${tabla} SET ${sets.join(', ')} WHERE id = ?`).run(...args);
      const nuevo = db.prepare(`SELECT * FROM ${tabla} WHERE id = ?`).get(row.id);
      return { ok: true, tipo, monto: nuevo.monto, monto_texto: fmtPesos(nuevo.monto), categoria: nuevo.categoria, medio_pago: nuevo.medio_pago, descripcion: nuevo.descripcion, fecha: nuevo.fecha };
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

    // --- GESTUMIO ---
    case 'gestumio_cargar_gasto': {
      if (!estaVinculado(userId)) return { ok: false, error: 'No estas vinculado a Gestumio. Deci al usuario que use /vincular con el codigo de Ajustes.' };
      const r = await gestumio.cargarGasto(userId, { amount: input.monto, category: input.categoria, description: input.descripcion, paymentMethod: input.medio_pago, date: input.fecha });
      if (r.ok) guardarUltimo(userId, 'expense', r.data.id, `gasto $${input.monto} (${input.categoria})`);
      return r.ok ? { ok: true, ...r.data } : { ok: false, error: r.error };
    }
    case 'gestumio_registrar_cobro': {
      if (!estaVinculado(userId)) return { ok: false, error: 'No estas vinculado a Gestumio. Deci al usuario que use /vincular con el codigo de Ajustes.' };
      const r = await gestumio.registrarCobro(userId, { amount: input.monto, description: input.descripcion, clientName: input.cliente, date: input.fecha });
      if (r.ok) guardarUltimo(userId, 'income', r.data.id, `cobro $${input.monto}`);
      return r.ok ? { ok: true, ...r.data } : { ok: false, error: r.error };
    }
    case 'gestumio_crear_cliente': {
      if (!estaVinculado(userId)) return { ok: false, error: 'No estas vinculado a Gestumio. Deci al usuario que use /vincular con el codigo de Ajustes.' };
      const r = await gestumio.crearCliente(userId, { name: input.nombre, phone: input.telefono, email: input.email, dni: input.dni, cuit: input.cuit, notes: input.notas });
      if (r.ok) guardarUltimo(userId, 'client', r.data.id, `cliente ${input.nombre}`);
      return r.ok ? { ok: true, ...r.data } : { ok: false, error: r.error };
    }
    case 'gestumio_consultar': {
      if (!estaVinculado(userId)) return { ok: false, error: 'No estas vinculado a Gestumio. Deci al usuario que use /vincular con el codigo de Ajustes.' };
      const params = { type: input.tipo };
      if (input.cliente) params.name = input.cliente;
      const r = await gestumio.consultar(userId, params);
      return r.ok ? { ok: true, ...r.data } : { ok: false, error: r.error };
    }

    case 'gestumio_crear_turno': {
      if (!estaVinculado(userId)) return { ok: false, error: 'No estas vinculado a Gestumio. Deci al usuario que use /vincular.' };
      const r = await gestumio.crearTurno(userId, { clientName: input.cliente, serviceName: input.servicio, date: input.fecha, startTime: input.hora, employeeName: input.empleado, price: input.precio, description: input.descripcion });
      if (r.ok) guardarUltimo(userId, 'appointment', r.data.id, `turno de ${input.cliente}`);
      return r.ok ? { ok: true, ...r.data } : { ok: false, error: r.error };
    }
    case 'gestumio_reprogramar_turno': {
      if (!estaVinculado(userId)) return { ok: false, error: 'No estas vinculado a Gestumio. Deci al usuario que use /vincular.' };
      const r = await gestumio.reprogramarTurno(userId, { clientName: input.cliente, fromDate: input.fecha_actual, newDate: input.nueva_fecha, newTime: input.nueva_hora });
      return r.ok ? { ok: true, ...r.data } : { ok: false, error: r.error };
    }
    case 'gestumio_cancelar_turno': {
      if (!estaVinculado(userId)) return { ok: false, error: 'No estas vinculado a Gestumio. Deci al usuario que use /vincular.' };
      const r = await gestumio.cancelarTurno(userId, { clientName: input.cliente, date: input.fecha });
      return r.ok ? { ok: true, ...r.data } : { ok: false, error: r.error };
    }
    case 'gestumio_cobrar_cuota': {
      if (!estaVinculado(userId)) return { ok: false, error: 'No estas vinculado a Gestumio. Deci al usuario que use /vincular.' };
      const r = await gestumio.cobrarCuota(userId, { clientName: input.cliente, amount: input.monto, method: input.medio_pago });
      return r.ok ? { ok: true, ...r.data } : { ok: false, error: r.error };
    }
    case 'gestumio_liquidacion': {
      if (!estaVinculado(userId)) return { ok: false, error: 'No estas vinculado a Gestumio. Deci al usuario que use /vincular.' };
      if (input.confirmar) {
        const r = await gestumio.liquidacionConfirmar(userId, { empleado: input.empleado, desde: input.desde, hasta: input.hasta, marcarPagada: input.marcar_pagada });
        if (r.ok) guardarUltimo(userId, 'payroll', r.data.id, `liquidacion de ${input.empleado}`);
        return r.ok ? { ok: true, confirmada: true, ...r.data } : { ok: false, error: r.error };
      }
      const r = await gestumio.liquidacionPreview(userId, { empleado: input.empleado, ...(input.desde ? { desde: input.desde } : {}), ...(input.hasta ? { hasta: input.hasta } : {}) });
      return r.ok ? { ok: true, confirmada: false, ...r.data } : { ok: false, error: r.error };
    }
    case 'gestumio_borrar_ultimo': {
      if (!estaVinculado(userId)) return { ok: false, error: 'No estas vinculado a Gestumio. Deci al usuario que use /vincular.' };
      const u = getUltimo(userId);
      if (!u) return { ok: false, error: 'No tengo registrado nada reciente cargado por el bot para borrar.' };
      const r = await gestumio.borrar(userId, { entity: u.entity, id: u.record_id });
      return r.ok ? { ok: true, borrado: u.descripcion || u.entity } : { ok: false, error: r.error };
    }

    default:
      return { ok: false, error: `Tool desconocida: ${nombre}` };
  }
}

// Lista de personas (para inyectar en el system prompt y ayudar a normalizar nombres)
export function personasDelUsuario(userId) {
  return db.prepare('SELECT nombre FROM personas WHERE user_id = ? ORDER BY nombre').all(userId).map(r => r.nombre);
}
