window.walkinDesk = (() => {
  const duration = ms => {const seconds=Math.max(0,Math.floor(ms/1000)),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60);return `${hours?hours+'h ':''}${minutes}m ${seconds%60}s`;};
  const printUrl = (reference, receipt=false, auto=false) => '/api/ops/ticket/print?'+new URLSearchParams({reference,lang:i18n.language,...(receipt?{receipt:'1'}:{}),...(auto?{autoprint:'1'}:{})});
  const safely = fn => async(...args)=>{try{await fn(...args);}catch(e){toast(e.message);}};
  function entry(el,site,onIssued){
    el.innerHTML=`<div class="quick-entry-head"><div><p class="eyebrow">WALK-IN / PAY AT EXIT</p><h2>Plate. Ticket. Park.</h2><p class="muted">Issue a ticket to record arrival and start the clock. No account or payment needed at entry.</p></div><strong class="badge">${site.available} available</strong></div><form id="quick-walkin"><div class="row wrap"><div class="field"><label for="quick-plate">License plate</label><input id="quick-plate" name="plate" placeholder="Enter plate" minlength="3" maxlength="16" autocomplete="off" required></div><button class="primary" type="submit" data-online>Issue & print ticket →</button></div><details class="spaced"><summary>Vehicle details (optional)</summary><div class="row spaced"><div class="field"><label for="quick-make">Make</label><input id="quick-make" name="make" maxlength="60"></div><div class="field"><label for="quick-model">Model</label><input id="quick-model" name="model" maxlength="60"></div></div></details><p class="hint">${money(site.rate)} per started 30 minutes · 30-minute minimum · rate fixed at entry</p></form><div id="issued-ticket"></div>`;
    let key=crypto.randomUUID();
    bindForm('#quick-walkin',async values=>{
      // Open synchronously from the submit gesture so popup blocking cannot duplicate admission.
      const nativePrint=!!window.webkit?.messageHandlers?.oryaPrint;
      const preview=nativePrint?null:window.open('about:blank','orya-ticket-print');
      try{
        const r=await api('/api/ops/tickets',{...values,zone:site.id,idempotencyKey:key});key=crypto.randomUUID();
        const url=printUrl(r.reference,false,true);if(preview)preview.location.href=url;else if(nativePrint)window.oryaMobile.printTicket(url);
        await onIssued();
        $('#issued-ticket').innerHTML=`<div class="notice"><strong><span translate="no">${esc(r.ticket.plate)}</span> is checked in.</strong> Ticket <strong><span translate="no">${esc(r.reference)}</span></strong><div class="row wrap spaced"><a class="secondary" href="${printUrl(r.reference)}" target="_blank" rel="noopener">Reprint ticket</a><span>${preview?'The print window is open.':'Open Reprint ticket to print.'} Printing again does not create another session.</span></div></div>`;
        $('#quick-plate').focus();
      }catch(e){if(preview)preview.close();throw e;}
    });
  }
  async function pending(el,site){
    let query='',state='pending',current=null;
    el.innerHTML=`<section class="card"><div class="panel-heading"><div><p class="eyebrow">WALK-INS / EXIT DESK</p><h2>Find a ticket. Finish the stay.</h2></div><button id="ticket-list-refresh" class="secondary">Refresh sessions ↻</button></div><form id="ticket-search" class="row wrap spaced"><div class="field"><label for="ticket-query">Ticket number or plate</label><input id="ticket-query" name="q" placeholder="Scan or enter ticket / plate" autocomplete="off"></div><div class="field"><label for="ticket-state">Show</label><select id="ticket-state" name="state"><option value="pending">Still inside</option><option value="all">All tickets</option></select></div><button class="primary" type="submit">Find ticket</button></form><p class="hint">Still inside includes unpaid tickets, pending payments and paid vehicles awaiting exit. Amounts update on refresh; the server calculates the final charge.</p><div id="ticket-list"></div></section><section id="ticket-detail" class="card spaced" hidden></section>`;
    async function refresh(){
      const r=await api('/api/ops/tickets?'+new URLSearchParams({zone:site.id,q:query,state}));
      $('#ticket-list').innerHTML=table(r.rows,[['Ticket / vehicle',t=>`<div><strong><span translate="no">${esc(t.plate)}</span></strong>${t.synthetic?'<span class="synthetic-label">SYNTHETIC</span>':''}<small><span translate="no">${esc(t.id)}</span></small></div>`],['Entered',t=>time(t.checked_in)],['Duration',t=>duration(t.elapsedMs)],['Charge',t=>`${money(t.total)}<small>${t.session?'Fixed exit charge':'Current estimate'}</small>`],['Status',t=>chip(t.checked_out?'departed':t.payment==='unpaid'?'pay_at_exit':t.payment)],['Action',t=>`<button class="secondary" data-ticket="${esc(t.id)}">${t.checked_out?'View ticket':'Review exit'}</button>`]]);
      document.querySelectorAll('[data-ticket]').forEach(b=>b.onclick=safely(()=>open(b.dataset.ticket)));
    }
    async function open(ref){
      current=ref;
      const record=(await api('/api/ops/ticket?'+new URLSearchParams({reference:ref}))).ticket;
      const r=record.checked_out?{ticket:record,quote:null}:await api('/api/ops/ticket/quote',{reference:ref,idempotencyKey:crypto.randomUUID()});
      const t=r.ticket,q=r.quote,total=q?.total??t.total,minutes=q?.billedMinutes??t.billedMinutes;
      const box=$('#ticket-detail');box.hidden=false;
      box.innerHTML=`<div class="panel-heading"><div><p class="eyebrow"><span translate="no">${esc(t.id)}</span></p><h2>${esc(t.plate)} · ${t.checked_out?'Completed stay':'Exit checkout'}</h2></div>${chip(t.checked_out?'departed':t.payment==='unpaid'?'pay_at_exit':t.payment)}</div><dl class="details"><div><dt>Entered · Kinshasa</dt><dd>${time(t.checked_in)}</dd></div><div><dt>${t.checked_out?'Total stay':'Elapsed stay'}</dt><dd>${duration(t.elapsedMs)}</dd></div><div><dt>Rate at entry</dt><dd>${money(t.rate)} / 30 min</dd></div><div><dt>Billed duration</dt><dd>${minutes} minutes</dd></div><div><dt>Charged through</dt><dd>${time(q?.calculated??t.charge_until)}</dd></div>${t.checked_out?`<div><dt>Departure</dt><dd>${time(t.checked_out)}</dd></div>`:''}</dl><div class="total"><span>${t.payment==='confirmed'?'Paid amount':'Amount due'}</span><strong>${money(total)}</strong></div>${q?`<p class="hint">Quote valid until ${time(q.expires)}. Refresh if it expires. Confirm the arriving vehicle matches this ticket before collecting cash.</p>`:''}<div id="exit-actions"></div><div class="row wrap spaced"><button class="secondary" id="ticket-refresh-detail">Refresh status / charge</button><a class="secondary" href="${printUrl(ref)}" target="_blank" rel="noopener">Reprint entry ticket</a>${t.receipt?`<a class="secondary" href="${printUrl(ref,true)}" target="_blank" rel="noopener">Print receipt</a>`:''}</div>`;
      const actions=$('#exit-actions');
      if(t.checked_out)actions.innerHTML='<p class="notice">Departure recorded. This ticket cannot be used for another visit.</p>';
      else if(t.payment==='confirmed'){
        actions.innerHTML='<p class="notice">Payment confirmed. Record exit when the vehicle leaves.</p><form id="ticket-exit"><button class="primary full" type="submit" data-online>Record vehicle exit →</button></form>';
        const key=crypto.randomUUID();bindForm('#ticket-exit',async()=>{await api('/api/ops/ticket/exit',{reference:ref,idempotencyKey:key});await refresh();await open(ref);toast('Vehicle exited; space released.');});
      }else if(t.payment==='pending')actions.innerHTML='<p class="notice">Waiting for the demo payment provider. Exit stays blocked until payment is confirmed. Refresh status to check.</p>';
      else {
        actions.innerHTML=`${['failed','refunded'].includes(t.payment)?'<p class="notice">Digital payment is not valid. Collect the displayed amount in cash to complete this visit.</p>':''}<form id="ticket-cash-exit"><button class="primary full" type="submit" data-online>Cash received & vehicle exited · ${money(total)}</button></form>${['unpaid','not_started'].includes(t.payment)?'<form id="ticket-digital"><button class="secondary full spaced" type="submit" data-online>Start demo digital payment</button></form>':''}`;
        const cashKey=crypto.randomUUID(),digitalKey=crypto.randomUUID(),payKey=crypto.randomUUID();
        bindForm('#ticket-cash-exit',async()=>{await api('/api/ops/ticket/cash-exit',{reference:ref,quote:q?.id,amount:total,idempotencyKey:cashKey});await refresh();await open(ref);toast('Cash receipt saved and departure recorded.');});
        bindForm('#ticket-digital',async()=>{const s=await api('/api/ops/ticket/digital-charge',{reference:ref,quote:q?.id,idempotencyKey:digitalKey});await api('/api/payment',{idempotencyKey:payKey},s.accessToken);await refresh();await open(ref);});
      }
      $('#ticket-refresh-detail').onclick=safely(async()=>{await refresh();await open(ref);});
      box.scrollIntoView({behavior:'smooth',block:'start'});
    }
    bindForm('#ticket-search',async d=>{query=d.q.trim().toUpperCase();state=d.state;await refresh();});
    $('#ticket-list-refresh').onclick=safely(async()=>{await refresh();if(current)await open(current);});
    await refresh();return {open};
  }
  return {entry,pending};
})();
