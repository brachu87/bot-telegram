import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import routes from './routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEBAPP_DIST = path.resolve(__dirname, '../../webapp/dist');

export function crearApp() {
  const app = express();
  app.use(express.json());

  // API
  app.use('/api', routes);

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // Servir la Mini App compilada (estaticos) si existe
  if (fs.existsSync(WEBAPP_DIST)) {
    app.use(express.static(WEBAPP_DIST));
    // SPA fallback (cualquier ruta que no sea /api devuelve el index.html)
    app.get(/^(?!\/api).*/, (req, res) => {
      res.sendFile(path.join(WEBAPP_DIST, 'index.html'));
    });
  } else {
    app.get('/', (req, res) => {
      res.send('La Mini App todavia no fue compilada. Corré: npm run build:webapp');
    });
  }

  // Manejo de errores central
  app.use((err, req, res, next) => {
    console.error('Error en la API:', err);
    res.status(500).json({ error: 'Error interno' });
  });

  return app;
}
