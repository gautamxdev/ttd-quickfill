import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { installChromeMock, type ChromeMock } from "../helpers";

let chromeMock: ChromeMock;
beforeEach(() => {
  chromeMock = installChromeMock();
});

describe("side panel app", () => {
  it("opens without a vault, adds a profile, and never sends a fill without a click", async () => {
    const { App } = await import("../../src/sidepanel/App");
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText("TTD QuickFill")).toBeInTheDocument();
    expect(screen.getByText(/not affiliated with TTD/)).toBeInTheDocument();
    expect(screen.queryByText(/passphrase/i)).toBeNull();
    expect(screen.getByText(/active tab is not the official TTD portal/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+ Add profile" }));
    await user.type(screen.getByLabelText("Profile label"), "Self");
    await user.type(screen.getByLabelText("Full name (as on photo ID)"), "TEST PANEL PILGRIM");
    await user.type(screen.getByLabelText("Age"), "50");
    await user.selectOptions(screen.getByLabelText("Gender"), "Male");
    await user.selectOptions(screen.getByLabelText("Photo ID type"), "Passport");
    await user.type(screen.getByLabelText("Photo ID number"), "T7654321");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByText("TEST PANEL PILGRIM")).toBeInTheDocument();
    expect(screen.getByText("Complete")).toBeInTheDocument();

    await waitFor(() => expect(JSON.stringify(chromeMock.store)).toContain("TEST PANEL PILGRIM"));
    expect(JSON.stringify(chromeMock.store)).toContain("T7654321");

    await user.click(screen.getByLabelText("Select Self"));
    await user.click(screen.getByLabelText("SED ₹300"));
    expect(screen.getByText("Copy onto the page")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fill Details" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy Name" })).toBeEnabled();
    expect(chromeMock.sentMessages.some((m) => (m as { type: string }).type === "TTDQF_FILL")).toBe(false);
  });
});
