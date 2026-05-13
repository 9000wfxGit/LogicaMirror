const storageKey = "logicamirror.session.v1";

export function loadSession() {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveSession(session) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(session));
  } catch {
    // Persistence should not block the reading flow.
  }
}

export function clearSession() {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore unavailable local storage.
  }
}
