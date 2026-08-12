declare module "solid-js" {
  export function createResource<T>(source: () => Promise<T>, fetcher?: never): [() => T | undefined];
  export function createResource<T>(source: unknown, fetcher: () => Promise<T>): [() => T | undefined];
  export function createSignal<T>(value: T): [() => T, (value: T) => void];
  export function Show(props: { when: unknown; children: unknown }): unknown;
}

declare module "@solidjs/router" {
  export function A(props: { href: string; children: unknown }): unknown;
}
