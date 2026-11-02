// Localizes text nodes and accessible labels in place, retaining inputs, focus,
// event handlers, camera streams and the current QR credential when switching.
(() => {
  const core = globalThis.oryaI18nCore, originals = new WeakMap();
  const attributes = ['aria-label','title','placeholder','alt','data-label'];
  const excluded = 'script,style,code,textarea,[translate="no"],[data-language-toggle]';
  let language = 'en';
  try { language = localStorage.getItem('orya.language') === 'fr' ? 'fr' : 'en'; } catch {}
  const explicit = new URLSearchParams(location.search).get('lang');
  if (['en','fr'].includes(explicit)) language = explicit;
  const t = value => core.translate(value,language);
  function write(node,key,value,set) {
    let fields = originals.get(node); if (!fields) { fields = {}; originals.set(node,fields); }
    const previous = fields[key];
    const source = previous && previous.output === value ? previous.source : value;
    const output = t(source); fields[key] = {source,output};
    if (output !== value) set(output);
  }
  function apply(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!node.parentElement?.closest(excluded)) write(node,'text',node.nodeValue,v=>node.nodeValue=v);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE) return;
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.closest(excluded)) return;
      // An option without a value otherwise changes the submitted data with its label.
      if (node.tagName === 'OPTION' && !node.hasAttribute('value')) node.setAttribute('value',node.value);
      for (const key of attributes) if (node.hasAttribute(key)) write(node,key,node.getAttribute(key),v=>node.setAttribute(key,v));
    }
    for (const child of node.childNodes) apply(child);
  }
  function persist() {
    try {localStorage.setItem('orya.language',language);}catch{}
    document.cookie = `orya_language=${language}; Path=/; Max-Age=31536000; SameSite=Lax`;
    document.documentElement.lang = language;
    document.querySelectorAll('[data-language]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.language===language)));
  }
  function setLanguage(next) {
    if (!['en','fr'].includes(next)) return;
    const changed=language!==next;language=next;persist();
    if(changed&&location.pathname==='/api/ops/ticket/print'){const url=new URL(location.href);url.searchParams.set('lang',language);url.searchParams.delete('autoprint');location.replace(url.href);return;}
    const currentURL=new URL(location.href);if(currentURL.searchParams.has('lang')){currentURL.searchParams.delete('lang');history.replaceState(null,'',currentURL);}
    apply(document.documentElement);
    document.dispatchEvent(new CustomEvent('orya:languagechange',{detail:{language}}));
    if(changed)window.webkit?.messageHandlers?.oryaLanguage?.postMessage(language);
  }
  function toggle() {
    const controls = document.createElement('div');controls.className='language-toggle';controls.dataset.languageToggle='';controls.setAttribute('role','group');controls.setAttribute('aria-label','Language / Langue');
    controls.innerHTML='<button type="button" data-language="en" lang="en" aria-label="English">EN</button><button type="button" data-language="fr" lang="fr" aria-label="Français">FR</button>';
    controls.querySelectorAll('button').forEach(button => button.onclick=()=>setLanguage(button.dataset.language));
    (document.querySelector('header') || document.querySelector('.print-controls') || document.body).append(controls);
  }
  // Application validation is independent of the browser/OS language.
  document.addEventListener('invalid',event=>{
    const input=event.target;if(!input.validity)return;event.preventDefault();
    let message='Check this value.';
    if(input.validity.valueMissing)message='This field is required.';
    else if(input.validity.typeMismatch)message=input.type==='email'?'Enter a valid email address.':'Enter a valid value.';
    else if(input.validity.tooShort)message=`Use at least ${input.minLength} characters.`;
    else if(input.validity.tooLong)message=`Use no more than ${input.maxLength} characters.`;
    else if(input.validity.rangeUnderflow)message=`Enter a value of at least ${input.min}.`;
    else if(input.validity.rangeOverflow)message=`Enter a value no greater than ${input.max}.`;
    else if(input.validity.stepMismatch)message=`Use increments of ${input.step}.`;
    const id=`${input.id || input.name}-validation`;let error=document.getElementById(id);
    if(!error){error=document.createElement('span');error.id=id;error.className='field-validation';error.setAttribute('role','alert');input.insertAdjacentElement('afterend',error);}
    error.textContent=message;input.setAttribute('aria-invalid','true');input.setAttribute('aria-errormessage',id);apply(error);
    if(!input.form?.querySelector('[aria-invalid="true"]') || input.form.querySelector('[aria-invalid="true"]')===input)input.focus();
  },true);
  document.addEventListener('input',event=>{const input=event.target;if(input.hasAttribute?.('aria-errormessage')){document.getElementById(input.getAttribute('aria-errormessage'))?.remove();input.removeAttribute('aria-errormessage');input.removeAttribute('aria-invalid');}});
  document.addEventListener('click',event=>{
    const link=event.target.closest?.('a[href]');if(!link)return;
    const url=new URL(link.href,location.href);
    if(url.origin===location.origin && (url.pathname==='/api/ops/ticket/print'||url.searchParams.get('format')==='csv')){url.searchParams.set('lang',language);link.href=url.href;}
  },true);
  addEventListener('storage',event=>{if(event.key==='orya.language')setLanguage(event.newValue);});
  toggle();if(window.webkit?.messageHandlers?.oryaLanguage)document.querySelector('[data-language-toggle]').hidden=true;persist();apply(document.documentElement);
  new MutationObserver(records=>{
    const nodes=new Set();for(const record of records){if(record.type==='childList')record.addedNodes.forEach(node=>nodes.add(node));else nodes.add(record.target);}
    nodes.forEach(apply);
  }).observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attributes});
  globalThis.i18n={t,apply,setLanguage,get language(){return language;},date:core.date,confirm:message=>confirm(t(message)),source:node=>originals.get(node)?.text?.source??node.nodeValue};
})();
