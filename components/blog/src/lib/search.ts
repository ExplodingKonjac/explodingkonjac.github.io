export interface SearchEntry {
  id: string;
  title: string;
  summary: string;
  content: string;
}
export function normalizeSearch(text: string) {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}
export function searchPosts(entries: SearchEntry[], query: string) {
  const terms = [
    ...new Set(normalizeSearch(query.trim()).split(/\s+/).filter(Boolean)),
  ];
  if (!terms.length) return [];
  return entries
    .map((entry, order) => {
      const fields = [entry.title, entry.summary, entry.content].map(
        normalizeSearch,
      );
      if (!terms.every((term) => fields.some((field) => field.includes(term))))
        return null;
      const score = terms.reduce(
        (sum, term) =>
          sum +
          (fields[0].includes(term) ? 30 : 0) +
          (fields[1].includes(term) ? 10 : 0) +
          (fields[2].includes(term) ? 1 : 0),
        0,
      );
      const bodyTerms = terms.filter(
        (term) => !fields[0].includes(term) && !fields[1].includes(term),
      );
      let excerpt = '';
      if (bodyTerms.length) {
        const at = Math.max(0, fields[2].indexOf(bodyTerms[0]));
        let start = Math.max(0, at - 55);
        if (start > 0) {
          const space = entry.content.indexOf(' ', start);
          if (space >= 0 && space < at) start = space + 1;
        }
        let end = Math.min(entry.content.length, start + 220);
        if (end < entry.content.length) {
          const space = entry.content.lastIndexOf(' ', end);
          if (space > at) end = space;
        }
        excerpt = `${start ? '…' : ''}${entry.content.slice(start, end)}${end < entry.content.length ? '…' : ''}`;
      }
      return { id: entry.id, score, order, excerpt };
    })
    .filter((entry) => entry !== null)
    .sort((a, b) => b.score - a.score || a.order - b.order);
}
