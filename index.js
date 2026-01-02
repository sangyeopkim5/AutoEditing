// ============================================
// Premiere Pro Remote Project Creator
// UXP Plugin - WebSocket Client
// ============================================

const { Project } = require('premierepro');
const { storage } = require('uxp');
const fs = storage.localFileSystem;
const os = require('os');

// ===================================
// Configuration
// ===================================
const WS_SERVER = 'ws://localhost:8080';
const RECONNECT_INTERVAL = 5000; // 5초

// ===================================
// UI Elements
// ===================================
const indicator = document.getElementById('indicator');
const statusText = document.getElementById('statusText');
const savePathText = document.getElementById('savePath');
const logContainer = document.getElementById('logContainer');
const testBtn = document.getElementById('testBtn');

// ===================================
// Logging
// ===================================
function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('ko-KR', { hour12: false });
    
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-time">${timestamp}</span><span class="log-${type}">${message}</span>`;
    
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
    
    // 콘솔에도 출력
    console.log(`[${type.toUpperCase()}] ${message}`);
    
    // 로그 개수 제한 (최대 100개)
    while (logContainer.children.length > 100) {
        logContainer.removeChild(logContainer.firstChild);
    }
}

// ===================================
// WebSocket Connection
// ===================================
let ws = null;
let reconnectTimer = null;
let isConnected = false;

function updateConnectionStatus(status) {
    isConnected = status === 'connected';
    
    switch (status) {
        case 'connected':
            indicator.className = 'indicator connected';
            statusText.textContent = '연결됨 (대기 중)';
            testBtn.disabled = false;
            break;
        case 'connecting':
            indicator.className = 'indicator connecting';
            statusText.textContent = '연결 중...';
            testBtn.disabled = true;
            break;
        case 'disconnected':
            indicator.className = 'indicator disconnected';
            statusText.textContent = '연결 안됨';
            testBtn.disabled = true;
            break;
    }
}

function connect() {
    if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
        return;
    }
    
    try {
        updateConnectionStatus('connecting');
        log('서버 연결 시도...', 'info');
        
        ws = new WebSocket(WS_SERVER);
        
        // 연결 성공
        ws.onopen = () => {
            log('✅ 서버 연결 성공!', 'success');
            updateConnectionStatus('connected');
            
            // 재연결 타이머 제거
            if (reconnectTimer) {
                clearInterval(reconnectTimer);
                reconnectTimer = null;
            }
        };
        
        // 메시지 수신
        ws.onmessage = async (event) => {
            try {
                const message = JSON.parse(event.data);
                log(`📨 명령 수신: ${message.action}`, 'info');
                
                await handleMessage(message);
            } catch (error) {
                log(`❌ 메시지 처리 실패: ${error.message}`, 'error');
            }
        };
        
        // 연결 종료
        ws.onclose = () => {
            log('⚠️ 서버 연결 해제', 'warn');
            updateConnectionStatus('disconnected');
            
            // 재연결 시도
            scheduleReconnect();
        };
        
        // 에러 발생
        ws.onerror = (error) => {
            log(`❌ 연결 에러`, 'error');
            updateConnectionStatus('disconnected');
        };
        
    } catch (error) {
        log(`❌ 연결 실패: ${error.message}`, 'error');
        updateConnectionStatus('disconnected');
        scheduleReconnect();
    }
}

function scheduleReconnect() {
    if (reconnectTimer) return;
    
    reconnectTimer = setInterval(() => {
        log('재연결 시도...', 'info');
        connect();
    }, RECONNECT_INTERVAL);
}

function sendResponse(requestId, status, data = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            requestId,
            status,
            ...data
        }));
    }
}

// ===================================
// Message Handler
// ===================================
async function handleMessage(message) {
    const { requestId, action, data } = message;
    
    switch (action) {
        case 'CREATE_PROJECT':
            statusText.textContent = '프로젝트 생성 중...';
            log('🎬 프로젝트 생성 시작...', 'info');
            
            try {
                const result = await createNewProject(data);
                
                sendResponse(requestId, 'success', {
                    projectName: result.name,
                    projectPath: result.path
                });
                
                log(`✅ 완료: ${result.name}`, 'success');
                statusText.textContent = '연결됨 (대기 중)';
                
            } catch (error) {
                sendResponse(requestId, 'error', {
                    error: error.message
                });
                
                log(`❌ 실패: ${error.message}`, 'error');
                statusText.textContent = '연결됨 (대기 중)';
            }
            break;
            
        case 'PING':
            sendResponse(requestId, 'pong');
            break;
            
        default:
            log(`⚠️ 알 수 없는 명령: ${action}`, 'warn');
    }
}

// ===================================
// Project Creation
// ===================================
async function createNewProject(data = {}) {
    const { projectName, sequenceName, savePath } = data;
    
    // 타임스탬프 생성
    const timestamp = new Date().toISOString()
        .replace(/[-:]/g, '')
        .replace(/\..+/, '')
        .replace('T', '_');
    
    // 파일명 생성
    const baseName = projectName || 'NewProject';
    const safeName = baseName.replace(/[/\\?%*:|"<>]/g, '-');
    const fullName = `${safeName}_${timestamp}`;
    const filename = `${fullName}.prproj`;
    
    // 저장 경로 결정
    let targetPath;
    
    if (savePath) {
        // 서버에서 전달받은 경로 사용
        targetPath = savePath.replace(/\\/g, '/');
    } else {
        // 기본값: Desktop/inbox
        const homeDir = os.homedir();
        targetPath = `${homeDir}/Desktop/inbox`.replace(/\\/g, '/');
    }
    
    log(`저장 경로: ${targetPath}`, 'info');
    savePathText.textContent = targetPath;
    
    // 폴더 확보 (inbox 폴더가 없으면 생성)
    let targetFolder;
    try {
        // file:// URL로 변환
        const folderUrl = `file:///${targetPath.replace(/^\//, '')}`;
        targetFolder = await fs.getEntryWithUrl(folderUrl);
        log('폴더 확인됨', 'info');
    } catch (e) {
        // inbox 폴더가 없으면 Desktop에 생성
        log('inbox 폴더 생성 중...', 'info');
        try {
            const desktopUrl = `file:///${os.homedir().replace(/\\/g, '/')}/Desktop`.replace(/^\//, '');
            const desktopFolder = await fs.getEntryWithUrl(desktopUrl);
            targetFolder = await desktopFolder.createFolder('inbox');
            log('inbox 폴더 생성됨', 'success');
        } catch (createError) {
            throw new Error(`폴더 접근 실패: ${createError.message}`);
        }
    }
    
    // 프로젝트 전체 경로
    const projectPath = `${targetFolder.nativePath}\\${filename}`;
    log(`프로젝트 경로: ${projectPath}`, 'info');
    
    // 프로젝트 생성
    log('Premiere Pro API 호출 중...', 'info');
    const newProject = await Project.createProject(projectPath);
    
    // 시퀀스 생성 (요청된 경우)
    if (sequenceName) {
        log(`시퀀스 생성: ${sequenceName}`, 'info');
        await newProject.createSequence(sequenceName, '');
    }
    
    return newProject;
}

// ===================================
// Manual Test Button
// ===================================
testBtn.addEventListener('click', async () => {
    if (!isConnected) {
        log('서버에 연결되어 있지 않습니다', 'error');
        return;
    }
    
    testBtn.disabled = true;
    
    try {
        log('수동 테스트 시작...', 'info');
        const result = await createNewProject({
            projectName: 'ManualTest',
            sequenceName: null,
            savePath: null
        });
        log(`✅ 테스트 성공: ${result.name}`, 'success');
    } catch (error) {
        log(`❌ 테스트 실패: ${error.message}`, 'error');
    }
    
    testBtn.disabled = false;
});

// ===================================
// Initialize
// ===================================
function init() {
    // 로그 초기화
    logContainer.innerHTML = '';
    
    log('🚀 플러그인 초기화', 'info');
    log(`WebSocket 서버: ${WS_SERVER}`, 'info');
    
    // 기본 저장 경로 표시
    const defaultPath = `${os.homedir()}/Desktop/inbox`.replace(/\\/g, '/');
    savePathText.textContent = defaultPath;
    
    // 서버 연결 시작
    connect();
}

// 페이지 로드 시 초기화
init();
