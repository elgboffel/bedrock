import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ItemCreate } from "./ItemCreate";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

describe("ItemCreate", () => {
  it("renders items returned by GET /api/items", async () => {
    server.use(
      http.get("/api/items", () =>
        HttpResponse.json([
          { id: 1, name: "apple" },
          { id: 2, name: "banana" },
        ]),
      ),
    );

    render(<ItemCreate />);

    await screen.findByText(/1: apple/);
    await screen.findByText(/2: banana/);
  });

  it("surfaces field-level message from 400 ValidationError on empty name", async () => {
    server.use(
      http.get("/api/items", () => HttpResponse.json([])),
      http.post("/api/items", () =>
        HttpResponse.json(
          {
            error: "ValidationError",
            message: "Invalid request body",
            details: { fields: { name: ["Expected NonEmptyString"] } },
          },
          { status: 400 },
        ),
      ),
    );

    render(<ItemCreate />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("Item name"), "x");
    await user.click(screen.getByRole("button", { name: /create item/i }));

    await screen.findByText(/Expected NonEmptyString/);
  });

  it("surfaces conflict message from 409 ConflictError on duplicate name", async () => {
    server.use(
      http.get("/api/items", () => HttpResponse.json([])),
      http.post("/api/items", () =>
        HttpResponse.json(
          {
            error: "ConflictError",
            message: "Item already exists",
            details: { detail: "constraint:items_name_unique" },
          },
          { status: 409 },
        ),
      ),
    );

    render(<ItemCreate />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("Item name"), "apple");
    await user.click(screen.getByRole("button", { name: /create item/i }));

    // Conflict surfaces as the API's message, not the raw `Error: …` string.
    const msg = await screen.findByText("Item already exists");
    expect(msg.tagName.toLowerCase()).not.toBe("pre");
  });

  it("clears the input and re-renders the list after a successful create", async () => {
    let items: ReadonlyArray<{ id: number; name: string }> = [];
    server.use(
      http.get("/api/items", () => HttpResponse.json(items)),
      http.post<never, { name: string }>("/api/items", async ({ request }) => {
        const { name } = await request.json();
        const created = { id: items.length + 1, name };
        items = [...items, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );

    render(<ItemCreate />);
    const user = userEvent.setup();

    const input = screen.getByPlaceholderText("Item name") as HTMLInputElement;
    await user.type(input, "cherry");
    await user.click(screen.getByRole("button", { name: /create item/i }));

    await screen.findByText(/1: cherry/);
    expect(input.value).toBe("");
  });
});
