import { A } from "@solidjs/router";
import { Show, createResource, createSignal } from "solid-js";
import { Text } from "../components/Text";
import type { Project, ProjectSnapshot } from "../store";

function PageHeader(props: { title: string }) { return <Text value={props.title} />; }

function ProjectLink(props: { projectId: string }) {
  return <A href={`/projects/${props.projectId}`}>Open project</A>;
}

function ProjectDetails(props: { project: Project }) {
  return <Text value={props.project.ownerName} />;
}

function formatProjectCode(value: string) { return value.toUpperCase(); }

export default function ProjectsRoute() {
  const [ready] = createSignal(true);
  const [data] = createResource(ready, async () => {
    const response = await fetch("/api/projects");
    return (await response.json()) as ProjectSnapshot;
  });
  const project = () => data()?.projects.find((item) => item.id === "selected");
  return (
    <Show when={project()}>
      {(current) => <>
        <PageHeader title={current().name} />
        <ProjectLink projectId={current().id} />
        <ProjectDetails project={current()} />
        <span>{formatProjectCode(current().code)}</span>
        <span>{data()?.unrelated[0]?.name}</span>
      </>}
    </Show>
  );
}
