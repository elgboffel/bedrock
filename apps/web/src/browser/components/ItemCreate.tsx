import { Button } from "@repo/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { QueryProvider } from "./QueryProvider";

interface Item {
  id: number;
  name: string;
}

const ItemCreateInner = () => {
  const [name, setName] = useState("");
  const queryClient = useQueryClient();

  const itemsQuery = useQuery<Item[]>({
    queryKey: ["items"],
    queryFn: async () => {
      const res = await fetch("/api/db/items");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (itemName: string) => {
      const res = await fetch("/api/db/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: itemName }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || `HTTP ${res.status}`);
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
      {createMutation.error && (
        <pre style={{ color: "red" }}>{String(createMutation.error)}</pre>
      )}
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
