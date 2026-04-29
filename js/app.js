// =================================================================
// --- Main App Initialization ---
// =================================================================
(function (App) {

    document.addEventListener('DOMContentLoaded', async () => {
        await db.open();

        // Initialize shared state DOM references
        App.state.pagesContainer = document.querySelector('.pages-container');
        App.state.dock = document.querySelector('.dock');
        App.state.imageUploader = document.getElementById('image-uploader');

        // --- Swipe / Pages ---
        const pagesContainer = App.state.pagesContainer;
        let startX;
        let currentPage = 0;

        pagesContainer.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; });
        pagesContainer.addEventListener('touchend', (e) => { handleSwipe(e.changedTouches[0].clientX); });
        pagesContainer.addEventListener('mousedown', (e) => { startX = e.clientX; pagesContainer.style.cursor = 'grabbing'; });
        pagesContainer.addEventListener('mouseup', (e) => { handleSwipe(e.clientX); pagesContainer.style.cursor = 'grab'; });
        pagesContainer.addEventListener('mouseleave', () => { pagesContainer.style.cursor = 'grab'; });

        function handleSwipe(endX) {
            if (startX > endX + 50) { if (currentPage === 0) { pagesContainer.style.transform = 'translateX(-50%)'; currentPage = 1; } }
            else if (startX < endX - 50) { if (currentPage === 1) { pagesContainer.style.transform = 'translateX(0%)'; currentPage = 0; } }
        }

        // --- Image Uploader Handler ---
        const imageUploader = App.state.imageUploader;
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
                        App.loadUserProfile();
                    });
                    imageUploader.dataset.changingIconId = '';
                    App.state.currentImageTarget = null;
                    App.state.currentWidget = null;
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
                    App.setBackground(App.state.currentWidget, imageUrl);
                }
                imageUploader.dataset.changingIconId = '';
                App.state.currentImageTarget = null;
                App.state.currentWidget = null;
            };
            reader.readAsDataURL(e.target.files[0]);
            e.target.value = '';
        });

        // --- Reset buttons ---
        const resetWeatherAvatarBtn = document.getElementById('reset-weather-avatar-btn');
        if (resetWeatherAvatarBtn) resetWeatherAvatarBtn.addEventListener('click', () => { const img = document.getElementById('page1-weather-avatar'); if (img) { img.src = 'https://placehold.co/50x50/f0f0f0/ccc?text=Icon'; db.del('element_page1-weather-avatar'); } });
        const resetLoveAvatarBtn = document.getElementById('reset-love-avatar-btn');
        if (resetLoveAvatarBtn) resetLoveAvatarBtn.addEventListener('click', () => { const img = document.getElementById('page1-love-avatar'); if (img) { img.src = 'https://placehold.co/80x80/f0f0f0/ccc?text=X'; db.del('element_page1-love-avatar'); } });

        // --- Chat user avatar -> profile page ---
        const chatUserAvatar = document.getElementById('chat-user-avatar');
        const userProfilePage = document.getElementById('user-profile-page');
        const chatPage = document.getElementById('chat-page');
        const backToChatFromProfileButton = document.getElementById('back-to-chat-from-profile');
        if (chatUserAvatar && userProfilePage && backToChatFromProfileButton) {
            chatUserAvatar.addEventListener('click', () => { App.loadUserProfile(); chatPage.style.display = 'none'; userProfilePage.style.display = 'block'; });
            backToChatFromProfileButton.addEventListener('click', () => { userProfilePage.style.display = 'none'; chatPage.style.display = 'block'; App.loadUserProfile(); });
        }

        // --- Initialize all modules ---
        App.initClock();
        App.initBeautify();
        App.initChat();
        App.initSettings();
        App.initProfile();
        App.initSocial();
        App.initPersona();
        App.initDiary();
        App.initFriendRequest();
        App.initConversation();

        // --- Initial Load ---
        await App.loadAllElementStates();
        await App.loadApiSettings();
        await App.updateFriendRequestsBadge();
    });

})(window.App);
