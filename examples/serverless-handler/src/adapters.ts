import type { AuditStream, RecordsTable } from "./handler";

export const recordsTable: RecordsTable = {
  async query(_input) {
    return [];
  },
};

export const auditStream: AuditStream = {
  async put(_event) {
    // The deployed function supplies the real persistence and audit clients.
  },
};
