import { visit } from 'unist-util-visit';
import type { Paragraph, Root } from 'mdast';
import type { Plugin } from 'unified';

const labels = Object.freeze({
  theorem: 'Theorem',
  lemma: 'Lemma',
  proposition: 'Proposition',
  corollary: 'Corollary',
  definition: 'Definition',
  example: 'Example',
  proof: 'Proof',
  remark: 'Remark',
  note: 'Note',
  tip: 'Tip',
  warning: 'Warning',
  figure: 'Figure',
  reference: 'References',
});

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
    const collapsible = ['note', 'tip', 'warning'].includes(node.name);
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
    if (node.name === 'figure') {
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
          ...(collapsible ? { hName: 'summary' } : {}),
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
