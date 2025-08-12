// GTM 셀렉터 헬퍼 - Content Script
class GTMSelectorHelper {
  constructor() {
    this.isActive = false;
    this.selectedElement = null;
    this.hoveredElement = null;
    this.statusIndicator = null;
    this.overlay = null;
    this.tooltip = null;

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
    // 이벤트 리스너 추가
    document.addEventListener('mouseover', this.boundHandlers.mouseover, true);
    document.addEventListener('mouseout', this.boundHandlers.mouseout, true);
    document.addEventListener('click', this.boundHandlers.click, true);
    document.addEventListener('keydown', this.boundHandlers.keydown, true);

    // 상태 표시기 생성
    this.createStatusIndicator();

    // 오버레이 생성
    this.createOverlay();

    // 페이지에 검사 모드 클래스 추가
    document.body.classList.add('gtm-selector-helper-active');

    console.log('GTM Selector Helper: Inspector activated');
  }

  deactivateInspector() {
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

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const element = event.target;

    // GTM 헬퍼 UI 요소들은 무시
    if (this.isHelperElement(element)) return;

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
    // 이전 선택 제거
    this.clearSelection();

    // 새로운 요소 선택
    this.selectedElement = element;
    element.classList.add('gtm-selector-helper-selected');

    // 요소 정보 생성
    const elementInfo = this.getElementInfo(element);

    // CSS 셀렉터 생성
    const selectors = this.generateSelectors(element);
    elementInfo.selectors = selectors;

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
        const classes = current.className.trim().split(/\s+/).filter(c => c.length > 0);
        const meaningfulClasses = classes.filter(cls => 
          !cls.match(/^(css-|sc-|emotion-|styled-)/) && // CSS-in-JS 클래스 제외
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
        .filter(attr => attr.name.startsWith('data-'))
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
      selectors.push({
        type: 'ID',
        selector: `#${element.id}`,
        description: '가장 안정적인 셀렉터',
        priority: 1,
      });
    }

    // 2. Data attribute 셀렉터
    const dataAttributes = this.getDataAttributes(element);
    dataAttributes.forEach((attr) => {
      const selector = `[${attr.name}="${attr.value}"]`;
      if (this.isValidSelector(selector)) {
        selectors.push({
          type: 'Data Attribute',
          selector: selector,
          description: '테스트 전용 속성 (권장)',
          priority: 2,
        });
      }
    });

    // 3. 클래스 셀렉터
    if (element.className) {
      const classSelector = this.generateClassSelector(element);
      if (classSelector && this.isValidSelector(classSelector)) {
        selectors.push({
          type: 'Class',
          selector: classSelector,
          description: '일반적으로 안정적',
          priority: 3,
        });
      }
    }

    // 4. 기타 속성 셀렉터
    const attributeSelectors = this.generateAttributeSelectors(element);
    attributeSelectors.forEach((selectorInfo) => {
      if (this.isValidSelector(selectorInfo.selector)) {
        selectors.push(selectorInfo);
      }
    });

    // 5. 구조적 셀렉터 (최후 수단)
    const structuralSelector = this.generateStructuralSelector(element);
    if (structuralSelector && this.isValidSelector(structuralSelector)) {
      selectors.push({
        type: 'Structural',
        selector: structuralSelector,
        description: '구조 변경에 취약',
        priority: 9,
      });
    }

    // 우선순위별 정렬
    const sortedSelectors = selectors.sort((a, b) => a.priority - b.priority);
    console.log('Generated selectors:', sortedSelectors);
    return sortedSelectors;
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
        selectors.push({
          type: 'Attribute',
          selector: `[${attrName}="${attrValue}"]`,
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
    return (
      element.closest('.gtm-selector-helper-status') ||
      element.closest('.gtm-selector-helper-tooltip') ||
      element.closest('.gtm-selector-helper-overlay')
    );
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
