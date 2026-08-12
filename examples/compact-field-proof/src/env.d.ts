declare module "node:fs/promises" {
  export function readFile(path: string, encoding: "utf8"): Promise<string>;
}

declare namespace JSX {
  interface IntrinsicElements { [name: string]: Record<string, unknown>; }
}
