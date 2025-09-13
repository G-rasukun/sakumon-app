// 本番環境のAPIベースURLを自動検出
const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api' 
    : '/api';

// グローバル変数
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
    
    if (currentMode === 'review') {
        reviewSettings.classList.remove('hide');
        yamabariSettings.classList.remove('show');
    } else {
        reviewSettings.classList.add('hide');
        yamabariSettings.classList.add('show');
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
});

function updateGenerateButton() {
    const generateBtn = document.getElementById('generateBtn');
    const hasText = document.getElementById('additionalText').value.trim().length > 0;
    
    if (currentMode === 'review') {
        generateBtn.disabled = !hasText;
    } else {
        const hasSubject = document.getElementById('yamabariSubject').value.trim().length > 0;
        generateBtn.disabled = !(hasText && hasSubject);
    }
}

// テキスト入力の監視
document.getElementById('additionalText').addEventListener('input', updateGenerateButton);
if (document.getElementById('yamabariSubject')) {
    document.getElementById('yamabariSubject').addEventListener('input', updateGenerateButton);
}

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
    const additionalText = document.getElementById('additionalText').value.trim();
    if (!additionalText) {
        showError('テキストを入力してください');
        return;
    }

    if (currentMode === 'review') {
        const subjectSelect = document.getElementById('subjectSelect');
        const newSubjectInput = document.getElementById('newSubjectInput');
        
        if (subjectSelect.value === 'new' && !newSubjectInput.value.trim()) {
            showError('教科名を入力してください');
            return;
        }
    } else {
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
        const requestData = {
            mode: currentMode,
            additionalText: additionalText
        };
        
        // 設定情報を送信
        if (currentMode === 'review') {
            const subject = document.getElementById('subjectSelect').value === 'new' 
                ? document.getElementById('newSubjectInput').value.trim()
                : document.getElementById('subjectSelect').value;
            
            requestData.subject = subject;
            requestData.questionCount = document.getElementById('questionCount').value;
            requestData.difficulty = document.getElementById('difficulty').value;
            requestData.questionType = document.getElementById('questionType').value;
        } else {
            requestData.subject = document.getElementById('yamabariSubject').value.trim();
            requestData.questionCount = document.getElementById('yamabariQuestionCount').value;
            requestData.difficulty = document.getElementById('yamabaridifficulty').value;
            requestData.questionType = document.getElementById('yamabariQuestionType').value;
        }

        console.log('サーバーに送信中...');
        
        const response = await fetch(`${API_BASE_URL}/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `サーバーエラー: ${response.status}`);
        }

        const result = await response.json();
        console.log('AI処理完了:', result);

        if (result.success) {
            showResults(result.data, currentMode);
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
