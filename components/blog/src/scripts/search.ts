import type { TransitionBeforeSwapEvent } from 'astro:transitions/client';
import { blogUrl } from '../config/site.mjs';
import { searchPosts, type SearchEntry } from '../lib/search';
import { prepareGlass } from './glass';

let entries: SearchEntry[] | undefined;
let loading: Promise<SearchEntry[]> | undefined;
let controller: AbortController | undefined;
let currentRoot: HTMLElement | null = null;
async function loadIndex() {
  if (entries) return entries;
  if (!loading)
    loading = fetch(blogUrl('search-index.json'))
      .then((response) => {
        if (!response.ok) throw new Error('Search index unavailable');
        return response.json();
      })
      .then((data) => {
        if (
          !Array.isArray(data) ||
          !data.every((entry) =>
            ['id', 'title', 'summary', 'content'].every(
              (key) => typeof entry[key] === 'string',
            ),
          )
        )
          throw new Error('Invalid search index');
        entries = data;
        return data;
      })
      .catch((error) => {
        loading = undefined;
        throw error;
      });
  return loading;
}
function status(root: HTMLElement, key: string, count = 0) {
  const node = root.querySelector<HTMLElement>('[data-search-status]')!;
  node.dataset.i18n = key;
  node.dataset.i18nParams = JSON.stringify({ count });
  node.textContent = window.__blogLocale!.text(key, { count });
}
function render(root: HTMLElement, query: string) {
  const results = root.querySelector<HTMLElement>('[data-search-results]')!;
  const list = results.querySelector('.post-list')!;
  const matches = entries ? searchPosts(entries, query) : [];
  const cards = new Map(
    [...list.querySelectorAll<HTMLElement>('[data-post-key]')].map((card) => [
      card.dataset.postKey!,
      card,
    ]),
  );
  cards.forEach((card) => (card.hidden = true));
  for (const match of matches) {
    const card = cards.get(match.id);
    if (!card) continue;
    const excerpt = card.querySelector<HTMLElement>('.search-excerpt')!;
    excerpt.textContent = match.excerpt;
    excerpt.hidden = !match.excerpt;
    card.hidden = false;
    list.append(card);
  }
  results.hidden = !matches.length;
  root.querySelector<HTMLButtonElement>('.search-clear')!.hidden = !query;
  status(
    root,
    !query.trim()
      ? 'search.idle'
      : !entries
        ? 'search.loading'
        : !matches.length
          ? 'search.empty'
          : matches.length === 1
            ? 'search.one'
            : 'search.many',
    matches.length,
  );
}
function prepare(doc: Document, url: URL) {
  const root = doc.querySelector<HTMLElement>('[data-search]');
  if (!root) return;
  const input = root.querySelector<HTMLInputElement>('input[name="q"]')!;
  input.value = url.searchParams.get('q') ?? '';
  render(root, input.value);
}
function initialize() {
  const root = document.querySelector<HTMLElement>('[data-search]');
  if (root === currentRoot && controller && !controller.signal.aborted) return;
  controller?.abort();
  currentRoot = root;
  if (!root) return;
  const page = new AbortController();
  controller = page;
  const { signal } = page;
  prepare(document, new URL(location.href));
  const input = root.querySelector<HTMLInputElement>('input[name="q"]')!;
  const form = root.querySelector('form')!;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let composing = false;
  const update = async (save = true) => {
    clearTimeout(timer);
    const query = input.value;
    if (save) {
      const url = new URL(location.href);
      if (query) url.searchParams.set('q', query);
      else url.searchParams.delete('q');
      history.replaceState(history.state, '', url);
    }
    render(root, query);
    if (query.trim()) {
      try {
        await loadIndex();
      } catch {
        if (!signal.aborted && input.value === query)
          status(root, 'search.error');
        return;
      }
    }
    if (signal.aborted || !root.isConnected || input.value !== query) return;
    render(root, query);
    prepareGlass(root);
  };
  input.addEventListener(
    'input',
    (event) => {
      if (composing || (event as InputEvent).isComposing) return;
      clearTimeout(timer);
      timer = setTimeout(() => void update(), 100);
    },
    { signal },
  );
  input.addEventListener(
    'compositionstart',
    () => {
      composing = true;
      clearTimeout(timer);
    },
    { signal },
  );
  input.addEventListener(
    'compositionend',
    () => {
      composing = false;
      void update();
    },
    { signal },
  );
  form.addEventListener(
    'submit',
    (event) => {
      event.preventDefault();
      if (!composing) void update();
    },
    { signal },
  );
  form.addEventListener(
    'reset',
    (event) => {
      event.preventDefault();
      input.value = '';
      void update();
      input.focus();
    },
    { signal },
  );
  window.addEventListener(
    'popstate',
    () => {
      if (location.pathname !== blogUrl('search')) return;
      prepare(document, new URL(location.href));
      void update(false);
    },
    { signal },
  );
  signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  void update(false);
}
document.addEventListener(
  'astro:before-swap',
  (event: TransitionBeforeSwapEvent) => prepare(event.newDocument, event.to),
);
document.addEventListener('astro:page-load', initialize);
initialize();
