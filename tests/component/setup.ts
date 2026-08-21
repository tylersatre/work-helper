import { cleanup } from '@testing-library/vue';
import { afterEach } from 'vitest';

// jsdom has no matchMedia implementation; Naive UI's responsive/theme internals call it on mount.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// jsdom has no scrollTo implementation; Naive UI's NSelect calls it on the scrollbar/list
// elements when scrolling a selected option into view.
if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
  Element.prototype.scrollTo = () => {};
}

afterEach(() => {
  cleanup();
  if (typeof window !== 'undefined') {
    window.localStorage.clear();
  }
});
