// =================================================================
// --- Persona Page ---
// =================================================================
(function (App) {

    const COUNTRIES_LANGUAGES = [
        {country:'🇨🇳 中国',language:'中文（普通话）'},{country:'🇯🇵 日本',language:'日本語（日语）'},{country:'🇰🇷 韩国',language:'한국어（韩语）'},
        {country:'🇺🇸 美国',language:'English（英语）'},{country:'🇬🇧 英国',language:'English（英语）'},{country:'🇫🇷 法国',language:'Français（法语）'},
        {country:'🇩🇪 德国',language:'Deutsch（德语）'},{country:'🇪🇸 西班牙',language:'Español（西班牙语）'},{country:'🇮🇹 意大利',language:'Italiano（意大利语）'},
        {country:'🇷🇺 俄罗斯',language:'Русский（俄语）'},{country:'🇧🇷 巴西',language:'Português（葡萄牙语）'},{country:'🇵🇹 葡萄牙',language:'Português（葡萄牙语）'},
        {country:'🇸🇦 阿拉伯',language:'العربية（阿拉伯语）'},{country:'🇮🇳 印度',language:'हिन्दी / English'},{country:'🇹🇭 泰国',language:'ภาษาไทย（泰语）'},
        {country:'🇻🇳 越南',language:'Tiếng Việt（越南语）'},{country:'🇮🇩 印度尼西亚',language:'Bahasa Indonesia（印尼语）'},{country:'🇲🇾 马来西亚',language:'Bahasa Melayu（马来语）'},
        {country:'🇵🇭 菲律宾',language:'Filipino / English'},{country:'🇦🇺 澳大利亚',language:'English（英语）'},{country:'🇨🇦 加拿大',language:'English / Français'},
        {country:'🇲🇽 墨西哥',language:'Español（西班牙语）'},{country:'🇳🇱 荷兰',language:'Nederlands（荷兰语）'},{country:'🇸🇪 瑞典',language:'Svenska（瑞典语）'},
        {country:'🇳🇴 挪威',language:'Norsk（挪威语）'},{country:'🇩🇰 丹麦',language:'Dansk（丹麦语）'},{country:'🇫🇮 芬兰',language:'Suomi（芬兰语）'},
        {country:'🇵🇱 波兰',language:'Polski（波兰语）'},{country:'🇹🇷 土耳其',language:'Türkçe（土耳其语）'},{country:'🇪🇬 埃及',language:'العربية（阿拉伯语）'},
        {country:'🇿🇦 南非',language:'English / Zulu'},{country:'🇦🇷 阿根廷',language:'Español（西班牙语）'},{country:'🇨🇱 智利',language:'Español（西班牙语）'},
        {country:'🇨🇴 哥伦比亚',language:'Español（西班牙语）'},{country:'🇳🇬 尼日利亚',language:'English / Hausa'},{country:'🇮🇷 伊朗',language:'فارسی（波斯语）'},
        {country:'🇵🇰 巴基斯坦',language:'اردو / English'},{country:'🇬🇷 希腊',language:'Ελληνικά（希腊语）'},{country:'🇨🇿 捷克',language:'Čeština（捷克语）'},
        {country:'🇭🇺 匈牙利',language:'Magyar（匈牙利语）'},{country:'🇮🇸 冰岛',language:'Íslenska（冰岛语）'},{country:'🇲🇻 马尔代夫',language:'ދިވެހި（迪维希语）'},
        {country:'🏳️ 虚构/架空',language:'自定义语言'}
    ];

    let currentPersonaAvatarData = null;
    let editingPersonaId = null;

    App.initPersona = function () {
        const personaPageEl = document.getElementById('persona-page');
        const personaListEl = document.getElementById('persona-list');
        const personaModalEl = document.getElementById('persona-modal');
        const personaAvatarPreviewCircle = document.getElementById('persona-avatar-preview-circle');
        const personaAvatarInput = document.getElementById('persona-avatar-input');
        const nationalitySelect = document.getElementById('persona-nationality');
        const pagesContainer = App.state.pagesContainer;
        const dock = App.state.dock;

        if (nationalitySelect) COUNTRIES_LANGUAGES.forEach(item => { const opt = document.createElement('option'); opt.value = item.country; opt.dataset.language = item.language; opt.textContent = item.country + ' — ' + item.language; nationalitySelect.appendChild(opt); });

        function updatePersonaAvatarPreview(src) { if (personaAvatarPreviewCircle) personaAvatarPreviewCircle.innerHTML = src ? '<img src="' + src + '" alt="avatar">' : '<i class="fa-solid fa-camera"></i>'; }

        function openPersonaModal(persona) {
            editingPersonaId = persona ? persona.id : null;
            currentPersonaAvatarData = persona ? (persona.avatar || null) : null;
            const modalTitle = document.getElementById('persona-modal-title');
            if (modalTitle) modalTitle.textContent = persona ? '编辑人设' : '添加人设';
            ['uid', 'name', 'signature', 'height', 'weight', 'hobbies', 'catchphrase', 'info', 'timeAwareness', 'minReply', 'maxReply'].forEach(f => {
                const el = document.getElementById('persona-' + f);
                if (!el) return;
                if (el.type === 'checkbox') {
                    el.checked = persona ? !!persona[f] : (f === 'timeAwareness'); // Default timeAwareness to true for new personas
                } else {
                    el.value = persona ? (persona[f] || '') : '';
                }
            });
            if (nationalitySelect) nationalitySelect.value = persona ? (persona.nationality || '') : '';
            updatePersonaAvatarPreview(currentPersonaAvatarData);
            if (personaModalEl) personaModalEl.classList.add('active');
        }
        function closePersonaModal() { if (personaModalEl) personaModalEl.classList.remove('active'); currentPersonaAvatarData = null; editingPersonaId = null; if (personaAvatarInput) personaAvatarInput.value = ''; }

        async function renderPersonaList() {
            const personas = await App.getPersonas();
            if (personas.length === 0) { personaListEl.innerHTML = '<div class="persona-empty-state"><i class="fa-solid fa-user-astronaut"></i><p>还没有人设档案<br>点击右上角 <b>+</b> 添加</p></div>'; return; }
            personaListEl.innerHTML = '';
            personas.forEach(p => {
                const card = document.createElement('div'); card.className = 'persona-card';
                const avatarHtml = p.avatar ? '<img src="' + p.avatar + '" alt="' + (p.name || '') + '">' : App.getPersonaLetterAvatar(p.name);
                const meta = [p.uid ? 'UID: ' + p.uid : '', p.nationality ? p.nationality.replace(/^\S+\s/, '') : '', p.language || ''].filter(Boolean).join(' · ');
                card.innerHTML = '<div class="persona-card-avatar">' + avatarHtml + '</div><div class="persona-card-info"><p class="persona-card-name">' + (p.name || '未命名角色') + (p.remark ? ' <span class="persona-card-remark">(' + p.remark + ')</span>' : '') + '</p><p class="persona-card-sig">' + (p.signature || '暂无签名') + '</p><p class="persona-card-meta">' + meta + '</p></div><button class="persona-card-delete" title="删除"><i class="fa-solid fa-trash-can"></i></button>';
                card.addEventListener('click', e => { if (e.target.closest('.persona-card-delete')) return; openPersonaModal(p); });
                card.querySelector('.persona-card-delete').addEventListener('click', async e => { e.stopPropagation(); if (confirm('确定要删除「' + (p.name || '未命名角色') + '」的人设档案吗？')) { await App.deletePersona(p.id); await renderPersonaList(); } });
                personaListEl.appendChild(card);
            });
        }

        const personaAppIcon = document.getElementById('persona-app');
        if (personaAppIcon) personaAppIcon.addEventListener('click', e => { e.stopPropagation(); pagesContainer.style.display = 'none'; dock.style.display = 'none'; if (personaPageEl) personaPageEl.style.display = 'block'; renderPersonaList(); });
        const backFromPersonaBtn = document.getElementById('back-from-persona');
        if (backFromPersonaBtn) backFromPersonaBtn.addEventListener('click', () => { if (personaPageEl) personaPageEl.style.display = 'none'; pagesContainer.style.display = 'flex'; dock.style.display = 'flex'; });
        const openPersonaCreateBtn = document.getElementById('open-persona-create-modal');
        if (openPersonaCreateBtn) openPersonaCreateBtn.addEventListener('click', () => openPersonaModal(null));

        // Send friend request from persona page
        const personaSendReqBtn = document.getElementById('persona-send-req-btn');
        if (personaSendReqBtn) {
            personaSendReqBtn.addEventListener('click', async function () {
                const personas = await App.getPersonas();
                if (personas.length === 0) { alert('请先创建角色人设，再使用此功能！'); return; }
                let selectedPersona = null;
                if (personas.length === 1) {
                    if (!confirm('是否让「' + personas[0].name + '」主动向您发起好友申请？')) return;
                    selectedPersona = personas[0];
                } else {
                    let listStr = '请选择要主动发起好友申请的角色：\n';
                    personas.forEach((p, i) => { listStr += (i + 1) + '. ' + p.name + '\n'; });
                    const inputStr = prompt(listStr + '\n请输入序号：');
                    if (inputStr === null || inputStr.trim() === '') return;
                    const selIdx = parseInt(inputStr.trim()) - 1;
                    if (isNaN(selIdx) || selIdx < 0 || selIdx >= personas.length) { alert('序号无效，请重新操作。'); return; }
                    selectedPersona = personas[selIdx];
                    if (!confirm('确认让「' + selectedPersona.name + '」主动向您发送好友申请吗？')) return;
                }
                const apiSettings = App.state.cachedApiSettings;
                const pParts = [];
                if (selectedPersona.signature) pParts.push('个性签名：' + selectedPersona.signature);
                if (selectedPersona.nationality) pParts.push('国籍：' + selectedPersona.nationality);
                if (selectedPersona.hobbies) pParts.push('爱好：' + selectedPersona.hobbies);
                if (selectedPersona.catchphrase) pParts.push('口头禅：' + selectedPersona.catchphrase);
                if (selectedPersona.info) pParts.push('人设详情：' + selectedPersona.info);
                const uName = (App.state.cachedUserProfile || {}).nickname || '用户';
                if (!apiSettings || !apiSettings.apiUrl || !apiSettings.apiKey || !apiSettings.selectedModel || apiSettings.selectedModel === '请先拉取模型列表') {
                    await App.storeFriendRequest({ personaId: selectedPersona.id, name: selectedPersona.name, avatar: selectedPersona.avatar || null, message: '你好，我是' + selectedPersona.name + '，很想和你成为朋友，请通过我的好友申请吧！', ts: Date.now(), type: 'add' });
                    await App.updateFriendRequestsBadge(); alert('「' + selectedPersona.name + '」的好友申请已添加到「好友申请」收件箱！'); return;
                }
                personaSendReqBtn.disabled = true; personaSendReqBtn.innerHTML = '<span style="font-size:11px;letter-spacing:2px;">···</span>';
                try {
                    const resp = await fetch(apiSettings.apiUrl.replace(/\/$/, '') + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiSettings.apiKey }, body: JSON.stringify({ model: apiSettings.selectedModel, messages: [{ role: 'user', content: '你现在完全沉浸于扮演角色「' + selectedPersona.name + '」，你就是「' + selectedPersona.name + '」本人，不是AI，不是程序。\n\n【角色信息】\n' + (pParts.join('\n') || '（无详细信息）') + '\n\n【任务】请以「' + selectedPersona.name + '」的第一人称，写一条主动向「' + uName + '」发送的好友申请消息。\n要求：完全符合角色性格，真诚自然，不超过60字。绝对禁止OOC，禁止暗示自己是AI或程序。只输出申请消息正文，不加任何前缀。' }], temperature: 0.8 }) });
                    if (!resp.ok) throw new Error('HTTP ' + resp.status);
                    const json = await resp.json();
                    const reqMsg = ((json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '').trim() || '你好，我是' + selectedPersona.name + '，希望我们能成为好朋友！';
                    await App.storeFriendRequest({ personaId: selectedPersona.id, name: selectedPersona.name, avatar: selectedPersona.avatar || null, message: reqMsg, ts: Date.now(), type: 'add' });
                } catch (err) {
                    await App.storeFriendRequest({ personaId: selectedPersona.id, name: selectedPersona.name, avatar: selectedPersona.avatar || null, message: '你好，我是' + selectedPersona.name + '，很高兴认识你，希望我们能成为好朋友！', ts: Date.now(), type: 'add' });
                } finally { personaSendReqBtn.disabled = false; personaSendReqBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>'; }
                await App.updateFriendRequestsBadge(); alert('「' + selectedPersona.name + '」的好友申请已添加到「好友申请」收件箱！');
            });
        }

        const personaAvatarUploadBtn = document.getElementById('persona-avatar-upload-btn');
        if (personaAvatarUploadBtn) personaAvatarUploadBtn.addEventListener('click', () => { if (personaAvatarInput) personaAvatarInput.click(); });
        if (personaAvatarInput) personaAvatarInput.addEventListener('change', e => { if (e.target.files && e.target.files[0]) { const reader = new FileReader(); reader.onload = ev => { currentPersonaAvatarData = ev.target.result; updatePersonaAvatarPreview(currentPersonaAvatarData); }; reader.readAsDataURL(e.target.files[0]); } });

        const savePersonaBtn = document.getElementById('save-persona-btn');
        if (savePersonaBtn) savePersonaBtn.addEventListener('click', async () => {
            const name = document.getElementById('persona-name').value.trim();
            if (!name) { alert('请输入角色姓名！'); return; }
            const selOpt = nationalitySelect.options[nationalitySelect.selectedIndex];
            const personas = await App.getPersonas();
            const existing = editingPersonaId ? (personas.find(p => p.id === editingPersonaId) || {}) : {};
            await App.savePersona({
                id: editingPersonaId || Date.now(),
                avatar: currentPersonaAvatarData,
                uid: document.getElementById('persona-uid').value.trim(),
                name,
                remark: existing.remark || '',
                accepted: existing.accepted || false,
                signature: document.getElementById('persona-signature').value.trim(),
                height: document.getElementById('persona-height').value.trim(),
                weight: document.getElementById('persona-weight').value.trim(),
                hobbies: document.getElementById('persona-hobbies').value.trim(),
                nationality: nationalitySelect.value,
                language: selOpt ? (selOpt.dataset.language || '') : '',
                catchphrase: document.getElementById('persona-catchphrase').value.trim(),
                info: document.getElementById('persona-info').value.trim(),
                timeAwareness: document.getElementById('persona-timeAwareness').checked,
                minReply: parseInt(document.getElementById('persona-minReply').value, 10) || 1,
                maxReply: parseInt(document.getElementById('persona-maxReply').value, 10) || 1,
            });
            await renderPersonaList(); closePersonaModal();
        });
        const cancelPersonaBtn = document.getElementById('cancel-persona-btn');
        if (cancelPersonaBtn) cancelPersonaBtn.addEventListener('click', closePersonaModal);
        if (personaModalEl) personaModalEl.addEventListener('click', e => { if (e.target === personaModalEl) closePersonaModal(); });
    };

})(window.App);
