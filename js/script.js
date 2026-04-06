// ==================== 常量定义 ====================
const BACKEND_URL = 'https://xixi-qwq.vercel.app';
const VISION_API_URL = BACKEND_URL + '/api/vision';
const TOAST_DURATION = 3000;
const API_ERRORS = {
    400: '请求格式错误 (400)，请检查API配置',
    401: 'API密钥无效或权限不足 (401)',
    403: 'API密钥无效或权限不足 (403)',
    404: 'API地址不存在 (404)，请检查Base URL',
    429: '请求过于频繁，请稍后再试 (429)',
    500: '服务器内部错误 (500)',
    502: '网关错误 (502)',
    503: '服务不可用 (503)',
    504: '网关超时 (504)'
};
const DB_NAME = 'AIChatDB';
const DB_VERSION = 1;
const STORE_NAME = 'images';
const INITIAL_MESSAGE_COUNT = 20;
const LOAD_MORE_COUNT = 10;
const TIME_SEPARATOR_THRESHOLD = 30 * 60 * 1000;
// ========== 密钥本地混淆加密（防止明文存储）==========
const SECRET_SALT = "AIChat_Local_Salt_2026";  // 固定盐，仅用于混淆
function encrypt(text) {
    if (!text) return "";
    let result = "";
    for (let i = 0; i < text.length; i++) {
        let code = text.charCodeAt(i) ^ SECRET_SALT.charCodeAt(i % SECRET_SALT.length);
        result += String.fromCharCode(code);
    }
    return btoa(result);  // base64 编码
}
function decrypt(encoded) {
    if (!encoded) return "";
    let decoded = atob(encoded);
    let result = "";
    for (let i = 0; i < decoded.length; i++) {
        let code = decoded.charCodeAt(i) ^ SECRET_SALT.charCodeAt(i % SECRET_SALT.length);
        result += String.fromCharCode(code);
    }
    return result;
}
// ==================== 工具函数模块 ====================
const Utils = {
    imageCache: new Map(),
    pendingImageLoads: new Map(),

    showToast(message, duration = TOAST_DURATION) {
        const toast = document.getElementById('toast');
        const toastMsg = document.getElementById('toastMessage');
        toastMsg.textContent = message;
        toast.style.display = 'block';
        if (window.toastTimer) clearTimeout(window.toastTimer);
        window.toastTimer = setTimeout(() => { toast.style.display = 'none'; }, duration);
    },

    compressImage(dataUrl, maxSize = 800, quality = 0.9) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width, height = img.height;
                if (width > height) { if (width > maxSize) { height = Math.round(height * (maxSize / width)); width = maxSize; } }
                else { if (height > maxSize) { width = Math.round(width * (maxSize / height)); height = maxSize; } }
                const canvas = document.createElement('canvas');
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = () => reject(new Error('图片加载失败'));
            img.src = dataUrl;
        });
    },

    async saveOriginalImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const dataUrl = e.target.result;
                const imageId = this.generateImageId('bg');
                await this.saveImageToDB(imageId, dataUrl);
                resolve(imageId);
            };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsDataURL(file);
        });
    },

    getDisplayName(contact) { return contact.remark && contact.remark.trim() !== '' ? contact.remark : contact.name; },

    getLastMessageForList(contact) {
        if (contact.muted && contact.mutedLastMessage !== undefined) return contact.mutedLastMessage;
        const lastMsg = contact.messages.length ? contact.messages[contact.messages.length-1] : null;
        if (!lastMsg) return '';
        if (lastMsg.type === 'image') return '[图片]';
        if (lastMsg.type === 'voice' || lastMsg.type === 'voice_sim') return '[语音]';
        if (lastMsg.type === 'transfer') {
            if (lastMsg.content && lastMsg.content.status === 'accepted') return '[转账-已收款]';
            if (lastMsg.content && lastMsg.content.status === 'rejected') return '[转账-已退回]';
            return '[转账]';
        }
        if (lastMsg.type === 'recall') return '已撤回';
        return lastMsg.content || '';
    },

    formatTime(timestamp) { let date = timestamp ? new Date(timestamp) : new Date(); return date.getHours().toString().padStart(2,'0') + ':' + date.getMinutes().toString().padStart(2,'0'); },
    formatTimeHM(timestamp) { let date = timestamp ? new Date(timestamp) : new Date(); return date.getHours().toString().padStart(2,'0') + ':' + date.getMinutes().toString().padStart(2,'0'); },

    openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            };
        });
    },

    async saveImageToDB(imageId, dataUrl) {
        this.imageCache.delete(imageId);
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.put({ id: imageId, data: dataUrl });
            request.onsuccess = () => { this.imageCache.set(imageId, dataUrl); resolve(); };
            request.onerror = () => reject(request.error);
        });
    },

    async loadImageFromDB(imageId) {
        if (!imageId) return null;
        if (this.imageCache.has(imageId)) return this.imageCache.get(imageId);
        if (this.pendingImageLoads.has(imageId)) return this.pendingImageLoads.get(imageId);
        const promise = new Promise(async (resolve, reject) => {
            const db = await this.openDB();
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(imageId);
            request.onsuccess = () => {
                const data = request.result ? request.result.data : null;
                if (data) this.imageCache.set(imageId, data);
                this.pendingImageLoads.delete(imageId);
                resolve(data);
            };
            request.onerror = () => { this.pendingImageLoads.delete(imageId); reject(request.error); };
        });
        this.pendingImageLoads.set(imageId, promise);
        return promise;
    },

    async deleteImageFromDB(imageId) {
        this.imageCache.delete(imageId);
        this.pendingImageLoads.delete(imageId);
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.delete(imageId);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    generateImageId(prefix = 'img') { return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; },
    isBase64Image(str) { return typeof str === 'string' && str.startsWith('data:image'); },

    async setImageElement(el, imageData, defaultText = '🤖') {
        if (!imageData) { el.innerHTML = defaultText; return; }
        if (typeof imageData === 'string' && !this.isBase64Image(imageData)) {
            const dataUrl = await this.loadImageFromDB(imageData);
            if (dataUrl) el.innerHTML = `<img src="${dataUrl}" alt="avatar" style="width:100%;height:100%;object-fit:cover;">`;
            else el.innerHTML = defaultText;
        } else if (this.isBase64Image(imageData)) {
            el.innerHTML = `<img src="${imageData}" alt="avatar" style="width:100%;height:100%;object-fit:cover;">`;
        } else el.innerHTML = imageData;
    },

    async setBackgroundImage(element, imageId, defaultUrl = null) {
        if (!imageId) { element.style.backgroundImage = ''; element.style.backgroundSize = ''; element.style.backgroundPosition = ''; element.style.backgroundRepeat = ''; return; }
        if (this.isBase64Image(imageId)) element.style.backgroundImage = `url('${imageId}')`;
        else {
            const dataUrl = await this.loadImageFromDB(imageId);
            if (dataUrl) element.style.backgroundImage = `url('${dataUrl}')`;
            else if (defaultUrl) element.style.backgroundImage = `url('${defaultUrl}')`;
        }
        element.style.backgroundSize = 'cover';
        element.style.backgroundPosition = 'center';
        element.style.backgroundRepeat = 'no-repeat';
    },

    isRecallMessage(msg) { return msg.type === 'recall'; },
    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsText(file);
        });
    },
    async getAllImages() {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    async clearImages() {
        this.imageCache.clear();
        this.pendingImageLoads.clear();
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },
    async saveImagesBatch(images) {
        const db = await this.openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        return Promise.all(images.map(img => store.put(img)));
    },
    recognizeSpeech(audioBlob) {
        return new Promise((resolve) => {
            Utils.showToast('正在识别语音...', 0);
            setTimeout(() => { resolve('这是一条模拟识别的语音消息'); }, 1000);
        });
    },
    async recognizeImage(imageId) {
        // Check if puter.ai is available
        if (typeof puter === 'undefined' || typeof puter.ai === 'undefined' || typeof puter.ai.img2txt === 'undefined') {
            return "[图片识别失败: Puter.js SDK 加载失败或版本不兼容]";
        }

        try {
            const imageDataUrl = await this.loadImageFromDB(imageId);
            if (!imageDataUrl) throw new Error("无法从数据库加载图片");

            // puter.ai.img2txt accepts a File object or a data URL string.
            const result = await puter.ai.img2txt(imageDataUrl);

            return result.trim() || "[图片识别成功，但无描述]";

        } catch (error) {
            console.error("Puter.ai img2txt Error:", error);
            let errorMessage = error.message || '未知错误';
            if (error.toString().includes("network")) {
                errorMessage = "网络请求失败，请检查网络连接。";
            }
            return `[图片识别失败: ${errorMessage}]`;
        }
    },
    async translateText(text) {
        await new Promise(resolve => setTimeout(resolve, 500));
        if (/[\u4e00-\u9fa5]/.test(text)) return 'Translated: ' + text;
        else return '翻译：' + text;
    }
};

// ==================== 数据管理模块 ====================
const DataManager = {
    apiConfigs: [], activeConfigId: null, contacts: [], currentContactId: null, currentStatusIndex: 0,
    geminiSettings: { apiKey: '' },
    userProfile: { name: '我的网名', status: '在线', avatar: '🤖', realName: '', address: '', lineId: '', bio: '', userSetting: '' },
    beautifySettings: { wallpaper: null, appIcons: {}, momentCover: null, callBackground: null, widgetBackgrounds: { weather: null, calendar: null, aiStatus: null } },
    worldBooks: [], posts: [],
    wallet: { balance: 1234.56, transactions: [] },

    async processImageForSave(imageData, prefix = 'img') {
        if (!imageData) return null;
        if (Utils.isBase64Image(imageData)) {
            const id = Utils.generateImageId(prefix);
            await Utils.saveImageToDB(id, imageData);
            return id;
        }
        return imageData;
    },

 loadConfigs() {
    const saved = localStorage.getItem('apiConfigs');
    if (saved) {
        try {
            const encrypted = JSON.parse(saved);
            // 尝试解密，如果失败说明可能是旧明文数据
            this.apiConfigs = encrypted.map(cfg => ({
                ...cfg,
                base_url: cfg.base_url ? decrypt(cfg.base_url) : "",
                api_key: cfg.api_key ? decrypt(cfg.api_key) : ""
            }));
        } catch (e) {
            // 解密失败，当作旧明文数据直接使用
            this.apiConfigs = JSON.parse(saved);
        }
    } else {
        this.apiConfigs = [{ id: Date.now().toString(), name: '默认配置', base_url: '', api_key: '', models: [], currentModel: '' }];
    }
    const activeId = localStorage.getItem('activeConfigId');
    if (activeId && this.apiConfigs.some(c => c.id === activeId)) this.activeConfigId = activeId;
    else if (this.apiConfigs.length) this.activeConfigId = this.apiConfigs[0].id;
} ,
  saveConfigs() {
    // 加密敏感字段后再存储
    const toStore = this.apiConfigs.map(cfg => ({
        ...cfg,
        base_url: cfg.base_url ? encrypt(cfg.base_url) : "",
        api_key: cfg.api_key ? encrypt(cfg.api_key) : ""
    }));
    localStorage.setItem('apiConfigs', JSON.stringify(toStore));
    if (this.activeConfigId) localStorage.setItem('activeConfigId', this.activeConfigId);
} ,
    getActiveConfig() { return this.apiConfigs.find(c => c.id === this.activeConfigId) || this.apiConfigs[0]; },

    loadContacts() {
        const saved = localStorage.getItem('contacts');
        if (saved) {
            let contacts = JSON.parse(saved);
            contacts = contacts.map(c => {
                if (c.avatar && Utils.isBase64Image(c.avatar)) {
                    const imageId = Utils.generateImageId('contact_avatar');
                    Utils.saveImageToDB(imageId, c.avatar).catch(console.error);
                    c.avatar = imageId;
                }
                if (c.messages) {
                    const now = Date.now();
                    c.messages = c.messages.map((msg, idx) => { if (!msg.type) msg.type = 'text'; if (!msg.timestamp) msg.timestamp = now - (c.messages.length - 1 - idx) * 60000; return msg; });
                }
                c.blocked = c.blocked || false; c.remark = c.remark || ''; c.pinned = c.pinned || false; c.muted = c.muted || false; c.mutedLastMessage = c.mutedLastMessage || '';
                c.autoPostEnabled = c.autoPostEnabled || false; c.autoPostInterval = c.autoPostInterval || 1; c.lastAutoPostTime = c.lastAutoPostTime || 0;
                c.bubbleCss = c.bubbleCss || ''; c.chatBackground = c.chatBackground || null;
                c.intimateCard = c.intimateCard || { enabled: false, monthlyLimit: 0, usedAmount: 0, cardNumber: '' };
                c.selectiveReplyEnabled = c.selectiveReplyEnabled || false;
                return c;
            });
            this.contacts = contacts;
        } else {
            this.contacts = [{ id: Date.now().toString(), avatar: '🤖', name: '默认助手', remark: '', personality: '你是一个友好的AI助手，乐于助人。', configId: '', blocked: false, pinned: false, muted: false, mutedLastMessage: '', messages: [], autoPostEnabled: false, autoPostInterval: 1, lastAutoPostTime: 0, bubbleCss: '', chatBackground: null, intimateCard: { enabled: false, monthlyLimit: 0, usedAmount: 0, cardNumber: '' }, selectiveReplyEnabled: false }];
        }
        if (this.contacts.length) this.currentContactId = this.contacts[0].id;
    },
    saveContacts() { localStorage.setItem('contacts', JSON.stringify(this.contacts)); },
    getCurrentContact() { return this.contacts.find(c => c.id === this.currentContactId) || this.contacts[0]; },
    updateIntimateUsed(contactId, amount) { const c = this.contacts.find(c => c.id === contactId); if (c && c.intimateCard && c.intimateCard.enabled) { c.intimateCard.usedAmount += amount; this.saveContacts(); return true; } return false; },
    getIntimateRemaining(contactId) { const c = this.contacts.find(c => c.id === contactId); if (c && c.intimateCard && c.intimateCard.enabled) return c.intimateCard.monthlyLimit - c.intimateCard.usedAmount; return 0; },

    loadUserProfile() {
        const saved = localStorage.getItem('userProfile');
        if (saved) {
            let profile = JSON.parse(saved);
            if (profile.avatar && Utils.isBase64Image(profile.avatar)) {
                const id = Utils.generateImageId('user_avatar');
                Utils.saveImageToDB(id, profile.avatar).catch(console.error);
                profile.avatar = id;
            }
            this.userProfile = profile;
        }
    },
    saveUserProfile() { localStorage.setItem('userProfile', JSON.stringify(this.userProfile)); },

    loadBeautifySettings() {
        const saved = localStorage.getItem('beautifySettings');
        if (saved) {
            let settings = JSON.parse(saved);
            if (settings.wallpaper && Utils.isBase64Image(settings.wallpaper)) { const id = Utils.generateImageId('wallpaper'); Utils.saveImageToDB(id, settings.wallpaper).catch(console.error); settings.wallpaper = id; }
            if (settings.momentCover && Utils.isBase64Image(settings.momentCover)) { const id = Utils.generateImageId('moment_cover'); Utils.saveImageToDB(id, settings.momentCover).catch(console.error); settings.momentCover = id; }
            if (settings.appIcons) {
                const newIcons = {};
                for (let [key, value] of Object.entries(settings.appIcons)) {
                    if (Utils.isBase64Image(value)) { const id = Utils.generateImageId(`icon_${key}`); Utils.saveImageToDB(id, value).catch(console.error); newIcons[key] = id; }
                    else newIcons[key] = value;
                }
                settings.appIcons = newIcons;
            }
            if (settings.callBackground && Utils.isBase64Image(settings.callBackground)) { const id = Utils.generateImageId('call_bg'); Utils.saveImageToDB(id, settings.callBackground).catch(console.error); settings.callBackground = id; }
            if (!settings.widgetBackgrounds) settings.widgetBackgrounds = { weather: null, calendar: null, aiStatus: null };
            this.beautifySettings = settings;
        } else this.beautifySettings = { wallpaper: null, appIcons: {}, momentCover: null, callBackground: null, widgetBackgrounds: { weather: null, calendar: null, aiStatus: null } };
    },
    saveBeautifySettings() { localStorage.setItem('beautifySettings', JSON.stringify(this.beautifySettings)); },

    loadWorldBooks() { const saved = localStorage.getItem('worldBooks'); this.worldBooks = saved ? JSON.parse(saved) : []; },
    saveWorldBooks() { localStorage.setItem('worldBooks', JSON.stringify(this.worldBooks)); },
    loadPosts() { const saved = localStorage.getItem('posts'); this.posts = saved ? JSON.parse(saved) : []; },
    savePosts() { localStorage.setItem('posts', JSON.stringify(this.posts)); },
    getWorldBooksForContact(contactId) { return [...this.worldBooks.filter(w => w.global === true), ...this.worldBooks.filter(w => w.global === false && w.boundRoles && w.boundRoles.includes(contactId))]; },
    loadWallet() { const saved = localStorage.getItem('wallet'); this.wallet = saved ? JSON.parse(saved) : { balance: 1234.56, transactions: [] }; },
    saveWallet() { localStorage.setItem('wallet', JSON.stringify(this.wallet)); },
    addTransaction(tx) { this.wallet.transactions.unshift(tx); this.saveWallet(); },
    updateBalance(amount) { this.wallet.balance += amount; this.saveWallet(); }
};

// ==================== 钱包管理器 ====================
const WalletManager = {
    renderWallet() {
        const balanceEl = document.getElementById('walletBalance');
        if (balanceEl) balanceEl.textContent = '¥' + DataManager.wallet.balance.toFixed(2);
        const txContainer = document.getElementById('walletTransactions');
        if (!txContainer) return;
        txContainer.innerHTML = '';
        DataManager.wallet.transactions.slice(0, 5).forEach(tx => {
            const item = document.createElement('div'); item.className = 'transaction-item';
            const iconDiv = document.createElement('div'); iconDiv.className = 'transaction-icon';
            let iconClass = 'fa-solid fa-exchange-alt';
            if (tx.type === 'transfer') iconClass = 'fa-solid fa-paper-plane';
            else if (tx.type === 'receive') iconClass = 'fa-solid fa-download';
            else if (tx.type === 'recharge') iconClass = 'fa-solid fa-plus-circle';
            iconDiv.innerHTML = `<i class="${iconClass}"></i>`;
            item.appendChild(iconDiv);
            const infoDiv = document.createElement('div'); infoDiv.className = 'transaction-info';
            infoDiv.innerHTML = `<div class="transaction-name">${tx.name}</div><div class="transaction-desc">${tx.date}</div>`;
            item.appendChild(infoDiv);
            const amountSpan = document.createElement('span'); amountSpan.className = `transaction-amount ${tx.amount > 0 ? 'positive' : 'negative'}`;
            amountSpan.textContent = (tx.amount > 0 ? '+' : '') + tx.amount.toFixed(2);
            item.appendChild(amountSpan);
            txContainer.appendChild(item);
        });
    },
    renderIntimateCards() {
        const container = document.getElementById('intimateCardContainer');
        if (!container) return;
        container.innerHTML = '';
        const cards = DataManager.contacts.filter(c => c.intimateCard && c.intimateCard.enabled);
        if (!cards.length) { container.innerHTML = '<div style="text-align:center; color:#999; padding:40px;">暂无亲属卡</div>'; return; }
        cards.forEach(contact => {
            const card = document.createElement('div'); card.className = 'intimate-bank-card'; card.dataset.id = contact.id;
            card.innerHTML = `<div class="card-header"><span class="card-holder">${Utils.getDisplayName(contact)}</span></div><div class="card-number">${contact.intimateCard.cardNumber || '**** **** **** ' + Math.floor(Math.random()*10000).toString().padStart(4,'0')}</div><div class="card-limit"><span>月限额</span><span>¥${contact.intimateCard.monthlyLimit.toFixed(2)}</span></div><div class="card-used">已用 ¥${contact.intimateCard.usedAmount.toFixed(2)}</div>`;
            card.addEventListener('click', () => { window.currentUnbindContactId = contact.id; document.getElementById('unbindContactName').textContent = Utils.getDisplayName(contact); document.getElementById('unbindIntimateModal').classList.add('active'); });
            container.appendChild(card);
        });
    },
    ensureRechargeModal() {
        let modal = document.getElementById('rechargeModal');
        if (modal) return modal;
        modal = document.createElement('div'); modal.id = 'rechargeModal'; modal.className = 'modal-overlay';
        modal.innerHTML = `<div class="modal-content"><div class="modal-header"><h3>充值</h3><span class="close-modal" id="closeRechargeModal">&times;</span></div><div class="form-group"><label>充值金额（元）</label><input type="number" id="rechargeAmount" step="0.01" min="0.01"></div><div class="form-actions"><button class="save-btn" id="confirmRechargeBtn">确认充值</button><button class="cancel-btn" id="cancelRechargeBtn">取消</button></div></div>`;
        document.body.appendChild(modal);
        document.getElementById('closeRechargeModal').onclick = () => modal.classList.remove('active');
        document.getElementById('cancelRechargeBtn').onclick = () => modal.classList.remove('active');
        document.getElementById('confirmRechargeBtn').onclick = () => {
            const amt = parseFloat(document.getElementById('rechargeAmount').value);
            if (isNaN(amt) || amt <= 0) { Utils.showToast('请输入有效金额'); return; }
            DataManager.updateBalance(amt);
            DataManager.addTransaction({ id: Date.now(), name: '充值', amount: amt, date: new Date().toLocaleDateString(), type: 'recharge' });
            this.renderWallet();
            modal.classList.remove('active');
            Utils.showToast(`充值成功 +${amt.toFixed(2)}`);
        };
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
        return modal;
    },
    openRechargeModal() { this.ensureRechargeModal().classList.add('active'); },
    init() {
        document.getElementById('walletRecharge').addEventListener('click', () => this.openRechargeModal());
        document.getElementById('walletWithdraw').addEventListener('click', () => { if (DataManager.wallet.balance >= 50) { DataManager.updateBalance(-50); DataManager.addTransaction({ id: Date.now(), name: '提现', amount: -50, date: new Date().toLocaleDateString(), type: 'withdraw' }); this.renderWallet(); Utils.showToast('提现成功 -50'); } else Utils.showToast('余额不足'); });
        document.getElementById('walletPay').addEventListener('click', () => openApp('intimateCardList'));
        document.querySelectorAll('#walletCard, #walletBill, #walletCoupon').forEach(el => el.addEventListener('click', () => Utils.showToast('功能开发中')));
    }
};

// ==================== 朋友圈模块 ====================
const PostManager = {
    tempImages: [],
    openPostModal() {
        this.tempImages = [];
        document.getElementById('postContent').value = '';
        document.getElementById('postImagePreviewContainer').innerHTML = '';
        document.getElementById('imageCount').textContent = '0';
        const container = document.getElementById('postRoleCheckboxes');
        container.innerHTML = '';
        DataManager.contacts.forEach(c => { const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = c.id; const label = document.createElement('label'); label.style.display = 'block'; label.appendChild(cb); label.appendChild(document.createTextNode(' ' + Utils.getDisplayName(c))); container.appendChild(label); });
        document.getElementById('postModal').classList.add('active');
    },
    closePostModal() { document.getElementById('postModal').classList.remove('active'); },
    getSelectedRoleIds() { return Array.from(document.querySelectorAll('#postRoleCheckboxes input:checked')).map(cb => cb.value); },
    async handleImageUpload(files) {
        if (this.tempImages.length + files.length > 9) { Utils.showToast('最多只能上传9张图片'); return; }
        Utils.showToast('正在处理图片...', 0);
        for (let file of files) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const compressed = await Utils.compressImage(e.target.result, 800, 0.9);
                const id = Utils.generateImageId('post_img');
                await Utils.saveImageToDB(id, compressed);
                this.tempImages.push(id);
                this.renderImagePreviews();
            };
            reader.readAsDataURL(file);
        }
    },
    renderImagePreviews() {
        const container = document.getElementById('postImagePreviewContainer');
        container.innerHTML = '';
        this.tempImages.forEach((id, idx) => {
            const wrapper = document.createElement('div'); wrapper.style.position = 'relative'; wrapper.style.width = '70px'; wrapper.style.height = '70px'; wrapper.style.borderRadius = '8px'; wrapper.style.overflow = 'hidden';
            const img = document.createElement('img'); img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'cover';
            Utils.loadImageFromDB(id).then(dataUrl => { if (dataUrl) img.src = dataUrl; });
            const close = document.createElement('span'); close.innerHTML = '&times;'; close.style.cssText = 'position:absolute;top:2px;right:2px;background:rgba(0,0,0,0.5);color:white;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer;';
            close.onclick = (e) => { e.stopPropagation(); this.tempImages.splice(idx,1); this.renderImagePreviews(); };
            wrapper.appendChild(img); wrapper.appendChild(close);
            container.appendChild(wrapper);
        });
        document.getElementById('imageCount').textContent = this.tempImages.length;
    },
    async publishPost() {
        const content = document.getElementById('postContent').value.trim();
        if (!content && this.tempImages.length === 0) { Utils.showToast('请输入内容或选择图片'); return; }
        const selected = this.getSelectedRoleIds();
        const newPost = { id: Date.now().toString(), contactId: 'me', content, images: [...this.tempImages], timestamp: Date.now(), likedBy: [], likeCount: 0, comments: [] };
        DataManager.posts.unshift(newPost);
        DataManager.savePosts();
        this.closePostModal();
        this.renderMomentsList();
        Utils.showToast('发布成功');
        const targetIds = selected.length ? selected : DataManager.contacts.map(c => c.id);
        if (targetIds.length) this.triggerInteractions(newPost, targetIds);
    },
    async triggerInteractions(post, roleIds) {
        const valid = roleIds.filter(id => id !== 'me');
        if (!valid.length) return;
        let changed = false;
        for (let id of valid) {
            const contact = DataManager.contacts.find(c => c.id === id);
            if (!contact) continue;
            const action = Math.random() > 0.5 ? 'like' : 'comment';
            if (action === 'like') {
                if (!post.likedBy.includes(id)) { post.likedBy.push(id); changed = true; }
            } else {
                const comment = await this.generateCommentFromAI(contact, post.content);
                if (comment) { if (!post.comments) post.comments = []; post.comments.push({ id: Date.now()+Math.random().toString(36).substr(2,8), contactId: id, text: comment, timestamp: Date.now() }); changed = true; }
            }
            await new Promise(r => setTimeout(r, 500));
        }
        if (changed) { post.likeCount = post.likedBy.length; DataManager.savePosts(); if (document.getElementById('dynamicTab').style.display === 'flex') this.renderMomentsList(); }
    },
    async generateCommentFromAI(contact, postContent) {
        let config = contact.configId ? DataManager.apiConfigs.find(c => c.id === contact.configId) : DataManager.getActiveConfig();
        if (!config || !config.base_url || !config.api_key || !config.currentModel) return null;
        const messages = [{ role: 'system', content: contact.personality }, { role: 'user', content: `你看到好友的朋友圈动态："${postContent}"。请用一句话评论，符合你的性格，自然简短。只输出评论。` }];
        try {
            const res = await fetch(`${BACKEND_URL}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base_url: config.base_url, api_key: config.api_key, model: config.currentModel, messages }) });
            if (!res.ok) return null;
            const data = await res.json();
            return data.choices?.[0]?.message?.content?.trim() || null;
        } catch(e) { return null; }
    },
    async generateAIPost(contactId, customPrompt = '') {
        const contact = DataManager.contacts.find(c => c.id === contactId);
        if (!contact) return;
        let config = contact.configId ? DataManager.apiConfigs.find(c => c.id === contact.configId) : DataManager.getActiveConfig();
        if (!config || !config.base_url || !config.api_key || !config.currentModel) { Utils.showToast('联系人未关联有效 API 配置，无法生成朋友圈'); return; }
        Utils.showToast('AI 正在构思朋友圈...', 0);
        const prompt = customPrompt || `请以第一人称“我”的口吻，写一条微信朋友圈动态，内容要符合你的人设：${contact.personality}。要求：内容自然、有生活气息，长度不超过100字。`;
        try {
            const res = await fetch(`${BACKEND_URL}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base_url: config.base_url, api_key: config.api_key, model: config.currentModel, messages: [{ role: 'system', content: contact.personality }, { role: 'user', content: prompt }] }) });
            if (!res.ok) throw new Error('API错误');
            const data = await res.json();
            const content = data.choices?.[0]?.message?.content || '';
            if (!content) throw new Error('AI返回为空');
            const newPost = { id: Date.now().toString(), contactId, content, images: [], timestamp: Date.now(), likedBy: [], likeCount: 0, comments: [] };
            DataManager.posts.unshift(newPost);
            DataManager.savePosts();
            Utils.showToast('朋友圈发布成功');
            if (document.getElementById('dynamicTab').style.display === 'flex') this.renderMomentsList();
        } catch(e) { Utils.showToast('生成失败：'+e.message); }
    },
    renderMomentsList() {
        const container = document.getElementById('momentsList');
        if (!container) return;
        container.innerHTML = '';
        if (!DataManager.posts.length) { container.innerHTML = '<div style="text-align:center; color:#999; padding:40px 0;">暂无动态，点击右上角发布</div>'; return; }
        DataManager.posts.forEach(post => {
            const item = document.createElement('div'); item.className = 'moment-item'; item.dataset.id = post.id;
            let publisherName = '我', publisherAvatar = DataManager.userProfile.avatar;
            if (post.contactId !== 'me') {
                const c = DataManager.contacts.find(c => c.id === post.contactId);
                if (c) { publisherName = Utils.getDisplayName(c); publisherAvatar = c.avatar; }
                else publisherName = '未知角色';
            }
            const header = document.createElement('div'); header.className = 'moment-header';
            const avatarDiv = document.createElement('div'); avatarDiv.className = 'moment-avatar';
            Utils.setImageElement(avatarDiv, publisherAvatar, '🤖');
            header.appendChild(avatarDiv);
            const infoDiv = document.createElement('div'); infoDiv.className = 'moment-info';
            infoDiv.innerHTML = `<div class="moment-name">${publisherName}</div><div class="moment-time">${this.formatTime(post.timestamp)}</div>`;
            header.appendChild(infoDiv);
            item.appendChild(header);
            if (post.content) { const cd = document.createElement('div'); cd.className = 'moment-content'; cd.textContent = post.content; item.appendChild(cd); }
            if (post.images && post.images.length) {
                const imgsDiv = document.createElement('div'); imgsDiv.className = 'moment-images';
                post.images.forEach(imgId => {
                    const w = document.createElement('div'); w.className = 'moment-image';
                    const img = document.createElement('img');
                    Utils.loadImageFromDB(imgId).then(url => { if(url) img.src = url; });
                    w.appendChild(img);
                    w.addEventListener('click', () => Utils.loadImageFromDB(imgId).then(url => { if(url) window.open(url); }));
                    imgsDiv.appendChild(w);
                });
                item.appendChild(imgsDiv);
            }
            const actions = document.createElement('div'); actions.className = 'moment-actions';
            const likedByMe = post.likedBy && post.likedBy.includes('me');
            const likeBtn = document.createElement('button'); likeBtn.className = `moment-action-btn ${likedByMe ? 'liked' : ''}`;
            likeBtn.innerHTML = `<i class="fa-${likedByMe ? 'solid' : 'regular'} fa-heart"></i> 点赞 ${post.likedBy ? post.likedBy.length : 0}`;
            likeBtn.addEventListener('click', () => this.toggleLike(post.id));
            actions.appendChild(likeBtn);
            const commentBtn = document.createElement('button'); commentBtn.className = 'moment-action-btn';
            commentBtn.innerHTML = `<i class="fa-regular fa-comment"></i> 评论 ${post.comments ? post.comments.length : 0}`;
            commentBtn.addEventListener('click', () => this.showCommentInput(post.id));
            actions.appendChild(commentBtn);
            item.appendChild(actions);
            if (post.likedBy && post.likedBy.length) {
                const likeList = document.createElement('div'); likeList.className = 'like-list';
                const names = post.likedBy.map(id => { if(id==='me') return DataManager.userProfile.name||'我'; const c=DataManager.contacts.find(c=>c.id===id); return c?Utils.getDisplayName(c):'未知角色'; }).join('、');
                likeList.innerHTML = `<i class="fa-solid fa-thumbs-up"></i> ${names}`;
                item.appendChild(likeList);
            }
            if (post.comments && post.comments.length) {
                const commentsDiv = document.createElement('div'); commentsDiv.className = 'comments-section';
                post.comments.forEach(comment => {
                    const ci = document.createElement('div'); ci.className = 'comment-item';
                    let commenterName = comment.contactId==='me' ? (DataManager.userProfile.name||'我') : (()=>{const c=DataManager.contacts.find(c=>c.id===comment.contactId); return c?Utils.getDisplayName(c):'好友';})();
                    ci.innerHTML = `<span class="comment-name">${commenterName}</span><span class="comment-text">${comment.text}</span>`;
                    commentsDiv.appendChild(ci);
                });
                item.appendChild(commentsDiv);
            }
            const inputWrapper = document.createElement('div'); inputWrapper.className = 'add-comment'; inputWrapper.style.display = 'none';
            inputWrapper.innerHTML = '<input type="text" placeholder="写评论..."><button>发送</button>';
            const inp = inputWrapper.querySelector('input');
            const send = inputWrapper.querySelector('button');
            send.addEventListener('click', () => { const t = inp.value.trim(); if(t) this.addComment(post.id, t, inputWrapper); });
            item.appendChild(inputWrapper);
            item.commentInputWrapper = inputWrapper;
            container.appendChild(item);
        });
    },
    toggleLike(postId) {
        const post = DataManager.posts.find(p => p.id === postId);
        if (!post) return;
        if (!post.likedBy) post.likedBy = [];
        if (post.likedBy.includes('me')) post.likedBy = post.likedBy.filter(id => id !== 'me');
        else post.likedBy.push('me');
        post.likeCount = post.likedBy.length;
        DataManager.savePosts();
        this.renderMomentsList();
    },
    showCommentInput(postId) {
        const el = document.querySelector(`.moment-item[data-id="${postId}"]`);
        if (el && el.commentInputWrapper) el.commentInputWrapper.style.display = el.commentInputWrapper.style.display === 'none' ? 'flex' : 'none';
    },
    addComment(postId, text, wrapper) {
        const post = DataManager.posts.find(p => p.id === postId);
        if (!post) return;
        if (!post.comments) post.comments = [];
        post.comments.push({ id: Date.now().toString(), contactId: 'me', text, timestamp: Date.now() });
        DataManager.savePosts();
        wrapper.style.display = 'none';
        wrapper.querySelector('input').value = '';
        this.renderMomentsList();
    },
    formatTime(ts) {
        const d = new Date(ts), now = new Date();
        const diff = (now - d) / 1000;
        if (diff < 60) return '刚刚';
        if (diff < 3600) return Math.floor(diff/60)+'分钟前';
        if (diff < 86400) return Math.floor(diff/3600)+'小时前';
        if (diff < 2592000) return Math.floor(diff/86400)+'天前';
        return d.toLocaleDateString();
    }
};

// ==================== UI渲染模块（修复气泡CSS） ====================
const UIManager = {
    async updateUserProfileDisplay() {
        const profile = DataManager.userProfile;
        document.getElementById('userName').value = profile.name || '我的网名';
        document.getElementById('userStatus').value = profile.status || '在线';
        const userAvatarDiv = document.getElementById('userAvatar');
        userAvatarDiv.innerHTML = '';
        await Utils.setImageElement(userAvatarDiv, profile.avatar, '🤖');
        const profileAvatarDiv = document.getElementById('profileAvatar');
        profileAvatarDiv.innerHTML = '';
        await Utils.setImageElement(profileAvatarDiv, profile.avatar, '🤖');
        document.getElementById('profileName').textContent = profile.name || '我的网名';
        document.getElementById('profileStatus').textContent = profile.status || '在线';
        document.getElementById('profileBio').textContent = profile.bio || '';
        document.getElementById('realName').value = profile.realName || '';
        document.getElementById('address').value = profile.address || '';
        document.getElementById('lineId').value = profile.lineId || '';
        document.getElementById('bio').value = profile.bio || '';
        document.getElementById('userSetting').value = profile.userSetting || '';
        await this.updateProfileCover();
    },
    async updateProfileCover() {
        const profile = DataManager.userProfile;
        document.getElementById('coverUserName').textContent = profile.name || '我的网名';
        const bioText = profile.bio && profile.bio.trim() !== '' ? profile.bio : '暂无签名';
        document.getElementById('coverUserBio').textContent = bioText;
        const coverAvatarDiv = document.getElementById('coverUserAvatar');
        coverAvatarDiv.innerHTML = '';
        await Utils.setImageElement(coverAvatarDiv, profile.avatar, '🤖');
        const coverDiv = document.getElementById('profileCover');
        await Utils.setBackgroundImage(coverDiv, DataManager.beautifySettings.momentCover, 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=80&w=2070&auto=format&fit=crop');
    },
    // 修复气泡CSS应用函数，支持用户输入完整CSS规则或属性列表
    applyCurrentContactBubbleCss() {
        const contact = DataManager.getCurrentContact();
        let css = contact.bubbleCss || '';
        if (!css.trim()) {
            const styleEl = document.getElementById('custom-bubble-style');
            if (styleEl) styleEl.remove();
            return;
        }
        let finalCss = '';
        if (css.includes('{') && css.includes('}')) {
            finalCss = css;
        } else {
            finalCss = `.msg-bubble { ${css} }`;
        }
        const styleId = 'custom-bubble-style';
        let styleEl = document.getElementById(styleId);
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = styleId;
            document.head.appendChild(styleEl);
        }
        styleEl.innerHTML = finalCss;
    },
    async updateCurrentChatBackground() {
        const contact = DataManager.getCurrentContact();
        const chatMessages = document.getElementById('messageArea');
        if (chatMessages) {
            await Utils.setBackgroundImage(chatMessages, contact.chatBackground, 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="%2387CEFA"/><circle cx="20" cy="20" r="15" fill="%23fff" opacity="0.1"/><circle cx="80" cy="80" r="20" fill="%23fff" opacity="0.1"/></svg>');
        }
    },
    renderContactList() {
        const container = document.getElementById('contactListContainer');
        if (!container) return;
        container.innerHTML = '';
        const sortedContacts = [...DataManager.contacts].sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return 0;
        });
        sortedContacts.forEach(contact => {
            const lastMsg = contact.messages.length ? contact.messages[contact.messages.length-1] : null;
            const lastMsgContent = Utils.getLastMessageForList(contact);
            const lastMsgTime = lastMsg ? Utils.formatTime(lastMsg.timestamp) : '';
            const item = document.createElement('div'); item.className = 'contact-item'; item.dataset.id = contact.id;
            const avatarDiv = document.createElement('div'); avatarDiv.className = 'contact-avatar';
            Utils.setImageElement(avatarDiv, contact.avatar, '🤖').catch(console.error);
            item.appendChild(avatarDiv);
            const infoDiv = document.createElement('div'); infoDiv.className = 'contact-info';
            const rowDiv = document.createElement('div'); rowDiv.className = 'contact-row';
            const nameSpan = document.createElement('span'); nameSpan.className = 'contact-name';
            nameSpan.textContent = Utils.getDisplayName(contact);
            if (contact.blocked) {
                const blockSpan = document.createElement('span'); blockSpan.className = 'blocked-badge'; blockSpan.textContent = '(已拉黑)';
                nameSpan.appendChild(blockSpan);
            }
            rowDiv.appendChild(nameSpan);
            const timeSpan = document.createElement('span'); timeSpan.className = 'contact-time'; timeSpan.textContent = lastMsgTime;
            rowDiv.appendChild(timeSpan);
            infoDiv.appendChild(rowDiv);
            const msgDiv = document.createElement('div'); msgDiv.className = 'contact-lastmsg'; msgDiv.textContent = lastMsgContent;
            infoDiv.appendChild(msgDiv);
            item.appendChild(infoDiv);
            container.appendChild(item);
        });
    },
    renderFriendsList() {
        const container = document.getElementById('friendsListContainer');
        if (!container) return;
        container.innerHTML = '';
        DataManager.contacts.forEach(contact => {
            const item = document.createElement('div'); item.className = 'contact-item'; item.dataset.id = contact.id;
            const avatarDiv = document.createElement('div'); avatarDiv.className = 'contact-avatar';
            Utils.setImageElement(avatarDiv, contact.avatar, '🤖').catch(console.error);
            item.appendChild(avatarDiv);
            const infoDiv = document.createElement('div'); infoDiv.className = 'contact-info';
            const rowDiv = document.createElement('div'); rowDiv.className = 'contact-row';
            const nameSpan = document.createElement('span'); nameSpan.className = 'contact-name';
            nameSpan.textContent = Utils.getDisplayName(contact);
            if (contact.blocked) {
                const blockSpan = document.createElement('span'); blockSpan.className = 'blocked-badge'; blockSpan.textContent = '(已拉黑)';
                nameSpan.appendChild(blockSpan);
            }
            rowDiv.appendChild(nameSpan);
            infoDiv.appendChild(rowDiv);
            item.appendChild(infoDiv);
            container.appendChild(item);
        });
    },
    renderMessages(messages, start, end) {
        const area = document.getElementById('messageArea');
        if (!area) return;
        area.innerHTML = '';
        if (start > 0) {
            const loadingDiv = document.createElement('div'); loadingDiv.className = 'loading-more show'; loadingDiv.id = 'loadingMoreIndicator'; loadingDiv.textContent = '加载中...';
            area.appendChild(loadingDiv);
        }
        const contact = DataManager.getCurrentContact();
        const avatarContent = contact.avatar;
        let prevTimestamp = null;
        for (let i = start; i < end; i++) {
            const msg = messages[i];
            if (!msg) continue;
            if (msg.type === 'call' && msg.role !== 'system') continue;
            if (msg.role !== 'system' && prevTimestamp !== null && (msg.timestamp - prevTimestamp > TIME_SEPARATOR_THRESHOLD)) {
                const sep = document.createElement('div');
                sep.className = 'time-separator';
                sep.textContent = Utils.formatTimeHM(msg.timestamp);
                area.appendChild(sep);
            }
            if (msg.role === 'system') {
                const div = document.createElement('div'); div.className = 'system-message'; div.textContent = msg.content;
                area.appendChild(div);
            } else {
                if (Utils.isRecallMessage(msg)) {
                    const div = document.createElement('div'); div.className = 'system-message'; div.textContent = msg.content || '您撤回了一条消息';
                    area.appendChild(div);
                    prevTimestamp = msg.timestamp;
                    continue;
                }
                const isUser = msg.role === 'user';
                const row = document.createElement('div'); row.className = `message ${isUser ? 'me' : 'other'}`; row.dataset.index = i;
// 绑定长按事件
row.addEventListener('touchstart', (e) => {
    ChatHandler.handleLongPressStart(e, i);
});
row.addEventListener('touchend', (e) => {
    ChatHandler.handleLongPressEnd(e);
});
row.addEventListener('touchcancel', (e) => {
    ChatHandler.handleLongPressEnd(e);
});
row.addEventListener('mousedown', (e) => {
    ChatHandler.handleLongPressStart(e, i);
});
row.addEventListener('mouseup', (e) => {
    ChatHandler.handleLongPressEnd(e);
});
                if (!isUser) {
                    const avatarDiv = document.createElement('div'); avatarDiv.className = 'avatar';
                    Utils.setImageElement(avatarDiv, avatarContent, '🤖').catch(console.error);
                    row.appendChild(avatarDiv);
                }
                const bubbleWrapper = document.createElement('div'); bubbleWrapper.className = 'bubble-wrapper';
                if (msg.type === 'image') {
                    const bubbleRow = document.createElement('div'); bubbleRow.className = 'bubble-row';
                    const bubble = document.createElement('div'); bubble.className = 'msg-bubble';
                    Utils.loadImageFromDB(msg.content).then(dataUrl => {
                        if (dataUrl) bubble.innerHTML = `<img src="${dataUrl}" alt="image">`;
                        else bubble.textContent = '[图片加载失败]';
                    }).catch(() => bubble.textContent = '[图片加载失败]');
                    const timeSpan = document.createElement('span'); timeSpan.className = 'msg-time'; timeSpan.textContent = Utils.formatTime(msg.timestamp);
                    if (isUser) {
                        bubbleRow.appendChild(timeSpan);
                        bubbleRow.appendChild(bubble);
                    } else {
                        bubbleRow.appendChild(bubble);
                        bubbleRow.appendChild(timeSpan);
                    }
                    bubbleWrapper.appendChild(bubbleRow);
                } else if (msg.type === 'voice' || msg.type === 'voice_sim') {
                    const voiceRow = document.createElement('div'); voiceRow.className = 'voice-row';
                    const duration = msg.duration || (msg.type === 'voice' ? '3"' : '1"');
                    const voiceBubble = document.createElement('div');
                    voiceBubble.className = 'voice-bubble-wechat';
                    let transcript = '';
                    if (msg.type === 'voice') {
                        transcript = msg.transcript || '[语音消息]';
                    } else {
                        transcript = msg.content;
                    }
                    voiceBubble.dataset.transcript = transcript;
                    const icon = document.createElement('i');
                    icon.className = 'fa-solid fa-play voice-icon-wechat';
                    if (msg.type === 'voice') {
                        icon.dataset.audioId = msg.content;
                    } else {
                        icon.dataset.text = msg.content.replace(/'/g, "\\'");
                    }
                    if (msg.type === 'voice') {
                        voiceBubble.addEventListener('click', function(e) {
                            e.stopPropagation();
                            const audioId = this.querySelector('.voice-icon-wechat').dataset.audioId;
                            if (audioId) {
                                window.playVoice(audioId, this.querySelector('.voice-icon-wechat'));
                            }
                        });
                    } else {
                        voiceBubble.addEventListener('click', function(e) {
                            e.stopPropagation();
                            const transcript = this.dataset.transcript;
                            if (transcript) {
                                document.getElementById('voiceTranscriptContent').textContent = transcript;
                                document.getElementById('voiceTranscriptModal').classList.add('active');
                            }
                        });
                    }
                    const durationSpan = document.createElement('span');
                    durationSpan.className = 'voice-duration-wechat';
                    durationSpan.textContent = duration;
                    voiceBubble.appendChild(icon);
                    voiceBubble.appendChild(durationSpan);
                    const timeSpan = document.createElement('span'); timeSpan.className = 'msg-time'; timeSpan.textContent = Utils.formatTime(msg.timestamp);
                    if (isUser) {
                        voiceRow.appendChild(timeSpan);
                        voiceRow.appendChild(voiceBubble);
                    } else {
                        voiceRow.appendChild(voiceBubble);
                        voiceRow.appendChild(timeSpan);
                    }
                    bubbleWrapper.appendChild(voiceRow);
                    if (msg.type === 'voice_sim') {
                        const transcriptDiv = document.createElement('div');
                        transcriptDiv.className = 'voice-transcript';
                        transcriptDiv.textContent = transcript;
                        bubbleWrapper.appendChild(transcriptDiv);
                    }
                } else if (msg.type === 'transfer') {
                    const transferRow = document.createElement('div'); transferRow.className = 'transfer-row';
                    const transferBubble = document.createElement('div');
                    transferBubble.className = 'transfer-bubble';
                    transferBubble.dataset.index = i;
                    let transferData = { amount: '0.00', note: '', status: 'pending' };
                    if (typeof msg.content === 'object') {
                        transferData = msg.content;
                    } else if (typeof msg.content === 'string') {
                        try {
                            transferData = JSON.parse(msg.content);
                        } catch (e) {
                            transferData = { amount: msg.content, note: '', status: 'pending' };
                        }
                    }
                    if (!transferData.status) transferData.status = 'pending';
                    let statusText = '';
                    if (transferData.status === 'pending') statusText = '待收款';
                    else if (transferData.status === 'accepted') statusText = '已收款';
                    else if (transferData.status === 'rejected') statusText = '已退回';
                    transferBubble.innerHTML = `
                        <div class="transfer-amount">¥${transferData.amount}</div>
                        ${transferData.note ? `<div class="transfer-note">${transferData.note}</div>` : ''}
                        <div class="transfer-status">${statusText}</div>
                    `;
                    const timeSpan = document.createElement('span'); timeSpan.className = 'msg-time'; timeSpan.textContent = Utils.formatTime(msg.timestamp);
                    if (isUser) {
                        transferRow.appendChild(timeSpan);
                        transferRow.appendChild(transferBubble);
                    } else {
                        transferRow.appendChild(transferBubble);
                        transferRow.appendChild(timeSpan);
                    }
                    bubbleWrapper.appendChild(transferRow);
                } else if (msg.type === 'intimate') {
                    const isUser = msg.role === 'user';
                    const intimateRow = document.createElement('div'); intimateRow.className = 'intimate-row';
                    const intimateBubble = document.createElement('div');
                    intimateBubble.className = isUser ? 'intimate-bubble' : 'intimate-card-bubble';
                    intimateBubble.dataset.index = i;
                    let intimateData = { amount: '0.00', note: '', status: 'pending' };
                    if (typeof msg.content === 'object') {
                        intimateData = msg.content;
                    } else if (typeof msg.content === 'string') {
                        try {
                            intimateData = JSON.parse(msg.content);
                        } catch (e) {
                            intimateData = { amount: msg.content, note: '', status: 'pending' };
                        }
                    }
                    if (!intimateData.status) intimateData.status = 'pending';
                    let statusText = '';
                    if (intimateData.status === 'pending') statusText = isUser ? '待接收' : '待接收';
                    else if (intimateData.status === 'accepted') statusText = '已收款';
                    else if (intimateData.status === 'rejected') statusText = '已退回';
                    intimateBubble.innerHTML = `
                        <div class="intimate-amount">¥${intimateData.amount}</div>
                        ${intimateData.note ? `<div class="intimate-note">${intimateData.note}</div>` : ''}
                        <div class="intimate-status">${statusText}</div>
                    `;
                    const timeSpan = document.createElement('span'); timeSpan.className = 'msg-time'; timeSpan.textContent = Utils.formatTime(msg.timestamp);
                    if (isUser) {
                        intimateRow.appendChild(timeSpan);
                        intimateRow.appendChild(intimateBubble);
                    } else {
                        intimateRow.appendChild(intimateBubble);
                        intimateRow.appendChild(timeSpan);
                    }
                    bubbleWrapper.appendChild(intimateRow);
                } else {
                    const bubbleRow = document.createElement('div'); bubbleRow.className = 'bubble-row';
                    const bubble = document.createElement('div'); bubble.className = 'msg-bubble';
                    bubble.textContent = msg.content;
                    const timeSpan = document.createElement('span'); timeSpan.className = 'msg-time'; timeSpan.textContent = Utils.formatTime(msg.timestamp);
                    if (isUser) {
                        bubbleRow.appendChild(timeSpan);
                        bubbleRow.appendChild(bubble);
                    } else {
                        bubbleRow.appendChild(bubble);
                        bubbleRow.appendChild(timeSpan);
                    }
                    bubbleWrapper.appendChild(bubbleRow);
                }
                row.appendChild(bubbleWrapper);
                area.appendChild(row);
            }
            if (msg.role !== 'system' && !Utils.isRecallMessage(msg)) {
                prevTimestamp = msg.timestamp;
            } else if (Utils.isRecallMessage(msg)) {
                prevTimestamp = msg.timestamp;
            }
        }
        ChatHandler.prevStart = start;
    },
    renderConfigList() {
        const container = document.getElementById('configList');
        if (!container) return;
        container.innerHTML = '';
        DataManager.apiConfigs.forEach(config => {
            const item = document.createElement('div'); item.className = `config-item ${config.id === DataManager.activeConfigId ? 'active' : ''}`; item.dataset.id = config.id;
            const header = document.createElement('div'); header.className = 'config-header-row';
            header.innerHTML = `<div class="config-name"><span>${config.name}</span>${config.id === DataManager.activeConfigId ? '<span class="active-badge">使用中</span>' : ''}</div><div class="config-actions"><button class="edit-config" data-id="${config.id}"><i class="fa-solid fa-pen-to-square"></i></button><button class="delete-config" data-id="${config.id}"><i class="fa-solid fa-trash-can"></i></button></div>`;
            item.appendChild(header);
            const detail = document.createElement('div'); detail.className = 'config-detail';
            detail.innerHTML = `<div>URL: ${config.base_url || '未设置'}</div><div>Key: ${config.api_key ? '••••••' + config.api_key.slice(-4) : '未设置'}</div>`;
            item.appendChild(detail);
            const modelRow = document.createElement('div'); modelRow.className = 'config-model-row';
            const select = document.createElement('select'); select.id = `modelSelect_${config.id}`;
            if (config.models && config.models.length > 0) {
                config.models.forEach(m => { const option = document.createElement('option'); option.value = m.id; option.textContent = m.name || m.id; if (m.id === config.currentModel) option.selected = true; select.appendChild(option); });
            } else {
                const option = document.createElement('option'); option.value = config.currentModel || ''; option.textContent = config.currentModel || '请输入模型名称';
                select.appendChild(option);
            }
            select.setAttribute('contenteditable', 'true');
            const fetchBtn = document.createElement('button'); fetchBtn.textContent = '拉取模型列表'; fetchBtn.dataset.id = config.id;
            modelRow.appendChild(select); modelRow.appendChild(fetchBtn);
            item.appendChild(modelRow);
            if (config.id !== DataManager.activeConfigId) {
                const activateBtn = document.createElement('button'); activateBtn.textContent = '使用此配置'; activateBtn.className = 'activate-config'; activateBtn.dataset.id = config.id;
                item.appendChild(activateBtn);
                activateBtn.addEventListener('click', () => { DataManager.activeConfigId = config.id; DataManager.saveConfigs(); UIManager.renderConfigList(); });
            }
            container.appendChild(item);
            fetchBtn.addEventListener('click', () => ConfigHandler.fetchModelsForConfig(config.id));
            select.addEventListener('change', (e) => { config.currentModel = e.target.value; DataManager.saveConfigs(); });
            select.addEventListener('input', (e) => { config.currentModel = e.target.innerText; DataManager.saveConfigs(); });
        });
        document.querySelectorAll('.edit-config').forEach(btn => { btn.addEventListener('click', (e) => { e.stopPropagation(); ConfigHandler.editConfig(btn.dataset.id); }); });
        document.querySelectorAll('.delete-config').forEach(btn => { btn.addEventListener('click', (e) => { e.stopPropagation(); ConfigHandler.deleteConfig(btn.dataset.id); }); });
    },
    renderIconGrid() {
        const grid = document.getElementById('iconGrid');
        if (!grid) return;
        const appList = [
            { key: 'chat', name: '信息', defaultIcon: 'fa-comment-dots' }, { key: 'settings', name: '设置', defaultIcon: 'fa-gear' },
            { key: 'worldbook', name: '世界书', defaultIcon: 'fa-book-open' }, { key: 'beautify', name: '美化', defaultIcon: 'fa-palette' },
            { key: 'app4', name: '情侣空间', defaultIcon: 'fa-heart' }, { key: 'music', name: '音乐', defaultIcon: 'fa-music' },
            { key: 'video', name: '视频', defaultIcon: 'fa-video' }, { key: 'calculator', name: '计算器', defaultIcon: 'fa-calculator' },
            { key: 'browser', name: '浏览器', defaultIcon: 'fa-globe' }, { key: 'phone', name: '电话', defaultIcon: 'fa-phone' }
        ];
        grid.innerHTML = '';
        appList.forEach(app => {
            const item = document.createElement('div'); item.className = 'icon-item';
            const iconId = DataManager.beautifySettings.appIcons[app.key];
            item.innerHTML = `<div class="icon-bg" id="preview-${app.key}"><i class="fa-solid ${app.defaultIcon}"></i></div><span class="icon-label">${app.name}</span><div class="icon-actions"><button data-app="${app.key}">上传</button><button class="clear-btn" data-app="${app.key}"><i class="fa-solid fa-trash-can"></i></button></div>`;
            grid.appendChild(item);
            if (iconId) {
                Utils.loadImageFromDB(iconId).then(dataUrl => {
                    if (dataUrl) { const previewDiv = document.getElementById(`preview-${app.key}`); if (previewDiv) previewDiv.innerHTML = `<img src="${dataUrl}" alt="icon">`; }
                }).catch(console.error);
            }
        });
        document.querySelectorAll('#iconGrid button:not(.clear-btn)').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const appKey = btn.dataset.app;
                const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none'; document.body.appendChild(fileInput);
                fileInput.click();
                fileInput.addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        Utils.showToast('正在处理图片...', 0);
                        const originalDataUrl = event.target.result;
                        try {
                            const compressedDataUrl = await Utils.compressImage(originalDataUrl, 200, 0.8);
                            const imageId = Utils.generateImageId(`app_icon_${appKey}`);
                            await Utils.saveImageToDB(imageId, compressedDataUrl);
                            DataManager.beautifySettings.appIcons[appKey] = imageId;
                            DataManager.saveBeautifySettings();
                            const previewDiv = document.getElementById(`preview-${appKey}`);
                            if (previewDiv) previewDiv.innerHTML = `<img src="${compressedDataUrl}" alt="icon">`;
                            UIManager.applyAllAppIcons();
                            Utils.showToast('图片上传成功', 1500);
                        } catch (err) { Utils.showToast('图片处理失败', 2000); }
                    };
                    reader.readAsDataURL(file);
                });
            });
        });
        document.querySelectorAll('#iconGrid .clear-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const appKey = btn.dataset.app;
                const oldId = DataManager.beautifySettings.appIcons[appKey];
                if (oldId) await Utils.deleteImageFromDB(oldId).catch(console.error);
                delete DataManager.beautifySettings.appIcons[appKey];
                DataManager.saveBeautifySettings();
                UIManager.applyAllAppIcons();
                const previewDiv = document.getElementById(`preview-${appKey}`);
                const app = appList.find(a => a.key === appKey);
                if (previewDiv && app) previewDiv.innerHTML = `<i class="fa-solid ${app.defaultIcon}"></i>`;
            });
        });
    },
    applyAllAppIcons() {
        const appList = [
            { key: 'chat', defaultIcon: 'fa-comment-dots' }, { key: 'settings', defaultIcon: 'fa-gear' },
            { key: 'worldbook', defaultIcon: 'fa-book-open' }, { key: 'beautify', defaultIcon: 'fa-palette' },
            { key: 'app4', defaultIcon: 'fa-heart' }, { key: 'music', defaultIcon: 'fa-music' },
            { key: 'video', defaultIcon: 'fa-video' }, { key: 'calculator', defaultIcon: 'fa-calculator' },
            { key: 'browser', defaultIcon: 'fa-globe' }, { key: 'phone', defaultIcon: 'fa-phone' }
        ];
        appList.forEach(async app => {
            const iconId = DataManager.beautifySettings.appIcons[app.key];
            const desktopIcon = document.getElementById(`icon-${app.key}`);
            if (desktopIcon) {
                if (iconId) { const dataUrl = await Utils.loadImageFromDB(iconId); if (dataUrl) desktopIcon.innerHTML = `<img src="${dataUrl}" alt="icon">`; else desktopIcon.innerHTML = `<i class="fa-solid ${app.defaultIcon}"></i>`; }
                else desktopIcon.innerHTML = `<i class="fa-solid ${app.defaultIcon}"></i>`;
            }
            if (app.key === 'chat') {
                const dockIcon = document.getElementById('icon-chat-dock');
                if (dockIcon) {
                    if (iconId) { const dataUrl = await Utils.loadImageFromDB(iconId); if (dataUrl) dockIcon.innerHTML = `<img src="${dataUrl}" alt="icon">`; else dockIcon.innerHTML = `<i class="fa-solid fa-comment-dots"></i>`; }
                    else dockIcon.innerHTML = `<i class="fa-solid fa-comment-dots"></i>`;
                }
            }
        });
    },
    renderWorldBookList() {
        const container = document.getElementById('worldbookList');
        if (!container) return;
        container.innerHTML = '';
        DataManager.worldBooks.forEach(book => {
            const item = document.createElement('div'); item.className = 'worldbook-item'; item.dataset.id = book.id;
            const header = document.createElement('div'); header.className = 'worldbook-item-header';
            header.innerHTML = `<div class="worldbook-name"><span>${book.name}</span><span class="worldbook-badge ${book.global ? 'global' : ''}">${book.global ? '全局' : '专用'}</span></div><div class="worldbook-actions-item"><button class="edit-worldbook" data-id="${book.id}"><i class="fa-solid fa-pen-to-square"></i></button><button class="delete-worldbook" data-id="${book.id}"><i class="fa-solid fa-trash-can"></i></button></div>`;
            item.appendChild(header);
            const contentPreview = document.createElement('div'); contentPreview.className = 'worldbook-content-preview'; contentPreview.textContent = book.content || '无内容';
            item.appendChild(contentPreview);
            if (!book.global && book.boundRoles && book.boundRoles.length > 0) {
                const boundDiv = document.createElement('div'); boundDiv.className = 'worldbook-bound';
                const boundNames = book.boundRoles.map(id => { const contact = DataManager.contacts.find(c => c.id === id); return contact ? Utils.getDisplayName(contact) : '未知'; }).join('、');
                boundDiv.innerHTML = `绑定角色：<span>${boundNames}</span>`;
                item.appendChild(boundDiv);
            } else if (!book.global) {
                const boundDiv = document.createElement('div'); boundDiv.className = 'worldbook-bound'; boundDiv.innerHTML = `未绑定任何角色`;
                item.appendChild(boundDiv);
            }
            container.appendChild(item);
        });
        document.querySelectorAll('.edit-worldbook').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                WorldBookHandler.openEditModal(id);
            });
        });
        document.querySelectorAll('.delete-worldbook').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                WorldBookHandler.deleteWorldBook(id);
            });
        });
    },
    refreshWorldBookContactCheckboxes(selectedIds = []) {
        const container = document.getElementById('worldBookContactCheckboxes');
        if (!container) return;
        container.innerHTML = '';
        DataManager.contacts.forEach(contact => {
            const label = document.createElement('label'); label.style.display = 'block'; label.style.marginBottom = '4px';
            const cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = contact.id; cb.checked = selectedIds.includes(contact.id);
            label.appendChild(cb); label.appendChild(document.createTextNode(' ' + Utils.getDisplayName(contact)));
            container.appendChild(label);
        });
    },
    async updateContactOptionsAvatar() {
        const contact = DataManager.getCurrentContact();
        const largeDiv = document.getElementById('contactAvatarLarge');
        if (!largeDiv) return;
        largeDiv.innerHTML = '';
        await Utils.setImageElement(largeDiv, contact.avatar, '🤖');
    },
    updateContactChatBgPreview() {
        const contact = DataManager.getCurrentContact();
        const preview = document.getElementById('contactChatBgPreview');
        if (!preview) return;
        if (contact.chatBackground) {
            Utils.loadImageFromDB(contact.chatBackground).then(dataUrl => {
                if (dataUrl) {
                    preview.style.backgroundImage = `url('${dataUrl}')`;
                    preview.textContent = '';
                } else {
                    preview.style.backgroundImage = '';
                    preview.textContent = '默认背景';
                }
            }).catch(() => {
                preview.style.backgroundImage = '';
                preview.textContent = '默认背景';
            });
        } else {
            preview.style.backgroundImage = '';
            preview.textContent = '默认背景';
        }
    },
    updateContactBubbleCssInput() {
        const contact = DataManager.getCurrentContact();
        const input = document.getElementById('contactBubbleCssInput');
        if (input) input.value = contact.bubbleCss || '';
    },
    async updateAIStatusWidget() {
        const contacts = DataManager.contacts;
        if (contacts.length === 0) {
            document.getElementById('aiStatusName').textContent = '暂无AI角色';
            document.getElementById('aiStatusWater').innerHTML = '';
            document.getElementById('aiStatusBreakfast').innerHTML = '';
            document.getElementById('aiStatusLunch').innerHTML = '';
            document.getElementById('aiStatusDinner').innerHTML = '';
            document.getElementById('aiStatusLocation').innerHTML = '';
            return;
        }
        if (DataManager.currentStatusIndex >= contacts.length) DataManager.currentStatusIndex = 0;
        const contact = contacts[DataManager.currentStatusIndex];
        if (!contact) return;
        const avatarDiv = document.getElementById('aiStatusAvatar');
        avatarDiv.innerHTML = '';
        await Utils.setImageElement(avatarDiv, contact.avatar, '🤖');
        document.getElementById('aiStatusName').textContent = Utils.getDisplayName(contact);
        const online = Math.random() > 0.3;
        const badge = document.getElementById('aiStatusBadge');
        badge.className = `ai-status-badge ${online ? '' : 'offline'}`;
        const details = this.generateAIDailyDetails(contact);
        document.getElementById('aiStatusWater').innerHTML = `<i class="fa-solid fa-droplet ai-status-water"></i> ${details.water}`;
        document.getElementById('aiStatusBreakfast').innerHTML = `<i class="fa-solid fa-sun ai-status-breakfast"></i> 早餐：${details.breakfast}`;
        document.getElementById('aiStatusLunch').innerHTML = `<i class="fa-solid fa-cloud-sun ai-status-lunch"></i> 午餐：${details.lunch}`;
        document.getElementById('aiStatusDinner').innerHTML = `<i class="fa-solid fa-moon ai-status-dinner"></i> 晚餐：${details.dinner}`;
        document.getElementById('aiStatusLocation').innerHTML = `<i class="fa-solid fa-location-dot ai-status-location"></i> ${details.location}`;
        await this.updateAIStatusBg();
    },
    async updateAIStatusBg() {
        const bgId = DataManager.beautifySettings.widgetBackgrounds?.aiStatus;
        const bgDiv = document.getElementById('aiStatusBg');
        if (bgDiv && bgId) {
            const dataUrl = await Utils.loadImageFromDB(bgId);
            if (dataUrl) bgDiv.style.backgroundImage = `url('${dataUrl}')`;
            else bgDiv.style.backgroundImage = '';
        } else if (bgDiv) bgDiv.style.backgroundImage = '';
    },
    async updateWeatherWidgetBg() {
        const bgId = DataManager.beautifySettings.widgetBackgrounds?.weather;
        const bgDiv = document.getElementById('weatherWidgetBg');
        if (bgDiv && bgId) {
            const dataUrl = await Utils.loadImageFromDB(bgId);
            if (dataUrl) bgDiv.style.backgroundImage = `url('${dataUrl}')`;
            else bgDiv.style.backgroundImage = '';
        } else if (bgDiv) bgDiv.style.backgroundImage = '';
    },
    async updateCalendarWidgetBg() {
        const bgId = DataManager.beautifySettings.widgetBackgrounds?.calendar;
        const bgDiv = document.getElementById('calendarWidgetBg');
        if (bgDiv && bgId) {
            const dataUrl = await Utils.loadImageFromDB(bgId);
            if (dataUrl) bgDiv.style.backgroundImage = `url('${dataUrl}')`;
            else bgDiv.style.backgroundImage = '';
        } else if (bgDiv) bgDiv.style.backgroundImage = '';
    },
    generateAIDailyDetails(contact) {
        const now = new Date();
        const hour = now.getHours();
        let breakfastStatus = '', lunchStatus = '', dinnerStatus = '';
        if (hour < 10) { breakfastStatus = '准备吃'; lunchStatus = '计划午餐'; dinnerStatus = '计划晚餐'; }
        else if (hour < 14) { breakfastStatus = '已吃'; lunchStatus = '准备吃'; dinnerStatus = '计划晚餐'; }
        else if (hour < 18) { breakfastStatus = '已吃'; lunchStatus = '已吃'; dinnerStatus = '准备吃'; }
        else { breakfastStatus = '已吃'; lunchStatus = '已吃'; dinnerStatus = '已吃'; }
        const personality = (contact.personality || '').toLowerCase();
        let breakfastPool = ['豆浆+油条', '包子+粥', '三明治+牛奶', '煎蛋+吐司', '燕麦+水果', '馄饨', '肠粉'];
        let lunchPool = ['牛肉面', '红烧肉+米饭', '鱼香肉丝+米饭', '炸鸡+薯条', '沙拉+意面', '饺子', '炒饭'];
        let dinnerPool = ['米饭+炒菜', '火锅', '寿司', '牛排+红酒', '披萨', '烤鱼', '麻辣香锅'];
        let placePool = ['书房', '咖啡馆', '公园', '办公室', '家里', '图书馆', '健身房', '超市', '餐厅', '电影院'];
        let activityPool = ['工作', '学习', '休息', '散步', '看书', '运动', '看电影', '听音乐'];
        if (personality.includes('健康') || personality.includes('健身') || personality.includes('减肥')) {
            breakfastPool = ['燕麦+水果', '水煮蛋+牛奶', '全麦面包+酸奶', '蔬菜沙拉'];
            lunchPool = ['鸡胸肉沙拉', '糙米+蔬菜', '三文鱼+西兰花', '藜麦碗'];
            dinnerPool = ['蒸鱼+蔬菜', '豆腐汤', '蔬菜沙拉', '水果拼盘'];
            placePool = ['健身房', '瑜伽馆', '公园', '家里'];
            activityPool = ['健身', '跑步', '冥想', '拉伸'];
        } else if (personality.includes('美食') || personality.includes('吃货')) {
            breakfastPool = ['灌汤包+豆浆', '煎饼果子', '肠粉+粥', '班尼迪克蛋'];
            lunchPool = ['红烧肉+米饭', '麻辣香锅', '日式拉面', '牛排+薯条'];
            dinnerPool = ['火锅', '自助餐', '烤肉', '海鲜大餐'];
            placePool = ['餐厅', '美食街', '咖啡馆', '家里'];
            activityPool = ['品尝美食', '研究菜谱', '探店', '做饭'];
        } else if (personality.includes('宅') || personality.includes('家里蹲')) {
            breakfastPool = ['泡面', '外卖', '饼干+牛奶', '速冻水饺'];
            lunchPool = ['外卖', '泡面', '剩菜', '速食'];
            dinnerPool = ['外卖', '泡面', '零食', '速冻食品'];
            placePool = ['家里', '床上', '沙发', '电脑前'];
            activityPool = ['打游戏', '看番', '刷剧', '睡觉'];
        } else if (personality.includes('运动') || personality.includes('户外')) {
            breakfastPool = ['能量棒+香蕉', '燕麦+牛奶', '全麦面包+鸡蛋'];
            lunchPool = ['鸡胸肉+糙米', '意面+蔬菜', '三明治+水果'];
            dinnerPool = ['鱼+蔬菜', '沙拉+鸡胸肉', '蛋白粉+牛奶'];
            placePool = ['操场', '健身房', '公园', '山脚下'];
            activityPool = ['跑步', '打球', '徒步', '骑行'];
        } else if (personality.includes('优雅') || personality.includes('贵族')) {
            breakfastPool = ['英式早餐', '法式吐司+香槟', '鱼子酱+薄饼'];
            lunchPool = ['牛排+红酒', '龙虾+意面', '鹅肝+松露'];
            dinnerPool = ['法式大餐', '日式怀石料理', '意式晚宴'];
            placePool = ['高级餐厅', '私人会所', '别墅', '游艇'];
            activityPool = ['品酒', '听音乐会', '看歌剧', '社交'];
        }
        const breakfast = breakfastStatus + '：' + breakfastPool[Math.floor(Math.random() * breakfastPool.length)];
        const lunch = lunchStatus + '：' + lunchPool[Math.floor(Math.random() * lunchPool.length)];
        const dinner = dinnerStatus + '：' + dinnerPool[Math.floor(Math.random() * dinnerPool.length)];
        const place = placePool[Math.floor(Math.random() * placePool.length)];
        const activity = activityPool[Math.floor(Math.random() * activityPool.length)];
        const location = `在${place}${activity}`;
        const water = Math.floor(Math.random() * 800 + 500) + 'ml';
        return { water, breakfast, lunch, dinner, location };
    }
};

// ==================== 聊天处理模块 ====================
const ChatHandler = {
    currentVisibleStart: 0, currentVisibleEnd: 0, isLoadingMore: false, prevStart: 0,
    longPressTimer: null,
    isMultiSelectMode: false,
    selectedMessages: new Set(),
    isSendingChunks: false,
    stopSendingFlag: false,

    addMessageToCurrent(text, isUser, isSystem = false, type = 'text', extra = {}) {
        const contact = DataManager.getCurrentContact();
        const role = isSystem ? 'system' : (isUser ? 'user' : 'assistant');
        let content = text;
        if (type === 'transfer' && typeof text === 'object') content = text;
        const msg = { role, type, content, timestamp: Date.now(), ...extra };
        contact.messages.push(msg);
        DataManager.saveContacts();
        if (document.getElementById('chatDetailPage').style.display === 'flex') {
            const total = contact.messages.length;
            if (this.currentVisibleEnd === total - 1) this.currentVisibleEnd = total;
            else {
                const area = document.getElementById('messageArea');
                if (area && area.scrollTop + area.clientHeight >= area.scrollHeight - 50) this.currentVisibleEnd = total;
            }
            UIManager.renderMessages(contact.messages, this.currentVisibleStart, this.currentVisibleEnd);
            setTimeout(() => { const area = document.getElementById('messageArea'); if (area) area.scrollTop = area.scrollHeight; }, 0);
        }
        UIManager.renderContactList();
    },
    sendTransfer(amount, note) {
        const contact = DataManager.getCurrentContact();
        if (contact.blocked) { Utils.showToast('你已将对方拉黑，无法发送消息'); return; }
        if (!amount || parseFloat(amount) <= 0) { Utils.showToast('请输入有效金额'); return; }
        const transferData = { amount: parseFloat(amount).toFixed(2), note: note || '', status: 'pending' };
        this.stopSendingChunks();
        this.addMessageToCurrent(transferData, true, false, 'transfer');
        Utils.showToast('转账已发送');
        if (contact) this.askAIToHandleTransfer(contact, contact.messages.length - 1);
    },
    async askAIToHandleTransfer(contact, msgIndex) {
        const msg = contact.messages[msgIndex];
        if (!msg || msg.type !== 'transfer' || msg.role !== 'user') return;
        let transferData = msg.content;
        if (typeof transferData === 'string') {
            try { transferData = JSON.parse(transferData); } catch(e) { return; }
        }
        if (transferData.status !== 'pending') return;
        const prompt = `用户向你转账 ${transferData.amount} 元，留言：${transferData.note || '无'}。请根据你的人设决定是否接收这笔转账。请回复“接收”或“退回”，只回复这两个词之一。`;
        let config = contact.configId ? DataManager.apiConfigs.find(c => c.id === contact.configId) : DataManager.getActiveConfig();
        if (!config || !config.base_url || !config.api_key || !config.currentModel) { Utils.showToast('AI 未配置，无法处理转账'); return; }
        Utils.showToast('AI 正在处理转账...', 0);
        try {
            const response = await fetch(`${BACKEND_URL}/api/chat`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ base_url: config.base_url, api_key: config.api_key, model: config.currentModel, messages: [{ role: 'system', content: contact.personality }, { role: 'user', content: prompt }] })
            });
            if (!response.ok) throw new Error('API请求失败');
            const data = await response.json();
            const reply = data.choices?.[0]?.message?.content?.trim() || '';
            if (reply.includes('接收') || reply.includes('收款') || reply.includes('收下') || reply.includes('接受')) {
                transferData.status = 'accepted';
                const amount = parseFloat(transferData.amount);
                DataManager.updateBalance(-amount);
                DataManager.addTransaction({ id: Date.now(), name: `转账给 ${Utils.getDisplayName(contact)}`, amount: -amount, date: new Date().toLocaleDateString(), type: 'transfer' });
                WalletManager.renderWallet();
            } else { transferData.status = 'rejected'; }
            msg.content = transferData;
            DataManager.saveContacts();
            if (document.getElementById('chatDetailPage').style.display === 'flex') UIManager.renderMessages(contact.messages, this.currentVisibleStart, this.currentVisibleEnd);
            Utils.showToast(transferData.status === 'accepted' ? '转账已接收' : '转账已退回');
        } catch(err) { Utils.showToast('处理转账时出错'); }
    },
    parseAIResponseForTransfer(aiReply) {
        const regex = /【转账\|([\d.]+)\|(.*?)】/;
        const match = aiReply.match(regex);
        if (match) {
            const amount = parseFloat(match[1]).toFixed(2);
            const note = match[2] || '';
            const cleanReply = aiReply.replace(regex, '').trim();
            return { transfer: { amount, note }, cleanReply };
        }
        return null;
    },
    parseAIResponseForIntimate(aiReply) {
        const regex = /【亲密付\|([\d.]+)\|(.*?)】/;
        const match = aiReply.match(regex);
        if (match) {
            const amount = parseFloat(match[1]).toFixed(2);
            const note = match[2] || '';
            const cleanReply = aiReply.replace(regex, '').trim();
            return { intimate: { amount, note }, cleanReply };
        }
        return null;
    },
    async askAIToHandleIntimate(contact, msgIndex) {
        const msg = contact.messages[msgIndex];
        if (!msg || msg.type !== 'intimate' || msg.role !== 'user') return;
        let intimateData = msg.content;
        if (typeof intimateData === 'string') {
            try { intimateData = JSON.parse(intimateData); } catch(e) { return; }
        }
        if (intimateData.status !== 'pending') return;
        const prompt = `用户向你发起亲密付转账 ${intimateData.amount} 元，留言：${intimateData.note || '无'}。请根据你的人设决定是否接收这笔转账。请回复“接收”或“退回”，只回复这两个词之一。`;
        let config = contact.configId ? DataManager.apiConfigs.find(c => c.id === contact.configId) : DataManager.getActiveConfig();
        if (!config || !config.base_url || !config.api_key || !config.currentModel) { Utils.showToast('AI 未配置，无法处理亲密付'); return; }
        Utils.showToast('AI 正在处理亲密付...', 0);
        try {
            const response = await fetch(`${BACKEND_URL}/api/chat`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ base_url: config.base_url, api_key: config.api_key, model: config.currentModel, messages: [{ role: 'system', content: contact.personality }, { role: 'user', content: prompt }] })
            });
            if (!response.ok) throw new Error('API请求失败');
            const data = await response.json();
            const reply = data.choices?.[0]?.message?.content?.trim() || '';
            if (reply.includes('接收') || reply.includes('收款') || reply.includes('收下') || reply.includes('接受')) {
                intimateData.status = 'accepted';
                const amount = parseFloat(intimateData.amount);
                if (DataManager.wallet.balance >= amount) {
                    DataManager.updateBalance(-amount);
                    DataManager.addTransaction({ id: Date.now(), name: `亲密付给 ${Utils.getDisplayName(contact)}`, amount: -amount, date: new Date().toLocaleDateString(), type: 'intimate' });
                    WalletManager.renderWallet();
                } else { Utils.showToast('余额不足，无法完成亲密付'); intimateData.status = 'pending'; }
            } else { intimateData.status = 'rejected'; }
            msg.content = intimateData;
            DataManager.saveContacts();
            if (document.getElementById('chatDetailPage').style.display === 'flex') UIManager.renderMessages(contact.messages, this.currentVisibleStart, this.currentVisibleEnd);
            Utils.showToast(intimateData.status === 'accepted' ? '亲密付已接收' : '亲密付已退回');
        } catch(err) { Utils.showToast('处理亲密付时出错'); }
    },
    sendOnlyMessage() {
        const messageInput = document.getElementById('messageInput');
        const text = messageInput.value.trim();
        if (!text) return;
        const contact = DataManager.getCurrentContact();
        if (contact.blocked) { Utils.showToast('你已将对方拉黑，无法发送消息'); return; }
        this.stopSendingChunks();
        this.addMessageToCurrent(text, true, false, 'text');
        messageInput.value = '';
    },
    async sendImage(file) {
        const contact = DataManager.getCurrentContact();
        if (contact.blocked) { Utils.showToast('你已将对方拉黑，无法发送消息'); return; }
        this.stopSendingChunks();
        Utils.showToast('正在处理图片...', 0);
        const reader = new FileReader();
        reader.onload = async (event) => {
            const originalDataUrl = event.target.result;
            try {
                const compressedDataUrl = await Utils.compressImage(originalDataUrl, 800, 0.9);
                const imageId = Utils.generateImageId('chat_img');
                await Utils.saveImageToDB(imageId, compressedDataUrl);
                this.addMessageToCurrent(imageId, true, false, 'image');
                Utils.showToast('图片发送成功，正在识别...', 0);

                // Call image recognition and add result as a new message
                const recognitionResult = await Utils.recognizeImage(imageId);
                this.addMessageToCurrent(recognitionResult, false, false, 'text');
                Utils.showToast('图片识别完成', 1500);

            } catch (err) {
                const errorMessage = `图片处理或识别失败: ${err.message}`;
                Utils.showToast(errorMessage, 3000);
                this.addMessageToCurrent(`[${errorMessage}]`, false, true, 'text');
            }
        };
        reader.readAsDataURL(file);
    },
    sendSimulatedVoice(text) {
        const finalText = text || document.getElementById('messageInput').value.trim();
        if (!finalText) { Utils.showToast('请输入要模拟的语音内容'); return; }
        const contact = DataManager.getCurrentContact();
        if (contact.blocked) { Utils.showToast('你已将对方拉黑，无法发送消息'); return; }
        this.stopSendingChunks();
        this.addMessageToCurrent(finalText, true, false, 'voice_sim', { duration: '1"' });
        if (!text) document.getElementById('messageInput').value = '';
        Utils.showToast('模拟语音已发送');
    },
    mediaRecorder: null, audioChunks: [], isRecording: false,
    async startRecording() {
        if (this.isRecording) { if (this.mediaRecorder && this.mediaRecorder.state === 'recording') this.mediaRecorder.stop(); return; }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            Utils.showToast('开始录音...', 0);
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];
            this.mediaRecorder.ondataavailable = e => this.audioChunks.push(e.data);
            this.mediaRecorder.onstop = async () => {
                const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
                const transcript = await Utils.recognizeSpeech(blob);
                const reader = new FileReader();
                reader.onload = async (e) => {
                    const base64 = e.target.result;
                    const audioId = Utils.generateImageId('voice');
                    await Utils.saveImageToDB(audioId, base64);
                    const contact = DataManager.getCurrentContact();
                    if (contact.blocked) { Utils.showToast('你已将对方拉黑，无法发送消息'); return; }
                    this.stopSendingChunks();
                    this.addMessageToCurrent(audioId, true, false, 'voice', { duration: '3"', transcript: transcript });
                    Utils.showToast('录音已发送' + (transcript ? ' (已识别)' : ''));
                };
                reader.readAsDataURL(blob);
                stream.getTracks().forEach(track => track.stop());
                this.isRecording = false;
                document.getElementById('voiceMicIcon').classList.remove('recording');
            };
            this.mediaRecorder.start();
            this.isRecording = true;
            document.getElementById('voiceMicIcon').classList.add('recording');
        } catch(err) { Utils.showToast('无法访问麦克风', 2000); }
    },
    stopSendingChunks() { if (this.isSendingChunks) { this.stopSendingFlag = true; this.isSendingChunks = false; } },
    splitIntoSentences(text) {
        const regex = /[。！？.!?]+/;
        let sentences = [], lastIndex = 0, match;
        while ((match = regex.exec(text.slice(lastIndex))) !== null) {
            const end = lastIndex + match.index + match[0].length;
            const sentence = text.slice(lastIndex, end).trim();
            if (sentence) sentences.push(sentence);
            lastIndex = end;
        }
        if (lastIndex < text.length) { const remaining = text.slice(lastIndex).trim(); if (remaining) sentences.push(remaining); }
        if (sentences.length <= 1) return [text];
        return sentences;
    },
    async sendAIMessagesInChunks(sentences) {
        if (!sentences || sentences.length === 0) return;
        this.isSendingChunks = true;
        this.stopSendingFlag = false;
        for (let i = 0; i < sentences.length; i++) {
            if (this.stopSendingFlag) break;
            this.addMessageToCurrent(sentences[i], false, false, 'text');
            if (i < sentences.length - 1) await new Promise(resolve => setTimeout(resolve, 800));
        }
        this.isSendingChunks = false;
        this.stopSendingFlag = false;
    },
    async handleSendWithAI() {
        const messageInput = document.getElementById('messageInput');
        const recordBtn = document.getElementById('recordBtn');
        const loadingIndicator = document.getElementById('loadingIndicator');
        const text = messageInput.value.trim();
        const contact = DataManager.getCurrentContact();
        if (contact.blocked) { Utils.showToast('你已将对方拉黑，无法发送消息'); return; }

        if (text) {
            this.addMessageToCurrent(text, true, false, 'text');
            messageInput.value = '';
        }

        const lastMessage = contact.messages.length ? contact.messages[contact.messages.length - 1] : null;
        // 只有在有新文本输入，或者最后一条消息是用户消息（如刚发送的图片）时才继续
        if (!text && (!lastMessage || lastMessage.role !== 'user')) {
            return; // 没有新内容可供AI处理
        }

        if (contact.selectiveReplyEnabled && Math.random() < 0.3) {
            const msgs = ['我现在有点忙，稍后再聊。','正在睡觉，别吵我...','心情不好，不想说话。','我们冷战吧，暂时不想理你。','有事在忙，晚点回复。'];
            this.addMessageToCurrent(msgs[Math.floor(Math.random()*msgs.length)], false, false, 'text');
            Utils.showToast('AI选择暂时不回复');
            messageInput.disabled = false; recordBtn.style.pointerEvents = 'auto'; recordBtn.style.opacity = '1'; loadingIndicator.style.display = 'none';
            return;
        }

        let config = contact.configId ? DataManager.apiConfigs.find(c => c.id === contact.configId) : DataManager.getActiveConfig();
        if (!config || !config.base_url || !config.api_key || !config.currentModel) { Utils.showToast('请先在设置中配置并激活一个有效的API配置，并填写模型名称'); return; }
        messageInput.disabled = true; recordBtn.style.pointerEvents = 'none'; recordBtn.style.opacity = '0.5'; loadingIndicator.style.display = 'flex';
        const now = new Date();
        const timeInfo = `当前现实时间是：${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
        const userInfo = `用户信息：真名：${DataManager.userProfile.realName || '未填写'}，地址：${DataManager.userProfile.address || '未填写'}，LINE号码：${DataManager.userProfile.lineId || '未填写'}，个性签名：${DataManager.userProfile.bio || '未填写'}，用户设定：${DataManager.userProfile.userSetting || '未填写'}`;
        const worldBooks = DataManager.getWorldBooksForContact(contact.id);
        const worldBookContent = worldBooks.map(w => `【${w.name}】\n${w.content}`).join('\n\n');
        const worldBookInfo = worldBookContent ? `世界书规则：\n${worldBookContent}` : '';
        let intimateInfo = '';
        if (contact.intimateCard && contact.intimateCard.enabled) {
            const remaining = DataManager.getIntimateRemaining(contact.id);
            intimateInfo = `你当前的亲密付剩余额度为 ¥${remaining.toFixed(2)}，如果需要向用户发起亲密付请求，请在回复中包含【亲密付|金额|备注】标记，例如“【亲密付|10|请你喝奶茶】”。否则正常回复。`;
        }
        const transferInstruction = '如果你需要主动向用户转账，请在回复中包含【转账|金额|备注】标记，例如“【转账|10|请你喝奶茶】”。否则正常回复。';
        const systemMessages = [{ role: 'system', content: timeInfo }, { role: 'system', content: userInfo }, { role: 'system', content: contact.personality }, { role: 'system', content: transferInstruction }];
        if (intimateInfo) systemMessages.push({ role: 'system', content: intimateInfo });
        if (worldBookInfo) systemMessages.push({ role: 'system', content: worldBookInfo });
        const allMessages = contact.messages.filter(m => m.role !== 'system');
        const historyMessages = [];
        for (let m of allMessages) {
            if (m.type === 'image') historyMessages.push({ role: m.role, content: await Utils.recognizeImage(m.content) });
            else historyMessages.push({ role: m.role, content: typeof m.content === 'object' ? JSON.stringify(m.content) : m.content });
        }
        const messages = [...systemMessages, ...historyMessages];
        try {
            const response = await fetch(`${BACKEND_URL}/api/chat`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ base_url: config.base_url, api_key: config.api_key, model: config.currentModel, messages })
            });
            if (!response.ok) throw new Error(API_ERRORS[response.status] || `HTTP错误 ${response.status}`);
            const data = await response.json();
            let reply = data.choices?.[0]?.message?.content;
            if (!reply) throw new Error('AI返回内容为空');
            const parsedTransfer = this.parseAIResponseForTransfer(reply);
            if (parsedTransfer) {
                this.addMessageToCurrent({ amount: parsedTransfer.transfer.amount, note: parsedTransfer.transfer.note, status: 'pending' }, false, false, 'transfer');
                reply = parsedTransfer.cleanReply;
            }
            const parsedIntimate = this.parseAIResponseForIntimate(reply);
            if (parsedIntimate) {
                this.addMessageToCurrent({ amount: parsedIntimate.intimate.amount, note: parsedIntimate.intimate.note, status: 'pending' }, false, false, 'intimate');
                reply = parsedIntimate.cleanReply;
            }
            const sentences = this.splitIntoSentences(reply);
            if (sentences.length === 1 || reply.length <= 20) this.addMessageToCurrent(reply, false, false, 'text');
            else await this.sendAIMessagesInChunks(sentences);
        } catch(error) {
            let errorMsg = error.message;
            if (error.name === 'TypeError' && error.message.includes('fetch')) errorMsg = '网络连接失败，请检查网络或API地址';
            this.addMessageToCurrent('请求失败：' + errorMsg, false, false, 'text');
            Utils.showToast(errorMsg, 3000);
        } finally {
            messageInput.disabled = false; recordBtn.style.pointerEvents = 'auto'; recordBtn.style.opacity = '1'; loadingIndicator.style.display = 'none';
        }
    },
    enterChatDetail(contactId) {
        this.stopSendingChunks();
        DataManager.currentContactId = contactId;
        const contact = DataManager.getCurrentContact();
        document.getElementById('detailContactName').textContent = Utils.getDisplayName(contact) + (contact.blocked ? ' (已拉黑)' : '');
        const messageInput = document.getElementById('messageInput'), recordBtn = document.getElementById('recordBtn');
        if (contact.blocked) { messageInput.disabled = true; messageInput.placeholder = '你已拉黑该联系人，无法发送消息'; recordBtn.style.opacity = '0.5'; recordBtn.style.pointerEvents = 'none'; }
        else { messageInput.disabled = false; messageInput.placeholder = 'Aa'; recordBtn.style.opacity = '1'; recordBtn.style.pointerEvents = 'auto'; }
        const total = contact.messages.length;
        this.currentVisibleStart = Math.max(0, total - INITIAL_MESSAGE_COUNT); this.currentVisibleEnd = total;
        this.isLoadingMore = false; this.prevStart = this.currentVisibleStart;
        UIManager.applyCurrentContactBubbleCss();
        UIManager.updateCurrentChatBackground();
        UIManager.renderMessages(contact.messages, this.currentVisibleStart, this.currentVisibleEnd);
        document.getElementById('contactListPage').style.display = 'none'; document.getElementById('chatDetailPage').style.display = 'flex'; document.getElementById('contactOptionsPage').style.display = 'none';
        requestAnimationFrame(() => { const area = document.getElementById('messageArea'); if (area) area.scrollTop = area.scrollHeight; });
        this.exitMultiSelectMode();
    },
    showContactList() {
        this.stopSendingChunks();
        document.getElementById('contactListPage').style.display = 'flex'; document.getElementById('chatDetailPage').style.display = 'none'; document.getElementById('contactOptionsPage').style.display = 'none';
        UIManager.renderContactList();
        this.exitMultiSelectMode();
    },
    showContactOptions() {
        this.stopSendingChunks();
        document.getElementById('contactListPage').style.display = 'none'; document.getElementById('chatDetailPage').style.display = 'none'; document.getElementById('contactOptionsPage').style.display = 'flex';
        const contact = DataManager.getCurrentContact();
        document.getElementById('optionsPinText').textContent = contact.pinned ? '已置顶' : '置顶';
        document.getElementById('optionsBlock').textContent = contact.blocked ? '解除拉黑' : '拉黑好友';
        document.getElementById('optionsMuteSwitch').checked = contact.muted;
        const autoPostSwitch = document.getElementById('optionsAutoPostSwitch'), intervalContainer = document.getElementById('autoPostIntervalContainer');
        autoPostSwitch.checked = contact.autoPostEnabled || false;
        intervalContainer.style.display = contact.autoPostEnabled ? 'block' : 'none';
        document.getElementById('optionsAutoPostInterval').value = contact.autoPostInterval || 1;
        const selectiveSwitch = document.getElementById('optionsSelectiveReplySwitch');
        if (selectiveSwitch) selectiveSwitch.checked = contact.selectiveReplyEnabled || false;
        UIManager.updateContactChatBgPreview();
        UIManager.updateContactBubbleCssInput();
        UIManager.updateContactOptionsAvatar();
        this.exitMultiSelectMode();
    },
    deleteContact(id) {
        if (DataManager.contacts.length <= 1) { Utils.showToast('至少保留一个联系人'); return; }
        DataManager.contacts = DataManager.contacts.filter(c => c.id !== id);
        DataManager.posts = DataManager.posts.filter(p => p.contactId !== id);
        if (DataManager.currentContactId === id) DataManager.currentContactId = DataManager.contacts[0].id;
        DataManager.saveContacts(); DataManager.savePosts();
        UIManager.renderContactList(); UIManager.renderFriendsList();
        this.showContactList();
        if (DataManager.currentStatusIndex >= DataManager.contacts.length) DataManager.currentStatusIndex = 0;
        UIManager.updateAIStatusWidget();
    },
    async loadMoreMessages() {
        if (this.isLoadingMore) return;
        const contact = DataManager.getCurrentContact();
        if (this.currentVisibleStart <= 0) return;
        this.isLoadingMore = true;
        const loadingIndicator = document.getElementById('loadingMoreIndicator');
        if (loadingIndicator) loadingIndicator.classList.add('show');
        await new Promise(resolve => setTimeout(resolve, 300));
        const newStart = Math.max(0, this.currentVisibleStart - LOAD_MORE_COUNT);
        this.currentVisibleStart = newStart;
        UIManager.renderMessages(contact.messages, this.currentVisibleStart, this.currentVisibleEnd);
        this.isLoadingMore = false;
    },
    recallMessage(index) {
        const contact = DataManager.getCurrentContact();
        const msg = contact.messages[index];
        if (!msg || Utils.isRecallMessage(msg)) return;
        msg.type = 'recall';
        msg.content = msg.role === 'user' ? '您撤回了一条消息' : '对方撤回了一条消息';
        DataManager.saveContacts();
        UIManager.renderMessages(contact.messages, this.currentVisibleStart, this.currentVisibleEnd);
        Utils.showToast('已撤回', 1500);
    },
    deleteMessage(index) {
        const contact = DataManager.getCurrentContact();
        contact.messages.splice(index, 1);
        DataManager.saveContacts();
        UIManager.renderMessages(contact.messages, this.currentVisibleStart, this.currentVisibleEnd);
        Utils.showToast('已删除', 1500);
    },
    editMessage(index, newContent) {
        const contact = DataManager.getCurrentContact();
        const msg = contact.messages[index];
        if (!msg || msg.type !== 'text' || Utils.isRecallMessage(msg)) { Utils.showToast('只能编辑文本消息'); return; }
        msg.content = newContent;
        DataManager.saveContacts();
        UIManager.renderMessages(contact.messages, this.currentVisibleStart, this.currentVisibleEnd);
        Utils.showToast('编辑成功', 1500);
    },
handleLongPressStart(e, index) {
    if (this.longPressTimer) clearTimeout(this.longPressTimer);
    if (this.isMultiSelectMode) return;
    const msg = DataManager.getCurrentContact().messages[index];
    if (!msg || Utils.isRecallMessage(msg)) return;

    // 获取正确的触摸/鼠标坐标
   // 获取被长按的消息元素（row）
const msgRow = e.currentTarget;
const rect = msgRow.getBoundingClientRect();
const targetRect = {
    top: rect.top,
    bottom: rect.bottom,
    left: rect.left + rect.width / 2   // 水平中心点
};
       this.longPressTimer = setTimeout(() => {
        this.showFloatMenu({ targetRect, index });
        this.longPressTimer = null;
    }, 500);
},   
handleLongPressEnd(e) {
    if (this.longPressTimer) {
        clearTimeout(this.longPressTimer);
        this.longPressTimer = null;
        
        e.preventDefault(); // Prevent emulated click

        // This was a short press (tap). Handle the action directly.
        const target = e.target;
        if (ChatHandler.isMultiSelectMode) {
            const msgRow = target.closest('.message');
            if (msgRow) ChatHandler.toggleMessageSelection(parseInt(msgRow.dataset.index));
            return;
        }
        const transferBubble = target.closest('.transfer-bubble');
        if (transferBubble) {
            ChatHandler.handleTransferClick(parseInt(transferBubble.dataset.index));
            return;
        }
        const intimateBubble = target.closest('.intimate-bubble, .intimate-card-bubble');
        if (intimateBubble) {
            IntimateHandler.handleIntimateClick(parseInt(intimateBubble.dataset.index));
            return;
        }
    }
    // If longPressTimer is null, it means a long press already happened and the menu was shown.
},
showFloatMenu({ targetRect, index }) {       const msg = DataManager.getCurrentContact().messages[index];
    if (!msg) return;
    const menu = document.getElementById('messageFloatMenu');
    menu.innerHTML = '';
    const actions = ['recall', 'delete', 'translate', 'multiselect'];
    if (msg.role === 'assistant') actions.push('regenerate');
    actions.forEach(action => {
        const item = document.createElement('div'); item.className = 'menu-item';
        if (action === 'recall') item.textContent = '撤回';
        else if (action === 'delete') item.textContent = '删除';
        else if (action === 'translate') item.textContent = '翻译';
        else if (action === 'multiselect') item.textContent = '多选';
        else if (action === 'regenerate') item.textContent = '重回';
        item.dataset.action = action; item.dataset.index = index;
        menu.appendChild(item);
    });
    menu.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const action = item.dataset.action, idx = parseInt(item.dataset.index);
            menu.style.display = 'none';
            if (action === 'recall') { if (confirm('确定要撤回这条消息吗？')) this.recallMessage(idx); }
            else if (action === 'delete') { if (confirm('确定要删除这条消息吗？')) this.deleteMessage(idx); }
            else if (action === 'translate') this.translateMessage(idx);
            else if (action === 'multiselect') this.enterMultiSelectMode(idx);
            else if (action === 'regenerate') this.handleRegenerate(idx);
        });
    });
    const chatArea = document.getElementById('messageArea').getBoundingClientRect();
let top = targetRect.top - menu.offsetHeight - 10; // 优先显示在上方
if (top < chatArea.top) {
    top = targetRect.bottom + 10; // 超出顶部则显示在下方
}
menu.style.top = top + 'px';
menu.style.left = (targetRect.left - menu.offsetWidth / 2) + 'px'; // 水平居中

// 防止菜单超出左右边界
const minLeft = 10;
const maxLeft = window.innerWidth - menu.offsetWidth - 10;
if (menu.offsetLeft < minLeft) menu.style.left = minLeft + 'px';
if (menu.offsetLeft > maxLeft) menu.style.left = maxLeft + 'px';    menu.style.display = 'block';
    const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
            menu.style.display = 'none';
            document.removeEventListener('click', closeMenu);
            document.removeEventListener('touchstart', closeMenu);
        }
    };
    setTimeout(() => {
        document.addEventListener('click', closeMenu);
        document.addEventListener('touchstart', closeMenu);
    }, 0);
},
    async translateMessage(index) {
        const contact = DataManager.getCurrentContact();
        const msg = contact.messages[index];
        if (!msg || msg.type !== 'text' || Utils.isRecallMessage(msg)) { Utils.showToast('只能翻译文本消息'); return; }
        Utils.showToast('正在翻译...', 0);
        const translated = await Utils.translateText(msg.content);
        this.addMessageToCurrent(`翻译：${translated}`, false, true, 'text');
    },
    enterMultiSelectMode(startIndex) {
        this.isMultiSelectMode = true;
        this.selectedMessages.clear();
        this.selectedMessages.add(startIndex);
        this.updateMultiSelectBar();
        this.highlightSelectedMessages();
    },
    exitMultiSelectMode() {
        this.isMultiSelectMode = false;
        this.selectedMessages.clear();
        document.getElementById('multiSelectBar').classList.remove('active');
        document.querySelectorAll('.message').forEach(msg => msg.classList.remove('selected'));
    },
    toggleMessageSelection(index) {
        if (!this.isMultiSelectMode) return;
        if (this.selectedMessages.has(index)) this.selectedMessages.delete(index);
        else this.selectedMessages.add(index);
        this.updateMultiSelectBar();
        this.highlightSelectedMessages();
    },
    updateMultiSelectBar() {
        const bar = document.getElementById('multiSelectBar');
        const count = this.selectedMessages.size;
        if (count > 0) {
            bar.classList.add('active');
            document.getElementById('selectCount').textContent = `已选择 ${count} 条`;
        } else bar.classList.remove('active');
    },
    highlightSelectedMessages() {
        document.querySelectorAll('.message').forEach(msg => {
            const index = parseInt(msg.dataset.index);
            if (this.selectedMessages.has(index)) msg.classList.add('selected');
            else msg.classList.remove('selected');
        });
    },
    deleteSelectedMessages() {
        if (this.selectedMessages.size === 0) return;
        if (!confirm(`确定删除选中的 ${this.selectedMessages.size} 条消息吗？`)) return;
        const contact = DataManager.getCurrentContact();
        const indices = Array.from(this.selectedMessages).sort((a,b) => b - a);
        for (let idx of indices) contact.messages.splice(idx, 1);
        DataManager.saveContacts();
        this.exitMultiSelectMode();
        UIManager.renderMessages(contact.messages, this.currentVisibleStart, this.currentVisibleEnd);
        Utils.showToast('已删除', 1500);
    },
    handleTransferClick(index) {
        const contact = DataManager.getCurrentContact();
        const msg = contact.messages[index];
        if (!msg || msg.type !== 'transfer') return;
        let transferData = msg.content;
        if (typeof transferData === 'string') { try { transferData = JSON.parse(transferData); } catch(e) { return; } }
        const modal = document.getElementById('transferActionModal');
        document.getElementById('transferActionAmount').textContent = `¥${transferData.amount}`;
        document.getElementById('transferActionNote').textContent = transferData.note || '无留言';
        let statusText = transferData.status === 'pending' ? '待收款' : (transferData.status === 'accepted' ? '已收款' : '已退回');
        document.getElementById('transferActionStatus').textContent = `状态：${statusText}`;
        const buttonsDiv = document.getElementById('transferActionButtons');
        if (msg.role === 'user') buttonsDiv.style.display = 'none';
        else {
            if (transferData.status === 'pending') {
                buttonsDiv.style.display = 'flex';
                document.getElementById('transferAcceptBtn').onclick = () => {
                    transferData.status = 'accepted';
                    msg.content = transferData;
                    DataManager.saveContacts();
                    const amount = parseFloat(transferData.amount);
                    DataManager.updateBalance(amount);
                    DataManager.addTransaction({ id: Date.now(), name: `收到来自 ${Utils.getDisplayName(contact)} 的转账`, amount: amount, date: new Date().toLocaleDateString(), type: 'receive' });
                    WalletManager.renderWallet();
                    UIManager.renderMessages(contact.messages, this.currentVisibleStart, this.currentVisibleEnd);
                    modal.classList.remove('active');
                };
                document.getElementById('transferRejectBtn').onclick = () => {
                    transferData.status = 'rejected';
                    msg.content = transferData;
                    DataManager.saveContacts();
                    UIManager.renderMessages(contact.messages, this.currentVisibleStart, this.currentVisibleEnd);
                    modal.classList.remove('active');
                };
            } else buttonsDiv.style.display = 'none';
        }
        modal.classList.add('active');
    },
    async handleRegenerate(index) {
        const contact = DataManager.getCurrentContact();
        if (!contact) return;
        const messages = contact.messages;
        if (index < 0 || index >= messages.length) return;
        const msg = messages[index];
        if (msg.role !== 'assistant') return;
        let end = index + 1;
        while (end < messages.length && messages[end].role === 'assistant') end++;
        messages.splice(index, end - index);
        DataManager.saveContacts();
        const total = messages.length;
        if (this.currentVisibleEnd > index) {
            this.currentVisibleEnd = total;
            if (this.currentVisibleStart >= total) this.currentVisibleStart = Math.max(0, total - INITIAL_MESSAGE_COUNT);
        }
        UIManager.renderMessages(messages, this.currentVisibleStart, this.currentVisibleEnd);
        const historyMessages = messages.slice(0, index);
        await this.requestAIReply(contact, historyMessages);
    },
    async requestAIReply(contact, historyMessages) {
        let config = contact.configId ? DataManager.apiConfigs.find(c => c.id === contact.configId) : DataManager.getActiveConfig();
        if (!config || !config.base_url || !config.api_key || !config.currentModel) { Utils.showToast('请先在设置中配置并激活一个有效的API配置，并填写模型名称'); return; }
        const now = new Date();
        const timeInfo = `当前现实时间是：${now.getFullYear()}年${now.getMonth()+1}月${now.getDate()}日 ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
        const userInfo = `用户信息：真名：${DataManager.userProfile.realName || '未填写'}，地址：${DataManager.userProfile.address || '未填写'}，LINE号码：${DataManager.userProfile.lineId || '未填写'}，个性签名：${DataManager.userProfile.bio || '未填写'}，用户设定：${DataManager.userProfile.userSetting || '未填写'}`;
        const worldBooks = DataManager.getWorldBooksForContact(contact.id);
        const worldBookContent = worldBooks.map(w => `【${w.name}】\n${w.content}`).join('\n\n');
        const worldBookInfo = worldBookContent ? `世界书规则：\n${worldBookContent}` : '';
        let intimateInfo = '';
        if (contact.intimateCard && contact.intimateCard.enabled) {
            const remaining = DataManager.getIntimateRemaining(contact.id);
            intimateInfo = `你当前的亲密付剩余额度为 ¥${remaining.toFixed(2)}，如果需要向用户发起亲密付请求，请在回复中包含【亲密付|金额|备注】标记，例如“【亲密付|10|请你喝奶茶】”。否则正常回复。`;
        }
        const transferInstruction = '如果你需要主动向用户转账，请在回复中包含【转账|金额|备注】标记，例如“【转账|10|请你喝奶茶】”。否则正常回复。';
        const systemMessages = [{ role: 'system', content: timeInfo }, { role: 'system', content: userInfo }, { role: 'system', content: contact.personality }, { role: 'system', content: transferInstruction }];
        if (intimateInfo) systemMessages.push({ role: 'system', content: intimateInfo });
        if (worldBookInfo) systemMessages.push({ role: 'system', content: worldBookInfo });
        const processedHistory = [];
        for (let m of historyMessages) {
            if (m.type === 'image') processedHistory.push({ role: m.role, content: await Utils.recognizeImage(m.content) });
            else processedHistory.push({ role: m.role, content: typeof m.content === 'object' ? JSON.stringify(m.content) : m.content });
        }
        const messages = [...systemMessages, ...processedHistory];
        const loadingIndicator = document.getElementById('loadingIndicator');
        const recordBtn = document.getElementById('recordBtn');
        const messageInput = document.getElementById('messageInput');
        messageInput.disabled = true; recordBtn.style.pointerEvents = 'none'; recordBtn.style.opacity = '0.5'; loadingIndicator.style.display = 'flex';
        try {
            const response = await fetch(`${BACKEND_URL}/api/chat`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ base_url: config.base_url, api_key: config.api_key, model: config.currentModel, messages })
            });
            if (!response.ok) throw new Error(API_ERRORS[response.status] || `HTTP错误 ${response.status}`);
            const data = await response.json();
            let reply = data.choices?.[0]?.message?.content;
            if (!reply) throw new Error('AI返回内容为空');
            const parsedTransfer = this.parseAIResponseForTransfer(reply);
            if (parsedTransfer) {
                this.addMessageToCurrent({ amount: parsedTransfer.transfer.amount, note: parsedTransfer.transfer.note, status: 'pending' }, false, false, 'transfer');
                reply = parsedTransfer.cleanReply;
            }
            const parsedIntimate = this.parseAIResponseForIntimate(reply);
            if (parsedIntimate) {
                this.addMessageToCurrent({ amount: parsedIntimate.intimate.amount, note: parsedIntimate.intimate.note, status: 'pending' }, false, false, 'intimate');
                reply = parsedIntimate.cleanReply;
            }
            const sentences = this.splitIntoSentences(reply);
            if (sentences.length === 1 || reply.length <= 20) this.addMessageToCurrent(reply, false, false, 'text');
            else await this.sendAIMessagesInChunks(sentences);
        } catch(error) {
            let errorMsg = error.message;
            if (error.name === 'TypeError' && error.message.includes('fetch')) errorMsg = '网络连接失败，请检查网络或API地址';
            this.addMessageToCurrent('请求失败：' + errorMsg, false, false, 'text');
            Utils.showToast(errorMsg, 3000);
        } finally {
            messageInput.disabled = false; recordBtn.style.pointerEvents = 'auto'; recordBtn.style.opacity = '1'; loadingIndicator.style.display = 'none';
        }
    }
};

// ==================== 配置处理模块 ====================
const ConfigHandler = {
    async fetchModelsForConfig(configId) {
        const config = DataManager.apiConfigs.find(c => c.id === configId);
        if (!config) return;
        if (!config.base_url || !config.api_key) { Utils.showToast('请先填写 Base URL 和 API Key'); return; }
        const fetchBtns = document.querySelectorAll('.config-model-row button'); fetchBtns.forEach(b => b.disabled = true);
        try {
            const response = await fetch(`${BACKEND_URL}/api/models`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ base_url: config.base_url, api_key: config.api_key })
            });
            if (!response.ok) throw new Error(API_ERRORS[response.status] || `HTTP错误 ${response.status}`);
            const data = await response.json();
            if (data.models && Array.isArray(data.models)) {
                config.models = data.models;
                if (!config.currentModel || !config.models.some(m => m.id === config.currentModel)) config.currentModel = config.models[0]?.id || '';
                DataManager.saveConfigs(); UIManager.renderConfigList();
                Utils.showToast('模型列表拉取成功');
            } else Utils.showToast('返回的模型列表格式不正确');
        } catch(error) { Utils.showToast('拉取失败：' + error.message); }
        finally { fetchBtns.forEach(b => b.disabled = false); }
    },
    editConfig(id) {
        const config = DataManager.apiConfigs.find(c => c.id === id);
        if (!config) return;
        const item = document.querySelector(`.config-item[data-id="${id}"]`);
        if (!item) return;
        const existingForm = item.querySelector('.edit-form');
        if (existingForm) { existingForm.remove(); return; }
        const form = document.createElement('div'); form.className = 'edit-form';
        form.innerHTML = `<input type="text" id="edit_name_${id}" placeholder="配置名称" value="${config.name}"><input type="text" id="edit_url_${id}" placeholder="Base URL" value="${config.base_url || ''}"><input type="text" id="edit_key_${id}" placeholder="API Key" value="${config.api_key || ''}"><div><button class="save-edit" data-id="${id}">保存</button><button class="cancel-edit">取消</button></div>`;
        item.appendChild(form);
        form.querySelector('.save-edit').addEventListener('click', () => {
            const newName = document.getElementById(`edit_name_${id}`).value.trim(), newUrl = document.getElementById(`edit_url_${id}`).value.trim(), newKey = document.getElementById(`edit_key_${id}`).value.trim();
            if (!newName) { Utils.showToast('请输入配置名称'); return; }
            config.name = newName; config.base_url = newUrl; config.api_key = newKey;
            DataManager.saveConfigs(); UIManager.renderConfigList();
        });
        form.querySelector('.cancel-edit').addEventListener('click', () => { form.remove(); });
    },
    deleteConfig(id) {
        if (DataManager.apiConfigs.length <= 1) { Utils.showToast('至少保留一个配置'); return; }
        if (!confirm('确定删除此配置吗？')) return;
        DataManager.apiConfigs = DataManager.apiConfigs.filter(c => c.id !== id);
        if (DataManager.activeConfigId === id) DataManager.activeConfigId = DataManager.apiConfigs[0].id;
        DataManager.contacts.forEach(c => { if (c.configId === id) c.configId = ''; });
        DataManager.saveContacts(); DataManager.saveConfigs(); UIManager.renderConfigList();
    }
};

// ==================== 世界书处理模块 ====================
const WorldBookHandler = {
    currentEditId: null,
    openCreateModal() {
        this.currentEditId = null;
        document.getElementById('worldBookModalTitle').textContent = '新建世界书';
        document.getElementById('worldBookName').value = ''; document.getElementById('worldBookContent').value = '';
        document.querySelector('input[name="worldBookGlobal"][value="global"]').checked = true;
        document.getElementById('worldBookBindContainer').style.display = 'none';
        UIManager.refreshWorldBookContactCheckboxes([]);
        document.getElementById('worldBookModal').classList.add('active');
    },
    openEditModal(id) {
        const book = DataManager.worldBooks.find(b => b.id === id);
        if (!book) return;
        this.currentEditId = id;
        document.getElementById('worldBookModalTitle').textContent = '编辑世界书';
        document.getElementById('worldBookName').value = book.name; document.getElementById('worldBookContent').value = book.content;
        if (book.global) { document.querySelector('input[name="worldBookGlobal"][value="global"]').checked = true; document.getElementById('worldBookBindContainer').style.display = 'none'; }
        else { document.querySelector('input[name="worldBookGlobal"][value="specific"]').checked = true; document.getElementById('worldBookBindContainer').style.display = 'block'; }
        UIManager.refreshWorldBookContactCheckboxes(book.boundRoles || []);
        document.getElementById('worldBookModal').classList.add('active');
    },
    closeModal() { document.getElementById('worldBookModal').classList.remove('active'); },
    async saveWorldBook() {
        const name = document.getElementById('worldBookName').value.trim(), content = document.getElementById('worldBookContent').value.trim();
        if (!name || !content) { Utils.showToast('请填写名称和内容'); return; }
        const isGlobal = document.querySelector('input[name="worldBookGlobal"]:checked').value === 'global';
        let boundRoles = [];
        if (!isGlobal) {
            const checkboxes = document.querySelectorAll('#worldBookContactCheckboxes input[type="checkbox"]:checked');
            boundRoles = Array.from(checkboxes).map(cb => cb.value);
        }
        if (this.currentEditId) {
            const book = DataManager.worldBooks.find(b => b.id === this.currentEditId);
            if (book) { book.name = name; book.content = content; book.global = isGlobal; book.boundRoles = boundRoles; }
        } else DataManager.worldBooks.push({ id: Date.now().toString(), name, content, global: isGlobal, boundRoles });
        DataManager.saveWorldBooks(); UIManager.renderWorldBookList(); this.closeModal(); Utils.showToast('保存成功');
    },
    deleteWorldBook(id) {
        if (!confirm('确定要删除这个世界书吗？')) return;
        DataManager.worldBooks = DataManager.worldBooks.filter(b => b.id !== id);
        DataManager.saveWorldBooks(); UIManager.renderWorldBookList(); Utils.showToast('已删除');
    },
    async importFromFile() {
        const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = '.txt,.text,text/plain'; fileInput.style.display = 'none'; document.body.appendChild(fileInput);
        fileInput.click();
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const text = await Utils.readFileAsText(file);
                const name = file.name.replace(/\.[^/.]+$/, '');
                document.getElementById('worldBookName').value = name; document.getElementById('worldBookContent').value = text;
                if (!document.getElementById('worldBookModal').classList.contains('active')) this.openCreateModal();
                Utils.showToast('导入成功');
            } catch(err) { Utils.showToast('导入失败：' + err.message); }
            finally { document.body.removeChild(fileInput); }
        });
    }
};

// ==================== 亲密付处理模块 ====================
const IntimateHandler = {
    selectedContactId: null,
    openRoleModal() {
        const container = document.getElementById('intimateRoleList');
        container.innerHTML = '';
        DataManager.contacts.forEach(contact => {
            const item = document.createElement('div'); item.className = 'intimate-role-item'; item.style.display = 'flex'; item.style.alignItems = 'center'; item.style.padding = '8px'; item.style.cursor = 'pointer'; item.dataset.id = contact.id;
            const avatar = document.createElement('div'); avatar.style.width = '40px'; avatar.style.height = '40px'; avatar.style.borderRadius = '50%'; avatar.style.backgroundColor = '#f0f0f0'; avatar.style.display = 'flex'; avatar.style.alignItems = 'center'; avatar.style.justifyContent = 'center'; avatar.style.marginRight = '12px'; avatar.style.overflow = 'hidden'; avatar.style.flexShrink = '0';
            Utils.setImageElement(avatar, contact.avatar, '🤖').then(() => { const img = avatar.querySelector('img'); if (img) { img.style.objectFit = 'contain'; img.style.width = '100%'; img.style.height = '100%'; } });
            const name = document.createElement('span'); name.textContent = Utils.getDisplayName(contact);
            item.appendChild(avatar); item.appendChild(name);
            container.appendChild(item);
            item.addEventListener('click', () => { this.selectedContactId = contact.id; document.getElementById('intimateRoleModal').classList.remove('active'); document.getElementById('intimateLimitModal').classList.add('active'); });
        });
        document.getElementById('intimateRoleModal').classList.add('active');
    },
    saveLimit() {
        const limit = parseFloat(document.getElementById('intimateLimit').value);
        if (isNaN(limit) || limit <= 0) { Utils.showToast('请输入有效金额'); return; }
        const contact = DataManager.contacts.find(c => c.id === this.selectedContactId);
        if (contact) {
            const last4 = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            const cardNumber = `**** **** **** ${last4}`;
            contact.intimateCard = { enabled: true, monthlyLimit: limit, usedAmount: 0, cardNumber };
            DataManager.saveContacts();
            Utils.showToast(`已为 ${Utils.getDisplayName(contact)} 开通亲属卡`);
        }
        document.getElementById('intimateLimitModal').classList.remove('active');
        document.getElementById('intimateLimit').value = '';
    },
    openSendModal(contact) { this.selectedContactId = contact.id; document.getElementById('intimateSendModal').classList.add('active'); },
    sendIntimate() {
        const amount = parseFloat(document.getElementById('intimateAmount').value), note = document.getElementById('intimateNote').value.trim();
        if (isNaN(amount) || amount <= 0) { Utils.showToast('请输入有效金额'); return; }
        const contact = DataManager.contacts.find(c => c.id === this.selectedContactId);
        if (!contact) return;
        if (!contact.intimateCard || !contact.intimateCard.enabled) { Utils.showToast('该角色未开通亲属卡'); document.getElementById('intimateSendModal').classList.remove('active'); return; }
        if (DataManager.wallet.balance < amount) { Utils.showToast(`余额不足，当前余额 ¥${DataManager.wallet.balance.toFixed(2)}`); return; }
        const intimateData = { amount: amount.toFixed(2), note, status: 'pending' };
        ChatHandler.stopSendingChunks();
        ChatHandler.addMessageToCurrent(intimateData, true, false, 'intimate');
        Utils.showToast('亲密付已发送');
        document.getElementById('intimateSendModal').classList.remove('active');
        document.getElementById('intimateAmount').value = '';
        document.getElementById('intimateNote').value = '';
        if (contact) ChatHandler.askAIToHandleIntimate(contact, contact.messages.length - 1);
    },
    handleIntimateClick(index) {
        const contact = DataManager.getCurrentContact();
        const msg = contact.messages[index];
        if (!msg || msg.type !== 'intimate') return;
        let intimateData = msg.content;
        if (typeof intimateData === 'string') { try { intimateData = JSON.parse(intimateData); } catch(e) { return; } }
        const modal = document.getElementById('intimateDetailModal');
        document.getElementById('intimateDetailAmount').textContent = `¥${intimateData.amount}`;
        document.getElementById('intimateDetailNote').textContent = intimateData.note || '无留言';
        let statusText = intimateData.status === 'pending' ? '待接收' : (intimateData.status === 'accepted' ? '已收款' : '已退回');
        document.getElementById('intimateDetailStatus').textContent = `状态：${statusText}`;
        const buttonsDiv = document.getElementById('intimateActionButtons');
        if (msg.role === 'user') buttonsDiv.style.display = 'none';
        else {
            if (intimateData.status === 'pending') {
                buttonsDiv.style.display = 'flex';
                document.getElementById('intimateAcceptBtn').onclick = () => {
                    intimateData.status = 'accepted';
                    msg.content = intimateData;
                    DataManager.saveContacts();
                    const amount = parseFloat(intimateData.amount);
                    if (msg.role === 'user') { DataManager.updateBalance(-amount); DataManager.addTransaction({ id: Date.now(), name: `转账给 ${Utils.getDisplayName(contact)} (亲属卡)`, amount: -amount, date: new Date().toLocaleDateString(), type: 'intimate' }); }
                    else { DataManager.updateBalance(amount); DataManager.addTransaction({ id: Date.now(), name: `收到来自 ${Utils.getDisplayName(contact)} 的亲属卡`, amount: amount, date: new Date().toLocaleDateString(), type: 'intimate' }); }
                    WalletManager.renderWallet();
                    UIManager.renderMessages(contact.messages, ChatHandler.currentVisibleStart, ChatHandler.currentVisibleEnd);
                    modal.classList.remove('active');
                };
                document.getElementById('intimateRejectBtn').onclick = () => {
                    intimateData.status = 'rejected';
                    msg.content = intimateData;
                    DataManager.saveContacts();
                    UIManager.renderMessages(contact.messages, ChatHandler.currentVisibleStart, ChatHandler.currentVisibleEnd);
                    modal.classList.remove('active');
                };
            } else buttonsDiv.style.display = 'none';
        }
        modal.classList.add('active');
    }
};

// ==================== 语音通话模块 ====================
const VoiceCallHandler = {
    currentContactId: null, callStartTime: null, callTimerInterval: null, callMessages: [], inputVisible: false, isMuted: false, muteStartTime: null, muteTimer: null, lastAskTime: 0,
    async sendAIMessagesInChunks(sentences) {
        if (!sentences || sentences.length === 0) return;
        for (let i = 0; i < sentences.length; i++) {
            if (!this.currentContactId) break;
            this.callMessages.push({ role: 'assistant', content: sentences[i] });
            this.renderMessages();
            if (i < sentences.length - 1) await new Promise(r => setTimeout(r, 800));
        }
    },
    async openCall(contactId) {
        this.currentContactId = contactId;
        const contact = DataManager.contacts.find(c => c.id === contactId);
        if (!contact) return;
        this.callMessages = [];
        this.callStartTime = Date.now();
        this.startTimer();
        this.isMuted = false; this.muteStartTime = null; this.clearMuteTimer();
        this.inputVisible = false; document.getElementById('callInputContainer').style.display = 'none';
        document.getElementById('callName').textContent = Utils.getDisplayName(contact);
        const avatarDiv = document.getElementById('callAvatar');
        Utils.setImageElement(avatarDiv, contact.avatar, '🤖');
        const callContainer = document.querySelector('.call-container');
        const bgId = DataManager.beautifySettings.callBackground;
        if (bgId) {
            const dataUrl = await Utils.loadImageFromDB(bgId);
            if (dataUrl) { callContainer.style.background = `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url('${dataUrl}') no-repeat center/cover`; callContainer.style.backdropFilter = 'none'; }
            else { callContainer.style.background = 'rgba(0, 0, 0, 0.85)'; callContainer.style.backdropFilter = 'blur(15px)'; }
        } else { callContainer.style.background = 'rgba(0, 0, 0, 0.85)'; callContainer.style.backdropFilter = 'blur(15px)'; }
        this.renderMessages();
        document.getElementById('voiceCallView').classList.add('active');
    },
    closeCall() { this.stopTimer(); this.clearMuteTimer(); document.getElementById('voiceCallView').classList.remove('active'); this.currentContactId = null; this.callMessages = []; this.inputVisible = false; this.isMuted = false; },
    startTimer() {
        this.stopTimer();
        this.callTimerInterval = setInterval(() => {
            if (!this.callStartTime) return;
            const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60), seconds = elapsed % 60;
            document.getElementById('callTimer').textContent = `${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`;
        }, 1000);
    },
    stopTimer() { if (this.callTimerInterval) { clearInterval(this.callTimerInterval); this.callTimerInterval = null; } },
    clearMuteTimer() { if (this.muteTimer) { clearInterval(this.muteTimer); this.muteTimer = null; } },
    toggleMute() {
        const contact = DataManager.contacts.find(c => c.id === this.currentContactId);
        if (!contact) return;
        this.isMuted = !this.isMuted;
        const btn = document.getElementById('callSpeakerBtn'), icon = btn.querySelector('i');
        if (this.isMuted) {
            icon.className = 'fa-solid fa-volume-off'; btn.classList.add('active');
            this.muteStartTime = Date.now(); this.lastAskTime = 0;
            if (!this.muteTimer) this.muteTimer = setInterval(() => this.checkMuteAndAsk(contact), 30 * 1000);
            setTimeout(() => this.checkMuteAndAsk(contact), 2000);
        } else { icon.className = 'fa-solid fa-volume-high'; btn.classList.remove('active'); this.clearMuteTimer(); this.muteStartTime = null; }
    },
    async checkMuteAndAsk(contact) {
        if (!this.isMuted || !this.muteStartTime) return;
        const now = Date.now();
        if (now - this.muteStartTime >= 30 * 1000 && (now - this.lastAskTime >= 30 * 1000 || this.lastAskTime === 0)) {
            this.lastAskTime = now;
            await this.askMuteReason(contact);
        }
    },
    async askMuteReason(contact) {
        let config = contact.configId ? DataManager.apiConfigs.find(c => c.id === contact.configId) : DataManager.getActiveConfig();
        if (!config || !config.base_url || !config.api_key || !config.currentModel) { Utils.showToast('请先配置API'); return; }
        const prompt = `用户已经开启静音模式 ${Math.floor((Date.now() - this.muteStartTime) / 60000)} 分钟了。请根据你的人设，用一句话询问用户为什么不开麦。要求符合角色性格，自然友好。`;
        const messages = [{ role: 'system', content: contact.personality || '你是一个友好的AI助手。' }, { role: 'user', content: prompt }];
        try {
            const response = await fetch(`${BACKEND_URL}/api/chat`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ base_url: config.base_url, api_key: config.api_key, model: config.currentModel, messages })
            });
            if (!response.ok) throw new Error(API_ERRORS[response.status] || `HTTP错误 ${response.status}`);
            const data = await response.json();
            const reply = data.choices?.[0]?.message?.content;
            if (!reply) throw new Error('AI返回内容为空');
            const sentences = ChatHandler.splitIntoSentences(reply);
            if (sentences.length === 1 || reply.length <= 20) { this.callMessages.push({ role: 'assistant', content: reply }); this.renderMessages(); }
            else await this.sendAIMessagesInChunks(sentences);
        } catch(err) { Utils.showToast('获取回复失败：' + err.message); }
    },
    renderMessages() {
        const container = document.getElementById('callMessages');
        container.innerHTML = '';
        this.callMessages.forEach((msg, index) => {
            const isUser = msg.role === 'user';
            const row = document.createElement('div'); row.className = `message ${isUser ? 'me' : 'other'}`;
            const bubble = document.createElement('div'); bubble.className = 'msg-bubble'; bubble.textContent = msg.content;
            row.appendChild(bubble);
            container.appendChild(row);
        });
        setTimeout(() => container.scrollTop = container.scrollHeight, 0);
    },
    async sendUserMessage(text) {
        if (!text.trim()) return;
        const contact = DataManager.contacts.find(c => c.id === this.currentContactId);
        if (!contact) return;
        if (this.isMuted) this.toggleMute();
        this.callMessages.push({ role: 'user', content: text });
        this.renderMessages();
        document.getElementById('callMessageInput').value = '';
    },
    async triggerAIReply() {
        const contact = DataManager.contacts.find(c => c.id === this.currentContactId);
        if (!contact) return;
        let config = contact.configId ? DataManager.apiConfigs.find(c => c.id === contact.configId) : DataManager.getActiveConfig();
        if (!config || !config.base_url || !config.api_key || !config.currentModel) { Utils.showToast('请先配置API'); return; }
        const messages = [{ role: 'system', content: contact.personality || '你是一个友好的AI助手。' }, ...this.callMessages.map(m => ({ role: m.role, content: m.content }))];
        try {
            const response = await fetch(`${BACKEND_URL}/api/chat`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ base_url: config.base_url, api_key: config.api_key, model: config.currentModel, messages })
            });
            if (!response.ok) throw new Error(API_ERRORS[response.status] || `HTTP错误 ${response.status}`);
            const data = await response.json();
            const reply = data.choices?.[0]?.message?.content;
            if (!reply) throw new Error('AI返回内容为空');
            const sentences = ChatHandler.splitIntoSentences(reply);
            if (sentences.length === 1 || reply.length <= 20) { this.callMessages.push({ role: 'assistant', content: reply }); this.renderMessages(); }
            else await this.sendAIMessagesInChunks(sentences);
        } catch(err) { Utils.showToast('获取回复失败：' + err.message); }
    },
    toggleInput() {
        this.inputVisible = !this.inputVisible;
        const container = document.getElementById('callInputContainer');
        container.style.display = this.inputVisible ? 'flex' : 'none';
        if (this.inputVisible) document.getElementById('callMessageInput').focus();
    },
    hangup() {
        if (!this.currentContactId) { this.closeCall(); return; }
        const contact = DataManager.contacts.find(c => c.id === this.currentContactId);
        if (!contact) { this.closeCall(); return; }
        this.callMessages.forEach(msg => {
            contact.messages.push({ role: msg.role, type: 'call', content: msg.content, timestamp: Date.now() - (this.callMessages.length - this.callMessages.indexOf(msg)) * 1000 });
        });
        const duration = this.callStartTime ? Math.floor((Date.now() - this.callStartTime) / 1000) : 0;
        const minutes = Math.floor(duration / 60), seconds = duration % 60;
        const durationStr = `${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`;
        contact.messages.push({ role: 'system', type: 'call', content: `📞 语音通话 ${durationStr}`, timestamp: Date.now() });
        DataManager.saveContacts();
        if (document.getElementById('chatDetailPage').style.display === 'flex' && DataManager.currentContactId === this.currentContactId) UIManager.renderMessages(contact.messages, ChatHandler.currentVisibleStart, ChatHandler.currentVisibleEnd);
        this.closeCall();
        Utils.showToast('通话已结束');
    }
};
// ==================== 画板模块 ====================
// ==================== 画板模块（支持撤销 + 聊天集成） ====================
const DrawingBoard = {
    canvas: null,
    ctx: null,
    isDrawing: false,
    lastX: 0,
    lastY: 0,
    currentColor: '#000000',
    currentSize: 5,
    history: [],
    historyIndex: -1,
    currentContactId: null,
    topics: ['苹果', '太阳', '猫', '狗', '房子', '汽车', '笑脸', '花朵', '鱼', '飞机'],

    init() {
        this.canvas = document.getElementById('drawingCanvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
       this.canvas.width = 350;
this.canvas.height = 350;
        this.clearCanvas();
        this.saveState();

        this.canvas.addEventListener('mousedown', this.startDraw.bind(this));
        this.canvas.addEventListener('mousemove', this.draw.bind(this));
        this.canvas.addEventListener('mouseup', this.endDraw.bind(this));
        this.canvas.addEventListener('mouseleave', this.endDraw.bind(this));
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
        this.canvas.addEventListener('touchend', this.endDraw.bind(this));

        const colorBtn = document.getElementById('drawingColorBtn');
        const colorPicker = document.getElementById('drawingColorPicker');
        colorBtn.addEventListener('click', () => colorPicker.click());
        colorPicker.addEventListener('input', (e) => {
            this.currentColor = e.target.value;
            colorBtn.style.backgroundColor = this.currentColor;
        });
        const brushSize = document.getElementById('drawingBrushSize');
        brushSize.addEventListener('change', (e) => {
            this.currentSize = parseInt(e.target.value);
            this.ctx.lineWidth = this.currentSize;
        });
        document.getElementById('drawingUndoBtn').addEventListener('click', () => this.undo());
        document.getElementById('drawingClearBtn').addEventListener('click', () => {
            if (confirm('清空画板吗？')) {
                this.clearCanvas();
                this.saveState();
            }
        });
        document.getElementById('drawingSendBtn').addEventListener('click', () => this.sendDrawing());
        document.getElementById('drawingBackBtn').addEventListener('click', () => {
            document.getElementById('drawingBoardView').classList.remove('active');
        });
        document.getElementById('refreshTopicBtn').addEventListener('click', () => this.randomTopic());
        this.randomTopic();

        const sendMsgBtn = document.getElementById('drawingSendMessageBtn');
        const msgInput = document.getElementById('drawingMessageInput');
        sendMsgBtn.addEventListener('click', () => this.handleSendMessage());
        msgInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleSendMessage();
            }
        });
    },

    openWithContact(contactId) {
        this.currentContactId = contactId;
        this.clearCanvas();
        this.saveState();
        this.loadChatHistory();
        this.randomTopic();
        document.getElementById('drawingBoardView').classList.add('active');
    },

    loadChatHistory() {
        const contact = DataManager.contacts.find(c => c.id === this.currentContactId);
        if (!contact) return;
        const container = document.getElementById('drawingChatArea');
        container.innerHTML = '';
        const messages = contact.messages.slice(-30);
        messages.forEach(msg => {
            if (msg.role === 'system') return;
            this.renderOneMessage(msg, contact);
        });
        container.scrollTop = container.scrollHeight;
    },

    renderOneMessage(msg, contact) {
        const container = document.getElementById('drawingChatArea');
        const isUser = msg.role === 'user';
        const div = document.createElement('div');
        div.className = `drawing-chat-message ${isUser ? 'me' : 'other'}`;
        const bubble = document.createElement('div');
        bubble.className = 'drawing-chat-bubble';
        if (msg.type === 'image') {
            const img = document.createElement('img');
            img.className = 'drawing-chat-image';
            Utils.loadImageFromDB(msg.content).then(url => { if(url) img.src = url; });
            bubble.appendChild(img);
        } else if (msg.type === 'transfer' || msg.type === 'intimate') {
            bubble.textContent = '[特殊消息]';
        } else {
            bubble.textContent = msg.content || '';
        }
        div.appendChild(bubble);
        container.appendChild(div);
    },

    addMessageToChat(msg, contact) {
        this.renderOneMessage(msg, contact);
        const container = document.getElementById('drawingChatArea');
        container.scrollTop = container.scrollHeight;
    },

    async handleSendMessage() {
        const input = document.getElementById('drawingMessageInput');
        const text = input.value.trim();
        const contact = DataManager.contacts.find(c => c.id === this.currentContactId);
        if (!contact) return;

        if (text) {
            ChatHandler.stopSendingChunks();
            ChatHandler.addMessageToCurrent(text, true, false, 'text');
            this.addMessageToChat({ role: 'user', content: text, type: 'text', timestamp: Date.now() }, contact);
            input.value = '';
            await this.triggerAIReply(contact);
        } else {
            await this.triggerAIReply(contact);
        }
    },

    async triggerAIReply(contact) {
        // 临时保存原有 addMessageToCurrent 方法
        const originalAdd = ChatHandler.addMessageToCurrent;
        const self = this;
        // 拦截添加消息，同步到画板聊天区
        ChatHandler.addMessageToCurrent = function(content, isUser, isSystem, type, extra) {
            originalAdd.call(ChatHandler, content, isUser, isSystem, type, extra);
            if (!isUser && self.currentContactId === contact.id && document.getElementById('drawingBoardView').classList.contains('active')) {
                const newMsg = { role: 'assistant', content, type, timestamp: Date.now() };
                self.addMessageToChat(newMsg, contact);
            }
        };

        // 获取配置
        let config = contact.configId ? DataManager.apiConfigs.find(c => c.id === contact.configId) : DataManager.getActiveConfig();
        if (!config || !config.base_url || !config.api_key || !config.currentModel) {
            Utils.showToast('请先配置API');
            ChatHandler.addMessageToCurrent = originalAdd;
            return;
        }

        // 获取最后一条用户消息（如果有）
        const lastUserMsg = contact.messages.filter(m => m.role === 'user').slice(-1)[0];
        let prompt = '';
        if (lastUserMsg && lastUserMsg.content) {
            prompt = lastUserMsg.content;
        } else {
            prompt = "请根据你的人设，主动说一句话开始对话。";
        }

        const systemMessages = [
            { role: 'system', content: `当前现实时间：${new Date().toLocaleString()}` },
            { role: 'system', content: `用户信息：${DataManager.userProfile.userSetting || ''}` },
            { role: 'system', content: contact.personality }
        ];
        const messages = [...systemMessages, { role: 'user', content: prompt }];

        try {
            const response = await fetch(`${BACKEND_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    base_url: config.base_url,
                    api_key: config.api_key,
                    model: config.currentModel,
                    messages: messages
                })
            });
            const data = await response.json();
            let reply = data.choices?.[0]?.message?.content;
            if (reply) {
                ChatHandler.addMessageToCurrent(reply, false, false, 'text');
            }
        } catch (err) {
            Utils.showToast('AI回复失败：' + err.message);
        } finally {
            ChatHandler.addMessageToCurrent = originalAdd;
        }
    },

    async sendDrawing() {
        const contact = DataManager.contacts.find(c => c.id === this.currentContactId);
        if (!contact) {
            Utils.showToast('请先打开一个聊天窗口');
            return;
        }
        if (contact.blocked) {
            Utils.showToast('你已将对方拉黑，无法发送');
            return;
        }
        const imageDataUrl = this.canvas.toDataURL('image/png');
        Utils.showToast('正在处理画作...', 0);
        const imageId = Utils.generateImageId('drawing');
        await Utils.saveImageToDB(imageId, imageDataUrl);
        ChatHandler.addMessageToCurrent(imageId, true, false, 'image');
        this.loadChatHistory(); // 刷新聊天区
        Utils.showToast('画作已发送', 1500);
    },

    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.restoreState(this.history[this.historyIndex]);
        } else {
            Utils.showToast('没有可撤销的步骤了');
        }
    },

    saveState() {
        this.history = this.history.slice(0, this.historyIndex + 1);
        const state = this.canvas.toDataURL();
        this.history.push(state);
        this.historyIndex = this.history.length - 1;
    },

    restoreState(dataUrl) {
        const img = new Image();
        img.onload = () => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0);
        };
        img.src = dataUrl;
    },

    clearCanvas() {
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.currentSize;
    },

    randomTopic() {
        const randomIndex = Math.floor(Math.random() * this.topics.length);
        document.getElementById('drawingTopic').textContent = this.topics[randomIndex];
    },

    startDraw(e) {
        this.isDrawing = true;
        const pos = this.getCanvasCoordinates(e);
        this.lastX = pos.x;
        this.lastY = pos.y;
        this.ctx.beginPath();
        this.ctx.moveTo(this.lastX, this.lastY);
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.lineWidth = this.currentSize;
    },
    draw(e) {
        if (!this.isDrawing) return;
        const pos = this.getCanvasCoordinates(e);
        this.ctx.lineTo(pos.x, pos.y);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(pos.x, pos.y);
        this.lastX = pos.x;
        this.lastY = pos.y;
    },
    endDraw() {
        if (this.isDrawing) {
            this.isDrawing = false;
            this.saveState();
        }
        this.ctx.beginPath();
    },
    getCanvasCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        let clientX, clientY;
        if (e.touches) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        let canvasX = (clientX - rect.left) * scaleX;
        let canvasY = (clientY - rect.top) * scaleY;
        canvasX = Math.min(Math.max(0, canvasX), this.canvas.width);
        canvasY = Math.min(Math.max(0, canvasY), this.canvas.height);
        return { x: canvasX, y: canvasY };
    },
    handleTouchStart(e) { e.preventDefault(); this.startDraw(e); },
    handleTouchMove(e) { e.preventDefault(); this.draw(e); }
};
    // ==================== 模态框处理模块 ====================
const ModalHandler = {
    openNewContactModal() {
        try {
            if (!DataManager.apiConfigs || DataManager.apiConfigs.length === 0) DataManager.loadConfigs();
            const configSelect = document.getElementById('contactConfigId');
            configSelect.innerHTML = '<option value="">使用当前激活配置</option>';
            DataManager.apiConfigs.forEach(config => { const option = document.createElement('option'); option.value = config.id; option.textContent = config.name; configSelect.appendChild(option); });
            document.getElementById('contactAvatarText').value = '🤖'; window.selectedAvatarData = '🤖';
            document.getElementById('avatarPreviewText').textContent = '🤖'; document.getElementById('avatarPreviewText').style.display = 'inline'; document.getElementById('avatarPreviewImg').style.display = 'none'; document.getElementById('avatarUpload').value = '';
            document.querySelector('input[name="avatarType"][value="text"]').checked = true;
            document.getElementById('avatarTextInput').style.display = 'block'; document.getElementById('avatarImageInput').style.display = 'none';
            document.getElementById('contactName').value = ''; document.getElementById('contactRemark').value = ''; document.getElementById('contactPersonality').value = '';
            document.getElementById('newContactModal').classList.add('active');
        } catch(e) { console.error('打开新建联系人模态框失败:', e); Utils.showToast('打开失败，请查看控制台错误'); }
    },
    closeNewContactModal() { document.getElementById('newContactModal').classList.remove('active'); },
    openRemarkModal() { const contact = DataManager.getCurrentContact(); document.getElementById('newRemark').value = contact.remark || ''; document.getElementById('remarkModal').classList.add('active'); },
    closeRemarkModal() { document.getElementById('remarkModal').classList.remove('active'); },
    openEditPersonaModal() {
        const contact = DataManager.getCurrentContact();
        document.getElementById('editContactName').value = contact.name || ''; document.getElementById('editContactPersonality').value = contact.personality || '';
        const isImage = contact.avatar && (Utils.isBase64Image(contact.avatar) || !isNaN(contact.avatar));
        const textRadio = document.querySelector('input[name="editAvatarType"][value="text"]'), imageRadio = document.querySelector('input[name="editAvatarType"][value="image"]');
        if (isImage) {
            imageRadio.checked = true; document.getElementById('editAvatarTextInput').style.display = 'none'; document.getElementById('editAvatarImageInput').style.display = 'block'; document.getElementById('editAvatarPreviewText').style.display = 'none';
            Utils.setImageElement(document.getElementById('editAvatarPreview'), contact.avatar, '🤖'); window.editSelectedAvatarData = contact.avatar;
        } else {
            textRadio.checked = true; document.getElementById('editAvatarTextInput').style.display = 'block'; document.getElementById('editAvatarImageInput').style.display = 'none';
            document.getElementById('editAvatarPreviewText').textContent = contact.avatar || '🤖'; document.getElementById('editAvatarPreviewText').style.display = 'inline'; document.getElementById('editAvatarPreviewImg').style.display = 'none';
            document.getElementById('editContactAvatarText').value = contact.avatar || '🤖'; window.editSelectedAvatarData = contact.avatar || '🤖';
        }
        document.getElementById('editAvatarUpload').value = ''; document.getElementById('editPersonaModal').classList.add('active');
    },
    closeEditPersonaModal() { document.getElementById('editPersonaModal').classList.remove('active'); }
};

// ==================== 备份处理模块 ====================
const BackupHandler = {
    async exportBackup() {
        try {
            Utils.showToast('正在准备备份...', 0);
            const images = await Utils.getAllImages();
         // 加密 API 配置中的敏感信息再备份
const encryptedConfigs = DataManager.apiConfigs.map(cfg => ({
    ...cfg,
    base_url: cfg.base_url ? encrypt(cfg.base_url) : "",
    api_key: cfg.api_key ? encrypt(cfg.api_key) : ""
}));
const backup = { version: 1, timestamp: Date.now(), apiConfigs: encryptedConfigs, activeConfigId: DataManager.activeConfigId, contacts: DataManager.contacts, userProfile: DataManager.userProfile, beautifySettings: DataManager.beautifySettings, worldBooks: DataManager.worldBooks, posts: DataManager.posts, wallet: DataManager.wallet, images };               const json = JSON.stringify(backup, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `ai-chat-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
            URL.revokeObjectURL(url);
            Utils.showToast('备份导出成功', 2000);
        } catch(err) { Utils.showToast('导出失败：' + err.message, 3000); }
    },
    async importBackup(file) {
        try {
            Utils.showToast('正在导入备份...', 0);
            const text = await Utils.readFileAsText(file);
            const backup = JSON.parse(text);
            if (!backup.version || backup.version !== 1) throw new Error('不支持的备份版本');
            if (!confirm('导入将覆盖所有现有数据，确定继续？')) return;
            await this.clearAllData(false);
            if (backup.images && Array.isArray(backup.images)) await Utils.saveImagesBatch(backup.images);
           if (backup.apiConfigs) {
    DataManager.apiConfigs = backup.apiConfigs.map(cfg => ({
        ...cfg,
        base_url: cfg.base_url ? decrypt(cfg.base_url) : "",
        api_key: cfg.api_key ? decrypt(cfg.api_key) : ""
    }));
} else {
    DataManager.apiConfigs = [];
}
 DataManager.activeConfigId = backup.activeConfigId || (DataManager.apiConfigs[0]?.id || null);
            DataManager.contacts = backup.contacts || [];
            DataManager.userProfile = backup.userProfile || { name: '我的网名', status: '在线', avatar: '🤖' };
            DataManager.beautifySettings = backup.beautifySettings || { wallpaper: null, appIcons: {}, momentCover: null, callBackground: null, widgetBackgrounds: { weather: null, calendar: null, aiStatus: null } };
            DataManager.worldBooks = backup.worldBooks || [];
            DataManager.posts = backup.posts || [];
            DataManager.wallet = backup.wallet || { balance: 1234.56, transactions: [] };
            DataManager.saveConfigs(); DataManager.saveContacts(); DataManager.saveUserProfile(); DataManager.saveBeautifySettings(); DataManager.saveWorldBooks(); DataManager.savePosts(); DataManager.saveWallet();
            Utils.showToast('导入成功，页面即将刷新', 2000);
            setTimeout(() => location.reload(), 1500);
        } catch(err) { Utils.showToast('导入失败：' + err.message, 3000); }
    },
    async clearAllData(confirmMsg = true) {
        if (confirmMsg && !confirm('⚠️ 确定要清除所有数据吗？此操作不可恢复！')) return;
        Utils.showToast('正在清除数据...', 0);
        localStorage.removeItem('apiConfigs'); localStorage.removeItem('activeConfigId'); localStorage.removeItem('contacts'); localStorage.removeItem('userProfile'); localStorage.removeItem('beautifySettings'); localStorage.removeItem('worldBooks'); localStorage.removeItem('posts'); localStorage.removeItem('wallet');
        await Utils.clearImages();
        DataManager.apiConfigs = [{ id: Date.now().toString(), name: '默认配置', base_url: '', api_key: '', models: [], currentModel: '' }];
        DataManager.activeConfigId = DataManager.apiConfigs[0].id;
        DataManager.contacts = [{ id: Date.now().toString(), avatar: '🤖', name: '默认助手', remark: '', personality: '你是一个友好的AI助手，乐于助人。', configId: '', blocked: false, pinned: false, muted: false, mutedLastMessage: '', messages: [], autoPostEnabled: false, autoPostInterval: 1, lastAutoPostTime: 0, bubbleCss: '', chatBackground: null, intimateCard: { enabled: false, monthlyLimit: 0, usedAmount: 0, cardNumber: '' }, selectiveReplyEnabled: false }];
        DataManager.currentContactId = DataManager.contacts[0].id;
        DataManager.userProfile = { name: '我的网名', status: '在线', avatar: '🤖', realName: '', address: '', lineId: '', bio: '', userSetting: '' };
        DataManager.beautifySettings = { wallpaper: null, appIcons: {}, momentCover: null, callBackground: null, widgetBackgrounds: { weather: null, calendar: null, aiStatus: null } };
        DataManager.worldBooks = []; DataManager.posts = []; DataManager.wallet = { balance: 1234.56, transactions: [] };
        DataManager.saveConfigs(); DataManager.saveContacts(); DataManager.saveUserProfile(); DataManager.saveBeautifySettings(); DataManager.saveWorldBooks(); DataManager.savePosts(); DataManager.saveWallet();
        Utils.showToast('数据已清除，页面即将刷新', 2000);
        setTimeout(() => location.reload(), 1500);
    }
};

// ==================== 应用视图切换 ====================
function hideAllAppViews() {
    if (VoiceCallHandler.currentContactId) VoiceCallHandler.hangup();
    document.getElementById('chatView').classList.remove('active');
    document.getElementById('settingsView').classList.remove('active');
    document.getElementById('worldBookView').classList.remove('active');
    document.getElementById('beautifyView').classList.remove('active');
    document.getElementById('browserView').classList.remove('active');
    document.getElementById('phoneView').classList.remove('active');
    document.getElementById('userProfileView').classList.remove('active');
    document.getElementById('userArchiveView').classList.remove('active');
    document.getElementById('userWalletView').classList.remove('active');
    document.getElementById('intimateCardListView').classList.remove('active');
    document.getElementById('voiceCallView').classList.remove('active');
}

function openApp(app) {
    hideAllAppViews();
    if (app === 'chat') { document.getElementById('chatView').classList.add('active'); ChatHandler.showContactList(); }
    else if (app === 'settings') { document.getElementById('settingsView').classList.add('active'); UIManager.renderConfigList(); }
    else if (app === 'worldbook') { document.getElementById('worldBookView').classList.add('active'); UIManager.renderWorldBookList(); }
    else if (app === 'beautify') { document.getElementById('beautifyView').classList.add('active'); UIManager.renderIconGrid(); }
    else if (app === 'browser') document.getElementById('browserView').classList.add('active');
    else if (app === 'phone') document.getElementById('phoneView').classList.add('active');
    else if (app === 'intimateCardList') { document.getElementById('intimateCardListView').classList.add('active'); WalletManager.renderIntimateCards(); }
}

// ==================== 自动发布定时器 ====================
function startAutoPostTimer() {
    setInterval(() => {
        DataManager.contacts.forEach(contact => {
            if (contact.autoPostEnabled) {
                const intervalMs = (contact.autoPostInterval || 1) * 3600000;
                if (Date.now() - (contact.lastAutoPostTime || 0) >= intervalMs) {
                    PostManager.generateAIPost(contact.id).then(() => {
                        contact.lastAutoPostTime = Date.now();
                        DataManager.saveContacts();
                    }).catch(err => console.error('自动发布失败', err));
                }
            }
        });
    }, 60000);
}

// ==================== 天气和日历小部件管理器 ====================
const WidgetManager = {
    weatherData: { city: '北京', temp: 23, desc: '晴' },
    init() { this.updateWeather(); this.updateCalendar(); this.bindEvents(); setInterval(() => this.updateWeather(), 3600000); setInterval(() => this.updateCalendar(), 60000); },
    updateWeather() {
        const cities = ['北京', '上海', '广州', '深圳', '杭州'], descs = ['晴', '多云', '阴', '小雨', '大雨', '雪'];
        this.weatherData.city = cities[Math.floor(Math.random() * cities.length)];
        this.weatherData.temp = Math.floor(Math.random() * 15 + 15);
        this.weatherData.desc = descs[Math.floor(Math.random() * descs.length)];
        this.renderWeather();
    },
    renderWeather() {
        document.getElementById('weatherTemp').textContent = this.weatherData.temp + '°C';
        document.getElementById('weatherDesc').textContent = this.weatherData.desc;
        document.getElementById('weatherCity').textContent = this.weatherData.city;
    },
    updateCalendar() {
        const now = new Date();
        const date = now.getDate(), days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'], day = days[now.getDay()];
        const lunar = this.getLunar(now);
        document.getElementById('calendarDate').textContent = date;
        document.getElementById('calendarDay').textContent = day;
        document.getElementById('calendarLunar').textContent = lunar;
    },
    getLunar(date) {
        const month = date.getMonth() + 1, day = date.getDate();
        const lunarMonth = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'][month-1];
        return lunarMonth + '月' + day + '日';
    },
    bindEvents() { document.getElementById('refreshWeather').addEventListener('click', () => { this.updateWeather(); Utils.showToast('天气已刷新'); }); }
};

// ==================== 图标拖拽排序功能 ====================
let isEditMode = false, draggedIcon = null, dragOverIcon = null;
function enterEditMode() {
    if (isEditMode) return;
    isEditMode = true;
    document.querySelectorAll('.app-icon').forEach(icon => { icon.classList.add('long-press'); icon.setAttribute('draggable', 'true'); });
    Utils.showToast('长按图标可拖动排序', 2000);
}
function exitEditMode() {
    if (!isEditMode) return;
    isEditMode = false;
    document.querySelectorAll('.app-icon').forEach(icon => { icon.classList.remove('long-press'); icon.setAttribute('draggable', 'false'); });
}
function initDragAndDrop() {
    const icons = document.querySelectorAll('.app-icon');
    icons.forEach(icon => {
        icon.addEventListener('dragstart', (e) => {
            if (!isEditMode) { e.preventDefault(); return; }
            draggedIcon = icon;
            e.dataTransfer.setData('text/plain', icon.dataset.app);
            icon.style.opacity = '0.5';
        });
        icon.addEventListener('dragend', (e) => { icon.style.opacity = '1'; draggedIcon = null; dragOverIcon = null; });
        icon.addEventListener('dragover', (e) => { e.preventDefault(); if (!isEditMode || !draggedIcon) return; dragOverIcon = icon; });
        icon.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!isEditMode || !draggedIcon || !dragOverIcon || draggedIcon === dragOverIcon) return;
            const parentGrid = draggedIcon.parentNode;
            if (parentGrid !== dragOverIcon.parentNode) return;
            const children = Array.from(parentGrid.children);
            const fromIndex = children.indexOf(draggedIcon), toIndex = children.indexOf(dragOverIcon);
            if (fromIndex < toIndex) parentGrid.insertBefore(dragOverIcon, draggedIcon);
            else parentGrid.insertBefore(draggedIcon, dragOverIcon);
            draggedIcon.style.opacity = '1'; dragOverIcon.style.opacity = '1';
            draggedIcon = null; dragOverIcon = null;
            saveIconOrder();
        });
    });
}
function saveIconOrder() {
    const leftGrid = document.querySelector('.app-grid-left'), rightGrid = document.querySelector('.app-grid-right');
    const order = { left: Array.from(leftGrid.children).map(icon => icon.dataset.app), right: Array.from(rightGrid.children).map(icon => icon.dataset.app) };
    localStorage.setItem('iconOrder', JSON.stringify(order));
}
function loadIconOrder() {
    const saved = localStorage.getItem('iconOrder');
    if (!saved) return;
    try {
        const order = JSON.parse(saved);
        const leftGrid = document.querySelector('.app-grid-left'), rightGrid = document.querySelector('.app-grid-right');
        if (order.left) { const leftIcons = Array.from(leftGrid.children); order.left.reverse().forEach(app => { const icon = leftIcons.find(i => i.dataset.app === app); if (icon) leftGrid.prepend(icon); }); }
        if (order.right) { const rightIcons = Array.from(rightGrid.children); order.right.reverse().forEach(app => { const icon = rightIcons.find(i => i.dataset.app === app); if (icon) rightGrid.prepend(icon); }); }
    } catch(e) {}
}
function initLongPressEffect() {
    const icons = document.querySelectorAll('.app-icon');
    let longPressTimer = null;
    const startLongPress = (icon) => { if (longPressTimer) clearTimeout(longPressTimer); longPressTimer = setTimeout(() => { enterEditMode(); longPressTimer = null; }, 500); };
    const cancelLongPress = () => { if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; } };
    icons.forEach(icon => {
        icon.addEventListener('touchstart', (e) => { startLongPress(icon); });
        icon.addEventListener('touchend', cancelLongPress); icon.addEventListener('touchcancel', cancelLongPress); icon.addEventListener('touchmove', cancelLongPress);
        icon.addEventListener('mousedown', (e) => { startLongPress(icon); });
        icon.addEventListener('mouseup', cancelLongPress); icon.addEventListener('mouseleave', cancelLongPress);
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.app-icon') && isEditMode) exitEditMode(); });
}
window.currentAudio = null;
window.playVoice = async function(audioId, icon) {
    if (window.currentAudio && !window.currentAudio.paused) { window.currentAudio.pause(); window.currentAudio = null; document.querySelectorAll('.voice-icon-wechat').forEach(i => { i.classList.remove('fa-pause'); i.classList.add('fa-play'); }); }
    const dataUrl = await Utils.loadImageFromDB(audioId);
    if (!dataUrl) { Utils.showToast('音频加载失败'); return; }
    const audio = new Audio(dataUrl);
    window.currentAudio = audio;
    audio.play();
    icon.classList.remove('fa-play'); icon.classList.add('fa-pause');
    audio.onended = () => { icon.classList.remove('fa-pause'); icon.classList.add('fa-play'); window.currentAudio = null; };
};
window.speakText = function(text, icon) {
    if (window.speechSynthesis.speaking) { window.speechSynthesis.cancel(); document.querySelectorAll('.voice-icon-wechat').forEach(i => { i.classList.remove('fa-pause'); i.classList.add('fa-play'); }); }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.onstart = () => { icon.classList.remove('fa-play'); icon.classList.add('fa-pause'); };
    utterance.onend = () => { icon.classList.remove('fa-pause'); icon.classList.add('fa-play'); };
    window.speechSynthesis.speak(utterance);
};
function createUnbindModal() {
    if (document.getElementById('unbindIntimateModal')) return;
    const modalHTML = `<div class="modal-overlay" id="unbindIntimateModal"><div class="modal-content" style="max-width: 300px; text-align: center;"><div class="modal-header"><h3>解绑亲属卡</h3><span class="close-modal" id="closeUnbindModal">&times;</span></div><div class="form-group" style="margin: 20px 0;"><span id="unbindContactName" style="font-weight:600; color:#ff3b30;"></span><p>确定要解绑该角色的亲属卡吗？</p></div><div class="form-actions" style="justify-content: center;"><button class="save-btn" id="confirmUnbindBtn" style="background: #ff3b30;">解绑</button><button class="cancel-btn" id="cancelUnbindBtn">取消</button></div></div></div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

// ==================== 事件绑定初始化 ====================
function bindEvents() {
    document.querySelectorAll('.app-icon[data-app]').forEach(icon => { icon.addEventListener('click', (e) => { if (isEditMode) return; openApp(icon.getAttribute('data-app')); }); });
    document.querySelectorAll('[data-back]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (document.getElementById('intimateCardListView').classList.contains('active')) { document.getElementById('intimateCardListView').classList.remove('active'); document.getElementById('userWalletView').classList.add('active'); WalletManager.renderWallet(); }
            else if (document.getElementById('userWalletView').classList.contains('active')) { document.getElementById('userWalletView').classList.remove('active'); document.getElementById('userProfileView').classList.add('active'); }
            else if (document.getElementById('userArchiveView').classList.contains('active')) { document.getElementById('userArchiveView').classList.remove('active'); document.getElementById('userProfileView').classList.add('active'); }
            else if (document.getElementById('userProfileView').classList.contains('active')) { document.getElementById('userProfileView').classList.remove('active'); document.getElementById('chatView').classList.add('active'); ChatHandler.showContactList(); }
            else hideAllAppViews();
        });
    });
    document.getElementById('contactListContainer').addEventListener('click', (e) => { const item = e.target.closest('.contact-item'); if (item) { DataManager.currentContactId = item.dataset.id; ChatHandler.enterChatDetail(item.dataset.id); } });
    document.getElementById('friendsListContainer').addEventListener('click', (e) => { const item = e.target.closest('.contact-item'); if (item) { DataManager.currentContactId = item.dataset.id; ChatHandler.enterChatDetail(item.dataset.id); } });
    const messageArea = document.getElementById('messageArea');
    messageArea.addEventListener('scroll', () => { if (messageArea.scrollTop < 100 && !ChatHandler.isLoadingMore) ChatHandler.loadMoreMessages(); });
    // Re-instating the click listener for bubbles
    messageArea.addEventListener('click', (e) => {
        if (ChatHandler.isMultiSelectMode) {
            const msgRow = e.target.closest('.message');
            if (msgRow) ChatHandler.toggleMessageSelection(parseInt(msgRow.dataset.index));
            return;
        }
        const transferBubble = e.target.closest('.transfer-bubble');
        if (transferBubble) {
            ChatHandler.handleTransferClick(parseInt(transferBubble.dataset.index));
            return;
        }
        const intimateBubble = e.target.closest('.intimate-bubble, .intimate-card-bubble');
        if (intimateBubble) {
            IntimateHandler.handleIntimateClick(parseInt(intimateBubble.dataset.index));
            return;
        }
    });
    document.getElementById('imageBtn').addEventListener('touchend', () => { const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none'; document.body.appendChild(fileInput); fileInput.click(); fileInput.addEventListener('change', (e) => { const file = e.target.files[0]; if (file) ChatHandler.sendImage(file); document.body.removeChild(fileInput); }); });
    document.getElementById('cameraBtn').addEventListener('click', () => { const cameraInput = document.createElement('input'); cameraInput.type = 'file'; cameraInput.accept = 'image/*'; cameraInput.capture = 'environment'; cameraInput.style.display = 'none'; document.body.appendChild(cameraInput); cameraInput.addEventListener('change', (e) => { const file = e.target.files[0]; if (file) ChatHandler.sendImage(file); document.body.removeChild(cameraInput); }); cameraInput.click(); });
    document.getElementById('plusActionBtn').addEventListener('click', () => {
    const panel = document.getElementById('actionPanel');
    if (panel.style.display === 'none') {
        // 显示面板
        panel.style.display = 'block';
        // 如果面板为空，生成菜单内容（带右上角叉叉）
        if (panel.innerHTML.trim() === '' || panel.children.length === 0) {
            panel.innerHTML = `
                <div class="close-icon-panel"><i class="fa-solid fa-times"></i></div>
                <div class="action-grid">
                    <div class="action-item" data-action="voice"><i class="fa-solid fa-microphone"></i><span>语音</span></div>
                    <div class="action-item" data-action="transfer"><i class="fa-solid fa-money-bill"></i><span>转账</span></div>
                    <div class="action-item" data-action="intimate"><i class="fa-solid fa-heart"></i><span>亲密付</span></div>
                    <div class="action-item" data-action="voiceCall"><i class="fa-solid fa-phone"></i><span>语音通话</span></div>
                    <div class="action-item" data-action="replay"><i class="fa-solid fa-paint-brush"></i><span>画板</span></div>
                    <div class="action-item" data-action="location"><i class="fa-solid fa-location-dot"></i><span>定位</span></div>
                    <div class="action-item" data-action="theater"><i class="fa-solid fa-masks-theater"></i><span>小剧场模式</span></div>
                </div>
            `;
            // 绑定菜单项点击事件
            panel.querySelectorAll('.action-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    const action = item.dataset.action;
                    panel.style.display = 'none';
                    // 移除全局监听
                    if (window.closePanelListener) document.removeEventListener('click', window.closePanelListener);
                    // 执行对应操作
                    if (action === 'voice') document.getElementById('voiceCard').classList.add('active');
                    else if (action === 'transfer') document.getElementById('transferModal').classList.add('active');
                    else if (action === 'intimate') {
                        const currentContact = DataManager.getCurrentContact();
                        if (currentContact && currentContact.intimateCard && currentContact.intimateCard.enabled) IntimateHandler.openSendModal(currentContact);
                        else IntimateHandler.openRoleModal();
                    }
                    else if (action === 'voiceCall') {
                        const contact = DataManager.getCurrentContact();
                        if (contact) VoiceCallHandler.openCall(contact.id);
                    }
else if (action === 'replay') {
    const contact = DataManager.getCurrentContact();
    if (contact) {
        DrawingBoard.openWithContact(contact.id);
    } else {
        Utils.showToast('请先进入一个聊天');
    }
}
else Utils.showToast(`功能 ${action} 开发中`);
                });
            });
            // 绑定叉叉关闭按钮
            panel.querySelector('.close-icon-panel').addEventListener('click', () => {
                panel.style.display = 'none';
                if (window.closePanelListener) document.removeEventListener('click', window.closePanelListener);
            });
        }
        // 添加全局点击监听，点击面板外部关闭
        if (window.closePanelListener) document.removeEventListener('click', window.closePanelListener);
        window.closePanelListener = (e) => {
            if (!panel.contains(e.target)) {
                panel.style.display = 'none';
                document.removeEventListener('click', window.closePanelListener);
                delete window.closePanelListener;
            }
        };
        setTimeout(() => {
            document.addEventListener('click', window.closePanelListener);
        }, 0);
        // 滚动到底部
        const chatArea = document.getElementById('messageArea');
        if (chatArea) chatArea.scrollTop = chatArea.scrollHeight;
    } else {
        panel.style.display = 'none';
        if (window.closePanelListener) document.removeEventListener('click', window.closePanelListener);
    }
});    document.getElementById('closeVoiceCard').addEventListener('click', () => { document.getElementById('voiceCard').classList.remove('active'); });
    document.getElementById('voiceMicIcon').addEventListener('click', () => { ChatHandler.startRecording(); });
    document.getElementById('voiceSendBtn').addEventListener('click', () => { const text = document.getElementById('voiceTextInput').value.trim(); if (text) { ChatHandler.sendSimulatedVoice(text); document.getElementById('voiceTextInput').value = ''; document.getElementById('voiceCard').classList.remove('active'); } else Utils.showToast('请输入文字'); });
    document.getElementById('closeTransferModal').addEventListener('click', () => { document.getElementById('transferModal').classList.remove('active'); });
    document.getElementById('cancelTransfer').addEventListener('click', () => { document.getElementById('transferModal').classList.remove('active'); });
    document.getElementById('transferModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) document.getElementById('transferModal').classList.remove('active'); });
    document.getElementById('sendTransfer').addEventListener('click', () => { const amount = document.getElementById('transferAmount').value.trim(), note = document.getElementById('transferNote').value.trim(); ChatHandler.sendTransfer(amount, note); document.getElementById('transferModal').classList.remove('active'); document.getElementById('transferAmount').value = ''; document.getElementById('transferNote').value = ''; });
    document.getElementById('closeTransferActionModal').addEventListener('click', () => { document.getElementById('transferActionModal').classList.remove('active'); });
    document.getElementById('transferActionModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) document.getElementById('transferActionModal').classList.remove('active'); });
    document.getElementById('deleteSelectedBtn').addEventListener('click', () => { ChatHandler.deleteSelectedMessages(); });
    document.getElementById('cancelMultiSelectBtn').addEventListener('click', () => { ChatHandler.exitMultiSelectMode(); });
    document.getElementById('editSelectedBtn').addEventListener('click', () => { if (ChatHandler.selectedMessages.size !== 1) { Utils.showToast('请只选择一条消息进行编辑'); return; } const index = Array.from(ChatHandler.selectedMessages)[0]; const contact = DataManager.getCurrentContact(); const msg = contact.messages[index]; if (!msg || msg.type !== 'text' || Utils.isRecallMessage(msg)) { Utils.showToast('只能编辑文本消息'); return; } document.getElementById('editMessageContent').value = msg.content; document.getElementById('editMessageModal').classList.add('active'); window.currentEditMessageIndex = index; });
    document.getElementById('saveEditMessage').addEventListener('click', () => { const newContent = document.getElementById('editMessageContent').value.trim(); if (newContent && window.currentEditMessageIndex !== undefined) { ChatHandler.editMessage(window.currentEditMessageIndex, newContent); } document.getElementById('editMessageModal').classList.remove('active'); ChatHandler.exitMultiSelectMode(); });
    document.getElementById('closeEditMessageModal').addEventListener('click', () => { document.getElementById('editMessageModal').classList.remove('active'); });
    document.getElementById('cancelEditMessage').addEventListener('click', () => { document.getElementById('editMessageModal').classList.remove('active'); });
    document.getElementById('editMessageModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) document.getElementById('editMessageModal').classList.remove('active'); });
    document.getElementById('closeTranscriptModal').addEventListener('click', () => { document.getElementById('voiceTranscriptModal').classList.remove('active'); });
    document.getElementById('closeTranscriptBtn').addEventListener('click', () => { document.getElementById('voiceTranscriptModal').classList.remove('active'); });
    document.getElementById('voiceTranscriptModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) document.getElementById('voiceTranscriptModal').classList.remove('active'); });
    document.getElementById('homeButton').addEventListener('click', hideAllAppViews);
    document.getElementById('addConfigBtn').addEventListener('click', () => { const newId = Date.now().toString(); DataManager.apiConfigs.push({ id: newId, name: `新配置 ${DataManager.apiConfigs.length + 1}`, base_url: '', api_key: '', models: [], currentModel: '' }); DataManager.saveConfigs(); UIManager.renderConfigList(); setTimeout(() => ConfigHandler.editConfig(newId), 50); });
    document.getElementById('newContactBtn').addEventListener('click', ModalHandler.openNewContactModal);
    document.getElementById('closeModal').addEventListener('click', ModalHandler.closeNewContactModal);
    document.getElementById('cancelContact').addEventListener('click', ModalHandler.closeNewContactModal);
    document.getElementById('newContactModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) ModalHandler.closeNewContactModal(); });
    document.querySelectorAll('input[name="avatarType"]').forEach(radio => { radio.addEventListener('change', (e) => { const textDiv = document.getElementById('avatarTextInput'), imgDiv = document.getElementById('avatarImageInput'), previewText = document.getElementById('avatarPreviewText'), previewImg = document.getElementById('avatarPreviewImg'); if (e.target.value === 'text') { textDiv.style.display = 'block'; imgDiv.style.display = 'none'; previewText.style.display = 'inline'; previewImg.style.display = 'none'; window.selectedAvatarData = document.getElementById('contactAvatarText').value.trim() || '🤖'; } else { textDiv.style.display = 'none'; imgDiv.style.display = 'block'; previewText.style.display = 'none'; previewImg.style.display = 'block'; } }); });
    document.getElementById('contactAvatarText').addEventListener('input', (e) => { if (document.querySelector('input[name="avatarType"]:checked')?.value === 'text') { window.selectedAvatarData = e.target.value.trim() || '🤖'; document.getElementById('avatarPreviewText').textContent = window.selectedAvatarData; } });
    document.getElementById('uploadBtn').addEventListener('click', () => { document.getElementById('avatarUpload').click(); });
    document.getElementById('avatarUpload').addEventListener('change', async (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = async (event) => { Utils.showToast('正在处理图片...', 0); const originalDataUrl = event.target.result; try { const compressed = await Utils.compressImage(originalDataUrl, 200, 0.8); window.selectedAvatarData = compressed; document.getElementById('avatarPreviewImg').src = compressed; document.getElementById('avatarPreviewImg').style.display = 'block'; document.getElementById('avatarPreviewText').style.display = 'none'; Utils.showToast('图片处理完成', 1500); } catch(err) { Utils.showToast('图片压缩失败，使用原图', 2000); window.selectedAvatarData = originalDataUrl; document.getElementById('avatarPreviewImg').src = originalDataUrl; document.getElementById('avatarPreviewImg').style.display = 'block'; document.getElementById('avatarPreviewText').style.display = 'none'; } }; reader.readAsDataURL(file); });
    document.getElementById('saveContact').addEventListener('click', async () => { const name = document.getElementById('contactName').value.trim(); if (!name) { Utils.showToast('请输入联系人名称'); return; } const remark = document.getElementById('contactRemark').value.trim() || '', personality = document.getElementById('contactPersonality').value.trim(), configId = document.getElementById('contactConfigId').value || ''; const avatarId = await DataManager.processImageForSave(window.selectedAvatarData, 'contact_avatar'); const newId = Date.now().toString(); DataManager.contacts.push({ id: newId, avatar: avatarId || '🤖', name, remark, personality: personality || '你是一个友好的AI助手。', configId, blocked: false, pinned: false, muted: false, mutedLastMessage: '', messages: [], autoPostEnabled: false, autoPostInterval: 1, lastAutoPostTime: 0, bubbleCss: '', chatBackground: null, intimateCard: { enabled: false, monthlyLimit: 0, usedAmount: 0, cardNumber: '' }, selectiveReplyEnabled: false }); DataManager.saveContacts(); ModalHandler.closeNewContactModal(); UIManager.renderContactList(); UIManager.renderFriendsList(); DataManager.currentContactId = newId; ChatHandler.enterChatDetail(newId); DataManager.currentStatusIndex = 0; UIManager.updateAIStatusWidget(); });
    document.getElementById('backToListBtn').addEventListener('click', ChatHandler.showContactList);
    document.getElementById('moreMenuBtn').addEventListener('click', ChatHandler.showContactOptions);
    document.getElementById('chatDetailPage').addEventListener('click', function(e) { const target = e.target.closest('#backToListBtn, #moreMenuBtn'); if (!target) return; e.preventDefault(); if (target.id === 'backToListBtn') ChatHandler.showContactList(); else if (target.id === 'moreMenuBtn') ChatHandler.showContactOptions(); });
    const callBtnInChat = document.getElementById('callBtnInChat'); if (callBtnInChat) callBtnInChat.addEventListener('click', (e) => { e.preventDefault(); const contact = DataManager.getCurrentContact(); if (contact) VoiceCallHandler.openCall(contact.id); });
    document.getElementById('backToChatBtn').addEventListener('click', () => { document.getElementById('contactListPage').style.display = 'none'; document.getElementById('contactOptionsPage').style.display = 'none'; document.getElementById('chatDetailPage').style.display = 'flex'; });
    document.getElementById('optionsPinItem').addEventListener('click', () => { const contact = DataManager.getCurrentContact(); contact.pinned = !contact.pinned; DataManager.saveContacts(); document.getElementById('optionsPinText').textContent = contact.pinned ? '已置顶' : '置顶'; UIManager.renderContactList(); UIManager.renderFriendsList(); });
    document.getElementById('optionsRemarkItem').addEventListener('click', ModalHandler.openRemarkModal);
    document.getElementById('optionsEditPersonaItem').addEventListener('click', ModalHandler.openEditPersonaModal);
    const muteSwitch = document.getElementById('optionsMuteSwitch'); muteSwitch.addEventListener('change', (e) => { const contact = DataManager.getCurrentContact(); contact.muted = e.target.checked; if (contact.muted) { const lastMsg = contact.messages.length ? contact.messages[contact.messages.length-1] : null; contact.mutedLastMessage = lastMsg ? (lastMsg.type === 'image' ? '[图片]' : lastMsg.content) : ''; } else contact.mutedLastMessage = ''; DataManager.saveContacts(); UIManager.renderContactList(); });
    const autoPostSwitch = document.getElementById('optionsAutoPostSwitch'), intervalContainer = document.getElementById('autoPostIntervalContainer');
    autoPostSwitch.addEventListener('change', (e) => { intervalContainer.style.display = e.target.checked ? 'block' : 'none'; const contact = DataManager.getCurrentContact(); contact.autoPostEnabled = e.target.checked; DataManager.saveContacts(); });
    document.getElementById('saveAutoPostSettings').addEventListener('click', () => { const contact = DataManager.getCurrentContact(); contact.autoPostEnabled = autoPostSwitch.checked; contact.autoPostInterval = parseFloat(document.getElementById('optionsAutoPostInterval').value) || 1; if (!contact.lastAutoPostTime) contact.lastAutoPostTime = Date.now(); DataManager.saveContacts(); Utils.showToast('设置已保存'); });
    const selectiveSwitch = document.getElementById('optionsSelectiveReplySwitch'); if (selectiveSwitch) selectiveSwitch.addEventListener('change', (e) => { const contact = DataManager.getCurrentContact(); contact.selectiveReplyEnabled = e.target.checked; DataManager.saveContacts(); });
    const contactChatBgUpload = document.getElementById('contactChatBgUpload'); document.getElementById('uploadContactChatBgBtn').addEventListener('click', () => { contactChatBgUpload.click(); });
    contactChatBgUpload.addEventListener('change', async (e) => { const file = e.target.files[0]; if (!file) return; const imageId = await Utils.saveOriginalImage(file); const contact = DataManager.getCurrentContact(); contact.chatBackground = imageId; DataManager.saveContacts(); UIManager.updateContactChatBgPreview(); if (document.getElementById('chatDetailPage').style.display === 'flex') UIManager.updateCurrentChatBackground(); Utils.showToast('背景更新成功', 1500); });
    document.getElementById('resetContactChatBgBtn').addEventListener('click', () => { const contact = DataManager.getCurrentContact(); contact.chatBackground = null; DataManager.saveContacts(); UIManager.updateContactChatBgPreview(); if (document.getElementById('chatDetailPage').style.display === 'flex') UIManager.updateCurrentChatBackground(); Utils.showToast('已恢复默认背景'); });
    document.getElementById('applyContactBubbleCss').addEventListener('click', () => { const css = document.getElementById('contactBubbleCssInput').value.trim(); const contact = DataManager.getCurrentContact(); contact.bubbleCss = css; DataManager.saveContacts(); if (document.getElementById('chatDetailPage').style.display === 'flex') { UIManager.applyCurrentContactBubbleCss(); UIManager.renderMessages(contact.messages, ChatHandler.currentVisibleStart, ChatHandler.currentVisibleEnd); } Utils.showToast('气泡样式已应用'); });
    document.getElementById('optionsDelete').addEventListener('click', () => { if (confirm('确定要删除该好友吗？此操作不可恢复。')) ChatHandler.deleteContact(DataManager.getCurrentContact().id); });
    document.getElementById('optionsBlock').addEventListener('click', () => { const contact = DataManager.getCurrentContact(); const action = contact.blocked ? '解除拉黑' : '拉黑'; if (confirm(`确定要${action}该好友吗？`)) { contact.blocked = !contact.blocked; DataManager.saveContacts(); document.getElementById('contactListPage').style.display = 'none'; document.getElementById('contactOptionsPage').style.display = 'none'; document.getElementById('chatDetailPage').style.display = 'flex'; ChatHandler.enterChatDetail(contact.id); } });
    document.getElementById('optionsClear').addEventListener('click', () => { const contact = DataManager.getCurrentContact(); if (confirm('确定清空所有聊天记录吗？')) { contact.messages = []; contact.messages.push({ role: 'system', type: 'text', content: '聊天记录已清空', timestamp: Date.now() }); DataManager.saveContacts(); document.getElementById('contactListPage').style.display = 'none'; document.getElementById('contactOptionsPage').style.display = 'none'; document.getElementById('chatDetailPage').style.display = 'flex'; UIManager.renderMessages(contact.messages, 0, 0); } });
    document.getElementById('closeRemarkModal').addEventListener('click', ModalHandler.closeRemarkModal);
    document.getElementById('cancelRemark').addEventListener('click', ModalHandler.closeRemarkModal);
    document.getElementById('remarkModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) ModalHandler.closeRemarkModal(); });
    document.getElementById('saveRemark').addEventListener('click', () => { const newRemark = document.getElementById('newRemark').value.trim(); const contact = DataManager.getCurrentContact(); contact.remark = newRemark; DataManager.saveContacts(); ModalHandler.closeRemarkModal(); document.getElementById('contactListPage').style.display = 'none'; document.getElementById('contactOptionsPage').style.display = 'none'; document.getElementById('chatDetailPage').style.display = 'flex'; UIManager.renderContactList(); UIManager.renderFriendsList(); ChatHandler.enterChatDetail(contact.id); UIManager.updateAIStatusWidget(); });
    document.getElementById('closeEditModal').addEventListener('click', ModalHandler.closeEditPersonaModal);
    document.getElementById('cancelEditPersona').addEventListener('click', ModalHandler.closeEditPersonaModal);
    document.getElementById('editPersonaModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) ModalHandler.closeEditPersonaModal(); });
    document.querySelectorAll('input[name="editAvatarType"]').forEach(radio => { radio.addEventListener('change', (e) => { const textDiv = document.getElementById('editAvatarTextInput'), imgDiv = document.getElementById('editAvatarImageInput'), previewText = document.getElementById('editAvatarPreviewText'), previewImg = document.getElementById('editAvatarPreviewImg'); if (e.target.value === 'text') { textDiv.style.display = 'block'; imgDiv.style.display = 'none'; previewText.style.display = 'inline'; previewImg.style.display = 'none'; window.editSelectedAvatarData = document.getElementById('editContactAvatarText').value.trim() || '🤖'; previewText.textContent = window.editSelectedAvatarData; } else { textDiv.style.display = 'none'; imgDiv.style.display = 'block'; previewText.style.display = 'none'; previewImg.style.display = 'block'; } }); });
    document.getElementById('editContactAvatarText').addEventListener('input', (e) => { if (document.querySelector('input[name="editAvatarType"]:checked')?.value === 'text') { window.editSelectedAvatarData = e.target.value.trim() || '🤖'; document.getElementById('editAvatarPreviewText').textContent = window.editSelectedAvatarData; } });
    document.getElementById('editUploadBtn').addEventListener('click', () => { document.getElementById('editAvatarUpload').click(); });
    document.getElementById('editAvatarUpload').addEventListener('change', async (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = async (event) => { Utils.showToast('正在处理图片...', 0); const originalDataUrl = event.target.result; try { const compressed = await Utils.compressImage(originalDataUrl, 200, 0.8); window.editSelectedAvatarData = compressed; document.getElementById('editAvatarPreviewImg').src = compressed; document.getElementById('editAvatarPreviewImg').style.display = 'block'; document.getElementById('editAvatarPreviewText').style.display = 'none'; Utils.showToast('图片处理完成', 1500); } catch(err) { Utils.showToast('图片压缩失败，使用原图', 2000); window.editSelectedAvatarData = originalDataUrl; document.getElementById('editAvatarPreviewImg').src = originalDataUrl; document.getElementById('editAvatarPreviewImg').style.display = 'block'; document.getElementById('editAvatarPreviewText').style.display = 'none'; } }; reader.readAsDataURL(file); });
    document.getElementById('saveEditPersona').addEventListener('click', async () => { const name = document.getElementById('editContactName').value.trim(), personality = document.getElementById('editContactPersonality').value.trim(); if (!name) { Utils.showToast('请输入联系人名称'); return; } const contact = DataManager.getCurrentContact(); contact.name = name; contact.personality = personality || '你是一个友好的AI助手。'; const avatarId = await DataManager.processImageForSave(window.editSelectedAvatarData, 'contact_avatar'); contact.avatar = avatarId || '🤖'; DataManager.saveContacts(); ModalHandler.closeEditPersonaModal(); document.getElementById('contactListPage').style.display = 'none'; document.getElementById('contactOptionsPage').style.display = 'none'; document.getElementById('chatDetailPage').style.display = 'flex'; UIManager.renderContactList(); UIManager.renderFriendsList(); ChatHandler.enterChatDetail(contact.id); UIManager.updateAIStatusWidget(); });
    document.getElementById('userName').addEventListener('input', (e) => { DataManager.userProfile.name = e.target.value; DataManager.saveUserProfile(); });
    document.getElementById('userStatus').addEventListener('input', (e) => { DataManager.userProfile.status = e.target.value; DataManager.saveUserProfile(); });
    document.getElementById('saveProfileDetails').addEventListener('click', () => { DataManager.userProfile.realName = document.getElementById('realName').value.trim(); DataManager.userProfile.address = document.getElementById('address').value.trim(); DataManager.userProfile.lineId = document.getElementById('lineId').value.trim(); DataManager.userProfile.bio = document.getElementById('bio').value.trim(); DataManager.userProfile.userSetting = document.getElementById('userSetting').value.trim(); DataManager.saveUserProfile(); UIManager.updateProfileCover(); Utils.showToast('保存成功'); });
    document.getElementById('profileArchive').addEventListener('click', () => { document.getElementById('userProfileView').classList.remove('active'); document.getElementById('userArchiveView').classList.add('active'); });
    document.getElementById('profileWallet').addEventListener('click', () => { document.getElementById('userProfileView').classList.remove('active'); document.getElementById('userWalletView').classList.add('active'); WalletManager.renderWallet(); });
    document.getElementById('profileDiary').addEventListener('click', () => Utils.showToast('日记功能开发中'));
    document.getElementById('userProfileArea').addEventListener('click', (e) => { if (e.target.tagName === 'INPUT') return; document.getElementById('contactListPage').style.display = 'none'; document.getElementById('userProfileView').classList.add('active'); });
    const wallpaperUpload = document.getElementById('wallpaperUpload'); document.getElementById('uploadWallpaperBtn').addEventListener('click', () => { wallpaperUpload.click(); });
    wallpaperUpload.addEventListener('change', async (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = async (event) => { Utils.showToast('正在处理壁纸...', 0); const originalDataUrl = event.target.result; try { const imageId = Utils.generateImageId('wallpaper'); await Utils.saveImageToDB(imageId, originalDataUrl); DataManager.beautifySettings.wallpaper = imageId; DataManager.saveBeautifySettings(); await Utils.setBackgroundImage(document.querySelector('.desktop'), imageId, 'https://img.heliar.top/file/1773847367891_1773847331104.png'); document.getElementById('wallpaperPreview').textContent = '壁纸已更新'; Utils.showToast('壁纸更新成功', 1500); } catch(err) { Utils.showToast('壁纸处理失败', 2000); } }; reader.readAsDataURL(file); });
    document.getElementById('clearWallpaperBtn').addEventListener('click', async () => { DataManager.beautifySettings.wallpaper = null; DataManager.saveBeautifySettings(); const desktop = document.querySelector('.desktop'); await Utils.setBackgroundImage(desktop, null, 'https://img.heliar.top/file/1773847367891_1773847331104.png'); document.getElementById('wallpaperPreview').textContent = '当前壁纸：默认'; Utils.showToast('已恢复默认壁纸'); });
    const profileCover = document.getElementById('profileCover'); if (profileCover) { profileCover.addEventListener('click', async (e) => { if (e.target.closest('.post-btn')) return; const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none'; document.body.appendChild(fileInput); fileInput.click(); fileInput.addEventListener('change', async (e) => { const file = e.target.files[0]; if (!file) return; const imageId = await Utils.saveOriginalImage(file); DataManager.beautifySettings.momentCover = imageId; DataManager.saveBeautifySettings(); await UIManager.updateProfileCover(); Utils.showToast('封面已更新', 1500); document.body.removeChild(fileInput); }); }); }
    const callBgUpload = document.getElementById('callBackgroundUpload'); document.getElementById('uploadCallBackgroundBtn').addEventListener('click', () => { callBgUpload.click(); });
    callBgUpload.addEventListener('change', async (e) => { const file = e.target.files[0]; if (!file) return; const imageId = await Utils.saveOriginalImage(file); DataManager.beautifySettings.callBackground = imageId; DataManager.saveBeautifySettings(); document.getElementById('callBackgroundPreview').textContent = '当前背景：自定义'; if (document.getElementById('voiceCallView').classList.contains('active') && VoiceCallHandler.currentContactId) VoiceCallHandler.openCall(VoiceCallHandler.currentContactId); Utils.showToast('背景保存成功', 1500); });
    document.getElementById('resetCallBackgroundBtn').addEventListener('click', () => { DataManager.beautifySettings.callBackground = null; DataManager.saveBeautifySettings(); document.getElementById('callBackgroundPreview').textContent = '当前背景：默认'; if (document.getElementById('voiceCallView').classList.contains('active') && VoiceCallHandler.currentContactId) VoiceCallHandler.openCall(VoiceCallHandler.currentContactId); Utils.showToast('已恢复默认背景'); });
    document.getElementById('weatherWidget').addEventListener('click', (e) => { if (e.target.closest('#refreshWeather')) return; const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none'; document.body.appendChild(fileInput); fileInput.click(); fileInput.addEventListener('change', async (e) => { const file = e.target.files[0]; if (!file) return; const imageId = await Utils.saveOriginalImage(file); if (!DataManager.beautifySettings.widgetBackgrounds) DataManager.beautifySettings.widgetBackgrounds = {}; DataManager.beautifySettings.widgetBackgrounds.weather = imageId; DataManager.saveBeautifySettings(); UIManager.updateWeatherWidgetBg(); Utils.showToast('背景更新成功', 1500); document.body.removeChild(fileInput); }); });
    document.getElementById('calendarWidget').addEventListener('click', (e) => { const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none'; document.body.appendChild(fileInput); fileInput.click(); fileInput.addEventListener('change', async (e) => { const file = e.target.files[0]; if (!file) return; const imageId = await Utils.saveOriginalImage(file); if (!DataManager.beautifySettings.widgetBackgrounds) DataManager.beautifySettings.widgetBackgrounds = {}; DataManager.beautifySettings.widgetBackgrounds.calendar = imageId; DataManager.saveBeautifySettings(); UIManager.updateCalendarWidgetBg(); Utils.showToast('背景更新成功', 1500); document.body.removeChild(fileInput); }); });
    document.getElementById('aiStatusWidget').addEventListener('click', (e) => { if (e.target.closest('.ai-status-switch') || e.target.closest('.ai-status-avatar-large')) return; const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none'; document.body.appendChild(fileInput); fileInput.click(); fileInput.addEventListener('change', async (e) => { const file = e.target.files[0]; if (!file) return; const imageId = await Utils.saveOriginalImage(file); if (!DataManager.beautifySettings.widgetBackgrounds) DataManager.beautifySettings.widgetBackgrounds = {}; DataManager.beautifySettings.widgetBackgrounds.aiStatus = imageId; DataManager.saveBeautifySettings(); UIManager.updateAIStatusBg(); Utils.showToast('背景更新成功', 1500); document.body.removeChild(fileInput); }); });
    const messageInput = document.getElementById('messageInput'); messageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); ChatHandler.sendOnlyMessage(); } });
    const recordBtn = document.getElementById('recordBtn'); recordBtn.addEventListener('click', () => { ChatHandler.handleSendWithAI(); });
    const callSendBtn = document.getElementById('callSendBtn'), callMessageInput = document.getElementById('callMessageInput');
    if (callSendBtn && callMessageInput) {
        callSendBtn.addEventListener('click', () => { const text = callMessageInput.value.trim(); if (text) { VoiceCallHandler.sendUserMessage(text); callMessageInput.value = ''; } else VoiceCallHandler.triggerAIReply(); });
        callMessageInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); const text = callMessageInput.value.trim(); if (text) { VoiceCallHandler.sendUserMessage(text); callMessageInput.value = ''; } else VoiceCallHandler.triggerAIReply(); } });
    }
    const callMicToggleBtn = document.getElementById('callMicToggleBtn'); if (callMicToggleBtn) callMicToggleBtn.addEventListener('click', () => { VoiceCallHandler.toggleInput(); });
    document.querySelectorAll('.tab-item').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const targetTab = tab.dataset.tab, userProfileArea = document.getElementById('userProfileArea');
            document.getElementById('chatsTab').style.display = 'none'; document.getElementById('friendsTab').style.display = 'none'; document.getElementById('dynamicTab').style.display = 'none';
            if (targetTab === 'chats') { document.getElementById('chatsTab').style.display = 'block'; if (userProfileArea) userProfileArea.style.display = 'flex'; }
            else if (targetTab === 'friends') { document.getElementById('friendsTab').style.display = 'block'; if (userProfileArea) userProfileArea.style.display = 'flex'; UIManager.renderFriendsList(); }
            else if (targetTab === 'dynamic') { document.getElementById('dynamicTab').style.display = 'flex'; if (userProfileArea) userProfileArea.style.display = 'none'; PostManager.renderMomentsList(); }
            document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active')); tab.classList.add('active');
        });
    });
    function updateTime() { const now = new Date(); document.getElementById('currentTime').textContent = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`; }
    updateTime(); setInterval(updateTime, 1000);
    const addWorldBookBtn = document.getElementById('addWorldBookBtn'); if (addWorldBookBtn) addWorldBookBtn.addEventListener('click', () => WorldBookHandler.openCreateModal());
    const importWorldBookBtn = document.getElementById('importWorldBookBtn'); if (importWorldBookBtn) importWorldBookBtn.addEventListener('click', () => WorldBookHandler.importFromFile());
    const closeWorldBookModal = document.getElementById('closeWorldBookModal'); if (closeWorldBookModal) closeWorldBookModal.addEventListener('click', () => WorldBookHandler.closeModal());
    const cancelWorldBook = document.getElementById('cancelWorldBook'); if (cancelWorldBook) cancelWorldBook.addEventListener('click', () => WorldBookHandler.closeModal());
    const worldBookModalOverlay = document.getElementById('worldBookModal'); if (worldBookModalOverlay) worldBookModalOverlay.addEventListener('click', (e) => { if (e.target === worldBookModalOverlay) WorldBookHandler.closeModal(); });
    const saveWorldBookBtn = document.getElementById('saveWorldBook'); if (saveWorldBookBtn) saveWorldBookBtn.addEventListener('click', () => WorldBookHandler.saveWorldBook());
    const openPostModalBtn = document.getElementById('openPostModalBtn'); if (openPostModalBtn) openPostModalBtn.addEventListener('click', () => PostManager.openPostModal());
    const closePostModal = document.getElementById('closePostModal'); if (closePostModal) closePostModal.addEventListener('click', () => PostManager.closePostModal());
    const cancelPost = document.getElementById('cancelPost'); if (cancelPost) cancelPost.addEventListener('click', () => PostManager.closePostModal());
    const postModalOverlay = document.getElementById('postModal'); if (postModalOverlay) postModalOverlay.addEventListener('click', (e) => { if (e.target === postModalOverlay) PostManager.closePostModal(); });
    const savePost = document.getElementById('savePost'); if (savePost) savePost.addEventListener('click', () => PostManager.publishPost());
    const selectPostImages = document.getElementById('selectPostImages'), postImages = document.getElementById('postImages');
    if (selectPostImages && postImages) { selectPostImages.addEventListener('click', () => postImages.click()); postImages.addEventListener('change', (e) => { if (e.target.files.length) { PostManager.handleImageUpload(Array.from(e.target.files)); e.target.value = ''; } }); }
    const closeIntimateRoleModal = document.getElementById('closeIntimateRoleModal'); if (closeIntimateRoleModal) closeIntimateRoleModal.addEventListener('click', () => document.getElementById('intimateRoleModal').classList.remove('active'));
    const cancelIntimateRole = document.getElementById('cancelIntimateRole'); if (cancelIntimateRole) cancelIntimateRole.addEventListener('click', () => document.getElementById('intimateRoleModal').classList.remove('active'));
    const saveIntimateLimit = document.getElementById('saveIntimateLimit'); if (saveIntimateLimit) saveIntimateLimit.addEventListener('click', () => IntimateHandler.saveLimit());
    const closeIntimateLimitModal = document.getElementById('closeIntimateLimitModal'); if (closeIntimateLimitModal) closeIntimateLimitModal.addEventListener('click', () => document.getElementById('intimateLimitModal').classList.remove('active'));
    const cancelIntimateLimit = document.getElementById('cancelIntimateLimit'); if (cancelIntimateLimit) cancelIntimateLimit.addEventListener('click', () => document.getElementById('intimateLimitModal').classList.remove('active'));
    const sendIntimateBtn = document.getElementById('sendIntimateBtn'); if (sendIntimateBtn) sendIntimateBtn.addEventListener('click', () => IntimateHandler.sendIntimate());
    const closeIntimateSendModal = document.getElementById('closeIntimateSendModal'); if (closeIntimateSendModal) closeIntimateSendModal.addEventListener('click', () => document.getElementById('intimateSendModal').classList.remove('active'));
    const cancelIntimateSend = document.getElementById('cancelIntimateSend'); if (cancelIntimateSend) cancelIntimateSend.addEventListener('click', () => document.getElementById('intimateSendModal').classList.remove('active'));
    const closeIntimateDetailModal = document.getElementById('closeIntimateDetailModal'); if (closeIntimateDetailModal) closeIntimateDetailModal.addEventListener('click', () => document.getElementById('intimateDetailModal').classList.remove('active'));
    const closeUnbindModal = document.getElementById('closeUnbindModal'); if (closeUnbindModal) closeUnbindModal.addEventListener('click', () => document.getElementById('unbindIntimateModal').classList.remove('active'));
    const cancelUnbindBtn = document.getElementById('cancelUnbindBtn'); if (cancelUnbindBtn) cancelUnbindBtn.addEventListener('click', () => document.getElementById('unbindIntimateModal').classList.remove('active'));
    const confirmUnbindBtn = document.getElementById('confirmUnbindBtn'); if (confirmUnbindBtn) confirmUnbindBtn.addEventListener('click', () => { const contact = DataManager.contacts.find(c => c.id === window.currentUnbindContactId); if (contact) { contact.intimateCard.enabled = false; DataManager.saveContacts(); if (document.getElementById('intimateCardListView').classList.contains('active')) WalletManager.renderIntimateCards(); Utils.showToast('已解绑亲属卡'); } document.getElementById('unbindIntimateModal').classList.remove('active'); });
    const unbindModal = document.getElementById('unbindIntimateModal'); if (unbindModal) unbindModal.addEventListener('click', (e) => { if (e.target === unbindModal) unbindModal.classList.remove('active'); });
    document.getElementById('aiStatusPrev').addEventListener('click', () => { if (DataManager.contacts.length) { DataManager.currentStatusIndex = (DataManager.currentStatusIndex - 1 + DataManager.contacts.length) % DataManager.contacts.length; UIManager.updateAIStatusWidget(); } });
    document.getElementById('aiStatusNext').addEventListener('click', () => { if (DataManager.contacts.length) { DataManager.currentStatusIndex = (DataManager.currentStatusIndex + 1) % DataManager.contacts.length; UIManager.updateAIStatusWidget(); } });
    document.getElementById('aiStatusAvatar').addEventListener('click', () => { const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none'; document.body.appendChild(fileInput); fileInput.click(); fileInput.addEventListener('change', async (e) => { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = async (event) => { const originalDataUrl = event.target.result; try { const compressed = await Utils.compressImage(originalDataUrl, 200, 0.8); const imageId = Utils.generateImageId('ai_avatar'); await Utils.saveImageToDB(imageId, compressed); const contact = DataManager.contacts[DataManager.currentStatusIndex]; if (contact) { contact.avatar = imageId; DataManager.saveContacts(); UIManager.updateAIStatusWidget(); if (DataManager.currentContactId === contact.id) ChatHandler.enterChatDetail(contact.id); Utils.showToast('头像更新成功', 1500); } } catch(err) { Utils.showToast('图片处理失败', 2000); } }; reader.readAsDataURL(file); }); });
    document.getElementById('exportBackupBtn').addEventListener('click', () => BackupHandler.exportBackup());
    document.getElementById('importBackupBtn').addEventListener('click', () => document.getElementById('importBackupFile').click());
    document.getElementById('importBackupFile').addEventListener('change', (e) => { if (e.target.files.length) BackupHandler.importBackup(e.target.files[0]); e.target.value = ''; });
    document.getElementById('clearAllDataBtn').addEventListener('click', () => BackupHandler.clearAllData());
    document.getElementById('callHangupBtn').addEventListener('click', () => VoiceCallHandler.hangup());
    document.getElementById('callSpeakerBtn').addEventListener('click', () => VoiceCallHandler.toggleMute());
    document.getElementById('backToWalletMain').addEventListener('click', () => { document.getElementById('intimateCardListView').classList.remove('active'); document.getElementById('userWalletView').classList.add('active'); WalletManager.renderWallet(); });

}

// ==================== 初始化入口 ====================
document.addEventListener('DOMContentLoaded', async function() {// ==================== 自动迁移旧数据（明文 → 加密） ====================
async function autoMigrateOldData() {
    // 检测旧版本数据的标记（如果已经有加密版本的数据，则不再迁移）
    const hasEncryptedConfig = localStorage.getItem('apiConfigs');
    if (hasEncryptedConfig) {
        // 尝试判断是否已经是加密格式（简单判断：包含 base64 特征）
        try {
            const test = JSON.parse(hasEncryptedConfig);
            if (test[0] && test[0].base_url && test[0].base_url.startsWith('data:')) {
                // 可能是旧明文，继续迁移；否则跳过
                if (!test[0].base_url.startsWith('data:') && !test[0].api_key?.startsWith('data:')) {
                    // 没有加密特征，继续迁移
                } else {
                    console.log('已加密，无需迁移');
                    return;
                }
            }
        } catch(e) {}
    }

    // 定义需要迁移的存储键
    const keys = ['apiConfigs', 'contacts', 'userProfile', 'beautifySettings', 'worldBooks', 'posts', 'wallet'];
    let hasOldData = false;

    // 检查是否存在任何旧数据
    for (let key of keys) {
        if (localStorage.getItem(key)) {
            hasOldData = true;
            break;
        }
    }
    if (!hasOldData) return;

    console.log('检测到旧版数据，开始自动迁移...');
    Utils.showToast('正在迁移旧数据，请稍候...', 0);

    // 迁移函数：读取旧明文，直接存入（后续保存时会自动加密）
    try {
        // 1. API 配置
        const oldConfigs = localStorage.getItem('apiConfigs');
        if (oldConfigs) {
            DataManager.apiConfigs = JSON.parse(oldConfigs);
            DataManager.saveConfigs(); // 会自动加密
            localStorage.removeItem('apiConfigs'); // 删除旧明文
        }

        // 2. 联系人
        const oldContacts = localStorage.getItem('contacts');
        if (oldContacts) {
            DataManager.contacts = JSON.parse(oldContacts);
            DataManager.saveContacts();
            localStorage.removeItem('contacts');
        }

        // 3. 用户资料
        const oldUserProfile = localStorage.getItem('userProfile');
        if (oldUserProfile) {
            DataManager.userProfile = JSON.parse(oldUserProfile);
            DataManager.saveUserProfile();
            localStorage.removeItem('userProfile');
        }

        // 4. 美化设置
        const oldBeautify = localStorage.getItem('beautifySettings');
        if (oldBeautify) {
            DataManager.beautifySettings = JSON.parse(oldBeautify);
            DataManager.saveBeautifySettings();
            localStorage.removeItem('beautifySettings');
        }

        // 5. 世界书
        const oldWorldBooks = localStorage.getItem('worldBooks');
        if (oldWorldBooks) {
            DataManager.worldBooks = JSON.parse(oldWorldBooks);
            DataManager.saveWorldBooks();
            localStorage.removeItem('worldBooks');
        }

        // 6. 朋友圈动态
        const oldPosts = localStorage.getItem('posts');
        if (oldPosts) {
            DataManager.posts = JSON.parse(oldPosts);
            DataManager.savePosts();
            localStorage.removeItem('posts');
        }

        // 7. 钱包
        const oldWallet = localStorage.getItem('wallet');
        if (oldWallet) {
            DataManager.wallet = JSON.parse(oldWallet);
            DataManager.saveWallet();
            localStorage.removeItem('wallet');
        }

        // 额外：清理可能残留的旧标记
        localStorage.removeItem('activeConfigId'); // 旧版存储的激活配置ID（已在saveConfigs中重新存储）
        
        console.log('旧数据迁移完成！');
        Utils.showToast('旧数据迁移成功', 2000);
        
        // 刷新页面以应用新数据（可选）
        // setTimeout(() => location.reload(), 1500);
    } catch (err) {
        console.error('迁移失败：', err);
        Utils.showToast('自动迁移失败，请尝试手动导出备份再导入', 3000);
    }
}
    DataManager.loadConfigs();
    DataManager.loadContacts();
    DataManager.loadUserProfile();
    DataManager.loadBeautifySettings();
    DataManager.loadWorldBooks();
    DataManager.loadPosts();
    DataManager.loadWallet();

    await UIManager.updateUserProfileDisplay();
    UIManager.renderContactList();
    UIManager.renderFriendsList();
    UIManager.renderIconGrid();
    UIManager.applyAllAppIcons();
    document.getElementById('wallpaperPreview').textContent = DataManager.beautifySettings.wallpaper ? '当前壁纸：自定义' : '当前壁纸：默认';
    document.getElementById('callBackgroundPreview').textContent = DataManager.beautifySettings.callBackground ? '当前背景：自定义' : '当前背景：默认';
    await Utils.setBackgroundImage(document.querySelector('.desktop'), DataManager.beautifySettings.wallpaper, 'https://img.heliar.top/file/1773847367891_1773847331104.png');

    await UIManager.updateWeatherWidgetBg();
    await UIManager.updateCalendarWidgetBg();
    await UIManager.updateAIStatusBg();

    (function setupProfileAvatar() {
        const avatarDiv = document.getElementById('profileAvatar');
        const fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none'; document.body.appendChild(fileInput);
        avatarDiv.addEventListener('click', () => { fileInput.click(); });
        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = async (event) => {
                Utils.showToast('正在处理头像...', 0);
                const originalDataUrl = event.target.result;
                try {
                    const compressed = await Utils.compressImage(originalDataUrl, 200, 0.8);
                    const imageId = Utils.generateImageId('user_avatar');
                    await Utils.saveImageToDB(imageId, compressed);
                    DataManager.userProfile.avatar = imageId;
                    DataManager.saveUserProfile();
                    await UIManager.updateUserProfileDisplay();
                    Utils.showToast('头像更新成功', 1500);
                } catch(err) { Utils.showToast('图片处理失败', 2000); }
            };
            reader.readAsDataURL(file);
        });
    })();

    createUnbindModal();

    bindEvents();
    WalletManager.init();
    startAutoPostTimer();

    WidgetManager.init();
    loadIconOrder();
    initDragAndDrop();
    initLongPressEffect();
    if (DataManager.contacts.length > 0) {
        DataManager.currentStatusIndex = 0;
        UIManager.updateAIStatusWidget();
    }

    const scroll = document.getElementById('desktopScroll');
    const indicators = document.querySelectorAll('.indicator');
    if (scroll) {
        const updateIndicators = () => {
            const pageWidth = scroll.clientWidth;
            const scrollLeft = scroll.scrollLeft;
            const activeIndex = Math.round(scrollLeft / pageWidth);
            indicators.forEach((ind, i) => { if (i === activeIndex) ind.classList.add('active'); else ind.classList.remove('active'); });
        };
        scroll.addEventListener('scroll', updateIndicators);
        updateIndicators();
    }
DrawingBoard.init();
    console.log("应用初始化完成");
});
