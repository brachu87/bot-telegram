import React, { useEffect, useState } from 'react';
import { api, fmtPesos } from '../api.js';

// Rangos de periodo (igual que en Resumen)
function rangos() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const iso = (d) => d.toISOString().slice(0, 10);
  const finMes = (yy, mm) => new Date(yy, mm + 1, 0);
  return {
    mes: { desde: iso(new Date(y, m, 1)), hasta: iso(finMes(y, m)) },
    mesAnterior: { desde: iso(new Date(y, m - 1, 1)), hasta: iso(finMes(y, m - 1)) },
    anio: { desde: iso(new Date(y, 0, 1)), hasta: iso(new Date(y, 11, 31)) }
  };
}

export default function Movimientos() {
  const [periodo, setPeriodo] = useState('mes');
  const [movs, setMovs] = useState(null);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0); // para refrescar

  useEffect(() => {
    let vivo = true;
    setMovs(null);
    setError(null);
    const r = rangos()[periodo];
    api.movimientos(r.desde, r.hasta)
      .then(d => vivo && setMovs(d.movimientos))
      .catch(e => vivo && setError(e.message));
    return () => { vivo = false; };
  }, [periodo, tick]);

  const totalIng = (movs || []).filter(m => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
  const totalGas = (movs || []).filter(m => m.tipo === 'gasto').reduce((s, m) => s + m.monto, 0);

  return (
    <div className="screen">
      <div className="header-row">
        <div className="h1">Movimientos</div>
        <button className="refresh-btn" onClick={() => setTick(t => t + 1)}>↻</button>
      </div>

      <div className="period">
        <button className={periodo === 'mes' ? 'active' : ''} onClick={() => setPeriodo('mes')}>Este mes</button>
        <button className={periodo === 'mesAnterior' ? 'active' : ''} onClick={() => setPeriodo('mesAnterior')}>Mes pasado</button>
        <button className={periodo === 'anio' ? 'active' : ''} onClick={() => setPeriodo('anio')}>Este año</button>
      </div>

      {error && <div className="center">⚠️ {error}</div>}
      {!movs && !error && <div className="loader">Cargando…</div>}

      {movs && (
        <>
          <div className="stat-grid" style={{ marginBottom: 14 }}>
            <div className="stat"><div className="label">Ingresos</div><div className="value pos">{fmtPesos(totalIng)}</div></div>
            <div className="stat"><div className="label">Gastos</div><div className="value neg">{fmtPesos(totalGas)}</div></div>
          </div>

          {movs.length === 0 ? (
            <div className="center">Sin movimientos en este período.</div>
          ) : (
            <div className="card">
              {movs.map((m, i) => (
                <div key={i} className="row">
                  <div>
                    <div className="row-title">{m.detalle}</div>
                    <div className="row-sub">{m.fecha}{m.categoria ? ` · ${m.categoria}` : ''}</div>
                  </div>
                  <div className={'badge ' + (m.tipo === 'ingreso' ? 'pos' : 'neg')}>
                    {m.tipo === 'ingreso' ? '+' : '−'}{fmtPesos(m.monto)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
