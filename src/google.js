// Cliente mínimo de la API de Google Business Profile (OAuth con refresh token).
import { googleClient, readGoogleToken, saveGoogleToken } from './config.js';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
let cached = null;

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cached && now < cached.expiresAt - 60) return cached.token;

  const stored = readGoogleToken();
  if (stored.access_token && stored.obtained_at && now < stored.obtained_at + stored.expires_in - 60) {
    cached = { token: stored.access_token, expiresAt: stored.obtained_at + stored.expires_in };
    return cached.token;
  }

  const { clientId, clientSecret } = googleClient();
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: stored.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Google no renovó la sesión (${res.status}). Vuelve a iniciar sesión con scripts\\prueba-google.ps1.`,
    );
  }
  const t = await res.json();
  const token = { ...t, refresh_token: stored.refresh_token, obtained_at: now };
  saveGoogleToken(token);
  cached = { token: t.access_token, expiresAt: now + t.expires_in };
  return cached.token;
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.status === 204 ? null : res.json();
}

export async function getAccountName() {
  const { accounts = [] } = await api('https://mybusinessaccountmanagement.googleapis.com/v1/accounts');
  if (!accounts.length) throw new Error('La cuenta de Google no tiene acceso a ninguna cuenta de Business Profile.');
  return accounts[0].name; // "accounts/123..."
}

export async function getLocationTitle(locationId) {
  const loc = await api(
    `https://mybusinessbusinessinformation.googleapis.com/v1/locations/${locationId}?readMask=name,title`,
  );
  return loc.title;
}

// Recorre las reseñas de una ficha, de la más reciente a la más antigua.
// `onPage` puede devolver false para dejar de pedir páginas (sincronización incremental).
export async function listReviews(accountName, locationId, onPage) {
  let pageToken = '';
  let summary = null;
  do {
    const qs = new URLSearchParams({ pageSize: '50', orderBy: 'updateTime desc' });
    if (pageToken) qs.set('pageToken', pageToken);
    const page = await api(
      `https://mybusiness.googleapis.com/v4/${accountName}/locations/${locationId}/reviews?${qs}`,
    );
    summary ??= { averageRating: page.averageRating, totalReviewCount: page.totalReviewCount };
    const keepGoing = await onPage(page.reviews || []);
    pageToken = keepGoing === false ? '' : page.nextPageToken || '';
  } while (pageToken);
  return summary;
}

// Publica (o sustituye) la respuesta del negocio a una reseña. Es visible al público en Google.
export async function putReply(reviewName, comment) {
  return api(`https://mybusiness.googleapis.com/v4/${reviewName}/reply`, {
    method: 'PUT',
    body: JSON.stringify({ comment }),
  });
}
