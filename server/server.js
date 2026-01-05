// ============================================
// Premiere Pro Remote Project Creator Server
// With Auto Sequence Creation Support
// ============================================
const express = require('express');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');

// ===================================
// Configuration
// ===================================
const HTTP_PORT = 3000;
const WS_PORT = 8080;

// Desktop/inbox 경로 계산
const desktopPath = path.join(os.homedir(), 'Desktop');
const inboxPath = path.join(desktopPath, 'inbox');

// 기본값 - 여기서만 수정하면 됨!
const DEFAULT_PRESET_NAME = 'shortsvideo'; // 프리셋 파일명 (확장자 제외)
const DEFAULT_SEQUENCE_NAME = '타임라인 01';

console.log('📁 기본 저장 경로:', inboxPath);
console.log('🎬 기본 프리셋:', DEFAULT_PRESET_NAME);
console.log('📹 기본 시퀀스:', DEFAULT_SEQUENCE_NAME);

// ===================================
// WebSocket Server (포트 8080)
// ===================================
const wss = new WebSocket.Server({ port: WS_PORT });

// 연결된 클라이언트 추적
const clients = new Set();

// 대기 중인 응답 콜백
const pendingCallbacks = new Map();
let requestId = 0;

wss.on('connection', (ws) => {
    console.log('✅ UXP 플러그인 연결됨');
    clients.add(ws);
    
    // 연결 해제 시
    ws.on('close', () => {
        console.log('❌ UXP 플러그인 연결 해제');
        clients.delete(ws);
    });
    
    // 메시지 수신 (플러그인 → 서버)
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            console.log('📨 플러그인으로부터 메시지:', JSON.stringify(data, null, 2));
            
            // 응답 콜백 처리
            if (data.requestId && pendingCallbacks.has(data.requestId)) {
                const callback = pendingCallbacks.get(data.requestId);
                pendingCallbacks.delete(data.requestId);
                callback(data);
            }
        } catch (e) {
            console.error('메시지 파싱 오류:', e);
        }
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket 에러:', error);
    });
});

console.log(`📡 WebSocket 서버 실행: ws://localhost:${WS_PORT}`);

// ===================================
// HTTP API Server (포트 3000)
// ===================================
const app = express();
app.use(express.json());

// CORS 허용 (개발용)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, X-API-Key');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// 상태 확인 엔드포인트
app.get('/', (req, res) => {
    res.json({
        name: 'Premiere Pro Remote Server',
        version: '2.0.0',
        status: 'running',
        connectedPlugins: clients.size,
        defaults: {
            savePath: inboxPath,
            presetName: DEFAULT_PRESET_NAME,
            sequenceName: DEFAULT_SEQUENCE_NAME
        },
        endpoints: {
            createProject: 'POST /create-project',
            status: 'GET /status'
        }
    });
});

app.get('/status', (req, res) => {
    res.json({
        connectedClients: clients.size,
        websocketPort: WS_PORT,
        httpPort: HTTP_PORT,
        defaultSavePath: inboxPath,
        defaultPreset: DEFAULT_PRESET_NAME,
        defaultSequence: DEFAULT_SEQUENCE_NAME
    });
});

// 프로젝트 생성 트리거 엔드포인트
app.post('/create-project', async (req, res) => {
    console.log('\n' + '='.repeat(50));
    console.log('📥 프로젝트 생성 요청');
    console.log('='.repeat(50));
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    // 연결된 플러그인 확인
    if (clients.size === 0) {
        console.log('❌ 연결된 플러그인 없음');
        return res.status(503).json({ 
            success: false, 
            error: '연결된 Premiere Pro 플러그인이 없습니다. Premiere Pro가 실행 중이고 플러그인이 로드되어 있는지 확인하세요.' 
        });
    }
    
    // 요청 데이터 구성
    const currentRequestId = ++requestId;
    const { projectName, sequenceName, presetName, savePath } = req.body || {};
    
    const message = JSON.stringify({
        requestId: currentRequestId,
        action: 'CREATE_PROJECT',
        data: {
            projectName: projectName || 'NewProject',
            sequenceName: sequenceName || DEFAULT_SEQUENCE_NAME,
            presetName: presetName || DEFAULT_PRESET_NAME,
            savePath: savePath || inboxPath
        }
    });
    
    console.log('전송 메시지:', JSON.stringify(JSON.parse(message), null, 2));
    
    // 응답 대기 Promise 생성
    const responsePromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            pendingCallbacks.delete(currentRequestId);
            reject(new Error('플러그인 응답 시간 초과 (30초)'));
        }, 30000);
        
        pendingCallbacks.set(currentRequestId, (response) => {
            clearTimeout(timeout);
            resolve(response);
        });
    });
    
    // 모든 연결된 플러그인에 메시지 전송
    let sent = 0;
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
            sent++;
        }
    });
    
    console.log(`→ ${sent}개 플러그인에 전송됨`);
    
    try {
        // 플러그인 응답 대기
        const response = await responsePromise;
        
        if (response.status === 'success') {
            console.log('✅ 성공!');
            console.log('   프로젝트:', response.projectName);
            console.log('   시퀀스:', response.sequenceName);
            console.log('   프리셋:', response.presetUsed);
            console.log('   경로:', response.projectPath);
            
            res.json({
                success: true,
                projectName: response.projectName,
                projectPath: response.projectPath,
                sequenceName: response.sequenceName,
                presetUsed: response.presetUsed,
                message: '프로젝트와 시퀀스가 성공적으로 생성되었습니다!'
            });
        } else {
            console.log('❌ 실패:', response.error);
            res.status(500).json({
                success: false,
                error: response.error || '프로젝트 생성 실패'
            });
        }
    } catch (error) {
        console.error('❌ 오류:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
    
    console.log('='.repeat(50) + '\n');
});

// 서버 시작
app.listen(HTTP_PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 Premiere Pro Remote Server v2.0');
    console.log('='.repeat(50));
    console.log(`HTTP API: http://localhost:${HTTP_PORT}`);
    console.log(`WebSocket: ws://localhost:${WS_PORT}`);
    console.log('\n사용 방법:');
    console.log('  # 기본 생성 (쇼츠영상용 프리셋 자동 적용)');
    console.log('  Invoke-RestMethod -Uri "http://localhost:3000/create-project" -Method Post -ContentType "application/json" -Body "{}"');
    console.log('\n  # 커스텀 이름');
    console.log('  Invoke-RestMethod -Uri "http://localhost:3000/create-project" -Method Post -ContentType "application/json" -Body \'{"projectName": "MyVideo"}\'');
    console.log('\n대기 중...\n');
});
