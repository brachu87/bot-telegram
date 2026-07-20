import ExcelJS from 'exceljs';
import { reunirDatos } from './datos.js';

// Genera un Buffer con un Excel (.xlsx) del usuario.
export async function generarExcel(userId, desde, hasta, opciones = {}) {
  const d = reunirDatos(userId, desde, hasta, opciones);
  const inc = d.incluir;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Asistente Telegram';
  wb.created = new Date();

  const MONEY = '"$"#,##0';
  const titulo = (ws, txt) => {
    ws.mergeCells('A1', 'D1');
    ws.getCell('A1').value = txt;
    ws.getCell('A1').font = { bold: true, size: 14 };
    ws.addRow([]);
  };
  const encabezado = (row) => {
    row.font = { bold: true };
    row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9EEF5' } }; });
  };

  // --- Resumen ---
  if (inc.resumen) {
    const wsR = wb.addWorksheet('Resumen');
    titulo(wsR, 'Resumen');
    wsR.addRow(['Ingresos', d.totalIngresos]).getCell(2).numFmt = MONEY;
    wsR.addRow(['Gastos', d.totalGastos]).getCell(2).numFmt = MONEY;
    wsR.addRow(['Balance', d.balance]).getCell(2).numFmt = MONEY;
    wsR.addRow([]);
    const hCat = wsR.addRow(['Categoría', 'Total']); encabezado(hCat);
    d.porCategoria.forEach(c => { wsR.addRow([c.categoria, c.total]).getCell(2).numFmt = MONEY; });
    wsR.getColumn(1).width = 24; wsR.getColumn(2).width = 16;
  }

  // --- Gastos ---
  if (inc.gastos) {
    const wsG = wb.addWorksheet('Gastos');
    const hG = wsG.addRow(['Fecha', 'Categoría', 'Descripción', 'Monto']); encabezado(hG);
    d.gastos.forEach(g => {
      const r = wsG.addRow([g.fecha, g.categoria, g.descripcion || '', g.monto]);
      r.getCell(4).numFmt = MONEY;
    });
    wsG.columns.forEach((c, i) => c.width = [14, 18, 34, 14][i]);
  }

  // --- Ingresos ---
  if (inc.ingresos) {
    const wsI = wb.addWorksheet('Ingresos');
    const hI = wsI.addRow(['Fecha', 'Descripción', 'Monto']); encabezado(hI);
    d.ingresos.forEach(g => {
      const r = wsI.addRow([g.fecha, g.descripcion || '', g.monto]);
      r.getCell(3).numFmt = MONEY;
    });
    wsI.columns.forEach((c, i) => c.width = [14, 40, 14][i]);
  }

  // --- Personas y deudas ---
  if (inc.personas) {
    const wsP = wb.addWorksheet('Personas');
    const hP = wsP.addRow(['Persona', 'Saldo (te debe)']); encabezado(hP);
    d.personas.forEach(p => { wsP.addRow([p.nombre, p.saldo]).getCell(2).numFmt = MONEY; });
    wsP.addRow([]);
    const hM = wsP.addRow(['Persona', 'Tipo', 'Concepto', 'Fecha', 'Monto']); encabezado(hM);
    d.personas.forEach(p => p.movimientos.forEach(m => {
      const r = wsP.addRow([p.nombre, m.tipo, m.concepto || '', m.fecha, m.monto]);
      r.getCell(5).numFmt = MONEY;
    }));
    wsP.columns.forEach((c, i) => c.width = [20, 10, 26, 14, 14][i]);
  }

  // --- Notas ---
  if (inc.notas) {
    const wsN = wb.addWorksheet('Notas');
    const hN = wsN.addRow(['Fecha', 'Etiqueta', 'Nota']); encabezado(hN);
    d.notas.forEach(n => wsN.addRow([(n.creado_en || '').slice(0, 10), n.etiqueta || '', n.texto]));
    wsN.columns.forEach((c, i) => c.width = [14, 16, 50][i]);
  }

  // --- Recordatorios ---
  if (inc.recordatorios) {
    const wsRec = wb.addWorksheet('Recordatorios');
    const hRec = wsRec.addRow(['Cuándo', 'Recordatorio', 'Enviado']); encabezado(hRec);
    d.recordatorios.forEach(r => wsRec.addRow([r.cuando, r.texto, r.enviado ? 'sí' : 'no']));
    wsRec.columns.forEach((c, i) => c.width = [22, 44, 10][i]);
  }

  // Excel necesita al menos una hoja
  if (wb.worksheets.length === 0) wb.addWorksheet('Reporte').addRow(['Sin datos para el filtro pedido']);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
