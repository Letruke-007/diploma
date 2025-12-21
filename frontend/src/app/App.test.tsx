// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import "@testing-library/jest-dom/vitest";

function Dummy() {
  return <div>Jest is working</div>;
}

describe("Smoke test: test environment", () => {
  it("renders dummy component", () => {
    render(<Dummy />);
    expect(screen.getByText("Jest is working")).toBeInTheDocument();
  });
});
