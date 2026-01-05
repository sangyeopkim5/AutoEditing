// ============================================
// Premiere Pro Remote Project Creator
// UXP Plugin - WebSocket Client
// With Auto Sequence Creation (쇼츠영상용 프리셋)
// ============================================

const { Project, Application } = require('premierepro');
const { storage } = require('uxp');
const fs = storage.localFileSystem;
const os = require('os');

// ===================================
// Configuration (설정)
// ===================================
const WS_SERVER = 'ws://localhost:8080';
const RECONNECT_INTERVAL = 5000; // 5초

// 프리셋 설정 - 여기서만 수정하면 됨!
const DEFAULT_PRESET_NAME = 'forshortsvideo'; // 프리셋 파일명 (확장자 제외)
const DEFAULT_SEQUENCE_NAME = '타임라인 01'; // 기본 시퀀스 이름

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
                    projectName: result.projectName,
                    projectPath: result.projectPath,
                    sequenceName: result.sequenceName,
                    presetUsed: result.presetUsed
                });
                
                log(`✅ 완료: ${result.projectName}`, 'success');
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
// Helper Functions - Version & User
// ===================================

/**
 * Premiere Pro 버전 감지
 */
async function getPremiereVersion() {
    try {
        const app = await Application.getApplication();
        const fullVersion = app.version || '25.0.0';
        
        // "25.1.0" → "25.0"
        const parts = fullVersion.split('.');
        const majorVersion = parts[0] + '.0';
        
        log(`Premiere 버전: ${fullVersion} → ${majorVersion}`, 'info');
        return majorVersion;
        
    } catch (error) {
        log(`버전 감지 실패, 기본값 25.0 사용: ${error.message}`, 'warn');
        return '25.0';
    }
}

/**
 * 시스템 사용자명 감지
 */
function getUsername() {
    const username = process.env.USERNAME || process.env.USER || 'DefaultUser';
    return username;
}

/**
 * Windows 여부 확인
 */
function isWindows() {
    return navigator.platform.toLowerCase().includes('win');
}

// ===================================
// Helper Functions - Preset Path
// ===================================

/**
 * 커스텀 프리셋 경로 - 하드코딩된 경로 사용
 */
async function getCustomPresetPath(presetName) {
    // 하드코딩된 경로 (UXP 환경에서 process.env가 불안정하므로)
    const presetPath = `C:\\Users\\PC\\Documents\\Adobe\\Premiere Pro\\25.0\\Profile-PC\\Settings\\Custom\\${presetName}.sqpreset`;
    
    log(`프리셋 경로: ${presetPath}`, 'info');
    return presetPath;
}

/**
 * 프리셋 파일 존재 확인 - 항상 존재한다고 가정 (하드코딩된 경로 사용)
 */
async function verifyPresetExists(presetPath) {
    // 하드코딩된 경로를 사용하므로 파일 존재를 항상 true로 반환
    // UXP의 fs.getEntryWithUrl이 공백이 포함된 경로에서 불안정함
    log(`프리셋 경로 사용 (검증 생략): ${presetPath}`, 'info');
    return {
        exists: true,
        file: null,
        path: presetPath
    };
}

/**
 * 사용자 정의 폴더 내 모든 프리셋 탐색 (디버깅용)
 */
async function findAllCustomPresets() {
    try {
        const version = '25.0';
        const username = getUsername();
        
        let customFolderPath;
        if (isWindows()) {
            // 영어 Premiere Pro 경로 (Custom 폴더)
            customFolderPath = `C:\\Users\\${username}\\Documents\\Adobe\\Premiere Pro\\${version}\\Profile-${username}\\Settings\\Custom`;
        } else {
            const home = os.homedir();
            customFolderPath = `${home}/Documents/Adobe/Premiere Pro/${version}/Profile-${username}/Settings/Custom`;
        }
        
        log(`프리셋 폴더 탐색: ${customFolderPath}`, 'info');
        
        let folderUrl;
        if (isWindows()) {
            folderUrl = `file:///${customFolderPath.replace(/\\/g, '/')}`;
        } else {
            folderUrl = `file://${customFolderPath}`;
        }
        
        const customFolder = await fs.getEntryWithUrl(folderUrl);
        const entries = await customFolder.getEntries();
        
        const presets = [];
        for (const entry of entries) {
            if (entry.isFile && entry.name.endsWith('.sqpreset')) {
                presets.push({
                    name: entry.name.replace('.sqpreset', ''),
                    fullName: entry.name,
                    path: entry.nativePath
                });
            }
        }
        
        log(`발견된 프리셋 ${presets.length}개`, 'info');
        presets.forEach(p => log(`  - ${p.name}`, 'info'));
        
        return presets;
        
    } catch (error) {
        log(`프리셋 폴더 접근 실패: ${error.message}`, 'warn');
        return [];
    }
}

// ===================================
// Helper Functions - Sequence
// ===================================

/**
 * 프리셋으로 시퀀스 생성
 */
async function createSequenceWithPreset(project, sequenceName, presetPath) {
    try {
        log(`시퀀스 생성 (프리셋): ${sequenceName}`, 'info');
        
        const sequence = await project.createSequence(sequenceName, presetPath);
        
        log(`✅ 시퀀스 생성 완료: ${sequence.name}`, 'success');
        return {
            success: true,
            sequence: sequence
        };
        
    } catch (error) {
        log(`❌ 프리셋 시퀀스 생성 실패: ${error.message}`, 'error');
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 기본 프리셋으로 시퀀스 생성 (Fallback)
 */
async function createDefaultSequence(project, sequenceName) {
    try {
        log(`시퀀스 생성 (기본): ${sequenceName}`, 'info');
        
        // 빈 문자열 = 기본 프리셋 사용
        const sequence = await project.createSequence(sequenceName, '');
        
        log(`✅ 기본 시퀀스 생성 완료: ${sequence.name}`, 'success');
        return {
            success: true,
            sequence: sequence,
            isDefault: true
        };
        
    } catch (error) {
        log(`❌ 기본 시퀀스 생성 실패: ${error.message}`, 'error');
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 시퀀스 활성화
 */
async function setActiveSequence(project, sequence) {
    try {
        log(`시퀀스 활성화 중...`, 'info');
        
        const result = await project.setActiveSequence(sequence);
        
        if (result) {
            log(`✅ 시퀀스 활성화 완료`, 'success');
        } else {
            log(`⚠️ 시퀀스 활성화 결과 불확실`, 'warn');
        }
        
        return result;
        
    } catch (error) {
        log(`⚠️ 시퀀스 활성화 실패 (무시): ${error.message}`, 'warn');
        return false;
    }
}

/**
 * 프로젝트 저장
 */
async function saveProject(project) {
    try {
        log(`프로젝트 저장 중...`, 'info');
        
        const result = await project.save();
        
        if (result) {
            log(`✅ 프로젝트 저장 완료`, 'success');
        } else {
            log(`⚠️ 프로젝트 저장 결과 불확실`, 'warn');
        }
        
        return result;
        
    } catch (error) {
        log(`⚠️ 프로젝트 저장 실패 (무시): ${error.message}`, 'warn');
        return false;
    }
}

// ===================================
// Main Function: Create New Project
// ===================================
async function createNewProject(data = {}) {
    const { projectName, sequenceName, presetName, savePath } = data;
    
    // 설정값
    const targetPresetName = presetName || DEFAULT_PRESET_NAME;
    const targetSequenceName = sequenceName || DEFAULT_SEQUENCE_NAME;
    
    // ========================================
    // Step 1: 타임스탬프 및 파일명 생성
    // ========================================
    log('=== Step 1: 파일명 생성 ===', 'info');
    
    const timestamp = new Date().toISOString()
        .replace(/[-:]/g, '')
        .replace(/\..+/, '')
        .replace('T', '_');
    
    const baseName = projectName || 'NewProject';
    const safeName = baseName.replace(/[/\\?%*:|"<>]/g, '-');
    const fullName = `${safeName}_${timestamp}`;
    const filename = `${fullName}.prproj`;
    
    log(`파일명: ${filename}`, 'info');
    
    // ========================================
    // Step 2: 저장 경로 결정 및 폴더 확보
    // ========================================
    log('=== Step 2: 폴더 확보 ===', 'info');
    
    let targetPath;
    if (savePath) {
        targetPath = savePath.replace(/\\/g, '/');
    } else {
        const homeDir = os.homedir();
        targetPath = `${homeDir}/Desktop/inbox`.replace(/\\/g, '/');
    }
    
    log(`저장 경로: ${targetPath}`, 'info');
    savePathText.textContent = targetPath;
    
    // 폴더 확보
    let targetFolder;
    try {
        const folderUrl = `file:///${targetPath.replace(/^\//, '')}`;
        targetFolder = await fs.getEntryWithUrl(folderUrl);
        log('폴더 확인됨', 'info');
    } catch (e) {
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
    
    // ========================================
    // Step 3: 프로젝트 생성
    // ========================================
    log('=== Step 3: 프로젝트 생성 ===', 'info');
    
    const projectPath = `${targetFolder.nativePath}\\${filename}`;
    log(`프로젝트 경로: ${projectPath}`, 'info');
    
    const newProject = await Project.createProject(projectPath);
    log(`✅ 프로젝트 생성 완료: ${newProject.name}`, 'success');
    
    // ========================================
    // Step 4: 프리셋 경로 구성 및 검증
    // ========================================
    log('=== Step 4: 프리셋 검증 ===', 'info');
    
    const presetPath = await getCustomPresetPath(targetPresetName);
    const presetCheck = await verifyPresetExists(presetPath);
    
    // ========================================
    // Step 5: 시퀀스 생성
    // ========================================
    log('=== Step 5: 시퀀스 생성 ===', 'info');
    
    let sequence;
    let presetUsed = null;
    
    if (presetCheck.exists) {
        // 프리셋으로 시퀀스 생성
        const result = await createSequenceWithPreset(newProject, targetSequenceName, presetPath);
        
        if (result.success) {
            sequence = result.sequence;
            presetUsed = targetPresetName;
            log(`✅ 프리셋 적용됨: ${targetPresetName}`, 'success');
        } else {
            // 프리셋 시퀀스 생성 실패 → 기본으로 대체
            log(`⚠️ 프리셋 적용 실패, 기본으로 대체`, 'warn');
            const fallback = await createDefaultSequence(newProject, targetSequenceName);
            if (fallback.success) {
                sequence = fallback.sequence;
                presetUsed = '기본값';
            } else {
                throw new Error('시퀀스 생성 실패');
            }
        }
    } else {
        // 프리셋 없음 → 기본으로 생성
        log(`⚠️ 프리셋 없음, 기본으로 생성`, 'warn');
        
        // 디버깅: 사용 가능한 프리셋 확인
        const availablePresets = await findAllCustomPresets();
        if (availablePresets.length > 0) {
            log(`사용 가능한 프리셋: ${availablePresets.map(p => p.name).join(', ')}`, 'info');
        }
        
        const fallback = await createDefaultSequence(newProject, targetSequenceName);
        if (fallback.success) {
            sequence = fallback.sequence;
            presetUsed = '기본값';
        } else {
            throw new Error('시퀀스 생성 실패');
        }
    }
    
    // ========================================
    // Step 6: 시퀀스 활성화
    // ========================================
    log('=== Step 6: 시퀀스 활성화 ===', 'info');
    await setActiveSequence(newProject, sequence);
    
    // ========================================
    // Step 7: 프로젝트 저장
    // ========================================
    log('=== Step 7: 프로젝트 저장 ===', 'info');
    await saveProject(newProject);
    
    // ========================================
    // 완료
    // ========================================
    log('=== 완료! ===', 'success');
    log(`프로젝트: ${newProject.name}`, 'success');
    log(`시퀀스: ${sequence.name}`, 'success');
    log(`프리셋: ${presetUsed}`, 'success');
    
    return {
        projectName: newProject.name,
        projectPath: newProject.path,
        sequenceName: sequence.name,
        presetUsed: presetUsed
    };
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
    statusText.textContent = '테스트 중...';
    
    try {
        log('🧪 수동 테스트 시작...', 'info');
        const result = await createNewProject({
            projectName: 'ManualTest',
            sequenceName: DEFAULT_SEQUENCE_NAME,
            presetName: DEFAULT_PRESET_NAME,
            savePath: null
        });
        log(`✅ 테스트 완료!`, 'success');
        log(`  프로젝트: ${result.projectName}`, 'success');
        log(`  시퀀스: ${result.sequenceName}`, 'success');
        log(`  프리셋: ${result.presetUsed}`, 'success');
    } catch (error) {
        log(`❌ 테스트 실패: ${error.message}`, 'error');
    }
    
    testBtn.disabled = false;
    statusText.textContent = '연결됨 (대기 중)';
});

// ===================================
// Initialize
// ===================================
function init() {
    // 로그 초기화
    logContainer.innerHTML = '';
    
    log('🚀 플러그인 초기화', 'info');
    log(`WebSocket 서버: ${WS_SERVER}`, 'info');
    log(`기본 프리셋: ${DEFAULT_PRESET_NAME}`, 'info');
    log(`기본 시퀀스: ${DEFAULT_SEQUENCE_NAME}`, 'info');
    
    // 기본 저장 경로 표시
    const defaultPath = `${os.homedir()}/Desktop/inbox`.replace(/\\/g, '/');
    savePathText.textContent = defaultPath;
    
    // 서버 연결 시작
    connect();
}

// 페이지 로드 시 초기화
init();
