# Estudio de Joombo (panel de administración)

Recorrido hecho el 18/11/2026 con la sesión de administrador de Juancho's BBQ ya iniciada en Chrome
(6 locales en Joombo: Embajadores, Gabriel Lobo, Goya, Majadahonda, Malasaña y Pozuelo).
Solo se ha mirado: no se ha publicado, atribuido ni cambiado nada.

Objetivo: entender **qué hace** cada pantalla y **qué flujo** sigue, para construir funciones propias.
Según `CONTEXTO.md`, no copiamos diseño, textos, nombre ni código. Los nombres de pantallas que
aparecen aquí sirven solo para orientarse.

Menú lateral: **Tablero · Mis Reseñas · Decisiones (con contador) · Mi cuenta · Ayuda**. Arriba:
campana de notificaciones y un menú de usuario (idioma, "Mis empresas", "Suscripción", cerrar sesión).
Hay un chat de soporte flotante.

---

## 1. Gestión de reseñas (prioridad 1)

### 1.1 Lista de reseñas (`/reviews`)

**Qué muestra**: un feed de tarjetas, una por reseña, de 25 en 25 y con paginación. Cada tarjeta tiene:
- Plataforma (icono de Google/Tripadvisor), autor (enlaza a la ficha de Google), estrellas y fecha.
  Si el autor editó la reseña, aparece la marca "actualizado".
- El local, que enlaza a la búsqueda de Google del local.
- Una etiqueta de estado: **Por responder** (rojo) o **Respondida · fecha** (verde).
- El texto de la reseña, si lo tiene (muchas son solo estrellas).
- Un bloque **Atribución**: "Sin atribuir" con el botón *Atribuir*, o el empleado asignado con el
  método que se usó ("Escaneo de tótem") y el botón *Gestionar*.
- **Respuesta**:
  - Si no tiene respuesta: un área de texto, el botón *Publicar la respuesta* (publica en Google),
    el botón *Generar* (la IA redacta un borrador en el área de texto) y un enlace a *Ajustes de respuesta*.
  - Si ya tiene respuesta: se ve la respuesta publicada, con la fecha, y el botón *Editar*, que abre
    el mismo editor con la respuesta precargada.
- Al lado de cada respuesta hay un pequeño formulario de feedback sobre la respuesta de la IA
  ("dinos un poco más": comentario libre y enviar).

**Filtros** (icono de embudo; los filtros activos se ven como chips, p. ej. "Juancho's BBQ · Este mes"):
| Filtro | Opciones |
|---|---|
| Local | uno, varios o todos (los 6 locales + el grupo) |
| Periodo | hoy, ayer, esta semana, semana pasada, este mes, mes pasado, este año, año pasado, personalizado |
| Respuesta | respondida / falta responder / todas |
| Nota | 5★, 4★, 3★, 2★, 1★ (selección múltiple) / todas |
| Comentario | con comentario / sin comentario / todas |
| Plataforma | Google / Tripadvisor / todas |

**Otras acciones**: *Exportar CSV* de las reseñas filtradas.

**Flujo típico**: filtrar "falta responder" → *Generar* → revisar o editar el texto → *Publicar la respuesta*.

### 1.2 Atribución de una reseña (modal, `/reviews/:id/assignment_details`)

Se abre desde *Atribuir* o *Gestionar*. Tiene tres secciones:
1. **Atribuido a**: el empleado actual con el método y la fecha, y el botón *Desatribuir* (pide
   confirmación e indica si se retiran puntos). Si no hay nadie: "Nadie".
2. **Escaneos de tótem**: los escaneos de QR dentro de una ventana de tiempo **anterior a la reseña**
   (en esta cuenta, de 15 min antes a 0 min después; p. ej. "13:40 – 13:55"). Por cada escaneo se ve
   la hora, el empleado, el número de tótem y el dispositivo ("mobile"), con un botón *Atribuir* para
   ese escaneo.
3. **Atribuir a un colaborador**: un desplegable con los empleados activos del local y el botón
   *Atribuir*. Avisa de que los puntos se abonan hoy.

➡️ Para nuestro MVP: este es exactamente el caso "cruce por hora". Joombo enseña los candidatos y
la persona decide; el emparejamiento automático solo se hace según la regla que configura el local (ver 3.10).

### 1.3 Ajustes de respuesta (modal desde cada reseña; también es la sección 3.12 de cada local)

Se configura **por local**:
- **Recordatorio de reseñas sin responder**: los usuarios elegidos reciben cada miércoles un correo
  con las reseñas sin responder de la semana anterior.
- **Modo de respuesta por nota**: una matriz de 5 notas × (con comentario / sin comentario). En cada
  celda se elige:
  1) yo redacto, 2) la IA prepara un borrador, o 3) la IA prepara **y publica** sola (esto último solo en Google).
- **Idioma**: responder en el idioma de la reseña, con un idioma por defecto si no se detecta
  (FR, ES, CA, IT, EN).
- **Instrucciones de redacción**: una lista de reglas en texto libre (tono, pedir sugerencias por
  email, etc.). Cada regla se aplica a las notas que se marquen, con comentario y sin comentario por separado.
- **Firma**: texto que se añade al final de cada respuesta.
- **Correo de contacto**: el que se ofrece en las respuestas negativas para seguir la conversación en privado.
- **Palabras clave** (SEO), agrupadas en Lugar / Comida / Servicio / Ambiente…: términos que la IA
  puede meter en las respuestas, cada uno con su idioma. Ej. en Embajadores: "cerca del Matadero",
  "Legazpi", "Arganzuela", "hamburguesas"…

Lo que se ve en las respuestas reales: mencionan el barrio, invitan a volver, piden detalles por
email en las reseñas de ≤4★ y usan emojis.

### 1.4 Reseñas por arbitrar (dentro de **Decisiones**)

Es la cola de reseñas que Joombo **no ha sabido atribuir**, sobre todo las que **nombran a alguien**
que no coincide con un empleado (había 18 pendientes). Por cada reseña:
- Plataforma, fecha, un extracto con el nombre detectado y un enlace a la reseña completa.
- Los candidatos: un desplegable con los empleados del local o, a veces, una **sugerencia de la IA con
  nivel de confianza** (alta o media) y los puntos actuales de cada candidato.
- Casillas *Validar «X» como alias*: guardan ese nombre (p. ej. "Erik", "Magui") como alias del
  empleado para que la próxima vez se atribuya solo. También detecta falsos positivos como "amable"
  o "Juancho".
- Botones *Validar* y *No atribuir a nadie*.

➡️ Esto resuelve el caso "cruce por nombre": detectar nombres en el texto, sugerir el empleado y
aprender alias.

### 1.5 Reglas de qué reseñas cuentan (según la ayuda)

- Hay tres formas de atribuir: **mención del nombre** (Google, Tripadvisor y Booking), **escaneo de
  tótem** (solo Google) y **a mano** (todas).
- Booking puntúa sobre 10 y se convierte a estrellas.
- Cuando se atribuye una reseña, el empleado recibe puntos según el bonus (ver 3.5).

---

## 2. Tablero

### 2.1 Tablero general y objetivos (`/dashboards`) — comparativa entre locales

Hay un selector de grupo o empresa y una tarjeta por local (etiqueta "Activo" si tiene suscripción).
Por plataforma, cada tarjeta muestra:
- La nota media con 2 decimales, el total de reseñas y "+N en este periodo".
- El número de reseñas de 5★ y de 1★.
- Las **reseñas generadas por el personal** en el periodo y el estado del objetivo ("Ningún objetivo
  definido", con el botón *Definir un objetivo*).
- Si la plataforma no está conectada (Tripadvisor en casi todos), un aviso y el botón *Conectar*.
- Botones *Rendimiento del personal* y *Tablero* (el tablero de ese local).
- Botón *Añade un nuevo negocio*.

Datos de ese día (mes en curso): Goya 4,70 (5.134 reseñas, +8); Embajadores 4,71 (4.264, +50, 29
generadas por el personal); Gabriel Lobo 4,66 (6.058, +32, 7); Malasaña 4,69 (3.739, +4);
Majadahonda 4,70 (2.899, +8, 2); Pozuelo 4,67 (4.845, +13, 2).
Se nota que el volumen nuevo depende de si el equipo usa los tótems (Embajadores sí, los demás apenas).

### 2.2 Tablero de un local (`/business_activities/:id/dashboard`)

Filtros: local, periodo y equipo. Tiene pestañas o anclas: **Vista del negocio · Métricas · Evolución
de reseñas · Clicks convertidos**, el botón *Rendimiento del personal* y *Exporta tus reseñas*.
- **Vista del negocio**: lo mismo que la tarjeta del tablero general.
- **Acelerador de notas**: un medidor semicircular con el número de reseñas de 5★ que faltan para
  subir 0,1 la nota (616 en Embajadores) y lo que haría falta para bajarla 0,1. Tiene un botón para
  animar al equipo por WhatsApp.
- **Evolución de reseñas** (total/periodo): un gráfico de satisfacción con la opción de **comparar
  con otro local**.
- **Reseñas vs tótems utilizados** y **conversión de clics**: escaneos del periodo (77), clics por
  destino (Google 42, Tripadvisor 49, Instagram 0) y reseñas conseguidas por Joombo (30).
- **Evolución de la nota de Google**: nota al entrar en Joombo comparada con la de hoy.
- **Métricas de Google** (de Business Profile): una estimación de los ingresos que genera Google, y
  visualizaciones, llamadas, cómo llegar y visitas a la web, comparadas con el mismo periodo del año anterior.

### 2.3 Rendimiento del personal (`/business_activities/:id/result`) — ranking

- KPI: reseñas generadas por el personal, con la variación frente al periodo anterior; la nota media
  de las reseñas del personal frente a la de Google; y las reseñas de 5★ que faltan para la siguiente
  décima.
- Estado del **bote común**, con un enlace para configurarlo.
- **Top 3 por progresión** (no por volumen) frente al periodo anterior, con el botón *Felicitar*.
- **Recordatorios por segmento**: mensajes predefinidos de un clic (p. ej. felicitar a quien tuvo al
  menos una reseña) que se envían a un grupo de WhatsApp.
- Lista de empleados con reseñas y nota media, que se puede filtrar por equipo. Cada empleado abre
  una ficha (modal).

---

## 3. Mi cuenta → ajustes de cada local (`/business_activities/:id?section=…`)

Arriba hay un selector de local. Tiene 12 secciones:

| # | Sección | Qué hace |
|---|---|---|
| 3.1 | Ubicación | Nombre, dirección, código postal, ciudad, país y tipo (restaurante, hotel, hotel/restaurante, otro). |
| 3.2 | Usuarios | Usuarios del panel con su rol (Admin, Manager…) y estado. Botón para *invitar a un usuario* por email. |
| 3.3 | Integraciones | Google (conectado o desconectar), Tripadvisor (conectar) y Booking solo en hoteles. RR. HH.: **Lucca** (clave API + subdominio, locales que se sincronizan y personas a las que avisar). |
| 3.4 | Equipo y Empleados | Invitar a empleados por email, por WhatsApp o con un enlace compartido (que se puede regenerar). **Equipos** (con tótems y empleados por equipo). **Empleados** activos o inactivos, con equipo, estado de cuenta y número de tótems, y las acciones *Añadir un alias*, *Invitar*, *Asignar tótem* y *Cambiar de establecimiento*. Un empleado sin cuenta ya puede tener tótem y sumar puntos. |
| 3.5 | Bonus de reseñas | Puntos por reseña según la nota, en modo **Fijo** o **Por niveles** (tramos de reseñas con más puntos por reseña, frecuencia de reinicio y un **malus** para las notas no elegibles). Hay un **simulador** y lo mismo para el **bote común** (para quien no tiene tótem, p. ej. la cocina). |
| 3.6 | Recompensas | **Catálogo** de regalos (nombre, emoji, descripción y precio en puntos, con sugerencias tipo "día libre"), **lotes** que se desbloquean al llegar a un umbral de puntos y **prima** en dinero (valor del punto en € y generación manual, mensual, trimestral o anual). |
| 3.7 | Objetivos | Un asistente de 5 pasos para el objetivo de reseñas por plataforma y periodo, repartido entre equipos y empleados. Se renueva solo cada mes y puede dar puntos al cumplirse. |
| 3.8 | Tablero del empleado | Interruptores para que el empleado vea el acelerador de notas y el resumen de reseñas de Google. |
| 3.9 | Asignación de reseñas | **Ventana de emparejamiento** (X min antes y Y min después de la reseña). Con varios escaneos: el más lejano, el más cercano o uno al azar. Reasignación en 4 niveles: solo nuevas → también editadas → permitir cambiar de empleado → incluso al mismo, con un mínimo de días entre atribuciones. **Atribución por mención** activable por plataforma. |
| 3.10 | Página y enlaces | La página de destino del QR por local (tótems conectados y diseño personalizable) y los enlaces a los que lleva: Google, Tripadvisor e Instagram. |
| 3.11 | Respuesta a reseñas | Lo mismo que en 1.3. |
| 3.12 | API | Claves API y un endpoint GET de estadísticas por empleado entre dos fechas (autenticación Bearer). |

Otras pantallas de cuenta: **Mis empresas** (`/company_profiles`: foto/perfil), **Suscripción**
(se contrata por local; sin suscripción no se recogen reseñas) y **Añadir negocio** (empieza
conectando Google Business para importar los datos, o se rellena a mano).

---

## 4. Decisiones (`/decisions`) — bandeja de tareas del manager

El contador del menú es el número de pendientes. Tiene cuatro bloques:
1. **Validación de recompensas**: canjes que piden los empleados, con recompensa, detalle, fecha de
   petición, fecha de tramitación y estado.
2. **Primas por validar**: primas pendientes, importe a pagar, próxima generación, el botón *Generar
   las primas* y una tabla de empleado, fecha, puntos convertidos, importe, estado y acciones.
3. **Importaciones de personal (Lucca)**: altas que vienen del sistema de RR. HH. y hay que aprobar.
4. **Reseñas por arbitrar**: ver 1.4.

## 5. Notificaciones (`/notifications`)

Lista con filtro *Todas* / *No leídas*. Estaba vacía.

## 6. Vista del empleado ("Mi espacio") — solo por la ayuda, no se ha visto

El empleado entra con email o con Google y tiene tres pestañas: **Código QR** (el suyo, para
enseñarlo al cliente), **Objetivos** (sus reseñas atribuidas y su avance) y **Recompensas** (saldo
de puntos y canje de regalos, lotes o prima).

## 7. Tótems (QR)

- Cada tótem tiene un único QR con número (#417…) y se asigna a un empleado o a un equipo. Se puede
  reasignar cuando alguien se va (las reseñas antiguas siguen siendo suyas) y desactivar si se pierde.
- El QR se descarga para imprimirlo, con una plantilla de diseño.
- Al escanearlo se abre la página del local, con botones a Google, Tripadvisor o Instagram. Joombo
  registra el **escaneo** y el **clic**. La reseña se le asigna después al empleado **por coincidencia
  de hora** (Google no dice desde qué QR vino).

---

## Conclusiones para nuestro MVP (por prioridad)

1. **Panel de reseñas**: un feed único de los 4 locales con los mismos filtros (local, periodo,
   respondida/pendiente, nota, con o sin texto), estados y exportación a CSV. Respuesta con
   *Generar → revisar → Publicar*. Ajustes por local: modo por nota, idioma, instrucciones, firma,
   email de contacto y palabras clave. Recordatorio semanal de las pendientes. Empezaríamos **sin
   publicación automática**: siempre la revisa una persona.
2. **Atribución**: guardar cada escaneo de QR (hora, empleado, tótem). Emparejar con una ventana de
   tiempo configurable y enseñar los candidatos al lado de la reseña. Detectar nombres en el texto
   con alias que se aprenden y llevar las dudosas a una cola "por arbitrar". En la interfaz hay que
   marcar la atribución por hora como **aproximada** y decir de qué tipo es cada una (escaneo,
   mención o manual).
3. **Motivación**: puntos por nota (fijo o por niveles), objetivo mensual por local y empleado,
   ranking por progresión, catálogo de recompensas con validación del manager y bote común para
   quien no tiene tótem.
4. **Comparativa**: una tarjeta por local con nota, total, nuevas del periodo, 5★/1★, reseñas del
   personal y "reseñas de 5★ que faltan para +0,1". Gráfico de evolución comparando locales.

Lo que podemos dejar fuera al principio: la integración con Lucca, la API pública, la prima en
dinero, las métricas de Business Profile (ingresos estimados, llamadas…), Tripadvisor y Booking,
y los mensajes por WhatsApp.

Dependencia clave (repetida de `CONTEXTO.md`): leer y responder reseñas de Google necesita acceso a
la **API de Google Business Profile** con la cuenta que gestiona los 4 locales nuevos.
