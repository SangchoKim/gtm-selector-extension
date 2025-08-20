// GTM 셀렉터 헬퍼 - Background Script (Service Worker)
class BackgroundService {
  constructor() {
    this.initializeEventListeners();
    this.extensionState = new Map(); // 탭별 상태 관리
  }

  initializeEventListeners() {
    // 익스텐션 설치/업데이트 시
    chrome.runtime.onInstalled.addListener((details) => {
      this.handleInstallation(details);
    });

    // 메시지 리스너
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
    });

    // 탭 업데이트 리스너
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      this.handleTabUpdate(tabId, changeInfo, tab);
    });

    // 탭 제거 리스너
    chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
      this.handleTabRemoved(tabId, removeInfo);
    });

    // 액션 버튼 클릭 리스너
    chrome.action.onClicked.addListener((tab) => {
      this.handleActionClick(tab);
    });
  }

  handleInstallation(details) {
    console.log('GTM Selector Helper installed:', details);

    if (details.reason === 'install') {
      // 설치 시 환영 페이지 열기 (선택사항)
      this.showWelcomeMessage();
    } else if (details.reason === 'update') {
      // 업데이트 시 변경사항 알림 (선택사항)
      console.log('Extension updated to version:', chrome.runtime.getManifest().version);
    }
  }

  handleMessage(message, sender, sendResponse) {
    const tabId = sender.tab?.id;

    switch (message.action) {
      case 'getTabState':
        const state = this.getTabState(tabId);
        sendResponse(state);
        break;

      case 'setTabState':
        this.setTabState(tabId, message.state);
        sendResponse({ success: true });
        break;

      case 'inspectorActivated':
        this.setTabState(tabId, {
          isInspectorActive: true,
        });
        this.updateBadge(tabId, 'ON');
        sendResponse({ success: true });
        break;

      case 'inspectorDeactivated':
        this.setTabState(tabId, {
          isInspectorActive: false,
        });
        this.updateBadge(tabId, '');
        sendResponse({ success: true });
        break;

      case 'elementSelected':
        const currentState = this.getTabState(tabId);
        this.setTabState(tabId, {
          ...currentState,
          selectedElement: message.elementInfo,
          lastSelectedTime: Date.now(),
        });
        sendResponse({ success: true });
        break;

      case 'toggleInspector':
        this.setTabState(tabId, {
          isInspectorActive: message.isActive,
        });
        this.updateBadge(tabId, message.isActive ? 'ON' : '');
        sendResponse({ success: true });
        break;

      case 'openDetachedWindow':
        this.openDetachedWindowWithSelectors(message.elementInfo)
          .then(() => {
            sendResponse({ success: true });
          })
          .catch((error) => {
            console.error('Failed to open detached window:', error);
            sendResponse({ success: false, error: error.message });
          });
        return true; // 비동기 응답을 위해 true 반환

      case 'logEvent':
        this.logEvent(message.event, message.data);
        sendResponse({ success: true });
        break;

      default:
        sendResponse({
          success: false,
          error: 'Unknown action',
        });
    }
  }

  handleTabUpdate(tabId, changeInfo, tab) {
    // 페이지가 로드되면 상태 리셋
    if (changeInfo.status === 'complete') {
      this.resetTabState(tabId);
      this.updateBadge(tabId, '');
    }
  }

  handleTabRemoved(tabId, removeInfo) {
    // 탭이 닫히면 상태 정리
    this.extensionState.delete(tabId);
  }

  handleActionClick(tab) {
    // 액션 버튼 클릭 시 팝업이 열리므로 여기서는 특별한 처리 없음
    console.log('Action button clicked for tab:', tab.id);
  }

  getTabState(tabId) {
    return (
      this.extensionState.get(tabId) || {
        isInspectorActive: false,
        selectedElement: null,
        lastSelectedTime: null,
      }
    );
  }

  setTabState(tabId, state) {
    const currentState = this.getTabState(tabId);
    this.extensionState.set(tabId, {
      ...currentState,
      ...state,
    });
  }

  resetTabState(tabId) {
    this.extensionState.set(tabId, {
      isInspectorActive: false,
      selectedElement: null,
      lastSelectedTime: null,
    });
  }

  async updateBadge(tabId, text) {
    try {
      await chrome.action.setBadgeText({
        tabId: tabId,
        text: text,
      });

      if (text === 'ON') {
        await chrome.action.setBadgeBackgroundColor({
          tabId: tabId,
          color: '#10b981',
        });
      } else {
        await chrome.action.setBadgeBackgroundColor({
          tabId: tabId,
          color: '#6b7280',
        });
      }
    } catch (error) {
      console.error('Failed to update badge:', error);
    }
  }

  logEvent(event, data = {}) {
    // 사용량 분석을 위한 이벤트 로깅
    const logData = {
      timestamp: Date.now(),
      event: event,
      data: data,
      version: chrome.runtime.getManifest().version,
    };

    console.log('GTM Selector Helper Event:', logData);

    // 추후 분석 서비스 연동 가능
    this.saveEventToStorage(logData);
  }

  async saveEventToStorage(logData) {
    try {
      const result = await chrome.storage.local.get(['eventLogs']);
      const logs = result.eventLogs || [];

      // 최대 1000개 로그만 유지
      logs.push(logData);
      if (logs.length > 1000) {
        logs.splice(0, logs.length - 1000);
      }

      await chrome.storage.local.set({
        eventLogs: logs,
      });
    } catch (error) {
      console.error('Failed to save event log:', error);
    }
  }

  showWelcomeMessage() {
    // 환영 메시지 표시 (선택사항)
    console.log('Welcome to GTM Selector Helper!');

    // 추후 환영 페이지나 튜토리얼 페이지 열기
    // chrome.tabs.create({ url: 'welcome.html' });
  }

  // 컨텍스트 메뉴 추가 (추후 기능)
  async createContextMenus() {
    try {
      await chrome.contextMenus.removeAll();

      chrome.contextMenus.create({
        id: 'gtm-selector-helper-inspect',
        title: 'GTM 셀렉터 생성',
        contexts: ['all'],
      });

      chrome.contextMenus.onClicked.addListener((info, tab) => {
        if (info.menuItemId === 'gtm-selector-helper-inspect') {
          // 검사 모드 활성화
          chrome.tabs.sendMessage(tab.id, {
            action: 'toggleInspector',
            isActive: true,
          });
        }
      });
    } catch (error) {
      console.error('Failed to create context menus:', error);
    }
  }

  // 통계 및 상태 조회
  async getExtensionStats() {
    try {
      const result = await chrome.storage.local.get(['eventLogs']);
      const logs = result.eventLogs || [];

      const stats = {
        totalEvents: logs.length,
        selectionsToday: logs.filter(
          (log) =>
            log.event === 'elementSelected' && Date.now() - log.timestamp < 24 * 60 * 60 * 1000
        ).length,
        activeTabs: this.extensionState.size,
        lastUsed: logs.length > 0 ? Math.max(...logs.map((log) => log.timestamp)) : null,
      };

      return stats;
    } catch (error) {
      console.error('Failed to get extension stats:', error);
      return {};
    }
  }

  // 설정 관리
  async getSettings() {
    try {
      const result = await chrome.storage.sync.get(['settings']);
      return (
        result.settings || {
          autoHighlight: true,
          showTooltips: true,
          preferDataAttributes: true,
          maxSelectorLength: 100,
        }
      );
    } catch (error) {
      console.error('Failed to get settings:', error);
      return {};
    }
  }

  async saveSettings(settings) {
    try {
      await chrome.storage.sync.set({
        settings: settings,
      });
      return true;
    } catch (error) {
      console.error('Failed to save settings:', error);
      return false;
    }
  }

  async openDetachedWindowWithSelectors(elementInfo) {
    try {
      console.log('Opening detached window with element info:', elementInfo);

      // detached window 생성
      const detachedWindow = await chrome.windows.create({
        url: chrome.runtime.getURL('popup-detached.html'),
        type: 'popup',
        width: 440,
        height: 620,
        focused: true,
      });

      // 창이 로드될 때까지 잠시 대기
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // 생성된 창의 탭에 선택된 요소 정보 전송
      const tabs = await chrome.tabs.query({ windowId: detachedWindow.id });
      if (tabs.length > 0) {
        const tabId = tabs[0].id;

        // detached window에 요소 정보 전송
        await chrome.tabs
          .sendMessage(tabId, {
            action: 'setSelectedElement',
            elementInfo: elementInfo,
          })
          .catch((error) => {
            console.log(
              'Failed to send element info to detached window, trying alternative approach:',
              error
            );

            // 대안: storage를 통해 데이터 전달
            chrome.storage.local.set({
              pendingElementInfo: elementInfo,
              pendingTimestamp: Date.now(),
            });
          });
      }

      console.log('Detached window opened successfully');
      return detachedWindow;
    } catch (error) {
      console.error('Error opening detached window:', error);
      throw error;
    }
  }
}

// Background service 초기화
const backgroundService = new BackgroundService();

// 전역 참조를 위해 self에 할당
self.backgroundService = backgroundService;
