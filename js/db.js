// =================================================================
// --- IndexedDB (异步存储) 帮助函数 ---
// =================================================================
const db = (() => {
    let dbInstance = null;
    const DB_NAME = 'mobileUIDB';
    const DB_VERSION = 1;

    function open() {
        return new Promise((resolve, reject) => {
            if (dbInstance) { return resolve(dbInstance); }
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = (event) => { console.error("数据库打开失败:", event.target.error); reject("数据库打开失败"); };
            request.onsuccess = (event) => { dbInstance = event.target.result; resolve(dbInstance); };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('keyval')) db.createObjectStore('keyval');
                if (!db.objectStoreNames.contains('personas')) {
                    const personaStore = db.createObjectStore('personas', { keyPath: 'id' });
                    // 在这里初始化预设人设数据
                    const presetPersonas = [
                        { id: 1672502400000, avatar: "https://b6.moe.gallery/moe-gallery-res/nsfw/pixiv/97491400.jpg", uid: "S1r1us", name: "Sirius", remark: "", accepted: true, signature: "The cold of winter cannot freeze the heart of spring.", height: "172cm", weight: "55kg", hobbies: "Reading, Stargazing", nationality: "🇬🇧 英国", language: "English（英语）", catchphrase: "Is that so?", info: "A quiet and introspective individual who often gets lost in thought. Prefers observing over participating. Has a sharp mind and a hidden warmth." },
                        { id: 1672588800000, avatar: "https://b6.moe.gallery/moe-gallery-res/nsfw/pixiv/96814389.jpg", uid: "LUN4", name: "Luna", remark: "", accepted: false, signature: "To the moon and never back.", height: "165cm", weight: "48kg", hobbies: "Singing, Gaming", nationality: "🇯🇵 日本", language: "日本語（日语）", catchphrase: "Ehehe~", info: "A cheerful and energetic VTuber who loves to interact with her fans. Hides a mischievous side behind her sweet smile." },
                        { id: 1672675200000, avatar: "https://b6.moe.gallery/moe-gallery-res/nsfw/pixiv/95603099.jpg", uid: "Cod3x", name: "Codex", remark: "", accepted: false, signature: "Information is the new currency.", height: "180cm", weight: "70kg", hobbies: "Hacking, Puzzles", nationality: "🇺🇸 美国", language: "English（英语）", catchphrase: "Interesting...", info: "A mysterious hacker who operates in the shadows. Believes in the free flow of information, for a price. Can be cynical but has a strong sense of justice." },
                        { id: 1672761600000, avatar: "https://b6.moe.gallery/moe-gallery-res/nsfw/pixiv/93605650_p0.jpg", uid: "R3ina", name: "Reina", remark: "", accepted: true, signature: "The stage is my battlefield.", height: "168cm", weight: "52kg", hobbies: "Dancing, Fashion", nationality: "🇰🇷 韩国", language: "한국어（韩语）", catchphrase: "Watch me.", info: "A charismatic and confident K-Pop idol. Works tirelessly to perfect her craft. Appears aloof but deeply cares for her group members and fans." }
                    ];
                    presetPersonas.forEach(p => personaStore.put(p));
                }
                if (!db.objectStoreNames.contains('conversations')) db.createObjectStore('conversations', { keyPath: 'personaId' });
                if (!db.objectStoreNames.contains('personaSettings')) db.createObjectStore('personaSettings', { keyPath: 'personaId' });
            };
        });
    }
    function get(key) {
        return open().then(db => new Promise((resolve, reject) => {
            const t = db.transaction('keyval', 'readonly'), s = t.objectStore('keyval'), r = s.get(key);
            r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
        }));
    }
    function set(key, value) {
        return open().then(db => new Promise((resolve, reject) => {
            const t = db.transaction('keyval', 'readwrite'), s = t.objectStore('keyval'), r = s.put(value, key);
            r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
        }));
    }
    function del(key) {
        return open().then(db => new Promise((resolve, reject) => {
            const t = db.transaction('keyval', 'readwrite'), s = t.objectStore('keyval'), r = s.delete(key);
            r.onsuccess = () => resolve(); r.onerror = () => reject(r.error);
        }));
    }
    function getAll(storeName) {
        return open().then(db => new Promise((resolve, reject) => {
            const t = db.transaction(storeName, 'readonly'), s = t.objectStore(storeName), r = s.getAll();
            r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
        }));
    }
    function getAllKeys(storeName) {
        return open().then(db => new Promise((resolve, reject) => {
            const t = db.transaction(storeName, 'readonly'), s = t.objectStore(storeName), r = s.getAllKeys();
            r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
        }));
    }
    function put(storeName, item) {
        return open().then(db => new Promise((resolve, reject) => {
            const t = db.transaction(storeName, 'readwrite'), s = t.objectStore(storeName), r = s.put(item);
            r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
        }));
    }
    function getFromStore(storeName, key) {
        return open().then(db => new Promise((resolve, reject) => {
            const t = db.transaction(storeName, 'readonly'), s = t.objectStore(storeName), r = s.get(key);
            r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
        }));
    }
    function deleteFromStore(storeName, key) {
        return open().then(db => new Promise((resolve, reject) => {
            const t = db.transaction(storeName, 'readwrite'), s = t.objectStore(storeName), r = s.delete(key);
            r.onsuccess = () => resolve(); r.onerror = () => reject(r.error);
        }));
    }
    function clearAll() {
        return open().then(db => new Promise((resolve, reject) => {
            const stores = ['keyval', 'personas', 'conversations', 'personaSettings'];
            const transaction = db.transaction(stores, 'readwrite');
            let count = 0;
            stores.forEach(storeName => {
                const r = transaction.objectStore(storeName).clear();
                r.onsuccess = () => { count++; if (count === stores.length) resolve(); };
            });
            transaction.onerror = (e) => reject("清除数据失败: " + e.target.error);
        }));
    }
    return { get, set, del, getAll, put, getFromStore, deleteFromStore, clearAll, open, getAllKeys };
})();
