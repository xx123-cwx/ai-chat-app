// =================================================================
// --- Social Modal ---
// =================================================================
(function (App) {

    App.initSocial = function () {
        const socialModalOverlay = document.getElementById('social-modal-overlay');
        const socialModalMain = document.getElementById('social-modal-main');
        const socialModalAddFriend = document.getElementById('social-modal-add-friend');
        const socialModalCreateGroup = document.getElementById('social-modal-create-group');
        const openSocialModalBtn = document.getElementById('open-social-modal-btn');

        function showSocialModal(panel) {
            socialModalMain.style.display = panel === 'main' ? '' : 'none';
            socialModalAddFriend.style.display = panel === 'add-friend' ? '' : 'none';
            socialModalCreateGroup.style.display = panel === 'create-group' ? '' : 'none';
            socialModalOverlay.classList.add('active');
        }
        function hideSocialModal() { socialModalOverlay.classList.remove('active'); }

        if (openSocialModalBtn) openSocialModalBtn.addEventListener('click', () => showSocialModal('main'));
        if (socialModalOverlay) socialModalOverlay.addEventListener('click', (e) => { if (e.target === socialModalOverlay) hideSocialModal(); });

        const el_closeSocial = document.getElementById('close-social-modal');
        const el_gotoAddFriend = document.getElementById('goto-add-friend');
        const el_gotoCreateGroup = document.getElementById('goto-create-group');
        const el_backFromAddFriend = document.getElementById('back-from-add-friend');
        const el_backFromCreateGroup = document.getElementById('back-from-create-group');
        if (el_closeSocial) el_closeSocial.addEventListener('click', hideSocialModal);
        if (el_gotoAddFriend) el_gotoAddFriend.addEventListener('click', () => { showSocialModal('add-friend'); document.getElementById('friend-id-input').value = ''; document.getElementById('friend-note-input').value = ''; document.getElementById('friend-request-input').value = ''; });
        if (el_gotoCreateGroup) el_gotoCreateGroup.addEventListener('click', () => { showSocialModal('create-group'); document.getElementById('group-name-input').value = ''; document.getElementById('group-members-input').value = ''; });
        if (el_backFromAddFriend) el_backFromAddFriend.addEventListener('click', () => showSocialModal('main'));
        if (el_backFromCreateGroup) el_backFromCreateGroup.addEventListener('click', () => showSocialModal('main'));

        const confirmAddFriendBtn = document.getElementById('confirm-add-friend');
        if (confirmAddFriendBtn) {
            confirmAddFriendBtn.addEventListener('click', async () => {
                const inputUid = document.getElementById('friend-id-input').value.trim();
                const noteValue = document.getElementById('friend-note-input').value.trim();
                const requestContent = document.getElementById('friend-request-input').value.trim();
                if (!inputUid) { alert('请输入好友 UID！'); return; }
                const personas = await App.getPersonas();
                const matched = personas.find(p => p.uid && p.uid.toLowerCase() === inputUid.toLowerCase());
                if (!matched) { alert('未找到 UID 为「' + inputUid + '」的角色，请检查 UID 是否正确。'); return; }
                const apiSettings = App.state.cachedApiSettings;
                if (!apiSettings || !apiSettings.apiUrl || !apiSettings.apiKey || !apiSettings.selectedModel || apiSettings.selectedModel === '请先拉取模型列表') { alert('请先在「设置」中配置 API 并选择模型！'); return; }
                const userProfile = App.state.cachedUserProfile || {};
                const parts = [];
                if (matched.signature) parts.push('个性签名：' + matched.signature);
                if (matched.nationality) parts.push('国籍：' + matched.nationality);
                if (matched.hobbies) parts.push('爱好：' + matched.hobbies);
                if (matched.catchphrase) parts.push('口头禅：' + matched.catchphrase);
                if (matched.info) parts.push('人设详情：' + matched.info);
                const prompt = '你现在扮演角色「' + matched.name + '」，请完全以该角色的性格、价值观和人设来判断是否接受以下好友申请。\n\n【角色信息】\n' + (parts.join('\n') || '（无详细信息）') + '\n\n【申请者信息】\n' + ([userProfile.nickname ? '昵称：' + userProfile.nickname : '', userProfile.bio ? '自我介绍：' + userProfile.bio : ''].filter(Boolean).join('\n') || '（无申请者信息）') + '\n\n【申请内容】\n' + (requestContent || '（申请者未填写申请内容）') + '\n\n请以角色口吻简短回复，表达你对这次好友申请的态度和理由（50-100字）。最后一行必须单独写【同意】或【拒绝】。';
                confirmAddFriendBtn.innerHTML = '<span class="btn-spinner"></span>'; confirmAddFriendBtn.disabled = true;
                try {
                    const resp = await fetch(apiSettings.apiUrl.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiSettings.apiKey }, body: JSON.stringify({ model: apiSettings.selectedModel, messages: [{ role: 'user', content: prompt }], temperature: parseFloat(apiSettings.temperature) || 0.7 }) });
                    if (!resp.ok) throw new Error('状态码：' + resp.status);
                    const json = await resp.json();
                    const aiReply = (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '';
                    if (aiReply.includes('【同意】')) {
                        const all = await App.getPersonas(), idx = all.findIndex(p => p.id === matched.id);
                        if (idx !== -1) { if (noteValue) all[idx].remark = noteValue; all[idx].accepted = true; await App.savePersonas(all); }
                        alert('「' + matched.name + '」的回复：\n\n' + aiReply + '\n\n✅ 好友申请已通过！' + (noteValue ? '\n备注「' + noteValue + '」已保存。' : ''));
                    } else { alert('「' + matched.name + '」的回复：\n\n' + aiReply + '\n\n❌ 好友申请被拒绝。'); }
                    hideSocialModal();
                } catch (err) { alert('AI 判断失败：' + err.message); }
                finally { confirmAddFriendBtn.textContent = '发送好友申请'; confirmAddFriendBtn.disabled = false; }
            });
        }
        const confirmCreateGroupBtn = document.getElementById('confirm-create-group');
        if (confirmCreateGroupBtn) {
            confirmCreateGroupBtn.addEventListener('click', () => {
                const groupName = document.getElementById('group-name-input').value.trim();
                if (!groupName) { alert('请输入群聊名称！'); return; }
                alert('群聊「' + groupName + '」创建成功' + (document.getElementById('group-members-input').value.trim() ? '，已邀请：' + document.getElementById('group-members-input').value.trim() : '') + '！');
                hideSocialModal();
            });
        }
    };

})(window.App);
