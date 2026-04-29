// =================================================================
// --- User Profile ---
// =================================================================
(function (App) {

    App.initProfile = function () {
        const editProfileButton = document.getElementById('edit-profile-button');
        const editProfilePage = document.getElementById('edit-profile-page');
        const userProfilePage = document.getElementById('user-profile-page');
        const backToProfileFromEditButton = document.getElementById('back-to-profile-from-edit');
        const saveProfileButton = document.getElementById('save-profile-button');
        const profileAvatarContainer = document.querySelector('#user-profile-page .profile-avatar');

        const editRealName = document.getElementById('edit-real-name');
        const editNickname = document.getElementById('edit-nickname');
        const editStatus = document.getElementById('edit-status');
        const editLineId = document.getElementById('edit-line-id');
        const editAddress = document.getElementById('edit-address');
        const editBio = document.getElementById('edit-bio');

        if (editProfileButton) editProfileButton.addEventListener('click', () => { userProfilePage.style.display = 'none'; editProfilePage.style.display = 'block'; });
        if (backToProfileFromEditButton) backToProfileFromEditButton.addEventListener('click', () => { editProfilePage.style.display = 'none'; userProfilePage.style.display = 'block'; });
        if (saveProfileButton) {
            saveProfileButton.addEventListener('click', async () => {
                const current = await db.get('userProfile') || {};
                await App.saveUserProfile({ ...current, realName: editRealName.value, nickname: editNickname.value, status: editStatus.value, lineId: editLineId.value, address: editAddress.value, bio: editBio.value });
                await App.loadUserProfile(); alert('个人资料已保存！'); editProfilePage.style.display = 'none'; userProfilePage.style.display = 'block';
            });
        }
        if (profileAvatarContainer) profileAvatarContainer.addEventListener('click', () => { App.state.isUploadingProfileAvatar = true; App.state.currentImageTarget = null; App.state.currentWidget = null; App.state.imageUploader.click(); });
    };

    App.loadUserProfile = async function () {
        const profile = await db.get('userProfile') || {};
        App.state.cachedUserProfile = profile;

        const profileNameDisplay = document.querySelector('#user-profile-page .profile-name');
        const profileStatusDisplay = document.querySelector('#user-profile-page .profile-status-placeholder');
        const profileAvatarImg = document.querySelector('#user-profile-page .profile-avatar img');
        const chatAvatarImg = document.querySelector('#chat-user-avatar img');

        if (profileNameDisplay) profileNameDisplay.textContent = profile.nickname || 'れい';
        if (profileStatusDisplay) profileStatusDisplay.textContent = profile.status || '请输入一条状态消息。';
        const chatUsernameDisplay = document.getElementById('chat-username-display');
        const chatStatusDisplay = document.getElementById('chat-status-display');
        if (chatUsernameDisplay) chatUsernameDisplay.textContent = profile.nickname || '理理';
        if (chatStatusDisplay) chatStatusDisplay.textContent = profile.status || '输入状态消息';
        if (profile.avatar && (profile.avatar.startsWith('data:') || profile.avatar.startsWith('http'))) {
            App.state.userAvatarCache = profile.avatar;
            if (profileAvatarImg) profileAvatarImg.src = profile.avatar;
            if (chatAvatarImg) chatAvatarImg.src = profile.avatar;
        }

        const editRealName = document.getElementById('edit-real-name');
        const editNickname = document.getElementById('edit-nickname');
        const editStatus = document.getElementById('edit-status');
        const editLineId = document.getElementById('edit-line-id');
        const editAddress = document.getElementById('edit-address');
        const editBio = document.getElementById('edit-bio');

        if (editRealName) editRealName.value = profile.realName || '';
        if (editNickname) editNickname.value = profile.nickname || '';
        if (editStatus) editStatus.value = profile.status || '';
        if (editLineId) editLineId.value = profile.lineId || '';
        if (editAddress) editAddress.value = profile.address || '';
        if (editBio) editBio.value = profile.bio || '';
        document.querySelectorAll('.conv-msg-avatar-user').forEach(el => { el.innerHTML = App.getUserBubbleAvatarHtml(); });
    };

})(window.App);
