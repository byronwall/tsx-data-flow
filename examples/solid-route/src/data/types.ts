export type RecordStatus = "active" | "archived";

export type RecordItem = {
  id: string;
  title: string;
  owner: string;
  status: RecordStatus;
  score: number;
};

export type ViewerProfile = {
  name: string;
  team: string;
};

export type RecordRowModel = {
  id: string;
  title: string;
  statusLabel: string;
  scoreLabel: string;
};

export type RecordSummaryModel = {
  visibleCount: number;
  flaggedCount: number;
};
