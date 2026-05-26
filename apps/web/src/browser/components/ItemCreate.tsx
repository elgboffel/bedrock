import type { Item } from "@repo/contracts/items";
import { Button } from "@repo/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { QueryProvider } from "./QueryProvider";

/** Error response shape from the API (mirrors `@repo/server/error-mapper`). */
interface ApiErrorBody {
  error: string;
  message: string;
  details?: { fields?: Record<string, ReadonlyArray<string>> } & Record<
    string,
    unknown
  >;
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody,
  ) {
    super(body.message);
  }
}

/**
 * Renders a mutation error according to the bedrock error-wire format:
 * 400 with `details.fields.<name>` -> field-level message, 409 -> friendly
 * conflict message, anything else -> generic fallback.
 */
const CreateError = ({ error }: { error: unknown }) => {
  if (!error) return null;
  if (error instanceof ApiError) {
    const fieldErrors = error.body.details?.fields?.name;
    if (fieldErrors && fieldErrors.length > 0) {
      return (
        <p style={{ color: "red", margin: "4px 0" }}>
          {fieldErrors.join(", ")}
        </p>
      );
    }
    if (error.status === 409) {
      return (
        <p style={{ color: "red", margin: "4px 0" }}>{error.body.message}</p>
      );
    }
  }
  return <pre style={{ color: "red" }}>{String(error)}</pre>;
};

const ItemCreateInner = () => {
  const [name, setName] = useState("");
  const queryClient = useQueryClient();

  const itemsQuery = useQuery<Item[]>({
    queryKey: ["items"],
    queryFn: async () => {
      const res = await fetch("/api/items");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (itemName: string) => {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: itemName }),
      });
      if (!res.ok) {
        const body = (await res
          .json()
          .catch(() => null)) as ApiErrorBody | null;
        if (body && typeof body.message === "string") {
          throw new ApiError(res.status, body);
        }
        throw new Error(`HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      setName("");
      queryClient.invalidateQueries({ queryKey: ["items"] });
    },
  });

  return (
    <div>
      <h3>Items</h3>
      <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Item name"
          style={{ padding: "4px 8px" }}
        />
        <Button
          onClick={() =>
            name && !createMutation.isPending && createMutation.mutate(name)
          }
        >
          {createMutation.isPending ? "Creating..." : "Create Item"}
        </Button>
      </div>
      <CreateError error={createMutation.error} />
      {itemsQuery.data && (
        <ul>
          {itemsQuery.data.map((item) => (
            <li key={item.id}>
              {item.id}: {item.name}
            </li>
          ))}
        </ul>
      )}
      {itemsQuery.data?.length === 0 && <p>No items yet.</p>}
    </div>
  );
};

export const ItemCreate = () => (
  <QueryProvider>
    <ItemCreateInner />
  </QueryProvider>
);
