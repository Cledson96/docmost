import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import App from "./App";

vi.mock("@/hooks/use-track-origin", () => ({ useTrackOrigin: vi.fn() }));
vi.mock("@/ee/hooks/use-redirect-to-cloud-select.tsx", () => ({
  useRedirectToCloudSelect: vi.fn(),
}));
vi.mock("@/features/auth/hooks/use-auth", () => ({
  default: () => ({ isLoading: false, signIn: vi.fn() }),
}));
vi.mock("@/features/auth/hooks/use-redirect-if-authenticated.ts", () => ({
  useRedirectIfAuthenticated: vi.fn(),
}));
vi.mock("@/features/workspace/queries/workspace-query.ts", () => ({
  useWorkspacePublicDataQuery: () => ({
    data: { authProviders: [], enforceSso: false },
    isError: false,
    isLoading: false,
  }),
}));
vi.mock("@/ee/components/sso-login.tsx", () => ({ default: () => null }));
vi.mock("@/main.tsx", async () => {
  const { QueryClient } = await import("@tanstack/react-query");

  return { queryClient: new QueryClient() };
});
vi.mock("@/main", async () => {
  const { QueryClient } = await import("@tanstack/react-query");

  return { queryClient: new QueryClient() };
});
vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>();

  return {
    ...actual,
    useTranslation: () => ({ t: (key: string) => key }),
  };
});

it("renders a lazy route page through the shared suspense boundary", async () => {
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <MantineProvider>
        <HelmetProvider>
          <App />
        </HelmetProvider>
      </MantineProvider>
    </MemoryRouter>,
  );

  expect(
    (await screen.findByRole("heading", { name: /login/i })).textContent,
  ).toMatch(/login/i);
});
