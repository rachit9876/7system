/**
 * 7System - Smart URL Paste Formatter
 * Automatically transforms raw URLs into rich Markdown links or embedded image tags.
 */

export function formatSmartPastedUrl(rawUrl, selectedText = '') {
    const trimmed = (rawUrl || '').trim();
    if (!trimmed) return '';
    if (selectedText) return `[${selectedText}](${trimmed})`;

    try {
        const url = new URL(trimmed);
        const pathname = decodeURIComponent(url.pathname || '');
        const lowerPath = pathname.toLowerCase();

        // Direct image files -> image embed syntax
        if (/\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(lowerPath)) {
            const file = pathname.split('/').filter(Boolean).pop() || 'Image';
            return `![${file}](${trimmed})`;
        }

        // Common document formats
        if (/\.(pdf|docx?|xlsx?|pptx?|csv|txt|md|zip)$/i.test(lowerPath)) {
            const file = pathname.split('/').filter(Boolean).pop() || 'Document';
            return `[${file}](${trimmed})`;
        }

        const host = url.hostname.replace(/^www\./i, '').toLowerCase();
        let label = host;

        if (host === 'github.com') {
            const parts = pathname.split('/').filter(Boolean);
            label = parts.length >= 2 ? `GitHub: ${parts[0]}/${parts[1]}` : 'GitHub';
        } else if (host === 'youtube.com' || host === 'youtu.be') {
            label = 'YouTube';
        } else if (host === 'docs.google.com') {
            if (pathname.includes('/spreadsheets')) label = 'Google Sheet';
            else if (pathname.includes('/presentation')) label = 'Google Slides';
            else label = 'Google Doc';
        } else if (host === 'drive.google.com') {
            label = 'Google Drive';
        } else if (host === 'figma.com') {
            label = 'Figma';
        } else if (host === 'notion.so' || host === 'notion.site') {
            label = 'Notion';
        } else if (host === 'x.com' || host === 'twitter.com') {
            label = 'X';
        } else if (host === 'reddit.com') {
            label = 'Reddit';
        } else if (host === 'stackoverflow.com') {
            label = 'Stack Overflow';
        } else if (host.endsWith('wikipedia.org')) {
            label = 'Wikipedia';
        }

        return `[${label}](${trimmed})`;
    } catch (err) {
        return `[Link](${trimmed})`;
    }
}
