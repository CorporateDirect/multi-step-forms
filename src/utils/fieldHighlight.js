/**
 * Utilities to highlight a field being edited.
 */
export function clearHighlight(root = document) {
  root.querySelectorAll('.field-editing').forEach(el => el.classList.remove('field-editing'));
}

export function highlightField(field, offset = 100) {
  if (!field) return;
  clearHighlight(field.ownerDocument);
  field.classList.add('field-editing');
  // focus without scrolling first
  try {
    field.focus({ preventScroll: true });
  } catch {
    field.focus();
  }
  // smooth scroll with offset
  const rect = field.getBoundingClientRect();
  const targetY = rect.top + window.scrollY - offset;
  window.scrollTo({ top: targetY, behavior: 'smooth' });
}

// expose globally for non-module use (e.g., in built IIFE)
if (typeof window !== 'undefined') {
  window.FieldHighlight = { highlightField, clearHighlight };
} 