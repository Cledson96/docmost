import type { ComponentType } from "react";

export interface PageEditorProps {
  pageId: string;
  editable: boolean;
  content: unknown;
  canComment?: boolean;
}

type PageEditorModule = {
  default: ComponentType<PageEditorProps>;
};

let pageEditorModulePromise: Promise<PageEditorModule> | undefined;

export function loadPageEditor(): Promise<PageEditorModule> {
  pageEditorModulePromise ??= import("@/features/editor/page-editor").catch(
    (error) => {
      pageEditorModulePromise = undefined;
      throw error;
    },
  );

  return pageEditorModulePromise;
}
