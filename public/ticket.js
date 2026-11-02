document.querySelector('#print').onclick=()=>window.print();
if(new URLSearchParams(location.search).get('autoprint')==='1')window.addEventListener('load',()=>window.print(),{once:true});
