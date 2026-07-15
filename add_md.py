import sys

with open('js/editor.js', 'r', encoding='utf-8') as f:
    content = f.read()

md_logic = """
        const nodesToMarkdown = (nodes) => {
            let md = '';
            const roots = nodes.filter(n => !n.parentId || !nodes.find(pn => pn.id === n.parentId));
            
            const traverse = (node, depth) => {
                const indent = '  '.repeat(depth);
                const safeText = node.text.replace(/\\n/g, '<br>');
                md += `${indent}- ${safeText}\\n`;
                const children = nodes.filter(n => n.parentId === node.id);
                // Sort children by Y coordinate to maintain visual order in markdown
                children.sort((a, b) => a.y - b.y).forEach(c => traverse(c, depth + 1));
            };

            roots.sort((a, b) => a.y - b.y).forEach(r => traverse(r, 0));
            return md.trim();
        };

        const markdownToNodes = (md, startX, startY) => {
            const lines = md.split('\\n');
            const newNodes = [];
            let currentId = state.nextNodeId;
            const stack = []; 
            
            let yOffset = 0;
            
            lines.forEach(line => {
                if (!line.trim()) return;
                const match = line.match(/^(\\s*)([-*+]\\s+)?(.*)$/);
                if (!match) return;
                
                let spaces = match[1].length;
                if (line.match(/^(\\t*)/)[1].length > 0) {
                    spaces = line.match(/^(\\t*)/)[1].length * 2;
                }
                
                const depth = Math.floor(spaces / 2); 
                const text = match[3].replace(/<br>/g, '\\n').trim();
                
                while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
                    stack.pop();
                }
                const parentId = stack.length > 0 ? stack[stack.length - 1].id : null;
                
                const node = {
                    id: currentId++,
                    text: text,
                    x: startX + depth * 300, 
                    y: startY + yOffset,     
                    parentId: parentId,
                    width: 200,
                    height: 100
                };
                
                yOffset += 120; 
                
                newNodes.push(node);
                stack.push({ depth, id: node.id });
            });
            
            return { nodes: newNodes, nextId: currentId };
        };

        const copyMarkdownTree = async () => {
            if (state.nodes.length === 0) {
                showNotification('Mind map is empty.', 'error');
                return;
            }
            const md = nodesToMarkdown(state.nodes);
            try {
                await navigator.clipboard.writeText(md);
                showNotification('Markdown tree copied to clipboard!', 'success');
            } catch (err) {
                showNotification('Failed to copy to clipboard.', 'error');
            }
        };

        const pasteMarkdownTree = async () => {
            try {
                const text = await navigator.clipboard.readText();
                if (!text) {
                    showNotification('Clipboard is empty.', 'error');
                    return;
                }
                
                const centerX = -state.pan.x + dom.canvas.width / 2 / state.zoom;
                const centerY = -state.pan.y + dom.canvas.height / 2 / state.zoom;
                
                const result = markdownToNodes(text, centerX, centerY);
                if (result.nodes.length > 0) {
                    if (confirm('Do you want to replace the current mind map with the pasted tree? (Cancel will append)')) {
                        state.nodes = result.nodes;
                    } else {
                        state.nodes = state.nodes.concat(result.nodes);
                    }
                    state.nextNodeId = result.nextId;
                    saveState();
                    drawGrid();
                    showNotification(`Pasted ${result.nodes.length} nodes!`, 'success');
                } else {
                    showNotification('No valid markdown list found in clipboard.', 'error');
                }
            } catch (err) {
                showNotification('Failed to read clipboard.', 'error');
            }
        };

        const exportAsRXT = () => {
"""

content = content.replace("const exportAsRXT = () => {", md_logic)

with open('js/editor.js', 'w', encoding='utf-8') as f:
    f.write(content)

print("Injected Markdown Import/Export logic")
