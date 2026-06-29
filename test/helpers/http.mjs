export function call(handler, url, method = "GET") {
  return new Promise((resolveCall) => {
    const chunks = [];
    const res = {
      _status: 200,
      _headers: {},
      writeHead(status, headers) {
        this._status = status;
        if (headers) Object.assign(this._headers, headers);
      },
      end(body) {
        if (body) chunks.push(body);
        resolveCall({
          status: this._status,
          headers: this._headers,
          body: chunks.join(""),
        });
      },
    };
    handler({ url, method }, res);
  });
}
