// =================================================================
// --- Friend Request Page ---
// =================================================================
(function (App) {

    App.storeFriendRequest = async function (req) {
        const list = await db.get('friendRequests') || [];
        list.push(req);
        await db.set('friendRequests', list);
    };

    App.updateFriendRequestsBadge = async function () {
        const list = await db.get('friendRequests') || [];
        const badge = document.getElementById('friend-req-badge');
        if (badge) { badge.textContent = list.length; badge.style.display = list.length > 0 ? '' : 'none'; }
    };

    App.initFriendRequest = function () {
        const friendReqPage = document.getElementById('friend-request-page');
        const friendReqList = document.getElementById('friend-request-list');
        const pagesContainer = App.state.pagesContainer;
        const dock = App.state.dock;

        const friendReqAppIcon = document.getElementById('friend-request-app');
        if (friendReqAppIcon) friendReqAppIcon.addEventListener('click', async (e) => {
            e.stopPropagation();
            pagesContainer.style.display = 'none'; dock.style.display = 'none';
            if (friendReqPage) friendReqPage.style.display = 'block';
            await renderFriendRequests();
        });
        const backFromFriendReqBtn = document.getElementById('back-from-friend-request');
        if (backFromFriendReqBtn) backFromFriendReqBtn.addEventListener('click', () => {
            if (friendReqPage) friendReqPage.style.display = 'none';
            pagesContainer.style.display = 'flex'; dock.style.display = 'flex';
        });

        async function renderFriendRequests() {
            const list = await db.get('friendRequests') || [];
            if (!friendReqList) return;
            if (list.length === 0) {
                friendReqList.innerHTML = '<div class="persona-empty-state"><i class="fa-solid fa-envelope-open"></i><p>暂无好友申请</p></div>';
                return;
            }
            friendReqList.innerHTML = '';
            list.forEach((req, idx) => {
                const item = document.createElement('div');
                item.className = 'friend-req-item';
                const avatarHtml = req.avatar ? '<img src="' + req.avatar + '" alt="">' : App.getPersonaLetterAvatar(req.name);
                item.innerHTML = '<div class="friend-req-avatar">' + avatarHtml + '</div><div class="friend-req-info"><p class="friend-req-name">' + (req.name || '未知') + '</p><p class="friend-req-msg">' + (req.message || '') + '</p></div><div class="friend-req-actions"><button class="friend-req-accept" data-idx="' + idx + '">通过</button><button class="friend-req-reject" data-idx="' + idx + '">拒绝</button></div>';
                friendReqList.appendChild(item);
            });
            friendReqList.querySelectorAll('.friend-req-accept').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const i = parseInt(btn.dataset.idx);
                    const reqs = await db.get('friendRequests') || [];
                    const req = reqs[i];
                    if (req) {
                        const personas = await App.getPersonas();
                        const p = personas.find(pp => pp.id === req.personaId);
                        if (p) { p.accepted = true; await App.savePersonas(personas); }
                    }
                    reqs.splice(i, 1);
                    await db.set('friendRequests', reqs);
                    await App.updateFriendRequestsBadge();
                    await renderFriendRequests();
                    alert('已通过好友申请！');
                });
            });
            friendReqList.querySelectorAll('.friend-req-reject').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const i = parseInt(btn.dataset.idx);
                    const reqs = await db.get('friendRequests') || [];
                    reqs.splice(i, 1);
                    await db.set('friendRequests', reqs);
                    await App.updateFriendRequestsBadge();
                    await renderFriendRequests();
                });
            });
        }
    };

})(window.App);
