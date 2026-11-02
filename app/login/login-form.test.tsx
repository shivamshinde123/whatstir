import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LoginForm from "./login-form";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

function setup() {
  const navigate = vi.fn();
  render(<LoginForm navigate={navigate} />);
  const input = screen.getByLabelText("Password") as HTMLInputElement;
  const button = screen.getByRole("button", { name: "Continue" });
  return { navigate, input, button };
}

describe("LoginForm", () => {
  it("has a labelled, focused password field and disables Continue until something is typed", () => {
    const { input, button } = setup();
    expect(input.type).toBe("password");
    expect(input).toHaveFocus();
    expect(button).toBeDisabled();
    fireEvent.change(input, { target: { value: "x" } });
    expect(button).toBeEnabled();
  });

  it("posts the password and goes to the remembered page on success", async () => {
    window.history.replaceState(null, "", "/login?next=%2Fsector%2Fb2b");
    const fetchMock = respond(200, { ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const { navigate, input, button } = setup();
    fireEvent.change(input, { target: { value: "s3cret" } });
    fireEvent.click(button);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/sector/b2b"));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/login");
    expect(JSON.parse(init.body as string)).toEqual({ password: "s3cret" });
  });

  it("ignores an off-site next and goes home instead", async () => {
    window.history.replaceState(null, "", "/login?next=https%3A%2F%2Fevil.example");
    vi.stubGlobal("fetch", respond(200, { ok: true }));
    const { navigate, input, button } = setup();
    fireEvent.change(input, { target: { value: "s3cret" } });
    fireEvent.click(button);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/"));
  });

  it("shows the server's error, clears the field and stays put on a wrong password", async () => {
    vi.stubGlobal("fetch", respond(401, { error: "That password isn't right." }));
    const { navigate, input, button } = setup();
    fireEvent.change(input, { target: { value: "guess" } });
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent("That password isn't right.");
    expect(input.value).toBe("");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("explains a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const { input, button } = setup();
    fireEvent.change(input, { target: { value: "s3cret" } });
    fireEvent.click(button);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Couldn't reach the server/);
  });

  it("shows a busy state while checking", async () => {
    let resolve!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (resolve = r))));
    const { input, button } = setup();
    fireEvent.change(input, { target: { value: "s3cret" } });
    fireEvent.click(button);
    expect(await screen.findByRole("button", { name: "Checking…" })).toBeDisabled();
    resolve(new Response("{}", { status: 401 }));
  });
});
