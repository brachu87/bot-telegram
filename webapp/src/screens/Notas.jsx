import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Notas() {
  const [query, setQuery] = useState('');
  const [notas, setNotas] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api.notas(query)
        .then(d => setNotas(d.notas))
        .catch(e => setError(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  return (
    <div className="screen">
      <div className="h1">Notas</div>
      <input
        className="search"
        placeholder="Buscar…"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      {error && <div className="center">⚠️ {error}</div>}
      {!notas && !error && <div className="loader">Cargando…</div>}
      {notas && notas.length === 0 && <div className="center">Sin notas.</div>}
      {notas && notas.length > 0 && (
        <div className="card">
          {notas.map(n => (
            <div key={n.id} className="row">
              <div>
                <div className="row-title">{n.texto}</div>
                {n.etiqueta && <span className="tag">{n.etiqueta}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
