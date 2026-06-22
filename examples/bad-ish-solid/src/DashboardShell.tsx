import type { DashboardProps, Preferences, Task, User } from "./types";
import { buildRouteModel, taskRowView } from "./view-models";

export function DashboardShell(props: DashboardProps) {
  const route = buildRouteModel(props);
  const selectedTask = route.visibleTasks.find(
    (task) => task.id === route.selectedTaskId,
  );

  return (
    <main
      data-theme={route.toolbar.theme ?? "light"}
      data-density={route.toolbar.density ?? "comfortable"}
    >
      <Toolbar
        actor={route.actor}
        preferences={route.preferences}
        taskCount={route.visibleTasks.length}
        title={route.toolbar.title}
      />
      <TaskList
        actor={route.actor}
        tasks={route.visibleTasks}
        preferences={route.preferences}
        selectedTaskId={route.selectedTaskId}
        onSelectTask={props.onSelectTask}
      />
      <TaskSummary
        actor={route.actor}
        task={selectedTask}
        preferences={route.preferences}
      />
    </main>
  );
}

function Toolbar(props: {
  actor: User;
  preferences: Preferences;
  taskCount: number;
  title: string;
}) {
  const view = {
    title: props.title,
    subtitle: `${props.taskCount} active tasks`,
    theme: props.preferences.theme,
    avatar: props.actor.avatarUrl ?? "/avatar-fallback.png",
  };

  return (
    <header class={view.theme ?? "light"}>
      <img src={view.avatar} alt={props.actor.name ?? "Unknown user"} />
      <h1>{view.title ?? "Tasks"}</h1>
      <p>{view.subtitle}</p>
      <ThemeChip preferences={props.preferences} actor={props.actor} />
    </header>
  );
}

function ThemeChip(props: { preferences: Preferences; actor: User }) {
  const chip = {
    label: props.preferences.theme === "dark" ? "Night shift" : "Day shift",
    accent: props.preferences.accentColor ?? "#3f7f6f",
    owner: props.actor.email,
  };
  return (
    <span style={`--accent:${chip.accent}`}>
      {chip.label ?? "Theme"} · {chip.owner ?? "n/a"}
    </span>
  );
}

function TaskList(props: {
  actor: User;
  tasks: Task[];
  preferences: Preferences;
  selectedTaskId: string;
  onSelectTask: (taskId: string) => void;
}) {
  return (
    <ul>
      {props.tasks.map((task) => (
        <TaskRow
          task={task}
          actor={props.actor}
          preferences={props.preferences}
          selected={task.id === props.selectedTaskId}
          onSelectTask={props.onSelectTask}
        />
      ))}
    </ul>
  );
}

function TaskRow(props: {
  task: Task;
  actor: User;
  preferences: Preferences;
  selected: boolean;
  onSelectTask: (taskId: string) => void;
}) {
  const row = taskRowView(props.task, props.actor, props.preferences);

  return (
    <li
      class={props.selected ? "selected" : ""}
      style={`--accent:${row.swatch}`}
    >
      <button onClick={() => props.onSelectTask(props.task.id)}>
        <strong>{row.label ?? "Untitled"}</strong>
        <small>{row.ownerLabel ?? "Unknown owner"}</small>
        <span>{row.priorityLabel}</span>
        <span>{row.estimateLabel}</span>
      </button>
    </li>
  );
}

function TaskSummary(props: {
  actor: User;
  task: Task | undefined;
  preferences: Preferences;
}) {
  const summary = {
    heading: props.task?.title ?? "Nothing selected",
    owner: props.actor.name,
    color: props.preferences.accentColor ?? "#3f7f6f",
    estimate: props.task?.estimateHours ?? 0,
  };

  return (
    <aside style={`--accent:${summary.color}`}>
      <h2>{summary.heading ?? "Summary"}</h2>
      <p>{summary.owner ?? "Unknown owner"}</p>
      <p>{summary.estimate ?? 0} hours</p>
    </aside>
  );
}
