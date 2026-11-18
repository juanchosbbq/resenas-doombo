// Configuración del panel. Nada secreto vive en el repo:
// - Credenciales de Google: variables de entorno o %APPDATA%\resenas-doombo\ (client_secret.json, token.json).
// - Clave de Anthropic: la resuelve el SDK (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN o perfil de `ant auth login`).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const CREDENTIALS_DIR =
  process.env.RESENAS_CREDENTIALS_DIR ||
  path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'resenas-doombo');

export const DB_PATH = process.env.DB_PATH || path.join(root, 'data', 'resenas.db');
export const PUBLIC_DIR = path.join(root, 'public');
export const PORT = Number(process.env.PORT || 3000);
// En local solo escucha en esta máquina. En un servidor, HOST=0.0.0.0 y APP_PASSWORD obligatoria.
export const HOST = process.env.HOST || '127.0.0.1';
export const APP_PASSWORD = process.env.APP_PASSWORD || '';

// Locales del piloto: identificador de la ficha en Google Business Profile (ver docs/CONTEXTO.md).
export const LOCATIONS = [
  { id: '1937894466674942835', short: 'Las Tablas' },
  { id: '5006375506636261585', short: 'Valladolid' },
  { id: '3499382858896337193', short: 'San Leopoldo' },
  { id: '8173102675125879325', short: 'Chamberí' },
];

function readJson(file) {
  // PowerShell 5 guarda UTF-8 con BOM: lo quitamos antes de parsear.
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

export function googleClient() {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET };
  }
  const file = path.join(CREDENTIALS_DIR, 'client_secret.json');
  if (!fs.existsSync(file)) {
    throw new Error(`Faltan las credenciales de Google: ${file} o GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET.`);
  }
  const { installed } = readJson(file);
  return { clientId: installed.client_id, clientSecret: installed.client_secret };
}

const tokenFile = () => path.join(CREDENTIALS_DIR, 'token.json');

export function readGoogleToken() {
  if (process.env.GOOGLE_REFRESH_TOKEN) {
    return { refresh_token: process.env.GOOGLE_REFRESH_TOKEN };
  }
  const file = tokenFile();
  if (!fs.existsSync(file)) {
    throw new Error(
      `No hay sesión de Google (${file}). Ejecuta una vez scripts\\prueba-google.ps1 para iniciar sesión.`,
    );
  }
  return readJson(file);
}

export function saveGoogleToken(token) {
  if (process.env.GOOGLE_REFRESH_TOKEN) return; // en servidor no se escribe a disco
  fs.writeFileSync(tokenFile(), JSON.stringify(token, null, 2));
}
