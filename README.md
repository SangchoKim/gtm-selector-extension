# GTM CSS 셀렉터 헬퍼 크롬 익스텐션

Google Tag Manager용 CSS 셀렉터를 쉽게 생성하는 Chrome Extension입니다.

## 🚀 기능

- **시각적 요소 선택**: 클릭으로 DOM 요소를 직관적으로 선택
- **자동 셀렉터 생성**: 안정성 순으로 다양한 CSS 셀렉터 제공
  - ID 기반 셀렉터 (최우선순위)
  - Data attribute 셀렉터 (테스트 전용)
  - 클래스 기반 셀렉터
  - 일반 속성 셀렉터
  - 구조적 셀렉터 (최후 수단)
- **원클릭 복사**: 생성된 셀렉터를 클립보드에 즉시 복사
- **실시간 미리보기**: 요소 hover 시 정보 툴팁 표시
- **GTM 최적화**: Google Tag Manager에 바로 사용 가능한 형식

## 📦 설치 방법

### 개발 모드로 설치

1. 이 저장소를 클론하거나 다운로드합니다.
2. Chrome 브라우저에서 `chrome://extensions/` 페이지로 이동합니다.
3. 우측 상단의 "개발자 모드"를 활성화합니다.
4. "압축해제된 확장 프로그램을 로드합니다" 버튼을 클릭합니다.
5. 다운로드한 폴더를 선택합니다.

### 아이콘 추가 (선택사항)

익스텐션이 정상 작동하려면 `icons/` 폴더에 다음 크기의 PNG 아이콘 파일들을 추가해야 합니다:
- `icon16.png` (16x16)
- `icon32.png` (32x32)  
- `icon48.png` (48x48)
- `icon128.png` (128x128)

## 🎯 사용 방법

1. **익스텐션 활성화**: 브라우저 툴바의 GTM 셀렉터 헬퍼 아이콘을 클릭합니다.
2. **검사 모드 시작**: 팝업에서 "요소 검사 모드" 토글을 활성화합니다.
3. **요소 선택**: 웹페이지에서 원하는 요소 위에 마우스를 올리고 클릭합니다.
4. **셀렉터 확인**: 팝업에서 생성된 다양한 CSS 셀렉터 옵션을 확인합니다.
5. **복사 및 사용**: 원하는 셀렉터 옆의 복사 버튼을 클릭하여 GTM에서 사용합니다.

### 키보드 단축키

- `ESC`: 검사 모드 종료

## 🛠️ 기술 스택

- **Manifest V3**: 최신 Chrome Extension API
- **Vanilla JavaScript**: 프레임워크 없는 순수 JavaScript
- **CSS3**: 모던 CSS 기능 활용
- **Chrome APIs**: tabs, scripting, storage, runtime

## 📁 프로젝트 구조

```
gtm-css-selector/
├── manifest.json          # 익스텐션 설정 파일
├── popup.html             # 팝업 HTML
├── popup.css              # 팝업 스타일
├── popup.js               # 팝업 로직
├── content.js             # 페이지 상호작용 스크립트
├── content.css            # 페이지 오버레이 스타일
├── background.js          # 백그라운드 서비스 워커
├── icons/                 # 익스텐션 아이콘들
└── README.md             # 이 파일
```

## 🔧 개발 가이드

### 핵심 컴포넌트

1. **popup.js**: 사용자 인터페이스 제어
2. **content.js**: DOM 요소 선택 및 셀렉터 생성
3. **background.js**: 익스텐션 상태 관리
4. **content.css**: 페이지 오버레이 스타일링

### 셀렉터 생성 알고리즘

```javascript
// 우선순위 순서
1. ID 셀렉터 (#element-id)
2. Data 속성 ([data-testid="value"])  
3. 클래스 셀렉터 (.class-name)
4. 일반 속성 ([name="value"])
5. 구조적 셀렉터 (parent > child:nth-child(2))
```

### 메시지 통신

```javascript
// popup.js → content.js
chrome.tabs.sendMessage(tabId, {
  action: 'toggleInspector',
  isActive: true
});

// content.js → popup.js  
chrome.runtime.sendMessage({
  action: 'elementSelected',
  elementInfo: {...}
});
```

## 🎨 UI/UX 특징

- **반응형 디자인**: 320x480px 팝업 최적화
- **시각적 피드백**: 요소 hover/선택 시 실시간 하이라이트
- **직관적 인터페이스**: 단계별 명확한 사용 흐름
- **접근성**: 키보드 네비게이션 지원
- **성능 최적화**: 최소한의 DOM 조작

## 🚧 향후 로드맵

- [ ] 셀렉터 유효성 실시간 검증
- [ ] 셀렉터 히스토리 저장
- [ ] GTM 워크스페이스 직접 연동
- [ ] XPath 셀렉터 생성 옵션
- [ ] 다중 요소 일괄 선택
- [ ] 사용자 설정 커스터마이징

## 🐛 문제 해결

### 일반적인 문제

1. **익스텐션이 작동하지 않음**: 페이지를 새로고침하고 다시 시도해보세요.
2. **요소가 선택되지 않음**: 검사 모드가 활성화되어 있는지 확인하세요.
3. **셀렉터가 생성되지 않음**: 해당 요소에 고유한 속성이 있는지 확인하세요.

### 호환성

- Chrome 88+
- Manifest V3 지원
- 대부분의 웹사이트 호환 (CSP 제한 있음)

## 📄 라이선스

MIT License - 자유롭게 사용, 수정, 배포 가능합니다.

## 🤝 기여

1. Fork 프로젝트
2. Feature 브랜치 생성 (`git checkout -b feature/AmazingFeature`)
3. 변경사항 커밋 (`git commit -m 'Add some AmazingFeature'`)
4. 브랜치에 Push (`git push origin feature/AmazingFeature`)
5. Pull Request 생성

## 📞 지원

문제나 제안사항이 있으시면 [Issues](https://github.com/your-repo/gtm-css-selector/issues)를 통해 알려주세요.
