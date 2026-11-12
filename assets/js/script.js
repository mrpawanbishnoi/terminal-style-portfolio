document.addEventListener('DOMContentLoaded', () => {

        // --- CORE DevOS MODULE ---
        const DevOS = {
            init() {
                this.desktop = document.getElementById('desktop');
                this.taskbar = document.getElementById('taskbar');
                this.clock = document.getElementById('clock');
                this.themeManager.init();
                this.windowManager.init();
                this.apps.init();
                this.startClock();
                this.apps.launch('terminal'); // Auto-launch terminal
            },

            startClock() {
                const update = () => this.clock.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                setInterval(update, 1000);
                update();
            }
        };

        // --- THEME MANAGER ---
        DevOS.themeManager = {
            init() {
                this.themes = ['dark', 'light', 'matrix'];
                const savedTheme = localStorage.getItem('devos-theme') || 'dark';
                this.setTheme(savedTheme);
            },
            setTheme(themeName) {
                if (!this.themes.includes(themeName)) return false;
                document.documentElement.className = `theme-${themeName}`;
                localStorage.setItem('devos-theme', themeName);
                return true;
            }
        };

        // --- WINDOW MANAGER ---
        DevOS.windowManager = {
            init() {
                this.openWindows = {};
                this.zIndexCounter = 100;
                DevOS.taskbar.addEventListener('click', e => {
                    const icon = e.target.closest('.dock-icon');
                    if (icon) DevOS.apps.launch(icon.dataset.appId);
                });
            },

            createWindow(appId, title, content, options = {}) {
                // If window exists, focus or restore it instead of creating a new one
                if (this.openWindows[appId]) {
                    const win = this.openWindows[appId];
                    if (win.isMinimized) {
                        win.restore();
                    } else {
                        win.focus();
                    }
                    return;
                }

                const template = document.getElementById('window-template');
                const winEl = template.content.cloneNode(true).querySelector('.window');
                
                // Default options
                let { width = 600, height = 400, top = 100, left = 150 } = options;
                
                // Responsive window creation for mobile
                if (window.innerWidth <= 768) {
                    width = window.innerWidth - 20;
                    height = window.innerHeight - 90; // Space for taskbar and top margin
                    top = 10;
                    left = 10;
                } else {
                    // Add random offset for new windows on desktop
                    const randomOffsetX = Math.floor(Math.random() * 60 - 30);
                    const randomOffsetY = Math.floor(Math.random() * 60 - 30);
                    top += (Object.keys(this.openWindows).length * 20) + randomOffsetY;
                    left += (Object.keys(this.openWindows).length * 20) + randomOffsetX;
                }


                winEl.style.cssText = `width:${width}px; height:${height}px; top:${top}px; left:${left}px;`;
                winEl.querySelector('.window-title').textContent = title;
                winEl.querySelector('.window-body').innerHTML = content;

                DevOS.desktop.appendChild(winEl);
                const windowInstance = new this.Window(appId, winEl);
                this.openWindows[appId] = windowInstance;
                return windowInstance;
            },

            Window: class {
                constructor(appId, element) {
                    this.appId = appId;
                    this.element = element;
                    this.header = element.querySelector('.window-header');
                    this.isMaximized = false;
                    this.isMinimized = false;
                    this.originalState = {};
                    this.focus();
                    this.addEventListeners();
                    this.updateDockIcon(true);
                }

                addEventListeners() {
                    this.header.addEventListener('mousedown', e => this.startDrag(e));
                    this.element.addEventListener('mousedown', () => this.focus());
                    this.element.querySelector('.close-btn').addEventListener('click', () => this.close());
                    this.element.querySelector('.maximize-btn').addEventListener('click', () => this.toggleMaximize());
                    this.element.querySelector('.minimize-btn').addEventListener('click', () => this.minimize());
                    this.header.addEventListener('dblclick', () => this.toggleMaximize());
                }

                startDrag(e) {
                    if (this.isMaximized || e.target.classList.contains('control-btn')) return;
                    this.focus();
                    let offset = { x: e.clientX - this.element.offsetLeft, y: e.clientY - this.element.offsetTop };
                    const onMouseMove = (moveEvent) => {
                        this.element.style.left = `${moveEvent.clientX - offset.x}px`;
                        this.element.style.top = `${moveEvent.clientY - offset.y}px`;
                    };
                    const onMouseUp = () => {
                        document.removeEventListener('mousemove', onMouseMove);
                        document.removeEventListener('mouseup', onMouseUp);
                    };
                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                }

                toggleMaximize() {
                    if (this.isMaximized) {
                        this.element.style.width = this.originalState.width;
                        this.element.style.height = this.originalState.height;
                        this.element.style.top = this.originalState.top;
                        this.element.style.left = this.originalState.left;
                        if (window.innerWidth > 768) this.element.style.resize = 'both';
                        this.isMaximized = false;
                    } else {
                        this.originalState = {
                            width: this.element.style.width,
                            height: this.element.style.height,
                            top: this.element.style.top,
                            left: this.element.style.left
                        };
                        this.element.style.width = 'calc(100vw - 4px)';
                        this.element.style.height = `calc(100vh - ${document.getElementById('taskbar').offsetHeight + 10}px - 4px)`;
                        this.element.style.top = '2px';
                        this.element.style.left = '2px';
                        this.element.style.resize = 'none';
                        this.isMaximized = true;
                    }
                }

                minimize() {
                    this.isMinimized = true;
                    this.element.style.display = 'none';
                }

                restore() {
                    this.isMinimized = false;
                    this.element.style.display = 'flex';
                    this.focus();
                }
                
                focus() {
                    if (this.isMinimized) return;
                    DevOS.windowManager.zIndexCounter++;
                    this.element.style.zIndex = DevOS.windowManager.zIndexCounter;
                }

                close() {
                    this.element.remove();
                    delete DevOS.windowManager.openWindows[this.appId];
                    this.updateDockIcon(false);
                }

                updateDockIcon(isActive) {
                    const icon = DevOS.taskbar.querySelector(`.dock-icon[data-app-id="${this.appId}"]`);
                    if (icon) icon.classList.toggle('active', isActive);
                }
            }
        };

        // --- VIRTUAL FILE SYSTEM & APPS ---
        DevOS.apps = {
            init() {
                // File system for the terminal
                this.fs = {
                    '/': ['home', 'projects', 'about.txt'],
                    '/home': [],
                    '/projects': ['work.txt']
                };
                this.files = {
                    '/about.txt': `\n Hello! I'm a creative developer and problem solver.\nThis portfolio is a testament to my love for building unique, interactive web experiences.\n\

`,
                   
                    '/projects/work.txt': `Title: Untitled\n <a target="_blank" href="https://example.com">link</a>`
                    

                };
            },

            launch(appId) {
                const app = this.definitions[appId];
                if (!app) return;
                const win = DevOS.windowManager.createWindow(appId, app.title, app.content, app.options);
                if (app.onOpen && win) {
                    setTimeout(() => app.onOpen(win), 50); // Timeout ensures the element is fully in the DOM
                }
            },

            definitions: {
                terminal: {
                    title: 'Terminal',
                    content: `<div class="terminal-body"></div>`,
                    options: { width: 700, height: 450 },
                    onOpen(win) { new DevOS.Terminal(win.element.querySelector('.terminal-body')); }
                },
                projects: {
                    title: 'Projects',
                    content: `<div class="app-grid">

                        <a href="https://example.com" target="_blank"><div class="app-icon" data-file-path="/projects/portfolio.txt"><i class="fas fa-briefcase" style="color:#e74c3c;"></i><span>example</span></div></a>
                        
                        
                    </div>`,
                    onOpen(win) {
                        win.element.querySelectorAll('.app-icon').forEach(icon => {
                            icon.addEventListener('dblclick', () => {
                                const path = icon.dataset.filePath;
                                const content = DevOS.apps.files[path].replace(/\n/g, '<br>');
                                const fileName = path.split('/').pop();
                                DevOS.apps.launch('viewer_' + path, fileName, `<pre style="white-space: pre-wrap; word-wrap: break-word;">${content}</pre>`, {width: 500, height: 350});
                            });
                        });
                    }
                },
                socials: {
                    title: 'Socials',
                    content: `<div class="app-grid">
                        <a href="https://github.com/" target="_blank" class="app-icon"><i class="fab fa-github"></i><span>GitHub</span></a>
                        <a href="https://linkedin.com/" target="_blank" class="app-icon"><i class="fab fa-linkedin"></i><span>LinkedIn</span></a>
                        <a href="https://twitter.com/" class="app-icon"><i class="fab fa-twitter"></i><span>Twitter</span></a>

                    </div>`
                },
                chat: {
                    title: 'Chat',
                    content: `
                        <div class="chat-body-wrapper">
                            <div class="message-area">
                                <div class="message bot">This is a fake chatbot.</div>
                            </div>
                            <div class="chat-input-area">
                                <input type="text" class="chat-input" placeholder="Type your message...">
                                <button class="send-btn"><i class="fas fa-paper-plane"></i></button>
                            </div>
                        </div>
                    `,
                    options: { width: 400, height: 550 },
                    onOpen(win) {
                        const chatBody = win.element.querySelector('.chat-body-wrapper');
                        const messageArea = chatBody.querySelector('.message-area');
                        const input = chatBody.querySelector('.chat-input');
                        const sendBtn = chatBody.querySelector('.send-btn');

                        const sendMessage = () => {
                            const text = input.value.trim();
                            if (text === '') return;

                            const userMsg = document.createElement('div');
                            userMsg.className = 'message user';
                            userMsg.textContent = text;
                            messageArea.appendChild(userMsg);
                            input.value = '';
                            messageArea.scrollTop = messageArea.scrollHeight;

                            setTimeout(() => {
                                const botMsg = document.createElement('div');
                                botMsg.className = 'message bot';
                                botMsg.textContent = "I forwarded your message to Pawan. he'll get back to you soon.";
                                messageArea.appendChild(botMsg);
                                messageArea.scrollTop = messageArea.scrollHeight;
                            }, 1000);
                        };

                        sendBtn.addEventListener('click', sendMessage);
                        input.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter') sendMessage();
                        });
                    }
                },
                mindmap: {
                    title: 'Skills Mindmap',
                    content: `<div class="mindmap-body"><canvas class="mindmap-canvas"></canvas></div>`,
                    options: { width: 700, height: 500 },
                    onOpen(win) {
                        const canvas = win.element.querySelector('.mindmap-canvas');
                        if (!canvas) return;
                        const ctx = canvas.getContext('2d');
                        const computedStyle = getComputedStyle(document.documentElement);
                        let nodes = [];
                        const skills = {
                            'Frontend': ['JavaScript', 'React', 'CSS', 'HTML', 'Flutter'],
                            'Backend': ['Node.js', 'Python', 'Express.js', ],
                            'Tools': ['Git', 'CI/CD', 'Postman', 'Docker']
                        };
                        
                        function initSkills() {
                            const parent = canvas.parentElement;
                            if (!parent) return;
                            canvas.width = parent.offsetWidth;
                            canvas.height = parent.offsetHeight;

                            nodes = []; // Clear nodes
                            const centerX = canvas.width / 2;
                            const centerY = canvas.height / 2;
                            
                            const mainRadius = Math.min(canvas.width, canvas.height) * 0.3;
                            const skillRadius = mainRadius * 0.5;

                            nodes.push({ x: centerX, y: centerY, text: 'Skills', isCenter: true, radius: 8 });

                            Object.keys(skills).forEach((category, i) => {
                                const angle = (i / Object.keys(skills).length) * 2 * Math.PI;
                                const x = centerX + Math.cos(angle) * mainRadius;
                                const y = centerY + Math.sin(angle) * mainRadius;
                                nodes.push({ x, y, text: category, isCategory: true, radius: 6 });

                                skills[category].forEach((skill, j) => {
                                    const skillAngle = (j / skills[category].length) * 2 * Math.PI + Math.random();
                                    const sx = x + Math.cos(skillAngle) * skillRadius;
                                    const sy = y + Math.sin(skillAngle) * skillRadius;
                                    nodes.push({ x: sx, y: sy, text: skill, radius: 4 });
                                });
                            });
                        }
                        
                        let animationFrameId;
                        function animate() {
                            if (!ctx || !canvas.isConnected) {
                                cancelAnimationFrame(animationFrameId);
                                return;
                            }
                            
                            const primaryColor = computedStyle.getPropertyValue('--primary-color').trim();
                            const secondaryColor = computedStyle.getPropertyValue('--secondary-color').trim();
                            const textColor = computedStyle.getPropertyValue('--text-color').trim();

                            ctx.clearRect(0, 0, canvas.width, canvas.height);
                            
                            ctx.strokeStyle = 'rgba(150, 150, 150, 0.2)';
                            ctx.beginPath();
                            const centerNode = nodes.find(n => n.isCenter);
                            nodes.filter(n => n.isCategory).forEach(catNode => {
                                ctx.moveTo(centerNode.x, centerNode.y);
                                ctx.lineTo(catNode.x, catNode.y);
                                
                                const categorySkills = skills[catNode.text] || [];
                                nodes.filter(n => categorySkills.includes(n.text)).forEach(skillNode => {
                                    ctx.moveTo(catNode.x, catNode.y);
                                    ctx.lineTo(skillNode.x, skillNode.y);
                                });
                            });
                            ctx.stroke();

                            nodes.forEach(node => {
                                ctx.beginPath();
                                ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
                                ctx.fillStyle = node.isCenter ? primaryColor : (node.isCategory ? secondaryColor : '#555');
                                ctx.fill();
                                ctx.fillStyle = textColor;
                                ctx.font = node.isCenter ? 'bold 16px Inter' : (node.isCategory ? '14px Inter' : '12px Inter');
                                ctx.textAlign = 'left';
                                ctx.textBaseline = 'middle';
                                ctx.fillText(node.text, node.x + node.radius + 5, node.y);
                            });

                            animationFrameId = requestAnimationFrame(animate);
                        }
                        
                        initSkills();
                        animate();

                        const resizeObserver = new ResizeObserver(() => {
                           initSkills();
                        });
                        resizeObserver.observe(win.element);
                        win.element.querySelector('.close-btn').addEventListener('click', () => {
                           resizeObserver.disconnect();
                           cancelAnimationFrame(animationFrameId);
                        });
                    }
                }
            }
        };

        // --- TERMINAL CLASS ---
        DevOS.Terminal = class {
            constructor(element) {
                this.element = element;
                this.cwd = '/';
                this.history = [];
                this.historyIndex = -1;
                this.init();
            }

            init() {
                this.writeOutput('Hello, Friend.');
                this.writeOutput('Type `help` for a list of commands. ');

                
                this.createInputLine();
                this.element.addEventListener('click', () => this.input.focus());
            }

            createInputLine() {
                const line = document.createElement('div');
                line.className = 'terminal-input-line';
                line.innerHTML = `<span class="prompt">guest@OS:${this.cwd}$</span><input type="text" class="terminal-input">`;
                this.element.appendChild(line);
                this.input = line.querySelector('input');
                this.input.focus();
                this.input.addEventListener('keydown', e => this.handleInput(e));
                this.element.scrollTop = this.element.scrollHeight;
            }

            handleInput(e) {
                if (e.key === 'Enter') {
                    const command = this.input.value.trim();
                    this.input.parentElement.remove();
                    if (command) {
                        this.history.unshift(command);
                        this.historyIndex = -1;
                        this.writeLine(`<div class="terminal-input-line"><span class="prompt">guest@DevOS:${this.cwd}$</span><span>${command}</span></div>`);
                        this.execute(command);
                    } else {
                       this.createInputLine();
                    }
                } else if (e.key === 'ArrowUp') {
                    if (this.historyIndex < this.history.length - 1) {
                        this.historyIndex++;
                        this.input.value = this.history[this.historyIndex];
                    }
                } else if (e.key === 'ArrowDown') {
                    if (this.historyIndex > 0) {
                        this.historyIndex--;
                        this.input.value = this.history[this.historyIndex];
                    } else {
                        this.historyIndex = -1;
                        this.input.value = '';
                    }
                }
            }

            execute(commandStr) {
                const [command, ...args] = commandStr.split(' ');
                const func = this.commands[command];
                if (func) {
                    func.call(this, args);
                } else {
                    this.writeOutput(`Command not found: ${command}`, 'error');
                }
                // *** FIX: Always create a new input line after a command is executed. ***
                this.createInputLine();
            }

            writeOutput(text, className = 'output') {
                this.writeLine(`<span class="${className}">${text.replace(/\n/g, '<br>')}</span>`);
            }
            
            writeLine(html) {
                const line = document.createElement('div');
                line.className = 'terminal-line';
                line.innerHTML = html;
                this.element.appendChild(line);
            }

            commands = {
                help: () => this.writeOutput(`Available commands:\n- help: Show this message\n- ls: List files and directories\n- cd [dir]: Change directory\n- cat [file]: View file content\n- theme [dark|light|matrix]: Change theme\n- open [app]: Launch an application (e.g., open projects)\n- clear: Clear the terminal`),
                clear: () => {
                    this.element.innerHTML = '';
                },
                ls: () => {
                    const items = DevOS.apps.fs[this.cwd] || [];
                    this.writeOutput(items.join('\t'));
                },
                cd: (args) => {
                    const dir = args[0];
                    if (!dir) return;
                    let newPath;
                    if (dir === '..') {
                        newPath = this.cwd.substring(0, this.cwd.lastIndexOf('/')) || '/';
                    } else {
                        const targetDir = (this.cwd === '/' ? '' : this.cwd) + '/' + dir;
                        newPath = Object.keys(DevOS.apps.fs).find(p => p === targetDir);
                    }
                    if (newPath !== undefined) {
                        this.cwd = newPath;
                    } else {
                        this.writeOutput(`Directory not found: ${dir}`, 'error');
                    }
                },
                cat: (args) => {
                    const file = args[0];
                    if (!file) return;
                    const path = (this.cwd === '/' ? '' : this.cwd) + '/' + file;
                    if (DevOS.apps.files[path]) {
                        this.writeOutput(DevOS.apps.files[path]);
                    } else {
                        this.writeOutput(`File not found: ${file}`, 'error');
                    }
                },
                theme: (args) => {
                    const themeName = args[0];
                    if (DevOS.themeManager.setTheme(themeName)) {
                        this.writeOutput(`Theme changed to ${themeName}`);
                    } else {
                        this.writeOutput(`Invalid theme. Available: dark, light, matrix`, 'error');
                    }
                },
                open: (args) => {
                    const appId = args[0];
                    if (DevOS.apps.definitions[appId]) {
                        DevOS.apps.launch(appId);
                        this.writeOutput(`Launching ${appId}...`);
                    } else {
                         this.writeOutput(`App not found: ${appId}. Try: terminal, projects, mindmap, chat, socials`, 'error');
                    }
                }
            };
        };

        // --- START DevOS ---
        DevOS.init();
    });