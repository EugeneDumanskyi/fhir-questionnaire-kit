// MUST FAIL: this file is not the one path ADR-0012 permits.

export async function loadOptions(url: string): Promise<unknown> {
  const response = await fetch(url);
  const socket = new WebSocket(url);
  const source = new EventSource(url);
  navigator.sendBeacon(url, '');
  void socket;
  void source;
  return response.json();
}
