import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {resolve} from 'node:path';
const access = JSON.parse(readFileSync(process.env.ORYA_DATA_DIR?resolve(process.env.ORYA_DATA_DIR,'access.json'):new URL('./.local/access.json', import.meta.url), 'utf8'));
if (process.argv[2] === 'access') {
  console.log(`Local demo credentials (do not share publicly)\nattendant: ${access.attendant}\nmanager: ${access.manager}`);
} else if (process.argv[2] === 'simulate') {
  const [, , , attempt, scenario, eventId = randomUUID()] = process.argv;
  if (!attempt || !['pending','delayed','confirmed','failed','refunded'].includes(scenario)) throw Error('Usage: npm run simulate -- ATTEMPT_ID pending|delayed|confirmed|failed|refunded [EVENT_ID]');
  const r = await fetch(`http://127.0.0.1:${process.env.PORT || 3040}/api/harness`, {method:'POST',headers:{'Content-Type':'application/json','X-Demo-Key':access.harness},body:JSON.stringify({attempt,scenario,eventId})});
  console.log(r.status, await r.json()); if (!r.ok) process.exitCode=1;
}
