import React, { useState } from 'react';
import TabBar from './components/TabBar.jsx';
import Resumen from './screens/Resumen.jsx';
import Personas from './screens/Personas.jsx';
import Agenda from './screens/Agenda.jsx';
import Notas from './screens/Notas.jsx';

export default function App() {
  const [tab, setTab] = useState('resumen');

  return (
    <>
      {tab === 'resumen' && <Resumen />}
      {tab === 'personas' && <Personas />}
      {tab === 'agenda' && <Agenda />}
      {tab === 'notas' && <Notas />}
      <TabBar tab={tab} setTab={setTab} />
    </>
  );
}
