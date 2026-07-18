// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConnectionBanner } from "./ConnectionBanner";
import type { DashboardConnection } from "@/lib/dashboard/data";

function connection(overrides: Partial<DashboardConnection>): DashboardConnection {
  return {
    id: "conn-1",
    connection_state: "Connected",
    created_at: new Date().toISOString(),
    history_gap_start: null,
    history_gap_end: null,
    other_jars: [],
    ...overrides,
  };
}

describe("ConnectionBanner", () => {
  it("renders nothing for a healthy Connected state with no history gap", () => {
    const { container } = render(
      <ConnectionBanner connection={connection({ connection_state: "Connected" })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a history-gap notice even when Connected, if one was recorded", () => {
    render(
      <ConnectionBanner
        connection={connection({
          connection_state: "Connected",
          history_gap_start: "2026-01-01T00:00:00Z",
          history_gap_end: "2026-03-01T00:00:00Z",
        })}
      />,
    );
    expect(screen.getByText(/gap in your history/i)).toBeInTheDocument();
  });

  it("shows a non-actionable notice for Degraded", () => {
    render(<ConnectionBanner connection={connection({ connection_state: "Degraded" })} />);
    expect(screen.getByText(/having trouble syncing/i)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows a progress notice for Backfilling", () => {
    render(<ConnectionBanner connection={connection({ connection_state: "Backfilling" })} />);
    expect(screen.getByText(/re-syncing/i)).toBeInTheDocument();
  });

  it("shows an actionable reconnect link for NeedsReconnect", () => {
    render(
      <ConnectionBanner connection={connection({ connection_state: "NeedsReconnect" })} />,
    );
    expect(screen.getByRole("link", { name: /reconnect/i })).toHaveAttribute(
      "href",
      "/dashboard/reconnect",
    );
  });
});
