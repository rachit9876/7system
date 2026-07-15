import sys

with open('js/editor.js', 'r', encoding='utf-8') as f:
    content = f.read()

new_logic = """
        const markdownToNodes = (md, startX, startY) => {
            const lines = md.split('\\n');
            const newNodes = [];
            let currentId = state.nextNodeId;
            const stack = []; 
            
            // First pass: create all nodes and determine hierarchy
            lines.forEach(line => {
                if (!line.trim()) return;
                const match = line.match(/^(\\s*)([-*+]\\s+)?(.*)$/);
                if (!match || !match[2]) return;
                
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
                    x: 0, 
                    y: 0,     
                    parentId: parentId,
                    width: 200,
                    height: 100
                };
                
                newNodes.push(node);
                stack.push({ depth, id: node.id });
            });

            // Second pass: Calculate layout
            const roots = newNodes.filter(n => !n.parentId);
            
            // Calculate height required for each subtree
            const calculateHeight = (nodeId) => {
                const children = newNodes.filter(n => n.parentId === nodeId);
                if (children.length === 0) return 140; // Base spacing per node
                return children.reduce((sum, child) => sum + calculateHeight(child.id), 0);
            };

            // Recursively position nodes
            const positionNode = (nodeId, x, topY) => {
                const node = newNodes.find(n => n.id === nodeId);
                const children = newNodes.filter(n => n.parentId === nodeId);
                
                node.x = x;
                
                if (children.length === 0) {
                    node.y = topY + 70; // Center in its 140px vertical slot
                    return;
                }
                
                let currentY = topY;
                children.forEach(child => {
                    const childHeight = calculateHeight(child.id);
                    positionNode(child.id, x + 350, currentY); // 350px horizontal spacing
                    currentY += childHeight;
                });
                
                // Parent's Y is centered among its children
                const firstChild = children[0];
                const lastChild = children[children.length - 1];
                node.y = (firstChild.y + lastChild.y) / 2;
            };

            // Position all roots
            let currentRootY = startY;
            roots.forEach(root => {
                const rootHeight = calculateHeight(root.id);
                positionNode(root.id, startX, currentRootY);
                currentRootY += rootHeight;
            });
            
            return { nodes: newNodes, nextId: currentId };
        };
"""

# Extract the old markdownToNodes
start_idx = content.find("const markdownToNodes = (md, startX, startY) => {")
end_idx = content.find("const copyMarkdownTree = async () => {")

if start_idx != -1 and end_idx != -1:
    content = content[:start_idx] + new_logic.strip() + "\n\n        " + content[end_idx:]
    with open('js/editor.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Injected recursive layout logic!")
else:
    print("Could not find boundaries")
