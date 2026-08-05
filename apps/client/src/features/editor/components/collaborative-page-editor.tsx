import { type ComponentType, useEffect, useState } from "react";
import ReadonlyPageEditor from "@/features/editor/readonly-page-editor";
import { loadPageEditor, type PageEditorProps } from "./page-editor-loader";

interface CollaborativePageEditorProps extends PageEditorProps {
  title: string;
}

export function CollaborativePageEditor({
  pageId,
  title,
  content,
  editable,
  canComment,
}: CollaborativePageEditorProps) {
  const [PageEditor, setPageEditor] =
    useState<ComponentType<PageEditorProps> | null>(null);
  const [loadError, setLoadError] = useState<unknown>();

  useEffect(() => {
    let isActive = true;

    loadPageEditor()
      .then((module) => {
        if (isActive) {
          setPageEditor(() => module.default);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setLoadError(error);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  if (loadError) {
    throw loadError;
  }

  if (!PageEditor) {
    return (
      <ReadonlyPageEditor
        title={title}
        content={content}
        pageId={pageId}
        showTitle={false}
      />
    );
  }

  return (
    <PageEditor
      pageId={pageId}
      editable={editable}
      content={content}
      canComment={canComment}
    />
  );
}
