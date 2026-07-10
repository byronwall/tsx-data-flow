const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}
