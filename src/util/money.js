// Formatea un monto en pesos argentinos: $50.000
export function fmtPesos(monto) {
  const n = Math.round(Number(monto) || 0);
  return '$' + n.toLocaleString('es-AR');
}

// Nota: la interpretacion de "lucas"/"palos" la hace Claude en el system prompt,
// que ya convierte a numeros antes de llamar las tools. Esta funcion es solo
// una red de seguridad por si llega un string con esos terminos.
export function parseMonto(valor) {
  if (typeof valor === 'number') return valor;
  if (!valor) return 0;
  let s = String(valor).toLowerCase().trim();
  s = s.replace(/\$/g, '').replace(/\./g, '').replace(/,/g, '.');
  let mult = 1;
  if (/luca/.test(s)) mult = 1000;
  if (/palo/.test(s)) mult = 1000000;
  const num = parseFloat(s.replace(/[^0-9.]/g, ''));
  return isNaN(num) ? 0 : num * mult;
}
