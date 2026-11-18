// Funciones con Claude: respuesta sugerida (siempre un borrador que revisa una persona)
// y análisis de los temas de las reseñas negativas de un local.
import Anthropic from '@anthropic-ai/sdk';
import { loadLocalEnv } from './config.js';
import { recordUsage } from './usage.js';

const MODEL = 'claude-opus-5-5';
const NO_KEY =
  'Falta la clave de Anthropic: crea el archivo %APPDATA%\\resenas-doombo\\.env con la línea ANTHROPIC_API_KEY=tu-clave.';

export class AiNotConfiguredError extends Error {}

let client = null;

// Devuelve { text, costUsd }. Cada llamada queda registrada con sus tokens y su coste estimado,
// también las que acaban en negativa o cortadas, porque Anthropic las cobra igual.
async function callClaude(params, meta) {
  try {
    if (!client && !process.env.ANTHROPIC_API_KEY) loadLocalEnv(); // por si el archivo se creó con el panel en marcha
    client ??= new Anthropic();
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      ...params,
    });
    const costUsd = recordUsage(meta, response);
    if (response.stop_reason === 'refusal') {
      throw new Error('La IA no ha querido procesar esta petición.');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new Error('La respuesta de la IA se ha cortado; prueba con un periodo más corto.');
    }
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')
      .trim();
    return { text, costUsd };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || /api.?key|auth/i.test(String(error?.message))) {
      client = null; // al volver a intentarlo se relee la clave
    }
    if (error instanceof Anthropic.AuthenticationError) {
      throw new AiNotConfiguredError('La clave de Anthropic no es válida o ha caducado.');
    }
    if (error instanceof Anthropic.RateLimitError) throw new Error('Demasiadas peticiones a la IA; prueba en un momento.');
    if (error instanceof Anthropic.APIError) throw new Error(`Error de la IA (${error.status}).`);
    // Sin ninguna credencial el SDK falla al crear el cliente o al enviar la petición.
    if (/api.?key|auth/i.test(String(error?.message))) throw new AiNotConfiguredError(NO_KEY);
    throw error;
  }
}

// ---------- Respuesta sugerida ----------
const REPLY_SYSTEM = `Redactas respuestas del restaurante a reseñas de Google. La respuesta la revisará y publicará una persona del equipo.

Reglas:
- Responde en el idioma en que está escrita la reseña. Si la reseña no tiene texto, responde en español.
- Tono cercano, natural y breve: 1 a 3 frases en reseñas de 4-5 estrellas, hasta 5 frases en las negativas.
- Si la reseña trae nombre, saluda por el nombre de pila. No inventes datos (platos, nombres de empleados, promociones, horarios) que no estén en la reseña o en las indicaciones del local.
- Reseñas de 1-3 estrellas: agradece, reconoce el problema concreto sin excusas ni discutir, y si hay correo de contacto invita a escribir allí para resolverlo. No ofrezcas compensaciones.
- Reseñas sin texto: una frase de agradecimiento, sin rellenar.
- Como mucho un emoji, y solo en reseñas positivas.
- Usa las palabras clave del local solo si encajan de forma natural; nunca las fuerces.
- Devuelve únicamente el texto de la respuesta, sin comillas, títulos ni comentarios.`;

export async function suggestReply(review, location, settings) {
  const context = [
    `Local: ${location.title || location.short}`,
    settings.instructions && `Indicaciones del local: ${settings.instructions}`,
    settings.contact_email && `Correo de contacto para reseñas negativas: ${settings.contact_email}`,
    settings.keywords && `Palabras clave del local: ${settings.keywords}`,
  ]
    .filter(Boolean)
    .join('\n');
  const reviewText = [
    `Autor: ${review.reviewer || 'Anónimo'}`,
    `Estrellas: ${review.stars} de 5`,
    `Texto: ${review.comment || '(sin texto)'}`,
  ].join('\n');

  let { text, costUsd } = await callClaude(
    {
      output_config: { effort: 'low' },
      system: REPLY_SYSTEM,
      messages: [{ role: 'user', content: `${context}\n\n<resena>\n${reviewText}\n</resena>` }],
    },
    { kind: 'reply', locationId: review.location_id },
  );
  if (settings.signature) text += `\n\n${settings.signature}`;
  return { text, costUsd };
}

// ---------- Temas de las quejas ----------
export const MAX_TOPIC_REVIEWS = 250;

const TOPICS_SYSTEM = `Analizas reseñas negativas (1 a 3 estrellas) de un restaurante para su encargado.
Agrupa las quejas en temas concretos y accionables (por ejemplo "Esperas largas en hora punta", "Carne poco hecha", "Trato seco en caja"), no en categorías genéricas como "servicio".
- Entre 3 y 8 temas, ordenados de más a menos reseñas.
- Una reseña puede estar en varios temas si se queja de varias cosas. Si una queja no encaja en ningún tema con al menos 2 reseñas, déjala fuera.
- "descripcion": una o dos frases con lo que repiten los clientes, sin exagerar.
- "sugerencia": una acción concreta que el encargado podría probar.
- "resenas": los números [n] de las reseñas de ese tema, tal cual aparecen.
- "resumen": dos o tres frases con lo más importante del periodo.
Escribe en español, aunque haya reseñas en otros idiomas.`;

const TOPICS_SCHEMA = {
  type: 'object',
  properties: {
    resumen: { type: 'string' },
    temas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          descripcion: { type: 'string' },
          sugerencia: { type: 'string' },
          resenas: { type: 'array', items: { type: 'integer' } },
        },
        required: ['nombre', 'descripcion', 'sugerencia', 'resenas'],
        additionalProperties: false,
      },
    },
  },
  required: ['resumen', 'temas'],
  additionalProperties: false,
};

export async function analyzeComplaints(location, reviews) {
  const list = reviews
    .map((r, i) => `[${i + 1}] ${r.stars}★ · ${r.create_time.slice(0, 10)}\n${r.comment}`)
    .join('\n\n');
  const { text, costUsd } = await callClaude(
    {
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: TOPICS_SCHEMA } },
      system: TOPICS_SYSTEM,
      messages: [{ role: 'user', content: `Local: ${location.title || location.short}\n\n<resenas>\n${list}\n</resenas>` }],
    },
    { kind: 'topics', locationId: location.id },
  );
  const parsed = JSON.parse(text);

  // Las citas salen de la base de datos, no del modelo: así son siempre textuales.
  const temas = parsed.temas
    .map((t) => {
      const ids = [...new Set(t.resenas)].filter((n) => n >= 1 && n <= reviews.length);
      return {
        nombre: t.nombre,
        descripcion: t.descripcion,
        sugerencia: t.sugerencia,
        cuenta: ids.length,
        ejemplos: ids.slice(0, 3).map((n) => {
          const r = reviews[n - 1];
          return { id: r.id, estrellas: r.stars, fecha: r.create_time.slice(0, 10), texto: r.comment };
        }),
      };
    })
    .filter((t) => t.cuenta > 0)
    .sort((a, b) => b.cuenta - a.cuenta);
  return { resumen: parsed.resumen, temas, costUsd };
}
