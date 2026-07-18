export type PacketEntry = { id: string; route: string; flow: string; item: string; label: string; file: string | null; line: number | null; completeness: string; note: string; addedAt: string };
export type TrajectoryPacket = { id: string; name: string; entries: PacketEntry[] };
const STORAGE_KEY = "tsx-data-flow-route-packets-v1";
export function readPackets(storage: Storage): TrajectoryPacket[] { try { const value = JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]"); return Array.isArray(value) ? value : []; } catch { return []; } }
export function writePackets(storage: Storage, packets: TrajectoryPacket[]) { storage.setItem(STORAGE_KEY, JSON.stringify(packets)); }
export function packetMarkdown(packet: TrajectoryPacket) { return [`# ${packet.name}`, "", ...packet.entries.flatMap((entry, index) => [`## ${index + 1}. ${entry.label}`, "", `- Route: \`${entry.route}\``, `- Trajectory: \`${entry.flow}\``, `- Source: ${entry.file ? `\`${entry.file}:${entry.line ?? 1}\`` : "not retained"}`, `- Completeness: ${entry.completeness}`, ...(entry.note ? [`- Note: ${entry.note}`] : []), ""])].join("\n"); }
