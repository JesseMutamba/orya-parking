// Shared deterministic messages. API values, references and stored records stay canonical.
(() => {
  const messages = globalThis.oryaFrench || {}, formats = new Map();
  const normalize = value => String(value ?? '').replace(/\s+/g, ' ').trim();
  const escapeRE = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = Object.entries(messages).filter(([key]) => /\{\d+\}/.test(key)).map(([key, value]) => {
    const ids = []; let previous = 0, source = '';
    for (const match of key.matchAll(/\{(\d+)\}/g)) { source += escapeRE(key.slice(previous, match.index)) + '(.*?)'; ids.push(match[1]); previous = match.index + match[0].length; }
    source += escapeRE(key.slice(previous));
    return { key, re: new RegExp('^' + source + '$'), ids, value, weight: key.replace(/\{\d+\}/g, '').length };
  }).sort((a,b) => b.weight - a.weight);
  function format(value) {
    for (const [en, fr] of formats) value = value.split(en).join(fr);
    return value.replace(/\b(\d{1,3}(?:,\d{3})+)(?=\s*(?:CDF|$))/g, number => number.replaceAll(',', '\u202f'));
  }
  function translate(value, language='en', depth=0) {
    const source = String(value ?? ''); if (language !== 'fr') return source;
    const key = normalize(source); let result = messages[key];
    if (result === undefined) {
      let m;
      if ((m = /^(\d+) current pass(?:es)?$/.exec(key))) result = `${m[1]} pass en cours`;
      else if ((m = /^(\d+) saved$/.exec(key))) result = `${m[1]} véhicule${Number(m[1])>1?'s':''} enregistré${Number(m[1])>1?'s':''}`;
      else if ((m = /^(\d+) parking sites?$/.exec(key))) result = `${m[1]} parking${Number(m[1])>1?'s':''}`;
      else if ((m = /^(\d+) sites? · (\d+) spaces available$/.exec(key))) result = `${m[1]} parking${Number(m[1])>1?'s':''} · ${m[2]} place${Number(m[2])>1?'s':''} disponible${Number(m[2])>1?'s':''}`;
      else if (depth < 3) for (const pattern of patterns) {
        const match = pattern.re.exec(key); if (!match) continue;
        const captures = Object.fromEntries(pattern.ids.map((id,i) => [id,match[i+1]]));
        result = pattern.value.replace(/\{(\d+)\}/g, (_,id) => ['Show {2} on map','{0}: {1} spaces'].includes(pattern.key)?captures[id]:translate(captures[id], language, depth+1)); break;
      }
    }
    if (result === undefined && depth < 3 && key.includes(' · ')) result=key.split(' · ').map(part=>translate(part,language,depth+1)).join(' · ');
    if (result === undefined) result = key;
    return (source.match(/^\s*/)?.[0] || '') + format(result) + (source.match(/\s*$/)?.[0] || '');
  }
  function date(value, options={}) {
    const opts = {timeZone:'Africa/Kinshasa',...options};
    const en = new Intl.DateTimeFormat('en-GB',opts).format(value), fr = new Intl.DateTimeFormat('fr-CD',opts).format(value);
    formats.set(normalize(en),fr); return en;
  }
  function languageFrom(request) {
    const url = new URL(request.url,'http://localhost');
    const value = url.searchParams.get('lang') || request.headers.cookie?.match(/(?:^|;\s*)orya_language=(en|fr)(?:;|$)/)?.[1];
    return value === 'fr' ? 'fr' : 'en';
  }
  globalThis.oryaI18nCore = {translate,date,normalize,languageFrom,messages};
})();
