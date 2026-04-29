// =================================================================
// --- Chat App (聊天列表 & 好友列表) ---
// =================================================================
(function (App) {

    App.initChat = function () {
        const chatAppIcon = document.getElementById('chat-app');
        const chatPage = document.getElementById('chat-page');
        const backToHomeFromChatButton = document.getElementById('back-to-home-from-chat');
        const pagesContainer = App.state.pagesContainer;
        const dock = App.state.dock;

        const chatTabContent = document.getElementById('chat-tab-content');
        const friendsTabContent = document.getElementById('friends-tab-content');
        const navTabChat = document.getElementById('nav-tab-chat');
        const navTabFriends = document.getElementById('nav-tab-friends');
        const navTabMoments = document.getElementById('nav-tab-moments');

        chatAppIcon.addEventListener('click', (e) => { e.stopPropagation(); pagesContainer.style.display = 'none'; dock.style.display = 'none'; chatPage.style.display = 'block'; App.loadUserProfile(); App.switchChatTab('chat'); });
        if (backToHomeFromChatButton) backToHomeFromChatButton.addEventListener('click', () => { chatPage.style.display = 'none'; pagesContainer.style.display = 'flex'; dock.style.display = 'flex'; });

        if (navTabChat) navTabChat.addEventListener('click', () => App.switchChatTab('chat'));
        if (navTabFriends) navTabFriends.addEventListener('click', () => App.switchChatTab('friends'));
        if (navTabMoments) navTabMoments.addEventListener('click', () => App.switchChatTab('moments'));

        const friendsSearchInput = document.getElementById('friends-search-input');
        if (friendsSearchInput) friendsSearchInput.addEventListener('input', () => App.renderAIFriendsList(friendsSearchInput.value));

        // User avatar -> profile
        const chatUserAvatar = document.getElementById('chat-user-avatar');
        const userProfilePage = document.getElementById('user-profile-page');
        const backToChatFromProfileButton = document.getElementById('back-to-chat-from-profile');
        if (chatUserAvatar && userProfilePage && backToChatFromProfileButton) {
            chatUserAvatar.addEventListener('click', () => { App.loadUserProfile(); chatPage.style.display = 'none'; userProfilePage.style.display = 'block'; });
            backToChatFromProfileButton.addEventListener('click', () => { userProfilePage.style.display = 'none'; chatPage.style.display = 'block'; App.loadUserProfile(); });
        }
    };

    App.switchChatTab = function (tab) {
        const chatTabContent = document.getElementById('chat-tab-content');
        const friendsTabContent = document.getElementById('friends-tab-content');
        const navTabChat = document.getElementById('nav-tab-chat');
        const navTabFriends = document.getElementById('nav-tab-friends');
        const navTabMoments = document.getElementById('nav-tab-moments');

        chatTabContent.style.display = 'none'; friendsTabContent.style.display = 'none';
        navTabChat.classList.remove('active'); navTabFriends.classList.remove('active'); navTabMoments.classList.remove('active');
        if (tab === 'chat') { chatTabContent.style.display = 'block'; navTabChat.classList.add('active'); App.renderChatList(); }
        else if (tab === 'friends') { friendsTabContent.style.display = 'flex'; navTabFriends.classList.add('active'); App.renderAIFriendsList(); }
        else if (tab === 'moments') { navTabMoments.classList.add('active'); }
    };

    App.renderChatList = async function () {
        const listEl = document.getElementById('chat-conversations-list');
        if (!listEl) return;
        const personas = await App.getPersonas();
        const accepted = personas.filter(p => p.accepted);
        if (accepted.length === 0) { listEl.innerHTML = '<div class="chat-conv-empty">暂无聊天<br>添加好友后即可开始对话</div>'; return; }
        listEl.innerHTML = '';
        for (const p of accepted) {
            const item = document.createElement('div');
            item.className = 'chat-conv-item';
            const avatarHtml = p.avatar ? '<img src="' + p.avatar + '" alt="' + (p.name || '') + '">' : (function () {
                const l = (p.name || '?').charAt(0).toUpperCase(), colors = ['#5b8dee', '#ee6b5b', '#5bee9e', '#ee9d5b', '#a05bee', '#5bbcee', '#ee5ba0'];
                return '<div style="width:100%;height:100%;border-radius:50%;background:' + colors[l.charCodeAt(0) % colors.length] + ';display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:bold;color:#fff;">' + l + '</div>';
            })();
            const displayName = p.remark ? p.remark + ' (' + p.name + ')' : (p.name || '未命名');
            const convMsgs = await App.getConversationMessages(p.id);
            let preview = p.signature || p.info || '点击开始对话';
            if (convMsgs.length > 0) { const last = convMsgs[convMsgs.length - 1]; preview = (last.role === 'user' ? '我: ' : '') + last.text; }
            item.innerHTML = '<div class="chat-conv-avatar">' + avatarHtml + '</div><div class="chat-conv-info"><p class="chat-conv-name">' + displayName + '</p><p class="chat-conv-preview">' + preview + '</p></div>';
            item.addEventListener('click', () => App.openConversationPage(p));
            listEl.appendChild(item);
        }
    };

    App.renderAIFriendsList = async function (filter) {
        const listEl = document.getElementById('ai-friends-list');
        if (!listEl) return;
        const personas = await App.getPersonas();
        const query = (filter || '').trim().toLowerCase();
        const filtered = query ? personas.filter(p => (p.name || '').toLowerCase().includes(query) || (p.uid || '').toLowerCase().includes(query) || (p.remark || '').toLowerCase().includes(query)) : personas;
        if (filtered.length === 0) { listEl.innerHTML = '<div class="ai-friends-empty"><i class="fa-solid fa-robot"></i><p>' + (query ? '未找到匹配的好友' : '暂无好友\n请先在人设档案中创建角色') + '</p></div>'; return; }
        listEl.innerHTML = '';
        filtered.forEach(p => {
            const item = document.createElement('div');
            item.className = 'ai-friend-item-row';
            const displayName = p.remark ? (p.name + ' <span class="friend-remark">(' + p.remark + ')</span>') : p.name;
            item.innerHTML = '<div class="ai-friend-avatar">' + App.getAvatarHtmlForFriend(p) + '</div><div class="ai-friend-info"><p class="ai-friend-name">' + (displayName || '未命名') + '</p><p class="ai-friend-sig">' + (p.signature || p.info || '暂无简介') + '</p></div><i class="fa-solid fa-chevron-right" style="color:#ddd;font-size:14px;flex-shrink:0;"></i>';
            item.addEventListener('click', () => App.openConversationPage(p));
            listEl.appendChild(item);
        });
    };

})(window.App);
