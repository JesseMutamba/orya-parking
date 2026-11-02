import { createApp } from './server.mjs';
const app=createApp();
try { console.log(JSON.stringify(app.seedDemoDay(),null,2)); }
finally {await app.close();}
