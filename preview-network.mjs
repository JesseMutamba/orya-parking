import { isIP } from 'node:net';
export function privateIPv4(host) {
  if(isIP(host)!==4)return false;
  const [a,b]=host.split('.').map(Number);
  return a===10 || (a===172&&b>=16&&b<=31) || (a===192&&b===168);
}
export function previewHost(host) {
  if(!host)return null;
  if(!privateIPv4(host))throw Error('ORYA_LAN_HOST must be a private IPv4 address on this Mac (10.x, 172.16–31.x, or 192.168.x).');
  return host;
}
export function acceptsHost(header,lanHost=null) {
  if(/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(header))return true;
  return !!lanHost && (header===lanHost || new RegExp('^'+lanHost.replaceAll('.','\\.')+':\\d+$').test(header));
}
