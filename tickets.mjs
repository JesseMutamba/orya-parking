import {translate,languageFrom} from './localization.mjs';
import { randomBytes, randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token = () => randomBytes(32).toString('base64url');
const plateKey = p => p.replace(/[ -]/g, '');

export function createTickets({db, now, zone, snapshot, audit, scope, once, availability}) {
  const get = (sql,...args) => db.prepare(sql).get(...args);
  const all = (sql,...args) => db.prepare(sql).all(...args);
  const run = (sql,...args) => db.prepare(sql).run(...args);
  db.exec(`
    CREATE TABLE IF NOT EXISTS walkin_tickets(id TEXT PRIMARY KEY, visit TEXT UNIQUE NOT NULL REFERENCES visits(id), tariff INTEGER NOT NULL REFERENCES tariffs(id), rate INTEGER NOT NULL, session TEXT UNIQUE REFERENCES sessions(id), charge_until INTEGER);
    CREATE TABLE IF NOT EXISTS walkin_exit_quotes(id TEXT PRIMARY KEY, ticket TEXT NOT NULL REFERENCES walkin_tickets(id), calculated INTEGER NOT NULL, expires INTEGER NOT NULL, minutes INTEGER NOT NULL, total INTEGER NOT NULL);
  `);
  const record = reference => {
    const t = get('SELECT t.*,v.zone,v.plate,v.make,v.model,v.checked_in,v.checked_out,v.approved_by FROM walkin_tickets t JOIN visits v ON v.id=t.visit WHERE t.id=?', String(reference || '').trim().toUpperCase());
    if (!t) fail(404, 'Ticket not found. Check its number or search by plate.');
    return t;
  };
  const amount = (t, end=now()) => {
    const elapsedMs = Math.max(0, end-t.checked_in);
    const billedMinutes = Math.max(1, Math.ceil(elapsedMs/1800000))*30;
    const total = billedMinutes/30*t.rate;
    if (!Number.isSafeInteger(total)) fail(409, 'This duration needs management review.');
    return {elapsedMs, billedMinutes, total};
  };
  const details = t => {
    const s = t.session ? get('SELECT * FROM sessions WHERE id=?', t.session) : null;
    const p = s ? snapshot(s) : null;
    const charge = amount(t, t.charge_until ?? now());
    return {...t, synthetic:!!get("SELECT record FROM demo_records WHERE kind='ticket' AND record=?",t.id), ...charge, elapsedMs:Math.max(0,(t.checked_out ?? now())-t.checked_in), payment:p?.payment || 'unpaid', receipt:p?.receipt || null,
      paymentMethod:p?.paymentMethod || null,
      state:t.checked_out?'departed':p?.payment==='confirmed'?'paid':p?.payment==='pending'?'pending':'unpaid', serverTime:now()};
  };
  const list = (id, query='', state='pending') => all('SELECT t.id FROM walkin_tickets t JOIN visits v ON v.id=t.visit WHERE v.zone=? ORDER BY v.checked_in DESC',id)
    .map(t=>details(record(t.id))).filter(t=>(state==='all'||!t.checked_out)&&(!query||t.id.includes(query)||plateKey(t.plate).includes(plateKey(query))));
  const validQuote = (t, quoteId) => {
    const q = get('SELECT * FROM walkin_exit_quotes WHERE id=? AND ticket=?',String(quoteId||''),t.id);
    if (!q || q.expires<=now()) fail(409, 'Exit quote expired. Refresh the charge before collecting payment.');
    return q;
  };
  const createCharge = (t,q,u,key) => {
    const ref='CG-'+randomBytes(6).toString('hex').toUpperCase(), access=token(), quote=token();
    run('INSERT INTO quotes VALUES(?,?,?,?,?,?,?,?)',quote,t.zone,t.plate,q.minutes,t.tariff,t.rate,q.total,q.calculated);
    run('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',ref,access,quote,key,JSON.stringify(['exit-charge',u.id,t.id]),t.zone,t.plate,q.minutes,t.tariff,t.rate,q.total,now(),u.id,t.checked_in,q.calculated);
    run('INSERT INTO vehicles VALUES(?,?,?,?)',ref,t.make,t.model,'');
    run('UPDATE walkin_tickets SET session=?,charge_until=? WHERE id=?',ref,q.calculated,t.id);
    run('UPDATE visits SET session=? WHERE id=?',ref,t.visit);
    audit(t.zone,ref,u.id,'walkin_charge_created',`${t.id}; ${q.minutes} billed minutes; ${q.total} CDF; rate v${t.tariff}`);
    return get('SELECT * FROM sessions WHERE id=?',ref);
  };
  const depart = (t,u) => {
    run('UPDATE visits SET checked_out=?,exited_by=? WHERE id=?',now(),u.id,t.visit);
    audit(t.zone,t.session,u.id,'vehicle_departed',`${t.visit}; ticket ${t.id}`);
  };
  return {list, async handle({req,path,method,body,url,identity:u,send}) {
    if (!path.startsWith('/api/ops/ticket')) return false;
    scope(u);
    if(path==='/api/ops/tickets'&&method==='GET') {
      const id=url.searchParams.get('zone')||u.zone;scope(u,id);
      send(200,{rows:list(id,(url.searchParams.get('q')||'').trim().toUpperCase(),url.searchParams.get('state')||'pending'),serverTime:now()});return true;
    }
    if(path==='/api/ops/tickets'&&method==='POST') {
      scope(u,body.zone);zone(body.zone);
      const plate=typeof body.plate==='string'?body.plate.trim().toUpperCase():'';
      if(!/^[A-Z0-9 -]{3,16}$/.test(plate)||!/[A-Z0-9]/.test(plate))fail(400,'Enter a plate of 3–16 letters, numbers, spaces or hyphens.');
      const optional=v=>{if(v!==undefined&&(typeof v!=='string'||v.length>60))fail(400,'Vehicle details must be at most 60 characters.');return (v||'').trim();};
      const make=optional(body.make),model=optional(body.model);
      const result=once(body,u,'ticket-entry',()=>{
        const a=availability(body.zone),z=zone(body.zone);
        if(get('SELECT id FROM visits WHERE plate_key=? AND checked_out IS NULL',plateKey(plate)))fail(409,'This vehicle is already inside. Find its existing ticket or visit.');
        const hold=get("SELECT id FROM reservations WHERE zone=? AND plate_key=? AND status='held' AND expires>?",z.id,plateKey(plate),now());
        if(!a.open||(a.available<1&&!hold))fail(409,'No space is available for this arrival.');
        const ref='WT-'+randomBytes(5).toString('hex').toUpperCase(),visit=randomUUID();
        if(hold)run("UPDATE reservations SET status='consumed',consumed=? WHERE id=?",now(),hold.id);
        run('INSERT INTO visits VALUES(?,?,NULL,?,?,?,?,?,?,NULL,NULL,?)',visit,z.id,plate,plateKey(plate),make,model,u.id,now(),hold?.id||null);
        run('INSERT INTO walkin_tickets VALUES(?,?,?,?,NULL,NULL)',ref,visit,z.tariff,z.rate);
        audit(z.id,null,u.id,'walkin_ticket_issued',`${ref}; ${plate}; visit ${visit}; pay at exit; rate v${z.tariff}`);
        return {reference:ref,visit};
      });send(201,{...result,ticket:details(record(result.reference))});return true;
    }
    const reference=method==='GET'?url.searchParams.get('reference'):body.reference;
    const t=record(reference);scope(u,t.zone);
    if(path==='/api/ops/ticket'&&method==='GET'){send(200,{ticket:details(t)});return true;}
    if(path==='/api/ops/ticket/print'&&method==='GET') {
      const d=details(t),receipt=url.searchParams.get('receipt')==='1';
      if(receipt&&!d.receipt)fail(409,'A confirmed payment is required for a receipt.');
      const language=languageFrom(req),L=value=>translate(value,language),z=zone(t.zone),date=n=>new Intl.DateTimeFormat(language==='fr'?'fr-CD':'en-GB',{timeZone:z.timezone,dateStyle:'medium',timeStyle:'medium'}).format(n);
      const qr=await QRCode.toString(t.id,{type:'svg',margin:1,width:150});
      const fields=[['Ticket',t.id],['Plate',t.plate],['Entered',date(t.checked_in)],['Rate',`${t.rate.toLocaleString(language==='fr'?'fr-CD':'en-US')} CDF / started 30 min`],...(receipt?[['Charged through',date(t.charge_until)],['Billed duration',`${d.billedMinutes} min`],['Paid',`${d.total.toLocaleString(language==='fr'?'fr-CD':'en-US')} CDF · ${d.paymentMethod}`],['Receipt',d.receipt],['Departure',t.checked_out?date(t.checked_out):'Awaiting recorded exit']]:[])];
      send(200,`<!doctype html><html lang="${language}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${L(receipt?'Receipt':'Parking ticket')} ${esc(t.id)}</title><link rel="stylesheet" href="/ticket.css"><link rel="stylesheet" href="/i18n.css"><script src="/i18n-catalog.js" defer></script><script src="/i18n-core.js" defer></script><script src="/i18n.js" defer></script><script src="/ticket.js" defer></script></head><body><div class="print-controls"><button id="print">${L(receipt?'Print receipt':'Print ticket')}</button><p>${L("Select your ticket printer or Save as PDF.")}</p></div><main class="ticket${receipt?' receipt':''}"><h1>${L("orya / parking")}</h1><p><span translate="no">${esc(z.name)}</span> · <span translate="no">${esc(z.id)}</span></p><h2>${L(receipt?'PAYMENT RECEIPT':'PAY AT EXIT')}</h2><strong class="plate" translate="no"><span translate="no">${esc(t.plate)}</span></strong><div class="qr">${qr}</div><strong><span translate="no">${esc(t.id)}</span></strong><dl>${fields.map(([k,v])=>`<div><dt>${esc(L(k))}</dt><dd translate="no">${esc(['Ticket','Plate','Receipt'].includes(k)?v:L(v))}</dd></div>`).join('')}</dl><p>${L(receipt?'Keep this receipt for your records.':'Keep this ticket. Present it at exit to calculate your stay and pay. This is not a payment receipt.')}</p><p>${L("30-minute minimum. Rate fixed at entry.")}<br>${L("Times: Africa/Kinshasa.")}</p><small>${L("LOCAL DEMO \u00b7 No real money collected")}</small></main></body></html>`,'text/html; charset=utf-8');return true;
    }
    if(path==='/api/ops/ticket/quote'&&method==='POST') {
      if(t.checked_out)fail(409,'This ticket has already departed.');
      if(t.session){send(200,{ticket:details(t),quote:null});return true;}
      const result=once(body,u,'ticket-quote',()=>{
        const calculated=now(),cost=amount(t,calculated),id=token();
        run('INSERT INTO walkin_exit_quotes VALUES(?,?,?,?,?,?)',id,t.id,calculated,calculated+120000,cost.billedMinutes,cost.total);
        return {id,calculated,expires:calculated+120000,billedMinutes:cost.billedMinutes,total:cost.total};
      });send(200,{ticket:details(t),quote:result});return true;
    }
    if(path==='/api/ops/ticket/digital-charge'&&method==='POST') {
      const result=once(body,u,'ticket-digital-charge',()=>{
        if(t.checked_out)fail(409,'This ticket has already departed.');
        const s=t.session?get('SELECT * FROM sessions WHERE id=?',t.session):createCharge(t,validQuote(t,body.quote),u,body.idempotencyKey);
        if(get('SELECT id FROM cash_payments WHERE session=?',s.id))fail(409,'This ticket already uses cash.');
        return {reference:s.id,accessToken:s.access};
      });send(200,result);return true;
    }
    if(path==='/api/ops/ticket/cash-exit'&&method==='POST') {
      const result=once(body,u,'ticket-cash-exit',()=>{
        if(t.checked_out){if(details(t).payment==='confirmed')return {reference:t.id};fail(409,'Ticket already departed.');}
        const q=t.session?null:validQuote(t,body.quote);
        const s=t.session?get('SELECT * FROM sessions WHERE id=?',t.session):createCharge(t,q,u,body.idempotencyKey);
        const p=snapshot(s);if(!['not_started','failed','refunded'].includes(p.payment))fail(409,'Digital payment is pending or already confirmed. Verify its status before recording exit.');
        if(body.amount!==s.total)fail(409,'Confirm the exact server-calculated cash amount.');
        const receipt='CASH-'+randomBytes(6).toString('hex').toUpperCase();
        run("INSERT INTO cash_payments(id,session,amount,receipt,status,recorded_by,created,approved_by,confirmed) VALUES(?,?,?,?,'confirmed',?,?,?,?)",randomUUID(),s.id,s.total,receipt,u.id,now(),u.id,now());
        // A previously refunded digital receipt remains historical; the cash receipt is separate.
        run('INSERT OR IGNORE INTO receipts VALUES(?,?,?)',receipt,s.id,now());
        audit(t.zone,s.id,u.id,'cash_confirmed',`${s.total} CDF; ${receipt}; ticket ${t.id}`);
        depart({...t,session:s.id},u);return {reference:t.id};
      });send(200,{...result,ticket:details(record(t.id))});return true;
    }
    if(path==='/api/ops/ticket/exit'&&method==='POST') {
      once(body,u,'ticket-exit',()=>{
        if(t.checked_out)return {reference:t.id};
        if(details(t).payment!=='confirmed')fail(409,'Payment must be confirmed before recording exit.');
        depart(t,u);return {reference:t.id};
      });send(200,{ticket:details(record(t.id))});return true;
    }
    fail(404,'Ticket endpoint not found.');
  }};
}
