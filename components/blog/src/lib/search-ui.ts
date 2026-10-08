import { blogUrl } from '../config/site.ts';
import { searchPosts, type SearchEntry } from './search';

let entries: SearchEntry[] | undefined;
let loading: Promise<SearchEntry[]> | undefined;
export async function loadSearchIndex() {
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
export function setSearchStatus(root: HTMLElement, key: string, count = 0) {
  const node = root.querySelector<HTMLElement>('[data-search-status]')!;
  node.dataset.i18n = key;
  node.dataset.i18nParams = JSON.stringify({ count });
  node.textContent = window.__blogLocale!.text(key, { count });
}
export function renderSearch(root: HTMLElement, query: string) {
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
  setSearchStatus(
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
export function prepareSearch(doc: Document, url: URL) {
  const root = doc.querySelector<HTMLElement>('[data-search]');
  if (!root) return;
  const input = root.querySelector<HTMLInputElement>('input[name="q"]')!;
  input.value = url.searchParams.get('q') ?? '';
  renderSearch(root, input.value);
}
