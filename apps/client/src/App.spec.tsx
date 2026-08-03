import { MantineProvider } from "@mantine/core";
import "@testing-library/jest-dom/vitest";
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
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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

  expect(await screen.findByRole("heading", { name: /login/i })).toBeVisible();
});
