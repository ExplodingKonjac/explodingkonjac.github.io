import { visit } from 'unist-util-visit';

export default function headingLinks() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (!/^h[2-6]$/.test(node.tagName) || !node.properties?.id) return;
      node.children.push({
        type: 'element',
        tagName: 'a',
        properties: {
          href: `#${node.properties.id}`,
          className: ['heading-anchor'],
          ariaLabel: 'Link to this heading',
        },
        children: [{ type: 'text', value: '#' }],
      });
    });
  };
}
