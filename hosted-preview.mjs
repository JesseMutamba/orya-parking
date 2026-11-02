// Explicit HTTPS configuration for an isolated hosted test deployment.
export function hostedOrigin(value) {
  if (!value) return null;
  let url;
  try { url = new URL(value); } catch { throw Error('ORYA_PUBLIC_ORIGIN must be an HTTPS origin.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(url.hostname) || url.hostname.endsWith('.localhost')) {
    throw Error('ORYA_PUBLIC_ORIGIN must contain only a public HTTPS hostname and optional port.');
  }
  return url.origin;
}

export function hostedRequest(req, origin) {
  const expected = new URL(origin);
  // The proxy supplies TLS; never use a client-supplied forwarded host to choose it.
  if (req.headers.host !== expected.host || req.headers['x-forwarded-proto'] !== 'https') return false;
  return true;
}
