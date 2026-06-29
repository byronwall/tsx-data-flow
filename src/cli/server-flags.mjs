export function extractServerFlags(argv) {
  const rest = [];
  const server = { port: 4317, host: "127.0.0.1", open: false };
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    const [name, inline] = raw.split("=", 2);
    const value = () => (inline !== undefined ? inline : argv[++i]);
    switch (name) {
      case "--port":
        server.port = Number.parseInt(value(), 10);
        break;
      case "--host":
        server.host = value();
        break;
      case "--open":
        server.open = true;
        break;
      case "--help":
      case "-h":
        rest.push(raw);
        break;
      default:
        rest.push(raw);
    }
  }
  return { server, rest };
}
