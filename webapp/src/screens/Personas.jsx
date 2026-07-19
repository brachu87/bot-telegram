import React, { useEffect, useState } from 'react';
import { api, fmtPesos } from '../api.js';

function Movimiento({ m }) {
  const esDeuda = m.tipo === 'deuda';
  return (
    <div className="row">
      <div>
        <div className="row-title">{esDeuda ? 'Deuda' : 'Pago'}{m.concepto ? ` · ${m.concepto}` : ''}</div>
        <div className="row-sub">{m.fecha}</div>
      </div>
      <div className={'badge ' + (esDeuda ? 'neg' : 'pos')}>
        {esDeuda ? '+' : '−'}{fmtPesos(m.monto)}
      </div>
    </div>
  );
}

export default function Personas() {
  const [personas, setPersonas] = useState(null);
  const [error, setError] = useState(null);
  const [sel, setSel] = useState(null);

  useEffect(() => {
    api.personas()
      .then(d => setPersonas(d.personas))
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="screen"><div className="center">⚠️ {error}</div></div>;
  if (!personas) return <div className="screen"><div className="loader">Cargando…</div></div>;

  // Detalle de una persona
  if (sel) {
    return (
      <div className="screen">
        <button className="back-link" onClick={() => setSel(null)}>← Volver</button>
        <div className="h1">{sel.nombre}</div>
        <div className="card">
          <div className="h2">Saldo actual</div>
          <div className={'balance-num ' + (sel.saldo > 0 ? 'neg' : 'pos')}>{fmtPesos(sel.saldo)}</div>
          <div className="hint">{sel.saldo > 0 ? 'Le debés esta plata.' : 'Estás al día 👍'}</div>
        </div>
        <div className="card">
          <div className="h2">Movimientos</div>
          {sel.movimientos.length === 0
            ? <div className="hint">Sin movimientos.</div>
            : sel.movimientos.map(m => <Movimiento key={m.id} m={m} />)}
        </div>
      </div>
    );
  }

  // Lista de personas
  return (
    <div className="screen">
      <div className="h1">Personas y deudas</div>
      {personas.length === 0 ? (
        <div className="center">Todavía no registraste personas.</div>
      ) : (
        <div className="card">
          {personas.map(p => (
            <div key={p.id} className="row" onClick={() => setSel(p)} style={{ cursor: 'pointer' }}>
              <div className="row-title">{p.nombre}</div>
              <div className={'badge ' + (p.saldo > 0 ? 'neg' : 'pos')}>
                {p.saldo > 0 ? fmtPesos(p.saldo) : 'saldado'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
