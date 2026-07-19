# 🤖 Asistente personal por Telegram

Un bot de Telegram que funciona como tu **agenda, anotador y gestor de finanzas** — le mandás un **audio** (o texto) y él anota gastos, ingresos, deudas y pagos a personas (por ejemplo, empleados), te crea recordatorios y guarda notas. Además viene con una **Mini App con gráficos** para ver todo tu resumen desde adentro de Telegram.

No necesitás saber programar para ponerlo a andar: seguí los pasos de abajo tal cual.

---

## ✨ Qué hace

- **Entendé audios**: le mandás una nota de voz y la transcribe (Whisper de Groq).
- **Finanzas**: "gasté 15 lucas en el súper", "cobré 300 lucas", "le debo 50 lucas a Juan por el sábado", "le pagué 20 lucas a Juan".
- **Deudas por persona**: lleva el saldo de cuánto le debés a cada uno.
- **Recordatorios**: "recordame mañana a las 9 llamar al contador" → te avisa a esa hora.
- **Notas**: "anotá que la clave del wifi es 1234".
- **Mini App 📊**: gráficos de gastos por categoría, evolución mensual, deudas por persona, agenda y notas.

Siempre te responde en español rioplatense, corto y claro, y **repite lo que anotó** para que puedas corregir si transcribió mal.

---

## 🧩 Qué vas a necesitar (3 claves gratis)

Antes de arrancar, conseguí estas tres cosas. Guardalas en un bloc de notas, las vas a pegar en un archivo `.env` más adelante.

### 1. Token del bot de Telegram (`TELEGRAM_BOT_TOKEN`)

1. Abrí Telegram y buscá **@BotFather** (el oficial tiene tilde azul de verificado).
2. Mandale `/newbot`.
3. Te va a pedir un **nombre** (ej: "Mi Asistente") y un **usuario** que termine en `bot` (ej: `mi_asistente_bot`).
4. Cuando termines, te da un texto tipo `123456789:ABCdef...`. **Ese es tu token.**

### 2. Clave de Groq (`GROQ_API_KEY`) — para transcribir los audios

1. Entrá a https://console.groq.com y creá una cuenta (es gratis).
2. Andá a **API Keys** → **Create API Key**.
3. Copiá la clave (empieza con `gsk_...`).

### 3. Clave de Anthropic (`ANTHROPIC_API_KEY`) — el "cerebro" del bot

1. Entrá a https://console.anthropic.com y creá una cuenta.
2. Andá a **API Keys** → **Create Key**.
3. Copiá la clave (empieza con `sk-ant-...`).

> 💡 Groq y Anthropic pueden pedirte cargar un método de pago. El uso de un asistente personal es muy bajo (centavos por día).

---

## 💻 Instalar y correr (en tu compu, para probar)

Necesitás tener **Node.js 18 o superior** instalado. Si no lo tenés, bajalo de https://nodejs.org (versión LTS).

### Paso 1 — Instalar las dependencias

Abrí una terminal **dentro de la carpeta del proyecto** y corré:

```bash
npm install
npm run build:webapp
```

El primer comando instala el bot; el segundo compila la Mini App (los gráficos).

### Paso 2 — Poner tus claves

1. Copiá el archivo `.env.example` y renombrá la copia a `.env`.
2. Abrilo con cualquier editor de texto y pegá tus tres claves:

```
TELEGRAM_BOT_TOKEN=123456789:ABCdef...
GROQ_API_KEY=gsk_...
ANTHROPIC_API_KEY=sk-ant-...
```

Lo demás podés dejarlo como está.

### Paso 3 — Arrancar

```bash
npm start
```

Vas a ver algo como:

```
🌐 API + Mini App en http://localhost:3000
⏰ Cron de recordatorios activo (cada minuto).
🤖 Bot @mi_asistente_bot escuchando.
```

¡Listo! Abrí Telegram, buscá tu bot y mandale `/start`. Probá con un texto como *"gasté 5 lucas en un café"* y después con un audio.

---

## 📊 Activar la Mini App (los gráficos dentro de Telegram)

La Mini App necesita estar publicada en una dirección **HTTPS** (Telegram lo exige). Tenés dos caminos:

### Opción A — Solo para probar rápido (túnel en tu compu)

Con el bot corriendo (`npm start`), en **otra terminal** levantá un túnel HTTPS gratis con [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/):

```bash
cloudflared tunnel --url http://localhost:3000
```

Te va a dar una URL tipo `https://algo-al-azar.trycloudflare.com`. Copiala.

Pegá esa URL en tu `.env` como `WEBAPP_URL` y reiniciá el bot (Ctrl+C y `npm start` de nuevo). El bot configura solo el botón de menú.

### Opción B — Para dejarlo andando siempre (VPS + dominio) → ver más abajo.

### Configurar el botón de menú "📊 Ver resumen"

Cuando `WEBAPP_URL` está cargada, el bot configura el botón **automáticamente** al arrancar (usando `setChatMenuButton`). Si querés hacerlo a mano desde **@BotFather**:

1. `/mybots` → elegí tu bot → **Bot Settings** → **Menu Button** → **Configure menu button**.
2. Pegá tu URL HTTPS y poné el texto `📊 Ver resumen`.

Ahora, en el chat con el bot, al lado del campo de texto aparece el botón para abrir tu resumen con gráficos.

---

## 🚀 Dejarlo corriendo 24/7 en un VPS (con HTTPS)

Para que funcione siempre (aunque apagues tu compu), conviene un **VPS** barato (DigitalOcean, Hetzner, etc.) con Ubuntu, y un **dominio** apuntando a su IP.

### 1. Preparar el servidor

```bash
# Instalar Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Subir/clonar el proyecto y entrar a la carpeta
cd asistente-telegram

# Instalar y compilar
npm install
npm run build:webapp

# Crear el .env con tus claves (ver Paso 2 de arriba)
nano .env
```

### 2. HTTPS automático con Caddy

Telegram exige HTTPS para la Mini App. [Caddy](https://caddyserver.com) lo resuelve solo (certificado gratis de Let's Encrypt):

```bash
# Instalar Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

Editá el archivo `/etc/caddy/Caddyfile` usando el ejemplo incluido (`Caddyfile.example`): poné tu dominio y que reenvíe a `localhost:3000`. Después:

```bash
sudo systemctl reload caddy
```

Tu Mini App ya está en `https://tudominio.com`. Poné esa dirección como `WEBAPP_URL` en el `.env`.

### 3. Mantener el bot prendido con pm2

```bash
sudo npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # seguí la instrucción que imprime, para que arranque solo al reiniciar el server
```

Comandos útiles: `pm2 logs` (ver qué pasa), `pm2 restart asistente-telegram` (reiniciar), `pm2 stop asistente-telegram` (parar).

---

## 🗂️ Cómo está organizado el proyecto

```
asistente-telegram/
├── src/
│   ├── index.js          # arranca todo: bot + API + cron
│   ├── db/               # base de datos SQLite (esquema + conexión)
│   ├── bot/              # el bot: mensajes, transcripción, Claude + tools
│   ├── api/              # API para la Mini App + validación de Telegram
│   ├── cron/             # dispara los recordatorios cada minuto
│   └── util/             # helpers de fechas y dinero
├── webapp/               # Mini App en React (los gráficos)
├── .env.example          # plantilla de claves
├── ecosystem.config.cjs  # config de pm2
├── Caddyfile.example     # config de HTTPS
└── README.md
```

Todos los datos se guardan en **un solo archivo SQLite** (`data/asistente.db`), compartido entre el bot y la Mini App. Cada usuario de Telegram ve **solo sus propios datos**.

---

## 🔐 Sobre la privacidad y seguridad

- La Mini App valida la **firma de Telegram** (`initData`) en cada pedido: nadie puede ver tus datos sin ser vos, autenticado por Telegram.
- Las claves viven solo en tu `.env` (que **no** se sube a ningún lado; está en `.gitignore`).

---

## ❓ Problemas comunes

- **"Faltan variables de entorno"** al arrancar → te falta completar alguna clave en `.env`.
- **El bot no responde** → revisá que el token sea correcto y que no tengas otra copia del bot corriendo en otro lado.
- **"No te entendí el audio"** → puede ser un problema temporal de Groq; probá de nuevo. El bot nunca se cae por esto.
- **La Mini App dice "No autorizado"** → abrila **desde adentro de Telegram** (con el botón del bot), no desde el navegador: necesita la firma de Telegram.
- **La Mini App no abre** → tiene que ser HTTPS. Revisá que `WEBAPP_URL` esté bien y que Caddy/el túnel estén corriendo.
