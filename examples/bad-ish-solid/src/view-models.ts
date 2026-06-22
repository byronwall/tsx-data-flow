import type { DashboardProps, Preferences, Task, User } from "./types";

// A cross-file helper: DashboardShell's render path flows through here, so the
// representative path crosses into F2 and the boundary-report scores this
// function (a wide-fan-in confluence collapsing 6 sources into one model).
export function buildRouteModel(props: DashboardProps) {
  const selectedTaskId = props.selectedTaskId ?? props.tasks[0]?.id ?? "empty";
  return {
    actor: props.user,
    visibleTasks: props.tasks,
    preferences: props.preferences,
    selectedTaskId,
    toolbar: {
      title: `${props.user.name}'s tasks`,
      theme: props.preferences.theme,
      density: props.preferences.density ?? "comfortable",
    },
  };
}

export function taskRowView(task: Task, user: User, preferences: Preferences) {
  const packed = {
    task,
    owner: user,
    swatch: preferences.accentColor ?? "#3f7f6f",
  };
  return {
    label: packed.task.title.trim(),
    ownerLabel: packed.owner.name,
    priorityLabel: packed.task.priority ?? "normal",
    estimateLabel: `${packed.task.estimateHours ?? 0}h`,
    swatch: packed.swatch,
  };
}
