// Sincronización desde la línea de comandos: `npm run sync` (incremental) o `npm run sync -- --full`.
import { syncAll } from './sync.js';

const full = process.argv.includes('--full');
const results = await syncAll({ full });
for (const r of results) console.log(`${r.location}: ${r.read} leídas (total en Google: ${r.total})`);
