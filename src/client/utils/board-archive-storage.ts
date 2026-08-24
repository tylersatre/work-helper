const STORAGE_KEY = 'wh.board.showArchived';

export function readShowArchived(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function writeShowArchived(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // localStorage unavailable or throwing: the toggle simply doesn't persist.
  }
}
