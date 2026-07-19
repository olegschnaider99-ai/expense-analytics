// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiPanel } from "./AiPanel";

describe("AiPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the disabled upgrade affordance instead of the input once quota is exceeded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: "quota_exceeded" }),
      }),
    );

    render(<AiPanel />);
    fireEvent.click(screen.getByText("What did I spend the most on last week?"));

    await waitFor(() => {
      expect(screen.getByText(/used today's free questions/i)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /upgrade to premium/i })).toBeDisabled();
    expect(screen.queryByPlaceholderText("Ask a question…")).not.toBeInTheDocument();
  });

  it("shows the assistant's answer on a normal successful response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ answer: "You spent 500 UAH on Groceries." }),
      }),
    );

    render(<AiPanel />);
    fireEvent.click(screen.getByText("Any unusual purchases recently?"));

    await waitFor(() => {
      expect(screen.getByText("You spent 500 UAH on Groceries.")).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText("Ask a question…")).toBeInTheDocument();
  });
});
