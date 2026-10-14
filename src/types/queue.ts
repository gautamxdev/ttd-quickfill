/** Age is not queued: TTD's Age box cancels the Cmd/Ctrl+V keystroke, so it is typed by hand. */
export type QueueField = "fullName" | "photoIdNumber";

export const QUEUE_FIELDS: readonly QueueField[] = ["fullName", "photoIdNumber"];

/** Names as printed on the TTD pilgrim-details form. */
export const QUEUE_FIELD_LABELS: Record<QueueField, string> = {
  fullName: "Name",
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
  /** The queued value was pasted into a different field in the pilgrim row. */
  | "wrong-field"
  /** The queued value was pasted into a different pilgrim's row. */
  | "wrong-row"
  /** The pilgrim-details layout could not be safely identified. */
  | "layout"
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
