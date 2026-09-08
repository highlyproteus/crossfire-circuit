/** Only a bare HTTPS origin may be advertised as the multiplayer endpoint. */
export function publicOrigin(value: string | undefined): string {
  if (!value) throw new Error('Public game origin is required');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port ||
      url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Public game origin must be a bare HTTPS origin');
  }
  return url.origin;
}

export function approvedEndpoint(endpoint: string, configured: string | undefined): boolean {
  try { return publicOrigin(endpoint) === publicOrigin(configured); }
  catch { return false; }
}
