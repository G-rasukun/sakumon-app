const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');

const app = express();
const port = process.env.PORT || 3000;

// OpenAI API設定
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here'
});

// ミドルウェア設定
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// ファイルアップロード設定
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB制限
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['text/plain', 'application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('対応していないファイル形式です'), false);
        }
    }
});

// ファイル内容読み込み関数（OCR改善版）
async function readFileContent(filePath, mimeType) {
    console.log(`ファイル処理開始: ${filePath}, タイプ: ${mimeType}`);
    
    if (mimeType === 'text/plain') {
        const content = fs.readFileSync(filePath, 'utf8');
        console.log(`テキスト内容（最初の100文字）: ${content.substring(0, 100)}`);
        return content;
    } else if (mimeType === 'application/pdf') {
        try {
            console.log('PDF処理開始...');
            const pdfBuffer = fs.readFileSync(filePath);
            const pdfData = await pdfParse(pdfBuffer);
            const text = pdfData.text;
            console.log(`PDF処理成功。テキスト長: ${text.length}文字`);
            
            if (text.trim().length === 0) {
                return 'このPDFからテキストを抽出できませんでした。画像ベースのPDFの可能性があります。';
            }
            
            return text;
        } catch (error) {
            console.error('PDF処理エラー:', error);
            return `PDF処理エラーが発生しました: ${error.message}`;
        }
    } else if (mimeType.startsWith('image/')) {
        try {
            console.log('OCR処理開始（改善版）...');
            
            // 改善されたOCR設定
            const { data: { text } } = await Tesseract.recognize(
                filePath,
                'jpn+eng',
                {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            console.log(`OCR進行状況: ${Math.round(m.progress * 100)}%`);
                        }
                    },
                    // OCR精度向上設定
                    tessedit_pageseg_mode: Tesseract.PSM.AUTO,
                    tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY,
                    preserve_interword_spaces: '1',
                    textord_min_xheight: '10'
                }
            );
            
            console.log(`OCR処理完了。テキスト長: ${text.length}文字`);
            
            // 改善された後処理
            let cleanedText = text
                .replace(/\r\n/g, '\n')
                .replace(/\r/g, '\n')
                .replace(/\n\s*\n\s*\n/g, '\n\n')
                .replace(/([あ-ん])\s+([あ-ん])/g, '$1$2')
                .replace(/([ア-ン])\s+([ア-ン])/g, '$1$2')
                .replace(/([一-龯])\s+([一-龯])/g, '$1$2')
                .replace(/\s*=\s*/g, '=')
                .replace(/\s*\+\s*/g, '+')
                .replace(/\s*-\s*/g, '-')
                .replace(/[|｜]/g, 'l')
                .replace(/[０-９]/g, match => String.fromCharCode(match.charCodeAt(0) - 65248))
                .replace(/[Ａ-Ｚａ-ｚ]/g, match => String.fromCharCode(match.charCodeAt(0) - 65248))
                .replace(/^\s+/gm, '')
                .replace(/\s+$/gm, '')
                .replace(/\n{3,}/g, '\n\n')
                .trim();
            
            if (cleanedText.trim().length === 0) {
                return '画像からテキストを抽出できませんでした。画像の品質を確認してください。';
            }
            
            const meaningfulChars = cleanedText.match(/[a-zA-Z0-9あ-んア-ン一-龯]/g);
            const meaningfulRatio = meaningfulChars ? meaningfulChars.length / cleanedText.length : 0;
            
            if (meaningfulRatio < 0.1) {
                return `画像からの文字認識精度が低い可能性があります。認識されたテキスト:\n${cleanedText}\n\n※より鮮明な画像での再試行をお勧めします。`;
            }
            
            return `画像から抽出されたテキスト内容:\n${cleanedText}`;
            
        } catch (error) {
            console.error('OCR処理エラー:', error);
            return `画像処理エラー: ${error.message}`;
        }
    }
    return '';
}

// プロンプト生成関数（テキスト量制限対応版）
function createPrompt(fileContents, mode, settings = {}) {
    function processLargeContent(content, fileName) {
        if (content.length <= 800) {
            return content;
        }
        
        const lines = content.split('\n');
        const importantLines = [];
        let currentLength = 0;
        const maxLength = 600;
        
        const priorityLines = lines.filter(line => {
            const trimmed = line.trim();
            return trimmed.length > 5 && (
                trimmed.includes('問題') || 
                trimmed.includes('解答') || 
                trimmed.includes('重要') ||
                trimmed.includes('定義') ||
                trimmed.includes('公式') ||
                /第?\d+章|第?\d+節|第?\d+問/.test(trimmed) ||
                /^\d+[\.\)]\s/.test(trimmed)
            );
        });
        
        for (const line of priorityLines) {
            if (currentLength + line.length > maxLength) break;
            importantLines.push(line);
            currentLength += line.length;
        }
        
        if (currentLength < maxLength * 0.8) {
            for (const line of lines) {
                if (priorityLines.includes(line)) continue;
                if (line.trim().length < 10) continue;
                if (currentLength + line.length > maxLength) break;
                
                importantLines.push(line);
                currentLength += line.length;
            }
        }
        
        const result = importantLines.join('\n');
        console.log(`${fileName}: ${content.length}文字 → ${result.length}文字に圧縮`);
        
        return result;
    }
    
    const processedContent = fileContents.map(f => {
        const processed = processLargeContent(f.content, f.name);
        return `【${f.name}】\n${processed}\n`;
    }).join('\n');
    
    const totalLength = processedContent.length;
    console.log(`総処理文字数: ${totalLength}文字`);
    
    const baseInstruction = `
あなたは教育専門のAIアシスタントです。以下の重要な制約を必ず守ってください：

【著作権遵守の重要な注意事項】
- 提供された資料と全く同じ問題や文章は絶対に作成しないでください
- すべての内容はオリジナルで、元の資料とは異なる表現・構成にしてください
- 同じ概念でも、異なる角度、異なる例、異なる問いかけで構成してください
- 既存の問題の単純な改変ではなく、完全に新しい問題を作成してください

ファイル内容：
${processedContent}
`;

    if (mode === 'review') {
        const questionCount = settings.questionCount || 5;
        const difficulty = settings.difficulty || 'standard';
        const questionType = settings.questionType || 'mixed';
        const subject = settings.subject || '学習内容';
        
        let difficultyInstruction = '';
        switch(difficulty) {
            case 'basic':
                difficultyInstruction = '基礎的な理解を確認するレベルの問題を作成してください。';
                break;
            case 'standard':
                difficultyInstruction = '標準的なレベルの問題を作成してください。';
                break;
            case 'advanced':
                difficultyInstruction = '応用力を問う高度なレベルの問題を作成してください。';
                break;
            case 'mixed':
                difficultyInstruction = '基礎から応用まで様々なレベルの問題を混合して作成してください。';
                break;
        }
        
        let typeInstruction = '';
        switch(questionType) {
            case 'multiple':
                typeInstruction = `四択問題形式で作成してください。正解と3つの誤答選択肢を含めてください。

問題は以下の形式で作成してください：
問題文
A) 選択肢1
B) 選択肢2  
C) 選択肢3
D) 選択肢4`;
                break;
            case 'descriptive':
                typeInstruction = '記述問題形式で作成してください。論述や説明を求める問題にしてください。';
                break;
            case 'mixed':
                typeInstruction = '四択問題と記述問題を組み合わせて作成してください。';
                break;
        }
        
        return baseInstruction + `
【復習問題作成＆要点ノートモード】
教科: ${subject}
問題数: ${questionCount}問
難易度: ${difficulty}
出題形式: ${questionType}

${difficultyInstruction}
${typeInstruction}

上記の内容を分析し、以下を作成してください：

1. 復習問題（${questionCount}問）：
   - 元の資料とは全く異なる新しい問題
   - 指定された難易度と形式に従った問題
   - 各問題に詳細な解答・解説

2. 要点ノート：
   - 重要概念を整理した構造的なまとめ
   - 図表や例を用いた理解しやすい説明
   - 元の資料とは異なる表現での要点整理

必ず以下のJSONフォーマットで返してください：
{
  "questions": [
    {
      "question": "問題文",
      "answer": "解答", 
      "explanation": "詳細な解説"
    }
  ],
  "summary": "要点ノートの内容"
}`;
    } else {
        const subject = settings.subject || '学習内容';
        
        return baseInstruction + `
【ヤマ張り問題モード】
教科: ${subject}

上記の過去問と授業教材を分析し、以下を作成してください：

重要：著作権保護のため、既存の問題と同じものは絶対に作成しないでください。

1. 関連性分析：過去問のパターンと授業内容の関連を分析
2. 予想問題（3問）：
   - 過去問のパターンを参考にした完全オリジナル問題
   - 新しい視点・角度からの問題設定

3. 解説：問題とは別に詳細な解説をまとめ

必ず以下のJSONフォーマットで返してください：
{
  "analysis": "関連性分析結果",
  "predictions": [
    {
      "question": "予想問題文",
      "explanation": "出題予想理由と解説"
    }
  ],
  "notes": "補足説明"
}`;
    }
}

// AI問題生成API
app.post('/api/generate', upload.fields([
    { name: 'files', maxCount: 10 },
    { name: 'pastExamFiles', maxCount: 10 },
    { name: 'materialFiles', maxCount: 10 }
]), async (req, res) => {
    try {
        const { mode, subject, questionCount, difficulty, questionType, additionalText } = req.body;
        const files = req.files;

        console.log(`処理開始: モード=${mode}, 教科=${subject}`);

        let allFiles = [];
        
        if (files.files) {
            allFiles = allFiles.concat(files.files);
        }
        if (files.pastExamFiles) {
            allFiles = allFiles.concat(files.pastExamFiles);
        }
        if (files.materialFiles) {
            allFiles = allFiles.concat(files.materialFiles);
        }

        if (allFiles.length === 0 && !additionalText) {
            return res.status(400).json({ error: 'ファイルまたはテキストを入力してください' });
        }

        let fileContents = [];
        
        for (const file of allFiles) {
            try {
                const content = await readFileContent(file.path, file.mimetype);
                fileContents.push({
                    name: file.originalname,
                    type: file.mimetype,
                    content: content
                });
                
                fs.unlinkSync(file.path);
            } catch (error) {
                console.error(`ファイル処理エラー (${file.originalname}):`, error);
                try {
                    fs.unlinkSync(file.path);
                } catch (deleteError) {
                    console.error('ファイル削除エラー:', deleteError);
                }
            }
        }
        
        if (additionalText) {
            fileContents.push({
                name: '手動入力テキスト',
                type: 'text/plain',
                content: additionalText
            });
        }

        if (fileContents.length === 0) {
            return res.status(400).json({ error: 'ファイル内容の読み込みに失敗しました' });
        }

        const settings = {
            subject,
            questionCount,
            difficulty,
            questionType
        };

        const prompt = createPrompt(fileContents, mode, settings);
        console.log('OpenAI API呼び出し開始...');

        const completion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
                {
                    role: 'system',
                    content: '教育専門のAIアシスタントとして、著作権を遵守し、オリジナルの学習コンテンツを作成します。必ずJSON形式で回答してください。'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            max_tokens: 4000,
            temperature: 0.7
        });

        const response = completion.choices[0].message.content;
        console.log('AI処理完了');

        try {
            const parsedResponse = JSON.parse(response);
            res.json({ success: true, data: parsedResponse });
        } catch (parseError) {
            console.error('JSON解析エラー:', parseError);
            res.json({ 
                success: true, 
                data: { raw_response: response },
                message: 'AI応答をテキスト形式で返しました'
            });
        }

    } catch (error) {
        console.error('API処理エラー:', error);
        
        if (error.code === 'invalid_api_key') {
            res.status(401).json({ error: 'APIキーが無効です' });
        } else if (error.code === 'insufficient_quota') {
            res.status(429).json({ error: 'API使用量制限に達しました' });
        } else if (error.code === 'rate_limit_exceeded') {
            res.status(429).json({ error: 'APIレート制限に達しました。しばらく待ってから再試行してください' });
        } else if (error.code === 'context_length_exceeded') {
            res.status(400).json({ error: 'テキスト量が多すぎます。ファイル数や内容を減らしてください' });
        } else {
            res.status(500).json({ 
                error: 'AI処理中にエラーが発生しました', 
                details: error.message 
            });
        }
    }
});

// ヘルスチェックAPI
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'サーバーは正常に動作しています' });
});

// 既存のserver.jsの末尾（サーバー起動部分の前）に以下を追加

// AI質問機能API
app.post('/api/ai-question', async (req, res) => {
    try {
        const { question, context } = req.body;
        
        if (!question || question.trim().length === 0) {
            return res.status(400).json({ error: '質問が入力されていません' });
        }
        
        console.log('AI質問受信:', question);
        
        // 文脈情報を整理
        let contextInfo = '';
        if (context && Array.isArray(context) && context.length > 0) {
            contextInfo = `\n\n現在表示されている問題情報：\n`;
            context.forEach((q, i) => {
                contextInfo += `問題${i + 1}: ${q.question.substring(0, 100)}...\n`;
                contextInfo += `解答: ${q.answer}\n`;
                contextInfo += `解説: ${q.explanation.substring(0, 100)}...\n\n`;
            });
        }
        
        const prompt = `あなたは学習支援AIアシスタントです。学習者からの質問に分かりやすく答えてください。

学習者の質問: ${question}

${contextInfo}

以下の点を心がけて回答してください：
- 分かりやすく、簡潔に説明する
- 具体例があれば含める  
- 学習者の理解を深めるヒントを提供する
- 200文字程度で回答する
- 問題について質問されている場合は、直接的な答えではなく考え方のヒントを提供する`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4',
            messages: [
                {
                    role: 'system',
                    content: '学習支援AIとして、分かりやすく教育的な回答を提供します。'
                },
                {
                    role: 'user', 
                    content: prompt
                }
            ],
            max_tokens: 300,
            temperature: 0.7
        });
        
        const answer = completion.choices[0].message.content;
        console.log('AI質問回答完了');
        
        res.json({ success: true, answer: answer });
        
    } catch (error) {
        console.error('AI質問処理エラー:', error);
        res.status(500).json({ 
            error: 'AI質問処理中にエラーが発生しました',
            details: error.message 
        });
    }
});

// 既存のcreatePrompt関数を修正（ヤマ張り問題の設定対応）
function createPrompt(fileContents, mode, settings = {}) {
    function processLargeContent(content, fileName) {
        if (content.length <= 800) {
            return content;
        }
        
        const lines = content.split('\n');
        const importantLines = [];
        let currentLength = 0;
        const maxLength = 600;
        
        const priorityLines = lines.filter(line => {
            const trimmed = line.trim();
            return trimmed.length > 5 && (
                trimmed.includes('問題') || 
                trimmed.includes('解答') || 
                trimmed.includes('重要') ||
                trimmed.includes('定義') ||
                trimmed.includes('公式') ||
                /第?\d+章|第?\d+節|第?\d+問/.test(trimmed) ||
                /^\d+[\.\)]\s/.test(trimmed)
            );
        });
        
        for (const line of priorityLines) {
            if (currentLength + line.length > maxLength) break;
            importantLines.push(line);
            currentLength += line.length;
        }
        
        if (currentLength < maxLength * 0.8) {
            for (const line of lines) {
                if (priorityLines.includes(line)) continue;
                if (line.trim().length < 10) continue;
                if (currentLength + line.length > maxLength) break;
                
                importantLines.push(line);
                currentLength += line.length;
            }
        }
        
        const result = importantLines.join('\n');
        console.log(`${fileName}: ${content.length}文字 → ${result.length}文字に圧縮`);
        
        return result;
    }
    
    const processedContent = fileContents.map(f => {
        const processed = processLargeContent(f.content, f.name);
        return `【${f.name}】\n${processed}\n`;
    }).join('\n');
    
    const totalLength = processedContent.length;
    console.log(`総処理文字数: ${totalLength}文字`);
    
    const baseInstruction = `
あなたは教育専門のAIアシスタントです。以下の重要な制約を必ず守ってください：

【著作権遵守の重要な注意事項】
- 提供された資料と全く同じ問題や文章は絶対に作成しないでください
- すべての内容はオリジナルで、元の資料とは異なる表現・構成にしてください
- 同じ概念でも、異なる角度、異なる例、異なる問いかけで構成してください
- 既存の問題の単純な改変ではなく、完全に新しい問題を作成してください

ファイル内容：
${processedContent}
`;

    if (mode === 'review') {
        const questionCount = settings.questionCount || 5;
        const difficulty = settings.difficulty || 'standard';
        const questionType = settings.questionType || 'mixed';
        const subject = settings.subject || '学習内容';
        
        let difficultyInstruction = '';
        switch(difficulty) {
            case 'basic':
                difficultyInstruction = '基礎的な理解を確認するレベルの問題を作成してください。';
                break;
            case 'standard':
                difficultyInstruction = '標準的なレベルの問題を作成してください。';
                break;
            case 'advanced':
                difficultyInstruction = '応用力を問う高度なレベルの問題を作成してください。';
                break;
            case 'mixed':
                difficultyInstruction = '基礎から応用まで様々なレベルの問題を混合して作成してください。';
                break;
        }
        
        let typeInstruction = '';
        switch(questionType) {
            case 'multiple':
                typeInstruction = `四択問題形式で作成してください。正解と3つの誤答選択肢を含めてください。

問題は以下の形式で作成してください：
問題文
A) 選択肢1
B) 選択肢2  
C) 選択肢3
D) 選択肢4`;
                break;
            case 'descriptive':
                typeInstruction = '記述問題形式で作成してください。論述や説明を求める問題にしてください。';
                break;
            case 'mixed':
                typeInstruction = '四択問題と記述問題を組み合わせて作成してください。';
                break;
        }
        
        return baseInstruction + `
【復習問題作成＆要点ノートモード】
教科: ${subject}
問題数: ${questionCount}問
難易度: ${difficulty}
出題形式: ${questionType}

${difficultyInstruction}
${typeInstruction}

上記の内容を分析し、以下を作成してください：

1. 復習問題（${questionCount}問）：
   - 元の資料とは全く異なる新しい問題
   - 指定された難易度と形式に従った問題
   - 各問題に詳細な解答・解説

2. 要点ノート：
   - 重要概念を整理した構造的なまとめ
   - 図表や例を用いた理解しやすい説明
   - 元の資料とは異なる表現での要点整理

必ず以下のJSONフォーマットで返してください：
{
  "questions": [
    {
      "question": "問題文",
      "answer": "解答", 
      "explanation": "詳細な解説"
    }
  ],
  "summary": "要点ノートの内容"
}`;
    } else {
        // ヤマ張り問題モード - 設定対応版
        const questionCount = settings.questionCount || 3;
        const difficulty = settings.difficulty || 'standard'; 
        const questionType = settings.questionType || 'mixed';
        const subject = settings.subject || '学習内容';
        
        let difficultyInstruction = '';
        switch(difficulty) {
            case 'basic':
                difficultyInstruction = '基礎的な理解を確認するレベルの予想問題を作成してください。';
                break;
            case 'standard':
                difficultyInstruction = '標準的なレベルの予想問題を作成してください。';
                break;
            case 'advanced':
                difficultyInstruction = '応用力を問う高度なレベルの予想問題を作成してください。';
                break;
            case 'mixed':
                difficultyInstruction = '基礎から応用まで様々なレベルの予想問題を混合して作成してください。';
                break;
        }
        
        let typeInstruction = '';
        switch(questionType) {
            case 'multiple':
                typeInstruction = `四択問題形式で予想問題を作成してください。正解と3つの誤答選択肢を含めてください。

問題は以下の形式で作成してください：
問題文
A) 選択肢1
B) 選択肢2  
C) 選択肢3
D) 選択肢4`;
                break;
            case 'descriptive':
                typeInstruction = '記述問題形式で予想問題を作成してください。論述や説明を求める問題にしてください。';
                break;
            case 'mixed':
                typeInstruction = '四択問題と記述問題を組み合わせて予想問題を作成してください。';
                break;
        }
        
        return baseInstruction + `
【じっくり対策モード】
教科: ${subject}
予想問題数: ${questionCount}問
難易度: ${difficulty}
出題形式: ${questionType}

${difficultyInstruction}
${typeInstruction}

上記の過去問と授業教材を分析し、以下を作成してください：

重要：著作権保護のため、既存の問題と同じものは絶対に作成しないでください。

1. 関連性分析：過去問のパターンと授業内容の関連を分析
2. 予想問題（${questionCount}問）：
   - 過去問のパターンを参考にした完全オリジナル問題
   - 指定された難易度と形式に従った問題
   - 新しい視点・角度からの問題設定
   - 各問題に詳細な解答・解説

3. 対策ノート：問題傾向と対策方法をまとめ

必ず以下のJSONフォーマットで返してください：
{
  "analysis": "関連性分析結果",
  "predictions": [
    {
      "question": "予想問題文",
      "answer": "解答",
      "explanation": "出題予想理由と詳細解説"
    }
  ],
  "notes": "対策ノートの内容"
}`;
    }
}

app.get('/', (req, res) => {
  res.send('✅ サーバーは動作中です');
});

// サーバー起動
app.listen(port, () => {
    console.log(`🚀 AI学習アプリサーバーが起動しました`);
    console.log(`🌐 http://localhost:${port}`);
    console.log(`📁 ファイルアップロード対応: PDF, PNG, JPG, TXT`);
    console.log(`🤖 OpenAI API: 準備完了`);
    console.log(`👁️ OCR機能: 改善版有効`);
});
