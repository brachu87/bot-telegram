import PDFDocument from 'pdfkit';
import { reunirDatos } from './datos.js';
import { fmtPesos } from '../util/money.js';
import { ahora } from '../util/dates.js';

// Genera un Buffer con un PDF del usuario.
export function generarPDF(userId, desde, hasta, opciones = {}) {
  const d = reunirDatos(userId, desde, hasta, opciones);
  const inc = d.incluir;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const AZUL = '#2481cc';
    const h1 = (t) => doc.moveDown(0.6).fillColor(AZUL).fontSize(15).text(t).fillColor('black').moveDown(0.3);
    const linea = (t, opts = {}) => doc.fontSize(10).text(t, opts);

    // Encabezado
    doc.fillColor(AZUL).fontSize(20).text('Reporte de mi asistente', { align: 'left' });
    doc.fillColor('#666').fontSize(9)
      .text('Generado el ' + ahora().setLocale('es').toFormat("dd/LL/yyyy HH:mm"));
    const rango = d.rango.desde || d.rango.hasta
      ? `Período: ${d.rango.desde || 'inicio'} a ${d.rango.hasta || 'hoy'}`
      : 'Período: todos los datos';
    doc.text(rango);
    doc.fillColor('black');

    // Resumen
    if (inc.resumen) {
      h1('Resumen');
      linea(`Ingresos: ${fmtPesos(d.totalIngresos)}`);
      linea(`Gastos: ${fmtPesos(d.totalGastos)}`);
      doc.font('Helvetica-Bold'); linea(`Balance: ${fmtPesos(d.balance)}`); doc.font('Helvetica');

      if (d.porCategoria.length) {
        doc.moveDown(0.4).fontSize(11).text('Gastos por categoría:');
        d.porCategoria.forEach(c => linea(`  • ${c.categoria}: ${fmtPesos(c.total)}`));
      }
    }

    // Personas y deudas
    if (inc.personas && d.personas.length) {
      h1('Personas y deudas');
      d.personas.forEach(p => {
        doc.font('Helvetica-Bold').fontSize(11)
          .text(`${p.nombre} — ${p.saldo > 0 ? 'le debés ' + fmtPesos(p.saldo) : 'saldado'}`);
        doc.font('Helvetica').fontSize(9).fillColor('#555');
        p.movimientos.forEach(m => {
          doc.text(`   ${m.fecha}  ${m.tipo === 'deuda' ? 'Deuda' : 'Pago'}${m.concepto ? ' · ' + m.concepto : ''}: ${fmtPesos(m.monto)}`);
        });
        doc.fillColor('black');
      });
    }

    // Gastos (detalle)
    if (inc.gastos && d.gastos.length) {
      h1('Gastos (detalle)');
      d.gastos.forEach(g => linea(`${g.fecha}  [${g.categoria}]${g.medio_pago ? ' (' + g.medio_pago + ')' : ''} ${g.descripcion || ''} — ${fmtPesos(g.monto)}`));
    }

    // Ingresos
    if (inc.ingresos && d.ingresos.length) {
      h1('Ingresos');
      d.ingresos.forEach(g => linea(`${g.fecha}  [${g.categoria}]${g.medio_pago ? ' (' + g.medio_pago + ')' : ''} ${g.descripcion || ''} — ${fmtPesos(g.monto)}`));
    }

    // Notas
    if (inc.notas && d.notas.length) {
      h1('Notas');
      d.notas.forEach(n => linea(`• ${n.texto}${n.etiqueta ? '  (' + n.etiqueta + ')' : ''}`));
    }

    // Recordatorios
    if (inc.recordatorios && d.recordatorios.length) {
      h1('Recordatorios');
      d.recordatorios.forEach(r => linea(`• ${r.cuando} — ${r.texto}${r.enviado ? ' (enviado)' : ''}`));
    }

    doc.end();
  });
}
