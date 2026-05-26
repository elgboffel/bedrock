import { Button } from "@repo/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { QueryProvider } from "./QueryProvider";

const ApiCheckInner = () => {
  const [enabled, setEnabled] = useState(false);

  const { data, error } = useQuery({
    queryKey: ["api-check"],
    queryFn: async () => {
      const res = await fetch("/api/db/items/1");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled,
  });

  return (
    <div>
      <Button onClick={() => setEnabled(true)}>Check API</Button>
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
      {error && <pre style={{ color: "red" }}>{String(error)}</pre>}
    </div>
  );
};

export const ApiCheck = () => {
  return (
    <QueryProvider>
      <ApiCheckInner />
    </QueryProvider>
  );
};
