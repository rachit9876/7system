/**
 * 7System - Rich Node Editor Modal Controller
 * Handles the Markdown editing dialog, toolbar insertions (bold, tables, mermaid, etc.),
 * shortcuts (Ctrl+Enter, Esc), and smart URL formatting.
 */

import { formatSmartPastedUrl } from '../shared/smart-url.js';

export function initNodeModal({ state, findNodeById, updateNodeDimensions, saveState, requestRedraw, worldToScreen }) {
    const nodeEditor = document.getElementById('node-editor');
    const nodeEditorModal = document.getElementById('nodeEditorModal');
    const nodeEditorDoneBtn = document.getElementById('nodeEditorDoneBtn');
    const nodeEditorCancelBtn = document.getElementById('nodeEditorCancelBtn');
    const nodeEditorToolbar = document.getElementById('nodeEditorToolbar');

    if (!nodeEditor) return null;

    const updateEditorSize = () => {
        if (nodeEditorModal) return;
        if (!state.editingNodeId) return;
        const node = findNodeById(state.editingNodeId);
        if (!node) return;

        const screenPos = worldToScreen(node.x, node.y);
        const effectiveZoom = state.zoom;
        const baseHeight = node.height * effectiveZoom + 24 * effectiveZoom;

        const targetWidth = Math.min(window.innerWidth * 0.9, (node.width + 100) * effectiveZoom);
        nodeEditor.style.width = `${targetWidth}px`;

        nodeEditor.style.height = '1px';
        const neededHeight = nodeEditor.scrollHeight;

        let finalHeight = Math.max(neededHeight, baseHeight);
        const maxHeight = window.innerHeight * 0.7;
        finalHeight = Math.min(finalHeight, maxHeight);

        nodeEditor.style.height = `${finalHeight}px`;

        let left = screenPos.x;
        let top = screenPos.y;

        if (left + targetWidth > window.innerWidth) {
            left = window.innerWidth - targetWidth - 10;
        }
        if (top + finalHeight > window.innerHeight) {
            top = window.innerHeight - finalHeight - 10;
        }
        left = Math.max(10, left);
        top = Math.max(10, top);

        nodeEditor.style.left = `${left}px`;
        nodeEditor.style.top = `${top}px`;
    };

    const hideNodeEditor = () => {
        state.editingNodeId = null;
        state.editingOriginalText = null;
        if (nodeEditorModal) {
            nodeEditorModal.classList.add('hidden');
        }
        nodeEditor.classList.remove('active');
    };

    const finishEditingNode = () => {
        if (state.cancelingEdit) return;
        if (!state.editingNodeId) return;
        const node = findNodeById(state.editingNodeId);
        if (node) {
            if (state.editingOriginalText !== nodeEditor.value) {
                node.text = nodeEditor.value;
                if (typeof updateNodeDimensions === 'function') updateNodeDimensions(node);
                if (typeof saveState === 'function') saveState();
            }
        }
        hideNodeEditor();
        if (typeof requestRedraw === 'function') requestRedraw();
    };

    const cancelEditingNode = () => {
        state.cancelingEdit = true;
        if (state.editingNodeId) {
            const node = findNodeById(state.editingNodeId);
            if (node && state.editingOriginalText !== null) {
                node.text = state.editingOriginalText;
                if (typeof updateNodeDimensions === 'function') updateNodeDimensions(node);
            }
        }
        hideNodeEditor();
        if (typeof requestRedraw === 'function') requestRedraw();
        setTimeout(() => { state.cancelingEdit = false; }, 50);
    };

    const startEditingNode = (nodeId) => {
        const node = findNodeById(nodeId);
        if (!node) return;

        state.editingNodeId = nodeId;
        state.editingOriginalText = node.text;

        nodeEditor.value = node.text;
        if (nodeEditorModal) {
            nodeEditorModal.classList.remove('hidden');
        } else {
            nodeEditor.classList.add('active');
            updateEditorSize();
        }
        nodeEditor.focus();
        nodeEditor.select();
        if (typeof requestRedraw === 'function') requestRedraw();
    };

    // Modal click and done/cancel listeners
    if (nodeEditorModal) {
        nodeEditorModal.addEventListener('click', (e) => {
            if (e.target === nodeEditorModal) finishEditingNode();
        });
    }
    if (nodeEditorDoneBtn) nodeEditorDoneBtn.addEventListener('click', finishEditingNode);
    if (nodeEditorCancelBtn) nodeEditorCancelBtn.addEventListener('click', cancelEditingNode);

    // Markdown Toolbar actions
    if (nodeEditorToolbar) {
        nodeEditorToolbar.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-md]');
            if (!btn) return;
            const type = btn.dataset.md;
            const start = nodeEditor.selectionStart;
            const end = nodeEditor.selectionEnd;
            const val = nodeEditor.value;
            const sel = val.substring(start, end);
            let insert = '';
            let cursorOffset = 0;

            if (type === 'bold') {
                insert = `**${sel || 'bold text'}**`;
                cursorOffset = sel ? insert.length : 2;
            } else if (type === 'italic') {
                insert = `*${sel || 'italic text'}*`;
                cursorOffset = sel ? insert.length : 1;
            } else if (type === 'strike') {
                insert = `~~${sel || 'strikethrough'}~~`;
                cursorOffset = sel ? insert.length : 2;
            } else if (type === 'h1') {
                insert = `# ${sel || 'Heading 1'}`;
                cursorOffset = insert.length;
            } else if (type === 'h2') {
                insert = `## ${sel || 'Heading 2'}`;
                cursorOffset = insert.length;
            } else if (type === 'code') {
                insert = `\`${sel || 'code'}\``;
                cursorOffset = sel ? insert.length : 1;
            } else if (type === 'link') {
                insert = `[${sel || 'Link'}](https://)`;
                cursorOffset = insert.length - 1;
            } else if (type === 'list') {
                insert = `- ${sel || 'List item'}`;
                cursorOffset = insert.length;
            } else if (type === 'task') {
                insert = `- [ ] ${sel || 'Task item'}`;
                cursorOffset = insert.length;
            } else if (type === 'table') {
                insert = `\n| Column 1 | Column 2 |\n| :--- | :--- |\n| Value 1 | Value 2 |\n`;
                cursorOffset = insert.length;
            } else if (type === 'mermaid') {
                insert = `\n\`\`\`mermaid\ngraph TD\n  A[Start] --> B[End]\n\`\`\`\n`;
                cursorOffset = insert.length;
            }

            nodeEditor.value = val.substring(0, start) + insert + val.substring(end);
            nodeEditor.focus();
            nodeEditor.selectionStart = nodeEditor.selectionEnd = start + cursorOffset;
        });
    }

    // Keyboard shortcuts: Shift+Enter or Ctrl+Enter to save, Escape to cancel
    nodeEditor.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' && e.shiftKey) || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
            e.preventDefault();
            finishEditingNode();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEditingNode();
        }
    });

    // Smart URL paste within node textarea
    nodeEditor.addEventListener('paste', (e) => {
        const pastedText = (e.clipboardData || window.clipboardData).getData('text').trim();
        const urlRegex = /^(https?:\/\/[^\s]+)$/i;

        if (urlRegex.test(pastedText)) {
            const start = nodeEditor.selectionStart;
            const end = nodeEditor.selectionEnd;
            const selectedText = nodeEditor.value.substring(start, end);
            const markdownLink = formatSmartPastedUrl(pastedText, selectedText);

            e.preventDefault();
            document.execCommand('insertText', false, markdownLink);
        }
    });

    return {
        startEditingNode,
        finishEditingNode,
        cancelEditingNode,
        hideNodeEditor,
        updateEditorSize
    };
}
