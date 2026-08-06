import type { JSX } from "solid-js";

type RouteFrameProps = {
  title: string;
  children: JSX.Element;
};

export function RouteFrame(props: RouteFrameProps) {
  return (
    <main aria-labelledby="records-heading">
      <header>
        <p>Solid route fixture</p>
        <h1 id="records-heading">{props.title}</h1>
      </header>
      <section>{props.children}</section>
    </main>
  );
}
