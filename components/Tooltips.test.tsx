import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Tooltips from "./Tooltips";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const setup = () =>
  render(
    <>
      <button type="button" title="Booking and reminders">
        Scheduling <span>2</span>
      </button>
      <p>elsewhere</p>
      <Tooltips />
    </>,
  );

describe("Tooltips", () => {
  it("replaces the browser's tooltip with the themed one after a short delay", () => {
    setup();
    const button = screen.getByRole("button");
    fireEvent.pointerOver(button);
    expect(button).not.toHaveAttribute("title"); // so the native tooltip never appears
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => vi.advanceTimersByTime(400));
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Booking and reminders");
    expect(tip).toHaveClass("app-tooltip");
    expect(button).toHaveAttribute("aria-describedby", "app-tooltip");
  });

  it("stays while the pointer moves within the element, and restores the title on leaving", () => {
    setup();
    const button = screen.getByRole("button");
    fireEvent.pointerOver(button);
    act(() => vi.advanceTimersByTime(400));
    fireEvent.pointerOut(button, { relatedTarget: screen.getByText("2") });
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.pointerOut(button, { relatedTarget: screen.getByText("elsewhere") });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(button).toHaveAttribute("title", "Booking and reminders");
    expect(button).not.toHaveAttribute("aria-describedby");
  });

  it("hides on Escape, on a press and on scroll", () => {
    setup();
    const button = screen.getByRole("button");
    for (const dismiss of [
      () => fireEvent.keyDown(document, { key: "Escape" }),
      () => fireEvent.pointerDown(button),
      () => fireEvent.scroll(window),
    ]) {
      fireEvent.pointerOver(button);
      act(() => vi.advanceTimersByTime(400));
      expect(screen.getByRole("tooltip")).toBeInTheDocument();
      act(dismiss);
      expect(screen.queryByRole("tooltip")).toBeNull();
      expect(button).toHaveAttribute("title", "Booking and reminders");
      fireEvent.pointerOut(button, { relatedTarget: screen.getByText("elsewhere") });
    }
  });

  it("ignores touch, and elements without a title", () => {
    setup();
    fireEvent.pointerOver(screen.getByRole("button"), { pointerType: "touch" });
    fireEvent.pointerOver(screen.getByText("elsewhere"));
    act(() => vi.advanceTimersByTime(400));
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(screen.getByRole("button")).toHaveAttribute("title", "Booking and reminders");
  });
});
