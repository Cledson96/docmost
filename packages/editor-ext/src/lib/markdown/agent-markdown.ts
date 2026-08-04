import type { Extensions, JSONContent } from "@tiptap/core";
import { getSchema } from "@tiptap/core";
import { generateHTML, generateJSON } from "@tiptap/html/server";
import { Node } from "@tiptap/pm/model";
import { dump, JSON_SCHEMA, load } from "js-yaml";
import { markdownToHtml } from "./utils/marked.utils";
import { htmlToMarkdown } from "./utils/turndown.utils";
import {
  agentMarkdownInlineMarkTypes,
  agentMarkdownInlineNodeTypes,
  agentMarkdownStandardNodeTypes,
} from "./agent-markdown-syntax";

export type AgentMarkdownErrorCode =
  | "UNKNOWN_TYPE"
  | "INVALID_YAML"
  | "INVALID_BASE64URL"
  | "INVALID_DIRECTIVE"
  | "INLINE_TYPE_INCOMPATIBLE"
  | "DUPLICATE_ID"
  | "INVALID_CONTENT";

export class AgentMarkdownError extends Error {
  constructor(public readonly code: AgentMarkdownErrorCode, message: string) {
    super(message);
    this.name = "AgentMarkdownError";
  }
}

type DirectiveData = { id: string | null; attrs: Record<string, unknown> };
type Replacement = { token: string; content: JSONContent };

export function prosemirrorToAgentMarkdown(doc: JSONContent, extensions: Extensions): string {
  validateDocument(doc, extensions);
  const prefix = `DOCMOSTAGENT${randomToken()}X`;
  const replacements: Replacement[] = [];
  let index = 0;
  const token = () => `${prefix}${index++}END`;

  const transform = (node: JSONContent): JSONContent => {
    if (node.type === "doc") return { ...node, content: node.content?.map(transform) };
    if (isRichBlock(node)) {
      const value = token();
      replacements.push({ token: value, content: node });
      return { type: "paragraph", content: [{ type: "text", text: value }] };
    }
    if (agentMarkdownInlineNodeTypes.has(node.type ?? "")) {
      const value = token();
      replacements.push({ token: value, content: node });
      return { type: "text", text: value };
    }
    if (node.type === "text" && node.marks?.some((mark) => agentMarkdownInlineMarkTypes.has(mark.type))) {
      const richMark = node.marks.find((mark) => agentMarkdownInlineMarkTypes.has(mark.type))!;
      const value = token();
      replacements.push({ token: value, content: node });
      return { type: "text", text: value };
    }
    return { ...node, content: node.content?.map(transform) };
  };

  const markdown = htmlToMarkdown(generateHTML(transform(doc), extensions));
  return replacements.reduce((result, replacement) =>
    result.replace(replacement.token, serializeReplacement(replacement.content, extensions)), markdown);
}

export async function agentMarkdownToProsemirror(markdown: string, extensions: Extensions): Promise<JSONContent> {
  if (typeof markdown !== "string") throw error("INVALID_CONTENT", "Agent Markdown must be a string.");
  const prefix = `DOCMOSTAGENT${randomToken()}X`;
  const replacements: Replacement[] = [];
  let index = 0;
  const token = () => `${prefix}${index++}END`;
  const register = (content: JSONContent) => {
    const value = token();
    replacements.push({ token: value, content });
    return value;
  };

  const withBlocks = await replaceBlocks(markdown, extensions, register);
  const withInline = replaceInline(withBlocks, extensions, register);
  const html = await markdownToHtml(withInline);
  let doc: JSONContent;
  try {
    doc = generateJSON(html as string, extensions);
  } catch (cause) {
    throw error("INVALID_CONTENT", "Markdown cannot be converted to the configured TipTap schema.", cause);
  }
  const restored = restoreTokens(doc, replacements);
  validateDocument(restored, extensions);
  assertUniqueIds(restored);
  return restored;
}

function isRichBlock(node: JSONContent) {
  if (!node.type || node.type === "doc" || node.type === "text") return false;
  if (!agentMarkdownStandardNodeTypes.has(node.type)) return true;
  if (node.type === "paragraph") return node.attrs?.id != null || node.attrs?.textAlign != null || (node.attrs?.indent ?? 0) !== 0;
  if (node.type === "heading") return node.attrs?.id != null || node.attrs?.textAlign != null || (node.attrs?.indent ?? 0) !== 0;
  return false;
}

function serializeReplacement(node: JSONContent, extensions: Extensions): string {
  if (agentMarkdownInlineNodeTypes.has(node.type ?? "")) return inlineDirective(node);
  if (node.type === "text" && node.marks?.some((mark) => agentMarkdownInlineMarkTypes.has(mark.type))) {
    const mark = node.marks.find((candidate) => agentMarkdownInlineMarkTypes.has(candidate.type))!;
    const payload = encode({ id: null, attrs: mark.attrs ?? {} });
    return `{{docmost:${mark.type} ${payload}}}${node.text ?? ""}{{/docmost:${mark.type}}}`;
  }
  const body = node.content?.length
    ? prosemirrorToAgentMarkdown({
      type: "doc",
      content: node.type === "paragraph" || node.type === "heading"
        ? [{ type: "paragraph", content: node.content }]
        : node.content,
    }, extensions)
    : "";
  const metadata = dump({ id: node.attrs?.id ?? null, attrs: node.attrs ?? {} }, { noRefs: true, lineWidth: -1 }).trimEnd();
  return `:::docmost-${node.type}\n${metadata}${body ? `\n---\n${body}` : ""}\n:::`;
}

function inlineDirective(node: JSONContent) {
  return `{{docmost:${node.type} ${encode({ id: node.attrs?.id ?? null, attrs: node.attrs ?? {} })}}}`;
}

async function replaceBlocks(markdown: string, extensions: Extensions, register: (content: JSONContent) => string) {
  const lines = markdown.split(/\r?\n/);
  const output: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const start = /^:::docmost-([A-Za-z][\w-]*)\s*$/.exec(lines[i]);
    if (!start) { output.push(lines[i]); continue; }
    const type = start[1];
    let depth = 1;
    let end = -1;
    for (let position = i + 1; position < lines.length; position++) {
      if (/^:::docmost-[A-Za-z][\w-]*\s*$/.test(lines[position])) depth++;
      if (lines[position] === ":::" && --depth === 0) { end = position; break; }
    }
    if (end < 0) throw error("INVALID_DIRECTIVE", `Unclosed block directive for ${type}.`);
    const divider = lines.findIndex((line, position) => position > i && position < end && line === "---");
    const metadata = lines.slice(i + 1, divider < 0 ? end : divider).join("\n");
    const body = divider < 0 ? "" : lines.slice(divider + 1, end).join("\n");
    output.push(register(await blockFromDirective(type, metadata, body, extensions)));
    i = end;
  }
  return output.join("\n");
}

async function blockFromDirective(type: string, metadata: string, body: string, extensions: Extensions): Promise<JSONContent> {
  assertBlockType(type, extensions);
  const data = parseYaml(metadata);
  const attrs = { ...data.attrs, ...(data.id === null ? {} : { id: data.id }) };
  if (!body) return { type, attrs };
  const parsed = await agentMarkdownToProsemirror(body, extensions);
  const content = type === "paragraph" || type === "heading"
    ? parsed.content?.flatMap((child, index) => [
      ...(index ? [{ type: "text", text: " " }] : []),
      ...(child.content ?? []),
    ])
    : parsed.content;
  return { type, attrs, content };
}

function replaceInline(markdown: string, extensions: Extensions, register: (content: JSONContent) => string) {
  const paired = /\{\{docmost:([A-Za-z][\w-]*) ([A-Za-z0-9_-]+)\}\}([\s\S]*?)\{\{\/docmost:\1\}\}/g;
  const atomic = /\{\{docmost:([A-Za-z][\w-]*) ([^}\s]+)\}\}/g;
  const replacedPairs = markdown.replace(paired, (_all, type, payload, text) => {
    assertInlineType(type, extensions, true);
    const data = decode(payload);
    return register({ type: "text", text, marks: [{ type, attrs: data.attrs }] });
  });
  return replacedPairs.replace(atomic, (_all, type, payload) => {
    assertInlineType(type, extensions, false);
    const data = decode(payload);
    return register({ type, attrs: data.attrs });
  });
}

function restoreTokens(node: JSONContent, replacements: Replacement[]): JSONContent {
  const blockToken = node.content?.length === 1 && node.content[0].type === "text"
    ? replacements.find((candidate) => candidate.token === node.content?.[0].text && !agentMarkdownInlineNodeTypes.has(candidate.content.type ?? "") && candidate.content.type !== "text")
    : undefined;
  if (blockToken) return restoreTokens(blockToken.content, replacements);
  if (node.type === "text") {
    const replacement = replacements.find((candidate) => candidate.token === node.text);
    return replacement ? replacement.content : node;
  }
  const content = node.content?.flatMap((child) => {
    if (child.type !== "text" || !child.text) return [restoreTokens(child, replacements)];
    const tokens = replacements.map((replacement) => replacement.token).filter((token) => child.text!.includes(token));
    if (!tokens.length) return [child];
    const parts = child.text.split(new RegExp(`(${tokens.join("|")})`));
    return parts.filter(Boolean).map((part) => {
      const replacement = replacements.find((candidate) => candidate.token === part);
      return replacement ?? { content: { ...child, text: part } };
    }).map((value) => "content" in value ? value.content : value);
  });
  return { ...node, content: mergeAdjacentTextNodes(content) };
}

function mergeAdjacentTextNodes(content: JSONContent[] | undefined) {
  if (!content) return content;
  return content.reduce<JSONContent[]>((merged, node) => {
    const previous = merged.at(-1);
    if (
      previous?.type === "text" &&
      node.type === "text" &&
      JSON.stringify(previous.marks ?? []) === JSON.stringify(node.marks ?? [])
    ) {
      previous.text = `${previous.text ?? ""}${node.text ?? ""}`;
    } else {
      merged.push(node);
    }
    return merged;
  }, []);
}

function parseYaml(value: string): DirectiveData {
  try {
    const parsed = load(value, { schema: JSON_SCHEMA }) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("metadata must be a mapping");
    const { id, attrs } = parsed as Record<string, unknown>;
    if (!(id === null || typeof id === "string") || !attrs || typeof attrs !== "object" || Array.isArray(attrs)) throw new Error("metadata must contain id and attrs");
    return { id: id as string | null, attrs: attrs as Record<string, unknown> };
  } catch (cause) { throw error("INVALID_YAML", "Invalid Docmost directive YAML.", cause); }
}

function encode(value: DirectiveData) { return Buffer.from(JSON.stringify(value)).toString("base64url"); }
function decode(value: string): DirectiveData {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw error("INVALID_BASE64URL", "Invalid base64url directive payload.");
  try {
    const roundTrip = Buffer.from(value, "base64url").toString("base64url");
    if (roundTrip !== value.replace(/=+$/, "")) throw new Error("not canonical");
    const data = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!data || typeof data !== "object" || Array.isArray(data) || !(data.id === null || typeof data.id === "string") || !data.attrs || typeof data.attrs !== "object" || Array.isArray(data.attrs)) throw new Error("invalid payload");
    return data;
  } catch (cause) { throw error("INVALID_BASE64URL", "Invalid base64url directive payload.", cause); }
}

function assertBlockType(type: string, extensions: Extensions) {
  if (!getSchema(extensions).nodes[type]) throw error("UNKNOWN_TYPE", `Unknown Docmost node type: ${type}.`);
  if (agentMarkdownInlineNodeTypes.has(type) || agentMarkdownInlineMarkTypes.has(type)) throw error("INLINE_TYPE_INCOMPATIBLE", `${type} must use an inline directive.`);
}
function assertInlineType(type: string, extensions: Extensions, paired: boolean) {
  const schema = getSchema(extensions);
  if (!schema.nodes[type] && !schema.marks[type]) throw error("UNKNOWN_TYPE", `Unknown Docmost inline type: ${type}.`);
  if (paired ? !agentMarkdownInlineMarkTypes.has(type) : !agentMarkdownInlineNodeTypes.has(type)) throw error("INLINE_TYPE_INCOMPATIBLE", `Invalid inline directive type: ${type}.`);
}
function validateDocument(doc: JSONContent, extensions: Extensions) {
  try { Node.fromJSON(getSchema(extensions), doc); } catch (cause) { throw error("INVALID_CONTENT", "Content does not satisfy the configured TipTap schema.", cause); }
}
function assertUniqueIds(doc: JSONContent) {
  const ids = new Set<string>();
  const visit = (node: JSONContent) => {
    const id = node.attrs?.id;
    if (typeof id === "string" && id) {
      if (ids.has(id)) throw error("DUPLICATE_ID", `Duplicate persistent id: ${id}.`);
      ids.add(id);
    }
    node.content?.forEach(visit);
  };
  visit(doc);
}
function randomToken() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function error(code: AgentMarkdownErrorCode, message: string, cause?: unknown) {
  const result = new AgentMarkdownError(code, message);
  if (cause) result.cause = cause;
  return result;
}
