import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import SectorSelectionActions from "./SectorSelectionActions";

it("shows only guidance and cancel until two sectors are selected", () => {
  const cancel = vi.fn();
  render(<SectorSelectionActions selected={["b2b"]} batch={null} onCancel={cancel} />);
  expect(screen.getByRole("status")).toHaveTextContent("1 sector selected. Select at least two sectors.");
  expect(screen.queryByRole("link")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(cancel).toHaveBeenCalledOnce();
});

it("keeps research primary, preserves scope and dismisses secondary analyses", () => {
  render(<SectorSelectionActions selected={["b2b", "fintech"]} batch="Winter 2012" onCancel={() => {}} />);
  expect(screen.getByRole("link", { name: "Research companies" })).toHaveAttribute("href", "/sector/b2b+fintech?batch=Winter+2012");
  expect(screen.queryByRole("link", { name: /^Compare sectors/ })).toBeNull();
  const summary = screen.getByText("More analyses", { selector: "summary" });
  fireEvent.click(summary);
  expect(screen.getByRole("link", { name: /^Compare sectors/ })).toHaveAttribute("href", "/compare?sectors=b2b%2Cfintech");
  expect(screen.getByRole("link", { name: /^View theme trends/ })).toHaveAttribute("href", "/themes/trends?sectors=b2b%2Cfintech&batch=Winter+2012");
  fireEvent.keyDown(summary, { key: "Escape" });
  expect(summary).toHaveFocus();
  expect(screen.queryByRole("link", { name: /^Compare sectors/ })).toBeNull();
  fireEvent.click(summary);
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("link", { name: /^View theme trends/ })).toBeNull();
  fireEvent.click(summary);
  fireEvent.focusIn(document.body);
  expect(screen.queryByRole("navigation", { name: "More analyses" })).toBeNull();
});

it("explains the comparison limit while retaining research and trends", () => {
  render(<SectorSelectionActions selected={["b2b", "consumer", "fintech", "healthcare", "industrials"]} batch={null} onCancel={() => {}} />);
  fireEvent.click(screen.getByText("More analyses", { selector: "summary" }));
  expect(screen.queryByRole("link", { name: /^Compare sectors/ })).toBeNull();
  expect(screen.getByText("Select up to four sectors to compare statistics.")).toBeVisible();
  expect(screen.getByRole("link", { name: /^View theme trends/ })).toBeVisible();
  expect(screen.getByRole("link", { name: "Research companies" })).toBeVisible();
});
