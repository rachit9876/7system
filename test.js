const fs = require('fs');
const content = fs.readFileSync('js/editor.js', 'utf-8');

const startIndex = content.indexOf('const markdownToNodes');
const endIndex = content.indexOf('const copyMarkdownTree');

let funcStr = content.substring(startIndex, endIndex);
funcStr = funcStr.replace('const markdownToNodes', 'global.markdownToNodes');
const state = { nextNodeId: 1 };
eval(funcStr);

const md = `Please review...
- # Double Tap Any Node To Edit
- # Welcome to MapMind<br>A powerful \`markdown\` mind mapping tool
  - ## Advanced Markdown<br>**Bold text** and *italic text*<br>\`code snippets\`<br>~~strikethrough~~
    - ### Links & Images<br>Explicit Link: [Visit GitHub](https://github.com/rachit9876)<br>![Logo](https://dr-fast-upload.pages.dev/public/d99bf38b2c8f.webp)
`;

console.log(JSON.stringify(global.markdownToNodes(md, 0, 0), null, 2));
