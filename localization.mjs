import './public/i18n-catalog.js';
import './public/i18n-core.js';
export const {translate,languageFrom} = globalThis.oryaI18nCore;
export function csvLabel(key,language){const names={id:'Identifier',time:'Time',reference:'Reference',zone:'Zone',plate:'Plate',creator:'Created by',created:'Created',total:'Amount',currency:'Currency',tariff:'Tariff',payment:'Payment',validity:'Validity',settlement:'Settlement',demo:'Demo',method:'Method',status:'Status',amount:'Amount',actor:'Actor'};return language==='fr'?translate(names[key]||key,language):key;}
export function csvValue(key,value,language){return ['method','status','payment','validity','settlement','demo'].includes(key)?translate(String(value),language):value;}
