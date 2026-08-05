import { act, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { vi } from "vitest";
import { CollaborativePageEditor } from "./collaborative-page-editor";

const { loadPageEditorMock, resolvePageEditor } = vi.hoisted(() => {
  let resolve: (module: { default: ComponentType }) => void;
  const pendingModule = new Promise<{ default: ComponentType }>((complete) => {
    resolve = complete;
  });

  return {
    loadPageEditorMock: vi.fn(() => pendingModule),
    resolvePageEditor: (module: { default: ComponentType }) => resolve(module),
  };
});

vi.mock("./page-editor-loader", () => ({
  loadPageEditor: loadPageEditorMock,
}));

vi.mock("@/features/editor/readonly-page-editor", () => ({
  default: ({ title, content }: { title: string; content: string }) => (
    <div data-testid="readonly-page-editor">
      {title}: {content}
    </div>
  ),
}));

it("keeps the saved document visible until the collaborative editor loads", async () => {
  render(
    <CollaborativePageEditor
      pageId="page-id"
      title="Saved document"
      content="Saved content"
      editable
    />,
  );

  expect(screen.getByTestId("readonly-page-editor").textContent).toBe(
    "Saved document: Saved content",
  );

  const MockPageEditor = () => (
    <div data-testid="collaborative-page-editor">Collaborative editor</div>
  );

  await act(async () => {
    resolvePageEditor({ default: MockPageEditor });
  });

  expect(await screen.findByTestId("collaborative-page-editor")).toBeTruthy();
});
