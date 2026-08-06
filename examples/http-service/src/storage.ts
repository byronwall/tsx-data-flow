import { readFile, writeFile } from "node:fs/promises";
import type { NewRecordInput, RecordItem } from "./types";
import { validateStoredRecords } from "./validation";

export class RecordStore {
  constructor(private readonly filePath: string) {}

  async loadRecords(): Promise<RecordItem[]> {
    const source = await readFile(this.filePath, "utf8");
    return validateStoredRecords(JSON.parse(source) as unknown);
  }

  async appendRecord(input: NewRecordInput): Promise<RecordItem> {
    const records = await this.loadRecords();
    const record: RecordItem = {
      id: `record-${records.length + 1}`,
      ...input,
    };

    records.push(record);
    await writeFile(this.filePath, `${JSON.stringify(records, null, 2)}\n`);
    return record;
  }
}
