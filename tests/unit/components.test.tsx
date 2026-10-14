import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PasteQueue } from "../../src/sidepanel/components/PasteQueue";
import { ProfileEditor } from "../../src/sidepanel/components/ProfileEditor";
import { emptyProfile } from "../../src/lib/profiles";
import { isTrustedUserEvent } from "../../src/sidepanel/user-gesture";
import { writeClipboard } from "../../src/lib/clipboard";
import { sendToContent, type ActiveTab } from "../../src/lib/messaging";
import type { ContentRequest, QueueState } from "../../src/types/queue";
import { installChromeMock, makeProfile, type ChromeMock } from "../helpers";

vi.mock("../../src/sidepanel/user-gesture", () => ({ isTrustedUserEvent: vi.fn(() => false) }));
vi.mock("../../src/lib/clipboard", () => ({ writeClipboard: vi.fn(async () => true) }));
vi.mock("../../src/lib/messaging", () => ({ sendToContent: vi.fn() }));
const trusted = vi.mocked(isTrustedUserEvent);
const clipboard = vi.mocked(writeClipboard);
const send = vi.mocked(sendToContent);

const TTD_TAB: ActiveTab = { id: 7, url: "https://ttdevasthanams.ap.gov.in/booking", approved: true };
const OTHER_TAB: ActiveTab = { id: 8, url: undefined, approved: false };

let chromeMock: ChromeMock;
beforeEach(() => {
  chromeMock = installChromeMock();
  trusted.mockReturnValue(false);
  clipboard.mockClear();
  clipboard.mockResolvedValue(true);
  send.mockReset();
  send.mockImplementation(async (_tab, msg: ContentRequest) => {
    switch (msg.type) {
      case "TTDQF_QUEUE_START":
        return { status: "active", position: msg.position, total: msg.values.length, problem: null } satisfies QueueState;
      case "TTDQF_QUEUE_SEEK":
        return { status: "active", position: msg.position, total: 4, problem: null } satisfies QueueState;
      default:
        return { status: "idle", position: 0, total: 0, problem: null } satisfies QueueState;
    }
  });
});

const pilgrims = [
  makeProfile({ id: "a", label: "Self", fullName: "TEST PILGRIM ONE", age: 40, photoIdNumber: "000011112222" }),
  makeProfile({ id: "b", label: "Mother", fullName: "TEST PILGRIM TWO", age: 62, gender: "Female", photoIdType: "Passport", photoIdNumber: "P0000001" }),
];

function progress(state: QueueState, tabId = TTD_TAB.id) {
  act(() => chromeMock.emitRuntimeMessage({ type: "TTDQF_QUEUE_PROGRESS", state }, { tab: { id: tabId } as chrome.tabs.Tab }));
}

describe("PasteQueue", () => {
  it("previews the queue with masked ID numbers and what to pick by hand", () => {
    render(<PasteQueue tab={TTD_TAB} profiles={pilgrims} />);
    expect(screen.getByText("Pilgrim 1 ← TEST PILGRIM ONE")).toBeInTheDocument();
    expect(screen.getByText("Pilgrim 2 ← TEST PILGRIM TWO")).toBeInTheDocument();
    expect(screen.getByText("••••••••2222")).toBeInTheDocument();
    expect(screen.queryByText("000011112222")).toBeNull();
    expect(screen.getByText(/may be listed as “Aadhar Card”/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start paste queue" })).toBeEnabled();
  });

  it("cannot start off the TTD portal or without pilgrims", () => {
    const { rerender } = render(<PasteQueue tab={OTHER_TAB} profiles={pilgrims} />);
    expect(screen.getByRole("button", { name: "Start paste queue" })).toBeDisabled();
    expect(screen.getByText(/sign in yourself and go to the pilgrim-details form/)).toBeInTheDocument();
    rerender(<PasteQueue tab={TTD_TAB} profiles={[]} />);
    expect(screen.getByRole("button", { name: "Start paste queue" })).toBeDisabled();
    expect(screen.getByText("Select at least one pilgrim.")).toBeInTheDocument();
  });

  it("ignores an untrusted (script-generated) click", async () => {
    render(<PasteQueue tab={TTD_TAB} profiles={pilgrims} />);
    await userEvent.click(screen.getByRole("button", { name: "Start paste queue" }));
    expect(clipboard).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("Start copies the first name and arms the page; progress moves the Next box", async () => {
    trusted.mockReturnValue(true);
    render(<PasteQueue tab={TTD_TAB} profiles={pilgrims} />);
    await userEvent.click(screen.getByRole("button", { name: "Start paste queue" }));
    expect(clipboard).toHaveBeenCalledWith("TEST PILGRIM ONE");
    expect(send).toHaveBeenCalledWith(TTD_TAB, {
      type: "TTDQF_QUEUE_START",
      values: ["TEST PILGRIM ONE", "000011112222", "TEST PILGRIM TWO", "P0000001"],
      position: 0,
    });
    expect(screen.getByRole("status")).toHaveTextContent("1 of 4");
    expect(screen.getByRole("status")).toHaveTextContent("Pilgrim 1 · Name");

    progress({ status: "active", position: 1, total: 4, problem: null });
    expect(screen.getByRole("status")).toHaveTextContent("Pilgrim 1 · Photo ID number");
    expect(screen.getByRole("status")).toHaveTextContent("••••••••2222");

    progress({ status: "active", position: 3, total: 4, problem: null }, 99);
    expect(screen.getByRole("status")).toHaveTextContent("2 of 4");
  });

  it("reminds the user to enter Age and Gender manually after each Name", () => {
    render(<PasteQueue tab={TTD_TAB} profiles={pilgrims} />);
    const manual = screen.getAllByText(/^Yourself: enter Age/);
    expect(manual.map((m) => m.textContent)).toEqual([
      "Yourself: enter Age, choose Gender, and pick Photo ID Proof → Aadhaar Card (may be listed as “Aadhar Card”)",
      "Yourself: enter Age, choose Gender, and pick Photo ID Proof → Passport",
    ]);
  });

  it("Back copies the previous value; mismatch is explained; done tells the user to check and submit", async () => {
    trusted.mockReturnValue(true);
    render(<PasteQueue tab={TTD_TAB} profiles={pilgrims} />);
    await userEvent.click(screen.getByRole("button", { name: "Start paste queue" }));
    progress({ status: "active", position: 2, total: 4, problem: "mismatch" });
    expect(screen.getByRole("alert")).toHaveTextContent(/not the queued value/);

    clipboard.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "← Back" }));
    expect(clipboard).toHaveBeenCalledWith("000011112222");
    expect(send).toHaveBeenLastCalledWith(TTD_TAB, { type: "TTDQF_QUEUE_SEEK", position: 1 });

    progress({ status: "done", position: 4, total: 4, problem: null });
    expect(screen.getByText(/All 4 values pasted and the clipboard is cleared/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start again" })).toBeEnabled();
  });

  it("Stop disarms the page and clears the clipboard", async () => {
    trusted.mockReturnValue(true);
    render(<PasteQueue tab={TTD_TAB} profiles={pilgrims} />);
    await userEvent.click(screen.getByRole("button", { name: "Start paste queue" }));
    await userEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(send).toHaveBeenLastCalledWith(TTD_TAB, { type: "TTDQF_QUEUE_STOP" });
    expect(clipboard).toHaveBeenLastCalledWith("");
    expect(screen.getByRole("button", { name: "Start paste queue" })).toBeInTheDocument();
  });

  it("resumes from the saved item after a page reload", async () => {
    trusted.mockReturnValue(true);
    render(<PasteQueue tab={TTD_TAB} profiles={pilgrims} />);
    await userEvent.click(screen.getByRole("button", { name: "Start paste queue" }));
    progress({ status: "active", position: 2, total: 4, problem: null });
    progress({ status: "idle", position: 0, total: 0, problem: null });

    expect(screen.getByText(/queue paused.*Pilgrim 2 · Name/i)).toBeInTheDocument();
    clipboard.mockClear();
    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(clipboard).toHaveBeenCalledWith("TEST PILGRIM TWO");
    expect(send).toHaveBeenLastCalledWith(TTD_TAB, {
      type: "TTDQF_QUEUE_START",
      values: ["TEST PILGRIM ONE", "000011112222", "TEST PILGRIM TWO", "P0000001"],
      position: 2,
    });
  });

  it("warns when the clipboard cannot be written", async () => {
    trusted.mockReturnValue(true);
    clipboard.mockResolvedValue(false);
    render(<PasteQueue tab={TTD_TAB} profiles={pilgrims} />);
    await userEvent.click(screen.getByRole("button", { name: "Start paste queue" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Could not put the value on the clipboard/);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("user gesture check", () => {
  it("the real check rejects untrusted events", async () => {
    const real = await vi.importActual<typeof import("../../src/sidepanel/user-gesture")>("../../src/sidepanel/user-gesture");
    expect(real.isTrustedUserEvent({ nativeEvent: new MouseEvent("click") })).toBe(false);
  });
});

describe("ProfileEditor", () => {
  async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText("Full name (as on photo ID)"), "TEST PILGRIM");
    await user.selectOptions(screen.getByLabelText("Photo ID type"), "Aadhaar Card");
  }

  it("stores Aadhaar as 12 digits after removing spaces without asking for manual TTD fields", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<ProfileEditor profile={emptyProfile()} others={[]} isNew onSave={onSave} onCancel={() => undefined} />);
    await fillBasics(user);
    await user.type(screen.getByLabelText("Photo ID number"), "0000 1111 2222");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0]![0];
    expect(saved.photoIdNumber).toBe("000011112222");
    expect(saved.fullName).toBe("TEST PILGRIM");
    expect(saved.label).toBe("TEST PILGRIM");
    expect(saved.age).toBeNull();
    expect(saved.gender).toBe("");
  });

  it("rejects a wrong-length Aadhaar number without saving", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<ProfileEditor profile={emptyProfile()} others={[]} isNew onSave={onSave} onCancel={() => undefined} />);
    await fillBasics(user);
    await user.type(screen.getByLabelText("Photo ID number"), "0000 1111 222");
    await user.click(screen.getByRole("button", { name: "Save profile" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/12 digits/);
  });

  it("masks the ID number field by default", () => {
    render(<ProfileEditor profile={makeProfile()} others={[]} isNew={false} onSave={() => undefined} onCancel={() => undefined} />);
    expect(screen.getByLabelText("Photo ID number")).toHaveClass("masked");
  });
});
