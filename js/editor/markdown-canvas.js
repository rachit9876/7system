/**
 * 7System - HTML5 Canvas Markdown Parser & Renderer
 * Handles Markdown tokenization, text measurement, image caching, Mermaid diagram rendering,
 * and high-fidelity rendering onto the 2D canvas.
 */

import { configureMermaid } from '../shared/theme.js';

export const FONT_SIZE = 16;
export const NODE_PADDING = 14;

// Image and diagram caches
const imageCache = new Map();
const mermaidCache = new Map();
const MAX_CACHE_SIZE = 50;
let mermaidIdCounter = 0;

let onContentUpdateCallback = null;
export function setContentUpdateCallback(cb) {
    onContentUpdateCallback = cb;
}

export function clearMarkdownCaches() {
    // Re-render Mermaid diagrams when the theme flips: cached images
    // are baked with the previous palette and cannot be recolored.
    mermaidCache.clear();
}

// CSS Variable caching for performant canvas fills and strokes
let cssVars = {};
export function refreshCssVars() {
    if (typeof window === 'undefined') return;
    const style = getComputedStyle(document.documentElement);
    [
        '--bg', '--bg-secondary', '--surface', '--border',
        '--node-bg', '--node-border', '--node-text', '--node-shadow',
        '--line', '--link', '--selection', '--text-primary', '--text-secondary'
    ].forEach(name => {
        cssVars[name] = style.getPropertyValue(name).trim();
    });
}

export function getCachedVar(name) {
    if (!cssVars[name]) {
        refreshCssVars();
    }
    return cssVars[name] || '';
}

export function fillRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
}

export function strokeRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.stroke();
}

export const loadImage = (url) => {
    if (imageCache.has(url)) {
        const img = imageCache.get(url);
        imageCache.delete(url);
        imageCache.set(url, img);
        return img;
    }

    if (imageCache.size >= MAX_CACHE_SIZE) {
        const firstKey = imageCache.keys().next().value;
        imageCache.delete(firstKey);
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        if (typeof onContentUpdateCallback === 'function') onContentUpdateCallback();
    };
    img.src = url;
    imageCache.set(url, img);
    return img;
};

export const getRenderedImageSize = (url) => {
    const maxWidth = 150;
    const maxHeight = 100;
    const img = imageCache.get(url);
    if (img && img.complete && img.naturalWidth > 0) {
        const ratio = Math.min(maxWidth / img.naturalWidth, maxHeight / img.naturalHeight, 1);
        return {
            width: Math.round(img.naturalWidth * ratio),
            height: Math.round(img.naturalHeight * ratio)
        };
    }
    return { width: maxWidth, height: maxHeight };
};

export const renderMermaidToImage = (code) => {
    if (typeof window === 'undefined' || typeof window.mermaid === 'undefined' || !window.mermaid.render) {
        return { loading: false, img: null, error: true };
    }
    const isDark = document.documentElement.classList.contains('dark');
    const theme = isDark ? 'dark' : 'default';
    const cacheKey = `${theme}-${code}`;

    if (mermaidCache.has(cacheKey)) {
        const cacheEntry = mermaidCache.get(cacheKey);
        mermaidCache.delete(cacheKey);
        mermaidCache.set(cacheKey, cacheEntry);
        return cacheEntry;
    }

    if (mermaidCache.size >= MAX_CACHE_SIZE) {
        const firstKey = mermaidCache.keys().next().value;
        mermaidCache.delete(firstKey);
    }

    const id = `mermaid-${mermaidIdCounter++}`;
    mermaidCache.set(cacheKey, { loading: true, img: null });

    configureMermaid(isDark);

    window.mermaid.render(id, code).then(result => {
        const svgData = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(result.svg);
        const img = new Image();
        img.onload = () => {
            mermaidCache.set(cacheKey, { loading: false, img, width: img.naturalWidth || 300, height: img.naturalHeight || 200 });
            if (typeof onContentUpdateCallback === 'function') onContentUpdateCallback();
        };
        img.src = svgData;
    }).catch(e => {
        console.error("Mermaid render error:", e);
        mermaidCache.set(cacheKey, { loading: false, img: null, error: true });
    });

    return { loading: true, img: null };
};

const createTextPart = (text, styles = {}) => ({
    text,
    bold: false,
    italic: false,
    code: false,
    codeBlock: false,
    strikethrough: false,
    blockquote: false,
    ...styles
});

const appendInlinePart = (parts, text, styles = {}) => {
    if (!text) return;

    const part = createTextPart(text, styles);
    const previous = parts[parts.length - 1];
    const comparableKeys = ['bold', 'italic', 'code', 'codeBlock', 'strikethrough', 'blockquote', 'heading', 'link', 'list'];
    const canMerge = previous
        && !previous.image
        && comparableKeys.every(key => previous[key] === part[key]);

    if (canMerge) {
        previous.text += text;
    } else {
        parts.push(part);
    }
};

export const parseInlineMarkdown = (text, baseStyles = {}) => {
    const parts = [];
    const styles = {
        bold: Boolean(baseStyles.bold),
        italic: Boolean(baseStyles.italic),
        strikethrough: Boolean(baseStyles.strikethrough)
    };
    let plainText = '';
    let index = 0;

    const currentStyles = (extra = {}) => ({ ...baseStyles, ...styles, ...extra });
    const flushPlainText = () => {
        appendInlinePart(parts, plainText, currentStyles());
        plainText = '';
    };
    const hasClosingMarker = (marker, start) => text.indexOf(marker, start + marker.length) !== -1;

    while (index < text.length) {
        if (text[index] === '\\' && index + 1 < text.length) {
            plainText += text[index + 1];
            index += 2;
            continue;
        }

        if (text.startsWith('![', index)) {
            const labelEnd = text.indexOf('](', index + 2);
            const urlEnd = labelEnd === -1 ? -1 : text.indexOf(')', labelEnd + 2);
            if (labelEnd !== -1 && urlEnd !== -1) {
                flushPlainText();
                parts.push({
                    ...createTextPart('', currentStyles()),
                    image: text.slice(labelEnd + 2, urlEnd),
                    alt: text.slice(index + 2, labelEnd)
                });
                index = urlEnd + 1;
                continue;
            }
        }

        if (text[index] === '[') {
            const labelEnd = text.indexOf('](', index + 1);
            const urlEnd = labelEnd === -1 ? -1 : text.indexOf(')', labelEnd + 2);
            if (labelEnd !== -1 && urlEnd !== -1) {
                flushPlainText();
                appendInlinePart(
                    parts,
                    text.slice(index + 1, labelEnd),
                    currentStyles({ link: text.slice(labelEnd + 2, urlEnd) })
                );
                index = urlEnd + 1;
                continue;
            }
        }

        if (text[index] === '`') {
            const closingIndex = text.indexOf('`', index + 1);
            if (closingIndex !== -1) {
                flushPlainText();
                appendInlinePart(parts, text.slice(index + 1, closingIndex), currentStyles({ code: true }));
                index = closingIndex + 1;
                continue;
            }
        }

        const markerRules = [
            { marker: '***', active: () => styles.bold && styles.italic, toggle: () => { styles.bold = !styles.bold; styles.italic = !styles.italic; } },
            { marker: '___', active: () => styles.bold && styles.italic, toggle: () => { styles.bold = !styles.bold; styles.italic = !styles.italic; } },
            { marker: '**', active: () => styles.bold, toggle: () => { styles.bold = !styles.bold; } },
            { marker: '__', active: () => styles.bold, toggle: () => { styles.bold = !styles.bold; } },
            { marker: '~~', active: () => styles.strikethrough, toggle: () => { styles.strikethrough = !styles.strikethrough; } },
            { marker: '*', active: () => styles.italic, toggle: () => { styles.italic = !styles.italic; } },
            { marker: '_', active: () => styles.italic, toggle: () => { styles.italic = !styles.italic; } }
        ];

        const rule = markerRules.find(({ marker, active }) =>
            text.startsWith(marker, index) && (active() || hasClosingMarker(marker, index))
        );

        if (rule) {
            flushPlainText();
            rule.toggle();
            index += rule.marker.length;
            continue;
        }

        plainText += text[index];
        index++;
    }

    flushPlainText();
    return parts.length ? parts : [createTextPart(text, baseStyles)];
};

export const parseMarkdown = (text) => {
    const source = typeof text === 'string' ? text.replace(/\r\n?/g, '\n') : '';
    const lines = source.split('\n');
    const parts = [];
    let inCodeBlock = false;
    let hasRenderedLine = false;

    const startLine = () => {
        if (hasRenderedLine) parts.push(createTextPart('\n'));
        hasRenderedLine = true;
    };

    const isTableSeparator = (str) => /^\|?\s*(?:-+|:-+|-+:|:-+:)(?:\s*\|\s*(?:-+|:-+|-+:|:-+:))+\s*\|?$/.test(str.trim());
    let inTable = false;
    let tableHeaders = [];
    let tableAlignments = [];
    let tableRows = [];

    const flushTable = () => {
        if (inTable && tableHeaders.length > 0) {
            parts.push({ table: true, headers: tableHeaders, alignments: tableAlignments, rows: tableRows });
        }
        inTable = false;
        tableHeaders = [];
        tableAlignments = [];
        tableRows = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (inCodeBlock) {
            if (/^\s*```\s*$/.test(line)) {
                inCodeBlock = false;
                continue;
            }

            startLine();
            parts.push(createTextPart(line, { code: true, codeBlock: true }));
            continue;
        }

        if (/^\s*```mermaid\s*$/.test(line)) {
            flushTable();
            let mermaidCode = '';
            i++;
            while(i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
                mermaidCode += lines[i] + '\n';
                i++;
            }
            startLine();
            parts.push({ mermaid: true, text: mermaidCode.trim() });
            continue;
        }

        if (/^\s*```[^`]*$/.test(line)) {
            inCodeBlock = true;
            flushTable();
            continue;
        }

        if (!inTable && line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
            startLine();
            inTable = true;
            const parseCells = (row) => row.split('|').map(s => s.trim()).filter((s, idx, arr) => !(s === '' && (idx === 0 || idx === arr.length - 1))).map(s => parseInlineMarkdown(s));
            tableHeaders = parseCells(line);

            const seps = lines[i + 1].split('|').map(s => s.trim()).filter((s, idx, arr) => !(s === '' && (idx === 0 || idx === arr.length - 1)));
            tableAlignments = seps.map(s => {
                if (s.startsWith(':') && s.endsWith(':')) return 'center';
                if (s.endsWith(':')) return 'right';
                return 'left';
            });

            i++; // skip separator
            continue;
        }

        if (inTable) {
            if (!line.includes('|')) {
                flushTable();
            } else {
                const parseCells = (row) => row.split('|').map(s => s.trim()).filter((s, idx, arr) => !(s === '' && (idx === 0 || idx === arr.length - 1))).map(s => parseInlineMarkdown(s));
                tableRows.push(parseCells(line));
                continue;
            }
        }

        startLine();

        const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
            parts.push(...parseInlineMarkdown(headingMatch[2], { heading: headingMatch[1].length }));
            continue;
        }

        if (/^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
            parts.push(createTextPart('───────────────', { hr: true }));
            continue;
        }

        const blockquoteMatch = line.match(/^(\s*)(>+)\s?(.*)$/);
        if (blockquoteMatch) {
            const level = blockquoteMatch[2].length;
            const quoteText = blockquoteMatch[3];
            const alertMatch = quoteText.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/i);

            if (alertMatch) {
                const alertType = alertMatch[1].toUpperCase();
                const icon = { NOTE: 'ℹ️', TIP: '💡', IMPORTANT: '🔥', WARNING: '⚠️', CAUTION: '🛑' }[alertType];
                appendInlinePart(parts, `${blockquoteMatch[1]}${'  '.repeat(level - 1)}▎ `, { blockquote: level, alertType });
                parts.push(...parseInlineMarkdown(`${icon} ${alertType}`, { blockquote: level, alertType, bold: true }));
            } else {
                const isAlertText = parts.length > 0 && parts[parts.length - 1].alertType;
                if (isAlertText) {
                    appendInlinePart(parts, `${blockquoteMatch[1]}${'  '.repeat(level - 1)}▎   `, { blockquote: level, alertType: parts[parts.length - 1].alertType });
                    parts.push(...parseInlineMarkdown(quoteText, { blockquote: level, alertType: parts[parts.length - 1].alertType }));
                } else {
                    appendInlinePart(parts, `${blockquoteMatch[1]}${'  '.repeat(level - 1)}▎ `, { blockquote: level });
                    parts.push(...parseInlineMarkdown(quoteText, { blockquote: level }));
                }
            }
            continue;
        }

        const unorderedListMatch = line.match(/^(\s*)([-*+•])\s+(.*)$/);
        if (unorderedListMatch) {
            const indentStr = unorderedListMatch[1].replace(/\t/g, '  ');
            const indentLevel = Math.floor(indentStr.length / 2);
            const bullets = ['•', '○', '■', '□'];
            const bullet = bullets[indentLevel % bullets.length];

            const text = unorderedListMatch[2];
            const taskMatch = text.match(/^\[([ xX])\]\s+(.*)$/);
            if (taskMatch) {
                const checked = taskMatch[1].toLowerCase() === 'x';
                const checkIcon = checked ? '☑ ' : '☐ ';
                appendInlinePart(parts, `${indentStr}${checkIcon}`, { list: true });
                parts.push(...parseInlineMarkdown(taskMatch[2], { list: true }));
            } else {
                appendInlinePart(parts, `${indentStr}${bullet} `, { list: true });
                parts.push(...parseInlineMarkdown(unorderedListMatch[3], { list: true }));
            }
            continue;
        }

        const orderedListMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
        if (orderedListMatch) {
            appendInlinePart(parts, `${orderedListMatch[1]}${orderedListMatch[2]}. `, { list: true });
            parts.push(...parseInlineMarkdown(orderedListMatch[3], { list: true }));
            continue;
        }

        parts.push(...parseInlineMarkdown(line));
    }
    flushTable();

    return parts.length ? parts : [createTextPart('')];
};

export const getWrappedParts = (ctx, text, maxWidth = 350) => {
    const parts = parseMarkdown(text);
    const wrappedParts = [];
    let currentLineWidth = 0;

    parts.forEach(part => {
        if (part.text === '\n') {
            currentLineWidth = 0;
            wrappedParts.push(part);
            return;
        }
        if (part.table || part.mermaid || part.image || part.heading) {
            wrappedParts.push(part);
            if (part.image) currentLineWidth += getRenderedImageSize(part.image).width + 5;
            else currentLineWidth = 0;
            return;
        }

        let fontWeight = '500';
        let fontStyle = '';
        if (part.bold && part.italic) { fontWeight = '700'; fontStyle = 'italic '; }
        else if (part.bold) fontWeight = '700';
        else if (part.italic) fontStyle = 'italic ';

        if (part.code) ctx.font = `500 ${FONT_SIZE}px monospace`;
        else ctx.font = `${fontStyle}${fontWeight} ${FONT_SIZE}px sans-serif`;

        const words = part.text.split(/(\s+)/);
        let newText = '';

        for (let word of words) {
            const wordWidth = ctx.measureText(word).width;
            if (currentLineWidth + wordWidth > maxWidth && currentLineWidth > 0 && !word.match(/^\s+$/)) {
                if (newText) {
                    wrappedParts.push({ ...part, text: newText });
                    newText = '';
                }
                wrappedParts.push(createTextPart('\n'));
                currentLineWidth = 0;
                if (word.match(/^\s+$/)) continue;
            }
            newText += word;
            currentLineWidth += wordWidth;
        }
        if (newText) {
            wrappedParts.push({ ...part, text: newText });
        }
    });
    return wrappedParts;
};

const headingFontFor = (heading) => `700 ${[24, 20, 18, 16, 14, 12][heading - 1] || 12}px sans-serif`;
const inlineFontFor = (cp) => cp.code
    ? `500 ${FONT_SIZE}px monospace`
    : `${cp.italic ? 'italic ' : ''}${cp.bold ? '700' : '500'} ${FONT_SIZE}px sans-serif`;

// Table geometry (column widths, overall size) is identical across the
// measure / draw / hit-test passes, so it is computed once and cached on
// the parsed part. A ctx.save/restore pair keeps the probing caller's font
// untouched while cells are measured.
export const measureTable = (ctx, part) => {
    ctx.save();
    const colWidths = [];
    const measureCells = (cells) => {
        cells.forEach((cellParts, colIndex) => {
            let cellW = 0;
            cellParts.forEach(cp => {
                ctx.font = cp.heading ? headingFontFor(cp.heading) : inlineFontFor(cp);
                cellW += ctx.measureText(cp.text).width;
            });
            colWidths[colIndex] = Math.max(colWidths[colIndex] || 0, cellW + 16);
        });
    };
    measureCells(part.headers);
    part.rows.forEach(r => measureCells(r));
    ctx.restore();

    part.colWidths = colWidths;
    part.tableWidth = colWidths.reduce((sum, w) => sum + w, 0) + (colWidths.length + 1) * 1;
    part.tableHeight = (1 + part.rows.length) * (FONT_SIZE * 1.4 + 16);
    return part;
};

export const measureMarkdownText = (ctx, text) => {
    const parts = getWrappedParts(ctx, text);
    let maxWidth = 0;
    let totalHeight = 0;
    let currentLineWidth = 0;
    let currentLineHeight = FONT_SIZE * 1.4;
    const lineHeight = FONT_SIZE * 1.4;
    let currentLineMaxY = FONT_SIZE * 1.3;

    parts.forEach(part => {
        if (part.text === '\n') {
            maxWidth = Math.max(maxWidth, currentLineWidth);
            currentLineWidth = 0;
            totalHeight += currentLineHeight;
            currentLineHeight = lineHeight;
            currentLineMaxY = FONT_SIZE * 1.3;
            return;
        }

        if (part.table) {
            if (currentLineWidth === 0 && totalHeight > 0) {
                totalHeight += FONT_SIZE * 0.8;
            }
            measureTable(ctx, part);

            const { tableWidth, tableHeight } = part;
            maxWidth = Math.max(maxWidth, currentLineWidth + tableWidth);
            currentLineWidth += tableWidth;
            currentLineHeight = Math.max(currentLineHeight, tableHeight + FONT_SIZE);
            currentLineMaxY = Math.max(currentLineMaxY, tableHeight - FONT_SIZE * 0.32);
            return;
        }

        if (part.image) {
            const sz = getRenderedImageSize(part.image);
            currentLineWidth += sz.width + 5;
            currentLineHeight = Math.max(currentLineHeight, sz.height + 10);
            currentLineMaxY = Math.max(currentLineMaxY, FONT_SIZE * 0.8 + sz.height);
            return;
        }

        if (part.mermaid) {
            const m = renderMermaidToImage(part.text);
            const w = m.img ? m.width : 300;
            const h = m.img ? m.height : 200;
            currentLineWidth += w + 20;
            currentLineHeight = Math.max(currentLineHeight, h + 20);
            currentLineMaxY = Math.max(currentLineMaxY, FONT_SIZE * 0.8 + h);
            return;
        }

        ctx.save();
        if (part.heading) {
            const headingSizes = [32, 26, 22, 18, 16, 14];
            const headingSize = headingSizes[part.heading - 1] || 12;
            ctx.font = `700 ${headingSize}px sans-serif`;
            currentLineHeight = Math.max(currentLineHeight, headingSize * 1.5 + 10);
            currentLineMaxY = Math.max(currentLineMaxY, FONT_SIZE * 0.8 + headingSize / 2);
        } else {
            let fontWeight = '500';
            let fontStyle = '';
            if (part.bold && part.italic) { fontWeight = '700'; fontStyle = 'italic '; }
            else if (part.bold) fontWeight = '700';
            else if (part.italic) fontStyle = 'italic ';

            if (part.code) ctx.font = `500 ${FONT_SIZE}px monospace`;
            else ctx.font = `${fontStyle}${fontWeight} ${FONT_SIZE}px sans-serif`;
        }

        currentLineWidth += ctx.measureText(part.text).width;
        ctx.restore();
    });

    maxWidth = Math.max(maxWidth, currentLineWidth, 80);
    totalHeight = totalHeight + currentLineMaxY;

    return { width: maxWidth, height: totalHeight };
};

export const renderMarkdownText = (ctx, text, x, y) => {
    const parts = getWrappedParts(ctx, text);
    let currentX = x;
    let currentY = y + FONT_SIZE * 0.8;
    const lineHeight = FONT_SIZE * 1.4;
    let currentLineHeight = lineHeight;

    parts.forEach(part => {
        if (part.text === '\n') {
            currentY += currentLineHeight;
            currentX = x;
            currentLineHeight = lineHeight;
            return;
        }

        if (part.table) {
            if (currentX === x && currentY > y + FONT_SIZE) {
                currentY += FONT_SIZE * 0.8;
            }
            measureTable(ctx, part);
            const { colWidths, tableWidth, tableHeight } = part;

            ctx.strokeStyle = getCachedVar('--node-border') || '#d1d5db';
            ctx.lineWidth = 1;

            let startY = currentY - lineHeight * 0.8;
            ctx.strokeRect(currentX, startY, tableWidth, tableHeight);

            let rowHeight = lineHeight + 16;

            const drawRow = (cells, isHeader) => {
                let startX = currentX;
                if (isHeader) {
                    ctx.fillStyle = getCachedVar('--bg-secondary') || '#f3f4f6';
                    ctx.fillRect(startX, startY, tableWidth, rowHeight);
                }

                ctx.beginPath();
                ctx.moveTo(startX, startY + rowHeight);
                ctx.lineTo(startX + tableWidth, startY + rowHeight);
                ctx.stroke();

                cells.forEach((cellParts, colIndex) => {
                    const w = colWidths[colIndex];
                    if (colIndex < colWidths.length - 1) {
                        ctx.beginPath();
                        ctx.moveTo(startX + w, startY);
                        ctx.lineTo(startX + w, startY + rowHeight);
                        ctx.stroke();
                    }

                    let cellW = 0;
                    ctx.save();
                    cellParts.forEach(cp => {
                        ctx.font = cp.heading ? headingFontFor(cp.heading) : inlineFontFor(cp);
                        cellW += ctx.measureText(cp.text).width;
                    });

                    let textX = startX + 8;
                    const align = part.alignments[colIndex] || 'left';
                    if (align === 'center') textX = startX + (w - cellW) / 2;
                    else if (align === 'right') textX = startX + w - cellW - 8;

                    let textY = startY + rowHeight / 2 + FONT_SIZE * 0.3;

                    cellParts.forEach(cp => {
                        ctx.font = cp.heading ? headingFontFor(cp.heading) : inlineFontFor(cp);

                        ctx.fillStyle = getCachedVar('--node-text');
                        if (cp.code) { ctx.font = `500 ${FONT_SIZE}px monospace`; ctx.fillStyle = '#22c55e'; }
                        if (cp.link) ctx.fillStyle = getCachedVar('--link');

                        if (isHeader && !cp.code && !cp.link && !cp.heading) {
                            ctx.font = `700 ${FONT_SIZE}px sans-serif`;
                        }

                        ctx.fillText(cp.text, textX, textY);

                        if (cp.strikethrough) {
                            const cpW = ctx.measureText(cp.text).width;
                            ctx.strokeStyle = '#ef4444';
                            ctx.lineWidth = 3;
                            ctx.beginPath();
                            ctx.moveTo(textX, textY - FONT_SIZE * 0.1);
                            ctx.lineTo(textX + cpW, textY - FONT_SIZE * 0.1);
                            ctx.stroke();
                        }

                        textX += ctx.measureText(cp.text).width;
                    });
                    ctx.restore();
                    startX += w;
                });
                startY += rowHeight;
            };

            drawRow(part.headers, true);
            part.rows.forEach(r => drawRow(r, false));
            ctx.restore();

            currentX += tableWidth + FONT_SIZE;
            currentLineHeight = Math.max(currentLineHeight, tableHeight + FONT_SIZE);
            return;
        }

        if (part.image) {
            const img = loadImage(part.image);
            if (img.complete && img.naturalWidth > 0) {
                const maxWidth = 150;
                const maxHeight = 100;
                let { width, height } = img;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
                if (height > maxHeight) {
                    width = (width * maxHeight) / height;
                    height = maxHeight;
                }

                ctx.drawImage(img, currentX, currentY, width, height);
                currentX += width + 5;
                currentLineHeight = Math.max(currentLineHeight, height + 10);
            }
            return;
        }

        if (part.mermaid) {
            const m = renderMermaidToImage(part.text);
            if (m.img) {
                ctx.drawImage(m.img, currentX, currentY, m.width, m.height);
                currentX += m.width + 20;
                currentLineHeight = Math.max(currentLineHeight, m.height + 20);
            } else if (m.loading) {
                ctx.fillStyle = '#6b7280';
                ctx.fillText("Rendering diagram...", currentX, currentY + FONT_SIZE);
                currentX += 150;
            } else if (m.error) {
                ctx.fillStyle = '#ef4444';
                ctx.fillText("Invalid diagram", currentX, currentY + FONT_SIZE);
                currentX += 120;
            }
            return;
        }

        ctx.save();
        ctx.fillStyle = getCachedVar('--node-text');

        if (part.heading) {
            const headingSizes = [32, 26, 22, 18, 16, 14];
            const headingSize = headingSizes[part.heading - 1] || 12;
            ctx.font = `700 ${headingSize}px sans-serif`;
            ctx.fillStyle = getCachedVar('--node-text');
            currentLineHeight = Math.max(currentLineHeight, headingSize * 1.5 + 10);
        } else {
            let fontWeight = '500';
            let fontStyle = '';
            if (part.bold && part.italic) { fontWeight = '700'; fontStyle = 'italic '; }
            else if (part.bold) fontWeight = '700';
            else if (part.italic) fontStyle = 'italic ';

            ctx.font = `${fontStyle}${fontWeight} ${FONT_SIZE}px sans-serif`;

            if (part.code) {
                ctx.font = `500 ${FONT_SIZE}px monospace`;
                ctx.fillStyle = '#22c55e';
            }
            if (part.link) {
                ctx.fillStyle = getCachedVar('--link');
            }
            if (part.blockquote) {
                if (part.alertType === 'NOTE') ctx.fillStyle = '#3b82f6';
                else if (part.alertType === 'TIP') ctx.fillStyle = '#22c55e';
                else if (part.alertType === 'IMPORTANT') ctx.fillStyle = '#8b5cf6';
                else if (part.alertType === 'WARNING') ctx.fillStyle = '#eab308';
                else if (part.alertType === 'CAUTION') ctx.fillStyle = '#ef4444';
                else ctx.fillStyle = '#ec4899';
            }
            if (part.hr) {
                ctx.fillStyle = '#cccccc';
            }
        }

        ctx.fillText(part.text, currentX, currentY);

        if (part.strikethrough) {
            const width = ctx.measureText(part.text).width;
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(currentX, currentY - FONT_SIZE * 0.1);
            ctx.lineTo(currentX + width, currentY - FONT_SIZE * 0.1);
            ctx.stroke();
        }

        if (part.link) {
            const width = ctx.measureText(part.text).width;
            const underlineY = currentY + FONT_SIZE * 0.55;
            ctx.strokeStyle = getCachedVar('--link');
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(currentX, underlineY);
            ctx.lineTo(currentX + width, underlineY);
            ctx.stroke();
        }

        currentX += ctx.measureText(part.text).width;
        ctx.restore();
    });
};

export const findLinkAtPosition = (ctx, text, x, y) => {
    if (!ctx) return null;
    const parts = getWrappedParts(ctx, text);
    let currentX = 0;
    let currentY = FONT_SIZE * 0.8;
    const lineHeight = FONT_SIZE * 1.4;
    let currentLineHeight = lineHeight;

    ctx.save();
    ctx.font = `500 ${FONT_SIZE}px sans-serif`;

    for (const part of parts) {
        if (part.text === '\n') {
            currentY += currentLineHeight;
            currentX = 0;
            currentLineHeight = lineHeight;
            continue;
        }

        if (part.image) {
            const sz = getRenderedImageSize(part.image);
            currentX += sz.width + 5;
            currentLineHeight = Math.max(currentLineHeight, sz.height + 10);
            continue;
        }

        if (part.mermaid) {
            // Diagrams occupy the rest of the line; they never contain links.
            currentX = 0;
            continue;
        }

        if (part.table) {
            if (currentX === 0 && currentY > FONT_SIZE) {
                currentY += FONT_SIZE * 0.8;
            }
            measureTable(ctx, part);
            const { colWidths, tableHeight } = part;

            let startY = currentY - lineHeight * 0.8;
            let rowHeight = lineHeight + 16;

            let linkFound = null;
            const checkRow = (cells) => {
                let startX = currentX;
                cells.forEach((cellParts, colIndex) => {
                    const w = colWidths[colIndex];
                    let cellW = 0;
                    cellParts.forEach(cp => {
                        ctx.font = cp.heading ? headingFontFor(cp.heading) : inlineFontFor(cp);
                        cellW += ctx.measureText(cp.text).width;
                    });

                    let textX = startX + 8;
                    const align = part.alignments[colIndex] || 'left';
                    if (align === 'center') textX = startX + (w - cellW) / 2;
                    else if (align === 'right') textX = startX + w - cellW - 8;

                    let textY = startY + rowHeight / 2 + FONT_SIZE * 0.3;

                    cellParts.forEach(cp => {
                        ctx.font = cp.heading ? headingFontFor(cp.heading) : inlineFontFor(cp);

                        if (cp.link) {
                            const textWidth = ctx.measureText(cp.text).width;
                            if (x >= textX && x <= textX + textWidth &&
                                y >= textY - FONT_SIZE * 0.8 && y <= textY + FONT_SIZE * 0.2) {
                                linkFound = cp.link;
                            }
                        }
                        textX += ctx.measureText(cp.text).width;
                    });
                    startX += w;
                });
                startY += rowHeight;
            };

            checkRow(part.headers);
            if (!linkFound) {
                for (const r of part.rows) {
                    checkRow(r);
                    if (linkFound) break;
                }
            }

            if (linkFound) { ctx.restore(); return linkFound; }

            currentX = 0;
            currentLineHeight = Math.max(currentLineHeight, tableHeight + FONT_SIZE);
            continue;
        }

        // Set the part's font BEFORE measuring/hit-checking it so the hit
        // rect uses the exact font it was drawn with.
        if (part.heading) {
            const headingSizes = [32, 26, 22, 18, 16, 14];
            const headingSize = headingSizes[part.heading - 1] || 12;
            ctx.font = `700 ${headingSize}px sans-serif`;
            currentLineHeight = Math.max(currentLineHeight, headingSize * 1.5 + 10);
        } else {
            let fontWeight = part.bold ? '700' : '500';
            let fontStyle = part.italic ? 'italic ' : '';
            ctx.font = `${fontStyle}${fontWeight} ${FONT_SIZE}px sans-serif`;
        }

        if (part.link) {
            const textWidth = ctx.measureText(part.text).width;
            if (x >= currentX && x <= currentX + textWidth &&
                y >= currentY - FONT_SIZE * 0.2 && y <= currentY + FONT_SIZE * 0.8) {
                ctx.restore();
                return part.link;
            }
        }

        currentX += ctx.measureText(part.text).width;
    }

    ctx.restore();
    return null;
};
