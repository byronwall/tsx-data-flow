export type User = {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
};

export type Task = {
  id: string;
  title: string;
  ownerId: string;
  priority?: "low" | "normal" | "high";
  estimateHours?: number;
};

export type Preferences = {
  theme: "light" | "dark";
  density?: "compact" | "comfortable";
  accentColor?: string;
};

export type DashboardProps = {
  user: User;
  tasks: Task[];
  preferences: Preferences;
  selectedTaskId?: string;
  onSelectTask: (taskId: string) => void;
};
