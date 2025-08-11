// GTM 셀렉터 헬퍼 - 팝업 UI 컨트롤러
class PopupController {
  constructor() {
    this.isInspectorActive = false;
    this.currentTabId = null;
    this.selectedElement = null;
    this.selectors = [];

    this.initializeElements();
    this.initializeEventListeners();
    this.checkExtensionStatus();
  }

  initializeElements() {
    // UI 요소들 참조
    this.elements = {};
    const elementIds = [
      'statusBadge',
      'statusText',
      'inspectorToggle',
      'selectedElement',
      'elementName',
      'emptyState',
      'selectorsList',
      'settingsBtn',
      'helpBtn',
      'toast',
      'toastMessage',
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
    // 검사기 토글 이벤트
    if (this.elements.inspectorToggle) {
      this.elements.inspectorToggle.addEventListener('change', (e) => {
        this.toggleInspector(e.target.checked);
      });
    }

    // 복사 버튼 이벤트 (이벤트 위임)
    document.addEventListener('click', (e) => {
      if (e.target.closest('.copy-btn')) {
        const button = e.target.closest('.copy-btn');
        const selector = button.dataset.selector;
        if (selector) {
          this.copyToClipboard(selector);
        }
      }
    });

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

    // 메시지 리스너 (content script와 통신)
    if (chrome && chrome.runtime) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
      });
    }
  }

  async checkExtensionStatus() {
    try {
      // 현재 활성 탭 정보 가져오기
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab || !tab.id) {
        console.log('No active tab found');
        this.updateStatus(false);
        return;
      }

      this.currentTabId = tab.id;

      // 초기 상태는 비활성으로 설정 (content script가 아직 주입되지 않았으므로)
      this.updateStatus(false);
    } catch (error) {
      console.log('Failed to get tab info:', error);
      this.updateStatus(false);
    }
  }

  async toggleInspector(isActive) {
    try {
      if (!this.currentTabId) {
        this.showToast('탭 정보를 가져올 수 없습니다.');
        this.elements.inspectorToggle.checked = false;
        return;
      }

      // URL이 chrome:// 또는 file:// 등의 제한된 프로토콜인지 확인
      const tab = await chrome.tabs.get(this.currentTabId);
      if (
        !tab.url ||
        tab.url.startsWith('chrome://') ||
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('moz-extension://')
      ) {
        this.showToast('이 페이지에서는 익스텐션을 사용할 수 없습니다.');
        this.elements.inspectorToggle.checked = false;
        return;
      }

      // content script 강제 주입
      try {
        console.log('Injecting content script...');

        // 기존 스크립트 정리를 위한 코드 주입
        await chrome.scripting.executeScript({
          target: { tabId: this.currentTabId },
          func: () => {
            // 기존 GTM Helper 정리
            if (window.gtmSelectorHelper) {
              try {
                window.gtmSelectorHelper.deactivateInspector();
              } catch (e) {}
              window.gtmSelectorHelper = null;
            }
          },
        });

        // CSS 주입
        await chrome.scripting.insertCSS({
          target: { tabId: this.currentTabId },
          files: ['content.css'],
        });

        // content script 주입
        await chrome.scripting.executeScript({
          target: { tabId: this.currentTabId },
          files: ['content.js'],
        });

        // 스크립트 초기화 대기
        await new Promise((resolve) => setTimeout(resolve, 300));

        // 초기화 확인
        const [initResult] = await chrome.scripting.executeScript({
          target: { tabId: this.currentTabId },
          func: () => {
            return window.gtmSelectorHelper ? 'ready' : 'not ready';
          },
        });

        if (initResult.result !== 'ready') {
          throw new Error('Content script initialization failed');
        }

        console.log('Content script injected successfully');
      } catch (scriptError) {
        console.error('Script injection error:', scriptError);
        this.showToast('스크립트 주입에 실패했습니다. 페이지를 새로고침 후 다시 시도해주세요.');
        this.elements.inspectorToggle.checked = false;
        return;
      }

      // content script에 토글 명령 전송 (재시도 로직 포함)
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
          console.log(`Message attempt ${attempts} failed:`, messageError);
          if (attempts < maxAttempts) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
      }

      if (response && response.success) {
        this.isInspectorActive = isActive;
        this.updateUIState();

        if (isActive) {
          this.showToast('검사 모드가 활성화되었습니다. 페이지에서 요소를 클릭하세요.');
        } else {
          this.showToast('검사 모드가 비활성화되었습니다.');
          this.clearSelection();
        }
      } else {
        this.elements.inspectorToggle.checked = false;
        this.showToast('검사 모드를 활성화할 수 없습니다. 페이지를 새로고침 후 다시 시도해주세요.');
      }
    } catch (error) {
      console.error('Toggle inspector error:', error);
      this.elements.inspectorToggle.checked = false;

      if (error.message.includes('Cannot access')) {
        this.showToast('이 페이지에서는 익스텐션을 사용할 수 없습니다.');
      } else {
        this.showToast('오류가 발생했습니다. 페이지를 새로고침해 주세요.');
      }
    }
  }

  updateStatus(isActive, selectedElement = null) {
    this.isInspectorActive = isActive;
    this.selectedElement = selectedElement;

    // 토글 상태 업데이트
    this.elements.inspectorToggle.checked = isActive;

    this.updateUIState();
  }

  updateUIState() {
    // 상태 배지 업데이트
    if (this.isInspectorActive) {
      this.elements.statusBadge.classList.add('active');
      this.elements.statusText.textContent = '활성';
    } else {
      this.elements.statusBadge.classList.remove('active');
      this.elements.statusText.textContent = '대기';
    }

    // 선택된 요소 표시
    if (this.selectedElement) {
      this.elements.selectedElement.style.display = 'flex';
      this.elements.elementName.textContent = this.getElementDisplayName(this.selectedElement);
      this.showSelectorsList();
    } else {
      this.elements.selectedElement.style.display = 'none';
      this.hideSelectorsList();
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

  showSelectorsList() {
    this.elements.emptyState.style.display = 'none';
    this.elements.selectorsList.style.display = 'block';

    // 실제 셀렉터 데이터로 업데이트
    if (this.selectedElement && this.selectedElement.selectors) {
      this.updateSelectorsDisplay(this.selectedElement.selectors);
    }
  }

  hideSelectorsList() {
    this.elements.emptyState.style.display = 'block';
    this.elements.selectorsList.style.display = 'none';
  }

  updateSelectorsDisplay(selectors) {
    // 기존 동적 콘텐츠 제거
    const existingCards = this.elements.selectorsList.querySelectorAll(
      '.selector-card[data-dynamic="true"]'
    );
    existingCards.forEach((card) => card.remove());

    // 새로운 셀렉터 카드 생성
    selectors.forEach((selectorInfo, index) => {
      const card = this.createSelectorCard(selectorInfo, index);
      this.elements.selectorsList.appendChild(card);
    });

    // 기본 예시 카드들 숨기기
    const defaultCards = this.elements.selectorsList.querySelectorAll(
      '.selector-card:not([data-dynamic="true"])'
    );
    defaultCards.forEach((card) => {
      card.style.display = 'none';
    });
  }

  createSelectorCard(selectorInfo, index) {
    const card = document.createElement('div');
    card.className = 'selector-card';
    card.setAttribute('data-dynamic', 'true');

    const iconClass = this.getSelectorIconClass(selectorInfo.type);
    const iconSvg = this.getSelectorIconSvg(selectorInfo.type);

    card.innerHTML = `
      <div class="selector-header">
        <div class="selector-info">
          <div class="selector-icon ${iconClass}">
            ${iconSvg}
          </div>
          <div class="selector-details">
            <div class="selector-badge">${selectorInfo.type}</div>
            <p class="selector-description">${selectorInfo.description}</p>
          </div>
        </div>
        <button class="copy-btn" data-selector="${selectorInfo.selector}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
            <path d="m4 16c-1.1 0-2-.9-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
          </svg>
        </button>
      </div>
      <div class="selector-code">
        <code>${selectorInfo.selector}</code>
      </div>
    `;

    return card;
  }

  getSelectorIconClass(type) {
    const iconClasses = {
      ID: 'green',
      Class: 'blue',
      Attribute: 'green',
      'Data Attribute': 'green',
      Structural: 'orange',
      'Text Content': 'blue',
    };
    return iconClasses[type] || 'blue';
  }

  getSelectorIconSvg(type) {
    const iconSvgs = {
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
    return iconSvgs[type] || iconSvgs['Class'];
  }

  async copyToClipboard(selector) {
    try {
      await navigator.clipboard.writeText(selector);
      this.showToast(`셀렉터가 복사되었습니다: ${selector}`);
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
    if (!this.elements.toast || !this.elements.toastMessage) {
      console.warn('Toast elements not available:', message);
      return;
    }

    this.elements.toastMessage.textContent = message;
    this.elements.toast.classList.add('show');

    setTimeout(() => {
      if (this.elements.toast) {
        this.elements.toast.classList.remove('show');
      }
    }, 3000);
  }

  handleMessage(message, sender, sendResponse) {
    switch (message.action) {
      case 'elementSelected':
        this.selectedElement = message.elementInfo;
        this.updateUIState();
        this.showToast('요소가 선택되었습니다.');
        break;
      case 'inspectorDeactivated':
        this.isInspectorActive = false;
        this.elements.inspectorToggle.checked = false;
        this.updateUIState();
        break;
    }
  }

  openSettings() {
    this.showToast('설정 기능은 추후 업데이트될 예정입니다.');
  }

  openHelp() {
    const helpUrl = 'https://github.com/your-repo/gtm-css-selector/blob/main/README.md';
    chrome.tabs.create({ url: helpUrl });
  }
}

// DOM이 로드되면 PopupController 초기화
document.addEventListener('DOMContentLoaded', () => {
  try {
    new PopupController();
  } catch (error) {
    console.error('Failed to initialize PopupController:', error);

    // 기본 오류 메시지 표시
    const body = document.body;
    if (body) {
      body.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #dc2626;">
          <h3>익스텐션 초기화 실패</h3>
          <p>페이지를 새로고침하거나 익스텐션을 다시 설치해주세요.</p>
          <p style="font-size: 12px; margin-top: 10px;">오류: ${error.message}</p>
        </div>
      `;
    }
  }
});
