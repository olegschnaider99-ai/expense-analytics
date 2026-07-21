// @vitest-environment jsdom
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiPanel } from "./AiPanel";

describe("AiPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the premium activation affordance instead of the input once quota is exceeded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({ error: "quota_exceeded" }),
      }),
    );

    render(<AiPanel />);
    fireEvent.click(screen.getByText("На що я найбільше витратив(-ла) минулого тижня?"));

    await waitFor(() => {
      expect(screen.getByText(/використав\(-ла\) сьогоднішні безкоштовні запитання/i)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /активувати premium/i })).not.toBeDisabled();
    expect(screen.queryByPlaceholderText("Постав запитання…")).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByText("Чи були нещодавно якісь незвичні покупки?"));

    await waitFor(() => {
      expect(screen.getByText("You spent 500 UAH on Groceries.")).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText("Постав запитання…")).toBeInTheDocument();
  });
});
