import { randomBytes, scryptSync } from 'node:crypto';
import { demoSites } from './site-catalog.mjs';

export function createDemoDay({db,now,transaction}) {
  const get=(q,...p)=>db.prepare(q).get(...p),all=(q,...p)=>db.prepare(q).all(...p),run=(q,...p)=>db.prepare(q).run(...p);
  db.exec(`CREATE TABLE IF NOT EXISTS demo_days(id TEXT PRIMARY KEY, created INTEGER NOT NULL, summary TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS demo_records(kind TEXT NOT NULL, record TEXT NOT NULL, batch TEXT REFERENCES demo_days(id), PRIMARY KEY(kind,record));`);
  const status=()=>get('SELECT * FROM demo_days ORDER BY created DESC LIMIT 1');
  function seed() {
    // Explicit, one-time sample day. Startup never reseeds or rewrites any record.
    const batch='kinshasa-active-day-v1';
    const existing=get('SELECT * FROM demo_days WHERE id=?',batch);if(existing)return {...JSON.parse(existing.summary),alreadyLoaded:true,created:existing.created};
    return transaction(()=>{
      const end=now(),dayStart=Math.floor((end+3600000)/86400000)*86400000-3600000;
      // For a normal daytime run, use a six-hour history; near midnight compress it into today's window.
      const ago=minutes=>Math.round(end-minutes*60000*Math.min(1,(end-dayStart)/21600000));
      const actor='synthetic-day',summary={sites:0,visitsInside:0,visitsDeparted:0,walkinTickets:0,passes:0,holds:0,issues:0};
      run('INSERT INTO demo_days VALUES(?,?,?)',batch,end,'{}');
      const tag=(kind,id)=>run('INSERT INTO demo_records VALUES(?,?,?)',kind,id,batch);
      let serial=0;
      const uid=kind=>`SYN-${kind}-${String(++serial).padStart(5,'0')}`;
      const audit=(z,session,action,detail,time=end)=>{const result=run('INSERT INTO audit(zone,session,actor,action,detail,created) VALUES(?,?,?,?,?,?)',z,session,actor,action,detail,time);tag('audit',String(result.lastInsertRowid));};
      const driver='SYN-DRIVER-01';
      if(!get('SELECT id FROM drivers WHERE id=?',driver)){const salt=randomBytes(20).toString('hex');run('INSERT INTO drivers(id,name,email,plate,preference,salt,digest,created) VALUES(?,?,?,?,?,?,?,?)',driver,'Synthetic driver','synthetic-day@example.invalid','SYN DEMO','subscription',salt,scryptSync(randomBytes(32),salt,32).toString('hex'),end);tag('driver',driver);}
      for(const [siteId,,,,,,] of demoSites){
        const z=get('SELECT z.*,t.rate,d.capacity,o.blocked,o.open FROM zones z JOIN tariffs t ON t.id=z.tariff JOIN site_details d ON d.zone=z.id JOIN ops_sites o ON o.zone=z.id WHERE z.id=?',siteId);
        if(!z||!z.open)continue;
        summary.sites++;
        let siteSerial=0;const number=String(summary.sites).padStart(2,'0');
        const vehicle=()=>({plate:`SYN ${number} ${String(++siteSerial).padStart(3,'0')}`,make:['Toyota','Honda','Nissan','Suzuki'][siteSerial%4],model:['Corolla','CR-V','X-Trail','Swift'][siteSerial%4]});
        const visit=(v,session,arrived,departed=null)=>{
          const id=uid('VISIT');run('INSERT INTO visits VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL)',id,z.id,session,v.plate,v.plate.replaceAll(' ',''),v.make,v.model,actor,arrived,departed,departed?actor:null);tag('visit',id);
          audit(z.id,session,'synthetic_vehicle_arrived',`${v.plate}; ${id}`,arrived);
          if(departed){summary.visitsDeparted++;audit(z.id,session,'synthetic_vehicle_departed',`${v.plate}; ${id}`,departed);}else summary.visitsInside++;
          return id;
        };
        const pass=(v,method,state,{created=ago(180),confirmed=ago(160),minutes=240,subscription=false,walkin=false,cutoff=null}={})=>{
          const quote=uid('QUOTE'),id=uid('PASS'),total=subscription?60000:z.rate*minutes/30;
          const start=['confirmed','refunded'].includes(state)?confirmed:null;
          run('INSERT INTO quotes VALUES(?,?,?,?,?,?,?,?)',quote,z.id,v.plate,minutes,z.tariff,z.rate,total,created);tag('quote',quote);
          run('INSERT INTO sessions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,randomBytes(32).toString('base64url'),quote,uid('KEY'),JSON.stringify(['synthetic',batch,id]),z.id,v.plate,minutes,z.tariff,z.rate,total,created,actor,walkin?created:start,walkin?cutoff:start===null?null:start+minutes*60000);tag('session',id);
          run('INSERT INTO vehicles VALUES(?,?,?,?)',id,v.make,v.model,'');tag('vehicle',id);
          if(subscription){run('INSERT INTO subscriptions VALUES(?,?,NULL)',id,driver);run('INSERT INTO session_owners VALUES(?,?)',id,driver);tag('subscription',id);}
          if(method==='cash'){
            const cid=uid('CASH'),receipt=uid('RECEIPT');
            run('INSERT INTO cash_payments VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',cid,id,total,receipt,state,actor,created,start?actor:null,start,state==='refunded'?actor:null,state==='refunded'?ago(10):null,state==='refunded'?'Synthetic duplicate-charge correction':null);tag('cash',cid);
            if(start){run('INSERT INTO receipts VALUES(?,?,?)',receipt,id,start);tag('receipt',receipt);}
          }else{
            const aid=uid('ATTEMPT');run('INSERT INTO attempts VALUES(?,?,?,?,?,NULL,NULL)',aid,id,uid('PAYKEY'),state,created);tag('attempt',aid);
            if(['confirmed','refunded','failed'].includes(state)){
              const eid=uid('EVENT');run('INSERT INTO events VALUES(?,?,?,?,1)',eid,aid,state==='refunded'?'confirmed':state,start||created);tag('event',eid);
              if(state==='refunded'){const e=uid('EVENT');run('INSERT INTO events VALUES(?,?,?,?,1)',e,aid,'refunded',ago(10));tag('event',e);}
              if(start){const receipt=uid('RECEIPT');run('INSERT INTO receipts VALUES(?,?,?)',receipt,id,start);tag('receipt',receipt);}
            }
          }
          audit(z.id,id,'synthetic_payment_example',`${method}; ${state}; ${total} CDF; sample data`,start||created);summary.passes++;return id;
        };
        const ticket=(v,{arrived=ago(70),departed=null,method='cash'}={})=>{
          let session=null;
          if(departed){const minutes=Math.max(1,Math.ceil((departed-arrived)/1800000))*30;session=pass(v,method,'confirmed',{created:arrived,confirmed:departed,minutes,walkin:true,cutoff:departed});}
          const id=uid('TICKET'),vid=visit(v,session,arrived,departed);run('INSERT INTO walkin_tickets VALUES(?,?,?,?,?,?)',id,vid,z.tariff,z.rate,session,departed);tag('ticket',id);summary.walkinTickets++;return id;
        };
        const occupied=get('SELECT count(*) n FROM visits WHERE zone=? AND checked_out IS NULL',z.id).n;
        const held=get("SELECT count(*) n FROM reservations WHERE zone=? AND status='held' AND expires>?",z.id,end).n;
        const room=Math.max(0,z.capacity-z.blocked-occupied-held);
        const desired=Math.max(0,Math.min(Math.round(z.capacity*[.65,.45,.8,.7,.9,.5,.6,.4][summary.sites-1])-occupied,room-2));
        for(let i=0;i<Math.max(0,desired-4);i++)ticket(vehicle(),{arrived:ago(8+i*9)});
        for(let i=0;i<Math.min(4,desired);i++){
          const v=vehicle(),subscription=i===2,minutes=subscription?43200:i===3?30:240;
          const sid=pass(v,i===0?'cash':'digital','confirmed',{confirmed:ago(i===3?150:60),minutes,subscription});
          visit(v,sid,ago(i===3?140:50));
          if(i===3){const issue=uid('ISSUE');run('INSERT INTO issues VALUES(?,?,?,?,?,NULL)',issue,sid,actor,'Synthetic example: prepaid period expired while the vehicle is still inside.',ago(20));tag('issue',issue);summary.issues++;}
        }
        for(let i=0;i<4;i++)ticket(vehicle(),{arrived:ago(210-i*25),departed:ago(80-i*15),method:i%2?'digital':'cash'});
        const refundedVehicle=vehicle(),refunded=pass(refundedVehicle,'cash','refunded',{created:ago(240),confirmed:ago(230),minutes:60});visit(refundedVehicle,refunded,ago(220),ago(180));
        const awaiting=pass(vehicle(),'cash','recorded',{created:ago(6),minutes:60});
        pass(vehicle(),'digital','pending',{created:ago(4),minutes:60});
        const failed=pass(vehicle(),'digital','failed',{created:ago(12),minutes:60});
        for(const [sid,resolved,reason] of [[awaiting,null,'Synthetic example: cash collection awaiting attendant confirmation.'],[failed,ago(2),'Synthetic example: payment failed; driver was informed before entry.']]){
          const issue=uid('ISSUE');run('INSERT INTO issues VALUES(?,?,?,?,?,?)',issue,sid,actor,reason,ago(5),resolved);tag('issue',issue);summary.issues++;
          if(resolved)audit(z.id,sid,'synthetic_issue_resolved',`${issue}; driver informed`,resolved);
        }
        for(let i=0;i<Math.min(2,room-desired);i++){
          const v=vehicle(),id=uid('HOLD');run('INSERT INTO reservations VALUES(?,?,?,?,?,?,?,?,?,?,NULL,NULL)',id,z.id,v.plate,v.plate.replaceAll(' ',''),v.make,v.model,ago(5),end+(30+i*15)*60000,actor,'held');tag('reservation',id);summary.holds++;
        }
        const cash=get("SELECT coalesce(sum(CASE WHEN c.confirmed>=? AND c.confirmed<=? THEN c.amount ELSE 0 END),0) gross,coalesce(sum(CASE WHEN c.refunded>=? AND c.refunded<=? THEN c.amount ELSE 0 END),0) refunds FROM cash_payments c JOIN sessions s ON s.id=c.session WHERE s.zone=?",dayStart,end,dayStart,end,z.id);
        const expected=5000+cash.gross-cash.refunds,id=uid('CLOSE');run('INSERT INTO cash_closes VALUES(?,?,?,?,?,?,?,?,?,?)',id,z.id,new Date(end+3600000).toISOString().slice(0,10),expected,expected-1000,-1000,'Synthetic example: 1,000 CDF difference for supervisor review.',actor,end,5000);tag('cash_close',id);
        audit(z.id,null,'synthetic_day_loaded',`${desired} sample vehicles inside; training records only`);
      }
      run('UPDATE demo_days SET summary=? WHERE id=?',JSON.stringify(summary),batch);
      return {...summary,alreadyLoaded:false,created:end};
    });
  }
  return {seed,status};
}
