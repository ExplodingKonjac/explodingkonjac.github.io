import type { ShikiConfig } from '@astrojs/markdown-remark';
import type { Element } from 'hast';
import { messages } from '../config/i18n.ts';

function icon(className: string, children: Element[]): Element {
  return {
    type: 'element',
    tagName: 'svg',
    properties: {
      className: [className],
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: '1.6',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      ariaHidden: 'true',
      focusable: 'false',
    },
    children,
  };
}

const languageNames: Record<string, string> = {
  c: 'C',
  cpp: 'C++',
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  py: 'Python',
  python: 'Python',
  bash: 'Bash',
  sh: 'Shell',
  shell: 'Shell',
  makefile: 'Makefile',
  json: 'JSON',
  html: 'HTML',
  css: 'CSS',
};

/** Add code chrome directly to Shiki's tree, preserving its highlighted source. */
const codeBlocks: NonNullable<ShikiConfig['transformers']>[number] = {
  name: 'blog-code-blocks',
  root(root) {
    if (this.pre.tagName !== 'pre') return;
    const language = String(
      this.pre.properties.dataLanguage ?? this.options.lang,
    );
    const plain = ['plain', 'plaintext', 'text', 'txt'].includes(language);

    // Numbers use generated content outside <code>, so copying and searching
    // the source never includes the gutter or the language header.
    this.pre.children.unshift({
      type: 'element',
      tagName: 'span',
      properties: { className: ['code-line-numbers'], ariaHidden: 'true' },
      children: this.lines.map((_, index) => ({
        type: 'element',
        tagName: 'span',
        properties: { className: ['code-line-number'], 'data-line': index + 1 },
        children: [],
      })),
    });

    root.children = [
      {
        type: 'element',
        tagName: 'div',
        properties: { className: ['code-block'] },
        children: [
          {
            type: 'element',
            tagName: 'div',
            properties: { className: ['code-block-header'] },
            children: [
              {
                type: 'element',
                tagName: 'span',
                properties: {
                  className: ['code-language'],
                  ...(plain ? { 'data-i18n': 'code.plain' } : {}),
                },
                children: [
                  {
                    type: 'text',
                    value: plain
                      ? messages.en['code.plain']
                      : (languageNames[language] ?? language),
                  },
                ],
              },
              {
                type: 'element',
                tagName: 'div',
                properties: { className: ['code-block-actions'] },
                children: [
                  {
                    type: 'element',
                    tagName: 'span',
                    properties: {
                      className: ['code-copy-status'],
                      role: 'status',
                    },
                    children: [],
                  },
                  {
                    type: 'element',
                    tagName: 'button',
                    properties: {
                      type: 'button',
                      className: ['icon-button', 'code-copy'],
                      hidden: true,
                      ariaLabel: messages.en['code.copy'],
                      'data-i18n-aria': 'code.copy',
                    },
                    children: [
                      icon('icon-copy', [
                        {
                          type: 'element',
                          tagName: 'rect',
                          properties: {
                            x: '8',
                            y: '8',
                            width: 14,
                            height: 14,
                            rx: '2',
                          },
                          children: [],
                        },
                        {
                          type: 'element',
                          tagName: 'path',
                          properties: {
                            d: 'M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2',
                          },
                          children: [],
                        },
                      ]),
                      icon('icon-copied', [
                        {
                          type: 'element',
                          tagName: 'path',
                          properties: { d: 'm5 12 4 4L19 6' },
                          children: [],
                        },
                      ]),
                    ],
                  },
                ],
              },
            ],
          },
          this.pre,
        ],
      },
    ];
  },
};

export default codeBlocks;
