import { SKIP, visit } from 'unist-util-visit';
import type { Literal, Root } from 'mdast';
import type { ElementContent } from 'hast';
import type { Extension as FromMarkdownExtension } from 'mdast-util-from-markdown';
import type { Code, Extension, State, Tokenizer } from 'micromark-util-types';
import type { Plugin } from 'unified';
import type {} from 'remark-parse';

interface Citation extends Literal {
  type: 'citation';
  keys: string[];
}

declare module 'mdast' {
  interface PhrasingContentMap {
    citation: Citation;
  }
  interface RootContentMap {
    citation: Citation;
  }
}
declare module 'micromark-util-types' {
  interface TokenTypeMap {
    citation: 'citation';
  }
}

const isSpace = (code: Code) => code === 32 || code === -1 || code === -2;
const isKey = (code: Code) =>
  code !== null &&
  code > 0 &&
  /[A-Za-z0-9_.:-]/.test(String.fromCodePoint(code));

// Parse at the token level so Markdown escapes, code, and math remain literal.
const tokenizeCitation: Tokenizer = function (effects, ok, nok) {
  const start: State = (code) => {
    effects.enter('citation');
    effects.consume(code);
    return at;
  };
  const at: State = (code) => {
    if (code !== 64) return nok(code);
    effects.consume(code);
    return firstKey;
  };
  const firstKey: State = (code) => {
    if (!isKey(code)) return nok(code);
    effects.consume(code);
    return key;
  };
  const key: State = (code) => {
    if (isKey(code)) {
      effects.consume(code);
      return key;
    }
    return separator(code);
  };
  const separator: State = (code) => {
    if (isSpace(code)) {
      effects.consume(code);
      return separator;
    }
    if (code === 44) {
      effects.consume(code);
      return next;
    }
    if (code !== 93) return nok(code);
    effects.consume(code);
    effects.exit('citation');
    // Explicit Markdown links keep ownership of their labels.
    return (following) =>
      following === 40 || following === 91 ? nok(following) : ok(following);
  };
  const next: State = (code) => {
    if (isSpace(code)) {
      effects.consume(code);
      return next;
    }
    return at(code);
  };
  return start;
};

const syntax: Extension = {
  text: { 91: { name: 'citation', tokenize: tokenizeCitation } },
};
const fromMarkdown: FromMarkdownExtension = {
  enter: {
    citation(token) {
      const value = this.sliceSerialize(token);
      this.enter(
        {
          type: 'citation',
          value,
          keys: value
            .slice(1, -1)
            .split(',')
            .map((key) => key.trim().slice(1)),
        },
        token,
      );
    },
  },
  exit: {
    citation(token) {
      this.exit(token);
    },
  },
};

/** Resolve article-local reference definitions before rendering any citations. */
const references: Plugin<[], Root> = function () {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(syntax);
  (data.fromMarkdownExtensions ??= []).push(fromMarkdown);

  return (tree, file) => {
    const entries = new Map<string, { number: number; id: string }>();

    visit(tree, 'containerDirective', (block) => {
      if (block.name !== 'reference') return;
      const lists = block.children.filter(
        (child) => !(child.type === 'paragraph' && child.data?.directiveLabel),
      );
      if (!lists.length)
        file.fail('Reference lists must contain at least one entry', block);
      for (const list of lists) {
        if (list.type !== 'list' || list.ordered)
          return file.fail(
            'Use - [@key] followed by a description in :::reference',
            list,
          );
        list.ordered = true;
        list.start = entries.size + 1;
        list.spread = true;
        list.data = {
          ...list.data,
          hProperties: { className: ['reference-list'] },
        };
        for (const item of list.children) {
          const paragraph = item.children[0];
          const marker =
            paragraph?.type === 'paragraph' ? paragraph.children[0] : undefined;
          if (
            paragraph?.type !== 'paragraph' ||
            marker?.type !== 'citation' ||
            marker.keys.length !== 1 ||
            item.checked != null
          )
            return file.fail(
              'Each reference entry must begin with exactly one [@key]',
              item,
            );
          const key = marker.keys[0];
          if (entries.has(key))
            file.fail(`Duplicate reference "${key}"`, marker);

          paragraph.children.shift();
          const first = paragraph.children[0];
          if (first?.type === 'text') {
            first.value = first.value.trimStart();
            if (!first.value) paragraph.children.shift();
          }
          if (!paragraph.children.length) item.children.shift();
          if (!item.children.length)
            file.fail(`Reference "${key}" needs a description`, item);

          const id = `reference-${key}`;
          entries.set(key, { number: entries.size + 1, id });
          item.data = {
            ...item.data,
            hProperties: { id, className: ['reference-entry'], tabIndex: -1 },
          };
        }
      }
    });

    visit(tree, (node) => {
      // A citation-looking label inside an existing link stays plain label text.
      if (node.type === 'link' || node.type === 'linkReference') return SKIP;
      if (node.type !== 'citation') return;
      const children: ElementContent[] = [{ type: 'text', value: '[' }];
      node.keys.forEach((key, index) => {
        const entry = entries.get(key);
        if (!entry) return file.fail(`Unknown reference "${key}"`, node);
        if (index) children.push({ type: 'text', value: ', ' });
        children.push({
          type: 'element',
          tagName: 'a',
          properties: {
            href: `#${encodeURIComponent(entry.id)}`,
            ariaLabel: `Reference ${entry.number}`,
            'data-i18n-aria': 'reference.link',
            'data-i18n-params': JSON.stringify({ number: entry.number }),
          },
          children: [{ type: 'text', value: String(entry.number) }],
        });
      });
      children.push({ type: 'text', value: ']' });
      node.data = {
        hName: 'span',
        hProperties: { className: ['citation'] },
        hChildren: children,
      };
    });
  };
};

export default references;
