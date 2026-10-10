export type QueueField = "fullName" | "age" | "photoIdNumber";

export const QUEUE_FIELDS: readonly QueueField[] = ["fullName", "age", "photoIdNumber"];

/** Names as printed on the TTD pilgrim-details form. */
export const QUEUE_FIELD_LABELS: Record<QueueField, string> = {
  fullName: "Name",
  age: "Age",
  photoIdNumber: "Photo ID number",
};

export interface QueueItem {
  /** 1-based pilgrim row on the TTD form. */
  pilgrim: number;
  profileId: string;
  profileLabel: string;
  field: QueueField;
  value: string;
}

export type QueueStatus = "idle" | "active" | "done";

export type PasteProblem =
  /** The pasted text was not the value the queue expected, so it did not advance. */
  | "mismatch"
  /** The page cancelled the paste and the field does not contain the value. */
  | "blocked"
  /** The next value could not be put on the clipboard. */
  | "clipboard";

export interface QueueState {
  status: QueueStatus;
  /** Index of the value that the next paste should contain. */
  position: number;
  total: number;
  problem: PasteProblem | null;
}

export type ContentRequest =
  | { type: "TTDQF_PING" }
  | { type: "TTDQF_QUEUE_START"; values: string[]; position: number }
  | { type: "TTDQF_QUEUE_SEEK"; position: number }
  | { type: "TTDQF_QUEUE_STOP" }
  | { type: "TTDQF_QUEUE_STATE" };

export type ContentEvent = { type: "TTDQF_QUEUE_PROGRESS"; state: QueueState };
