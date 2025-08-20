# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 🛠️ Development Commands

### Extension Testing & Development

```bash
# Install in Chrome (development mode)
1. Navigate to chrome://extensions/
2. Enable "Developer mode"
3. Click "Load unpacked extension"
4. Select this directory

# Test the extension
1. Click the extension icon in the browser
2. Toggle "Inspector Mode"
3. Click on any element on a webpage
4. View generated CSS selectors
```

### No Build Process
This is a pure JavaScript Chrome Extension (Manifest V3) with no build system or package manager. All files are directly loaded by Chrome.

## 🏗️ Architecture Overview

### Chrome Extension Components

**Background Service Worker (`background.js`)**
- Manages extension state across tabs using Map-based storage
- Handles inter-component communication via Chrome runtime messages
- Controls badge display (green "ON" when active)
- Manages detached window creation and data transfer
- Provides usage analytics and event logging

**Content Script (`content.js`)**
- Core GTMSelectorHelper class for DOM interaction
- Manages element inspection, highlighting, and selection
- Generates CSS selectors with priority-based algorithm
- Creates in-page overlay popup for immediate feedback
- Handles keyboard shortcuts (ESC to deactivate)

**Popup Interface (`popup.js` + `popup.html`)**
- Main extension UI (320x480px optimized)
- Inspector toggle control and status display
- Real-time selector results with copy functionality
- Dynamic UI updates based on selected elements

**Detached Window (`popup-detached.js` + `popup-detached.html`)**
- Independent window for persistent selector access
- Enhanced UI with window controls and drag functionality
- Full selector display with both basic and GTM-optimized formats

### CSS Selector Generation Algorithm

**Priority-based selector generation in content.js:**

```javascript
// Priority order (lower number = higher priority)
1. ID selectors (#element-id)               // Priority 1
2. Data attributes ([data-testid="value"])  // Priority 2  
3. Class selectors (.class-name)            // Priority 3
4. Other attributes ([name="value"])        // Priority 4
5. Structural selectors (parent > child)    // Priority 9
```

**Selector Validation:**
- Must match between 1-99 elements (avoids too specific or too broad)
- CSS syntax validation using `document.querySelectorAll()`
- Meaningful class filtering (excludes CSS-in-JS generated classes)

### Message Communication Flow

**popup.js ↔ background.js:**
```javascript
// Get tab state
chrome.runtime.sendMessage({
  action: 'getTabState',
  tabId: currentTabId
});

// Set inspector state
chrome.runtime.sendMessage({
  action: 'toggleInspector', 
  isActive: boolean
});
```

**content.js ↔ popup.js:**
```javascript
// Element selected notification
chrome.runtime.sendMessage({
  action: 'elementSelected',
  elementInfo: {
    tagName, id, className, 
    textContent, attributes, path,
    selectors: [...]
  }
});
```

**Background script coordination:**
- Maintains tab state Map for persistence
- Routes messages between popup and content script
- Handles content script injection and initialization
- Manages detached window lifecycle

## 🔧 Technical Implementation Details

### Content Script Injection Strategy
- Dynamic script injection on activation (not persistent)
- CSS injection for styling overlay elements
- Initialization verification before message sending
- Retry logic for message delivery (up to 3 attempts)
- Cleanup on deactivation and page unload

### UI State Management
- Real-time UI updates based on inspector state
- Dynamic selector card generation
- Toast notifications for user feedback
- Responsive design for popup constraints

### Element Path Generation
```javascript
// Detailed path with up to 3 levels
generateDetailedElementPath(element) {
  // Prioritizes ID > meaningful classes > data attributes
  // Excludes CSS-in-JS classes and auto-generated identifiers
  // Returns hierarchical path like: "div.container > button#submit.btn"
}
```

### Error Handling & Recovery
- Script injection failure handling
- Message delivery retry mechanisms
- Tab permission validation
- Graceful degradation for restricted pages
- Console logging for debugging

## 📋 File Structure & Responsibilities

**Core Extension Files:**
- `manifest.json` - Extension configuration (Manifest V3)
- `background.js` - Service worker for state management
- `content.js` - DOM interaction and selector generation
- `content.css` - Overlay styling for in-page elements

**UI Components:**
- `popup.html/js/css` - Main extension popup interface
- `popup-detached.html/js` - Independent window interface
- `test.html` - Simple test page for development

**Assets:**
- `icons/` - Extension icons (16x16, 48x48, 128x128)

## 🧩 Key Classes & Methods

**GTMSelectorHelper (content.js):**
- `activateInspector()` - Enable element selection mode
- `generateSelectors(element)` - Create prioritized selector array
- `selectElement(element)` - Handle element selection and messaging
- `isValidSelector(selector)` - Validate CSS selector syntax

**PopupController (popup.js):**
- `toggleInspector(isActive)` - Control inspector state
- `updateSelectorsDisplay(selectors)` - Render selector UI
- `copyToClipboard(selector)` - Handle clipboard operations

**BackgroundService (background.js):**
- `handleMessage()` - Route inter-component messages
- `updateBadge()` - Control extension badge display
- `openDetachedWindowWithSelectors()` - Manage detached windows

## 🎯 Extension Permissions

**Required permissions from manifest.json:**
- `activeTab` - Access current tab content
- `scripting` - Inject content scripts and CSS
- `storage` - Save user preferences and analytics
- `tabs` - Query tab information

## 🚫 Development Considerations

- **No external dependencies** - Pure vanilla JavaScript
- **CSP compatibility** - Works within content security policy restrictions
- **Memory management** - Proper cleanup on deactivation
- **Cross-site compatibility** - Handles various website structures
- **Accessibility** - Keyboard navigation and ARIA compliance

## 🔍 Debugging Tips

- Check console in both extension popup and webpage
- Verify content script injection success
- Monitor Chrome DevTools Network tab for script loading
- Use Chrome Extensions DevTools for background script debugging
- Test on various websites with different DOM structures