window.parkingMap = (() => {
  let current=null;
  function dispose(){if(current){current.remove();current=null;}}
  function mount(el,sites,{staff=false,allowed=[],onOperate=null}={}){
    dispose();
    el.innerHTML=`<section class="parking-explorer" aria-label="Kinshasa parking map and site list"><div class="map-toolbar"><div class="field"><label for="map-search">Find a parking site</label><input id="map-search" placeholder="Site name, area or code" type="search" autocomplete="off"></div><div class="field"><label for="map-area">Area</label><select id="map-area"><option value="">All areas</option>${[...new Set(sites.map(s=>s.area))].sort().map(a=>`<option translate="no">${esc(a)}</option>`).join('')}</select></div><label class="map-available"><input type="checkbox" id="map-available"> Available only</label><button class="secondary" id="map-gombe">Gombe focus</button><button class="secondary" id="map-all">All sites</button></div><div class="map-split"><aside class="map-sidebar"><div class="map-list-summary" role="status"></div><div class="map-site-list"></div></aside><div class="map-canvas-wrap"><div class="parking-map" role="region" aria-label="Map of Kinshasa parking sites"></div><div class="map-legend"><span class="map-dot"></span>Spaces available <span class="map-dot low"></span>5 or fewer</div><p class="map-network" role="status" hidden>Street map unavailable. Site pins and the list still work; check your internet connection.</p></div></div><div class="map-footnote"><span>Demo parking sites · illustrative pins, not verified car parks. Counts come from recorded visits and holds.</span><span>Kinshasa · no device location collected</span></div></section>`;
    const canvas=el.querySelector('.parking-map'),list=el.querySelector('.map-site-list'),summary=el.querySelector('.map-list-summary');
    if(!window.L){canvas.textContent='Map unavailable. Use the site list below.';return;}
    const map=L.map(canvas,{scrollWheelZoom:false,minZoom:10,maxZoom:18,zoomControl:true});current=map;
    parkingBasemap.add(map,()=>{el.querySelector('.map-network').hidden=false;});
    L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
    const layer=L.layerGroup().addTo(map),markers=new Map();let selected=null,filtered=sites;
    const located=s=>Number.isFinite(s.latitude)&&Number.isFinite(s.longitude);
    const focus=()=>map.fitBounds([[-4.329,15.274],[-4.294,15.321]],{padding:[28,28]});
    function fit(){const points=filtered.filter(located).map(s=>[s.latitude,s.longitude]);if(points.length)map.fitBounds(points,{padding:[45,45],maxZoom:15});}
    function select(s){
      selected=s.id;list.querySelectorAll('[data-map-site]').forEach(b=>b.classList.toggle('active',b.dataset.mapSite===s.id));
      const marker=markers.get(s.id);if(marker){map.setView([s.latitude,s.longitude],Math.max(14,map.getZoom()),{animate:false});marker.openPopup();}
    }
    function popup(s){
      const box=document.createElement('div');box.className='parking-popup';
      box.innerHTML=`<span class="badge">${s.locationType==='illustrative'?'ILLUSTRATIVE PIN':'CONFIGURED PIN'}</span><h3 translate="no">${esc(s.name)}</h3><p><span translate="no">${esc(s.area)}</span> · <span translate="no">${esc(s.id)}</span></p><strong>${s.open?s.available+' spaces available':'Closed to entry'}</strong><p>${money(s.rate)} / 30 min<br>${s.occupied} inside · ${s.held} held</p>`;
      if(staff){if(allowed.includes(s.id)){const button=document.createElement('button');button.className='primary';button.textContent='Operate this site →';button.onclick=()=>onOperate?.(s.id);box.append(button);}else{const note=document.createElement('p');note.textContent='Public availability. Staff access is limited to your assigned site.';box.append(note);}}
      else if(s.open&&s.available>0){const link=document.createElement('a');link.className='primary';link.href='/?book=1&zone='+encodeURIComponent(s.id);link.textContent='Choose this site →';box.append(link);}
      else{const note=document.createElement('p');note.textContent='Check another site for available spaces.';box.append(note);}
      return box;
    }
    function draw(){
      const query=el.querySelector('#map-search').value.trim().toLowerCase(),area=el.querySelector('#map-area').value,available=el.querySelector('#map-available').checked;
      filtered=sites.filter(s=>(!query||`${s.name} ${s.id} ${s.area}`.toLowerCase().includes(query))&&(!area||s.area===area)&&(!available||(s.open&&s.available>0)));
      summary.textContent=`${filtered.length} ${filtered.length===1?'site':'sites'} · ${filtered.reduce((n,s)=>n+s.available,0)} spaces available`;
      list.innerHTML=filtered.length?filtered.map(s=>`<button class="map-site-option ${selected===s.id?'active':''}" data-map-site="${esc(s.id)}" aria-label="Show ${esc(s.name)} on map"><span class="map-site-symbol">P</span><span class="map-option-copy"><strong><span translate="no">${esc(s.name)}</span></strong><span><span translate="no">${esc(s.area)}</span> · <span translate="no">${esc(s.id)}</span></span><span>${money(s.rate)} / 30 min</span><small>${located(s)?s.locationType==='illustrative'?'Illustrative location':'Configured location':'Location not configured'}</small></span><span class="map-spaces ${s.available<=5?'low':''}"><b>${s.available}</b><small>${s.open?'available':'closed'}</small></span></button>`).join(''):'<p class="empty">No sites match these filters.</p>';
      layer.clearLayers();markers.clear();
      for(const s of filtered.filter(located)){
        const marker=L.marker([s.latitude,s.longitude],{title:`${s.name}: ${s.available} spaces`,alt:s.name,keyboard:true,icon:L.divIcon({className:'parking-marker-shell',html:`<span class="parking-marker ${s.available<=5?'low':''}"><b>${s.available}</b><small>P</small></span>`,iconSize:[46,44],iconAnchor:[23,42]})}).addTo(layer).bindPopup(popup(s),{maxWidth:260});
        marker.on('click',()=>{selected=s.id;list.querySelectorAll('[data-map-site]').forEach(b=>b.classList.toggle('active',b.dataset.mapSite===s.id));});markers.set(s.id,marker);
      }
      list.querySelectorAll('[data-map-site]').forEach(b=>b.onclick=()=>select(filtered.find(s=>s.id===b.dataset.mapSite)));
    }
    el.querySelector('#map-search').oninput=draw;el.querySelector('#map-area').onchange=()=>{draw();fit();};el.querySelector('#map-available').onchange=draw;
    el.querySelector('#map-gombe').onclick=focus;el.querySelector('#map-all').onclick=fit;
    draw();focus();
    return {select,dispose};
  }
  return {mount,dispose};
})();
