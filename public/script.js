// 本番環境のAPIベースURLを自動検出
const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : '/api';

// グローバル変数
let uploadedFiles = [];
let pastExamFiles = [];
let materialFiles = [];
let currentMode = 'review';
let savedSubjects = [];
let currentQuestionsData = [];
let aiChatOpen = false;

// LocalStorage管理
function loadSubjects() {
    const stored = localStorage.getItem('sakumon_subjects');
    if (stored) {
        savedSubjects = JSON.parse(stored);
        updateSubjectSelect();
    }
}

function saveSubjects() {
    localStorage.setItem('sakumon_subjects', JSON.stringify(savedSubjects));
}

function updateSubjectSelect() {
    const select = document.getElementById('subjectSelect');
    // 既存の選択肢を削除（最初の「新規追加」以外）
    while (select.children.length > 1) {
        select.removeChild(select.lastChild);
    }
    
    // 保存された教科を追加
    savedSubjects.forEach(subject => {
        const option = document.createElement('option');
        option.value = subject;
        option.textContent = subject;
        select.appendChild(option);
    });
}

// モード切り替え
document.querySelectorAll('.mode-card').forEach(card => {
    card.addEventListener('click', function() {
        document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('active'));
        this.classList.add('active');
        currentMode = this.dataset.mode;
        updateModeDisplay();
    });
});

function updateModeDisplay() {
    const reviewSettings = document.getElementById('reviewSettings');
    const yamabariSettings = document.getElementById('yamabariSettings');
    const reviewUpload = document.getElementById('reviewUpload');
    
    if (currentMode === 'review') {
        reviewSettings.classList.remove('hide');
        yamabariSettings.classList.remove('show');
        reviewUpload.style.display = 'block';
        updateUploadAreaText();
    } else {
        reviewSettings.classList.add('hide');
        yamabariSettings.classList.add('show');
        reviewUpload.style.display = 'none';
    }
}

function updateUploadAreaText() {
    const uploadArea = document.getElementById('reviewUpload');
    const icon = uploadArea.querySelector('.upload-icon');
    const title = uploadArea.querySelector('h3');
    const desc = uploadArea.querySelector('p');

    if (currentMode === 'review') {
        icon.textContent = '📖';
        title.textContent = '授業資料をアップロードしてください';
        desc.textContent = 'PDF、画像（PNG、JPG）、テキストファイルに対応';
    }
}

// 教科選択の管理
document.getElementById('subjectSelect').addEventListener('change', function() {
    const newSubjectInput = document.getElementById('newSubjectInput');
    if (this.value === 'new') {
        newSubjectInput.style.display = 'block';
        newSubjectInput.focus();
    } else {
        newSubjectInput.style.display = 'none';
    }
});

document.getElementById('newSubjectInput').addEventListener('blur', function() {
    const subjectName = this.value.trim();
    if (subjectName && !savedSubjects.includes(subjectName)) {
        savedSubjects.push(subjectName);
        saveSubjects();
        updateSubjectSelect();
        
        // 新しく追加した教科を選択状態にする
        document.getElementById('subjectSelect').value = subjectName;
        this.style.display = 'none';
        this.value = '';
    }
});

// 結果表示のタブ切り替え
document.addEventListener('DOMContentLoaded', function() {
    const tabs = document.querySelectorAll('.result-tab');
    const panels = document.querySelectorAll('.result-panel');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const targetTab = this.dataset.tab;
            
            // アクティブタブの切り替え
            tabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // パネルの切り替え
            panels.forEach(panel => {
                panel.classList.remove('active');
                if (panel.id === targetTab + 'Panel') {
                    panel.classList.add('active');
                }
            });
        });
    });
    
    // 初期化
    loadSubjects();
    
    // 復習機能の初期化
    setTimeout(() => {
        initializeReviewHistory();
    }, 200);
});

// ファイル処理
const fileInput = document.getElementById('fileInput');
const pastExamInput = document.getElementById('pastExamInput');
const materialInput = document.getElementById('materialInput');
const uploadArea = document.getElementById('reviewUpload');

// 復習モード用ファイル処理
fileInput.addEventListener('change', (e) => handleFiles(e, 'main'));

// じっくり対策モード用ファイル処理
pastExamInput.addEventListener('change', (e) => handleFiles(e, 'pastExam'));
materialInput.addEventListener('change', (e) => handleFiles(e, 'material'));

// ドラッグ&ドロップ（復習モード用）
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    handleFiles({ target: { files: e.dataTransfer.files } }, 'main');
});

function handleFiles(event, type) {
    const files = Array.from(event.target.files);
    
    files.forEach(file => {
        if (file.type.includes('text') || file.type.includes('pdf') || file.type.includes('image')) {
            switch(type) {
                case 'main':
                    uploadedFiles.push(file);
                    break;
                case 'pastExam':
                    pastExamFiles.push(file);
                    break;
                case 'material':
                    materialFiles.push(file);
                    break;
            }
        }
    });
    
    updateFileList(type);
    updateGenerateButton();
}

function updateFileList(type) {
    let fileArray, listElement;
    
    switch(type) {
        case 'main':
            fileArray = uploadedFiles;
            listElement = document.getElementById('fileList');
            break;
        case 'pastExam':
            fileArray = pastExamFiles;
            listElement = document.getElementById('pastExamList');
            break;
        case 'material':
            fileArray = materialFiles;
            listElement = document.getElementById('materialList');
            break;
    }
    
    listElement.innerHTML = '';
    fileArray.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.innerHTML = `
            <div class="file-info">
                <span class="file-icon">${getFileIcon(file.type)}</span>
                <span>${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB)</span>
            </div>
            <button class="remove-btn" onclick="removeFile('${type}', ${index})">削除</button>
        `;
        listElement.appendChild(fileItem);
    });
}

function removeFile(type, index) {
    switch(type) {
        case 'main':
            uploadedFiles.splice(index, 1);
            break;
        case 'pastExam':
            pastExamFiles.splice(index, 1);
            break;
        case 'material':
            materialFiles.splice(index, 1);
            break;
    }
    
    updateFileList(type);
    updateGenerateButton();
}

function getFileIcon(type) {
    if (type.includes('pdf')) return '📄';
    if (type.includes('image')) return '🖼️';
    if (type.includes('text')) return '📝';
    return '📁';
}

function updateGenerateButton() {
    const generateBtn = document.getElementById('generateBtn');
    
    if (currentMode === 'review') {
        // 復習モード：ファイルまたはテキストがあればOK
        const hasFiles = uploadedFiles.length > 0;
        const hasText = document.getElementById('additionalText').value.trim().length > 0;
        generateBtn.disabled = !(hasFiles || hasText);
    } else {
        // じっくり対策モード：過去問が必須
        generateBtn.disabled = pastExamFiles.length === 0;
    }
}

// テキスト入力の監視
document.getElementById('additionalText').addEventListener('input', updateGenerateButton);

function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.textContent = message;
    errorDiv.classList.add('show');
    setTimeout(() => {
        errorDiv.classList.remove('show');
    }, 5000);
}

// 四択問題の表示フォーマット関数
function formatQuestionDisplay(question, showAnswer = false) {
    const isMultipleChoice = question.question.includes('A)') && 
                            question.question.includes('B)') && 
                            question.question.includes('C)') && 
                            question.question.includes('D)');
    
    if (isMultipleChoice) {
        const parts = question.question.split(/\n(?=[A-D]\))/);
        const questionText = parts[0];
        const choices = parts.slice(1);
        
        let formattedQuestion = `<div class="question-text" style="margin-bottom: 25px; font-size: 1.1rem; line-height: 1.6;">${questionText}</div>`;
        
        if (choices.length > 0) {
            formattedQuestion += '<div class="choices-container" style="margin: 25px 0; padding: 25px; background: #f8f9fa; border-radius: 12px; border: 2px solid #e9ecef;">';
            
            choices.forEach((choice, index) => {
                const choiceLetter = choice.match(/^[A-D]\)/)?.[0] || '';
                const choiceText = choice.replace(/^[A-D]\)\s*/, '');
                const isCorrect = question.answer.includes(choiceLetter);
                
                const correctStyle = showAnswer && isCorrect ? 
                    'background: linear-gradient(135deg, #d4edda, #c3e6cb); border-left: 4px solid #27ae60; box-shadow: 0 2px 4px rgba(39, 174, 96, 0.2);' : 
                    'background: white; border: 1px solid #dee2e6; transition: all 0.2s ease;';
                
                const hoverEffect = showAnswer && isCorrect ? '' : 'onmouseover="this.style.background=\'#f0f8ff\'; this.style.borderColor=\'#3498db\';" onmouseout="this.style.background=\'white\'; this.style.borderColor=\'#dee2e6\';"';
                
                formattedQuestion += `
                    <div class="choice-option" style="
                        padding: 15px 20px; 
                        margin: 12px 0; 
                        border-radius: 10px; 
                        ${correctStyle}
                        display: flex;
                        align-items: flex-start;
                        gap: 12px;
                        line-height: 1.6;
                        cursor: pointer;
                        min-height: 50px;
                    " ${hoverEffect}>
                        <span style="
                            font-weight: bold; 
                            color: ${showAnswer && isCorrect ? '#27ae60' : '#495057'}; 
                            font-size: 1.2rem;
                            min-width: 25px;
                            ${showAnswer && isCorrect ? 'text-shadow: 0 1px 2px rgba(0,0,0,0.1);' : ''}
                        ">${choiceLetter}</span>
                        <span style="
                            color: ${showAnswer && isCorrect ? '#155724' : '#495057'}; 
                            font-weight: ${showAnswer && isCorrect ? '500' : 'normal'};
                            flex: 1;
                            font-size: 1rem;
                            line-height: 1.5;
                        ">${choiceText}</span>
                        ${showAnswer && isCorrect ? '<span style="color: #27ae60; font-weight: bold; margin-left: auto; font-size: 1.1rem;">✓ 正解</span>' : ''}
                    </div>
                `;
            });
            
            formattedQuestion += '</div>';
            
            if (!showAnswer) {
                formattedQuestion += `
                    <div style="
                        background: linear-gradient(135deg, #fff3cd, #ffeaa7); 
                        border-left: 4px solid #f39c12; 
                        padding: 15px 20px; 
                        border-radius: 10px; 
                        margin-top: 20px;
                        font-size: 0.95rem;
                        color: #856404;
                        line-height: 1.5;
                    ">
                        💡 まず自分で答えを考えてから「解説を見る」ボタンを押してください
                    </div>
                `;
            }
        }
        
        return formattedQuestion;
    } else {
        return `<div class="question-text" style="line-height: 1.6; font-size: 1.1rem;">${question.question}</div>`;
    }
}

// AI問題生成
async function generateContent() {
    // バリデーション
    if (currentMode === 'review') {
        const subjectSelect = document.getElementById('subjectSelect');
        const newSubjectInput = document.getElementById('newSubjectInput');
        
        if (subjectSelect.value === 'new' && !newSubjectInput.value.trim()) {
            showError('教科名を入力してください');
            return;
        }
        
        if (uploadedFiles.length === 0 && !document.getElementById('additionalText').value.trim()) {
            showError('ファイルをアップロードするか、テキストを入力してください');
            return;
        }
    } else {
        if (pastExamFiles.length === 0) {
            showError('過去問ファイルをアップロードしてください');
            return;
        }
        
        if (!document.getElementById('yamabariSubject').value.trim()) {
            showError('教科名を入力してください');
            return;
        }
    }

    const loading = document.getElementById('loading');
    const results = document.getElementById('results');
    const generateBtn = document.getElementById('generateBtn');
    
    loading.classList.add('show');
    results.classList.remove('show');
    generateBtn.disabled = true;

    try {
        const formData = new FormData();
        formData.append('mode', currentMode);
        
        // 設定情報を送信
        if (currentMode === 'review') {
            const subject = document.getElementById('subjectSelect').value === 'new' 
                ? document.getElementById('newSubjectInput').value.trim()
                : document.getElementById('subjectSelect').value;
            
            formData.append('subject', subject);
            formData.append('questionCount', document.getElementById('questionCount').value);
            formData.append('difficulty', document.getElementById('difficulty').value);
            formData.append('questionType', document.getElementById('questionType').value);
            
            // ファイル追加
            uploadedFiles.forEach((file) => {
                formData.append('files', file);
            });
        } else {
            formData.append('subject', document.getElementById('yamabariSubject').value.trim());
            formData.append('questionCount', document.getElementById('yamabariQuestionCount').value);
            formData.append('difficulty', document.getElementById('yamabaridifficulty').value);
            formData.append('questionType', document.getElementById('yamabariQuestionType').value);
            
            // 過去問ファイル
            pastExamFiles.forEach((file) => {
                formData.append('pastExamFiles', file);
            });
            
            // 教材ファイル（任意）
            materialFiles.forEach((file) => {
                formData.append('materialFiles', file);
            });
        }
        
        // 追加テキスト
        const additionalText = document.getElementById('additionalText').value.trim();
        if (additionalText) {
            formData.append('additionalText', additionalText);
        }

        console.log('サーバーに送信中...');
        
        const response = await fetch(`${API_BASE_URL}/generate`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `サーバーエラー: ${response.status}`);
        }

        const result = await response.json();
        console.log('AI処理完了:', result);

        if (result.success) {
            showResults(result.data, currentMode);
            
            // LocalStorageに履歴保存
            saveQuizHistory(result.data);
        } else {
            throw new Error(result.error || '不明なエラーが発生しました');
        }
        
    } catch (error) {
        console.error('エラー:', error);
        showError('AI処理中にエラーが発生しました: ' + error.message);
    } finally {
        loading.classList.remove('show');
        generateBtn.disabled = false;
    }
}

function saveQuizHistory(data) {
    if (currentMode !== 'review') return;
    
    const subject = document.getElementById('subjectSelect').value === 'new' 
        ? document.getElementById('newSubjectInput').value.trim()
        : document.getElementById('subjectSelect').value;
    
    const historyData = {
        id: 'quiz_' + Date.now(),
        timestamp: new Date().toISOString(),
        subject: subject,
        mode: currentMode,
        settings: {
            questionCount: document.getElementById('questionCount').value,
            difficulty: document.getElementById('difficulty').value,
            questionType: document.getElementById('questionType').value
        },
        data: data
    };
    
    const existingHistory = JSON.parse(localStorage.getItem('sakumon_quiz_history') || '[]');
    existingHistory.push(historyData);
    
    if (existingHistory.length > 50) {
        existingHistory.splice(0, existingHistory.length - 50);
    }
    
    localStorage.setItem('sakumon_quiz_history', JSON.stringify(existingHistory));
}

function showResults(data, mode) {
    const resultsContainer = document.getElementById('results');
    
    try {
        let questionsHtml = '';
        let summaryHtml = '';
        
        if (data.raw_response) {
            questionsHtml = `<div class="answer">${data.raw_response.replace(/\n/g, '<br>')}</div>`;
            summaryHtml = questionsHtml;
        } else if (mode === 'review') {
            // 問題データを保存
            currentQuestionsData = data.questions || [];
            
            if (data.questions) {
                data.questions.forEach((q, i) => {
                    const formattedQuestion = formatQuestionDisplay(q, false);
                    const questionIcon = q.question.includes('A)') ? '📝' : '✏️';
                    
                    questionsHtml += `
                        <div class="question">
                            <div class="question-header">
                                <div class="question-title">${questionIcon} 問題 ${i + 1}</div>
                                <button class="explanation-toggle" onclick="toggleExplanation(${i})">
                                    💡 解説を見る
                                </button>
                            </div>
                            <div class="question-content" id="question-content-${i}">
                                ${formattedQuestion}
                            </div>
                            <div class="explanation-content" id="explanation-${i}">
                                <h4>解答・解説</h4>
                                <div style="background: #e8f5e8; padding: 12px; border-radius: 6px; margin-bottom: 10px;">
                                    <p><strong>🎯 正解:</strong> ${q.answer}</p>
                                </div>
                                <div style="background: #f0f8ff; padding: 12px; border-radius: 6px;">
                                    <p><strong>📚 解説:</strong> ${q.explanation}</p>
                                </div>
                            </div>
                        </div>
                    `;
                });
            }
            
            if (data.summary) {
                summaryHtml = `<div class="answer">${data.summary.replace(/\n/g, '<br>')}</div>`;
            }
        } else {
            // じっくり対策の表示
            if (data.analysis) {
                questionsHtml += `
                    <div class="answer">
                        <h4>関連性分析</h4>
                        <p>${data.analysis.replace(/\n/g, '<br>')}</p>
                    </div>
                `;
            }
            
            if (data.predictions) {
                data.predictions.forEach((p, i) => {
                    const formattedQuestion = formatQuestionDisplay(p, false);
                    questionsHtml += `
                        <div class="question">
                            <div class="question-header">
                                <div class="question-title">予想問題 ${i + 1}</div>
                                <button class="explanation-toggle" onclick="toggleExplanation(${i})">
                                    💡 解説を見る
                                </button>
                            </div>
                            <div class="question-content" id="question-content-${i}">
                                ${formattedQuestion}
                            </div>
                            <div class="explanation-content" id="explanation-${i}">
                                <h4>解説・予想理由</h4>
                                <p>${p.explanation}</p>
                            </div>
                        </div>
                    `;
                });
            }
            
            if (data.notes) {
                summaryHtml = `<div class="answer">${data.notes.replace(/\n/g, '<br>')}</div>`;
            }
        }

        document.getElementById('questionsContent').innerHTML = questionsHtml;
        document.getElementById('summaryContent').innerHTML = summaryHtml;
        
        resultsContainer.classList.add('show');
        
        document.querySelectorAll('.result-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.result-panel').forEach(panel => panel.classList.remove('active'));
        document.querySelector('.result-tab[data-tab="questions"]').classList.add('active');
        document.getElementById('questionsPanel').classList.add('active');
        
    } catch (error) {
        console.error('結果表示エラー:', error);
        showError('結果の表示中にエラーが発生しました');
    }
}

// 解説の折りたたみ機能
function toggleExplanation(index) {
    const explanationElement = document.getElementById(`explanation-${index}`);
    const toggleButton = document.querySelector(`.explanation-toggle[onclick="toggleExplanation(${index})"]`);
    
    if (explanationElement.classList.contains('show')) {
        explanationElement.classList.remove('show');
        toggleButton.textContent = '💡 解説を見る';
        toggleButton.classList.remove('active');
    } else {
        explanationElement.classList.add('show');
        toggleButton.textContent = '📖 解説を閉じる';
        toggleButton.classList.add('active');
        
        // 解説表示時に四択問題の答えをハイライト
        const questionContentElement = document.getElementById(`question-content-${index}`);
        if (questionContentElement && currentQuestionsData[index]) {
            const updatedContent = formatQuestionDisplay(currentQuestionsData[index], true);
            questionContentElement.innerHTML = updatedContent;
        }
    }
}

// AI質問機能
function toggleAIChat() {
    const chatPanel = document.getElementById('aiChatPanel');
    aiChatOpen = !aiChatOpen;
    
    if (aiChatOpen) {
        chatPanel.classList.add('show');
        document.getElementById('aiChatInput').focus();
    } else {
        chatPanel.classList.remove('show');
    }
}

async function sendAIQuestion() {
    const input = document.getElementById('aiChatInput');
    const question = input.value.trim();
    
    if (!question) return;
    
    const messagesDiv = document.getElementById('aiChatMessages');
    
    // ユーザーの質問を表示
    const userMessage = document.createElement('div');
    userMessage.className = 'ai-message user';
    userMessage.textContent = question;
    messagesDiv.appendChild(userMessage);
    
    // 入力欄をクリア
    input.value = '';
    
    // AI応答を生成中表示
    const thinkingMessage = document.createElement('div');
    thinkingMessage.className = 'ai-message ai';
    thinkingMessage.textContent = '考え中...';
    messagesDiv.appendChild(thinkingMessage);
    
    // 自動スクロール
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    try {
        const response = await fetch(`${API_BASE_URL}/ai-question`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                question: question,
                context: currentQuestionsData // 現在の問題データを文脈として送信
            })
        });
        
        const result = await response.json();
        
        // 考え中メッセージを削除
        messagesDiv.removeChild(thinkingMessage);
        
        // AI応答を表示
        const aiMessage = document.createElement('div');
        aiMessage.className = 'ai-message ai';
        aiMessage.textContent = result.answer || 'すみません、回答を生成できませんでした。';
        messagesDiv.appendChild(aiMessage);
        
    } catch (error) {
        console.error('AI質問エラー:', error);
        
        // 考え中メッセージを削除
        messagesDiv.removeChild(thinkingMessage);
        
        // エラーメッセージ表示
        const errorMessage = document.createElement('div');
        errorMessage.className = 'ai-message ai';
        errorMessage.textContent = 'すみません、現在AI機能が利用できません。しばらく後でお試しください。';
        messagesDiv.appendChild(errorMessage);
    }
    
    // 自動スクロール
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Enterキーで送信
document.getElementById('aiChatInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        sendAIQuestion();
    }
});

// もっかい読解（復習復習機能）
function loadQuizHistory() {
    const history = JSON.parse(localStorage.getItem('sakumon_quiz_history') || '[]');
    return history.filter(item => item.mode === 'review');
}

function getSubjectHistory(subject) {
    const history = loadQuizHistory();
    return history.filter(item => item.subject === subject);
}

function getAllSubjectsFromHistory() {
    const history = loadQuizHistory();
    const subjects = [...new Set(history.map(item => item.subject))];
    return subjects;
}

function createReviewHistorySection() {
    const mainContent = document.querySelector('.main-content');
    
    const reviewSection = document.createElement('div');
    reviewSection.className = 'review-history-section';
    reviewSection.style.marginTop = '30px';
    reviewSection.innerHTML = `
        <div class="settings-panel">
            <h3>📚 もっかい読解 - 過去の学習から再出題</h3>
            <p class="info-text">過去に作成した問題から、教科別に復習問題を再出題します</p>
            
            <div class="review-history-controls" style="margin-bottom: 20px;">
                <div class="settings-grid">
                    <div class="setting-group">
                        <label for="historySubjectSelect">復習する教科を選択:</label>
                        <select id="historySubjectSelect">
                            <option value="">教科を選択してください</option>
                        </select>
                    </div>
                    
                    <div class="setting-group">
                        <label for="reviewQuestionCount">出題数:</label>
                        <select id="reviewQuestionCount">
                            <option value="3">3問</option>
                            <option value="5" selected>5問</option>
                            <option value="10">10問</option>
                            <option value="all">全問題</option>
                        </select>
                    </div>
                </div>
            </div>
            
            <div class="history-stats" id="historyStats"></div>
            
            <button class="generate-btn" id="startReviewBtn" onclick="startReviewSession()" disabled>
                📄 復習を開始
            </button>
        </div>
        
        <div class="review-results-container" id="reviewResults" style="display: none; margin-top: 20px;">
            <div class="results-tabs">
                <button class="result-tab active" data-tab="reviewQuestions">📝 復習問題</button>
                <button class="result-tab" data-tab="reviewStats">📊 学習統計</button>
            </div>
            
            <div class="results-content">
                <div class="result-panel active" id="reviewQuestionsPanel">
                    <div class="result-section">
                        <h3>📝 復習問題</h3>
                        <div id="reviewQuestionsContent"></div>
                    </div>
                </div>
                
                <div class="result-panel" id="reviewStatsPanel">
                    <div class="result-section">
                        <h3>📊 学習統計</h3>
                        <div id="reviewStatsContent"></div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    const resultsContainer = document.getElementById('results');
    resultsContainer.parentNode.insertBefore(reviewSection, resultsContainer.nextSibling);
}

function initializeReviewHistory() {
    createReviewHistorySection();
    populateHistorySubjects();
    setupHistoryEventListeners();
}

function populateHistorySubjects() {
    const subjects = getAllSubjectsFromHistory();
    const select = document.getElementById('historySubjectSelect');
    
    select.innerHTML = '<option value="">教科を選択してください</option>';
    
    subjects.forEach(subject => {
        const option = document.createElement('option');
        option.value = subject;
        option.textContent = subject;
        select.appendChild(option);
    });
    
    if (subjects.length === 0) {
        select.innerHTML = '<option value="">まだ学習履歴がありません</option>';
    }
}

function setupHistoryEventListeners() {
    document.getElementById('historySubjectSelect').addEventListener('change', function() {
        const subject = this.value;
        updateHistoryStats(subject);
        updateReviewButton();
    });
    
    document.getElementById('reviewMode').addEventListener('change', function() {
        updateReviewButton();
    });
    
    document.addEventListener('click', function(e) {
        if (e.target.classList.contains('result-tab') && 
            (e.target.dataset.tab === 'reviewQuestions' || e.target.dataset.tab === 'reviewStats')) {
            switchReviewTab(e.target.dataset.tab);
        }
    });
}

function updateHistoryStats(subject) {
    const statsDiv = document.getElementById('historyStats');
    
    if (!subject) {
        statsDiv.innerHTML = '';
        return;
    }
    
    const subjectHistory = getSubjectHistory(subject);
    const totalSessions = subjectHistory.length;
    const totalQuestions = subjectHistory.reduce((sum, session) => {
        return sum + (session.data.questions ? session.data.questions.length : 0);
    }, 0);
    
    const lastStudy = subjectHistory.length > 0 
        ? new Date(subjectHistory[subjectHistory.length - 1].timestamp).toLocaleDateString('ja-JP')
        : 'なし';
    
    statsDiv.innerHTML = `
        <div class="stats-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin: 15px 0; padding: 15px; background: #f0f8ff; border-radius: 8px;">
            <div class="stat-item" style="text-align: center;">
                <div style="font-size: 1.5rem; font-weight: bold; color: #3498db;">${totalSessions}</div>
                <div style="font-size: 0.9rem; color: #666;">学習セッション</div>
            </div>
            <div class="stat-item" style="text-align: center;">
                <div style="font-size: 1.5rem; font-weight: bold; color: #27ae60;">${totalQuestions}</div>
                <div style="font-size: 0.9rem; color: #666;">累計問題数</div>
            </div>
            <div class="stat-item" style="text-align: center;">
                <div style="font-size: 1rem; font-weight: bold; color: #e74c3c;">${lastStudy}</div>
                <div style="font-size: 0.9rem; color: #666;">最終学習日</div>
            </div>
        </div>
    `;
}

function updateReviewButton() {
    const startReviewBtn = document.getElementById('startReviewBtn');
    const subject = document.getElementById('historySubjectSelect').value;
    
    startReviewBtn.disabled = !subject;
}

function startReviewSession() {
    const subject = document.getElementById('historySubjectSelect').value;
    const reviewMode = document.getElementById('reviewMode').value;
    const questionCount = document.getElementById('reviewQuestionCount').value;
    
    if (!subject) {
        showError('教科を選択してください');
        return;
    }
    
    try {
        const questions = prepareReviewQuestions(subject, reviewMode, questionCount);
        
        if (questions.length === 0) {
            showError('復習可能な問題が見つかりませんでした');
            return;
        }
        
        displayReviewQuestions(questions, subject);
        updateReviewStats(subject, questions.length);
        
    } catch (error) {
        console.error('復習セッション開始エラー:', error);
        showError('復習セッションの開始中にエラーが発生しました');
    }
}

function prepareReviewQuestions(subject, reviewMode, questionCount) {
    let allQuestions = [];
    
    const subjectHistory = getSubjectHistory(subject);
    subjectHistory.forEach(session => {
        if (session.data.questions) {
            session.data.questions.forEach(q => {
                allQuestions.push({
                    ...q,
                    sessionId: session.id,
                    sessionDate: session.timestamp
                });
            });
        }
    });
    
    let selectedQuestions = [];
    
    switch (reviewMode) {
        case 'latest':
            allQuestions.sort((a, b) => new Date(b.sessionDate) - new Date(a.sessionDate));
            selectedQuestions = allQuestions.slice(0, questionCount === 'all' ? allQuestions.length : parseInt(questionCount));
            break;
            
        case 'random':
            selectedQuestions = shuffleArray([...allQuestions]);
            if (questionCount !== 'all') {
                selectedQuestions = selectedQuestions.slice(0, parseInt(questionCount));
            }
            break;
            
        case 'all':
        default:
            selectedQuestions = allQuestions;
            if (questionCount !== 'all') {
                selectedQuestions = selectedQuestions.slice(0, parseInt(questionCount));
            }
            break;
    }
    
    return selectedQuestions;
}

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

let currentReviewQuestionsData = [];

function displayReviewQuestions(questions, subject) {
    currentReviewQuestionsData = questions;
    
    const reviewResults = document.getElementById('reviewResults');
    const questionsContent = document.getElementById('reviewQuestionsContent');
    
    let questionsHtml = `
        <div class="review-header" style="background: linear-gradient(135deg, #3498db, #2980b9); color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
            <h3 style="margin: 0; color: white;">📚 ${subject} - 復習セッション</h3>
            <p style="margin: 5px 0 0 0; opacity: 0.9;">出題数: ${questions.length}問</p>
        </div>
    `;
    
    questions.forEach((q, i) => {
        const sessionDate = new Date(q.sessionDate).toLocaleDateString('ja-JP');
        const formattedQuestion = formatQuestionDisplay(q, false);
        const questionIcon = q.question.includes('A)') ? '📝' : '✏️';
        
        questionsHtml += `
            <div class="question">
                <div class="question-header">
                    <div class="question-title">${questionIcon} 復習問題 ${i + 1}</div>
                    <div style="display: flex; gap: 10px; align-items: center;">
                        <span style="font-size: 0.8rem; color: #666; background: #f0f0f0; padding: 4px 8px; border-radius: 12px;">
                            ${sessionDate}
                        </span>
                        <button class="explanation-toggle" onclick="toggleReviewExplanation(${i})">
                            💡 解説を見る
                        </button>
                    </div>
                </div>
                <div class="question-content" id="review-question-content-${i}">
                    ${formattedQuestion}
                </div>
                <div class="explanation-content" id="reviewExplanation-${i}">
                    <h4>解答・解説</h4>
                    <div style="background: #e8f5e8; padding: 12px; border-radius: 6px; margin-bottom: 10px;">
                        <p><strong>🎯 正解:</strong> ${q.answer}</p>
                    </div>
                    <div style="background: #f0f8ff; padding: 12px; border-radius: 6px;">
                        <p><strong>📚 解説:</strong> ${q.explanation}</p>
                    </div>
                </div>
            </div>
        `;
    });
    
    questionsContent.innerHTML = questionsHtml;
    reviewResults.style.display = 'block';
    
    switchReviewTab('reviewQuestions');
    reviewResults.scrollIntoView({ behavior: 'smooth' });
}

function toggleReviewExplanation(index) {
    const explanationElement = document.getElementById(`reviewExplanation-${index}`);
    const toggleButton = document.querySelector(`.explanation-toggle[onclick="toggleReviewExplanation(${index})"]`);
    
    if (explanationElement.classList.contains('show')) {
        explanationElement.classList.remove('show');
        toggleButton.textContent = '💡 解説を見る';
        toggleButton.classList.remove('active');
    } else {
        explanationElement.classList.add('show');
        toggleButton.textContent = '📖 解説を閉じる';
        toggleButton.classList.add('active');
        
        const questionContentElement = document.getElementById(`review-question-content-${index}`);
        if (questionContentElement && currentReviewQuestionsData[index]) {
            const updatedContent = formatQuestionDisplay(currentReviewQuestionsData[index], true);
            questionContentElement.innerHTML = updatedContent;
        }
    }
}

function switchReviewTab(tabName) {
    document.querySelectorAll('[data-tab="reviewQuestions"], [data-tab="reviewStats"]').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        }
    });
    
    const questionsPanel = document.getElementById('reviewQuestionsPanel');
    const statsPanel = document.getElementById('reviewStatsPanel');
    
    if (tabName === 'reviewQuestions') {
        questionsPanel.classList.add('active');
        statsPanel.classList.remove('active');
    } else {
        questionsPanel.classList.remove('active');
        statsPanel.classList.add('active');
    }
}

function updateReviewStats(subject, questionCount) {
    const statsContent = document.getElementById('reviewStatsContent');
    const subjectHistory = getSubjectHistory(subject);
    
    const totalSessions = subjectHistory.length;
    const totalQuestions = subjectHistory.reduce((sum, session) => {
        return sum + (session.data.questions ? session.data.questions.length : 0);
    }, 0);
    
    statsContent.innerHTML = `
        <div class="stats-dashboard">
            <div class="stats-row" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 20px;">
                <div class="stat-card" style="background: linear-gradient(135deg, #3498db, #2980b9); color: white; padding: 20px; border-radius: 10px; text-align: center;">
                    <div style="font-size: 2rem; font-weight: bold;">${questionCount}</div>
                    <div>今回の復習問題数</div>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #27ae60, #2ecc71); color: white; padding: 20px; border-radius: 10px; text-align: center;">
                    <div style="font-size: 2rem; font-weight: bold;">${totalSessions}</div>
                    <div>総学習セッション</div>
                </div>
            </div>
            
            <div class="progress-section" style="background: #f8f9fa; padding: 20px; border-radius: 10px;">
                <h4 style="color: #2c3e50; margin-bottom: 15px;">📈 学習進度</h4>
                <div class="progress-item" style="margin-bottom: 10px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>復習完了率</span>
                        <span>${Math.round((questionCount / Math.max(totalQuestions, 1)) * 100)}%</span>
                    </div>
                    <div style="background: #e9ecef; height: 8px; border-radius: 4px; overflow: hidden;">
                        <div style="background: linear-gradient(135deg, #3498db, #2980b9); height: 100%; width: ${Math.round((questionCount / Math.max(totalQuestions, 1)) * 100)}%; transition: width 0.5s ease;"></div>
                    </div>
                </div>
            </div>
            
            <div style="background: linear-gradient(135deg, #f39c12, #e67e22); color: white; padding: 15px; border-radius: 10px; text-align: center; margin-top: 20px;">
                <strong>🎉 お疲れ様でした！</strong><br>
                継続的な復習が学習効果を高めます。
            </div>
        </div>
    `;
}

// 初期化
updateModeDisplay();
updateGenerateButton();Mode">復習モード:</label>
                        <select id="reviewMode">
                            <option value="latest">最新のセッション</option>
                            <option value="random">ランダム出題</option>
                            <option value="all">全問題から出題</option>
                        </select>
                    </div>
                    
                    <div class="setting-group">
                        <label for="review
