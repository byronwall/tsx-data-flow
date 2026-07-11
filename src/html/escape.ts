const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string) {
  return String(text).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}
