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
- Leer reseñas y responderlas requiere la API de Google Business Profile. **Ya la tenemos**
  (comprobado el 18/11/2026), del proyecto anterior de reseñas:
  - Proyecto de Google Cloud `juanchos-resenas`, en la cuenta de Google del equipo, que es la
    misma que gestiona las fichas de Business Profile.
  - APIs activadas: Google My Business API (la v4 privada, con la que se leen y responden reseñas),
    Account Management, Business Information, Notifications, Q&A y Performance. Tienen cuota real
    (p. ej. 600 peticiones/min), así que Google ya aprobó el acceso.
  - Credenciales: un cliente OAuth de tipo escritorio ("Desktop Juancho's Reseñas"). No hay claves
    de API ni cuentas de servicio. El secreto del cliente nunca va al repo.
  - Esa cuenta gestiona las 10 fichas verificadas, incluidas las cuatro del piloto: Las Tablas,
    Valladolid, Mercado San Leopoldo y Chamberí.
  - Ojo: Google marca el proyecto con "Revísalo y bórralo" porque lleva meses sin uso. **No
    borrarlo**: perderíamos el acceso aprobado.

## Siguiente paso
Recorrer Joombo con la sesión iniciada (en el navegador de la persona) y anotar en
`docs/estudio-joombo.md` cada pantalla: qué muestra, qué se puede hacer y qué flujo sigue.
Después, construir el MVP por el orden de prioridad de arriba.
