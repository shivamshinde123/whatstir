import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "@/lib/notes";
import NotesList from "./NotesList";
import NotesView from "./NotesView";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** A stateful stand-in for /api/notes. */
function notesApi(seed: Note[]) {
  let notes = [...seed];
  let next = 100;
  const api = {
    fail: null as null | "GET" | "POST" | "PATCH" | "DELETE",
    gate: false,
    get notes() {
      return notes;
    },
    async handle(url: string, init: RequestInit = {}): Promise<Response> {
      const method = init.method ?? "GET";
      if (api.fail === method) return json({ error: "x" }, 500);
      const body = init.body ? JSON.parse(String(init.body)) : null;
      const id = Number(url.match(/\/api\/notes\/(\d+)/)?.[1]);
      if (method === "GET") {
        const cid = new URL(url, "http://x").searchParams.get("companyId");
        return json({ notes: notes.filter((n) => cid === null || n.companyId === Number(cid)), gate: api.gate });
      }
      if (method === "POST") {
        const company = body.companyId ? { id: body.companyId, name: "Acme Health", sectorId: "healthcare" } : null;
        const n: Note = { id: next++, companyId: body.companyId, company, body: body.body.trim(), createdAt: "2026-11-02T10:00:00Z", updatedAt: "2026-11-02T10:00:00Z" };
        notes = [n, ...notes];
        return json(n, 201);
      }
      if (method === "PATCH") {
        const n = { ...notes.find((x) => x.id === id)!, body: body.body.trim(), updatedAt: "2026-11-03T09:30:00Z" };
        notes = notes.map((x) => (x.id === id ? n : x));
        return json(n);
      }
      notes = notes.filter((x) => x.id !== id);
      return new Response(null, { status: 204 });
    },
  };
  return api;
}

const NOTE = (over: Partial<Note> = {}): Note => ({
  id: 1,
  companyId: 10,
  company: { id: 10, name: "Acme Health", sectorId: "healthcare" },
  body: "Clinics hate phone booking",
  createdAt: "2026-11-01T15:00:00Z",
  updatedAt: "2026-11-01T15:00:00Z",
  ...over,
});

let api: ReturnType<typeof notesApi>;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  api = notesApi([NOTE()]);
  fetchMock = vi.fn((url: string, init?: RequestInit) => api.handle(url, init));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const item = () => screen.getByRole("listitem");

describe("NotesList for one company", () => {
  it("loads that company's notes with their times", async () => {
    render(<NotesList companyId={10} />);
    expect(screen.getByRole("status", { name: "Loading notes" })).toBeInTheDocument();
    expect(await screen.findByText("Clinics hate phone booking")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/notes?companyId=10", expect.objectContaining({ method: "GET" }));
    expect(within(item()).getByText(/^Added/).querySelector("time")).toHaveAttribute("dateTime", "2026-11-01T15:00:00Z");
    expect(within(item()).queryByText(/Edited/)).toBeNull();
    expect(within(item()).queryByRole("link")).toBeNull(); // already inside that company's profile
  });

  it("adds a note to the top and clears the box", async () => {
    render(<NotesList companyId={10} />);
    await screen.findByText("Clinics hate phone booking");
    const add = screen.getByRole("button", { name: "Add note" });
    expect(add).toBeDisabled();
    fireEvent.change(screen.getByLabelText("New note"), { target: { value: "  Ask about pricing  " } });
    fireEvent.click(add);
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Ask about pricing");
    expect(screen.getByLabelText("New note")).toHaveValue("");
    expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body)).toEqual({ body: "  Ask about pricing  ", companyId: 10 });
  });

  it("says so when adding fails, keeping the draft", async () => {
    render(<NotesList companyId={10} />);
    await screen.findByText("Clinics hate phone booking");
    api.fail = "POST";
    fireEvent.change(screen.getByLabelText("New note"), { target: { value: "lost?" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save the note. Try again.");
    expect(screen.getByLabelText("New note")).toHaveValue("lost?");
  });

  it("editing saves in place and shows the edited time", async () => {
    render(<NotesList companyId={10} />);
    await screen.findByText("Clinics hate phone booking");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const box = screen.getByLabelText("Edit note");
    expect(box).toHaveValue("Clinics hate phone booking");
    expect(box).toHaveFocus();
    fireEvent.change(box, { target: { value: "Clinics hate phones" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByLabelText("Edit note")).toBeNull());
    expect(screen.getByText("Clinics hate phones")).toBeInTheDocument();
    expect(within(item()).getByText(/Edited/).querySelectorAll("time")[1]).toHaveAttribute("dateTime", "2026-11-03T09:30:00Z");
    expect(api.notes[0].body).toBe("Clinics hate phones");
  });

  it("cancelling an edit (button or Esc) restores the original text", async () => {
    const onKey = vi.fn();
    window.addEventListener("keydown", onKey);
    render(<NotesList companyId={10} />);
    await screen.findByText("Clinics hate phone booking");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Edit note"), { target: { value: "scribble" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Clinics hate phone booking")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Edit note")).toHaveValue("Clinics hate phone booking"); // the scribble is gone
    fireEvent.change(screen.getByLabelText("Edit note"), { target: { value: "scribble again" } });
    fireEvent.keyDown(screen.getByLabelText("Edit note"), { key: "Escape" });
    expect(screen.getByText("Clinics hate phone booking")).toBeInTheDocument();
    expect(onKey).not.toHaveBeenCalled(); // Esc didn't reach the profile panel's close handler
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
    window.removeEventListener("keydown", onKey);
  });

  it("a failed save keeps the editor open with an error", async () => {
    render(<NotesList companyId={10} />);
    await screen.findByText("Clinics hate phone booking");
    api.fail = "PATCH";
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Edit note"), { target: { value: "new" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save. Try again.");
    expect(screen.getByLabelText("Edit note")).toHaveValue("new");
  });

  it("delete asks for confirmation first", async () => {
    render(<NotesList companyId={10} />);
    await screen.findByText("Clinics hate phone booking");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Delete this note?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Clinics hate phone booking")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" })); // the confirm button
    expect(await screen.findByText("No notes yet.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/notes/1", expect.objectContaining({ method: "DELETE" }));
  });

  it("a failed delete keeps the note with an error", async () => {
    render(<NotesList companyId={10} />);
    await screen.findByText("Clinics hate phone booking");
    api.fail = "DELETE";
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't delete. Try again.");
    expect(screen.getByText("Clinics hate phone booking")).toBeInTheDocument();
  });

  it("shows an empty state, and a load error with Try again", async () => {
    api.fail = "GET";
    render(<NotesList companyId={11} />);
    const retry = await screen.findByRole("button", { name: "Try again" });
    api.fail = null;
    fireEvent.click(retry);
    expect(await screen.findByText("No notes yet.")).toBeInTheDocument();
  });
});

describe("NotesList for all notes (/notes)", () => {
  beforeEach(() => {
    api = notesApi([NOTE(), NOTE({ id: 2, companyId: null, company: null, body: "A general thought" })]);
  });

  it("lists every note, linking each to its company's profile in its sector", async () => {
    render(<NotesView />);
    expect(await screen.findByRole("heading", { level: 1, name: "Notes" })).toBeInTheDocument();
    await screen.findByText("A general thought");
    expect(fetchMock).toHaveBeenCalledWith("/api/notes", expect.anything());
    expect(screen.getByRole("link", { name: "Acme Health" })).toHaveAttribute("href", "/sector/healthcare?company=10");
    expect(screen.getByText("General note")).toBeInTheDocument();
  });

  it("adds a general note with no company", async () => {
    render(<NotesList />);
    await screen.findByText("A general thought");
    fireEvent.change(screen.getByLabelText("New note"), { target: { value: "Another idea" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await screen.findByText("Another idea");
    expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body)).toEqual({ body: "Another idea", companyId: null });
  });

  it("shows Sign out only when the gate is on", async () => {
    api.gate = true;
    render(<NotesView />);
    expect(await screen.findByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Notes" })).toHaveAttribute("href", "/notes");
  });
});
