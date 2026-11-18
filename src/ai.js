// Respuesta sugerida con Claude. Siempre es un borrador: una persona la revisa antes de publicar.
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-opus-5-5';
let client = null;

const SYSTEM = `Redactas respuestas del restaurante a reseñas de Google. La respuesta la revisará y publicará una persona del equipo.

Reglas:
- Responde en el idioma en que está escrita la reseña. Si la reseña no tiene texto, responde en español.
- Tono cercano, natural y breve: 1 a 3 frases en reseñas de 4-5 estrellas, hasta 5 frases en las negativas.
- Si la reseña trae nombre, saluda por el nombre de pila. No inventes datos (platos, nombres de empleados, promociones, horarios) que no estén en la reseña o en las indicaciones del local.
- Reseñas de 1-3 estrellas: agradece, reconoce el problema concreto sin excusas ni discutir, y si hay correo de contacto invita a escribir allí para resolverlo. No ofrezcas compensaciones.
- Reseñas sin texto: una frase de agradecimiento, sin rellenar.
- Como mucho un emoji, y solo en reseñas positivas.
- Usa las palabras clave del local solo si encajan de forma natural; nunca las fuerces.
- Devuelve únicamente el texto de la respuesta, sin comillas, títulos ni comentarios.`;

export class AiNotConfiguredError extends Error {}

function getClient() {
  if (!client) {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN && !process.env.ANTHROPIC_PROFILE) {
      // El SDK también lee perfiles de `ant auth login`; si no hay nada configurado, avisamos claro.
      try {
        client = new Anthropic();
      } catch {
        throw new AiNotConfiguredError(
          'Falta la clave de Anthropic: define ANTHROPIC_API_KEY (o inicia sesión con `ant auth login`).',
        );
      }
    } else {
      client = new Anthropic();
    }
  }
  return client;
}

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

  let response;
  try {
    response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: `${context}\n\n<resena>\n${reviewText}\n</resena>` }],
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new AiNotConfiguredError('La clave de Anthropic no es válida o ha caducado.');
    }
    if (error instanceof AiNotConfiguredError) throw error;
    if (error instanceof Anthropic.RateLimitError) throw new Error('Demasiadas peticiones a la IA; prueba en un momento.');
    if (error instanceof Anthropic.APIError) throw new Error(`Error de la IA (${error.status}).`);
    if (/api key|apiKey|authentication/i.test(String(error?.message))) {
      throw new AiNotConfiguredError(
        'Falta la clave de Anthropic: define ANTHROPIC_API_KEY (o inicia sesión con `ant auth login`).',
      );
    }
    throw error;
  }

  if (response.stop_reason === 'refusal') {
    throw new Error('La IA no ha querido redactar esta respuesta; escríbela a mano.');
  }
  let text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  if (settings.signature) text += `\n\n${settings.signature}`;
  return text;
}
