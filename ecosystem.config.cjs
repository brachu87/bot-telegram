// Configuracion para pm2 (dejar el bot corriendo en un VPS).
// Uso:  pm2 start ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'asistente-telegram',
      script: 'src/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
