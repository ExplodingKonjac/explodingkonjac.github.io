import { visit } from 'unist-util-visit';
import type { Paragraph, Root } from 'mdast';
import type { Plugin } from 'unified';
import { messages } from '../config/i18n.ts';

const labels = Object.freeze({
  theorem: 'Theorem',
  lemma: 'Lemma',
  proposition: 'Proposition',
  corollary: 'Corollary',
  definition: 'Definition',
  example: 'Example',
  proof: 'Proof',
  remark: 'Remark',
  info: 'Information',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
  figure: 'Figure',
  reference: 'References',
});

const calloutIcons = Object.freeze({
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 11v6M12 7h.01',
  success: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM7 12l3 3 7-7',
  warning:
    'M10.3 3.9 2.1 18.1A2 2 0 0 0 3.8 21h16.4a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01',
  error: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM8 8l8 8M16 8l-8 8',
});

function calloutSummary(
  kind: keyof typeof calloutIcons,
  title: Paragraph | null,
): Paragraph {
  return {
    type: 'paragraph',
    data: {
      hName: 'summary',
      hProperties: { className: ['environment-title'] },
    },
    children: [
      {
        type: 'text',
        value: '',
        data: {
          hName: 'svg',
          hProperties: {
            className: ['environment-icon'],
            viewBox: '0 0 24 24',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: '1.6',
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            ariaHidden: 'true',
            focusable: 'false',
          },
          hChildren: [
            {
              type: 'element',
              tagName: 'path',
              properties: { d: calloutIcons[kind] },
              children: [],
            },
          ],
        },
      },
      {
        // Name the type for screen readers, including title-less callouts.
        type: 'text',
        value: messages.en[`environment.${kind}`],
        data: {
          hName: 'span',
          hProperties: {
            className: ['visually-hidden'],
            'data-i18n': `environment.${kind}`,
          },
        },
      },
      ...(title
        ? [
            { type: 'text' as const, value: ' ' },
            { type: 'strong' as const, children: title.children },
          ]
        : []),
    ],
  };
}

/** Render Markdown container directives without requiring JSX or client JavaScript. */
const environments: Plugin<[], Root> = () => (tree, file) => {
  const ids = new Set<string>();
  visit(tree, (node) => {
    if (
      node.type !== 'containerDirective' &&
      node.type !== 'leafDirective' &&
      node.type !== 'textDirective'
    )
      return;
    if (!Object.hasOwn(labels, node.name))
      file.fail(
        `Unknown directive "${node.name}". Supported: ${Object.keys(labels).join(', ')}`,
        node,
      );
    if (node.type !== 'containerDirective')
      return file.fail(`Use :::${node.name} as a container directive`, node);
    const attributes = node.attributes ?? {};
    for (const key of Object.keys(attributes)) {
      if (key !== 'id')
        file.fail(
          `Unsupported ${node.name} attribute "${key}"; use {#anchor} for an ID`,
          node,
        );
    }
    if (attributes.id) {
      if (!/^[A-Za-z][\w-]*$/.test(attributes.id))
        file.fail(`Invalid directive ID "${attributes.id}"`, node);
      if (ids.has(attributes.id))
        file.fail(`Duplicate directive ID "${attributes.id}"`, node);
      ids.add(attributes.id);
    }
    const title =
      node.children[0]?.type === 'paragraph' &&
      node.children[0].data?.directiveLabel
        ? (node.children.shift() as Paragraph)
        : null;
    const collapsible = Object.hasOwn(calloutIcons, node.name);
    node.data = {
      ...node.data,
      hName:
        node.name === 'figure' ? 'figure' : collapsible ? 'details' : 'section',
      hProperties: {
        className: ['environment', `environment-${node.name}`],
        ...(collapsible ? { open: true } : {}),
        ...(attributes.id ? { id: attributes.id } : {}),
      },
    };
    if (collapsible) {
      node.children.unshift(
        calloutSummary(node.name as keyof typeof calloutIcons, title),
      );
    } else if (node.name === 'figure') {
      if (title)
        node.children.push({ ...title, data: { hName: 'figcaption' } });
    } else if (node.name !== 'reference' || title) {
      const titleChildren = [
        ...(node.name === 'reference'
          ? []
          : [
              {
                type: 'text' as const,
                value: `${labels[node.name as keyof typeof labels]}${title ? ' — ' : ''}`,
              },
            ]),
        ...(title?.children ?? []),
      ];
      node.children.unshift({
        type: 'paragraph',
        data: {
          hProperties: { className: ['environment-title'] },
        },
        children: [{ type: 'strong', children: titleChildren }],
      });
      if (node.name === 'proof')
        node.children.push({
          type: 'paragraph',
          data: {
            hProperties: { className: ['proof-end'], ariaHidden: 'true' },
          },
          children: [{ type: 'text', value: '□' }],
        });
    }
  });
};

export default environments;
