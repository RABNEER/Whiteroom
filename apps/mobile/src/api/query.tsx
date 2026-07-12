import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 2, // 2 minutes stale time — instant UI load without spinners
      gcTime: 1000 * 60 * 30, // 30 minutes cache retention in memory
      refetchOnWindowFocus: true, // Silently refresh in background
      refetchOnReconnect: true,
    },
  },
});

export function ApiProvider({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
