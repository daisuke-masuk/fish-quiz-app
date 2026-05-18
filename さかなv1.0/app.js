// --- アプリのグローバル状態（ステート） ---
let fishMaster = [];       // 魚マスタ
let categoryMaster = [];   // 分類マスタ

let currentUser = null;    // 現在ログイン中のユーザーID
let userFavorites = [];    // お気に入り魚のIDリスト
let userWrongs = [];       // 間違えた魚のIDリスト
let userCorrects = [];     // 正解リスト
let userNotToLearn = [];   // 覚えないリスト
let userLogs = [];         // 過去のクイズ履歴ログリスト

// クイズ実行用データ
let currentQuizPool = [];  
let quizQuestions = [];    
let currentQuestionIdx = 0;
let currentScore = 0;      
let quizHistory = [];      
let selectedChoicesCount = 4; 

// タイマー制御用
let timerInterval = null;
let quizSecondsElapsed = 0;

// ログ保存用の開始設定記憶バッファ
let currentQuizSettings = {};

// --- 1. アプリ初期化 ---
document.addEventListener("DOMContentLoaded", async () => {
    try {
        const [fishRes, catRes] = await Promise.all([
            fetch('fish_master.json'),
            fetch('category_master.json')
        ]);
        fishMaster = await fishRes.json();
        categoryMaster = await catRes.json();

        setupEventListeners();
        renderCategories("count_rank", true); 
    } catch (error) {
        console.error("データの読み込みに失敗しました:", error);
        alert("マスタデータの読み込みに失敗しました。");
    }
});

// --- 各種ヘルパー ---
function getValidImages(fish) {
    const validPaths = [];
    if (fish.image && fish.image !== "欠損") validPaths.push(`downloaded_images/${fish.image}`);
    if (fish.image2 && fish.image2 !== "欠損") validPaths.push(`downloaded_images2/${fish.image2}`);
    if (fish.image3 && fish.image3 !== "欠損") validPaths.push(`downloaded_images3/${fish.image3}`);
    if (validPaths.length === 0) validPaths.push(`downloaded_images/${fish.image}`);
    return validPaths;
}

function pickRandomImage(fish) {
    const validImages = getValidImages(fish);
    return validImages[Math.floor(Math.random() * validImages.length)];
}

function getDisplayImageForList(fish) {
    return getValidImages(fish)[0];
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
}

function startTimer() {
    clearInterval(timerInterval); 
    timerInterval = setInterval(() => {
        quizSecondsElapsed++;
        document.getElementById("quiz-timer").textContent = `⏱️ ${formatTime(quizSecondsElapsed)}`;
    }, 1000);
}

// --- 2. 画面遷移ヘルパー ---
function navigateTo(screenId) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    document.getElementById(screenId).classList.add("active");
    window.scrollTo(0, 0);
}

// --- 3. ログイン ＆ ストレージ ＆ ダッシュボード ---
function handleLogin() {
    const inputId = document.getElementById("login-id-input").value.trim();
    const errorEl = document.getElementById("login-error");
    errorEl.textContent = "";

    if (!inputId) {
        errorEl.textContent = "ユーザーIDを入力してください。";
        return;
    }

    let users = JSON.parse(localStorage.getItem("fish_quiz_users")) || {};
    
    if (!users[inputId]) {
        users[inputId] = { favorites: [], wrongs: [], corrects: [], notToLearn: [], logs: [] };
        localStorage.setItem("fish_quiz_users", JSON.stringify(users));
    }

    currentUser = inputId;
    userFavorites = users[currentUser].favorites || [];
    userWrongs = users[currentUser].wrongs || [];
    userCorrects = users[currentUser].corrects || [];      
    userNotToLearn = users[currentUser].notToLearn || [];  
    userLogs = users[currentUser].logs || [];  

    document.getElementById("current-user-id").textContent = currentUser;
    
    clearFilters();
    updateDashboard();
    navigateTo("setup-screen");
}

function updateStorage() {
    let users = JSON.parse(localStorage.getItem("fish_quiz_users")) || {};
    if (currentUser) {
        users[currentUser] = { 
            favorites: userFavorites, 
            wrongs: userWrongs,
            corrects: userCorrects,
            notToLearn: userNotToLearn,
            logs: userLogs 
        };
        localStorage.setItem("fish_quiz_users", JSON.stringify(users));
    }
    updateDashboard(); 
}

function updateDashboard() {
    if (!currentUser) return;
    const total = fishMaster.length;
    const favCount = userFavorites.length;
    const wrongCount = userWrongs.length;
    const correctCount = userCorrects.length;
    const notLearnCount = userNotToLearn.length;

    document.getElementById("db-total-count").textContent = total;
    document.getElementById("db-correct-count").textContent = correctCount;
    document.getElementById("db-remaining-count").textContent = Math.max(0, total - correctCount - notLearnCount);

    const percent = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    document.getElementById("db-progress-percent").textContent = `${percent}%`;
    document.getElementById("db-progress-bar").style.width = `${percent}%`;
    
    document.getElementById("nav-fav-btn").innerHTML = `⭐ お気に入り <small>(${favCount})</small>`;
    document.getElementById("nav-wrong-btn").innerHTML = `❌ 間違えた魚 <small>(${wrongCount})</small>`;
    document.getElementById("nav-correct-btn").innerHTML = `📁 正解リスト <small>(${correctCount})</small>`;
    document.getElementById("nav-not-learn-btn").innerHTML = `🙈 今後登場させない（覚えない）リストを見る <small>(${notLearnCount})</small>`;

    const logContainer = document.getElementById("db-log-container");
    if (userLogs.length === 0) {
        logContainer.innerHTML = `<p class="empty-log-text">まだチャレンジ履歴がありません。</p>`;
    } else {
        const recentLogs = userLogs.slice(0, 5);
        logContainer.innerHTML = recentLogs.map(log => `
            <div class="log-row-item">
                <span class="log-date">${log.date}</span>
                <span class="log-stats">${log.correct}/${log.total}問 (${log.time})</span>
                <span class="log-rate" title="10秒あたりの正解数">⚡ ${log.rate}/10秒</span>
            </div>
        `).join("");
    }
}

function clearFilters() {
    const activeTab = document.querySelector(".tab-btn.active") ? document.querySelector(".tab-btn.active").id : "sort-count-btn";
    const sortKey = activeTab.includes("count") ? "count_rank" : activeTab.includes("pop") ? "pop_rank" : "abc";
    renderCategories(sortKey, true);
    document.querySelectorAll("input[name='popularity-filter']").forEach(cb => cb.checked = false);
}

// --- 4. 分類チェックボックスの描画 ---
function renderCategories(sortKey, forceReset = false) {
    const container = document.getElementById("category-list-container");
    if (!container) return;
    
    let sortedCategories = [...categoryMaster];
    if (sortKey === "count_rank") { sortedCategories.sort((a, b) => a.count_rank - b.count_rank); } 
    else if (sortKey === "pop_rank") { sortedCategories.sort((a, b) => a.pop_rank - b.pop_rank); } 
    else if (sortKey === "abc") { sortedCategories.sort((a, b) => a.name.localeCompare(b.name, 'ja')); }

    const checkedValues = forceReset ? new Set() : new Set(
        Array.from(document.querySelectorAll("input[name='category']:checked")).map(el => el.value)
    );

    const favCount = userFavorites.length;
    const wrongCount = userWrongs.length;

    let html = `
        <label class="checkbox-item special-category">
            <input type="checkbox" name="category" value="__FAVORITES__" ${checkedValues.has("__FAVORITES__") ? "checked" : ""}>
            <span class="checkbox-text">⭐ お気に入りの魚 <small>(${favCount})</small></span>
        </label>
        <label class="checkbox-item special-category">
            <input type="checkbox" name="category" value="__WRONGS__" ${checkedValues.has("__WRONGS__") ? "checked" : ""}>
            <span class="checkbox-text">❌ 間違えた問題 <small>(${wrongCount})</small></span>
        </label>
    `;

    html += sortedCategories.map(cat => {
        const isChecked = checkedValues.has(cat.name) ? "checked" : "";
        return `
            <label class="checkbox-item">
                <input type="checkbox" name="category" value="${cat.name}" ${isChecked}>
                <span class="checkbox-text">${cat.name} <small>(${cat.count})</small></span>
            </label>
        `;
    }).join("");

    container.innerHTML = html;
}

// --- 5. クイズ生成アルゴリズム ---
function startQuiz() {
    const selectedPops = Array.from(document.querySelectorAll("input[name='popularity-filter']:checked")).map(el => parseInt(el.value));
    const selectedCats = Array.from(document.querySelectorAll("input[name='category']:checked")).map(el => el.value);
    
    if (selectedCats.length === 0) {
        alert("出題するお魚の種類を1つ以上選択してください。");
        return;
    }

    let poolMap = new Map();
    selectedCats.forEach(cat => {
        if (cat === "__FAVORITES__") { fishMaster.forEach(f => { if (userFavorites.includes(f.id)) poolMap.set(f.id, f); }); } 
        else if (cat === "__WRONGS__") { fishMaster.forEach(f => { if (userWrongs.includes(f.id)) poolMap.set(f.id, f); }); } 
        else { fishMaster.forEach(f => { if (f.category === cat) poolMap.set(f.id, f); }); }
    });

    const isUnansweredOnly = document.getElementById("unanswered-only-switch").checked;
    
    currentQuizPool = Array.from(poolMap.values()).filter(fish => {
        if (userNotToLearn.includes(fish.id)) return false;
        if (isUnansweredOnly && userCorrects.includes(fish.id)) return false;
        if (selectedPops.length > 0 && !selectedPops.includes(fish.popularity)) return false;
        return true;
    });

    if (currentQuizPool.length === 0) {
        alert("条件に該当する、出題可能な魚がいません。");
        return;
    }

    selectedChoicesCount = parseInt(document.getElementById("choices-count").value);
    const quizType = document.querySelector("input[name='quiz-type']:checked").value;
    const reqQuestionsVal = document.getElementById("questions-count-select").value;

    currentQuizSettings = {
        type: quizType === "photo-to-name" ? "📷 写真➔名前" : "📝 名前➔写真",
        categories: selectedCats.map(c => c === '__FAVORITES__' ? '⭐お気に入り' : c === '__WRONGS__' ? '❌間違えた' : c),
        popularity: selectedPops.length > 0 ? selectedPops.map(p => `★${p}`) : ["全対象"],
        unansweredOnly: isUnansweredOnly ? "ON" : "OFF"
    };

    const shuffle = (array) => array.sort(() => Math.random() - 0.5);
    let shuffledPool = shuffle([...currentQuizPool]);

    let maxQuestions = reqQuestionsVal === "all" ? shuffledPool.length : parseInt(reqQuestionsVal);
    const totalQuestions = Math.min(maxQuestions, shuffledPool.length);
    quizQuestions = shuffledPool.slice(0, totalQuestions);

    quizQuestions = quizQuestions.map(correctFish => {
        let dummyPool = currentQuizPool.filter(f => f.id !== correctFish.id);
        if (dummyPool.length < selectedChoicesCount - 1) {
            const extraDummies = fishMaster.filter(f => f.id !== correctFish.id && !dummyPool.some(d => d.id === f.id));
            dummyPool = dummyPool.concat(shuffle(extraDummies));
        }
        const finalDummies = shuffle(dummyPool).slice(0, selectedChoicesCount - 1);
        const choices = shuffle([correctFish, ...finalDummies]);
        const chosenCorrectImagePath = pickRandomImage(correctFish);

        return {
            correct: correctFish,
            correctImage: chosenCorrectImagePath,
            choices: choices.map(cf => ({ fish: cf, imagePath: cf.id === correctFish.id ? chosenCorrectImagePath : pickRandomImage(cf) })),
            type: quizType
        };
    });

    currentQuestionIdx = 0;
    currentScore = 0;
    quizHistory = [];
    quizSecondsElapsed = 0; 

    navigateTo("quiz-screen");
    renderQuestion();
}

// --- 6. クイズ中・解答処理 ---
function renderQuestion() {
    const q = quizQuestions[currentQuestionIdx];
    document.getElementById("quiz-timer").textContent = `⏱️ ${formatTime(quizSecondsElapsed)}`;
    startTimer();

    document.getElementById("quiz-progress").textContent = `第 ${currentQuestionIdx + 1} 問 / ${quizQuestions.length}問`;
    document.getElementById("quiz-feedback-container").style.display = "none";
    document.getElementById("next-question-btn").style.display = "none";

    const imgContainer = document.getElementById("question-image-wrapper");
    const textContainer = document.getElementById("question-text-wrapper");
    const choicesContainer = document.getElementById("quiz-choices-container");

    choicesContainer.className = q.type === "name-to-photo" ? "choices-grid photo-grid" : "choices-grid";
    choicesContainer.innerHTML = "";

    if (q.type === "photo-to-name") {
        imgContainer.style.display = "flex"; textContainer.style.display = "none";
        document.getElementById("question-image").src = q.correctImage;
        q.choices.forEach(c => {
            const btn = document.createElement("button"); btn.className = "btn btn-choice"; btn.textContent = c.fish.name;
            btn.onclick = () => handleAnswer(c.fish, btn); choicesContainer.appendChild(btn);
        });
    } else {
        imgContainer.style.display = "none"; textContainer.style.display = "block";
        document.getElementById("question-fish-name").textContent = q.correct.name;
        q.choices.forEach(c => {
            const btn = document.createElement("button"); btn.className = "btn btn-choice"; btn.innerHTML = `<img src="${c.imagePath}">`;
            btn.onclick = () => handleAnswer(c.fish, btn); choicesContainer.appendChild(btn);
        });
    }
}

function handleAnswer(selectedChoice, clickedBtn) {
    clearInterval(timerInterval);
    const q = quizQuestions[currentQuestionIdx];
    document.getElementById("quiz-choices-container").querySelectorAll(".btn-choice").forEach(b => b.disabled = true);

    const isCorrect = selectedChoice.id === q.correct.id;
    quizHistory.push({ fish: q.correct, isCorrect: isCorrect, shownImage: q.correctImage });

    const fbContainer = document.getElementById("quiz-feedback-container");
    const fbIcon = document.getElementById("feedback-icon");
    const fbText = document.getElementById("feedback-text");

    if (isCorrect) {
        currentScore++; fbContainer.className = "card feedback-card correct"; fbIcon.textContent = "⭕"; fbText.textContent = "正解！";
        if (!userCorrects.includes(q.correct.id)) { userCorrects.push(q.correct.id); updateStorage(); }
    } else {
        fbContainer.className = "card feedback-card incorrect"; fbIcon.textContent = "❌"; fbText.textContent = `不正解！正解は「${q.correct.name}」です`;
        if (!userWrongs.includes(q.correct.id)) { userWrongs.push(q.correct.id); updateStorage(); }
    }

    document.getElementById("feedback-fish-name").textContent = q.correct.name;
    document.getElementById("feedback-fish-english").textContent = q.correct.english || "英名情報なし";
    document.getElementById("feedback-fish-desc").textContent = q.correct.description || "解説はありません。";
    fbContainer.style.display = "block"; document.getElementById("next-question-btn").style.display = "block";
}

function handleNextQuestion() {
    currentQuestionIdx++;
    if (currentQuestionIdx < quizQuestions.length) { renderQuestion(); } else { showResult(); }
}

// --- 7. リザルト画面 ＆ 詳細履歴ログセーブ ---
function showResult() {
    clearInterval(timerInterval);
    navigateTo("result-screen");
    
    const totalPlayed = quizHistory.length || 1; 
    const percent = Math.round((currentScore / totalPlayed) * 100) || 0;
    
    document.getElementById("result-score-percent").textContent = `${percent}%`;
    document.getElementById("result-score-text").textContent = `${totalPlayed}問中 ${currentScore}問 正解！`;

    const seconds = quizSecondsElapsed || 1;
    const speedRate = ((currentScore / seconds) * 10).toFixed(2);

    document.getElementById("result-time-elapsed").textContent = `${seconds}秒 (${formatTime(seconds)})`;
    document.getElementById("result-speed-rate").textContent = `${speedRate}問`;

    const now = new Date();
    const logDateStr = `${(now.getMonth()+1)}/${now.getDate()} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
    
    const newLogItem = {
        date: logDateStr,
        total: totalPlayed,
        correct: currentScore,
        accuracy: `${percent}%`,
        time: `${seconds}秒`,
        rate: speedRate,
        type: currentQuizSettings.type || "不明",
        unansweredOnly: currentQuizSettings.unansweredOnly || "OFF",
        rangeScope: `【種類】${currentQuizSettings.categories.join('/')} \n【人気】${currentQuizSettings.popularity.join(',')}`
    };
    
    userLogs.unshift(newLogItem);
    updateStorage(); 

    document.getElementById("result-list-container").innerHTML = quizHistory.map((hist) => {
        const isFav = userFavorites.includes(hist.fish.id);
        const isNoConfidence = hist.isCorrect && !userCorrects.includes(hist.fish.id) ? "checked" : "";
        const isNotLearn = userNotToLearn.includes(hist.fish.id);

        return `
            <div class="result-item ${hist.isCorrect ? 'row-correct' : 'row-incorrect'} ${isNotLearn ? 'muted-row' : ''}" id="result-item-${hist.fish.id}">
                <span class="result-status">${hist.isCorrect ? '⭕' : '❌'}</span>
                <img src="${hist.shownImage}" class="result-item-img">
                <div class="result-item-info">
                    <h4>${hist.fish.name}</h4> <p>分類: ${hist.fish.category}</p>
                </div>
                <div class="result-item-actions">
                    ${hist.isCorrect ? `<label class="no-confidence-label"><input type="checkbox" ${isNoConfidence} onclick="toggleConfidence('${hist.fish.id}', this)">🤔 自信なし</label>` : ""}
                    <button class="btn-fav ${isFav ? 'active' : ''}" onclick="toggleFavorite('${hist.fish.id}', this)">${isFav ? '★' : '☆'}</button>
                    <button class="btn-not-learn ${isNotLearn ? 'active' : ''}" onclick="toggleNotToLearn('${hist.fish.id}', this)">🙈</button>
                </div>
            </div>
        `;
    }).join("");
}

function toggleFavorite(fishId, btnElement) {
    const idx = userFavorites.indexOf(fishId);
    if (idx > -1) { userFavorites.splice(idx, 1); if (btnElement) { btnElement.classList.remove("active"); btnElement.textContent = "☆"; } } 
    else { userFavorites.push(fishId); if (btnElement) { btnElement.classList.add("active"); btnElement.textContent = "★"; } }
    updateStorage();
}
function toggleConfidence(fishId, checkboxElement) {
    const idx = userCorrects.indexOf(fishId);
    if (checkboxElement.checked) { if (idx > -1) userCorrects.splice(idx, 1); } 
    else { if (idx === -1) userCorrects.push(fishId); }
    updateStorage();
}
function toggleNotToLearn(fishId, btnElement) {
    const idx = userNotToLearn.indexOf(fishId);
    const itemRow = document.getElementById(`result-item-${fishId}`);
    if (idx > -1) { userNotToLearn.splice(idx, 1); btnElement.classList.remove("active"); if (itemRow) itemRow.classList.remove("muted-row"); } 
    else { userNotToLearn.push(fishId); btnElement.classList.add("active"); if (itemRow) itemRow.classList.add("muted-row"); }
    updateStorage();
}

// --- 8. 各種一覧データ画面の描画 ---
function showListScreen(type) {
    const titleEl = document.getElementById("list-screen-title");
    const container = document.getElementById("fish-list-container");
    
    let targetIds = type === "fav" ? userFavorites : type === "wrong" ? userWrongs : type === "correct" ? userCorrects : userNotToLearn;
    titleEl.textContent = type === "fav" ? "⭐ お気に入りの魚" : type === "wrong" ? "❌ 間違えた魚" : type === "correct" ? "📁 正解した魚のリスト" : "🙈 登場させないリスト";

    if (targetIds.length === 0) {
        container.innerHTML = `<p class="text-center" style="padding:40px 0; color:#868e96;">データがありません。</p>`;
        navigateTo("list-screen");
        return;
    }

    const targetFishList = fishMaster.filter(f => targetIds.includes(f.id));

    container.innerHTML = targetFishList.map(fish => {
        const isFav = userFavorites.includes(fish.id);
        const listImgPath = getDisplayImageForList(fish);
        
        let actionButtons = "";
        if (type === "wrong") {
            actionButtons = `
                <button class="btn btn-sm btn-success" onclick="removeWrong('${fish.id}', this)">✅ 覚えた！</button>
                <button class="btn btn-sm" style="background-color: #6c757d; color: white;" onclick="addNotToLearnFromWrongList('${fish.id}', this)">🙈 覚えない</button>
            `;
        } else if (type === "correct") {
            actionButtons = `<button class="btn btn-sm btn-outline" style="color:#e63946; border-color:#e63946;" onclick="removeCorrect('${fish.id}', this)">🤔 忘れた...</button>`;
        } else if (type === "not_learn") {
            actionButtons = `<button class="btn btn-sm btn-success" onclick="removeNotToLearn('${fish.id}', this)">✨ クイズに復活させる</button>`;
        }

        return `
            <div class="fish-detail-card" id="card-${fish.id}">
                <img src="${listImgPath}" class="fish-card-img">
                <div class="fish-card-body">
                    <div class="fish-card-header">
                        <h3>${fish.name}</h3> <span class="fish-card-badge">${fish.category}</span>
                    </div>
                    <p class="fish-card-english">${fish.english || '英名なし'}</p>
                    <p class="fish-card-desc">${fish.description || '解説はありません。'}</p>
                    <div class="fish-card-actions">
                        ${actionButtons}
                        <button class="btn btn-sm btn-fav-toggle ${isFav ? 'active' : ''}" onclick="handleListFavToggle('${fish.id}', this, '${type}')">${isFav ? '⭐ 解除' : '⭐ 保存'}</button>
                    </div>
                </div>
            </div>
        `;
    }).join("");

    navigateTo("list-screen");
}

function addNotToLearnFromWrongList(fishId, btnElement) {
    if (!userNotToLearn.includes(fishId)) userNotToLearn.push(fishId);
    const idx = userWrongs.indexOf(fishId);
    if (idx > -1) userWrongs.splice(idx, 1);
    updateStorage();
    document.getElementById(`card-${fishId}`).remove();
    checkListEmpty();
}

function removeWrong(fishId, btnElement) {
    const idx = userWrongs.indexOf(fishId);
    if (idx > -1) { userWrongs.splice(idx, 1); updateStorage(); document.getElementById(`card-${fishId}`).remove(); checkListEmpty(); }
}
function removeCorrect(fishId, btnElement) {
    const idx = userCorrects.indexOf(fishId);
    if (idx > -1) { userCorrects.splice(idx, 1); updateStorage(); document.getElementById(`card-${fishId}`).remove(); checkListEmpty(); }
}
function removeNotToLearn(fishId, btnElement) {
    const idx = userNotToLearn.indexOf(fishId);
    if (idx > -1) { userNotToLearn.splice(idx, 1); updateStorage(); document.getElementById(`card-${fishId}`).remove(); checkListEmpty(); }
}
function checkListEmpty() {
    const container = document.getElementById("fish-list-container");
    if (container && container.children.length === 0) { container.innerHTML = `<p class="text-center" style="padding:40px 0; color:#868e96;">データがありません。</p>`; }
}
function handleListFavToggle(fishId, btnElement, currentScreenType) {
    toggleFavorite(fishId, null);
    const isNowFav = userFavorites.includes(fishId);
    if (currentScreenType === "fav") { document.getElementById(`card-${fishId}`).remove(); checkListEmpty(); } 
    else { btnElement.className = isNowFav ? "btn btn-sm btn-fav-toggle active" : "btn btn-sm btn-fav-toggle"; btnElement.textContent = isNowFav ? "⭐ 解除" : "⭐ 保存"; }
}

// --- 6. ダッシュボード詳細画面の描画（★タイポバグ修正済） ---
function showDashboardDetail() {
    if (!currentUser) return;

    // 1. 人気度（★1〜★5）別の集計データを算出
    let popStats = { 1: {t:0, c:0}, 2: {t:0, c:0}, 3: {t:0, c:0}, 4: {t:0, c:0}, 5: {t:0, c:0} };
    fishMaster.forEach(f => {
        if (f.popularity >= 1 && f.popularity <= 5) {
            popStats[f.popularity].t++;
            if (userCorrects.includes(f.id)) popStats[f.popularity].c++;
        }
    });

    const popContainer = document.getElementById("detail-pop-stats-container");
    popContainer.innerHTML = [1,2,3,4,5].map(stars => {
        const item = popStats[stars];
        const pct = item.t > 0 ? Math.round((item.c / item.t) * 100) : 0;
        return `
            <div class="stat-row">
                <div class="stat-row-meta">
                    <span>人気度 ★${stars} の魚</span>
                    <span class="stat-row-pct">${item.c} / ${item.t} 習得 (${pct}%)</span>
                </div>
                <div class="progress-bar-container"><div class="progress-bar" style="width: ${pct}%;"></div></div>
            </div>
        `;
    }).join("");

    // 2. 魚の種類（分類別）の集計データを算出
    let catStats = {};
    categoryMaster.forEach(c => { catStats[c.name] = { t: c.count, c: 0 }; });
    fishMaster.forEach(f => {
        if (catStats[f.category]) {
            if (userCorrects.includes(f.id)) catStats[f.category].c++;
        }
    });

    // ★【修正箇所】pctA の計算で catStats[t] になっていた部分を catStats[a].t に正しく修正
    const sortedCatNames = Object.keys(catStats).sort((a,b) => {
        const pctA = catStats[a].t > 0 ? (catStats[a].c / catStats[a].t) : 0;
        const pctB = catStats[b].t > 0 ? (catStats[b].c / catStats[b].t) : 0;
        return pctB - pctA || catStats[b].t - catStats[a].t;
    });

    const catContainer = document.getElementById("detail-cat-stats-container");
    catContainer.innerHTML = sortedCatNames.map(catName => {
        const item = catStats[catName];
        const pct = item.t > 0 ? Math.round((item.c / item.t) * 100) : 0;
        return `
            <div class="stat-row">
                <div class="stat-row-meta">
                    <span>${catName}</span>
                    <span class="stat-row-pct">${item.c} / ${item.t} 習得 (${pct}%)</span>
                </div>
                <div class="progress-bar-container"><div class="progress-bar" style="width: ${pct}%; background: linear-gradient(90deg, #a8dadc, var(--success-color));"></div></div>
            </div>
        `;
    }).join("");

    // 3. チャレンジログの全件詳細描画
    const logFullContainer = document.getElementById("detail-log-full-container");
    if (userLogs.length === 0) {
        logFullContainer.innerHTML = `<p class="empty-log-text">まだチャレンジ履歴ログがありません。</p>`;
    } else {
        logFullContainer.innerHTML = userLogs.map(log => `
            <div class="detailed-log-card">
                <div class="dl-header">
                    <span>📅 ${log.date}</span>
                    <span class="dl-type">${log.type || "クイズ"}</span>
                </div>
                <div class="dl-row">
                    <span class="dl-label">正答率 (スコア):</span>
                    <span class="dl-value" style="color:var(--success-color);">${log.correct} / ${log.total}問 (${log.accuracy || '-%'})</span>
                </div>
                <div class="dl-row">
                    <span class="dl-label">総思考タイム:</span>
                    <span class="dl-value">${log.time}</span>
                </div>
                <div class="dl-row">
                    <span class="dl-label">スコアレート:</span>
                    <span class="dl-value" style="color:var(--primary-color);">⚡ ${log.rate}問 / 10秒</span>
                </div>
                <div class="dl-row">
                    <span class="dl-label">未正解のみモード:</span>
                    <span class="dl-value">${log.unansweredOnly || "OFF"}</span>
                </div>
                <div class="dl-range">
                    ${log.rangeScope ? log.rangeScope.replace(/\n/g, '<br>') : "範囲: 全魚種"}
                </div>
            </div>
        `).join("");
    }

    navigateTo("db-detail-screen");
}

// --- 9. イベントリスナーの一括登録 ---
function setupEventListeners() {
    document.getElementById("login-btn").addEventListener("click", handleLogin);
    
    document.getElementById("sort-count-btn").addEventListener("click", (e) => { switchTab(e.target); renderCategories("count_rank"); });
    document.getElementById("sort-pop-btn").addEventListener("click", (e) => { switchTab(e.target); renderCategories("pop_rank"); });
    document.getElementById("sort-abc-btn").addEventListener("click", (e) => { switchTab(e.target); renderCategories("abc"); });

    document.getElementById("select-all-btn").addEventListener("click", () => {
        document.querySelectorAll("input[name='category']").forEach(cb => cb.checked = true);
    });
    document.getElementById("deselect-all-btn").addEventListener("click", clearFilters);

    document.getElementById("start-quiz-btn").addEventListener("click", startQuiz);
    document.getElementById("next-question-btn").addEventListener("click", handleNextQuestion);
    
    const backToSetupHandler = () => {
        clearInterval(timerInterval); 
        clearFilters(); 
        updateDashboard(); 
        navigateTo("setup-screen");
    };

    document.getElementById("quiz-quit-btn").addEventListener("click", () => {
        if (quizHistory.length === 0) { backToSetupHandler(); } 
        else {
            if (confirm("クイズを中断しますか？\n（『OK』でここまでのリザルトを表示します。'キャンセル'で設定に戻ります）")) { showResult(); } 
            else { backToSetupHandler(); }
        }
    });
    
    document.getElementById("back-to-setup-btn").addEventListener("click", backToSetupHandler);

    document.getElementById("nav-fav-btn").addEventListener("click", () => showListScreen("fav"));
    document.getElementById("nav-wrong-btn").addEventListener("click", () => showListScreen("wrong"));
    document.getElementById("nav-correct-btn").addEventListener("click", () => showListScreen("correct"));
    document.getElementById("nav-not-learn-btn").addEventListener("click", () => showListScreen("not_learn"));
    
    document.getElementById("open-db-detail-btn").addEventListener("click", showDashboardDetail);
    document.getElementById("back-from-db-detail-btn").addEventListener("click", () => {
        const activeTab = document.querySelector(".tab-btn.active").id;
        const sortKey = activeTab.includes("count") ? "count_rank" : activeTab.includes("pop") ? "pop_rank" : "abc";
        renderCategories(sortKey, false);
        updateDashboard();
        navigateTo("setup-screen");
    });

    document.getElementById("back-from-list-btn").addEventListener("click", () => {
        const activeTab = document.querySelector(".tab-btn.active").id;
        const sortKey = activeTab.includes("count") ? "count_rank" : activeTab.includes("pop") ? "pop_rank" : "abc";
        renderCategories(sortKey, false);
        updateDashboard();
        navigateTo("setup-screen");
    });
}

function switchTab(activeTabBtn) {
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
    activeTabBtn.classList.add("active");
}