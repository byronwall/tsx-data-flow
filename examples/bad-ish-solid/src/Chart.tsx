import { Match, Switch } from "solid-js";
import type { Task } from "./types";

type ChartProps = {
  type: "bar" | "line";
  tasks: Task[];
  accent: string;
};

type Series = { label: string; value: number }[];

function groupBarSeries(tasks: Task[]): Series {
  return tasks.map((task) => ({
    label: task.title,
    value: task.estimateHours ?? 0,
  }));
}

function rollingLineSeries(tasks: Task[]): Series {
  let running = 0;
  return tasks.map((task) => {
    running += task.estimateHours ?? 0;
    return { label: task.title, value: running };
  });
}

// Awkward shape: the same `props.type` discriminant is forked in three sibling
// places — the `activeSeries` ternary, the `caption` ternary, and the
// `<Switch>` — while both branches' data is computed eagerly at the top and
// prop-drilled into children that are each the sole consumer.
export function Chart(props: ChartProps) {
  const barData = () => groupBarSeries(props.tasks);
  const barSeries = () => barData().map((point) => point.value);
  const lineSeries = () => rollingLineSeries(props.tasks);

  const activeSeries = () =>
    props.type === "bar" ? barSeries() : lineSeries();
  const caption = props.type === "bar" ? "Estimate by task" : "Cumulative load";

  return (
    <figure data-accent={props.accent}>
      <figcaption>{caption}</figcaption>
      <p>{activeSeries().length} points</p>
      <Switch>
        <Match when={props.type === "bar"}>
          <BarChart categories={barData().map((point) => point.label)} values={barSeries()} />
        </Match>
        <Match when={props.type === "line"}>
          <LineChart series={lineSeries()} />
        </Match>
      </Switch>
    </figure>
  );
}

function BarChart(props: { categories: string[]; values: number[] }) {
  return (
    <ul>
      {props.categories.map((category, index) => (
        <li>
          {category}: {props.values[index]}
        </li>
      ))}
    </ul>
  );
}

function LineChart(props: { series: Series }) {
  return (
    <ol>
      {props.series.map((point) => (
        <li>
          {point.label}: {point.value}
        </li>
      ))}
    </ol>
  );
}
