import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Home from "./page";

describe("Home page", () => {
  it("renders the product name as the only h1", () => {
    render(<Home />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("Whatstir");
  });

  it("states the product purpose", () => {
    render(<Home />);
    expect(screen.getByText(/problems they solve/i)).toBeInTheDocument();
  });

  it("shows the not-affiliated note", () => {
    render(<Home />);
    expect(screen.getByText("Not affiliated with Y Combinator.")).toBeInTheDocument();
  });

  it("has header, main and footer landmarks", () => {
    render(<Home />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });
});
