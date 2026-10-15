import { EditorState } from '@codemirror/state';
import { history, undo, redo } from '@codemirror/commands';
export const LARGE = 5 * 1024 * 1024;
export function replaceDocument(view, text) {
  text = String(text);
  if (text !== view.state.doc.toString()) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, userEvent: 'input.replace' });
}
export function diagnostics(text, checkJson, force = false) {
  if (!text.trim() || (!force && text.length > LARGE)) return [];
  const result = checkJson(text);
  if (result.ok) return [];
  const from = Math.max(0, Math.min(text.length, result.offset == null ? 0 : result.offset));
  return [{ from, to: Math.min(text.length, from + 1), severity: 'error', message: result.message }];
}
export function stateForTest(text) { return EditorState.create({ doc: text, extensions: [history()] }); }
export { undo, redo };
