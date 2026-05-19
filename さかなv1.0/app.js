// --- アプリのグローバル状態（ステート） ---
let isSelectAllMode = false; // 全選択モードのフラグ
let fishMaster = [];       // 魚マスタ（これ一本に統合）
let categoryMaster = [];   // JS側で自動生成する分類マスタ

let currentUser = null;
let userFavorites = [];    // お気に入り
let userWrongs = [];       // 間違えた魚
let userCorrects = [];     // 正解リスト
let userNotToLearn = [];   // 覚えないリスト（システム全体から透明化）
let userLogs = [];         // チャレンジログ

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
let currentQuizSettings = {};

// --- 1. アプリ初期化 ＆ データロード ---
document.addEventListener("DOMContentLoaded", async () => {
    try {
        // ★仕様変更：外部の分類ファイルを廃止し、fish_masterのみを読み込む
        const res = await fetch('fish_master.json');
        fishMaster = await res.json();

        setupEventListeners();
        
        // ログイン前はダミーでカテゴリを構築して描画しておく
        generateCategoryMaster();
        renderCategories("count_rank", true); 
    } catch (error) {
        console.error("データの読み込みに失敗しました:", error);
        alert("マスタデータの読み込みに失敗しました。");
    }
});

// --- 各種ヘルパー ---

function toggleSelectAll() {
    isSelectAllMode = !isSelectAllMode;
    const btn = document.getElementById("select-all-big-btn");
    const container = document.getElementById("category-list-container");

    if (isSelectAllMode) {
        btn.classList.add("active");
        btn.textContent = "✅ すべての分類を選択中（範囲指定なし）";
        container.style.opacity = "0.4";
        container.style.pointerEvents = "none"; // グレーアウト＆クリック不可
    } else {
        btn.classList.remove("active");
        btn.textContent = "✅ すべての分類を選択（範囲指定なし）";
        container.style.opacity = "1";
        container.style.pointerEvents = "auto";
    }
}

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
    userFavorites = users[inputId].favorites || [];
    userWrongs = users[inputId].wrongs || [];
    userCorrects = users[inputId].corrects || [];      
    userNotToLearn = users[inputId].notToLearn || [];  
    userLogs = users[inputId].logs || [];  

    document.getElementById("current-user-id").textContent = currentUser;
    
    // ログイン完了後、マスタデータをユーザーの「覚えないリスト」を除外した状態で再構築
    generateCategoryMaster();
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
    
    generateCategoryMaster(); // 覚えないリストが変動した可能性があるため再構築
    updateDashboard(); 
}

// ★新規追加：fish_master.jsonから動的にカテゴリマスタを生成する
function generateCategoryMaster() {
    const catMap = new Map();
    fishMaster.forEach(f => {
        // 「覚えないリスト」の魚はマスタ集計から完全除外
        if (userNotToLearn.includes(f.id)) return;

        if (!catMap.has(f.category)) {
            catMap.set(f.category, { name: f.category, count: 0, popScore: 0 });
        }
        catMap.get(f.category).count++;
        catMap.get(f.category).popScore += (f.popularity || 0);
    });

    categoryMaster = Array.from(catMap.values()).filter(c => c.count > 0);
    
    // 収録数順ランク
    categoryMaster.sort((a,b) => b.count - a.count);
    categoryMaster.forEach((c, i) => c.count_rank = i);
    // 人気順ランク（科ごとの星の合計）
    categoryMaster.sort((a,b) => b.popScore - a.popScore);
    categoryMaster.forEach((c, i) => c.pop_rank = i);
}

function updateDashboard() {
    if (!currentUser) return;
    
    // 分母となる総数は、fishMaster全体から「覚えない」を除外した数
    const total = fishMaster.filter(f => !userNotToLearn.includes(f.id)).length;
    
    // 「覚えない」に入っている魚は正解数や間違えた数からも除外して計算
    const favCount = userFavorites.filter(id => !userNotToLearn.includes(id)).length;
    const wrongCount = userWrongs.filter(id => !userNotToLearn.includes(id)).length;
    const correctCount = userCorrects.filter(id => !userNotToLearn.includes(id)).length;
    const notLearnCount = userNotToLearn.length;

    document.getElementById("db-total-count").textContent = total;
    document.getElementById("db-correct-count").textContent = correctCount;
    document.getElementById("db-remaining-count").textContent = Math.max(0, total - correctCount);

    const percent = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    document.getElementById("db-progress-percent").textContent = `${percent}%`;
    document.getElementById("db-progress-bar").style.width = `${percent}%`;
    
    document.getElementById("nav-fav-btn").innerHTML = `⭐ お気に入り <small>(${favCount})</small>`;
    document.getElementById("nav-wrong-btn").innerHTML = `❌ 間違えた魚 <small>(${wrongCount})</small>`;
    document.getElementById("nav-correct-btn").innerHTML = `📁 正解リスト <small>(${correctCount})</small>`;

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

    const checkedValues = forceReset ? new Set() : new Set(Array.from(document.querySelectorAll("input[name='category']:checked")).map(el => el.value));

    const favCount = userFavorites.filter(id => !userNotToLearn.includes(id)).length;
    const wrongCount = userWrongs.filter(id => !userNotToLearn.includes(id)).length;

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

// --- 5. クイズ生成アルゴリズム（HARDモード搭載） ---
function startQuiz() {
    const selectedPops = Array.from(document.querySelectorAll("input[name='popularity-filter']:checked")).map(el => parseInt(el.value));
    const selectedCats = Array.from(document.querySelectorAll("input[name='category']:checked")).map(el => el.value);
    
    if (selectedCats.length === 0) { alert("出題するお魚の種類を1つ以上選択してください。"); return; }

    let poolMap = new Map();
    selectedCats.forEach(cat => {
        if (cat === "__FAVORITES__") { fishMaster.forEach(f => { if (userFavorites.includes(f.id)) poolMap.set(f.id, f); }); } 
        else if (cat === "__WRONGS__") { fishMaster.forEach(f => { if (userWrongs.includes(f.id)) poolMap.set(f.id, f); }); } 
        else { fishMaster.forEach(f => { if (f.category === cat) poolMap.set(f.id, f); }); }
    });

    const isUnansweredOnly = document.getElementById("unanswered-only-switch").checked;
    
    function startQuiz() {
    // ... 前略 ...
    const isUnansweredOnly = document.getElementById("unanswered-only-switch").checked;
    

    let selectedCats = [];
    if (isSelectAllMode) {
        selectedCats = ["__ALL__"]; // 全対象フラグ
    } else {
        selectedCats = Array.from(document.querySelectorAll("input[name='category']:checked")).map(el => el.value);
    }
    
    if (selectedCats.length === 0) { alert("出題するお魚の種類を選択するか、すべて選択ボタンを押してください。"); return; }

    let poolMap = new Map();
    if (isSelectAllMode) {
        fishMaster.forEach(f => poolMap.set(f.id, f));
    } else {
        selectedCats.forEach(cat => {
            if (cat === "__FAVORITES__") { fishMaster.forEach(f => { if (userFavorites.includes(f.id)) poolMap.set(f.id, f); }); }
            else if (cat === "__WRONGS__") { fishMaster.forEach(f => { if (userWrongs.includes(f.id)) poolMap.set(f.id, f); }); }
            else { fishMaster.forEach(f => { if (f.category === cat) poolMap.set(f.id, f); }); }
        });
    }


    currentQuizPool = Array.from(poolMap.values()).filter(fish => {
        if (userNotToLearn.includes(fish.id)) return false;
        if (isUnansweredOnly && userCorrects.includes(fish.id)) return false;
        if (selectedPops.length > 0 && !selectedPops.includes(fish.popularity)) return false;
        return true;
    });

    if (currentQuizPool.length === 0) { alert("条件に該当する、出題可能な魚がいません。"); return; }

    selectedChoicesCount = parseInt(document.getElementById("choices-count").value);
    const quizType = document.querySelector("input[name='quiz-type']:checked").value;
    const difficulty = document.querySelector("input[name='quiz-difficulty']:checked").value;
    const reqQuestionsVal = document.getElementById("questions-count-select").value;

    currentQuizSettings = {
        type: quizType === "photo-to-name" ? "📷 写真➔名前" : "📝 名前➔写真",
        difficulty: difficulty.toUpperCase(),
        choiceCount: `${selectedChoicesCount}択`,
        categories: isSelectAllMode ? ["すべて"] : selectedCats.map(c => c === '__FAVORITES__' ? '⭐お気に入り' : c === '__WRONGS__' ? '❌間違えた' : c),
        categories: selectedCats.map(c => c === '__FAVORITES__' ? '⭐お気に入り' : c === '__WRONGS__' ? '❌間違えた' : c),
        popularity: selectedPops.length > 0 ? selectedPops.map(p => `★${p}`) : ["全対象"],
        unansweredOnly: isUnansweredOnly ? "ON" : "OFF"
    };

    const shuffle = (array) => array.sort(() => Math.random() - 0.5);
    let shuffledPool = shuffle([...currentQuizPool]);

    let maxQuestions = reqQuestionsVal === "all" ? shuffledPool.length : parseInt(reqQuestionsVal);
    const totalQuestions = Math.min(maxQuestions, shuffledPool.length);
    quizQuestions = shuffledPool.slice(0, totalQuestions);

    // 誤答生成ロジック
    quizQuestions = quizQuestions.map(correctFish => {
        let dummyPool = [];
        // ★新設：HARDモードなら、まず同じ分類の魚だけを抽出
        if (difficulty === "hard") {
            dummyPool = fishMaster.filter(f => f.category === correctFish.category && f.id !== correctFish.id && !userNotToLearn.includes(f.id));
            dummyPool = shuffle(dummyPool);
        } else {
            // EASYなら設定されたプールから
            dummyPool = currentQuizPool.filter(f => f.id !== correctFish.id);
            dummyPool = shuffle(dummyPool);
        }
        
        // 足りない場合は全体マスタからランダム補充
        if (dummyPool.length < selectedChoicesCount - 1) {
            const extraDummies = fishMaster.filter(f => f.id !== correctFish.id && !userNotToLearn.includes(f.id) && !dummyPool.some(d => d.id === f.id));
            dummyPool = dummyPool.concat(shuffle(extraDummies));
        }

        const finalDummies = dummyPool.slice(0, selectedChoicesCount - 1);
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
    document.getElementById("feedback-wrong-choices-wrapper").style.display = "none";
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
            btn.dataset.fishId = c.fish.id;
            btn.onclick = () => handleAnswer(c.fish, btn); choicesContainer.appendChild(btn);
        });
    } else {
        imgContainer.style.display = "none"; textContainer.style.display = "block";
        document.getElementById("question-fish-name").textContent = q.correct.name;
        q.choices.forEach(c => {
            const btn = document.createElement("button"); btn.className = "btn btn-choice"; 
            btn.innerHTML = `<img src="${c.imagePath}">`;
            btn.dataset.fishId = c.fish.id;
            btn.dataset.fishName = c.fish.name;
            btn.onclick = () => handleAnswer(c.fish, btn); choicesContainer.appendChild(btn);
        });
    }
}

function handleAnswer(selectedChoice, clickedBtn) {
    clearInterval(timerInterval);
    const q = quizQuestions[currentQuestionIdx];
    const isCorrect = selectedChoice.id === q.correct.id;
    quizHistory.push({ fish: q.correct, isCorrect: isCorrect, shownImage: q.correctImage });

    const choicesBtns = document.getElementById("quiz-choices-container").querySelectorAll(".btn-choice");
    
    // ★新設：ボタンの色付け＆名前バッジ付与ロジック
    choicesBtns.forEach(btn => {
        btn.disabled = true;
        const fishId = btn.dataset.fishId;
        if (fishId === q.correct.id) {
            btn.classList.add("correct-border");
            if (q.type === "name-to-photo") btn.innerHTML += `<div class="choice-overlay-badge">⭕ ${btn.dataset.fishName}</div>`;
        } else {
            btn.classList.add("incorrect-border");
            if (q.type === "name-to-photo") btn.innerHTML += `<div class="choice-overlay-badge">${btn.dataset.fishName}</div>`;
        }
    });

    const fbContainer = document.getElementById("quiz-feedback-container");
    const fbIcon = document.getElementById("feedback-icon");
    const fbText = document.getElementById("feedback-text");

    if (isCorrect) {
        currentScore++; fbContainer.className = "card feedback-card correct"; fbIcon.textContent = "⭕"; fbText.textContent = "正解！";
        if (!userCorrects.includes(q.correct.id)) { userCorrects.push(q.correct.id); updateStorage(); }
    } else {
        fbContainer.className = "card feedback-card incorrect"; fbIcon.textContent = "❌"; fbText.textContent = "不正解...";
        if (!userWrongs.includes(q.correct.id)) { userWrongs.push(q.correct.id); updateStorage(); }
    }

    // ★新設：解説文の改行対応
    document.getElementById("feedback-fish-name").textContent = q.correct.name;
    document.getElementById("feedback-fish-english").textContent = q.correct.english || "英名情報なし";
    document.getElementById("feedback-fish-desc").innerHTML = (q.correct.description || "解説はありません。").replace(/\n/g, '<br>');

    // ★新設：フィードバック内アクションボタンのデータ紐付けと描画
    setupFeedbackActionButtons(q.correct, isCorrect);

    // ★新設：写真➔名前モードの誤答画像をミニ表示
    if (q.type === "photo-to-name") {
        const wrongWrapper = document.getElementById("feedback-wrong-choices-wrapper");
        const wrongContainer = document.getElementById("feedback-wrong-choices-container");
        const wrongs = q.choices.filter(c => c.fish.id !== q.correct.id);
        wrongContainer.innerHTML = wrongs.map(w => `
            <div class="wrong-mini-card">
                <img src="${w.imagePath}">
                <div class="wrong-mini-name">${w.fish.name}</div>
            </div>
        `).join("");
        wrongWrapper.style.display = "block";
    }

    fbContainer.style.display = "block"; 
    document.getElementById("next-question-btn").style.display = "block";
}

function setupFeedbackActionButtons(fish, isCorrect) {
    const favBtn = document.getElementById("feedback-fav-btn");
    const notLearnBtn = document.getElementById("feedback-not-learn-btn");
    const confWrapper = document.getElementById("feedback-confidence-wrapper");
    const confCheck = document.getElementById("feedback-confidence-check");

    const isFav = userFavorites.includes(fish.id);
    const isNotLearn = userNotToLearn.includes(fish.id);

    favBtn.className = isFav ? "btn-fav active" : "btn-fav";
    favBtn.textContent = isFav ? "★" : "☆";
    favBtn.onclick = () => { toggleFavorite(fish.id, favBtn); };

    notLearnBtn.className = isNotLearn ? "btn-not-learn active" : "btn-not-learn";
    notLearnBtn.onclick = () => { toggleNotToLearn(fish.id, notLearnBtn); };

    if (isCorrect) {
        confWrapper.style.display = "inline-flex";
        confCheck.checked = !userCorrects.includes(fish.id);
        confCheck.onchange = () => { toggleConfidence(fish.id, confCheck); };
    } else {
        confWrapper.style.display = "none";
    }
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
       const newLogItem = {
         date: logDateStr,
         total: totalPlayed,
         correct: currentScore,
         accuracy: `${percent}%`,
         choiceCount: currentQuizSettings.choiceCount, // ★追加
         time: `${seconds}秒`,
         rate: speedRate,
        type: `${currentQuizSettings.type} [${currentQuizSettings.difficulty}]`,
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

// リストトグル関数群
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
    const itemRows = document.querySelectorAll(`#result-item-${fishId}`);
    if (idx > -1) { 
        userNotToLearn.splice(idx, 1); 
        btnElement.classList.remove("active"); 
        itemRows.forEach(row => row.classList.remove("muted-row"));
    } else { 
        userNotToLearn.push(fishId); 
        btnElement.classList.add("active"); 
        itemRows.forEach(row => row.classList.add("muted-row"));
        
        // 覚えないリストに入れたら、未正解リストなどからも消す
        const wIdx = userWrongs.indexOf(fishId);
        if(wIdx > -1) userWrongs.splice(wIdx, 1);
    }
    updateStorage();
}

// --- 8. 各種一覧データ画面の描画 ---
function showListScreen(type) {
    const titleEl = document.getElementById("list-screen-title");
    const container = document.getElementById("fish-list-container");
    
    let targetIds = type === "fav" ? userFavorites : type === "wrong" ? userWrongs : type === "correct" ? userCorrects : userNotToLearn;
    titleEl.textContent = type === "fav" ? "⭐ お気に入りの魚" : type === "wrong" ? "❌ 間違えた魚" : type === "correct" ? "📁 正解した魚のリスト" : "🙈 登場させないリスト";

    // 覚えないリストページ以外は、透明化処理を施したあとの配列を使う
    if(type !== "not_learn") {
        targetIds = targetIds.filter(id => !userNotToLearn.includes(id));
    }

    if (targetIds.length === 0) {
        container.innerHTML = `<p class="empty-log-text" style="padding:40px 0;">データがありません。</p>`;
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
                <button class="btn btn-sm btn-success" onclick="removeWrong('${fish.id}', this)">✅ 覚えた</button>
                <button class="btn btn-sm" style="background-color: #718096; color: white;" onclick="addNotToLearnFromWrongList('${fish.id}', this)">🙈 覚えない</button>
            `;
        } else if (type === "correct") {
            actionButtons = `<button class="btn btn-sm btn-outline" style="color:var(--error-color); border-color:var(--error-color);" onclick="removeCorrect('${fish.id}', this)">🤔 忘れた</button>`;
        } else if (type === "not_learn") {
            actionButtons = `<button class="btn btn-sm btn-success" onclick="removeNotToLearnFromList('${fish.id}', this)">✨ 復活させる</button>`;
        }

        return `
            <div class="fish-detail-card" id="card-${fish.id}">
                <img src="${listImgPath}" class="fish-card-img">
                <div class="fish-card-body">
                    <div class="fish-card-header">
                        <h3>${fish.name}</h3> <span class="fish-card-badge">${fish.category}</span>
                    </div>
                    <p class="fish-card-english">${fish.english || '英名なし'} / ★${fish.popularity || 0}</p>
                    <p class="fish-card-desc">${(fish.description || '解説はありません。').replace(/\n/g, '<br>')}</p>
                    <div class="fish-card-actions">
                        ${actionButtons}
                        <button class="btn-fav ${isFav ? 'active' : ''}" onclick="handleListFavToggle('${fish.id}', this, '${type}')">${isFav ? '★' : '☆'}</button>
                    </div>
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
function removeNotToLearnFromList(fishId, btnElement) {
    const idx = userNotToLearn.indexOf(fishId);
    if (idx > -1) { userNotToLearn.splice(idx, 1); updateStorage(); document.getElementById(`card-${fishId}`).remove(); checkListEmpty(); }
}
function checkListEmpty() {
    const container = document.getElementById("fish-list-container");
    if (container && container.children.length === 0) { container.innerHTML = `<p class="empty-log-text" style="padding:40px 0;">データがありません。</p>`; }
}
function handleListFavToggle(fishId, btnElement, currentScreenType) {
    toggleFavorite(fishId, null);
    const isNowFav = userFavorites.includes(fishId);
    if (currentScreenType === "fav") { 
        document.getElementById(`card-${fishId}`).remove(); 
        checkListEmpty(); 
    } else { 
        // テキストではなく、★とクラスを切り替える
        btnElement.className = isNowFav ? "btn-fav active" : "btn-fav"; 
        btnElement.textContent = isNowFav ? "★" : "☆"; 
    }
}

// --- 9. ダッシュボード詳細統計画面の描画 ---
function showDashboardDetail() {
    if (!currentUser) return;

    let popStats = { 1: {t:0, c:0}, 2: {t:0, c:0}, 3: {t:0, c:0}, 4: {t:0, c:0}, 5: {t:0, c:0} };
    fishMaster.forEach(f => {
        if (userNotToLearn.includes(f.id)) return;
        if (f.popularity >= 1 && f.popularity <= 5) {
            popStats[f.popularity].t++;
            if (userCorrects.includes(f.id)) popStats[f.popularity].c++;
        }
    });

    const popContainer = document.getElementById("detail-pop-stats-container");
    popContainer.innerHTML = [5,4,3,2,1].map(stars => {
        const item = popStats[stars];
        if (item.t === 0) return "";
        const pct = Math.round((item.c / item.t) * 100);
        return `
            <div class="stat-row">
                <div class="stat-row-meta"><span>人気度 ★${stars} の魚</span><span class="stat-row-pct">${item.c} / ${item.t} (${pct}%)</span></div>
                <div class="progress-bar-container"><div class="progress-bar" style="width: ${pct}%;"></div></div>
            </div>
        `;
    }).join("");

    let catStats = {};
    categoryMaster.forEach(c => { catStats[c.name] = { t: c.count, c: 0 }; });
    fishMaster.forEach(f => {
        if (userNotToLearn.includes(f.id)) return;
        if (catStats[f.category]) {
            if (userCorrects.includes(f.id)) catStats[f.category].c++;
        }
    });

    const sortedCatNames = Object.keys(catStats).sort((a,b) => {
        const pctA = catStats[a].t > 0 ? (catStats[a].c / catStats[a].t) : 0;
        const pctB = catStats[b].t > 0 ? (catStats[b].c / catStats[b].t) : 0;
        return pctB - pctA || catStats[b].t - catStats[a].t;
    });

    const catContainer = document.getElementById("detail-cat-stats-container");
    catContainer.innerHTML = sortedCatNames.map(catName => {
        const item = catStats[catName];
        if (item.t === 0) return "";
        const pct = Math.round((item.c / item.t) * 100);
        return `
            <div class="stat-row">
                <div class="stat-row-meta"><span>${catName}</span><span class="stat-row-pct">${item.c} / ${item.t} (${pct}%)</span></div>
                <div class="progress-bar-container"><div class="progress-bar" style="width: ${pct}%; background: linear-gradient(90deg, #81e6d9, var(--success-color));"></div></div>
            </div>
        `;
    }).join("");

    const logFullContainer = document.getElementById("detail-log-full-container");
    if (userLogs.length === 0) {
        logFullContainer.innerHTML = `<p class="empty-log-text">まだチャレンジ履歴ログがありません。</p>`;
    } else {
        logFullContainer.innerHTML = userLogs.map(log => `
            <div class="detailed-log-card">
                <div class="dl-header"><span>📅 ${log.date}</span><span class="dl-type">${log.type || "クイズ"}</span></div>
                <div class="dl-row"><span class="dl-label">正答率:</span><span class="dl-value" style="color:var(--success-color);">${log.correct}/${log.total}問 (${log.accuracy})</span></div>
                <div class="dl-row"><span class="dl-label">出題数/選択肢:</span><span class="dl-value">${log.total}問 / ${log.choiceCount}</span></div>
                <div class="dl-row"><span class="dl-label">思考タイム:</span><span class="dl-value">${log.time}</span></div>
                <div class="dl-row"><span class="dl-label">レート:</span><span class="dl-value" style="color:var(--primary-color);">⚡ ${log.rate}問 / 10秒</span></div>
                <div class="dl-row"><span class="dl-label">未正解のみ:</span><span class="dl-value">${log.unansweredOnly}</span></div>
                <div class="dl-range">${log.rangeScope ? log.rangeScope.replace(/\n/g, '<br>') : "範囲: 全魚種"}</div>
            </div>
        `).join("");
    }

    navigateTo("db-detail-screen");
}

// --- 10. ★新規追加：魚図鑑・検索画面の制御 ---
function initSearchScreen() {
    const catSelect = document.getElementById("search-category-select");
    let options = `<option value="all">すべての分類</option>`;
    categoryMaster.forEach(c => { options += `<option value="${c.name}">${c.name} (${c.count})</option>`; });
    catSelect.innerHTML = options;

    renderSearchResults();
    navigateTo("search-screen");
}

function renderSearchResults() {
    const keyword = document.getElementById("search-keyword-input").value.trim().toLowerCase();
    const selectedCat = document.getElementById("search-category-select").value;
    const selectedPop = document.getElementById("search-popularity-select").value;

    const results = fishMaster.filter(f => {
        if (userNotToLearn.includes(f.id)) return false;

        let match = true;
        if (keyword) {
            const isNameMatch = f.name && f.name.toLowerCase().includes(keyword);
            const isEngMatch = f.english && f.english.toLowerCase().includes(keyword);
            const isDescMatch = f.description && f.description.toLowerCase().includes(keyword);
            if (!isNameMatch && !isEngMatch && !isDescMatch) match = false;
        }
        if (selectedCat !== "all" && f.category !== selectedCat) match = false;
        if (selectedPop !== "all" && String(f.popularity) !== selectedPop) match = false;
        
        return match;
    });

    document.getElementById("search-count-display").textContent = results.length;
    const container = document.getElementById("search-results-container");

    if (results.length === 0) {
        container.innerHTML = `<p class="empty-log-text" style="padding:40px 0;">条件に合致する魚が見つかりません。</p>`;
        return;
    }

    container.innerHTML = results.map(fish => {
        const isFav = userFavorites.includes(fish.id);
        const isCorrect = userCorrects.includes(fish.id);
        return `
            <div class="fish-detail-card" id="search-card-${fish.id}">
                <img src="${getDisplayImageForList(fish)}" class="fish-card-img">
                <div class="fish-card-body">
                    <div class="fish-card-header">
                        <h3>${fish.name} ${isCorrect ? '<span style="font-size:0.8rem; color:var(--success-color);">⭕</span>' : ''}</h3> 
                        <span class="fish-card-badge">${fish.category}</span>
                    </div>
                    <p class="fish-card-english">${fish.english || '英名なし'} / ★${fish.popularity || 0}</p>
                   <p class="fish-card-desc">${(fish.description || '').replace(/\n/g, '<br>')}</p>
                    <div class="fish-card-actions">
                        <button class="btn-fav ${isFav ? 'active' : ''}" onclick="toggleFavorite('${fish.id}', this)">${isFav ? '★' : '☆'}</button>
                        <button class="btn-not-learn" style="font-size:1.4rem; padding:2px;" onclick="addNotToLearnFromSearch('${fish.id}', this)">🙈</button>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

function addNotToLearnFromSearch(fishId, btnElement) {
    if (!userNotToLearn.includes(fishId)) userNotToLearn.push(fishId);
    updateStorage();
    document.getElementById(`search-card-${fishId}`).remove();
    renderSearchResults(); // カウント更新のため再描画
}

// --- 11. イベントリスナーの一括登録 ---
function setupEventListeners() {
    document.getElementById("login-btn").addEventListener("click", handleLogin);
    document.getElementById("select-all-big-btn").addEventListener("click", toggleSelectAll);
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
            if (confirm("クイズを中断しますか？\n（『OK』でここまでのリザルトを表示します）")) { showResult(); } 
            else { backToSetupHandler(); }
        }
    });
    
    document.getElementById("back-to-setup-btn").addEventListener("click", backToSetupHandler);

    document.getElementById("nav-fav-btn").addEventListener("click", () => showListScreen("fav"));
    document.getElementById("nav-wrong-btn").addEventListener("click", () => showListScreen("wrong"));
    document.getElementById("nav-correct-btn").addEventListener("click", () => showListScreen("correct"));
    document.getElementById("nav-not-learn-btn").addEventListener("click", () => showListScreen("not_learn"));
    document.getElementById("nav-search-btn").addEventListener("click", initSearchScreen);
    
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

    document.getElementById("back-from-search-btn").addEventListener("click", () => {
        const activeTab = document.querySelector(".tab-btn.active").id;
        const sortKey = activeTab.includes("count") ? "count_rank" : activeTab.includes("pop") ? "pop_rank" : "abc";
        renderCategories(sortKey, false);
        updateDashboard();
        navigateTo("setup-screen");
    });

    // 検索画面のリアルタイムイベント
    document.getElementById("search-keyword-input").addEventListener("input", renderSearchResults);
    document.getElementById("search-category-select").addEventListener("change", renderSearchResults);
    document.getElementById("search-popularity-select").addEventListener("change", renderSearchResults);
}

function switchTab(activeTabBtn) {
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
    activeTabBtn.classList.add("active");
}
