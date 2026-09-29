const ALLOWED_TAGS = new Set([
  "a",
  "abbr",
  "address",
  "article",
  "aside",
  "audio",
  "b",
  "bdi",
  "bdo",
  "blockquote",
  "br",
  "button",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "data",
  "dd",
  "del",
  "details",
  "dfn",
  "dialog",
  "div",
  "dl",
  "dt",
  "em",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "i",
  "img",
  "input",
  "ins",
  "kbd",
  "label",
  "legend",
  "li",
  "main",
  "mark",
  "meter",
  "nav",
  "ol",
  "option",
  "p",
  "picture",
  "pre",
  "progress",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "section",
  "select",
  "small",
  "source",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "track",
  "u",
  "ul",
  "var",
  "video",
  "wbr",
]);

const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "link", "meta", "svg", "canvas"]);

const URL_ATTRS = new Set(["href", "src", "poster"]);
const GLOBAL_ATTRS = new Set(["id", "class", "title", "dir", "lang", "role", "aria-label", "aria-hidden", "aria-expanded", "aria-controls", "aria-describedby", "aria-labelledby", "tabindex"]);
const MEDIA_ATTRS = new Set(["alt", "width", "height", "controls", "autoplay", "loop", "muted", "poster", "preload", "playsinline", "kind", "srclang", "label"]);
const FORM_ATTRS = new Set(["type", "value", "placeholder", "checked", "selected", "disabled", "readonly", "multiple", "name", "min", "max", "step", "rows", "cols"]);
const TABLE_ATTRS = new Set(["colspan", "rowspan", "scope"]);
const LIST_ATTRS = new Set(["start", "type", "reversed"]);
const DETAILS_ATTRS = new Set(["open"]);
const QUOTE_ATTRS = new Set(["cite", "datetime"]);

const ALLOWED_STYLE_PROPS = new Set([
  "align-items",
  "align-self",
  "background",
  "background-color",
  "border",
  "border-bottom",
  "border-bottom-color",
  "border-bottom-left-radius",
  "border-bottom-right-radius",
  "border-bottom-style",
  "border-bottom-width",
  "border-color",
  "border-left",
  "border-left-color",
  "border-left-style",
  "border-left-width",
  "border-radius",
  "border-right",
  "border-right-color",
  "border-right-style",
  "border-right-width",
  "border-style",
  "border-top",
  "border-top-color",
  "border-top-left-radius",
  "border-top-right-radius",
  "border-top-style",
  "border-top-width",
  "border-width",
  "bottom",
  "box-sizing",
  "clear",
  "color",
  "display",
  "float",
  "flex",
  "flex-basis",
  "flex-direction",
  "flex-grow",
  "flex-shrink",
  "flex-wrap",
  "font-family",
  "font-size",
  "font-style",
  "font-variant",
  "font-weight",
  "gap",
  "grid-auto-columns",
  "grid-auto-flow",
  "grid-auto-rows",
  "grid-column",
  "grid-row",
  "grid-template-columns",
  "grid-template-rows",
  "height",
  "justify-content",
  "left",
  "letter-spacing",
  "line-height",
  "list-style-position",
  "list-style-type",
  "margin",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "object-fit",
  "opacity",
  "overflow",
  "overflow-wrap",
  "overflow-x",
  "overflow-y",
  "padding",
  "padding-bottom",
  "padding-left",
  "padding-right",
  "padding-top",
  "position",
  "right",
  "text-align",
  "text-decoration",
  "text-decoration-color",
  "text-decoration-line",
  "text-decoration-style",
  "text-indent",
  "text-transform",
  "top",
  "vertical-align",
  "visibility",
  "white-space",
  "width",
  "word-break",
  "word-spacing",
  "z-index",
]);

const SAFE_CSS_FUNCTION_BLACKLIST = /(url\s*\(|expression\s*\(|behavior\s*:|javascript:|vbscript:|@import)/i;

export function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function sanitizeStyle(style: string) {
  if (!style || typeof document === "undefined") return "";
  const probe = document.createElement("span");
  probe.setAttribute("style", style);
  const safe: string[] = [];
  for (const prop of ALLOWED_STYLE_PROPS) {
    const value = probe.style.getPropertyValue(prop);
    if (!value || SAFE_CSS_FUNCTION_BLACKLIST.test(value)) continue;
    safe.push(`${prop}: ${value}`);
  }
  return safe.join("; ");
}

function isSafeUrl(value: string, allowDataMedia = false) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://") || lower.startsWith("mailto:") || lower.startsWith("tel:") || lower.startsWith("#") || lower.startsWith("blob:")) return true;
  if (allowDataMedia && /^data:(image|audio|video)\//i.test(trimmed)) return true;
  return false;
}

function cleanTokenList(value: string) {
  return value
    .split(/\s+/)
    .map((part) => part.replace(/[^a-zA-Z0-9_-]/g, ""))
    .filter(Boolean)
    .join(" ");
}

function cleanNumeric(value: string, fallback = "") {
  const clean = value.replace(/[^0-9.%pxemremvhvw-]/gi, "").slice(0, 32);
  return clean || fallback;
}

function setSafeRelAndTarget(el: HTMLElement) {
  if (el.tagName.toLowerCase() !== "a") return;
  const target = el.getAttribute("target") || "_blank";
  if (["_blank", "_self", "_parent", "_top"].includes(target)) el.setAttribute("target", target);
  else el.setAttribute("target", "_blank");
  const rel = new Set((el.getAttribute("rel") || "").split(/\s+/).filter(Boolean));
  rel.add("noopener");
  rel.add("noreferrer");
  el.setAttribute("rel", [...rel].join(" "));
}

function allowAttr(tag: string, name: string) {
  if (name.startsWith("on")) return false;
  if (name.startsWith("data-")) return true;
  if (name.startsWith("aria-")) return true;
  if (GLOBAL_ATTRS.has(name)) return true;
  if (URL_ATTRS.has(name)) return true;
  if ((tag === "img" || tag === "video" || tag === "audio" || tag === "source" || tag === "track") && MEDIA_ATTRS.has(name)) return true;
  if ((tag === "input" || tag === "textarea" || tag === "select" || tag === "option" || tag === "button" || tag === "label" || tag === "meter" || tag === "progress") && FORM_ATTRS.has(name)) return true;
  if ((tag === "td" || tag === "th") && TABLE_ATTRS.has(name)) return true;
  if ((tag === "ol" || tag === "ul") && LIST_ATTRS.has(name)) return true;
  if (tag === "details" && DETAILS_ATTRS.has(name)) return true;
  if ((tag === "blockquote" || tag === "q" || tag === "ins" || tag === "del" || tag === "time") && QUOTE_ATTRS.has(name)) return true;
  return false;
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
    if (!allowAttr(tag, name)) {
      el.removeAttribute(attr.name);
      continue;
    }
    if (name === "style") {
      const safe = sanitizeStyle(value);
      if (safe) el.setAttribute("style", safe);
      else el.removeAttribute(attr.name);
    } else if (name === "href") {
      if (isSafeUrl(value, false)) {
        el.setAttribute("href", value.trim());
        setSafeRelAndTarget(el);
      } else el.removeAttribute(attr.name);
    } else if (name === "src" || name === "poster") {
      if (isSafeUrl(value, true)) el.setAttribute(name, value.trim());
      else el.removeAttribute(attr.name);
    } else if (name === "class") {
      const clean = cleanTokenList(value);
      if (clean) el.setAttribute("class", clean);
      else el.removeAttribute(attr.name);
    } else if (name === "id") {
      const clean = value.replace(/[^a-zA-Z0-9_:\-.]/g, "").slice(0, 80);
      if (clean) el.setAttribute("id", clean);
      else el.removeAttribute(attr.name);
    } else if (["width", "height", "colspan", "rowspan", "tabindex"].includes(name)) {
      const clean = cleanNumeric(value);
      if (clean) el.setAttribute(name, clean);
      else el.removeAttribute(attr.name);
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

export function sanitizeCss(css: string | undefined | null): string | undefined {
  if (!css?.trim()) return undefined;
  return css
    .split("}")
    .map((block) => {
      const [selectorRaw, bodyRaw] = block.split("{");
      if (!selectorRaw || !bodyRaw) return "";
      if (SAFE_CSS_FUNCTION_BLACKLIST.test(selectorRaw) || /@import|@font-face|@keyframes/i.test(selectorRaw)) return "";
      const declarations = bodyRaw
        .split(";")
        .map((decl) => {
          const [propRaw, ...rest] = decl.split(":");
          const prop = propRaw?.trim().toLowerCase();
          const value = rest.join(":").trim();
          if (!prop || !value || !ALLOWED_STYLE_PROPS.has(prop) || SAFE_CSS_FUNCTION_BLACKLIST.test(value)) return "";
          return `${prop}: ${value}`;
        })
        .filter(Boolean)
        .join("; ");
      if (!declarations) return "";
      const selectors = selectorRaw
        .split(",")
        .map((s) => s.trim().replace(/[^a-zA-Z0-9_#.:* >+~\-[\]=\"'()]/g, ""))
        .filter(Boolean)
        .join(", ");
      return selectors ? `${selectors} { ${declarations}; }` : "";
    })
    .filter(Boolean)
    .join("\n") || undefined;
}

export function scopeCss(css: string | undefined | null, scopeId: string): string {
  const safe = sanitizeCss(css);
  if (!safe) return "";
  const scope = `[data-html-note-content="${scopeId.replace(/"/g, "")}"]`;
  return safe.replace(/([^{}]+)\{/g, (_match, selector) => {
    const scoped = selector
      .split(",")
      .map((part: string) => `${scope} ${part.trim()}`)
      .join(", ");
    return `${scoped} {`;
  });
}
