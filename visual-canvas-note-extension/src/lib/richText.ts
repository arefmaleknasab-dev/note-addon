const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "del",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "link", "meta", "svg", "canvas", "video", "audio", "img"]);

const ALLOWED_STYLE_PROPS = new Set([
  "background-color",
  "border-color",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "color",
  "direction",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "line-height",
  "list-style-position",
  "list-style-type",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "text-align",
  "text-decoration",
  "text-decoration-color",
  "text-decoration-line",
  "text-decoration-style",
  "text-indent",
  "text-transform",
  "white-space",
  "word-break",
]);

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeStyle(style: string) {
  if (!style || typeof document === "undefined") return "";
  const probe = document.createElement("span");
  probe.setAttribute("style", style);
  const safe: string[] = [];
  for (const prop of ALLOWED_STYLE_PROPS) {
    const value = probe.style.getPropertyValue(prop);
    if (!value) continue;
    const lower = value.toLowerCase();
    if (lower.includes("url(") || lower.includes("expression(") || lower.includes("behavior:")) continue;
    safe.push(`${prop}: ${value}`);
  }
  return safe.join("; ");
}

function isSafeHref(href: string) {
  const trimmed = href.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  return lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("mailto:") || lower.startsWith("tel:") || lower.startsWith("#");
}

function cleanNode(node: Node) {
  if (node.nodeType === Node.COMMENT_NODE) {
    node.parentNode?.removeChild(node);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (DROP_WITH_CONTENT.has(tag)) {
    el.remove();
    return;
  }

  if (!ALLOWED_TAGS.has(tag)) {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    return;
  }

  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    const value = attr.value;
    if (name === "style") {
      const safe = sanitizeStyle(value);
      if (safe) el.setAttribute("style", safe);
      else el.removeAttribute("style");
    } else if (tag === "a" && name === "href" && isSafeHref(value)) {
      el.setAttribute("href", value);
      el.setAttribute("rel", "noopener noreferrer");
      el.setAttribute("target", "_blank");
    } else if ((tag === "ol" && (name === "start" || name === "type")) || (tag === "ul" && name === "type")) {
      el.setAttribute(name, value.replace(/[^0-9aAiIdisc square circle]/g, ""));
    } else if ((tag === "td" || tag === "th") && (name === "colspan" || name === "rowspan")) {
      el.setAttribute(name, value.replace(/[^0-9]/g, ""));
    } else {
      el.removeAttribute(attr.name);
    }
  }

  for (const child of Array.from(el.childNodes)) cleanNode(child);
}

export function sanitizeHtml(html: string | undefined | null): string | undefined {
  if (!html?.trim() || typeof document === "undefined") return undefined;
  const template = document.createElement("template");
  template.innerHTML = html;
  for (const child of Array.from(template.content.childNodes)) cleanNode(child);
  const safe = template.innerHTML.trim();
  return safe || undefined;
}

export function plainTextToHtml(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.trim()) return "";
  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function htmlToPlainText(html: string | undefined | null): string {
  if (!html?.trim() || typeof document === "undefined") return "";
  const safe = sanitizeHtml(html) ?? "";
  const div = document.createElement("div");
  div.innerHTML = safe;
  return (div.innerText || div.textContent || "").replace(/\u00a0/g, " ").replace(/\r\n/g, "\n");
}

export function hasMeaningfulHtml(html: string | undefined | null): boolean {
  const safe = sanitizeHtml(html);
  if (!safe) return false;
  return htmlToPlainText(safe).trim().length > 0;
}
