// =================================================================
// --- Diary Page ---
// =================================================================
(function (App) {

    let editingDiaryId = null, selectedMood = '';

    async function getDiaryEntries() { return await db.get('diaryEntries') || []; }
    async function saveDiaryEntries(entries) { await db.set('diaryEntries', entries); }

    function formatDiaryDate(dateStr) {
        const d = new Date(dateStr + 'T00:00:00');
        const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') + ' ' + weekdays[d.getDay()];
    }

    function renderCalendar(container, entries) {
        container.innerHTML = '';
        const now = new Date();
        const month = now.getMonth();
        const year = now.getFullYear();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDayOfMonth = new Date(year, month, 1).getDay();

        const moodByDate = entries.reduce((acc, entry) => {
            acc[entry.date] = entry.mood;
            return acc;
        }, {});

        for (let i = 0; i < firstDayOfMonth; i++) {
            container.appendChild(document.createElement('div'));
        }
        for (let day = 1; day <= daysInMonth; day++) {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day';
            dayEl.textContent = day;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            if (moodByDate[dateStr]) {
                const moodEl = document.createElement('span');
                moodEl.className = 'calendar-mood';
                moodEl.textContent = moodByDate[dateStr];
                dayEl.appendChild(moodEl);
            }
            if (day === now.getDate()) dayEl.classList.add('today');
            container.appendChild(dayEl);
        }
    }

    async function renderDiaryList() {
        const entries = await getDiaryEntries();
        const listEl = document.getElementById('diary-list');
        const calEl = document.getElementById('diary-calendar-view');
        if (!listEl || !calEl) return;
        const todayStr = new Date().toISOString().slice(0, 10);
        document.getElementById('diary-today-date').textContent = formatDiaryDate(todayStr);

        const grouped = entries.reduce((acc, entry) => {
            const month = entry.date.slice(0, 7);
            if (!acc[month]) acc[month] = [];
            acc[month].push(entry);
            return acc;
        }, {});

        listEl.innerHTML = '';
        Object.keys(grouped).sort((a, b) => b.localeCompare(a)).forEach(month => {
            const monthHeader = document.createElement('h3');
            monthHeader.className = 'diary-month-header';
            const [year, m] = month.split('-');
            monthHeader.textContent = year + '年' + parseInt(m) + '月';
            listEl.appendChild(monthHeader);

            grouped[month].sort((a, b) => b.date.localeCompare(a.date)).forEach(entry => {
                const item = document.createElement('div');
                item.className = 'diary-entry-item';
                item.innerHTML = `
                    <div class="diary-date-block">
                        <span class="day">${entry.date.slice(8, 10)}</span>
                        <span class="weekday">${formatDiaryDate(entry.date).split(' ')[1]}</span>
                    </div>
                    <div class="diary-content-block">
                        <span class="mood">${entry.mood || '📝'}</span>
                        <p>${entry.content.length > 50 ? entry.content.slice(0, 50) + '...' : entry.content}</p>
                    </div>`;
                item.addEventListener('click', () => openDiaryEditor(entry));
                listEl.appendChild(item);
            });
        });

        if (entries.length === 0) { listEl.innerHTML = '<div class="diary-empty-state"><i class="fa-solid fa-book-open"></i><p>还没有日记<br>点击右下角开始记录吧</p></div>'; }

        renderCalendar(calEl, entries);
    }

    function openDiaryEditor(entry) {
        const diaryPage = document.getElementById('diary-page');
        const diaryEditorPage = document.getElementById('diary-editor-page');
        editingDiaryId = entry ? entry.id : null;
        selectedMood = entry ? entry.mood : '😊';
        document.getElementById('diary-editor-textarea').value = entry ? entry.content : '';
        document.getElementById('diary-delete-btn').style.display = entry ? 'inline-block' : 'none';
        document.querySelectorAll('.mood-selector span').forEach(el => {
            el.classList.toggle('selected', el.textContent === selectedMood);
        });
        diaryPage.style.display = 'none';
        diaryEditorPage.style.display = 'block';
    }

    App.initDiary = function () {
        const diaryPage = document.getElementById('diary-page');
        const diaryEditorPage = document.getElementById('diary-editor-page');
        const pagesContainer = App.state.pagesContainer;
        const dock = App.state.dock;

        const diaryAppIcon = document.getElementById('diary-app');
        if (diaryAppIcon) diaryAppIcon.addEventListener('click', (e) => { e.stopPropagation(); pagesContainer.style.display = 'none'; dock.style.display = 'none'; diaryPage.style.display = 'block'; renderDiaryList(); });
        const backFromDiaryBtn = document.getElementById('back-from-diary');
        if (backFromDiaryBtn) backFromDiaryBtn.addEventListener('click', () => { if (diaryPage) diaryPage.style.display = 'none'; pagesContainer.style.display = 'flex'; dock.style.display = 'flex'; });
        const addDiaryBtn = document.getElementById('add-diary-btn') || document.getElementById('open-diary-create');
        if (addDiaryBtn) addDiaryBtn.addEventListener('click', () => openDiaryEditor(null));
        const backFromDiaryEditorBtn = document.getElementById('back-from-diary-editor');
        if (backFromDiaryEditorBtn) backFromDiaryEditorBtn.addEventListener('click', () => { if (diaryEditorPage) diaryEditorPage.style.display = 'none'; if (diaryPage) diaryPage.style.display = 'block'; renderDiaryList(); });

        document.querySelectorAll('.mood-selector span, .diary-mood-option').forEach(el => {
            el.addEventListener('click', () => {
                const prev = document.querySelector('.mood-selector span.selected, .diary-mood-option.selected');
                if (prev) prev.classList.remove('selected');
                el.classList.add('selected');
                selectedMood = el.dataset.mood || el.textContent;
            });
        });

        const saveDiaryBtn = document.getElementById('save-diary-btn') || document.getElementById('save-diary-entry-btn');
        if (saveDiaryBtn) saveDiaryBtn.addEventListener('click', async () => {
            const contentEl = document.getElementById('diary-editor-textarea') || document.getElementById('diary-content-input');
            const content = contentEl ? contentEl.value.trim() : '';
            if (!content) { alert('日记内容不能为空！'); return; }
            const entries = await getDiaryEntries();
            if (editingDiaryId) {
                const index = entries.findIndex(e => e.id === editingDiaryId);
                if (index !== -1) { entries[index].content = content; entries[index].mood = selectedMood; }
            } else {
                entries.push({ id: Date.now(), date: new Date().toISOString().slice(0, 10), content, mood: selectedMood });
            }
            await saveDiaryEntries(entries);
            if (diaryEditorPage) diaryEditorPage.style.display = 'none';
            if (diaryPage) diaryPage.style.display = 'block';
            renderDiaryList();
        });

        const diaryDeleteBtn = document.getElementById('diary-delete-btn');
        if (diaryDeleteBtn) diaryDeleteBtn.addEventListener('click', async () => {
            if (!editingDiaryId) return;
            if (confirm('确定要删除这篇日记吗？')) {
                let entries = await getDiaryEntries();
                entries = entries.filter(e => e.id !== editingDiaryId);
                await saveDiaryEntries(entries);
                if (diaryEditorPage) diaryEditorPage.style.display = 'none';
                if (diaryPage) diaryPage.style.display = 'block';
                renderDiaryList();
            }
        });
    };

})(window.App);
