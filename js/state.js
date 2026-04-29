// =================================================================
// --- 共享状态 & 工具函数 ---
// =================================================================
window.App = {
    state: {
        pagesContainer: null,
        startX: 0,
        currentPage: 0,
        currentConversationPersona: null,
        isUploadingProfileAvatar: false,
        userAvatarCache: '',
        currentConvBubbleCssAi: '',
        currentConvBubbleCssUser: '',
        currentConvBgDataUrl: '',
        currentQuote: null, // { senderName, text, messageId }
        isMultiSelectMode: false,
        selectedMessages: [],
        currentTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai',
        clockSyncTimer: null,
        cachedApiSettings: null,
        cachedUserProfile: null,
        personaSettingsCache: {},
        currentWidget: null,
        currentImageTarget: null,
        pressTimer: null,
        imageUploader: null,
        dock: null
    },

    // --- Persona DB helpers (shared across modules) ---
    async getPersonas() {
        return await db.getAll('personas') || [];
    },
    async savePersona(p) {
        await db.put('personas', p);
    },
    async deletePersona(id) {
        await db.deleteFromStore('personas', id);
    },
    async savePersonas(list) {
        const ex = await db.getAll('personas');
        for (const p of ex) await db.deleteFromStore('personas', p.id);
        for (const p of list) await db.put('personas', p);
    },

    // --- Conversation DB helpers ---
    async getConversationMessages(personaId) {
        const conv = await db.getFromStore('conversations', personaId);
        return conv ? conv.messages : [];
    },
    async saveConversationMessage(personaId, message) {
        let conv = await db.getFromStore('conversations', personaId);
        if (!conv) conv = { personaId: personaId, messages: [] };
        conv.messages.push(message);
        await db.put('conversations', conv);
    },
    async deleteConversationMessage(personaId, messageId) {
        let conv = await db.getFromStore('conversations', personaId);
        if (conv && conv.messages) {
            conv.messages = conv.messages.filter(m => m.id !== messageId);
            await db.put('conversations', conv);
        }
    },

    // --- Friend Request DB helpers ---
    async getFriendRequests() {
        return await db.get('friendRequests') || [];
    },
    async storeFriendRequest(req) {
        const all = await this.getFriendRequests();
        all.push(req);
        await db.set('friendRequests', all);
    },
    async updateFriendRequests(requests) {
        await db.set('friendRequests', requests);
    },

    // --- Avatar / Image helpers ---
    getPersonaLetterAvatar(name) {
        const l = (name || '?').charAt(0).toUpperCase(),
            colors = ['#5b8dee', '#ee6b5b', '#5bee9e', '#ee9d5b', '#a05bee', '#5bbcee', '#ee5ba0'];
        return '<div class="persona-letter-avatar" style="background:' + colors[l.charCodeAt(0) % colors.length] + ';">' + l + '</div>';
    },

    getAvatarHtmlForFriend(p) {
        if (p.avatar) return '<img src="' + p.avatar + '" alt="' + (p.name || '') + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;">';
        const l = (p.name || '?').charAt(0).toUpperCase(),
            colors = ['#5b8dee', '#ee6b5b', '#5bee9e', '#ee9d5b', '#a05bee', '#5bbcee', '#ee5ba0'];
        return '<div style="width:100%;height:100%;border-radius:50%;background:' + colors[l.charCodeAt(0) % colors.length] + ';display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:bold;color:#fff;">' + l + '</div>';
    },

    getUserBubbleAvatarHtml() {
        if (this.state.userAvatarCache) return '<img src="' + this.state.userAvatarCache + '" alt="user" style="width:100%;height:100%;object-fit:cover;">';
        const name = (this.state.cachedUserProfile || {}).nickname || '理';
        const l = name.charAt(0).toUpperCase(),
            colors = ['#5b8dee', '#ee6b5b', '#5bee9e', '#ee9d5b', '#a05bee', '#5bbcee', '#ee5ba0'];
        return '<div style="width:100%;height:100%;border-radius:inherit;background:' + colors[l.charCodeAt(0) % colors.length] + ';display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:bold;color:#fff;">' + l + '</div>';
    },

    compressAvatarImage(dataUrl, callback) {
        try {
            const img = new Image();
            img.onload = function () {
                try {
                    let w = img.width, h = img.height, MAX = 256, QUALITY = 0.85;
                    if (w > MAX || h > MAX) { const r = Math.min(MAX / w, MAX / h); w = Math.round(w * r); h = Math.round(h * r); }
                    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    callback(canvas.toDataURL('image/jpeg', QUALITY));
                } catch (err) { callback(dataUrl); }
            };
            img.onerror = () => callback(dataUrl); img.src = dataUrl;
        } catch (e) { callback(dataUrl); }
    },

    compressBackgroundImage(dataUrl, callback) {
        try {
            const img = new Image();
            img.onload = function () {
                try {
                    let w = img.width, h = img.height, MAX_W = 1080, MAX_H = 1920, QUALITY = 0.90;
                    if (w > MAX_W || h > MAX_H) { const r = Math.min(MAX_W / w, MAX_H / h); w = Math.round(w * r); h = Math.round(h * r); }
                    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    callback(canvas.toDataURL('image/jpeg', QUALITY));
                } catch (err) { callback(dataUrl); }
            };
            img.onerror = () => callback(dataUrl); img.src = dataUrl;
        } catch (e) { callback(dataUrl); }
    },

    // --- User Profile helpers ---
    async saveUserProfile(profile) {
        try {
            await db.set('userProfile', profile);
            this.state.cachedUserProfile = profile;
        } catch (e) {
            try {
                const slim = { ...profile, avatar: '' };
                await db.set('userProfile', slim);
                this.state.cachedUserProfile = slim;
            } catch (e2) { }
        }
    },

    // --- Element State helpers (beautify) ---
    async getElementState(id) {
        return await db.get('element_' + id);
    },
    saveElementState(id, state) {
        db.set('element_' + id, state).catch(e => console.error("保存元素状态失败:", e));
    },

    // --- Navigation helpers ---
    showPage(pageId) {
        this.state.pagesContainer.style.display = 'none';
        this.state.dock.style.display = 'none';
        const page = document.getElementById(pageId);
        if (page) page.style.display = 'block';
    },
    backToHome() {
        this.state.pagesContainer.style.display = 'flex';
        this.state.dock.style.display = 'flex';
    }
};
