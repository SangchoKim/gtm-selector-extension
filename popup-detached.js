// GTM 셀렉터 헬퍼 - 독립 창 스크립트

class DetachedPopupController {
  constructor() {
    try {
      this.selectedElement = null;
      this.isInspectorActive = false;
      this.currentTabId = null;

      this.initializeElements();
      this.initializeEventListeners();
      this.initializeWindow();
      this.getCurrentTab();

      console.log('Detached Popup Controller initialized');
    } catch (error) {
      console.error('Detached Popup initialization error:', error);
      document.body.innerHTML =
        '<div style="padding: 20px; text-align: center; color: #dc2626;">오류가 발생했습니다. 페이지를 새로고침해 주세요.</div>';
    }
  }

  initializeElements() {
    // UI 요소들 참조
    this.elements = {};
    const elementIds = [
      'inspectorToggle',
      'selectedElement',
      'elementName',
      'selectedPath',
      'copyPathBtn',
      'emptyState',
      'selectedSummary',
      'summaryElementTag',
      'summaryElementDesc',
      'summaryElementPath',
      'summaryElementCopyBtn',
      'selectorsList',
      'settingsBtn',
      'helpBtn',
      'toast',
      'toastMessage',
      'minimizeBtn',
      'closeBtn',
    ];

    elementIds.forEach((id) => {
      const element = document.getElementById(id);
      if (!element) {
        console.error(`Element with id '${id}' not found`);
      }
      this.elements[id] = element;
    });

    // 필수 요소 확인
    if (!this.elements.inspectorToggle || !this.elements.toast) {
      throw new Error('Required UI elements not found');
    }
  }

  initializeEventListeners() {
    // 검사 모드 토글
    if (this.elements.inspectorToggle) {
      this.elements.inspectorToggle.addEventListener('change', (e) => {
        this.toggleInspector(e.target.checked);
      });
    }

    // 복사 버튼 이벤트 (이벤트 위임)
    document.addEventListener('click', (e) => {
      if (e.target.closest('.copy-btn')) {
        const button = e.target.closest('.copy-btn');

        // 선택된 요소 경로 복사 버튼인지 확인
        if (button.id === 'copyPathBtn') {
          const path = this.elements.selectedPath?.textContent;
          if (path) {
            this.copyToClipboard(path, true);
          }
          return;
        }

        // 요약 섹션 복사 버튼인지 확인
        if (button.id === 'summaryElementCopyBtn') {
          const path = this.elements.summaryElementPath?.textContent;
          if (path) {
            this.copyToClipboard(path, true);
          }
          return;
        }

        // 일반 셀렉터 복사 버튼
        const selector = button.dataset.selector;
        if (selector) {
          this.copyToClipboard(selector);
        }
      }
    });

    // 창 컨트롤 버튼
    if (this.elements.minimizeBtn) {
      this.elements.minimizeBtn.addEventListener('click', () => {
        window.minimize?.() || console.log('Minimize not supported');
      });
    }

    if (this.elements.closeBtn) {
      this.elements.closeBtn.addEventListener('click', () => {
        window.close();
      });
    }

    // 푸터 버튼 이벤트
    if (this.elements.settingsBtn) {
      this.elements.settingsBtn.addEventListener('click', () => {
        this.openSettings();
      });
    }

    if (this.elements.helpBtn) {
      this.elements.helpBtn.addEventListener('click', () => {
        this.openHelp();
      });
    }

    // Chrome extension 메시지 리스너
    if (chrome?.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
        return true;
      });
    }

    // 창 닫기 전 정리
    window.addEventListener('beforeunload', () => {
      this.cleanup();
    });
  }

  initializeWindow() {
    // 창 타이틀 설정
    document.title = 'GTM 셀렉터 헬퍼 - 독립 창';

    // 창 크기 조정 가능하도록 설정
    if (window.resizeTo) {
      window.resizeTo(440, 600);
    }

    // 포커스 설정
    window.focus();
  }

  async getCurrentTab() {
    try {
      if (chrome?.tabs?.query) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
          this.currentTabId = tab.id;
          await this.checkExtensionStatus();
        }
      }
    } catch (error) {
      console.error('Failed to get current tab:', error);
    }
  }

  async checkExtensionStatus() {
    try {
      if (!chrome?.runtime?.sendMessage) {
        console.log('Chrome runtime not available');
        return;
      }

      const response = await chrome.runtime.sendMessage({
        action: 'getTabState',
        tabId: this.currentTabId,
      });

      if (response) {
        this.updateStatus(response.isInspectorActive, response.selectedElement);
      }
    } catch (error) {
      console.error('Failed to check extension status:', error);
    }
  }

  updateStatus(isActive, selectedElement) {
    this.isInspectorActive = isActive;
    this.selectedElement = selectedElement;

    if (this.elements.inspectorToggle) {
      this.elements.inspectorToggle.checked = isActive;
    }

    this.updateUIState();
  }

  updateUIState() {
    // 선택된 요소 표시
    if (this.selectedElement) {
      this.elements.selectedElement.style.display = 'flex';
      this.elements.elementName.textContent = this.getElementDisplayName(this.selectedElement);

      // 선택된 요소의 경로 표시
      const elementPath = this.generateElementPath(this.selectedElement);
      if (this.elements.selectedPath) {
        this.elements.selectedPath.textContent = elementPath;
      }

      this.showSelectorsList();
    } else {
      this.elements.selectedElement.style.display = 'none';
      this.hideSelectorsList();
    }
  }

  async toggleInspector(isActive) {
    try {
      if (!this.currentTabId) {
        this.showToast('탭 정보를 가져올 수 없습니다.');
        this.elements.inspectorToggle.checked = false;
        return;
      }

      // URL이 제한된 프로토콜인지 확인
      const tab = await chrome.tabs.get(this.currentTabId);
      if (
        !tab.url ||
        tab.url.startsWith('chrome://') ||
        tab.url.startsWith('chrome-extension://')
      ) {
        this.showToast('이 페이지에서는 익스텐션을 사용할 수 없습니다.');
        this.elements.inspectorToggle.checked = false;
        return;
      }

      // content script 강제 주입 및 토글
      try {
        // 기존 스크립트 정리
        await chrome.scripting.executeScript({
          target: { tabId: this.currentTabId },
          func: () => {
            if (window.gtmSelectorHelper) {
              try {
                window.gtmSelectorHelper.deactivateInspector();
              } catch (e) {}
              window.gtmSelectorHelper = null;
            }
          },
        });

        // CSS 및 content script 주입
        await chrome.scripting.insertCSS({
          target: { tabId: this.currentTabId },
          files: ['content.css'],
        });

        await chrome.scripting.executeScript({
          target: { tabId: this.currentTabId },
          files: ['content.js'],
        });

        // 초기화 대기
        await new Promise((resolve) => setTimeout(resolve, 300));

        // 초기화 확인
        const [initResult] = await chrome.scripting.executeScript({
          target: { tabId: this.currentTabId },
          func: () => (window.gtmSelectorHelper ? 'ready' : 'not ready'),
        });

        if (initResult.result !== 'ready') {
          throw new Error('Content script initialization failed');
        }
      } catch (scriptError) {
        console.error('Script injection error:', scriptError);
        this.showToast('스크립트 주입에 실패했습니다. 페이지를 새로고침 후 다시 시도해주세요.');
        this.elements.inspectorToggle.checked = false;
        return;
      }

      // content script에 토글 명령 전송
      let response = null;
      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts && !response) {
        try {
          response = await chrome.tabs.sendMessage(this.currentTabId, {
            action: 'toggleInspector',
            isActive: isActive,
          });
          break;
        } catch (messageError) {
          attempts++;
          if (attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
      }

      if (response && response.success) {
        this.isInspectorActive = isActive;

        // background script에 상태 알리기
        chrome.runtime.sendMessage({
          action: 'toggleInspector',
          isActive: isActive,
        });

        if (isActive) {
          this.showToast('검사 모드가 활성화되었습니다. 페이지에서 요소를 클릭하세요.');
        } else {
          this.showToast('검사 모드가 비활성화되었습니다.');
          this.clearSelection();
        }
      } else {
        this.elements.inspectorToggle.checked = false;
        this.showToast('검사 모드를 활성화할 수 없습니다.');
      }
    } catch (error) {
      console.error('Toggle inspector error:', error);
      this.elements.inspectorToggle.checked = false;
      this.showToast('오류가 발생했습니다. 페이지를 새로고침해 주세요.');
    }
  }

  handleMessage(message, sender, sendResponse) {
    console.log('Detached popup received message:', message);

    switch (message.action) {
      case 'elementSelected':
        this.selectedElement = message.elementInfo;
        this.updateUIState();
        this.showToast('요소가 선택되었습니다.');

        // background script에도 알리기
        chrome.runtime
          .sendMessage({
            action: 'elementSelected',
            elementInfo: message.elementInfo,
          })
          .catch((error) => {
            console.log('Failed to notify background script:', error);
          });
        break;

      case 'setSelectedElement':
        console.log('Setting selected element from background:', message.elementInfo);
        this.selectedElement = message.elementInfo;
        this.updateUIState();
        this.showSelectorsList();
        this.showToast('셀렉터가 로드되었습니다.');
        break;

      case 'inspectorDeactivated':
        this.isInspectorActive = false;
        this.elements.inspectorToggle.checked = false;

        // background script에도 알리기
        chrome.runtime
          .sendMessage({
            action: 'toggleInspector',
            isActive: false,
          })
          .catch((error) => {
            console.log('Failed to notify background script:', error);
          });
        break;
    }

    // 응답 보내기
    if (sendResponse) {
      sendResponse({ received: true });
    }
  }

  getElementDisplayName(elementInfo) {
    if (elementInfo.id) {
      return `#${elementInfo.id}`;
    } else if (elementInfo.className) {
      const classes = elementInfo.className.split(' ').filter((c) => c.length > 0);
      return `.${classes.slice(0, 2).join('.')}${classes.length > 2 ? '...' : ''}`;
    } else {
      return `<${elementInfo.tagName.toLowerCase()}>`;
    }
  }

  generateElementPath(elementInfo) {
    if (!elementInfo || !elementInfo.path) {
      // 기본 경로 생성
      let path = elementInfo.tagName.toLowerCase();

      if (elementInfo.id) {
        path += `#${elementInfo.id}`;
      } else if (elementInfo.className) {
        const classes = elementInfo.className.split(' ').filter((c) => c.length > 0);
        if (classes.length > 0) {
          path += `.${classes.slice(0, 2).join('.')}`;
        }
      }

      // data attributes 추가
      if (elementInfo.attributes) {
        const dataAttrs = Object.entries(elementInfo.attributes)
          .filter(([name]) => name.startsWith('data-'))
          .slice(0, 2);

        if (dataAttrs.length > 0) {
          dataAttrs.forEach(([name, value]) => {
            path += `[${name}="${value}"]`;
          });
        }
      }

      return path;
    }

    return elementInfo.path;
  }

  showSelectorsList() {
    this.elements.emptyState.style.display = 'none';
    this.elements.selectedSummary.style.display = 'block';
    this.elements.selectorsList.style.display = 'block';

    // 요약 정보 업데이트
    this.updateSummaryDisplay();

    if (this.selectedElement && this.selectedElement.selectors) {
      this.updateSelectorsDisplay(this.selectedElement.selectors);
    }
  }

  hideSelectorsList() {
    this.elements.emptyState.style.display = 'block';
    this.elements.selectedSummary.style.display = 'none';
    this.elements.selectorsList.style.display = 'none';
  }

  updateSummaryDisplay() {
    if (!this.selectedElement) return;

    // 태그 이름 표시
    if (this.elements.summaryElementTag) {
      this.elements.summaryElementTag.textContent =
        this.selectedElement.tagName?.toLowerCase() || 'element';
    }

    // 설명 표시
    if (this.elements.summaryElementDesc) {
      const desc = this.getElementDisplayName(this.selectedElement);
      this.elements.summaryElementDesc.textContent = desc;
    }

    // 경로 표시
    if (this.elements.summaryElementPath) {
      const path = this.generateElementPath(this.selectedElement);
      this.elements.summaryElementPath.textContent = path;
    }
  }

  updateSelectorsDisplay(selectors) {
    if (!selectors || selectors.length === 0) return;

    // 동적으로 셀렉터 카드들 생성
    this.elements.selectorsList.innerHTML = '';

    selectors.forEach((selector) => {
      const card = this.createSelectorCard(selector);
      this.elements.selectorsList.appendChild(card);
    });
  }

  createSelectorCard(selector) {
    const card = document.createElement('div');
    card.className = 'selector-card';

    const iconClass = this.getSelectorIconClass(selector.type);
    const icon = this.getSelectorIcon(selector.type);

    const gtmSelectorValue = selector.gtmSelector || selector.selector;
    const displaySelector = selector.selector || selector.value;

    card.innerHTML = `
      <div class="selector-header">
        <div class="selector-info">
          <div class="selector-icon ${iconClass}">
            ${icon}
          </div>
          <div class="selector-details">
            <div class="selector-badge">${selector.type}</div>
            <p class="selector-description">${selector.description}</p>
          </div>
        </div>
        <div class="selector-actions">
          <button class="copy-btn" data-selector="${displaySelector}" title="기본 셀렉터 복사">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
              <path d="m4 16c-1.1 0-2-.9-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
            </svg>
          </button>
          <button class="copy-btn gtm-copy-btn" data-selector="${gtmSelectorValue}" title="GTM용 셀렉터 복사">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
              <rect width="8" height="4" x="8" y="2" rx="1" ry="1"/>
            </svg>
            GTM
          </button>
        </div>
      </div>
      <div class="selector-code">
        <div class="selector-code-section">
          <div class="selector-label">기본 셀렉터:</div>
          <code>${displaySelector}</code>
        </div>
        <div class="selector-code-section gtm-selector">
          <div class="selector-label">GTM 셀렉터:</div>
          <code>${gtmSelectorValue}</code>
        </div>
      </div>
    `;

    return card;
  }

  getSelectorIconClass(type) {
    const classes = {
      ID: 'green',
      Class: 'blue',
      Attribute: 'green',
      Structural: 'orange',
    };
    return classes[type] || 'blue';
  }

  getSelectorIcon(type) {
    const icons = {
      ID: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 12l2 2 4-4"/>
                <path d="M21 12c.552 0 1-.448 1-1V5c0-.552-.448-1-1-1H3c-.552 0-1 .448-1 1v6c0 .552.448 1 1 1h18z"/>
                <path d="M21 12v6c0 .552-.448 1-1 1H3c-.552 0-1-.448-1-1v-6"/>
              </svg>`,
      Class: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>`,
      Attribute: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M9 12l2 2 4-4"/>
                      <path d="M21 12c.552 0 1-.448 1-1V5c0-.552-.448-1-1-1H3c-.552 0-1 .448-1 1v6c0 .552.448 1 1 1h18z"/>
                      <path d="M21 12v6c0 .552-.448 1-1 1H3c-.552 0-1-.448-1-1v-6"/>
                    </svg>`,
      Structural: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                       <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                       <path d="M12 9v4"/>
                       <path d="M12 17h.01"/>
                     </svg>`,
    };
    return icons[type] || icons['Class'];
  }

  async copyToClipboard(selector, isPath = false) {
    try {
      await navigator.clipboard.writeText(selector);

      if (isPath) {
        this.showToast(`요소 경로가 복사되었습니다: ${selector}`);
      } else {
        this.showToast(`셀렉터가 복사되었습니다: ${selector}`);
      }
    } catch (error) {
      console.error('Copy failed:', error);
      this.showToast('복사에 실패했습니다.');
    }
  }

  clearSelection() {
    this.selectedElement = null;
    this.updateUIState();
  }

  showToast(message) {
    if (!this.elements.toast || !this.elements.toastMessage) return;

    this.elements.toastMessage.textContent = message;
    this.elements.toast.classList.add('show');

    setTimeout(() => {
      this.elements.toast.classList.remove('show');
    }, 3000);
  }

  openSettings() {
    this.showToast('설정 기능을 준비 중입니다.');
  }

  openHelp() {
    this.showToast('도움말을 준비 중입니다.');
  }

  cleanup() {
    // 검사 모드 비활성화
    if (this.isInspectorActive && this.currentTabId) {
      try {
        chrome.tabs.sendMessage(this.currentTabId, {
          action: 'toggleInspector',
          isActive: false,
        });
      } catch (error) {
        console.log('Cleanup message failed:', error);
      }
    }
  }
}

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
  try {
    new DetachedPopupController();
  } catch (error) {
    console.error('Failed to initialize detached popup:', error);
    document.body.innerHTML =
      '<div style="padding: 20px; text-align: center; color: #dc2626;">오류가 발생했습니다. 페이지를 새로고침해 주세요.</div>';
  }
});
