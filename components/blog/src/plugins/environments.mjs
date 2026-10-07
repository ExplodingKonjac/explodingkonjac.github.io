import { visit } from 'unist-util-visit';

const labels = Object.freeze({
  theorem: 'Theorem',
  lemma: 'Lemma',
  proposition: 'Proposition',
  corollary: 'Corollary',
  definition: 'Definition',
  proof: 'Proof',
  remark: 'Remark',
  note: 'Note',
  tip: 'Tip',
  warning: 'Warning',
  figure: 'Figure',
});

/** Render Markdown container directives without requiring JSX or client JavaScript. */
export default function environments() {
  return (tree, file) => {
    const ids = new Set();
    visit(tree, (node) => {
      if (
        !['containerDirective', 'leafDirective', 'textDirective'].includes(
          node.type,
        )
      )
        return;
      if (!Object.hasOwn(labels, node.name))
        file.fail(
          `Unknown directive "${node.name}". Supported: ${Object.keys(labels).join(', ')}`,
          node,
        );
      if (node.type !== 'containerDirective')
        file.fail(`Use :::${node.name} as a container directive`, node);
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
      const title = node.children[0]?.data?.directiveLabel
        ? node.children.shift()
        : null;
      node.data = {
        ...node.data,
        hName: node.name === 'figure' ? 'figure' : 'section',
        hProperties: {
          className: ['environment', `environment-${node.name}`],
          ...(attributes.id ? { id: attributes.id } : {}),
        },
      };
      if (node.name === 'figure') {
        if (title)
          node.children.push({ ...title, data: { hName: 'figcaption' } });
      } else {
        const titleChildren = [
          { type: 'text', value: `${labels[node.name]}${title ? ' — ' : ''}` },
          ...(title?.children ?? []),
        ];
        node.children.unshift({
          type: 'paragraph',
          data: { hProperties: { className: ['environment-title'] } },
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
}
