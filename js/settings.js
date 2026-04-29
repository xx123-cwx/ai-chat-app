// =================================================================
// --- Settings App ---
// =================================================================
(function (App) {

    App.initSettings = function () {
        const settingsAppIcon = document.getElementById('settings-app');
        const settingsPage = document.getElementById('settings-page');
        const backToHomeFromSettingsButton = document.getElementById('back-to-home-from-settings');
        const pagesContainer = App.state.pagesContainer;
        const dock = App.state.dock;
        const beautifyPage = document.getElementById('beautify-page');

        const apiUrlInput = document.getElementById('api-url');
        const apiKeyInput = document.getElementById('api-key');
        const fetchModelsButton = document.getElementById('fetch-models-button');
        const modelSelect = document.getElementById('model-select');
        const temperatureSlider = document.getElementById('temperature-slider');
        const temperatureValue = document.getElementById('temperature-value');
        const saveSettingsButton = document.getElementById('save-settings-button');

        settingsAppIcon.addEventListener('click', (e) => { e.stopPropagation(); pagesContainer.style.display = 'none'; dock.style.display = 'none'; beautifyPage.style.display = 'none'; settingsPage.style.display = 'block'; });
        backToHomeFromSettingsButton.addEventListener('click', () => { settingsPage.style.display = 'none'; pagesContainer.style.display = 'flex'; dock.style.display = 'flex'; });

        temperatureSlider.addEventListener('input', () => { temperatureValue.textContent = temperatureSlider.value; });

        fetchModelsButton.addEventListener('click', async () => {
            const url = apiUrlInput.value.trim(), key = apiKeyInput.value.trim();
            if (!url || !key) { alert('请输入 API URL 和密钥。'); return; }
            fetchModelsButton.textContent = '正在拉取...'; fetchModelsButton.disabled = true;
            try {
                const response = await fetch(url + '/models', { headers: { 'Authorization': 'Bearer ' + key } });
                if (!response.ok) throw new Error('状态码: ' + response.status);
                const data = await response.json();
                const models = data.data || data;
                modelSelect.innerHTML = '';
                if (Array.isArray(models) && models.length > 0) {
                    models.forEach(m => { const o = document.createElement('option'); o.value = m.id; o.textContent = m.id; modelSelect.appendChild(o); });
                    alert('模型列表拉取成功！');
                } else { modelSelect.innerHTML = '<option>未找到模型</option>'; alert('成功连接，但未找到可用模型。'); }
            } catch (err) { console.error('拉取模型失败:', err); alert('拉取模型失败: ' + err.message); modelSelect.innerHTML = '<option>拉取失败</option>'; }
            finally { fetchModelsButton.textContent = '拉取模型列表'; fetchModelsButton.disabled = false; }
        });

        saveSettingsButton.addEventListener('click', async () => {
            const settings = { apiUrl: apiUrlInput.value.trim(), apiKey: apiKeyInput.value.trim(), selectedModel: modelSelect.value, temperature: temperatureSlider.value };
            await db.set('apiSettings', settings); App.state.cachedApiSettings = settings; alert('设置已保存！');
        });

        // --- 导出 / 导入 / 清除数据 ---
        const exportDataButton = document.getElementById('export-data-button');
        const importDataButton = document.getElementById('import-data-button');
        const importFileInput = document.getElementById('import-file-input');
        const clearAllDataButton = document.getElementById('clear-all-data-button');

        exportDataButton.addEventListener('click', async () => {
            try {
                const dataToExport = { _version: 1 };
                const allKeys = await db.getAllKeys('keyval');
                for (const key of allKeys) dataToExport['keyval__' + key] = await db.get(key);
                dataToExport['personas'] = await db.getAll('personas');
                dataToExport['conversations'] = await db.getAll('conversations');
                dataToExport['personaSettings'] = await db.getAll('personaSettings');
                const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url; a.download = 'mobile_ui_backup_' + new Date().toISOString().slice(0, 10) + '.json';
                document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
                alert('备份文件已导出！');
            } catch (err) { alert('导出失败：' + err.message); }
        });
        importDataButton.addEventListener('click', () => importFileInput.click());
        importFileInput.addEventListener('change', (event) => {
            const file = event.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (confirm('您确定要导入备份吗？这将覆盖所有当前设置。')) {
                        await db.clearAll();
                        for (const key of Object.keys(data)) { if (key.startsWith('keyval__')) await db.set(key.replace('keyval__', ''), data[key]); }
                        if (Array.isArray(data.personas)) for (const p of data.personas) await db.put('personas', p);
                        if (Array.isArray(data.conversations)) for (const c of data.conversations) await db.put('conversations', c);
                        if (Array.isArray(data.personaSettings)) for (const s of data.personaSettings) await db.put('personaSettings', s);
                        alert('数据导入成功！页面将重新加载以应用更改。'); window.location.reload();
                    }
                } catch (error) { alert('导入失败：文件格式无效。'); }
            };
            reader.readAsText(file);
        });
        clearAllDataButton.addEventListener('click', async () => {
            if (confirm('您确定要清除所有数据吗？此操作不可撤销，将删除所有美化和API设置。')) { await db.clearAll(); alert('所有数据已清除！页面将重新加载。'); window.location.reload(); }
        });
    };

    App.loadApiSettings = async function () {
        const apiUrlInput = document.getElementById('api-url');
        const apiKeyInput = document.getElementById('api-key');
        const modelSelect = document.getElementById('model-select');
        const temperatureSlider = document.getElementById('temperature-slider');
        const temperatureValue = document.getElementById('temperature-value');

        const settings = await db.get('apiSettings');
        if (settings) {
            App.state.cachedApiSettings = settings;
            apiUrlInput.value = settings.apiUrl || '';
            apiKeyInput.value = settings.apiKey || '';
            temperatureSlider.value = settings.temperature || 0.7;
            temperatureValue.textContent = settings.temperature || 0.7;
            if (settings.selectedModel) { modelSelect.innerHTML = '<option value="' + settings.selectedModel + '">' + settings.selectedModel + '</option>'; modelSelect.value = settings.selectedModel; }
        }
    };

})(window.App);
