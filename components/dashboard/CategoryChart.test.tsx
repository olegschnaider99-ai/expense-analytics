// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CategoryChart } from "./CategoryChart";

describe("CategoryChart", () => {
  it("shows a sparse-history message when there's no data yet and history is still filling in", () => {
    render(<CategoryChart aggregates={[]} hasFullHistoryWindow={false} />);
    expect(screen.getByText(/ще збираємо історію/i)).toBeInTheDocument();
  });

  it("shows a plain empty message once history is complete but there's genuinely no spending", () => {
    render(<CategoryChart aggregates={[]} hasFullHistoryWindow={true} />);
    expect(screen.getByText(/витрат за цей період поки немає/i)).toBeInTheDocument();
  });

  it("labels a category with no prior-period baseline as new rather than a percentage", () => {
    render(
      <CategoryChart
        aggregates={[
          {
            category: "Fuel",
            total: 500,
            transaction_count: 2,
            prior_period_total: null,
            pct_change: null,
            is_anomaly: false,
          },
        ]}
        hasFullHistoryWindow={true}
      />,
    );
    expect(screen.getByText(/нова категорія/i)).toBeInTheDocument();
  });

  it("marks a category containing an anomalous transaction as unusual", () => {
    render(
      <CategoryChart
        aggregates={[
          {
            category: "Groceries",
            total: 500,
            transaction_count: 2,
            prior_period_total: 300,
            pct_change: 66.7,
            is_anomaly: true,
          },
        ]}
        hasFullHistoryWindow={true}
      />,
    );
    expect(screen.getByText("незвично")).toBeInTheDocument();
  });
});
