import{test}from'node:test';import assert from'node:assert/strict';import{readFileSync,readdirSync}from'node:fs';import{translate,languageFrom}from'../localization.mjs';
test('French messages retain every substitution and cover server validation errors',()=>{
 for(const[key,value]of Object.entries(oryaFrench)){assert.ok(value.trim(),key);const placeholders=s=>[...s.matchAll(/\{(\d+)\}/g)].map(x=>x[1]).sort();assert.deepEqual(placeholders(value),placeholders(key),key);}
 for(const file of readdirSync('.').filter(f=>f.endsWith('.mjs')&&!['scripts.mjs','preview-network.mjs'].includes(f))){const source=readFileSync(file,'utf8');for(const m of source.matchAll(/fail\(\d+,\s*(['"])(.*?)\1\)/g)){assert.notEqual(translate(m[2],'fr'),m[2],`${file}: ${m[2]}`);}}
});
test('pluralization, numeric formatting and opaque placeholder values survive translation',()=>{
 assert.equal(translate('1 current pass','fr'),'1 pass en cours');assert.equal(translate('2 current passes','fr'),'2 pass en cours');assert.equal(translate('1 parking site','fr'),'1 parking');assert.equal(translate('8 parking sites','fr'),'8 parkings');assert.equal(translate('1 saved','fr'),'1 véhicule enregistré');assert.equal(translate('2 saved','fr'),'2 véhicules enregistrés');
 assert.equal(translate('Show Cash on map','fr'),'Afficher Cash sur la carte');assert.equal(translate('Cash: 2 spaces','fr'),'Cash : 2 places');assert.equal(translate('30-day subscription · 60,000 CDF','fr'),'Abonnement de 30 jours · 60\u202f000 CDF');assert.equal(translate('Enter vehicle make (1–60 characters).','fr'),'Renseignez le champ « marque du véhicule » (de 1 à 60 caractères).');
 const canonical='ORYA-ENTRY-ABC_abc-123';assert.equal(translate(canonical,'fr'),canonical);assert.equal(translate('Bank card','en'),'Bank card');
});
test('language selection only accepts supported locales and never affects the request identity',()=>{
 const req={url:'/api/ops/report?lang=fr',headers:{cookie:'orya_language=en; staff=sensitive'}};assert.equal(languageFrom(req),'fr');assert.equal(languageFrom({...req,url:'/'}),'en');assert.equal(languageFrom({url:'/?lang=evil',headers:{cookie:'orya_language=fr'}}),'en');assert.equal(req.headers.cookie,'orya_language=en; staff=sensitive');
});
