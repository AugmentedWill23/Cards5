// Reads a fetch Response as JSON without throwing on non-JSON bodies.
// Proxies and load balancers answer with plain text ("Bad Gateway",
// "no available server") when the app is unreachable; this turns that into a
// readable error instead of a JSON parse failure.
export async function readJson<T = any>(res: Response): Promise<T> {
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    return {
      error: res.ok
        ? 'Unexpected response from the server.'
        : `The server is temporarily unavailable (${res.status}). Please try again in a moment.`,
    } as T
  }
}
