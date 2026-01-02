// ============================================
// Premiere Pro Remote Project Creator Server
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
const API_KEY = 'premiere-secret-key-2025'; // 원하면 변경

// Desktop/inbox 경로 계산
const desktopPath = path.join(os.homedir(), 'Desktop');
const inboxPath = path.join(desktopPath, 'inbox');

console.log('📁 기본 저장 경로:', inboxPath);

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
            console.log('📨 플러그인으로부터 메시지:', data);
            
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
        status: 'running',
        connectedPlugins: clients.size,
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
        defaultSavePath: inboxPath
    });
});

// 프로젝트 생성 트리거 엔드포인트
app.post('/create-project', async (req, res) => {
    console.log('\n📥 프로젝트 생성 요청 받음');
    console.log('   Body:', req.body);
    
    // 연결된 플러그인 확인
    if (clients.size === 0) {
        return res.status(503).json({ 
            success: false, 
            error: '연결된 Premiere Pro 플러그인이 없습니다. Premiere Pro가 실행 중이고 플러그인이 로드되어 있는지 확인하세요.' 
        });
    }
    
    // 요청 데이터 구성
    const currentRequestId = ++requestId;
    const { projectName, sequenceName, savePath } = req.body || {};
    
    const message = JSON.stringify({
        requestId: currentRequestId,
        action: 'CREATE_PROJECT',
        data: {
            projectName: projectName || 'NewProject',
            sequenceName: sequenceName || null,
            savePath: savePath || inboxPath
        }
    });
    
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
    
    console.log(`   → ${sent}개 플러그인에 전송됨`);
    
    try {
        // 플러그인 응답 대기
        const response = await responsePromise;
        
        if (response.status === 'success') {
            console.log('✅ 프로젝트 생성 성공:', response.projectPath);
            res.json({
                success: true,
                projectName: response.projectName,
                projectPath: response.projectPath,
                message: '프로젝트가 성공적으로 생성되었습니다!'
            });
        } else {
            console.log('❌ 프로젝트 생성 실패:', response.error);
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
});

// 서버 시작
app.listen(HTTP_PORT, () => {
    console.log(`🚀 HTTP 서버 실행: http://localhost:${HTTP_PORT}`);
    console.log('\n사용 방법:');
    console.log('  curl -X POST http://localhost:3000/create-project');
    console.log('  curl -X POST http://localhost:3000/create-project -H "Content-Type: application/json" -d "{\\"projectName\\": \\"MyProject\\"}"');
    console.log('\n대기 중...\n');
});

