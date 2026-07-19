# 🚂 Cómo dejarlo corriendo en Railway (24/7)

Railway mantiene el bot prendido siempre y te da una dirección HTTPS gratis (que sirve también para los gráficos de la Mini App). Estos son los pasos.

## ⚠️ Lo más importante: el Volumen (para no perder tus datos)

Railway borra los archivos del proyecto en cada re-deploy. Como tu base de datos es **un archivo** (`asistente.db`), si no la ponés en un lugar "permanente" perdés todo cada vez que actualizás.

La solución es un **Volume** (disco permanente). Lo configurás en el paso 4 de abajo. No te lo saltees.

---

## Paso 1 — Subir el proyecto a Railway

Tenés dos caminos, elegí uno:

**Opción A — desde GitHub (recomendado)**
1. Subí la carpeta `C:\bot telegram` a un repositorio de GitHub (privado está perfecto).
2. En Railway: **New Project → Deploy from GitHub repo** → elegí ese repo.

**Opción B — desde tu compu con la CLI de Railway**
1. Instalá la CLI (una vez): en una terminal, `npm install -g @railway/cli`
2. En la carpeta del proyecto: `railway login`, después `railway init`, y después `railway up`.

> El proyecto ya trae `railway.json`, así que Railway sabe solo cómo compilarlo (`npm run build`) y arrancarlo (`npm start`).

## Paso 2 — Cargar las claves (Variables)

En tu proyecto de Railway → pestaña **Variables** → agregá estas cuatro:

| Nombre | Valor |
|---|---|
| `TELEGRAM_BOT_TOKEN` | tu token de @BotFather |
| `GROQ_API_KEY` | tu clave de Groq |
| `ANTHROPIC_API_KEY` | tu clave de Anthropic |
| `TZ` | `America/Argentina/Buenos_Aires` |

(No hace falta cargar `PORT`: Railway lo pone solo y el proyecto ya lo usa.)

## Paso 3 — Generar el dominio HTTPS

En **Settings → Networking → Public Networking → Generate Domain**.
Te va a dar algo como `https://tuapp.up.railway.app`. Copialo.

Ahora volvé a **Variables** y agregá una más:

| Nombre | Valor |
|---|---|
| `WEBAPP_URL` | la dirección que te dio Railway (ej: `https://tuapp.up.railway.app`) |

Con esto, el bot configura solo el botón 📊 de la Mini App al arrancar.

## Paso 4 — El Volumen (disco permanente para la base) ⚠️

1. En el proyecto → **New → Volume** (o botón derecho sobre el servicio → **Attach Volume**).
2. Cuando te pida el **Mount path**, poné exactamente: `/data`
3. Andá a **Variables** y agregá una más:

| Nombre | Valor |
|---|---|
| `DB_PATH` | `/data/asistente.db` |

Así tu base vive en el disco permanente y no se borra nunca.

## Paso 5 — Listo

Railway re-despliega solo con cada cambio. En la pestaña **Deployments → Logs** vas a ver:

```
🌐 API + Mini App en http://localhost:XXXX
⏰ Cron de recordatorios activo (cada minuto).
📊 Boton de menu configurado -> https://tuapp.up.railway.app
🤖 Bot @tu_bot escuchando.
```

Abrí Telegram, mandale `/start` a tu bot y probá. El botón 📊 ya te abre los gráficos.

---

## Preguntas frecuentes

- **¿Tengo que dejar mi PC prendida?** No. Con Railway, tu compu no tiene nada que ver: corre en la nube 24/7.
- **¿Cuánto cuesta?** Railway tiene un plan con crédito mensual; un bot chico como este consume muy poco. Revisá tu uso en la pestaña **Usage**.
- **Actualizar el código:** si usaste GitHub, con hacer `git push` Railway re-despliega solo. Si usaste la CLI, corré `railway up` de nuevo. Tus datos quedan intactos gracias al Volume.
- **¿Sigue andando el modo local?** Sí, podés seguir corriéndolo en tu PC con `npm start` cuando quieras; son dos entornos independientes (ojo: usan bases distintas).
