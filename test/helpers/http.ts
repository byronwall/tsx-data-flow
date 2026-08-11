export function call(handler, url: string, method = "GET") {
  return new Promise((resolveCall) => {
    const requestListeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const responseListeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const emitter = (listeners: Map<string, Set<(...args: unknown[]) => void>>) => ({
      once(event: string, listener: (...args: unknown[]) => void) {
        const eventListeners = listeners.get(event) ?? new Set();
        eventListeners.add(listener);
        listeners.set(event, eventListeners);
        return this;
      },
      on(event: string, listener: (...args: unknown[]) => void) {
        const eventListeners = listeners.get(event) ?? new Set();
        eventListeners.add(listener);
        listeners.set(event, eventListeners);
        return this;
      },
      off(event: string, listener: (...args: unknown[]) => void) {
        listeners.get(event)?.delete(listener);
        return this;
      },
    });
    const req = { url, method, headers: {}, aborted: false, ...emitter(requestListeners) };
    const chunks = [];
    const res = {
      _status: 200,
      _headers: {},
      destroyed: false,
      writableEnded: false,
      writableFinished: false,
      writeHead(status, headers) {
        this._status = status;
        if (headers) Object.assign(this._headers, headers);
      },
      end(body) {
        if (body) chunks.push(body);
        this.writableEnded = true;
        this.writableFinished = true;
        resolveCall({
          status: this._status,
          headers: this._headers,
          body: chunks.join(""),
        });
      },
      ...emitter(responseListeners),
    };
    handler(req, res);
  });
}
