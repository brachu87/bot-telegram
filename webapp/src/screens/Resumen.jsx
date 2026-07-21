import React, { useEffect, useState } from 'react';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { api, fmtPesos, descargar } from '../api.js';

const COLORS = ['#2481cc', '#e0393e', '#1a9d4b', '#f5a623', '#9b51e0', '#00b8d9', '#ff6b6b', '#8e8e93'];

// Rangos de periodo calculados en el navegador
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

export default function Resumen() {
  const [periodo, setPeriodo] = useState('mes');
  const [resumen, setResumen] = useState(null);
  const [gastos, setGastos] = useState(null);
  const [mensual, setMensual] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [bajando, setBajando] = useState(null);
  const [tick, setTick] = useState(0); // para refrescar manualmente

  async function exportar(formato) {
    try {
      setBajando(formato);
      const r = rangos()[periodo];
      await descargar(formato, r.desde, r.hasta);
    } catch (e) {
      alert('No pude descargar el archivo: ' + e.message);
    } finally {
      setBajando(null);
    }
  }

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    const r = rangos()[periodo];
    Promise.all([
      api.resumen(r.desde, r.hasta),
      api.gastos(r.desde, r.hasta),
      api.gastosMensual(6)
    ])
      .then(([res, gas, men]) => {
        if (!vivo) return;
        setResumen(res);
        setGastos(gas);
        setMensual(men);
      })
      .catch(e => vivo && setError(e.message))
      .finally(() => vivo && setCargando(false));
    return () => { vivo = false; };
  }, [periodo, tick]);

  if (error) return <div className="screen"><div className="center">⚠️ {error}</div></div>;
  if (cargando || !resumen) return <div className="screen"><div className="loader">Cargando…</div></div>;

  const pieData = (gastos?.por_categoria || []).map(c => ({ name: c.categoria, value: c.total }));
  const barData = (mensual?.serie || []).map(s => ({ name: s.etiqueta, Gastos: s.gastos, Ingresos: s.ingresos }));
  const balance = resumen.balance;

  return (
    <div className="screen">
      <div className="header-row">
        <div className="h1">Mi resumen</div>
        <button className="refresh-btn" onClick={() => setTick(t => t + 1)}>↻</button>
      </div>

      <div className="period">
        <button className={periodo === 'mes' ? 'active' : ''} onClick={() => setPeriodo('mes')}>Este mes</button>
        <button className={periodo === 'mesAnterior' ? 'active' : ''} onClick={() => setPeriodo('mesAnterior')}>Mes pasado</button>
        <button className={periodo === 'anio' ? 'active' : ''} onClick={() => setPeriodo('anio')}>Este año</button>
      </div>

      <div className="card">
        <div className="h2">Balance del período</div>
        <div className={'balance-num ' + (balance >= 0 ? 'pos' : 'neg')}>{fmtPesos(balance)}</div>
        <div className="stat-grid" style={{ marginTop: 12 }}>
          <div className="stat">
            <div className="label">Ingresos</div>
            <div className="value pos">{fmtPesos(resumen.ingresos)}</div>
          </div>
          <div className="stat">
            <div className="label">Gastos</div>
            <div className="value neg">{fmtPesos(resumen.gastos)}</div>
          </div>
        </div>
        <div className="export-row">
          <button disabled={!!bajando} onClick={() => exportar('excel')}>
            {bajando === 'excel' ? '…' : '⬇️ Excel'}
          </button>
          <button disabled={!!bajando} onClick={() => exportar('pdf')}>
            {bajando === 'pdf' ? '…' : '⬇️ PDF'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="h2">Gastos por categoría</div>
        {pieData.length === 0 ? (
          <div className="hint">Sin gastos en este período.</div>
        ) : (
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e) => e.name}>
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => fmtPesos(v)} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <div className="h2">Evolución (últimos 6 meses)</div>
        {barData.length === 0 ? (
          <div className="hint">Sin datos.</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={10} tickFormatter={(v) => v >= 1000 ? `${Math.round(v / 1000)}k` : v} />
              <Tooltip formatter={(v) => fmtPesos(v)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Ingresos" fill="#1a9d4b" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Gastos" fill="#e0393e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
