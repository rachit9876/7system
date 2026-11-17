/**
 * 7System - Tree Layout Engine
 * Contour-packed Left-to-Right horizontal tree layout (Reingold-Tilford style).
 * Aligns depth columns without overlapping subtrees and keeps parents vertically centered on their children.
 */

export function layoutNodeTree(nodes, startX = 100, startY = 100, options = {}) {
    if (!nodes || nodes.length === 0) return;

    const H_GAP = options.hGap ?? 48;
    const V_GAP = options.vGap ?? 24;

    const nodeIds = new Set(nodes.map(n => n.id));
    const roots = nodes.filter(n => !n.parentId || !nodeIds.has(n.parentId));
    if (roots.length === 0) return;

    const childrenMap = new Map();
    nodes.forEach(n => childrenMap.set(n.id, []));
    nodes.forEach(n => {
        if (n.parentId && childrenMap.has(n.parentId)) {
            childrenMap.get(n.parentId).push(n);
        }
    });

    const getSize = (n) => ({
        w: Number(n.width) || 200,
        h: Number(n.height) || 100
    });

    // Compute max node width per depth level so columns align cleanly without horizontal overlap
    const levelWidths = new Map();
    const measureLevels = (id, depth, seen = new Set()) => {
        if (seen.has(id)) return;
        seen.add(id);
        const n = nodes.find(x => x.id === id);
        if (!n) return;
        const { w } = getSize(n);
        levelWidths.set(depth, Math.max(levelWidths.get(depth) || 0, w));
        (childrenMap.get(id) || []).forEach(c => measureLevels(c.id, depth + 1, seen));
    };
    roots.forEach(r => measureLevels(r.id, 0));

    const levelX = new Map();
    let accX = startX;
    const maxDepth = Math.max(0, ...levelWidths.keys());
    for (let d = 0; d <= maxDepth; d++) {
        levelX.set(d, accX);
        accX += (levelWidths.get(d) || 200) + H_GAP;
    }

    // Contour-packed Left-to-Right layout (Reingold-Tilford contour algorithm)
    const buildSubtree = (id, seen = new Set()) => {
        if (seen.has(id)) return { relY: new Map(), top: [], bottom: [] };
        seen.add(id);
        const n = nodes.find(x => x.id === id);
        const { h } = getSize(n);
        const ch = (childrenMap.get(id) || []).filter(c => !seen.has(c.id));

        if (ch.length === 0) {
            const relY = new Map([[id, 0]]);
            return { relY, top: [0], bottom: [h] };
        }

        const childTrees = ch.map(c => buildSubtree(c.id, new Set(seen)));
        const offsets = [0];
        let mergedBottom = [...childTrees[0].bottom];
        let mergedTop = [...childTrees[0].top];

        for (let i = 1; i < childTrees.length; i++) {
            const ct = childTrees[i];
            const sharedDepths = Math.min(mergedBottom.length, ct.top.length);
            let shift = 0;
            for (let d = 0; d < sharedDepths; d++) {
                shift = Math.max(shift, mergedBottom[d] + V_GAP - ct.top[d]);
            }
            offsets.push(shift);
            for (let d = 0; d < ct.bottom.length; d++) {
                const bVal = ct.bottom[d] + shift;
                const tVal = ct.top[d] + shift;
                if (d < mergedBottom.length) {
                    mergedBottom[d] = Math.max(mergedBottom[d], bVal);
                    mergedTop[d] = Math.min(mergedTop[d], tVal);
                } else {
                    mergedBottom.push(bVal);
                    mergedTop.push(tVal);
                }
            }
        }

        const relY = new Map();
        childTrees.forEach((ct, i) => {
            const off = offsets[i];
            ct.relY.forEach((y, cid) => relY.set(cid, y + off));
        });

        const firstChildY = relY.get(ch[0].id);
        const lastChildY = relY.get(ch[ch.length - 1].id);
        const lastChildH = getSize(ch[ch.length - 1]).h;
        const parentY = (firstChildY + lastChildY + lastChildH) / 2 - h / 2;
        relY.set(id, parentY);

        return {
            relY,
            top: [parentY, ...mergedTop],
            bottom: [parentY + h, ...mergedBottom]
        };
    };

    const assignPositions = (id, depth, offsetY, relY, seen = new Set()) => {
        if (seen.has(id)) return;
        seen.add(id);
        const n = nodes.find(x => x.id === id);
        if (!n) return;
        n.x = levelX.get(depth) ?? startX;
        n.y = offsetY + (relY.get(id) || 0);
        (childrenMap.get(id) || []).forEach(c => assignPositions(c.id, depth + 1, offsetY, relY, seen));
    };

    let curRootY = startY;
    roots.forEach(r => {
        const tree = buildSubtree(r.id);
        const minTop = Math.min(...tree.top);
        const maxBottom = Math.max(...tree.bottom);
        const shiftY = curRootY - minTop;
        assignPositions(r.id, 0, shiftY, tree.relY);
        curRootY += (maxBottom - minTop) + V_GAP * 2;
    });
}
