import type { ViewerProfile } from "../data/types";

export function ViewerCard(props: { viewer: ViewerProfile | undefined }) {
  return (
    <p aria-label="viewer">
      Signed in as {props.viewer?.name ?? "loading viewer"} (
      {props.viewer?.team ?? "loading team"})
    </p>
  );
}
