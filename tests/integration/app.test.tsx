import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { installChromeMock, type ChromeMock } from "../helpers";

let chromeMock: ChromeMock;
beforeEach(() => {
  chromeMock = installChromeMock();
});

describe("side panel app", () => {
  it("opens without a vault, adds a profile and previews its paste queue without messaging the page", async () => {
    const { App } = await import("../../src/sidepanel/App");
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText("TTD QuickFill")).toBeInTheDocument();
    expect(screen.getByText(/not affiliated with TTD/)).toBeInTheDocument();
    expect(screen.queryByText(/passphrase/i)).toBeNull();
    expect(screen.getByText(/sign in yourself and go to the pilgrim-details form/)).toBeInTheDocument();

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
    expect(screen.getByText("Paste queue")).toBeInTheDocument();
    expect(screen.getByText("Pilgrim 1 ← Self")).toBeInTheDocument();
    expect(screen.getByText("TEST PANEL PILGRIM", { selector: ".mono" })).toBeInTheDocument();
    expect(screen.getByText("••••4321")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start paste queue" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Fill Details" })).toBeNull();
    expect(chromeMock.sentMessages).toEqual([]);
  });
});
