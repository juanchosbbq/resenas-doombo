# Reseñas de equipo (piloto)

Herramienta interna para gestionar las reseñas de Google de los locales y motivar al equipo a conseguirlas.

Locales del piloto: Las Tablas, Valladolid, San Leopoldo y Chamberí.

Prioridades:

1. Gestión de reseñas: las reseñas de Google de todos los locales en un panel, con filtros y respuestas.
2. Atribución: un QR por empleado y cruce de cada reseña con quien la consiguió.
3. Motivación: objetivos, ranking, puntos y recompensas.
4. Comparativa entre locales para decidir si ampliar.

Estado: **panel de reseñas (prioridad 1) en marcha en local**. El contexto está en
[docs/CONTEXTO.md](docs/CONTEXTO.md) y el estudio de Joombo en [docs/estudio-joombo.md](docs/estudio-joombo.md).

## Panel de reseñas

Qué hace:

- Copia de Google las reseñas de los cuatro locales a una base de datos local (`data/resenas.db`).
- Una tarjeta por local con la nota, el total, las reseñas de los últimos 30 días y las que faltan por responder.
- Lista con filtros por local, periodo, estado (respondida o no), estrellas, con o sin texto y búsqueda,
  y exportación a CSV (se abre bien en Excel).
- Respuesta a cada reseña: escribirla a mano o pedir una **sugerencia a la IA** (Claude), guardarla como
  borrador y **publicarla en Google solo tras confirmarlo**. La IA nunca publica sola.
- Ajustes de respuesta por local: indicaciones para la IA, correo de contacto, palabras clave y firma.
- **Seguimiento** (pestaña de la cabecera): comparativa de los cuatro locales en los últimos 30 días
  (reseñas frente al mes anterior, media, 1–3★, % respondidas, tiempo de respuesta y pendientes), evolución
  mes a mes de cada local (reseñas, nota media y % respondidas) y análisis con IA de los temas de las
  reseñas negativas de un periodo, con sugerencias para el encargado y citas textuales.

### Arrancarlo en este ordenador

Requisitos: Node.js 24 o superior.

1. Credenciales de Google en `%APPDATA%\resenas-doombo\`: el `client_secret.json` del cliente OAuth de
   escritorio del proyecto `juanchos-resenas`, y el `token.json`, que se crea solo la primera vez que
   ejecutas `scripts\prueba-google.ps1` e inicias sesión con la cuenta que gestiona las fichas.
2. Para las funciones con IA (sugerir respuesta y analizar quejas), una clave de Anthropic: crea el
   archivo `%APPDATA%\resenas-doombo\.env` con la línea `ANTHROPIC_API_KEY=tu-clave` (o define esa
   variable de entorno). No hace falta reiniciar el panel. Sin clave, todo lo demás funciona igual.
3. Instalar y arrancar:

   ```powershell
   npm install
   npm start
   ```

4. Abrir http://localhost:3000 y pulsar "Actualizar desde Google". La primera vez se puede hacer la
   copia completa con `npm run sync -- --full`.

Por defecto el servidor solo acepta conexiones desde el propio ordenador. Para publicarlo en un servidor
hay que definir `HOST=0.0.0.0` y `APP_PASSWORD` (el panel pide esa contraseña), y pasar las credenciales
de Google por variables (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`) en lugar de
archivos.

Las credenciales y la base de datos nunca se suben al repositorio (ver `.gitignore`).
