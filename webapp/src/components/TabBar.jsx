import React from 'react';

const TABS = [
  { id: 'resumen', icon: '📊', label: 'Resumen' },
  { id: 'movimientos', icon: '💸', label: 'Movim.' },
  { id: 'personas', icon: '👥', label: 'Personas' },
  { id: 'agenda', icon: '⏰', label: 'Agenda' },
  { id: 'notas', icon: '📝', label: 'Notas' }
];

export default function TabBar({ tab, setTab }) {
  return (
    <nav className="tabbar">
      {TABS.map(t => (
        <button
          key={t.id}
          className={tab === t.id ? 'active' : ''}
          onClick={() => setTab(t.id)}
        >
          <span className="icon">{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}
