import { rumAction as defaultRumAction } from './rum.js';

let _rumAction = defaultRumAction;
export function __setRumActionForTesting(fn) { _rumAction = fn; }

export async function emit(type, payload = {}) {
  try { _rumAction(type, payload); } catch {}
  try {
    await fetch('/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, ...payload }),
    });
  } catch {
    /* telemetry must never break gameplay */
  }
}
