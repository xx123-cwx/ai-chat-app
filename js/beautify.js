// =================================================================
// --- Widgets / Beautify ---
// =================================================================
(function (App) {

    App.initBeautify = function () {
        const widgets = document.querySelectorAll('.widget');
        const imageUploader = document.getElementById('image-uploader');
        const beautifyAppIcon = document.getElementById('beautify-app');
        const beautifyPage = document.getElementById('beautify-page');
        const backToHomeButton = document.getElementById('back-to-home');
        const dock = App.state.dock;
        const pagesContainer = App.state.pagesContainer;

        App.state.imageUploader = imageUploader;

        widgets.forEach(widget => {
            widget.addEventListener('click', (e) => {
                if (widget.classList.contains('clock-widget') || widget.classList.contains('calendar-widget')) return;
                if (e.target.closest('.app-icon') || e.target.closest('.app-icon-group')) return;
                e.stopPropagation();
                App.state.currentWidget = widget;
                if (confirm('要更换背景图片吗？\n点击 "确定" 从本地上传，点击 "取消" 使用URL链接。')) {
                    imageUploader.click();
                } else {
                    const url = prompt('请输入图片链接:', '');
                    if (url) setBackground(widget, url);
                }
            });
            widget.addEventListener('touchstart', (e) => {
                if (widget.classList.contains('clock-widget') || widget.classList.contains('calendar-widget')) return;
                if (e.target.closest('.app-icon') || e.target.closest('.app-icon-group')) return;
                App.state.pressTimer = window.setTimeout(() => makeEditable(widget), 1000);
            });
            widget.addEventListener('touchend', () => clearTimeout(App.state.pressTimer));
            widget.addEventListener('mousedown', (e) => {
                if (widget.classList.contains('clock-widget') || widget.classList.contains('calendar-widget')) return;
                if (e.target.closest('.app-icon') || e.target.closest('.app-icon-group')) return;
                App.state.pressTimer = window.setTimeout(() => makeEditable(widget), 1000);
            });
            widget.addEventListener('mouseup', () => clearTimeout(App.state.pressTimer));
            widget.addEventListener('mouseleave', () => clearTimeout(App.state.pressTimer));
        });

        imageUploader.addEventListener('change', (e) => {
            if (!e.target.files || !e.target.files[0]) return;
            const reader = new FileReader();
            reader.onload = function (event) {
                const imageUrl = event.target.result;
                if (App.state.isUploadingProfileAvatar) {
                    App.state.isUploadingProfileAvatar = false;
                    App.compressAvatarImage(imageUrl, function (compressed) {
                        const profileAvatarImg = document.querySelector('#user-profile-page .profile-avatar img');
                        const chatAvatarImg = document.querySelector('#chat-user-avatar img');
                        if (profileAvatarImg) profileAvatarImg.src = compressed;
                        if (chatAvatarImg) chatAvatarImg.src = compressed;
                        App.state.userAvatarCache = compressed;
                        const profile = Object.assign({}, App.state.cachedUserProfile || {});
                        profile.avatar = compressed;
                        App.saveUserProfile(profile);
                        if (App.loadUserProfile) App.loadUserProfile();
                    });
                    imageUploader.dataset.changingIconId = '';
                    App.state.currentImageTarget = null; App.state.currentWidget = null;
                    return;
                } else if (App.state.currentImageTarget) {
                    App.state.currentImageTarget.src = imageUrl;
                    if (App.state.currentImageTarget.id) App.saveElementState(App.state.currentImageTarget.id, { type: 'icon', value: imageUrl });
                    const iconHolder = App.state.currentImageTarget.closest('[data-icon-id]');
                    if (iconHolder) {
                        const iconId = iconHolder.dataset.iconId;
                        const bImg = document.querySelector('.app-icon-edit-item[data-icon-id="' + iconId + '"] img');
                        if (bImg) bImg.src = imageUrl;
                        App.saveElementState(iconId, { type: 'icon', value: imageUrl });
                    } else if (imageUploader.dataset.changingIconId) {
                        const bid = imageUploader.dataset.changingIconId;
                        App.saveElementState(bid, { type: 'icon', value: imageUrl });
                        const bImg = document.querySelector('.app-icon-edit-item[data-icon-id="' + bid + '"] img');
                        if (bImg) bImg.src = imageUrl;
                    }
                } else if (App.state.currentWidget) {
                    setBackground(App.state.currentWidget, imageUrl);
                }
                imageUploader.dataset.changingIconId = '';
                App.state.currentImageTarget = null; App.state.currentWidget = null;
            };
            reader.readAsDataURL(e.target.files[0]);
            e.target.value = '';
        });

        beautifyAppIcon.addEventListener('click', async (e) => {
            e.stopPropagation();
            pagesContainer.style.display = 'none';
            dock.style.display = 'none';
            const container = document.getElementById('app-icon-list-container');
            container.innerHTML = '';
            document.querySelectorAll('.app-icon, .dock-icon').forEach((app, index) => {
                const appName = app.querySelector('span') ? app.querySelector('span').textContent : ('Dock Icon ' + index);
                const iconId = app.dataset.iconId;
                const appItem = document.createElement('div');
                appItem.className = 'app-icon-edit-item';
                appItem.dataset.iconId = iconId;
                const appImg = document.createElement('img');
                appImg.src = app.querySelector('img').src;
                const appLabel = document.createElement('span');
                appLabel.textContent = appName;
                const appInfo = document.createElement('div');
                appInfo.className = 'app-info';
                appInfo.appendChild(appImg); appInfo.appendChild(appLabel);
                const uploadBtn = document.createElement('button');
                uploadBtn.textContent = '上传'; uploadBtn.className = 'beautify-button small-button';
                uploadBtn.onclick = () => { App.state.isUploadingProfileAvatar = false; App.state.currentImageTarget = app.querySelector('img'); imageUploader.dataset.changingIconId = app.dataset.iconId; imageUploader.click(); };
                const clearBtn = document.createElement('button');
                clearBtn.textContent = '清除'; clearBtn.className = 'beautify-button small-button danger-button';
                clearBtn.onclick = () => {
                    const newSrc = 'https://placehold.co/50x50/f0f0f0/ccc?text=' + (appName.charAt(0) || 'D');
                    app.querySelector('img').src = newSrc; appImg.src = newSrc;
                    if (iconId) db.del('element_' + iconId);
                };
                const appActions = document.createElement('div');
                appActions.className = 'app-actions';
                appActions.appendChild(uploadBtn); appActions.appendChild(clearBtn);
                appItem.appendChild(appInfo); appItem.appendChild(appActions);
                container.appendChild(appItem);
            });
            beautifyPage.style.display = 'block';
        });

        backToHomeButton.addEventListener('click', () => { beautifyPage.style.display = 'none'; pagesContainer.style.display = 'flex'; dock.style.display = 'flex'; });

        const beautifyButtons = document.querySelectorAll('.beautify-button');
        const beautifyInputs = document.querySelectorAll('.beautify-input');

        beautifyButtons.forEach(button => {
            button.addEventListener('click', () => {
                const targetId = button.dataset.target;
                if (targetId) { App.state.isUploadingProfileAvatar = false; App.state.currentWidget = null; App.state.currentImageTarget = document.getElementById(targetId); imageUploader.click(); }
            });
        });
        beautifyInputs.forEach(input => {
            const targetId = input.dataset.target;
            const targetEl = document.getElementById(targetId);
            if (targetEl) {
                input.value = targetEl.textContent;
                App.getElementState(targetId).then(s => { if (s && s.type === 'text') { targetEl.textContent = s.value; input.value = s.value; } });
            }
            input.addEventListener('input', () => {
                const el = document.getElementById(targetId);
                if (el) { el.textContent = input.value; App.saveElementState(targetId, { type: 'text', value: input.value }); }
            });
        });

        const resetWeatherAvatarBtn = document.getElementById('reset-weather-avatar-btn');
        if (resetWeatherAvatarBtn) resetWeatherAvatarBtn.addEventListener('click', () => { const img = document.getElementById('page1-weather-avatar'); if (img) { img.src = 'https://placehold.co/50x50/f0f0f0/ccc?text=Icon'; db.del('element_page1-weather-avatar'); } });
        const resetLoveAvatarBtn = document.getElementById('reset-love-avatar-btn');
        if (resetLoveAvatarBtn) resetLoveAvatarBtn.addEventListener('click', () => { const img = document.getElementById('page1-love-avatar'); if (img) { img.src = 'https://placehold.co/80x80/f0f0f0/ccc?text=X'; db.del('element_page1-love-avatar'); } });
    };

    function setBackground(element, url) {
        element.style.backgroundImage = 'url(\'' + url + '\')';
        element.style.backgroundSize = 'cover';
        element.style.backgroundPosition = 'center';
        element.querySelectorAll('span, small, p').forEach(el => { el.style.color = '#fff'; el.style.textShadow = '0 0 5px rgba(0,0,0,0.7)'; });
        if (element.id) App.saveElementState(element.id, { type: 'background', value: url });
    }

    function makeEditable(widget) {
        widget.querySelectorAll('span, small, p').forEach(el => {
            if (!el.id) return;
            el.setAttribute('contenteditable', 'true');
            el.focus();
            el.addEventListener('blur', () => { el.setAttribute('contenteditable', 'false'); App.saveElementState(el.id, { type: 'text', value: el.textContent }); }, { once: true });
        });
    }

    App.setBackground = setBackground;

    App.loadAllElementStates = async function () {
        await App.loadUserProfile();
        const allKeys = await db.getAllKeys('keyval');
        for (const key of allKeys.filter(k => String(k).startsWith('element_'))) {
            const id = String(key).replace('element_', '');
            const state = await db.get(key);
            if (!state) continue;
            const element = document.getElementById(id) || document.querySelector('[data-icon-id="' + id + '"]');
            if (!element) continue;
            if (state.type === 'text') element.textContent = state.value;
            else if (state.type === 'background') setBackground(element, state.value);
            else if (state.type === 'icon') { const img = element.tagName === 'IMG' ? element : element.querySelector('img'); if (img) img.src = state.value; }
        }
    };

})(window.App);
