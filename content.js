// GTM 셀렉터 헬퍼 - Content Script
class GTMSelectorHelper {
  constructor() {
    this.isActive = false;
    this.selectedElement = null;
    this.hoveredElement = null;
    this.statusIndicator = null;
    this.overlay = null;
    this.tooltip = null;
    this.overlayPopup = null;

    this.boundHandlers = {
      mouseover: this.handleMouseOver.bind(this),
      mouseout: this.handleMouseOut.bind(this),
      click: this.handleClick.bind(this),
      keydown: this.handleKeyDown.bind(this),
    };

    this.initializeMessageListener();
  }

  initializeMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      // 비동기 응답을 위해 true 반환
      return true;
    });
  }

  handleMessage(message, sender, sendResponse) {
    switch (message.action) {
      case 'toggleInspector':
        this.toggleInspector(message.isActive);
        sendResponse({ success: true });
        break;
      case 'getStatus':
        sendResponse({
          isActive: this.isActive,
          selectedElement: this.selectedElement,
        });
        break;
      default:
        sendResponse({
          success: false,
          error: 'Unknown action',
        });
    }
  }

  toggleInspector(isActive) {
    this.isActive = isActive;

    if (isActive) {
      this.activateInspector();
    } else {
      this.deactivateInspector();
    }
  }

  activateInspector() {
    console.log('Activating inspector...');

    // 기존 상태 정리 (재활성화 시)
    this.removeOverlayPopup();
    this.removeStatusIndicator();
    this.removeOverlay();
    this.removeTooltip();

    // 활성화 상태 설정
    this.isActive = true;

    // 이벤트 리스너 추가
    document.addEventListener('mouseover', this.boundHandlers.mouseover, true);
    document.addEventListener('mouseout', this.boundHandlers.mouseout, true);
    document.addEventListener('click', this.boundHandlers.click, true);
    document.addEventListener('keydown', this.boundHandlers.keydown, true);

    // 상태 표시기 생성
    this.createStatusIndicator();

    // 오버레이 생성
    this.createOverlay();

    // 오버레이 팝업 생성 및 표시
    this.createOverlayPopup();
    this.showOverlayPopup();

    // 페이지에 검사 모드 클래스 추가
    document.body.classList.remove('gtm-selector-helper-disabled');
    document.body.classList.add('gtm-selector-helper-active');

    console.log('GTM Selector Helper: Inspector activated');
  }

  deactivateInspector() {
    console.log('Deactivating inspector...');

    // 활성화 상태 변경
    this.isActive = false;

    // 이벤트 리스너 제거
    document.removeEventListener('mouseover', this.boundHandlers.mouseover, true);
    document.removeEventListener('mouseout', this.boundHandlers.mouseout, true);
    document.removeEventListener('click', this.boundHandlers.click, true);
    document.removeEventListener('keydown', this.boundHandlers.keydown, true);

    // 하이라이트 제거
    this.clearHighlights();

    // UI 요소 제거
    this.removeStatusIndicator();
    this.removeOverlay();
    this.removeTooltip();
    this.removeOverlayPopup(); // hideOverlayPopup 대신 완전 제거

    // 페이지에서 검사 모드 클래스 제거
    document.body.classList.remove('gtm-selector-helper-active');
    document.body.classList.add('gtm-selector-helper-disabled');

    // 약간의 지연 후 disabled 클래스도 제거
    setTimeout(() => {
      document.body.classList.remove('gtm-selector-helper-disabled');
    }, 300);

    this.selectedElement = null;
    this.hoveredElement = null;

    console.log('GTM Selector Helper: Inspector deactivated');
  }

  handleMouseOver(event) {
    if (!this.isActive) return;

    event.preventDefault();
    event.stopPropagation();

    const element = event.target;

    // 이미 호버된 요소라면 무시
    if (this.hoveredElement === element) return;

    // 이전 하이라이트 제거
    this.clearHoverHighlight();

    // 새로운 요소 하이라이트
    this.hoveredElement = element;
    element.classList.add('gtm-selector-helper-highlight');

    // 툴팁 표시
    this.showTooltip(element, event);
  }

  handleMouseOut(event) {
    if (!this.isActive) return;

    const element = event.target;
    this.clearHoverHighlight();
    this.removeTooltip();
  }

  handleClick(event) {
    if (!this.isActive) return;

    const element = event.target;

    // GTM 헬퍼 UI 요소들은 무시
    if (this.isHelperElement(element)) {
      console.log('Helper element clicked, ignoring:', element);
      return;
    }

    console.log('Element clicked for selection:', element);

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    this.selectElement(element);
  }

  handleKeyDown(event) {
    if (!this.isActive) return;

    // ESC 키로 검사 모드 종료
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.deactivateInspector();

      // popup에 비활성화 알림
      chrome.runtime.sendMessage({
        action: 'inspectorDeactivated',
      });
    }
  }

  selectElement(element) {
    console.log('selectElement called with:', element);

    // 이전 선택 제거
    this.clearSelection();

    // 새로운 요소 선택
    this.selectedElement = element;
    element.classList.add('gtm-selector-helper-selected');

    // 요소 정보 생성
    const elementInfo = this.getElementInfo(element);
    console.log('Generated elementInfo:', elementInfo);

    // CSS 셀렉터 생성
    const selectors = this.generateSelectors(element);
    elementInfo.selectors = selectors;
    console.log('Generated selectors:', selectors);

    // 오버레이 팝업 업데이트
    console.log('About to update overlay with elementInfo:', elementInfo);
    this.updateOverlaySelectedElement(elementInfo);

    // popup과 background script에 선택 알림
    chrome.runtime
      .sendMessage({
        action: 'elementSelected',
        elementInfo: elementInfo,
      })
      .catch((error) => {
        console.log('Failed to send elementSelected message:', error);
      });

    // 상태 표시기 업데이트
    this.updateStatusIndicator('요소 선택됨');

    console.log('Element selected:', elementInfo);
  }

  getElementInfo(element) {
    return {
      tagName: element.tagName,
      id: element.id,
      className: element.className,
      textContent: element.textContent?.trim().substring(0, 50) || '',
      attributes: this.getElementAttributes(element),
      path: this.generateDetailedElementPath(element),
    };
  }

  generateDetailedElementPath(element) {
    const path = [];
    let current = element;

    // 최대 3단계까지 부모 요소 포함
    while (current && current !== document.body && path.length < 3) {
      let selector = current.tagName.toLowerCase();

      // ID가 있으면 우선 사용
      if (current.id) {
        selector += `#${current.id}`;
        path.unshift(selector);
        break; // ID가 있으면 더 이상 올라갈 필요 없음
      }
      // 클래스가 있으면 추가
      else if (current.className) {
        const classes = current.className
          .trim()
          .split(/\s+/)
          .filter((c) => c.length > 0);
        const meaningfulClasses = classes.filter(
          (cls) =>
            !cls.match(/^(css-|sc-|emotion-|styled-)/) && // CSS-in-JS 클래스 제외
            !cls.startsWith('gtm-selector-helper-') && // GTM 헬퍼 클래스 제외
            cls.length > 2 && // 너무 짧은 클래스 제외
            !cls.match(/^\d/) // 숫자로 시작하는 클래스 제외
        );

        if (meaningfulClasses.length > 0) {
          selector += `.${meaningfulClasses.slice(0, 2).join('.')}`;
        } else if (classes.length > 0) {
          selector += `.${classes[0]}`;
        }
      }

      // data attributes 추가 (최대 1개)
      const dataAttrs = Array.from(current.attributes)
        .filter((attr) => attr.name.startsWith('data-'))
        .slice(0, 1);

      if (dataAttrs.length > 0) {
        const attr = dataAttrs[0];
        selector += `[${attr.name}="${attr.value}"]`;
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' ');
  }

  getElementAttributes(element) {
    const attributes = {};
    for (let attr of element.attributes) {
      attributes[attr.name] = attr.value;
    }
    return attributes;
  }

  generateSelectors(element) {
    console.log('Generating selectors for element:', element);
    const selectors = [];

    // 1. ID 셀렉터 (최우선순위)
    if (element.id && this.isValidSelector(`#${element.id}`)) {
      console.log('Adding ID selector:', `#${element.id}`);
      const baseSelector = `#${element.id}`;
      const gtmSelector = this.generateGTMSelector(element, baseSelector);
      selectors.push({
        type: 'ID',
        selector: baseSelector,
        gtmSelector: gtmSelector,
        description: 'GTM에서 가장 안정적인 셀렉터',
        priority: 1,
      });
    }

    // 2. Data attribute 셀렉터
    const dataAttributes = this.getDataAttributes(element);
    dataAttributes.forEach((attr) => {
      const baseSelector = `[${attr.name}="${attr.value}"]`;
      if (this.isValidSelector(baseSelector)) {
        const gtmSelector = this.generateGTMSelector(element, baseSelector);
        selectors.push({
          type: 'Data Attribute',
          selector: baseSelector,
          gtmSelector: gtmSelector,
          description: 'GTM에서 권장하는 테스트 전용 속성',
          priority: 2,
        });
      }
    });

    // 3. 클래스 셀렉터
    if (element.className) {
      const classSelector = this.generateClassSelector(element);
      if (classSelector && this.isValidSelector(classSelector)) {
        const gtmSelector = this.generateGTMSelector(element, classSelector);
        selectors.push({
          type: 'Class',
          selector: classSelector,
          gtmSelector: gtmSelector,
          description: 'GTM에서 일반적으로 안정적',
          priority: 3,
        });
      }
    }

    // 4. 기타 속성 셀렉터 (aria-label, name, type 등)
    const attributeSelectors = this.generateAttributeSelectors(element);
    attributeSelectors.forEach((selectorInfo) => {
      if (this.isValidSelector(selectorInfo.selector)) {
        const gtmSelector = this.generateGTMSelector(element, selectorInfo.selector);
        selectorInfo.gtmSelector = gtmSelector;
        selectorInfo.description = `GTM에서 ${selectorInfo.description}`;
        selectors.push(selectorInfo);
      }
    });

    // 5. 구조적 셀렉터 (최후 수단)
    const structuralSelector = this.generateStructuralSelector(element);
    if (structuralSelector && this.isValidSelector(structuralSelector)) {
      const gtmSelector = this.generateGTMSelector(element, structuralSelector);
      selectors.push({
        type: 'Structural',
        selector: structuralSelector,
        gtmSelector: gtmSelector,
        description: 'GTM에서 구조 변경에 취약한 셀렉터',
        priority: 9,
      });
    }

    // 우선순위별 정렬
    const sortedSelectors = selectors.sort((a, b) => a.priority - b.priority);
    console.log('Generated selectors:', sortedSelectors);
    return sortedSelectors;
  }

  // GTM 콘솔에서 직접 사용할 수 있는 형식의 셀렉터 생성
  generateGTMSelector(element, baseSelector) {
    const tagName = element.tagName.toLowerCase();

    // 1. 태그명 + 속성 조합 우선 (예: button[aria-label="submit"], input[type="email"])
    const importantAttrs = [
      'aria-label', 
      'data-testid',
      'data-cy',
      'data-qa',
      'data-automation-id',
      'name',
      'type',
      'role',
      'data-button-type',
      'data-link-type'
    ];

    for (const attrName of importantAttrs) {
      const attrValue = element.getAttribute(attrName);
      if (attrValue) {
        // 특수 문자 이스케이핑
        const escapedValue = attrValue.replace(/"/g, '\\"');
        return `${tagName}[${attrName}="${escapedValue}"]`;
      }
    }

    // 2. ID가 있는 경우 태그명 + ID
    if (element.id) {
      return `${tagName}#${element.id}`;
    }

    // 3. 클래스가 있는 경우 태그명 + 의미있는 클래스
    if (element.className) {
      const classes = element.className
        .trim()
        .split(/\s+/)
        .filter((c) => c.length > 0);
      const meaningfulClasses = classes.filter(
        (cls) =>
          !cls.match(/^(css-|sc-|emotion-|styled-)/) && // CSS-in-JS 제외
          !cls.startsWith('gtm-selector-helper-') && // GTM 헬퍼 클래스 제외
          cls.length > 2 && // 너무 짧은 클래스 제외
          !cls.match(/^\d/) // 숫자로 시작하는 클래스 제외
      );

      if (meaningfulClasses.length > 0) {
        // 모듈 해시가 포함된 클래스명 정리 (예: ContentHeaderView-module__content_header___nSgPg -> content_header)
        const cleanedClasses = meaningfulClasses.map(cls => {
          // CSS 모듈 패턴 감지 및 정리
          if (cls.includes('__') && cls.includes('___')) {
            const parts = cls.split('__');
            if (parts.length >= 2) {
              const mainPart = parts[1].split('___')[0];
              return mainPart || cls;
            }
          }
          return cls;
        }).filter(cls => cls.length > 2);
        
        // 최대 2개 클래스만 사용
        const selectedClasses = cleanedClasses.slice(0, 2);
        return `${tagName}.${selectedClasses.join('.')}`;
      } else if (classes.length > 0) {
        return `${tagName}.${classes[0]}`;
      }
    }

    // 4. 텍스트 내용이 있는 경우 (짧은 텍스트만)
    const textContent = element.textContent?.trim();
    if (textContent && textContent.length <= 20 && !textContent.includes('\n')) {
      const escapedText = textContent.replace(/"/g, '\\"');
      return `${tagName}:contains("${escapedText}")`;
    }

    // 5. nth-child로 위치 기반 셀렉터
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (sibling) => sibling.tagName === element.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(element) + 1;
        const parentSelector = parent.tagName.toLowerCase();
        if (parent.id) {
          return `#${parent.id} > ${tagName}:nth-child(${index})`;
        } else if (parent.className) {
          const parentClass = parent.className.trim().split(/\s+/)[0];
          return `.${parentClass} > ${tagName}:nth-child(${index})`;
        } else {
          return `${parentSelector} > ${tagName}:nth-child(${index})`;
        }
      }
    }

    // 6. 최종 대안: 기본 셀렉터 반환
    return baseSelector || tagName;
  }

  getDataAttributes(element) {
    const dataAttrs = [];
    for (let attr of element.attributes) {
      if (attr.name.startsWith('data-')) {
        dataAttrs.push({
          name: attr.name,
          value: attr.value,
        });
      }
    }
    return dataAttrs;
  }

  generateClassSelector(element) {
    const classes = element.className
      .trim()
      .split(/\s+/)
      .filter((c) => c.length > 0);
    if (classes.length === 0) return null;

    // 의미 있는 클래스들을 우선적으로 선택
    const meaningfulClasses = classes.filter(
      (cls) =>
        !cls.match(/^(css-|sc-|emotion-|styled-)/) && // CSS-in-JS 클래스 제외
        !cls.startsWith('gtm-selector-helper-') && // GTM 헬퍼 클래스 제외
        cls.length > 2 && // 너무 짧은 클래스 제외
        !cls.match(/^\d/) // 숫자로 시작하는 클래스 제외
    );

    const classesToUse = meaningfulClasses.length > 0 ? meaningfulClasses : classes;

    // 최대 3개 클래스까지만 사용
    return '.' + classesToUse.slice(0, 3).join('.');
  }

  generateAttributeSelectors(element) {
    const selectors = [];
    const importantAttrs = ['name', 'type', 'role', 'aria-label', 'title'];

    for (let attrName of importantAttrs) {
      const attrValue = element.getAttribute(attrName);
      if (attrValue) {
        const baseSelector = `[${attrName}="${attrValue}"]`;
        selectors.push({
          type: 'Attribute',
          selector: baseSelector,
          gtmSelector: `${baseSelector}, ${baseSelector} *`,
          description: `${attrName} 속성 기반`,
          priority: 4,
        });
      }
    }

    return selectors;
  }

  generateStructuralSelector(element) {
    const path = [];
    let current = element;

    while (current && current !== document.body && path.length < 5) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector = `#${current.id}`;
        path.unshift(selector);
        break;
      } else if (current.className) {
        const classes = current.className.trim().split(/\s+/);
        if (classes.length > 0 && classes[0].length > 0) {
          selector += `.${classes[0]}`;
        }
      }

      // nth-child 추가 (필요한 경우)
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (sibling) => sibling.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-child(${index})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  isValidSelector(selector) {
    try {
      const elements = document.querySelectorAll(selector);
      return elements.length > 0 && elements.length < 100; // 너무 많이 매칭되면 유용하지 않음
    } catch (error) {
      return false;
    }
  }

  clearHighlights() {
    // 모든 하이라이트 클래스 제거
    const highlighted = document.querySelectorAll('.gtm-selector-helper-highlight');
    highlighted.forEach((el) => el.classList.remove('gtm-selector-helper-highlight'));

    this.clearSelection();
  }

  clearHoverHighlight() {
    if (this.hoveredElement) {
      this.hoveredElement.classList.remove('gtm-selector-helper-highlight');
      this.hoveredElement = null;
    }
  }

  clearSelection() {
    const selected = document.querySelectorAll('.gtm-selector-helper-selected');
    selected.forEach((el) => el.classList.remove('gtm-selector-helper-selected'));
  }

  createStatusIndicator() {
    if (this.statusIndicator) return;

    this.statusIndicator = document.createElement('div');
    this.statusIndicator.className = 'gtm-selector-helper-status active';
    this.statusIndicator.textContent = '검사 모드 활성화';
    document.body.appendChild(this.statusIndicator);
  }

  updateStatusIndicator(text, type = 'active') {
    if (this.statusIndicator) {
      this.statusIndicator.textContent = text;
      this.statusIndicator.className = `gtm-selector-helper-status ${type}`;
    }
  }

  removeStatusIndicator() {
    if (this.statusIndicator) {
      this.statusIndicator.remove();
      this.statusIndicator = null;
    }
  }

  createOverlay() {
    if (this.overlay) return;

    this.overlay = document.createElement('div');
    this.overlay.className = 'gtm-selector-helper-overlay';
    document.body.appendChild(this.overlay);
  }

  removeOverlay() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  showTooltip(element, event) {
    this.removeTooltip();

    const info = this.getElementInfo(element);
    const tagInfo = `<${info.tagName.toLowerCase()}>`;
    const idInfo = info.id ? `#${info.id}` : '';
    const classInfo = info.className ? `.${info.className.split(' ').slice(0, 2).join('.')}` : '';

    this.tooltip = document.createElement('div');
    this.tooltip.className = 'gtm-selector-helper-tooltip';
    this.tooltip.innerHTML = `${tagInfo}${idInfo}${classInfo}`;

    document.body.appendChild(this.tooltip);

    // 툴팁 위치 계산
    const rect = element.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();

    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    let top = rect.top - tooltipRect.height - 12;

    // 화면 경계 확인 및 조정
    if (left < 10) left = 10;
    if (left + tooltipRect.width > window.innerWidth - 10) {
      left = window.innerWidth - tooltipRect.width - 10;
    }
    if (top < 10) {
      top = rect.bottom + 12;
    }

    this.tooltip.style.left = left + 'px';
    this.tooltip.style.top = top + 'px';
  }

  removeTooltip() {
    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }
  }

  isHelperElement(element) {
    const isHelper =
      element.closest('.gtm-selector-helper-status') ||
      element.closest('.gtm-selector-helper-tooltip') ||
      element.closest('.gtm-selector-helper-overlay') ||
      element.closest('.gtm-overlay-popup') ||
      element.classList.contains('gtm-overlay-popup') ||
      element.classList.contains('gtm-copy-btn') ||
      element.classList.contains('gtm-selectors-btn') ||
      element.classList.contains('gtm-overlay-btn') ||
      element.classList.contains('gtm-toast');

    if (isHelper) {
      console.log('Detected helper element:', element, element.className);
    }

    return isHelper;
  }

  createOverlayPopup() {
    console.log('createOverlayPopup called');

    if (this.overlayPopup) {
      console.log('Overlay popup already exists');
      return;
    }

    console.log('Creating new overlay popup');
    this.overlayPopup = document.createElement('div');
    this.overlayPopup.className = 'gtm-overlay-popup';
    this.overlayPopup.innerHTML = `
      <div class="gtm-overlay-header">
        <div class="gtm-overlay-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <circle cx="12" cy="12" r="6"/>
            <circle cx="12" cy="12" r="2"/>
          </svg>
          GTM 셀렉터 헬퍼
        </div>
        <div class="gtm-overlay-controls">
          <button class="gtm-overlay-btn gtm-minimize-btn" title="최소화">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 19h12"/>
            </svg>
          </button>
          <button class="gtm-overlay-btn gtm-close-btn" title="닫기">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m18 6-12 12"/>
              <path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="gtm-overlay-content">
        <div class="gtm-overlay-status">
          <div class="gtm-status-indicator">
            <div class="gtm-status-dot"></div>
            <span class="gtm-status-text">요소를 선택하세요</span>
          </div>
        </div>
        <div class="gtm-selected-info" style="display: none;">
          <div class="gtm-element-display">
            <div class="gtm-element-tag"></div>
            <div class="gtm-element-path"></div>
          </div>
          <div class="gtm-action-buttons">
            <button class="gtm-copy-btn" id="gtmCopyPath" title="경로 복사">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                <path d="m4 16c-1.1 0-2-.9-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
              </svg>
              복사
            </button>
            <button class="gtm-selectors-btn" id="gtmShowSelectors" title="모든 셀렉터 보기">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 6h16"/>
                <path d="M4 12h16"/>
                <path d="M4 18h16"/>
              </svg>
              셀렉터
            </button>
          </div>
        </div>
      </div>
    `;

    // 오버레이 팝업을 페이지에 추가
    document.body.appendChild(this.overlayPopup);
    this.overlayPopup.style.display = 'none';

    console.log('Overlay popup added to DOM:', this.overlayPopup);

    // 이벤트 리스너 추가
    this.attachOverlayEventListeners();

    console.log('Overlay popup setup complete');
  }

  attachOverlayEventListeners() {
    if (!this.overlayPopup) return;

    // 최소화 버튼
    const minimizeBtn = this.overlayPopup.querySelector('.gtm-minimize-btn');
    minimizeBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      console.log('Minimize button clicked');
      this.toggleOverlayMinimized();
    });

    // 닫기 버튼
    const closeBtn = this.overlayPopup.querySelector('.gtm-close-btn');
    closeBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      console.log('Close button clicked');
      this.deactivateInspector();
    });

    // 복사 버튼
    const copyBtn = this.overlayPopup.querySelector('#gtmCopyPath');
    copyBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      console.log('Copy button clicked');
      this.copySelectedElementPath();
    });

    // 셀렉터 보기 버튼
    const selectorsBtn = this.overlayPopup.querySelector('#gtmShowSelectors');
    selectorsBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      console.log('Selectors button clicked');
      this.showAllSelectors();
    });

    // 드래그 기능
    this.makeOverlayDraggable();
  }

  makeOverlayDraggable() {
    const header = this.overlayPopup.querySelector('.gtm-overlay-header');
    if (!header) return;

    let isDragging = false;
    let dragOffset = { x: 0, y: 0 };

    header.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      isDragging = true;
      const rect = this.overlayPopup.getBoundingClientRect();
      dragOffset.x = e.clientX - rect.left;
      dragOffset.y = e.clientY - rect.top;

      const handleDrag = (e) => {
        if (!isDragging) return;

        const x = e.clientX - dragOffset.x;
        const y = e.clientY - dragOffset.y;

        this.overlayPopup.style.left = `${Math.max(
          0,
          Math.min(window.innerWidth - this.overlayPopup.offsetWidth, x)
        )}px`;
        this.overlayPopup.style.top = `${Math.max(
          0,
          Math.min(window.innerHeight - this.overlayPopup.offsetHeight, y)
        )}px`;
        this.overlayPopup.style.transform = 'none';
      };

      const handleDragEnd = () => {
        isDragging = false;
        document.removeEventListener('mousemove', handleDrag);
        document.removeEventListener('mouseup', handleDragEnd);
      };

      document.addEventListener('mousemove', handleDrag);
      document.addEventListener('mouseup', handleDragEnd);
    });
  }

  toggleOverlayMinimized() {
    const content = this.overlayPopup.querySelector('.gtm-overlay-content');
    const isMinimized = content.style.display === 'none';

    content.style.display = isMinimized ? 'block' : 'none';
    this.overlayPopup.classList.toggle('minimized', !isMinimized);
  }

  showOverlayPopup() {
    console.log('showOverlayPopup called, overlayPopup exists:', !!this.overlayPopup);

    if (!this.overlayPopup) return;

    this.overlayPopup.style.display = 'block';
    this.overlayPopup.style.position = 'fixed';
    this.overlayPopup.style.top = '20px';
    this.overlayPopup.style.left = '50%';
    this.overlayPopup.style.transform = 'translateX(-50%)';
    this.overlayPopup.style.zIndex = '999999';

    console.log('Overlay popup displayed');
  }

  hideOverlayPopup() {
    if (this.overlayPopup) {
      this.overlayPopup.style.display = 'none';
    }
  }

  removeOverlayPopup() {
    if (this.overlayPopup) {
      console.log('Removing overlay popup');
      this.overlayPopup.remove();
      this.overlayPopup = null;
    }
  }

  updateOverlaySelectedElement(elementInfo) {
    console.log('updateOverlaySelectedElement called with:', elementInfo);

    if (!this.overlayPopup) {
      console.log('No overlayPopup found');
      return;
    }

    const statusDiv = this.overlayPopup.querySelector('.gtm-overlay-status');
    const selectedDiv = this.overlayPopup.querySelector('.gtm-selected-info');
    const tagDiv = this.overlayPopup.querySelector('.gtm-element-tag');
    const pathDiv = this.overlayPopup.querySelector('.gtm-element-path');

    console.log('DOM elements found:', {
      statusDiv,
      selectedDiv,
      tagDiv,
      pathDiv,
    });

    if (elementInfo) {
      console.log('Showing selected element info');
      statusDiv.style.display = 'none';
      selectedDiv.classList.add('show');

      if (tagDiv) {
        tagDiv.textContent = elementInfo.tagName.toLowerCase();
        console.log('Set tag text:', elementInfo.tagName.toLowerCase());
      }

      if (pathDiv) {
        // GTM 콘솔에서 사용할 수 있는 형식으로 경로 생성
        const gtmSelector = this.generateGTMSelector(this.selectedElement, '');
        pathDiv.textContent = gtmSelector;
        console.log('Set GTM selector text:', gtmSelector);
      }
    } else {
      console.log('Hiding selected element info');
      statusDiv.style.display = 'block';
      selectedDiv.classList.remove('show');
    }
  }

  generateElementPathForOverlay(elementInfo) {
    let path = elementInfo.tagName.toLowerCase();

    if (elementInfo.id) {
      path += `#${elementInfo.id}`;
    } else if (elementInfo.className) {
      const classes = elementInfo.className
        .trim()
        .split(/\s+/)
        .filter((c) => c.length > 0);
      const meaningfulClasses = classes.filter(
        (cls) => !cls.match(/^(css-|sc-|emotion-|styled-)/) && 
                !cls.startsWith('gtm-selector-helper-') &&
                cls.length > 2 && 
                !cls.match(/^\d/)
      );

      if (meaningfulClasses.length > 0) {
        path += `.${meaningfulClasses.slice(0, 2).join('.')}`;
      } else if (classes.length > 0) {
        path += `.${classes[0]}`;
      }
    }

    // data attributes 추가
    if (elementInfo.attributes) {
      const dataAttrs = Object.entries(elementInfo.attributes)
        .filter(([name]) => name.startsWith('data-'))
        .slice(0, 1);

      if (dataAttrs.length > 0) {
        const [name, value] = dataAttrs[0];
        path += `[${name}="${value}"]`;
      }
    }

    return path;
  }

  copySelectedElementPath() {
    if (!this.selectedElement) {
      this.showToast('선택된 요소가 없습니다.');
      return;
    }

    // GTM 콘솔에서 직접 사용할 수 있는 셀렉터 생성
    const gtmSelector = this.generateGTMSelector(this.selectedElement, '');

    navigator.clipboard
      .writeText(gtmSelector)
      .then(() => {
        this.showToast(`GTM 셀렉터가 복사되었습니다: ${gtmSelector}`);
      })
      .catch((err) => {
        console.error('복사 실패:', err);
        this.showToast('복사에 실패했습니다.');
      });
  }

  showAllSelectors() {
    if (!this.selectedElement) {
      this.showToast('선택된 요소가 없습니다.');
      return;
    }

    const elementInfo = this.getElementInfo(this.selectedElement);
    const selectors = this.generateSelectors(this.selectedElement);
    elementInfo.selectors = selectors;

    console.log('Generated selectors for display:', selectors);

    // detached window를 열어서 모든 셀렉터 표시
    chrome.runtime
      .sendMessage({
        action: 'openDetachedWindow',
        elementInfo: elementInfo,
      })
      .catch((error) => {
        console.log('Failed to open detached window:', error);
        this.showToast('셀렉터 창을 열 수 없습니다.');
      });
  }

  showToast(message) {
    // 기존 토스트 제거
    const existingToast = document.querySelector('.gtm-toast');
    if (existingToast) {
      existingToast.remove();
    }

    // 새 토스트 생성
    const toast = document.createElement('div');
    toast.className = 'gtm-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      top: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: #10b981;
      color: white;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
      z-index: 1000000;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transition: all 0.3s ease;
    `;

    document.body.appendChild(toast);

    // 애니메이션 효과
    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    }, 10);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(-10px)';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
}

// Content script 초기화
(function () {
  'use strict';

  // 이미 초기화되었는지 확인
  if (window.gtmSelectorHelper) {
    console.log('GTM Selector Helper already initialized');
    return;
  }

  // DOM이 준비되면 초기화
  function initializeGTMHelper() {
    try {
      console.log('Initializing GTM Selector Helper...');
      const helper = new GTMSelectorHelper();
      window.gtmSelectorHelper = helper;

      // 페이지 언로드 시 정리
      window.addEventListener('beforeunload', () => {
        if (window.gtmSelectorHelper) {
          try {
            window.gtmSelectorHelper.deactivateInspector();
          } catch (e) {
            console.log('Cleanup error:', e);
          }
        }
      });

      console.log('GTM Selector Helper initialized successfully');
    } catch (error) {
      console.error('Failed to initialize GTM Selector Helper:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeGTMHelper);
  } else {
    initializeGTMHelper();
  }
})();
