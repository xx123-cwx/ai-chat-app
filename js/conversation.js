// =================================================================
// --- Conversation Page ---
// =================================================================
(function (App) {

    let clockSyncTimer = null;
    let isEditing = false;

    async function getConversationMessages(personaId) {
        const conv = await db.getFromStore('conversations', personaId);
        return conv ? conv.messages : [];
    }
    async function saveConversationMessage(personaId, message) {
        let conv = await db.getFromStore('conversations', personaId);
        if (!conv) conv = { personaId: personaId, messages: [] };
        conv.messages.push(message);
        await db.put('conversations', conv);
    }
    async function deleteConversationMessage(personaId, messageId) {
        let conv = await db.getFromStore('conversations', personaId);
        if (conv && conv.messages) {
            conv.messages = conv.messages.filter(m => m.id !== messageId);
            await db.put('conversations', conv);
        }
    }

    async function updateConversationMessage(personaId, messageId, updates) {
        let conv = await db.getFromStore('conversations', personaId);
        if (conv && conv.messages) {
            const msgIndex = conv.messages.findIndex(m => m.id === messageId);
            if (msgIndex !== -1) {
                conv.messages[msgIndex] = { ...conv.messages[msgIndex], ...updates };
                await db.put('conversations', conv);
            }
        }
    }

    // Expose getConversationMessages for chat list
    App.getConversationMessages = getConversationMessages;

    function renderMessage(message, persona) {
        const messagesContainer = document.getElementById('conv-messages-area');
        const msgEl = document.createElement('div');

        if (message.retracted) {
            msgEl.className = 'conv-retracted-msg';
            msgEl.dataset.id = message.id;
            const who = message.role === 'user' ? '您' : persona.name;
            msgEl.textContent = `${who} 撤回了一条消息`;
            messagesContainer.appendChild(msgEl);
            return msgEl;
        }

        msgEl.className = `conv-msg-item ${message.role === 'user' ? 'user' : 'ai'}`;
        msgEl.dataset.id = message.id;

        const avatarHtml = message.role === 'user'
            ? `<div class="conv-msg-avatar-user">${App.getUserBubbleAvatarHtml()}</div>`
            : (persona.avatar ? `<img src="${persona.avatar}" alt="${persona.name}">` : App.getPersonaLetterAvatar(persona.name));

        const quoteHtml = message.quote ? `<div class="conv-msg-quote"><div class="conv-msg-quote-sender">${message.quote.senderName}</div><div class="conv-msg-quote-text">${message.quote.text.replace(/</g, "<").replace(/>/g, ">").replace(/\n/g, '<br>')}</div></div>` : '';

        let textHtml = message.text.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, '<br>');
        if (message.isSending) textHtml = '<span class="conv-typing-dot"></span><span class="conv-typing-dot"></span><span class="conv-typing-dot"></span>';
        if (message.error) textHtml = `<span style="color:red;font-style:italic;">${message.error}</span>`;

        msgEl.innerHTML = `
            <div class="conv-msg-avatar">${avatarHtml}</div>
            <div class="conv-msg-content">
                ${quoteHtml}
                <div class="conv-msg-bubble">${textHtml}</div>
            </div>`;

        // Apply custom bubble CSS
        if (message.role === 'user' && App.state.currentConvBubbleCssUser) {
            const bubble = msgEl.querySelector('.conv-msg-bubble');
            if (bubble) bubble.style.cssText = App.state.currentConvBubbleCssUser;
        } else if (message.role === 'ai' && App.state.currentConvBubbleCssAi) {
            const bubble = msgEl.querySelector('.conv-msg-bubble');
            if (bubble) bubble.style.cssText = App.state.currentConvBubbleCssAi;
        }

        // Add context menu on long press and selection on click
        const bubble = msgEl.querySelector('.conv-msg-bubble');
        if (bubble) {
            let pressTimer = null;
            let isLongPress = false;

            const startPress = (e) => {
                if (isEditing) return;
                isLongPress = false;
                pressTimer = setTimeout(() => {
                    isLongPress = true;
                    if (!App.state.isMultiSelectMode) {
                         e.preventDefault();
                         showContextMenu(e, message, persona);
                    }
                }, 500);
            };

            const endPress = (e) => {
                clearTimeout(pressTimer);
                if (!isLongPress) {
                    if (App.state.isMultiSelectMode) {
                        e.stopPropagation();
                        toggleMessageSelection(message.id, msgEl);
                    }
                }
            };

            bubble.addEventListener('contextmenu', e => {
                e.preventDefault();
                showContextMenu(e, message, persona);
            });
            bubble.addEventListener("mousedown", startPress);
            bubble.addEventListener("mouseup", endPress);
            bubble.addEventListener("mouseleave", () => clearTimeout(pressTimer));
            bubble.addEventListener("touchstart", startPress, { passive: true });
            bubble.addEventListener("touchend", endPress);
            bubble.addEventListener("touchmove", () => clearTimeout(pressTimer));
        }

        messagesContainer.appendChild(msgEl);
        return msgEl;
    }

    function showContextMenu(event, message, persona) {
        event.preventDefault();
        event.stopPropagation();
        closeContextMenu();

        const messageInput = document.getElementById('conv-text-input');
        const bubble = event.currentTarget;
        const screen = document.querySelector('.screen');

        const menu = document.createElement('div');
        menu.className = 'message-context-menu';
        menu.style.display = 'flex';

        const isUser = message.role === 'user';
        const options = [
            { label: '引用', action: () => {
                if (message.retracted) return;
                App.state.currentQuote = { senderName: isUser ? ((App.state.cachedUserProfile || {}).nickname || '我') : persona.name, text: message.text, messageId: message.id };
                const quoteBar = document.getElementById('conv-quote-bar');
                const quoteText = App.state.currentQuote.text.length > 30 ? App.state.currentQuote.text.substring(0, 30) + '...' : App.state.currentQuote.text;
                quoteBar.querySelector('p').textContent = `引用 ${App.state.currentQuote.senderName}: ${quoteText}`;
                quoteBar.style.display = 'flex';
                messageInput.focus();
            }},
            { label: '多选', action: () => enterMultiSelectMode(message.id) },
            { label: '编辑', action: () => enterEditMode(message, persona, bubble.closest('.conv-msg-item')) },
            { label: '撤回', action: async () => {
                await updateConversationMessage(persona.id, message.id, { retracted: true, text: '' });
                const oldMsgEl = document.querySelector(`.conv-msg-item[data-id='${message.id}']`);
                if (oldMsgEl) {
                    const newMsgEl = renderMessage({ ...message, retracted: true }, persona);
                    oldMsgEl.replaceWith(newMsgEl);
                }
             }},
        ];

        // Asynchronously determine which buttons to show and then render the menu
        (async () => {
            // Determine if "重回" should be an option
            const allMessages = await getConversationMessages(persona.id);
            let isLastTurn = false;
            if (message.role === 'ai') {
                for (let i = allMessages.length - 1; i >= 0; i--) {
                    const msg = allMessages[i];
                    if (msg.id === message.id) {
                        isLastTurn = true;
                        break;
                    }
                    if (msg.role === 'user') {
                        break;
                    }
                }
            }

            // Add "删除" option
            options.push({
                label: '删除', action: async () => {
                    if (confirm('确定删除这条消息吗?')) {
                        await deleteConversationMessage(persona.id, message.id);
                        const msgEl = document.querySelector(`[data-id='${message.id}']`);
                        if (msgEl) msgEl.remove();
                    }
                }
            });
            
            // Add "重回" option if applicable, after "删除"
            if (isLastTurn) {
                options.push({ label: '重回', action: () => handleRetry() });
            }

            // Now that all options are decided, render them
            options.forEach(opt => {
                const item = document.createElement('div');
                item.className = 'message-context-menu-item';
                item.textContent = opt.label;
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    opt.action();
                    closeContextMenu();
                });
                menu.appendChild(item);
            });

            // The menu must be appended to the screen to be positioned correctly within the phone
            screen.appendChild(menu);

            // --- Positioning Logic ---
            const bubbleRect = bubble.getBoundingClientRect();
            const screenRect = screen.getBoundingClientRect();
            const menuRect = menu.getBoundingClientRect();

            // Position menu horizontally centered above the bubble
            let menuLeft = bubbleRect.left + (bubbleRect.width / 2) - (menuRect.width / 2);

            // Position menu vertically above the bubble
            let menuTop = bubbleRect.top - menuRect.height - 8; // 8px gap

            // Adjust for screen boundaries
            if (menuLeft < screenRect.left) {
                menuLeft = screenRect.left + 5; // 5px padding from edge
            }
            if ((menuLeft + menuRect.width) > screenRect.right) {
                menuLeft = screenRect.right - menuRect.width - 5;
            }
            if (menuTop < screenRect.top) { // If not enough space on top, show below
                menuTop = bubbleRect.bottom + 8;
            }

            // The menu is inside .screen, so positions are relative to .screen
            menu.style.left = `${menuLeft - screenRect.left}px`;
            menu.style.top = `${menuTop - screenRect.top}px`;

            // Add a global click listener to close the menu
            setTimeout(() => {
                document.addEventListener('click', closeContextMenu, { once: true });
            }, 0);
        })();
    }

    function enterEditMode(message, persona, msgEl) {
        if (isEditing || App.state.isMultiSelectMode) return;
        isEditing = true;
        closeContextMenu();

        const bubble = msgEl.querySelector('.conv-msg-bubble');
        const originalContent = bubble.innerHTML;
        const text = message.text;

        bubble.innerHTML = `<textarea class="edit-msg-textarea">${text}</textarea>`;
        const textarea = bubble.querySelector('textarea');
        textarea.style.height = textarea.scrollHeight + 'px';
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
        });
        setTimeout(() => textarea.focus(), 0);

        let editControls = msgEl.querySelector('.edit-controls');
        if (!editControls) {
            editControls = document.createElement('div');
            editControls.className = 'edit-controls';
            msgEl.querySelector('.conv-msg-content').appendChild(editControls);
        }

        editControls.innerHTML = `
            <button class="edit-cancel">取消</button>
            <button class="edit-save">保存</button>
        `;
        editControls.style.display = 'flex';

        editControls.querySelector('.edit-save').addEventListener('click', async () => {
            const newText = textarea.value.trim();
            if (newText && newText !== message.text) {
                await updateConversationMessage(persona.id, message.id, { text: newText, edited: true });
                message.text = newText; // Update local message object
                message.edited = true;
            }
            exitEditMode(msgEl, message);
        });

        editControls.querySelector('.edit-cancel').addEventListener('click', () => {
            exitEditMode(msgEl, message, false); // false = don't save
        });
    }

    function exitEditMode(msgEl, message, shouldSave = true) {
        isEditing = false;
        const bubble = msgEl.querySelector('.conv-msg-bubble');
        const editControls = msgEl.querySelector('.edit-controls');

        if (editControls) editControls.style.display = 'none';
        
        let textHtml = message.text.replace(/</g, "<").replace(/>/g, ">").replace(/\n/g, '<br>');
        bubble.innerHTML = textHtml;
    }

    function closeContextMenu() {
        const menu = document.querySelector('.message-context-menu');
        if (menu) menu.remove();
    }

    function enterMultiSelectMode(initialMessageId) {
        if (App.state.isMultiSelectMode) return;
        App.state.isMultiSelectMode = true;
        closeContextMenu();

        const toolbar = document.getElementById('multi-select-toolbar');
        const inputBar = document.getElementById('conv-input-bar');
        const voiceBar = document.getElementById('voice-record-bar');
        const quoteBar = document.getElementById('conv-quote-bar');

        if (toolbar) toolbar.style.display = 'flex';
        if (inputBar) inputBar.style.display = 'none';
        if (voiceBar) voiceBar.style.display = 'none';
        if (quoteBar) quoteBar.style.display = 'none';
        
        const messagesContainer = document.getElementById('conv-messages-area');
        if(messagesContainer) messagesContainer.classList.add('multi-select-active');


        const msgEl = document.querySelector(`.conv-msg-item[data-id='${initialMessageId}']`);
        if (msgEl) {
            toggleMessageSelection(initialMessageId, msgEl);
        } else {
            updateMultiSelectToolbar();
        }
    }

    function exitMultiSelectMode() {
        App.state.isMultiSelectMode = false;
        App.state.selectedMessages = [];

        const toolbar = document.getElementById('multi-select-toolbar');
        const inputBar = document.getElementById('conv-input-bar');
        
        if (toolbar) toolbar.style.display = 'none';
        if (inputBar) inputBar.style.display = 'flex';
        
        const messagesContainer = document.getElementById('conv-messages-area');
        if(messagesContainer) messagesContainer.classList.remove('multi-select-active');

        document.querySelectorAll('.conv-msg-item.selected').forEach(el => {
            el.classList.remove('selected');
        });
        
        App.state.currentQuote = null;
        document.getElementById('conv-quote-bar').style.display = 'none';
        updateInputButtons();
    }

    function toggleMessageSelection(messageId, msgEl) {
        const index = App.state.selectedMessages.indexOf(String(messageId));
        if (index > -1) {
            App.state.selectedMessages.splice(index, 1);
            msgEl.classList.remove('selected');
        } else {
            App.state.selectedMessages.push(String(messageId));
            msgEl.classList.add('selected');
        }
        updateMultiSelectToolbar();
    }

    function updateMultiSelectToolbar() {
        const count = App.state.selectedMessages.length;
        const title = document.getElementById('multi-select-title');
        const deleteBtn = document.getElementById('multi-select-delete-btn');

        if (title) {
            title.textContent = `已选择 ${count} 条消息`;
        }
        if (deleteBtn) {
            deleteBtn.disabled = count === 0;
        }
    }

    async function handleDeleteSelectedMessages() {
        const personaId = App.state.currentConversationPersona.id;
        const count = App.state.selectedMessages.length;
        if (!personaId || count === 0) return;

        if (confirm(`确定要删除所选的 ${count} 条消息吗?`)) {
            for (const messageId of App.state.selectedMessages) {
                await deleteConversationMessage(personaId, Number(messageId));
                const msgEl = document.querySelector(`.conv-msg-item[data-id='${messageId}']`);
                if (msgEl) msgEl.remove();
            }
            exitMultiSelectMode();
        }
    }

    function applyPersonaSettingsToConv(settings) {
        App.state.currentConvBgDataUrl = settings.background || '';
        const convScroller = document.getElementById('conv-messages-area');
        if (convScroller) {
            if (settings.background) {
                convScroller.style.backgroundImage = `url(${settings.background})`;
                convScroller.style.backgroundSize = 'cover';
                convScroller.style.backgroundPosition = 'center';
            } else {
                convScroller.style.backgroundImage = 'none';
            }
        }
        App.state.currentConvBubbleCssUser = settings.bubbleCssUser || '';
        App.state.currentConvBubbleCssAi = settings.bubbleCssAi || '';
        document.querySelectorAll('.conv-msg-bubble').forEach(bubble => {
            const isUser = bubble.closest('.conv-msg-item.user');
            bubble.style.cssText = isUser ? App.state.currentConvBubbleCssUser : App.state.currentConvBubbleCssAi;
        });
    }

function buildPersonaPrompt(persona, time, history, quote = null) {
    const profile = App.state.cachedUserProfile || {};
    let timePrompt = '';
    if (persona.timeAwareness && time) {
        const hour = time.now.getHours();
        let timeHint = '';
        if (hour >= 5 && hour < 9) timeHint = '现在是清晨，可以问候对方早上好。';
        else if (hour >= 9 && hour < 12) timeHint = '现在是上午。';
        else if (hour >= 12 && hour < 14) timeHint = '现在是午后，可以问对方是否已用过午餐。';
        else if (hour >= 14 && hour < 18) timeHint = '现在是下午。';
        else if (hour >= 18 && hour < 22) timeHint = '现在是晚上，可以聊聊今天过得如何。';
        else timeHint = '现在是深夜，可以提醒对方早点休息。';

        timePrompt = `
【当前时间地点】
当地时间: ${time.fullDateTime}
提示: ${timeHint}
请在对话中自然地融入对时间的感知，例如使用“早上好”、“晚上好”等问候，或者根据时间情境展开话题，而不是机械地播报时间。`;
    }

    const replyCountPrompt = `
【回复格式要求】
1. 你的回复应该包含 ${persona.minReply || 1} 到 ${persona.maxReply || 1} 个独立的句子。
2. **请将每个句子都写在独立的一行，用换行符分隔。** 这是强制要求，用于将每个句子拆分成单独的聊天气泡。`;

    let prompt = `你正在扮演一个角色，你需要完全沉浸其中，而不是作为AI助手。
【你的角色设定】
姓名: ${persona.name}
${persona.uid ? `UID: ${persona.uid}` : ''}
${persona.signature ? `个性签名: ${persona.signature}` : ''}
${persona.height ? `身高: ${persona.height}` : ''} ${persona.weight ? `体重: ${persona.weight}` : ''}
${persona.nationality ? `国籍: ${persona.nationality}` : ''} ${persona.language ? `语言: ${persona.language}` : ''}
${persona.hobbies ? `爱好: ${persona.hobbies}` : ''}
${persona.catchphrase ? `口头禅: ${persona.catchphrase}` : ''}
${persona.info ? `详细人设: ${persona.info}` : ''}
${timePrompt}

${quote ? `【引用内容】
你正在引用 ${quote.senderName} 的消息: "${quote.text}"
请在你的回复开头，对这条消息进行回应，然后再继续你的对话。` : ''}

【对话者信息】
${profile.nickname ? `姓名: ${profile.nickname}` : ''}
${profile.bio ? `简介: ${profile.bio}` : ''}

【对话历史】(最近10条)
${history.map(m => `${m.role === 'user' ? (profile.nickname || '用户') : persona.name}: ${m.text}`).join('\n')}

【任务】
1.  **角色一致性**: 你的回复必须完全符合 **${persona.name}** 的人设、性格、说话方式和价值观。
2.  **自然对话**: 像真人一样自然地进行对话，而不是一个问答机器。
3.  **禁止 OOC**: 绝对禁止(out of character)！不要提及你是AI、模型、程序或虚拟人物。
${replyCountPrompt}

现在，请以 **${persona.name}** 的身份，回复以下消息：`;
    return prompt;
}

    async function handleRetry() {
        const personaId = App.state.currentConversationPersona.id;
        if (!personaId) return;

        const allMessages = await getConversationMessages(personaId);
        const messageIdsToDelete = new Set();
        
        // 1. Identify the last turn of AI messages from the end
        for (let i = allMessages.length - 1; i >= 0; i--) {
            const msg = allMessages[i];
            if (msg.role === 'ai') {
                messageIdsToDelete.add(msg.id);
            } else if (msg.role === 'user') {
                // Stop as soon as we hit the last user message
                break;
            }
        }

        if (messageIdsToDelete.size === 0) return;

        // 2. Remove messages from the DOM
        document.querySelectorAll('.conv-msg-item').forEach(el => {
            const elId = parseInt(el.dataset.id, 10);
            if (messageIdsToDelete.has(elId)) {
                el.remove();
            }
        });

        // 3. Remove messages from the database
        for (const msgId of messageIdsToDelete) {
            await deleteConversationMessage(personaId, msgId);
        }

        // 4. Trigger a new reply generation
        await handleTriggerReply();
    }

    // Send user message only (no AI reply triggered)
    async function handleSendMessage() {
        const messageInput = document.getElementById('conv-text-input');
        const messagesContainer = document.getElementById('conv-messages-area');
        const text = messageInput.value.trim();
        if (!text || !App.state.currentConversationPersona) return;

        const userMessage = { id: Date.now(), role: 'user', text: text, ts: Date.now() };
        if (App.state.currentQuote) { userMessage.quote = App.state.currentQuote; }

        renderMessage(userMessage, App.state.currentConversationPersona);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        messageInput.value = '';
        App.state.currentQuote = null;
        document.getElementById('conv-quote-bar').style.display = 'none';

        await saveConversationMessage(App.state.currentConversationPersona.id, userMessage);

        // Update send/mic button visibility
        updateInputButtons();
    }

    // Trigger AI reply (called by mic button)
    async function handleTriggerReply() {
        const messagesContainer = document.getElementById('conv-messages-area');
        if (!App.state.currentConversationPersona) return;

        const apiSettings = App.state.cachedApiSettings;
        if (!apiSettings || !apiSettings.apiUrl || !apiSettings.apiKey || !apiSettings.selectedModel || apiSettings.selectedModel === '请先拉取模型列表') {
            alert('请先在「设置」中配置 API 并选择模型！');
            return;
        }

        const aiThinkingMessage = { id: Date.now() + 1, role: 'ai', text: '...', ts: Date.now(), isSending: true };
        const aiMsgEl = renderMessage(aiThinkingMessage, App.state.currentConversationPersona);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        try {
            const history = await getConversationMessages(App.state.currentConversationPersona.id);
            if (history.length === 0) {
                aiMsgEl.remove();
                return;
            }

            const timeAwareness = App.refreshPersonaTimeAwareness(App.state.currentConversationPersona);
            
            // Probabilistic Quoting
            let quoteForAi = null;
            const quoteProbability = 0.3; // 30% chance
            if (Math.random() < quoteProbability) {
                const lastUserMessage = history.slice().reverse().find(m => m.role === 'user');
                if (lastUserMessage) {
                    const profile = App.state.cachedUserProfile || {};
                    quoteForAi = {
                        senderName: profile.nickname || '我',
                        text: lastUserMessage.text,
                        messageId: lastUserMessage.id
                    };
                }
            }

            const personaPrompt = buildPersonaPrompt(App.state.currentConversationPersona, timeAwareness, history.slice(-10), quoteForAi);

            const messagesForApi = [
                { role: 'system', content: personaPrompt },
                ...history.map(m => ({ role: m.role, content: m.text }))
            ];

            const response = await fetch(apiSettings.apiUrl.replace(/\/$/, '') + '/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiSettings.apiKey },
                body: JSON.stringify({ model: apiSettings.selectedModel, messages: messagesForApi, temperature: parseFloat(apiSettings.temperature) || 0.7 })
            });

            if (!response.ok) throw new Error(`API Error: ${response.status} ${response.statusText}`);

            const data = await response.json();
            const rawAiText = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '抱歉，我不知道该怎么回答。';

            // Remove thinking bubble
            aiMsgEl.remove();

            const sentences = rawAiText.split('\n').map(s => s.trim()).filter(s => s.length > 0);
            
            if (sentences.length === 0) {
                 sentences.push('...');
            }

            for (let i = 0; i < sentences.length; i++) {
                const sentence = sentences[i];
                const newMsgId = Date.now() + i;
                const aiMessage = { id: newMsgId, role: 'ai', text: sentence, ts: Date.now() };

                // Add quote to the first message bubble of the turn
                if (i === 0 && quoteForAi) {
                    aiMessage.quote = quoteForAi;
                }
                
                // Render each sentence as a new message
                renderMessage(aiMessage, App.state.currentConversationPersona);
                messagesContainer.scrollTop = messagesContainer.scrollHeight;

                // Save each sentence as a separate message to ensure correct display on reload
                await saveConversationMessage(App.state.currentConversationPersona.id, aiMessage);


                // Add a small delay between bubbles
                if (i < sentences.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 400 + Math.random() * 300));
                }
            }

        } catch (error) {
            console.error('触发回复失败:', error);
            aiMsgEl.querySelector('.conv-msg-bubble').innerHTML = `<span style="color:red;font-style:italic;">消息发送失败: ${error.message}</span>`;
        } finally {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    // Helper: update send/mic button visibility based on input content
    function updateInputButtons() {
        const messageInput = document.getElementById('conv-text-input');
        const sendBtn = document.getElementById('conv-send-btn');
        const micBtn = document.getElementById('conv-mic-btn');
        const hasText = messageInput && messageInput.value.trim().length > 0;
        if (sendBtn) sendBtn.style.display = hasText ? 'flex' : 'none';
        if (micBtn) micBtn.style.display = hasText ? 'none' : 'flex';
    }

    // Expose openConversationPage for chat list
    App.openConversationPage = async function (persona) {
        const chatPage = document.getElementById('chat-page');
        const conversationPage = document.getElementById('conversation-page');
        const convTitle = document.getElementById('conv-contact-name');
        const messagesContainer = document.getElementById('conv-messages-area');

        App.state.currentConversationPersona = persona;
        chatPage.style.display = 'none';
        conversationPage.style.display = 'block';

        const displayName = persona.remark ? `${persona.remark} (${persona.name})` : persona.name;
        convTitle.textContent = displayName;

        // Populate top avatar in nav bar
        const convAvatarSmall = document.getElementById('conv-avatar-small');
        if (convAvatarSmall) {
            convAvatarSmall.innerHTML = persona.avatar
                ? `<img src="${persona.avatar}" alt="${persona.name}">`
                : App.getPersonaLetterAvatar(persona.name);
        }

        const settings = await db.getFromStore('personaSettings', persona.id) || {};
        App.state.personaSettingsCache[persona.id] = settings;
        applyPersonaSettingsToConv(settings);

        // Apply hide avatars setting
        const hideAvatarsToggle = document.getElementById('csp-toggle-hide-avatars');
        if (settings.hideAvatars) {
            messagesContainer.classList.add('conv-hide-avatars');
            if (hideAvatarsToggle) hideAvatarsToggle.checked = true;
        } else {
            messagesContainer.classList.remove('conv-hide-avatars');
            if (hideAvatarsToggle) hideAvatarsToggle.checked = false;
        }

        messagesContainer.innerHTML = '';
        const messages = await getConversationMessages(persona.id);
        messages.forEach(msg => renderMessage(msg, persona));
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Only run time awareness if the persona has it enabled
        const personaSettings = App.state.personaSettingsCache[persona.id] || {};
        const fullPersona = await db.getFromStore('personas', persona.id) || persona;
        
        if (fullPersona.timeAwareness) {
            App.refreshPersonaTimeAwareness(persona);
            if (clockSyncTimer) clearInterval(clockSyncTimer);
            clockSyncTimer = setInterval(() => App.refreshPersonaTimeAwareness(persona), 30000);
        } else {
             if (clockSyncTimer) clearInterval(clockSyncTimer);
             const el = document.getElementById('conv-status-time');
             if (el) el.textContent = '时间已冻结';
        }
    };

    App.initConversation = function () {
        const conversationPage = document.getElementById('conversation-page');
        const chatPage = document.getElementById('chat-page');
        const messagesContainer = document.getElementById('conv-messages-area');
        const messageInput = document.getElementById('conv-text-input');
        const sendMessageBtn = document.getElementById('conv-send-btn');
        const backToChatListBtn = document.getElementById('back-from-conversation');
        const convOptionsBtn = document.getElementById('conv-more-btn');
        const multiSelectCancelBtn = document.getElementById('multi-select-cancel-btn');
        const multiSelectDeleteBtn = document.getElementById('multi-select-delete-btn');

        if (multiSelectCancelBtn) multiSelectCancelBtn.addEventListener('click', exitMultiSelectMode);
        if (multiSelectDeleteBtn) multiSelectDeleteBtn.addEventListener('click', handleDeleteSelectedMessages);

        // --- Attachment Menu Toggle ---
        const plusBtn = document.getElementById('conv-plus-btn');
        const attachmentMenu = document.getElementById('attachment-menu');
        
        if (plusBtn && attachmentMenu) {
            plusBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                attachmentMenu.classList.toggle('active');
            });
        }
        
        if (conversationPage) {
            conversationPage.addEventListener('click', function(e) {
                // Check if the menu is active before trying to close it
                if (attachmentMenu.classList.contains('active')) {
                    // If the click is NOT on the menu itself or the button that opens it, close it
                    if (!attachmentMenu.contains(e.target) && !plusBtn.contains(e.target)) {
                        attachmentMenu.classList.remove('active');
                    }
                }
            });
        }

        document.getElementById('conv-cancel-quote-btn').addEventListener('click', () => {
            App.state.currentQuote = null;
            document.getElementById('conv-quote-bar').style.display = 'none';
        });

        backToChatListBtn.addEventListener('click', () => {
            conversationPage.style.display = 'none';
            chatPage.style.display = 'block';
            App.state.currentConversationPersona = null;
            if (clockSyncTimer) clearInterval(clockSyncTimer);
            App.setClock();
            App.switchChatTab('chat');
        });

        convOptionsBtn.addEventListener('click', () => {
            if (!App.state.currentConversationPersona) return;
            openPersonaSettingsModal(App.state.currentConversationPersona);
        });

        sendMessageBtn.addEventListener('click', handleSendMessage);
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); }
        });

        // Mic button triggers AI reply
        const micBtn = document.getElementById('conv-mic-btn');
        if (micBtn) {
            micBtn.addEventListener('click', handleTriggerReply);
        }

        // Update send/mic button visibility on input change
        messageInput.addEventListener('input', updateInputButtons);

        // Hide avatars toggle
        const hideAvatarsToggle = document.getElementById('csp-toggle-hide-avatars');
        if (hideAvatarsToggle) {
            hideAvatarsToggle.addEventListener('change', function () {
                const convMessagesArea = document.getElementById('conv-messages-area');
                if (convMessagesArea) {
                    if (this.checked) {
                        convMessagesArea.classList.add('conv-hide-avatars');
                    } else {
                        convMessagesArea.classList.remove('conv-hide-avatars');
                    }
                }
                // Save setting per persona
                if (App.state.currentConversationPersona) {
                    const personaId = App.state.currentConversationPersona.id;
                    const settings = App.state.personaSettingsCache[personaId] || {};
                    settings.hideAvatars = this.checked;
                    App.state.personaSettingsCache[personaId] = settings;
                    db.put('personaSettings', { personaId, ...settings });
                }
            });
        }

        // --- Persona Settings Modal ---
        const personaSettingsModal = document.getElementById('conv-settings-page');
        const backFromPersonaSettingsBtn = document.getElementById('back-from-conv-settings');
        const bgUploadBtn = document.getElementById('csp-upload-bg-btn');
        const bgClearBtn = document.getElementById('csp-clear-bg-btn');
        const bgPreview = document.getElementById('csp-bg-preview');
        const bubbleCssUserTextarea = document.getElementById('csp-bubble-css-user');
        const bubbleCssAiTextarea = document.getElementById('csp-bubble-css-ai');
        const savePersonaSettingsBtn = document.getElementById('csp-save-appearance-btn');
        const clearConvHistoryBtn = document.getElementById('csp-btn-clear-chat');
        let currentPersonaSettingsBgData = null;

        function openPersonaSettingsModal(persona) {
            conversationPage.style.display = 'none';
            personaSettingsModal.style.display = 'block';

            // Populate avatars in settings page
            const cspUserAvatar = document.getElementById('csp-user-avatar');
            const cspAiAvatar = document.getElementById('csp-ai-avatar');
            const cspUserName = document.getElementById('csp-user-name');
            const cspAiName = document.getElementById('csp-ai-name');
            if (cspUserAvatar) {
                cspUserAvatar.innerHTML = App.getUserBubbleAvatarHtml() || '<i class="fa-solid fa-user" style="font-size:28px;color:#bbb;"></i>';
            }
            if (cspAiAvatar) {
                cspAiAvatar.innerHTML = persona.avatar
                    ? `<img src="${persona.avatar}" alt="${persona.name}">`
                    : App.getPersonaLetterAvatar(persona.name);
            }
            if (cspUserName) {
                const profile = App.state.cachedUserProfile || {};
                cspUserName.textContent = profile.nickname || '我';
            }
            if (cspAiName) {
                cspAiName.textContent = persona.remark || persona.name;
            }

            const settings = App.state.personaSettingsCache[persona.id] || {};
            currentPersonaSettingsBgData = settings.background || null;
            bgPreview.style.backgroundImage = settings.background ? `url(${settings.background})` : 'none';
            bubbleCssUserTextarea.value = settings.bubbleCssUser || 'background-color: #A0E95A;\ncolor: #000;';
            bubbleCssAiTextarea.value = settings.bubbleCssAi || 'background-color: #FFFFFF;\ncolor: #000;';

            // Restore hide avatars toggle state
            const hideToggle = document.getElementById('csp-toggle-hide-avatars');
            if (hideToggle) {
                hideToggle.checked = !!settings.hideAvatars;
            }

            // Populate reply count
            const minReplyInput = document.getElementById('csp-reply-min');
            const maxReplyInput = document.getElementById('csp-reply-max');
            // Use the full persona object from state for these values
            const fullPersona = App.state.currentConversationPersona || {};
            if (minReplyInput) minReplyInput.value = fullPersona.minReply || 1;
            if (maxReplyInput) maxReplyInput.value = fullPersona.maxReply || 1;
        }

        if (backFromPersonaSettingsBtn) backFromPersonaSettingsBtn.addEventListener('click', () => {
            personaSettingsModal.style.display = 'none';
            conversationPage.style.display = 'block';
        });

        if (bgUploadBtn) bgUploadBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = 'image/*';
            input.onchange = (e) => {
                if (!e.target.files || !e.target.files[0]) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                    App.compressBackgroundImage(event.target.result, async (compressed) => {
                        currentPersonaSettingsBgData = compressed;
                        bgPreview.style.backgroundImage = `url(${compressed})`;
                        document.getElementById('csp-bg-preview-label').style.display = 'none'; // Hide label on upload
                        
                        const personaId = App.state.currentConversationPersona.id;
                        const settings = App.state.personaSettingsCache[personaId] || {};
                        settings.background = compressed;

                        // Immediately apply and save the new background
                        applyPersonaSettingsToConv(settings);
                        await db.put('personaSettings', { personaId, ...settings });
                        App.state.personaSettingsCache[personaId] = settings;
                    });
                };
                reader.readAsDataURL(e.target.files[0]);
            };
            input.click();
        });

        if (bgClearBtn) bgClearBtn.addEventListener('click', async () => {
            currentPersonaSettingsBgData = null;
            bgPreview.style.backgroundImage = 'none';
            document.getElementById('csp-bg-preview-label').style.display = 'block'; // Show label on clear

            const personaId = App.state.currentConversationPersona.id;
            const settings = App.state.personaSettingsCache[personaId] || {};
            settings.background = null;

            // Immediately apply and save the cleared background
            applyPersonaSettingsToConv(settings);
            await db.put('personaSettings', { personaId, ...settings });
            App.state.personaSettingsCache[personaId] = settings;
        });

        if (savePersonaSettingsBtn) savePersonaSettingsBtn.addEventListener('click', async () => {
            if (!App.state.currentConversationPersona) return;
            const personaId = App.state.currentConversationPersona.id;
            
            // Get current settings, update only the bubble CSS parts
            const settings = App.state.personaSettingsCache[personaId] || {};
            settings.bubbleCssUser = bubbleCssUserTextarea.value.trim();
            settings.bubbleCssAi = bubbleCssAiTextarea.value.trim();

            await db.put('personaSettings', { personaId, ...settings });
            App.state.personaSettingsCache[personaId] = settings;
            applyPersonaSettingsToConv(settings);
            alert('设置已保存！');
            personaSettingsModal.style.display = 'none';
            conversationPage.style.display = 'block';
        });

        if (clearConvHistoryBtn) clearConvHistoryBtn.addEventListener('click', async () => {
            if (!App.state.currentConversationPersona) return;
            if (confirm(`确定要清空与「${App.state.currentConversationPersona.name}」的所有聊天记录吗？此操作不可恢复。`)) {
                const conv = await db.getFromStore('conversations', App.state.currentConversationPersona.id);
                if (conv) { conv.messages = []; await db.put('conversations', conv); }
                messagesContainer.innerHTML = '';
                alert('聊天记录已清空。');
            }
        });

        // --- Reply Count Settings Handler ---
        const minReplyInput = document.getElementById('csp-reply-min');
        const maxReplyInput = document.getElementById('csp-reply-max');

        const handleReplyCountChange = async () => {
            if (!App.state.currentConversationPersona) return;
            // It's better to get the persona fresh from DB to avoid stale data
            const persona = await db.getFromStore('personas', App.state.currentConversationPersona.id);
            if (!persona) return;

            let min = parseInt(minReplyInput.value, 10);
            let max = parseInt(maxReplyInput.value, 10);

            if (isNaN(min) || min < 1) min = 1;
            if (isNaN(max) || max < min) max = min;
            
            minReplyInput.value = min;
            maxReplyInput.value = max;

            persona.minReply = min;
            persona.maxReply = max;
            
            await db.put('personas', persona);
            
            // Also update the current in-memory persona state
            App.state.currentConversationPersona.minReply = min;
            App.state.currentConversationPersona.maxReply = max;
        };

        if (minReplyInput) minReplyInput.addEventListener('change', handleReplyCountChange);
        if (maxReplyInput) maxReplyInput.addEventListener('change', handleReplyCountChange);
    };

})(window.App);
