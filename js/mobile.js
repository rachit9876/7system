        import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";



        let sessionAuth = null;
        
        const escapeHtml = (text) => {
            if (!text) return '';
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#039;');
        };
        
        const loginOverlay = document.getElementById('loginOverlay');
        const feedContainer = document.getElementById('feedContainer');
        const logoutBtn = document.getElementById('logoutBtn');
        const portalBtn = document.getElementById('portalBtn');
        const feedLoader = document.getElementById('feedLoader');

        // Theme Toggle Logic
        const themeToggleBtn = document.getElementById('themeToggleBtn');
        const iconLight = document.getElementById('icon-light');
        const iconDark = document.getElementById('icon-dark');
        
        const updateThemeIcon = (isDark) => {
            if (isDark) {
                iconLight.classList.add('hidden');
                iconDark.classList.remove('hidden');
            } else {
                iconLight.classList.remove('hidden');
                iconDark.classList.add('hidden');
            }
        };

        const savedTheme = localStorage.getItem('mindmap-theme') || 'light';
        if (savedTheme === 'dark') {
            document.documentElement.classList.add('dark');
            updateThemeIcon(true);
        } else {
            updateThemeIcon(false);
        }

        themeToggleBtn.addEventListener('click', () => {
            document.documentElement.classList.toggle('dark');
            const isDark = document.documentElement.classList.contains('dark');
            localStorage.setItem('mindmap-theme', isDark ? 'dark' : 'light');
            updateThemeIcon(isDark);
            
            // Re-render mermaid diagrams with new theme
            mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default' });
            document.querySelectorAll('.mermaid-code').forEach(async (el) => {
                try {
                    const { svg } = await mermaid.render('mermaid-' + Math.random().toString(36).substring(2, 11), el.textContent);
                    const wrapper = el.parentElement;
                    wrapper.innerHTML = svg;
                    wrapper.appendChild(el);
                } catch(e) {}
            });
        });

        const checkAuth = () => {
            try {
                const storedAuth = localStorage.getItem('7systemSessionAuth');
                if (storedAuth) {
                    const parsed = JSON.parse(storedAuth);
                    sessionAuth = { username: parsed.username };
                }
            } catch(e) {}
        };
        
        // Wait for Firebase to initialize
        let authRetries = 0;
        const waitForAuth = setInterval(() => {
            if (window.firebaseAuth) {
                clearInterval(waitForAuth);
                const urlParams = new URLSearchParams(window.location.search);
                const isPublicView = urlParams.get('u') && urlParams.get('m');

                onAuthStateChanged(window.firebaseAuth, (user) => {
                    if (user) {
                        sessionAuth = { username: user.email };
                        // Don't interfere with public viewer mode
                        if (isPublicView) return;
                        loginOverlay.classList.add('hidden');
                        feedContainer.classList.remove('hidden');
                        logoutBtn.classList.remove('hidden');
                        portalBtn.classList.remove('hidden');
                        loadFeed();
                    } else {
                        sessionAuth = null;
                        if (!isPublicView) {
                            feedContainer.innerHTML = '<div id="feedLoader" class="loader"></div>';
                            feedContainer.classList.add('hidden');
                            loginOverlay.classList.remove('hidden');
                            logoutBtn.classList.add('hidden');
                            portalBtn.classList.add('hidden');
                        }
                    }
                });
            } else if (++authRetries > 200) {
                clearInterval(waitForAuth);
            }
        }, 50);

        document.getElementById('loginSubmitBtn').addEventListener('click', async () => {
            const u = document.getElementById('usernameInput').value;
            const p = document.getElementById('passwordInput').value;
            if (!u || !p) return;
            
            const btn = document.getElementById('loginSubmitBtn');
            btn.textContent = 'Authenticating...';
            btn.disabled = true;

            if (!window.firebaseUtils) {
                const err = document.getElementById('loginError');
                err.textContent = 'Service unavailable';
                err.classList.remove('hidden');
                btn.textContent = 'Login / Register';
                btn.disabled = false;
                return;
            }
            const result = await window.firebaseUtils.loginRegister(u, p);
            
            btn.textContent = 'Login / Register';
            btn.disabled = false;

            if (result.success) {
                sessionAuth = { username: u };
                localStorage.setItem('7systemSessionAuth', JSON.stringify(sessionAuth));
                // UI updates handled by onAuthStateChanged
            } else {
                const err = document.getElementById('loginError');
                err.textContent = result.message;
                err.classList.remove('hidden');
            }
        });

        logoutBtn.addEventListener('click', async () => {
            if (window.firebaseAuth) {
                const { signOut } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js");
                await signOut(window.firebaseAuth);
            }
            localStorage.removeItem('7systemSessionAuth');
            sessionAuth = null;
        });

        // Config marked.js to intercept mermaid blocks
        // Config marked.js to intercept mermaid blocks and github alerts
        const renderer = new marked.Renderer();
        renderer.code = function(token) {
            const text = token.text;
            const lang = token.lang;
            if (lang === 'mermaid') {
                return `<div class="mermaid"><span class="mermaid-code hidden">${text}</span>Rendering diagram...</div>`;
            }
            return `<pre><code>${text}</code></pre>`;
        };

        renderer.blockquote = function(token) {
            let body = '';
            if (token.tokens && this.parser) {
                body = this.parser.parse(token.tokens);
            } else {
                body = token.text || token;
            }
            
            const match = body.match(/^(?:<p>)?\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](?:<\/p>\n<p>|<br>|\n)?([\s\S]*?)(?:<\/p>)?$/i);
            if (match) {
                const type = match[1].toLowerCase();
                let content = match[2].trim();
                // If content doesn't start with a block element, wrap it in p
                if (content && !content.startsWith('<')) {
                    content = `<p>${content}</p>`;
                }
                return `<div class="gh-alert gh-alert-${type}"><div class="gh-alert-title">${match[1].toUpperCase()}</div><div class="gh-alert-content">${content}</div></div>\n`;
            }
            return `<blockquote>\n${body}\n</blockquote>\n`;
        };
        marked.use({ renderer });

        const loadFeed = async () => {
            feedLoader.style.display = 'block';
            
            if (!window.firebaseUtils) {
                feedContainer.innerHTML = `<p class="text-center mt-10 text-red-500">Service unavailable.</p>`;
                return;
            }
            const listResult = await window.firebaseUtils.getMindMapsList(sessionAuth.username, null);
            
            if (!listResult.success) {
                feedContainer.innerHTML = `<p class="text-center mt-10 text-red-500">Failed to load feed.</p>`;
                return;
            }

            if (!listResult.mindmaps || listResult.mindmaps.length === 0) {
                feedContainer.innerHTML = `<p class="text-center mt-10 text-[var(--text-secondary)]">You don't have any mind maps yet. Go to desktop to create some!</p>`;
                return;
            }

            feedLoader.style.display = 'none';

            // Just render the shells to save bandwidth
            for (const mapInfo of listResult.mindmaps) {
                renderCardShell(mapInfo);
            }
        };

        const renderCardShell = (mapInfo) => {
            const card = document.createElement('div');
            card.className = 'card';
            

            const safeName = escapeHtml(mapInfo.name);

            const header = document.createElement('div');
            header.className = 'card-header cursor-pointer hover:bg-[var(--surface-muted)] transition-colors select-none';
            header.innerHTML = `
                <div class="flex items-center gap-3">
                    <svg class="w-4 h-4 transform transition-transform duration-200 chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
                    <h3 class="font-bold text-lg text-[var(--text-primary)]">${safeName}</h3>
                </div>
                <span class="text-sm text-[var(--text-secondary)]">${mapInfo.timestamp ? new Date(mapInfo.timestamp).toLocaleDateString() : 'Unknown'}</span>
            `;

            const body = document.createElement('div');
            body.className = 'card-body hidden';
            
            let isLoaded = false;
            let isLoading = false;

            header.addEventListener('click', async () => {
                const chevron = header.querySelector('.chevron');
                const isHidden = body.classList.contains('hidden');
                
                if (isHidden) {
                    body.classList.remove('hidden');
                    chevron.classList.add('rotate-90');
                    
                    if (!isLoaded && !isLoading) {
                        isLoading = true;
                        body.innerHTML = '<div class="loader !my-4 w-6 h-6 border-2"></div>';
                        if (!window.firebaseUtils) {
                            body.innerHTML = '<p class="text-red-500 text-center">Service unavailable.</p>';
                            isLoading = false;
                            return;
                        }
                        const mapResult = await window.firebaseUtils.loadMindMap(sessionAuth.username, null, mapInfo.name, mapInfo.key);
                        if (mapResult.success && mapResult.data && mapResult.data.nodes) {
                            renderNodes(body, mapResult.data.nodes);
                            isLoaded = true;
                        } else {
                            body.innerHTML = '<p class="text-red-500 text-center">Failed to load content.</p>';
                        }
                        isLoading = false;
                    }
                } else {
                    body.classList.add('hidden');
                    chevron.classList.remove('rotate-90');
                }
            });

            card.appendChild(header);
            card.appendChild(body);
            feedContainer.appendChild(card);
        };
        
        const renderNodes = (container, nodes) => {
            let nodesHtml = '';
            
            nodes.forEach(node => {
                if (!node.text) return;
                const dirtyHtml = marked.parse(node.text);
                const cleanHtml = DOMPurify.sanitize(dirtyHtml, { ADD_ATTR: ['target'] });
                nodesHtml += `<div class="node-content">${cleanHtml}</div>`;
            });
            
            container.innerHTML = nodesHtml;
            
            const isDark = document.documentElement.classList.contains('dark');
            mermaid.initialize({ startOnLoad: false, theme: isDark ? 'dark' : 'default' });
            
            container.querySelectorAll('.mermaid-code').forEach(async (el) => {
                try {
                    const id = 'mermaid-' + Math.random().toString(36).substr(2, 9);
                    const { svg } = await mermaid.render(id, el.textContent);
                    el.parentElement.innerHTML = svg;
                } catch(e) {
                    el.parentElement.innerHTML = '<span class="text-red-500">Diagram Error</span>';
                }
            });
        };

        const init = async () => {
            const urlParams = new URLSearchParams(window.location.search);
            const pubUsername = urlParams.get('u');
            const pubMapName = urlParams.get('m');

            if (pubUsername && pubMapName) {
                // Public Viewer Mode
                loginOverlay.classList.add('hidden');
                feedContainer.classList.remove('hidden');
                logoutBtn.classList.add('hidden');
                portalBtn.classList.add('hidden');
                
                feedLoader.style.display = 'block';
                if (!window.firebaseUtils) {
                    feedContainer.innerHTML = `<p class="text-center mt-10 text-red-500">Service unavailable.</p>`;
                    return;
                }
                const mapResult = await window.firebaseUtils.loadPublicMindMap(pubUsername, pubMapName);
                feedLoader.style.display = 'none';

                if (mapResult.success && mapResult.data && mapResult.data.nodes) {
                    const card = document.createElement('div');
                    card.className = 'card';
                    

                    const safeName = escapeHtml(pubMapName);
                    
                    const header = document.createElement('div');
                    header.className = 'card-header';
                    header.innerHTML = `
                        <div class="flex items-center gap-3">
                            <h3 class="font-bold text-lg text-[var(--text-primary)]">${safeName}</h3>
                        </div>
                        <span class="text-xs bg-[var(--accent-soft)] text-[var(--accent)] px-2 py-1 rounded-full font-medium">Public View</span>
                    `;

                    const body = document.createElement('div');
                    body.className = 'card-body';
                    renderNodes(body, mapResult.data.nodes);
                    
                    card.appendChild(header);
                    card.appendChild(body);
                    feedContainer.appendChild(card);
                } else {
                    feedContainer.innerHTML = `<p class="text-center mt-10 text-red-500">${mapResult.message || 'Failed to load public map'}</p>`;
                }
            } else {
                // Normal Authenticated Mode
                checkAuth();
            }
        };

        init();
