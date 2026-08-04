declare module "@tiptap/html/server" {
  import type { Extensions, JSONContent } from "@tiptap/core";

  export function generateHTML(doc: JSONContent, extensions: Extensions): string;
  export function generateJSON(html: string, extensions: Extensions): JSONContent;
}
