import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CopyAssist } from "../../src/sidepanel/components/CopyAssist";
import { FillButton } from "../../src/sidepanel/components/FillButton";
import { FillResults } from "../../src/sidepanel/components/FillResults";
import { FieldMappingPreview } from "../../src/sidepanel/components/FieldMappingPreview";
import { ProfileEditor } from "../../src/sidepanel/components/ProfileEditor";
import { ServiceSelector } from "../../src/sidepanel/components/ServiceSelector";
import { emptyProfile } from "../../src/lib/profiles";
import { scanPage } from "../../src/content/scanner";
import type { FillResponse } from "../../src/types/form";
import { isTrustedUserEvent } from "../../src/sidepanel/user-gesture";
import { copyText } from "../../src/lib/clipboard";
import { loadFixture, makeProfile, officialLocation } from "../helpers";

vi.mock("../../src/sidepanel/user-gesture", () => ({ isTrustedUserEvent: vi.fn(() => false) }));
vi.mock("../../src/lib/clipboard", () => ({ copyText: vi.fn(async () => true) }));
const trusted = vi.mocked(isTrustedUserEvent);
const copyTextMock = vi.mocked(copyText);

beforeEach(() => trusted.mockReturnValue(false));

describe("26. FillButton requires a trusted user click", () => {
  it("ignores untrusted (script-generated) clicks", async () => {
    const onFill = vi.fn();
    render(<FillButton disabled={false} busy={false} onFill={onFill} />);
    screen.getByRole("button", { name: "Fill Details" }).click();
    await userEvent.click(screen.getByRole("button", { name: "Fill Details" }));
    expect(onFill).not.toHaveBeenCalled();
  });

  it("fills once per trusted click", async () => {
    trusted.mockReturnValue(true);
    const onFill = vi.fn();
    render(<FillButton disabled={false} busy={false} onFill={onFill} />);
    await userEvent.click(screen.getByRole("button", { name: "Fill Details" }));
    expect(onFill).toHaveBeenCalledTimes(1);
  });

  it("does nothing while disabled or busy", async () => {
    trusted.mockReturnValue(true);
    const onFill = vi.fn();
    const { rerender } = render(<FillButton disabled busy={false} onFill={onFill} />);
    await userEvent.click(screen.getByRole("button"));
    rerender(<FillButton disabled={false} busy onFill={onFill} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onFill).not.toHaveBeenCalled();
  });

  it("the real gesture check rejects untrusted events", async () => {
    const real = await vi.importActual<typeof import("../../src/sidepanel/user-gesture")>("../../src/sidepanel/user-gesture");
    expect(real.isTrustedUserEvent({ nativeEvent: new MouseEvent("click") })).toBe(false);
  });
});

describe("ServiceSelector", () => {
  it("offers exactly SED ₹300 and Angapradakshina", () => {
    render(<ServiceSelector value={null} onChange={() => undefined} />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(screen.getByLabelText("SED ₹300")).toBeInTheDocument();
    expect(screen.getByLabelText("Angapradakshina")).toBeInTheDocument();
    expect(screen.queryByLabelText(/srivani/i)).toBeNull();
  });
});

describe("ProfileEditor", () => {
  async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText("Profile label"), "Self");
    await user.type(screen.getByLabelText("Full name (as on photo ID)"), "TEST PILGRIM");
    await user.type(screen.getByLabelText("Age"), "33");
    await user.selectOptions(screen.getByLabelText("Gender"), "Female");
    await user.selectOptions(screen.getByLabelText("Photo ID type"), "Aadhaar Card");
  }

  it("stores Aadhaar as 12 digits after removing spaces, and confirms the typed age", async () => {
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
    expect(saved.age).toBe(33);
    expect(saved.ageLastConfirmedAt).toBeTruthy();
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

describe("FieldMappingPreview", () => {
  it("shows labels, chosen options and masked ID numbers; approval enables filling", async () => {
    loadFixture("sed-form.html");
    const scan = scanPage(document, officialLocation(), "sed").response;
    const profile = makeProfile({ photoIdType: "Driving Licence", photoIdNumber: "DLTEST9876" });
    const onApprove = vi.fn();
    render(
      <FieldMappingPreview
        service="sed"
        sections={[scan.sections[0]!]}
        profiles={[profile]}
        issues={scan.issues}
        approval="unreviewed"
        liveVerified={false}
        onApprove={onApprove}
      />,
    );
    expect(screen.getByText(/has not been verified against the live TTD form/)).toBeInTheDocument();
    expect(screen.getByText("Option “Driving License”")).toBeInTheDocument();
    expect(screen.getByText("••••••9876")).toBeInTheDocument();
    expect(screen.queryByText("DLTEST9876")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /I have checked this mapping/ }));
    expect(onApprove).toHaveBeenCalled();
  });

  it("cannot be approved while a used section is ambiguous", () => {
    loadFixture("sed-form.html");
    const scan = scanPage(document, officialLocation(), "sed").response;
    render(
      <FieldMappingPreview
        service="sed"
        sections={[scan.sections[0]!]}
        profiles={[makeProfile()]}
        issues={[{ critical: true, sectionIndex: 1, message: "ambiguous" }]}
        approval="unreviewed"
        liveVerified={false}
        onApprove={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: /I have checked this mapping/ })).toBeDisabled();
  });
});

describe("CopyAssist", () => {
  it("copies the full name on a trusted click and shows the Gender option to click", async () => {
    trusted.mockReturnValue(true);
    copyTextMock.mockResolvedValue(true);
    render(
      <CopyAssist
        service="sed"
        profiles={[makeProfile({ fullName: "TEST PILGRIM ONE", gender: "Male" })]}
        ready
        reasons={[]}
      />,
    );
    expect(
      screen.getByText((_, node) => node?.tagName === "LI" && node.textContent === "Click Gender → Male"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Copy Name" }));
    expect(copyTextMock).toHaveBeenCalledWith("TEST PILGRIM ONE");
    expect(screen.getByRole("button", { name: /Copied — paste on the page/ })).toBeInTheDocument();
  });

  it("does not copy from an untrusted click", async () => {
    trusted.mockReturnValue(false);
    copyTextMock.mockClear();
    render(<CopyAssist service="sed" profiles={[makeProfile()]} ready reasons={[]} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy Name" }));
    expect(copyTextMock).not.toHaveBeenCalled();
  });
});

describe("FillResults", () => {
  const response: FillResponse = {
    outcome: "completed",
    blockReasons: [],
    verifiedCount: 1,
    expectedCount: 3,
    results: [
      { fieldId: "s1:fullName", sectionIndex: 1, key: "fullName", label: "Name", profileLabel: "One", status: "filled", expected: "TEST", actual: "TEST" },
      { fieldId: "s1:age", sectionIndex: 1, key: "age", label: "Age", profileLabel: "One", status: "failed_rejected", expected: "40", actual: "" },
      { fieldId: "s1:photoIdNumber", sectionIndex: 1, key: "photoIdNumber", label: "Photo ID Number", profileLabel: "One", status: "skipped_not_editable", expected: "000011112222" },
    ],
  };

  it("reports exact counts and never claims full success with unresolved fields", () => {
    render(<FillResults result={response} approvedOverwrites={[]} onToggleOverwrite={() => undefined} />);
    expect(screen.getByText(/1 of 3 expected field\(s\) verified/)).toBeInTheDocument();
    expect(screen.getByText(/2 item\(s\) need attention/)).toBeInTheDocument();
    expect(screen.getByText("Failed — field rejected the value")).toBeInTheDocument();
    expect(screen.queryByText("000011112222")).toBeNull();
  });

  it("lets the user approve overwriting a conflict", async () => {
    const onToggle = vi.fn();
    render(
      <FillResults
        result={{
          outcome: "blocked",
          blockReasons: ["1 field(s) already contain different values."],
          verifiedCount: 0,
          expectedCount: 1,
          results: [{ fieldId: "s1:fullName", sectionIndex: 1, key: "fullName", label: "Name", profileLabel: "One", status: "conflict", expected: "A", actual: "B" }],
        }}
        approvedOverwrites={[]}
        onToggleOverwrite={onToggle}
      />,
    );
    expect(screen.getByText("Nothing was changed on the page.")).toBeInTheDocument();
    const row = screen.getByText("Conflict — existing value differs").closest("tr")!;
    await userEvent.click(within(row).getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledWith("s1:fullName");
  });
});
