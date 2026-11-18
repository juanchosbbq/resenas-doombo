# Contexto del proyecto

## Qué queremos
Probar en cuatro locales que hoy no usan Joombo (Las Tablas, Valladolid, San Leopoldo y Chamberí)
una herramienta propia que haga lo mismo, para decidir si merece la pena contratar Joombo en ellos.

Joombo (joombo.co) es una plataforma para hoteles y restaurantes que consigue más reseñas en Google
motivando al equipo. Según su web pública:

1. Objetivo de reseñas semanal, visible para todo el equipo.
2. Cada empleado tiene su "tótem" (QR): el cliente lo escanea y deja una reseña de 5★, que se
   atribuye a ese empleado.
3. Ranking por empleado: reseñas, nota media y puntos.
4. Recompensas canjeables con puntos (café, cheque regalo, día libre…).

## Prioridad
Lo más importante es la **gestión de las reseñas**:

1. Ver las reseñas de Google de los cuatro locales en un panel, filtrar por local y nota, y
   responderlas (con respuesta sugerida que una persona revisa).
2. Atribuir reseñas a empleados (QR por empleado; cruce por hora o por nombre del cliente).
3. Motivación: objetivos, ranking, puntos y recompensas.
4. Comparativa entre locales.

## Reglas
- Funciones propias: no copiar el diseño, los textos, el nombre ni el código de Joombo.
- Nunca escribir ni guardar contraseñas en el repo ni en el chat. El login en Joombo lo hace la
  persona en su propio navegador.
- Google no indica desde qué QR llega una reseña: los escaneos se cuentan con certeza, la
  atribución de reseñas es aproximada y hay que decirlo así en la interfaz.
- Leer reseñas y responderlas requiere la API de Google Business Profile, que hay que solicitar
  a Google con la cuenta que gestiona los locales.

## Siguiente paso
Recorrer Joombo con la sesión iniciada (en el navegador de la persona) y anotar en
`docs/estudio-joombo.md` cada pantalla: qué muestra, qué se puede hacer y qué flujo sigue.
Después, construir el MVP por el orden de prioridad de arriba.
