/* Driver portal uses the existing shared request/form helpers and parking flow. */
window.driverPortal = (() => {
  let user = null, sites = [], section = 'sites';
  const safe = fn => (...args) => Promise.resolve(fn(...args)).catch(e => toast(e.message));
  const href = code => `/?book=1&zone=${encodeURIComponent(code)}`;
  const duration = s => s.passType === 'subscription' ? '30-day subscription' : `${s.minutes} minutes`;
  function shell() {
    return `<div class="driver-toolbar"><div class="portal-tabs" aria-label="Driver workspace">${[['sites','Find parking'],['passes','My passes'],['plans','Subscriptions'],['history','Parking history']].map(([id,name])=>`<button data-section="${id}" aria-pressed="${section===id}" class="${section===id?'selected':''}">${name}</button>`).join('')}</div><div class="row wrap">${user ? `<span class="hint">Hello, <span translate="no">${esc(user.name)}</span></span><button class="secondary" id="driver-out">Sign out</button>` : '<a class="secondary" href="/account">Sign in</a><a class="primary" href="/account?mode=signup">Create account →</a>'}</div></div>`;
  }
  function bindShell() {
    document.querySelectorAll('[data-section]').forEach(b => b.onclick = safe(async () => {
      section = b.dataset.section;
      if (!user && ['passes','history'].includes(section)) { location.href='/account'; return; }
      await render();
    }));
    if ($('#driver-out')) $('#driver-out').onclick = safe(async () => {
      await api('/api/driver/logout', {}); user=null; sites=[]; clearInterval(poll); app.innerHTML=''; location.replace('/account');
    });
  }
  function siteCard(s) {
    return `<article class="site-card"><div class="site-art"><span class="site-parking" aria-hidden="true">P</span><span class="site-area"><span translate="no">${esc(s.area)}</span></span><span class="site-code"><span translate="no">${esc(s.id)}</span></span></div><div class="site-body"><span class="badge">SYNTHETIC SITE</span><h2 translate="no">${esc(s.name)}</h2><p class="muted">${esc(s.description)}</p><div class="site-availability"><strong>${s.available}<small> / ${s.capacity}</small></strong><span>spots available now<br><b>RECORDED AVAILABILITY</b></span></div><div class="availability-track" aria-hidden="true"><span style="width:${Math.min(100,Math.max(0,s.capacity?s.available/s.capacity*100:0))}%"></span></div><p class="hint">Inside: ${s.occupied} · Held: ${s.held} · Unavailable: ${s.blocked}. Based on staff records, not sensors.</p><div class="site-price"><span>Sample rate</span><strong>${money(s.rate)} <small>/ 30 min</small></strong></div>${s.open&&s.available>0?`<a class="primary full" data-site="${esc(s.id)}" href="${href(s.id)}">Choose this site →</a>`:`<button class="secondary full" disabled>${s.open?'No spaces currently available':'Site closed'}</button>`}</div></article>`;
  }
  async function render() {
    clearInterval(poll);window.parkingMap?.dispose();
    if (section === 'sites') {
      const data = await api('/api/sites'); sites=data.sites;
      app.innerHTML = shell()+`<section class="map-intro"><div><p class="eyebrow">KINSHASA / GOMBE & NEARBY</p><h1>Find your space in Kinshasa.</h1><p class="intro">Explore the city’s parking sites. Compare availability and rates, then choose your next stop.</p></div><div><span class="badge">SYNTHETIC SITES</span><p class="hint">Updated ${time(data.refreshed)} · Kinshasa</p><button id="refresh-sites" class="secondary">Refresh availability ↻</button></div></section><div id="driver-map"></div><div class="directory-heading"><div><p class="eyebrow">THE ORYA NETWORK</p><h2>A space for every destination.</h2></div><p>${sites.length} sites · ${sites.reduce((n,s)=>n+s.available,0)} spaces available</p></div><section class="sites-grid" aria-label="Parking sites">${sites.map(siteCard).join('')}</section><section class="account-invite"><div><p class="eyebrow">YOUR DRIVER ACCOUNT</p><h2>One home for every parking pass.</h2><p>Save your digital passes, try a 30-day subscription, and revisit your parking history.</p></div><a class="${user?'secondary':'primary'}" href="${user?'/?section=passes':'/account?mode=signup'}">${user?'Open my passes':'Get started'} →</a></section>`;
      bindShell(); $('#refresh-sites').onclick=safe(render);window.parkingMap.mount($('#driver-map'),sites);
    } else if (section === 'plans') await plans();
    else await wallet();
  }
  async function plans() {
    sites=(await api('/api/sites')).sites;
    app.innerHTML=shell()+heading('A PASS FOR YOUR ROUTINE','Park your way.','Choose an occasional stay or try a subscription. All prices are sample demo prices.')+`<section class="plans-grid"><article class="card plan-card"><p class="eyebrow">PAY PER VISIT</p><h2>Digital pass</h2><p class="plan-price">Your time.<br>Your choice.</p><p class="muted">Pick a site and stay from 30 minutes to 8 hours. Your private pass and receipt are ready after simulated payment.</p><ul class="plan-benefits"><li>Choose a plate and duration</li><li>Server-calculated quote before payment</li><li>Saved in your history when signed in</li></ul><a class="secondary full" href="/">Explore sites →</a></article><article class="card plan-card featured"><span class="badge">DEMO SUBSCRIPTION</span><h2>30-day parking pass</h2><p class="plan-price">60,000 <small>CDF / 30 days</small></p><p class="muted">One vehicle, one selected site, one continuous 30-day pass. Starts when the server simulator confirms payment.</p><ul class="plan-benefits"><li>Digital subscription pass in your wallet</li><li>No automatic renewal or real billing</li><li>Space is not reserved or guaranteed</li></ul>${user?`<form id="subscription-form"><div class="field"><label for="subscription-site">Choose your site</label><select id="subscription-site" name="zone">${sites.map(s=>`<option value="${esc(s.id)}" translate="no">${esc(s.name)}</option>`).join('')}</select></div><div class="field"><label for="subscription-plate">Vehicle plate</label><input id="subscription-plate" name="plate" value="${esc(user.plate)}" minlength="3" maxlength="16" required></div><button class="primary full" type="submit" data-online>Review demo subscription →</button></form>`:'<a class="primary full" href="/account?mode=signup&plan=subscription">Create an account to subscribe →</a>'}</article></section>`;
    bindShell();
    bindForm('#subscription-form', async d => {
      const selected=sites.find(s=>s.id===d.zone), idem=crypto.randomUUID();
      const card=$('.featured');
      card.innerHTML=`<p class="eyebrow">REVIEW YOUR DEMO SUBSCRIPTION</p><h2>30 days. One simple pass.</h2><dl class="details"><div><dt>Site</dt><dd><span translate="no">${esc(selected.name)}</span></dd></div><div><dt>Vehicle</dt><dd><span translate="no">${esc(d.plate.toUpperCase())}</span></dd></div><div><dt>Period</dt><dd>30 days from confirmation</dd></div><div><dt>Renewal</dt><dd>No automatic renewal</dd></div></dl><div class="total"><span>Sample total</span><strong>${money(selected.subscriptionPrice)}</strong></div><p class="notice">Demo only. No money is collected. This does not guarantee a parking space. You will start a test payment on the next screen.</p><form id="subscription-confirm"><button class="primary full" type="submit" data-online>Create subscription pass →</button></form><button class="link-button spaced" id="edit-subscription">← Change details</button>`;
      $('#edit-subscription').onclick=safe(plans);
      bindForm('#subscription-confirm',async()=>{
        const s=await api('/api/driver/subscriptions',{zone:d.zone,plate:d.plate,idempotencyKey:idem});
        location.href='/#pass='+encodeURIComponent(s.accessToken);
      });
    });
  }
  function passCard(s) {
    return `<article class="card wallet-card"><div class="card-top"><span class="badge">${s.passType==='subscription'?'30-DAY SUBSCRIPTION':'DIGITAL PASS'}</span>${chip(s.validity)}</div><h2 translate="no">${esc(s.plate)}</h2><p class="muted"><span translate="no">${esc(s.zoneName)}</span></p><dl class="details"><div><dt>Payment</dt><dd>${chip(s.payment)}</dd></div><div><dt>Duration</dt><dd>${duration(s)}</dd></div><div><dt>Valid until</dt><dd>${time(s.end)}</dd></div><div><dt>Sample total</dt><dd>${money(s.total)}</dd></div></dl><a class="primary full" href="/#pass=${encodeURIComponent(s.accessToken)}">Open digital pass →</a>${s.passType==='subscription'?`<p class="hint">No automatic renewal.${s.cancelled?' Ended early.':''}</p>${s.validity==='valid'?`<button class="link-button" data-end="${esc(s.reference)}">End subscription early</button>`:''}`:''}</article>`;
  }
  async function wallet() {
    if (!user) { location.href='/account'; return; }
    const data=await api('/api/driver/history');
    const active=data.rows.filter(s=>!['expired','cancelled'].includes(s.validity)&&!['failed','refunded'].includes(s.payment));
    app.innerHTML=shell()+heading(section==='history'?'YOUR PAST & PRESENT STAYS':'YOUR DIGITAL WALLET',section==='history'?'Every stay, remembered.':'Ready when you are.',section==='history'?'Only sessions saved to your account appear here.':'Your active passes, subscriptions and payments awaiting completion.')+(section==='history'?`<section class="card"><div class="panel-heading"><h2>Parking history (${data.rows.length})</h2><button class="secondary" id="refresh-wallet">Refresh</button></div>${table(data.rows,[['Vehicle',s=>`<div><strong><span translate="no">${esc(s.plate)}</span></strong><small><span translate="no">${esc(s.reference)}</span></small></div>`],['Site',s=>privateText(s.zoneName)],['Pass',s=>duration(s)],['Created',s=>time(s.created)],['Payment',s=>chip(s.payment)],['Validity',s=>chip(s.validity)],['Receipt / pass',s=>`<a href="/#pass=${encodeURIComponent(s.accessToken)}">Open pass ↗</a>`]])}</section>`:`<div class="panel-heading"><p class="muted">${active.length} current pass${active.length===1?'':'es'}</p><button class="secondary" id="refresh-wallet">Refresh</button></div><section class="wallet-grid">${active.length?active.map(passCard).join(''):'<section class="card empty"><h2>Your next stay starts here.</h2><p>You have no current passes yet.</p><a class="primary" href="/">Find parking →</a></section>'}</section>`)+`<section class="card claim-card"><h3>Payment method</h3><form id="wallet-payment-method">${paymentMethodField('wallet-payment',user.paymentMethod)}<button type="submit" class="secondary">Save payment method</button></form></section><section class="card claim-card"><h3>Already have a guest pass?</h3><p class="muted">Paste its private pass URL to save it to this account. We never match history by plate alone.</p><form id="claim-pass" class="row wrap"><input name="link" aria-label="Private pass URL" placeholder="Paste your private pass URL" required><button class="secondary" type="submit">Save existing pass</button></form><p class="hint">Keep private pass links confidential. A pass can belong to only one account.</p></section>`;
    bindShell(); $('#refresh-wallet').onclick=safe(wallet);bindForm('#wallet-payment-method',async d=>{user=await api('/api/driver/payment-method',d);await wallet();toast('Demo payment method saved.');});
    bindForm('#claim-pass',async d=>{
      let accessToken;
      try { accessToken=new URLSearchParams(new URL(d.link).hash.slice(1)).get('pass'); } catch { throw Error('Paste the complete private pass URL.'); }
      if(!accessToken) throw Error('That link does not contain a private pass token.');
      await api('/api/driver/claim',{accessToken});await wallet();toast('Pass saved to your account.');
    });
    document.querySelectorAll('[data-end]').forEach(b=>b.onclick=()=>{
      const box=b.closest('.wallet-card');
      box.innerHTML=`<h2>End this subscription?</h2><p>Its parking validity will end immediately. The simulated payment remains in your history. No refund is issued.</p><button class="primary full" id="confirm-end">End demo subscription</button><button class="secondary full spaced" id="keep-subscription">Keep subscription</button>`;
      $('#keep-subscription').onclick=safe(wallet);
      $('#confirm-end').onclick=safe(async()=>{await api('/api/driver/subscriptions/end',{reference:b.dataset.end});await wallet();toast('Demo subscription ended.');});
    });
  }
  function auth() {
    let signup=new URLSearchParams(location.search).get('mode')==='signup';
    function draw() {
      app.innerHTML=`<section class="onboarding"><div class="onboarding-copy"><a class="link-button" href="/">← Explore parking sites</a><p class="eyebrow spaced">YOUR ORYA DRIVER ACCOUNT</p><h1>A smoother stay<br>starts <em>here.</em></h1><p class="intro">Your vehicle. Your passes. Every parking visit, together in one place.</p><ol class="onboarding-steps"><li><b>01</b><div><strong>Create your account</strong><p>Your name, email and vehicle details.</p></div></li><li><b>02</b><div><strong>Choose how you park</strong><p>A digital pass per visit or a 30-day subscription.</p></div></li><li><b>03</b><div><strong>Keep your history</strong><p>Return to your passes and simulated receipts.</p></div></li></ol><p class="hint">Local demo accounts only. Use synthetic details and a password you do not use elsewhere. Email verification and password recovery are not connected.</p></div><section class="card"><div class="auth-switch"><button id="signup-mode" class="${signup?'selected':''}">Create account</button><button id="signin-mode" class="${!signup?'selected':''}">Sign in</button></div><h2>${signup?'Welcome to Orya.':'Welcome back.'}</h2><p class="muted">${signup?'Set up your driver profile in a few steps.':'Sign in to access your passes and history.'}</p><form id="driver-auth">${signup?'<div class="field"><label for="driver-name">Name</label><input id="driver-name" name="name" autocomplete="name" minlength="2" maxlength="80" required></div>':''}<div class="field"><label for="driver-email">Email</label><input id="driver-email" name="email" type="email" autocomplete="email" required></div><div class="field"><label for="driver-password">Password</label><input id="driver-password" name="password" type="password" autocomplete="${signup?'new-password':'current-password'}" minlength="12" maxlength="128" required><span class="hint">At least 12 characters.</span></div>${signup?`<div class="field"><label for="driver-plate">Vehicle plate</label><input id="driver-plate" name="plate" placeholder="e.g. DEMO 101" minlength="3" maxlength="16" required></div><div class="row wrap"><div class="field"><label for="driver-make">Make (optional)</label><input id="driver-make" name="make" maxlength="60" placeholder="e.g. Toyota"></div><div class="field"><label for="driver-model">Model (optional)</label><input id="driver-model" name="model" maxlength="60" placeholder="e.g. Corolla"></div></div>${paymentMethodField('driver-payment')}<fieldset class="plan-choice"><legend>How would you like to park?</legend><label><input type="radio" name="preference" value="digital" ${new URLSearchParams(location.search).get('plan')!=='subscription'?'checked':''}><span><strong>Digital pass</strong><small>Pay per visit · choose your duration</small></span></label><label><input type="radio" name="preference" value="subscription" ${new URLSearchParams(location.search).get('plan')==='subscription'?'checked':''}><span><strong>Subscription</strong><small>30-day demo pass · no automatic billing</small></span></label></fieldset>`:''}<button class="primary full" type="submit">${signup?'Create driver account':'Sign in to your account'} →</button></form><p class="fine">No real payments. Account creation does not buy or activate a parking pass.</p></section></section>`;
      $('#signup-mode').onclick=()=>{signup=true;draw();};$('#signin-mode').onclick=()=>{signup=false;draw();};
      bindForm('#driver-auth',async d=>{user=await api(signup?'/api/driver/signup':'/api/driver/login',d);location.href='/?section='+(signup?(user.preference==='subscription'?'plans':'sites'):'passes');});
    }
    draw();
  }
  async function init() {
    try {user=await api('/api/driver/me');} catch(e) {if(e.status!==401)throw e;}
    if(location.pathname==='/account'){if(user){section='passes';await render();}else auth();return;}
    if(token){await pass();poll=setInterval(()=>pass().catch(()=>{}),5000);return;}
    if(new URLSearchParams(location.search).get('book')==='1') {
      zone=await api('/api/zone?code='+encodeURIComponent(new URLSearchParams(location.search).get('zone')||'CG-01'));
      driver();if(user)$('#plate').value=user.plate;return;
    }
    section=new URLSearchParams(location.search).get('section')||'sites';
    if(!['sites','plans','passes','history'].includes(section))section='sites';
    if(!user&&['passes','history'].includes(section)){location.href='/account';return;}
    await render();
  }
  return {init};
})();
