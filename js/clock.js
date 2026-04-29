// =================================================================
// --- Clock / Calendar ---
// =================================================================
(function (App) {

    const TZ_MAP = {
        '中国': 'Asia/Shanghai', '日本': 'Asia/Tokyo', '韩国': 'Asia/Seoul', '美国': 'America/New_York',
        '英国': 'Europe/London', '法国': 'Europe/Paris', '德国': 'Europe/Berlin', '西班牙': 'Europe/Madrid',
        '意大利': 'Europe/Rome', '俄罗斯': 'Europe/Moscow', '巴西': 'America/Sao_Paulo', '墨西哥': 'America/Mexico_City',
        '加拿大': 'America/Toronto', '澳大利亚': 'Australia/Sydney', '印度': 'Asia/Kolkata', '泰国': 'Asia/Bangkok',
        '越南': 'Asia/Ho_Chi_Minh', '印尼': 'Asia/Jakarta', '印度尼西亚': 'Asia/Jakarta', '马来西亚': 'Asia/Kuala_Lumpur',
        '菲律宾': 'Asia/Manila', '土耳其': 'Europe/Istanbul', '荷兰': 'Europe/Amsterdam', '瑞典': 'Europe/Stockholm',
        '挪威': 'Europe/Oslo', '丹麦': 'Europe/Copenhagen', '芬兰': 'Europe/Helsinki', '波兰': 'Europe/Warsaw',
        '希腊': 'Europe/Athens', '南非': 'Africa/Johannesburg', '埃及': 'Africa/Cairo',
        '阿根廷': 'America/Argentina/Buenos_Aires', '智利': 'America/Santiago', '哥伦比亚': 'America/Bogota',
        '沙特': 'Asia/Riyadh', '阿拉伯': 'Asia/Riyadh', '伊朗': 'Asia/Tehran', '巴基斯坦': 'Asia/Karachi',
        '冰岛': 'Atlantic/Reykjavik', '马尔代夫': 'Indian/Maldives'
    };

    function getPersonaTimeZone(persona) {
        const raw = String((persona && persona.nationality) || '').trim();
        for (const key of Object.keys(TZ_MAP)) { if (raw.includes(key)) return TZ_MAP[key]; }
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
    }

    function getNowByTimeZone(tz) {
        try { return new Date(new Date().toLocaleString('en-US', { timeZone: tz })); } catch (e) { return new Date(); }
    }

    function getTimeStringForTimeZone(tz) {
        try { return new Intl.DateTimeFormat('zh-CN', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()); }
        catch (e) { const d = new Date(); return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0'); }
    }

    function refreshPersonaTimeAwareness(persona) {
        if (!persona) return null;
        const tz = getPersonaTimeZone(persona);
        const timeString = getTimeStringForTimeZone(tz);
        const now = getNowByTimeZone(tz);
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
        const weekday = weekdays[now.getDay()];
        const fullDateTime = year + '年' + month + '月' + day + '日 ' + weekday + ' ' + timeString;
        const el = document.getElementById('conv-status-time');
        if (el) el.textContent = timeString;
        return { timeZone: tz, localTime: timeString, fullDateTime: fullDateTime, now: now };
    }

    function setClock(timeZone) {
        const tz = timeZone || App.state.currentTimeZone || 'Asia/Shanghai';
        App.state.currentTimeZone = tz;
        const now = getNowByTimeZone(tz);
        const timeString = getTimeStringForTimeZone(tz);

        const statusTime1 = document.getElementById('status-time-1');
        const statusTime2 = document.getElementById('status-time-2');
        if (statusTime1) statusTime1.textContent = timeString;
        if (statusTime2) statusTime2.textContent = timeString;
        const cst = document.getElementById('conv-status-time');
        if (cst) cst.textContent = timeString;

        const h = now.getHours(), m = now.getMinutes(), s = now.getSeconds();
        const secondHand = document.querySelector('.hand.second');
        const minuteHand = document.querySelector('.hand.minute');
        const hourHand = document.querySelector('.hand.hour');
        if (secondHand) secondHand.style.transform = 'rotate(' + ((s / 60) * 360 + 90) + 'deg)';
        if (minuteHand) minuteHand.style.transform = 'rotate(' + ((m / 60) * 360 + (s / 60) * 6 + 90) + 'deg)';
        if (hourHand) hourHand.style.transform = 'rotate(' + ((h % 12) / 12 * 360 + (m / 60) * 30 + 90) + 'deg)';

        const cal = document.getElementById('realtime-calendar');
        if (cal) cal.querySelector('p').textContent = 'Today - ' + (now.getMonth() + 1) + '月' + now.getDate() + '日';
    }

    App.initClock = function () {
        setInterval(setClock, 1000);
        setClock();
    };

    // Expose functions for other modules
    App.setClock = setClock;
    App.refreshPersonaTimeAwareness = refreshPersonaTimeAwareness;
    App.getPersonaTimeZone = getPersonaTimeZone;
    App.getNowByTimeZone = getNowByTimeZone;
    App.getTimeStringForTimeZone = getTimeStringForTimeZone;

})(window.App);
