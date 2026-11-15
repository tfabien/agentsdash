// The DOM and HTTP helpers of every page module (hub page and phone page). No imports: Node tests load the modules that use it,
// and `document` and `fetch` are read only when a helper runs.

/** A new `tag` element with class `cls` and text `text` (both optional). */
export const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

/** POST `body` as JSON (no body when it is undefined). Resolves with the Response whatever its status: the caller reads `ok`. */
export const postJson = (path, body) => fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

/** POST to the hub; a refusal throws the hub's reason. No body sends `{}` (POST /market/update answers 400 on an empty body). */
export async function call(path, body = {}) {
  const res = await postJson(path, body);
  if (!res.ok) throw new Error(await res.text());
  return res;
}
