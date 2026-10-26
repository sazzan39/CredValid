import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { AppProvider } from "@/app/AppProvider";
import { routes } from "@/App";
import { resetDemo, setDemoLatency } from "@/demo/store";
import { SEED_SAMPLES } from "@/demo/seed.generated";

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  return { router, ...render(<AppProvider><RouterProvider router={router} /></AppProvider>) };
}
const sample = (s: string) => SEED_SAMPLES.find((x) => x.expected === s)!.credentialId;

beforeEach(() => {
  resetDemo();
  setDemoLatency({ sign: 0, confirm: 0 });
});

describe("verification", () => {
  it("verifies a QR link and labels the result as simulated", async () => {
    renderAt(`/v/${sample("VERIFIED")}`);
    expect(await screen.findByRole("heading", { name: "Credential verified" }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.getAllByText("Simulated").length).toBeGreaterThan(0);
    expect(screen.getByText("What this means")).toBeInTheDocument();
  });

  it.each([
    ["REVOKED", "Credential revoked"],
    ["HASH_MISMATCH", "Credential data mismatch"],
    ["INVALID_SIGNATURE", "Invalid signature"],
    ["ISSUER_UNAUTHORIZED", "Untrusted issuer"],
    ["EXPIRED", "Credential expired"],
    ["NOT_FOUND", "Credential not found"],
  ])("explains %s", async (state, title) => {
    renderAt(`/verify/${sample(state)}`);
    expect(await screen.findByRole("heading", { name: title }, { timeout: 4000 })).toBeInTheDocument();
  });

  it("validates the ID and lets you try another", async () => {
    const user = userEvent.setup();
    renderAt("/verify");
    await user.click(await screen.findByRole("button", { name: "Verify credential" }));
    expect(await screen.findByText("Enter a credential ID.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Credential ID"), "abc");
    await user.click(screen.getByRole("button", { name: "Verify credential" }));
    expect(await screen.findByText(/doesn't look like a credential ID/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Valid degree" }));
    await screen.findByRole("heading", { name: "Credential verified" }, { timeout: 4000 });
    await user.click(screen.getByRole("button", { name: /Verify another credential/ }));
    expect(screen.getByLabelText("Credential ID")).toHaveValue("");
  });
});

describe("issuance", () => {
  it("validates, reviews and issues", async () => {
    const user = userEvent.setup();
    renderAt("/app/issue");
    await user.click(await screen.findByRole("button", { name: "Review credential" }));
    expect(await screen.findByText("Enter the recipient's full name.")).toBeInTheDocument();
    expect(screen.getByText("Enter the degree or job title.")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Full name"), "Test Holder");
    await user.type(screen.getByLabelText(/Email address/), "bad");
    await user.type(screen.getByLabelText("Degree or job title"), "BSc Physics");
    await user.click(screen.getByRole("button", { name: "Review credential" }));
    expect(await screen.findByText(/valid email address/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText(/Email address/));
    await user.type(screen.getByLabelText(/Email address/), "test@example.edu");
    await user.click(screen.getByRole("button", { name: "Review credential" }));

    expect(await screen.findByText("3. Review and issue")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Issue credential \(simulated\)/ }));
    expect(await screen.findByRole("heading", { name: "Credential issued" }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View credential/ })).toBeInTheDocument();
  });
});

describe("credential management", () => {
  it("revokes after confirmation", async () => {
    const user = userEvent.setup();
    renderAt(`/app/credentials/${sample("VERIFIED")}`);
    await user.click(await screen.findByRole("button", { name: "Revoke" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Revoke credential" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument(), { timeout: 4000 });
    expect((await screen.findAllByText("Revoked")).length).toBeGreaterThan(0);
  });

  it("filters the registry and clears filters", async () => {
    const user = userEvent.setup();
    renderAt("/app/credentials");
    await screen.findByText("Vikram Iyer");
    expect(screen.getByText(/1–10 of 17/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Next/ }));
    expect(await screen.findByText(/11–17 of 17/)).toBeInTheDocument();
    const search = screen.getAllByLabelText("Search credentials").at(-1)!;
    await user.type(search, "zzz-nobody");
    expect(await screen.findByText("No credentials match")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /Clear filters/ })[0]!);
    expect(await screen.findByText(/of 17/)).toBeInTheDocument();
  });

  it("renders every route", async () => {
    for (const path of ["/app", "/app/credentials", "/app/issue", "/app/verify", "/app/history", "/app/issuers", "/app/candidates", "/app/analytics", "/app/settings", "/app/transactions", "/", "/how-it-works", "/verify"]) {
      const { unmount } = renderAt(path);
      expect((await screen.findAllByRole("heading", { level: 1 })).length).toBeGreaterThan(0);
      unmount();
    }
  });
});
