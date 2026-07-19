import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Agenda() {
  const [recordatorios, setRecordatorios] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.recordatorios()
      .then(d => setRecordatorios(d.recordatorios))
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div className="screen"><div className="center">⚠️ {error}</div></div>;
  if (!recordatorios) return <div className="screen"><div className="loader">Cargando…</div></div>;

  return (
    <div className="screen">
      <div className="h1">Próximos recordatorios</div>
      {recordatorios.length === 0 ? (
        <div className="center">No tenés recordatorios pendientes ⏰</div>
      ) : (
        <div className="card">
          {recordatorios.map(r => (
            <div key={r.id} className="row">
              <div>
                <div className="row-title">{r.texto}</div>
                <div className="row-sub">{r.cuando}</div>
              </div>
              <span>⏰</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
