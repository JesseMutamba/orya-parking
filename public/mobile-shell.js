// getRandomValues also works in a private-LAN HTTP preview. Use cryptographic
// submission keys there when randomUUID is restricted to secure contexts.
if(!crypto.randomUUID)Object.defineProperty(crypto,'randomUUID',{value:()=>{
  const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
  const h=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}});
window.oryaMobile = (() => {
  const operations=location.pathname.startsWith('/mobile/operations');
  document.body.classList.add(operations?'mobile-operations':'mobile-consumer');
  document.title=operations?'Orya Operations':'Orya Parking';
  document.querySelector('#mobile-product').textContent=operations?'OPERATIONS':'PARKING';
  document.querySelector('.mobile-brand').href=operations?'/mobile/operations':'/mobile/driver';
  const icons={map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3Z"/><path d="M9 3v15M15 6v15"/>',pass:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M8 5v14M12 10h5M12 14h3"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',person:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',entry:'<path d="M13 4h7v16h-7M3 12h12m-4-4 4 4-4 4"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'};
  const icon=id=>`<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[id]||icons.map}</svg>`;
  function nav(active='sites'){
    const items=operations?[['gate','entry','Entry'],['walkins','pass','Exit'],['overview','grid','Overview'],['more','more','More']]:[['sites','map','Explore'],['passes','pass','My parking'],['history','clock','History'],['account','person','Account']];
    document.querySelector('#mobile-nav').innerHTML=items.map(([id,i,label])=>`<button data-mobile-tab="${id}" ${active===id?'aria-current="page"':''}>${icon(i)}<span>${label}</span></button>`).join('');
    document.querySelectorAll('[data-mobile-tab]').forEach(b=>b.onclick=()=>{
      if(operations){if(!window.mobileStaffReady){toast('Sign in to open the operations tools.');return;}if(b.dataset.mobileTab==='more')window.adminPortal.mobileMore();else window.adminPortal.navigate(b.dataset.mobileTab).catch(e=>toast(e.message));}
      else window.mobileDriver.navigate(b.dataset.mobileTab).catch(e=>toast(e.message));
    });
  }
  // Print through the native iOS bridge only when it is available. Browser printing
  // remains the existing explicit preview/print flow.
  function printTicket(url){if(window.webkit?.messageHandlers?.oryaPrint){window.webkit.messageHandlers.oryaPrint.postMessage(new URL(url,location.origin).href);return true;}return false;}
  document.addEventListener('click',e=>{
    const a=e.target.closest('a');if(!a)return;
    const url=new URL(a.href,location.href);
    if(url.origin===location.origin&&url.pathname==='/api/ops/ticket/print'&&window.webkit?.messageHandlers?.oryaPrint){e.preventDefault();printTicket(a.href);}
  });
  nav();
  return {operations,nav,icon,printTicket};
})();
