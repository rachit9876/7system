/**
 * 7System - Markdown Tree Serialization & Parser
 * Converts mindmap nodes to indented markdown list and parses markdown back into positioned nodes.
 */

import { layoutNodeTree } from './layout.js';

export function nodesToMarkdown(nodes = []) {
    if (!Array.isArray(nodes) || nodes.length === 0) return '';

    const nodeIds = new Set(nodes.map(n => n.id));
    const roots = nodes.filter(n => !n.parentId || !nodeIds.has(n.parentId));
    let md = '';
    const visited = new Set();

    const traverse = (node, depth) => {
        if (visited.has(node.id)) return;
        visited.add(node.id);
        const indent = '  '.repeat(depth);
        const safeText = (node.text || '').replace(/\n/g, '<br>');
        md += `${indent}- ${safeText}\n`;
        const children = nodes.filter(n => n.parentId === node.id);
        children.sort((a, b) => (a.y || 0) - (b.y || 0)).forEach(c => traverse(c, depth + 1));
    };

    roots.sort((a, b) => (a.y || 0) - (b.y || 0)).forEach(r => traverse(r, 0));
    return md.trim();
}

export function markdownToNodes(md, startX = 100, startY = 100, startId = 1, measureFn = null) {
    if (!md || typeof md !== 'string') {
        return { nodes: [], nextId: startId };
    }

    const normalizedMd = md.replace(/\r\n?/g, '\n');
    const lines = normalizedMd.split('\n');
    const newNodes = [];
    let currentId = startId;
    const stack = [];

    lines.forEach(line => {
        if (!line.trim()) return;

        // Match bullets (-, *, +, or •)
        const match = line.match(/^(\s*)([-*+•]\s+)?(.*)$/);

        if (!match || !match[2]) {
            // Append continuation lines to previous node text
            if (newNodes.length > 0) {
                const prevNode = newNodes[newNodes.length - 1];
                prevNode.text += '\n' + line.trim().replace(/<br>/gi, '\n');
            }
            return;
        }

        const spaces = match[1].replace(/\t/g, '  ').length;
        const depth = Math.floor(spaces / 2);
        const text = match[3].replace(/<br>/gi, '\n').trim();

        while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
            stack.pop();
        }
        const parentId = stack.length > 0 ? stack[stack.length - 1].id : null;

        const node = {
            id: currentId++,
            text: text,
            x: 0,
            y: 0,
            parentId: parentId,
            width: 200,
            height: 100
        };

        newNodes.push(node);
        stack.push({ depth, id: node.id });
    });

    // Run custom dimension measurement if supplied
    if (typeof measureFn === 'function') {
        newNodes.forEach(measureFn);
    }

    // Apply contour-packed Left-to-Right layout
    layoutNodeTree(newNodes, startX, startY);

    return { nodes: newNodes, nextId: currentId };
}
