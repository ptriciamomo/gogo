// Web-specific entry for ChatScreenRunner
// IMPORTANT: Avoid circular import by explicitly referencing the .tsx file.
import React, { useEffect, useRef } from 'react';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - explicit .tsx extension avoids platform resolution loop on web
import ChatScreenRunner from './ChatScreenRunner.tsx';

export default function ChatScreenRunnerWeb() {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  // Web-specific auto-scroll implementation
  useEffect(() => {
    const scrollToBottom = () => {
      console.log('=== SCROLL TO BOTTOM ATTEMPT ===');

      // Method 1: Find and scroll only the main chat container (exclude sidebar)
      const scrollMainChatOnly = () => {
        console.log('=== SCROLLING MAIN CHAT CONTAINER ONLY ===');
        const allElements = Array.from(document.querySelectorAll('*'));
        
        for (const element of allElements) {
          const el = element as HTMLElement;
          const style = window.getComputedStyle(el);
          const hasScroll = style.overflowY === 'scroll' || style.overflowY === 'auto' ||
                           style.overflow === 'scroll' || style.overflow === 'auto';
          
          if (hasScroll && el.scrollHeight > el.clientHeight) {
            // Skip sidebar elements - look for characteristics that indicate it's the sidebar
            const isLikelySidebar = 
              el.clientHeight < 200 || // Sidebar is typically narrow
              el.scrollHeight < 2000 || // Sidebar has less content
              el.className.includes('sidebar') ||
              el.className.includes('list') ||
              el.className.includes('conversation') ||
              el.getAttribute('data-testid')?.includes('sidebar') ||
              el.getAttribute('data-testid')?.includes('list');
            
            if (isLikelySidebar) {
              console.log('Skipping sidebar element:', {
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight,
                scrollTop: el.scrollTop,
                element: el,
                tagName: el.tagName,
                className: el.className,
                reason: 'Detected as sidebar'
              });
              continue;
            }
            
            console.log('Scrolling main chat element:', {
              scrollHeight: el.scrollHeight,
              clientHeight: el.clientHeight,
              scrollTop: el.scrollTop,
              element: el,
              tagName: el.tagName,
              className: el.className
            });
            
            // Try multiple scroll methods
            el.scrollTop = el.scrollHeight;
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
            el.scrollTop = 999999;
            el.scrollTo({ top: 999999, behavior: 'smooth' });
            
            console.log('After scrolling main chat:', el.scrollTop);
            return true;
          }
        }
        
        return false;
      };

      // Try scrolling main chat container only
      if (scrollMainChatOnly()) {
        console.log('Successfully scrolled main chat container');
        return true;
      }

      // Method 2: Try to find the specific chat container in messages hub
      const chatContainer = document.querySelector('div[style*="overflowY: auto"]') as HTMLElement;
      if (chatContainer) {
        console.log('Found chat container, attempting scroll...', {
          scrollHeight: chatContainer.scrollHeight,
          clientHeight: chatContainer.clientHeight,
          scrollTop: chatContainer.scrollTop,
          element: chatContainer
        });
        
        // Force scroll to absolute bottom multiple times
        chatContainer.scrollTop = chatContainer.scrollHeight;
        chatContainer.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
        chatContainer.scrollTop = 999999;
        chatContainer.scrollTo({ top: 999999, behavior: 'smooth' });
        
        console.log('Chat container after scrolling:', chatContainer.scrollTop);
        return true;
      }

      // Method 3: Try to find elements by specific selectors that might be the chat container
      const possibleSelectors = [
        'div[style*="overflow"]',
        'div[style*="overflowY"]',
        'div[style*="overflowX"]',
        '[class*="ScrollView"]',
        '[class*="scroll"]',
        '[class*="chat"]',
        '[class*="message"]',
        '[class*="content"]'
      ];
      
      for (const selector of possibleSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of Array.from(elements)) {
          const el = element as HTMLElement;
          if (el.scrollHeight > el.clientHeight) {
            console.log(`Found scrollable element with selector ${selector}:`, {
              scrollHeight: el.scrollHeight,
              clientHeight: el.clientHeight,
              scrollTop: el.scrollTop,
              element: el
            });
            
            // Force scroll
            el.scrollTop = el.scrollHeight;
            el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
            el.scrollTop = 999999;
            el.scrollTo({ top: 999999, behavior: 'smooth' });
            
            console.log(`After scrolling ${selector}:`, el.scrollTop);
            return true;
          }
        }
      }

      // Method 4: Try to find the main content area by looking for large scrollable divs (exclude sidebar)
      const allDivs = Array.from(document.querySelectorAll('div'));
      for (const div of allDivs) {
        if (div.scrollHeight > div.clientHeight && div.scrollHeight > 1000) {
          // Skip sidebar elements
          const isLikelySidebar = 
            div.clientHeight < 200 || // Sidebar is typically narrow
            div.scrollHeight < 2000 || // Sidebar has less content
            div.className.includes('sidebar') ||
            div.className.includes('list') ||
            div.className.includes('conversation') ||
            div.getAttribute('data-testid')?.includes('sidebar') ||
            div.getAttribute('data-testid')?.includes('list');
          
          if (isLikelySidebar) {
            console.log('Skipping sidebar div:', {
              scrollHeight: div.scrollHeight,
              clientHeight: div.clientHeight,
              scrollTop: div.scrollTop,
              element: div,
              reason: 'Detected as sidebar'
            });
            continue;
          }
          
          console.log('Found large scrollable div, scrolling to bottom...', {
            scrollHeight: div.scrollHeight,
            clientHeight: div.clientHeight,
            scrollTop: div.scrollTop,
            element: div
          });
          
          // Force scroll
          div.scrollTop = div.scrollHeight;
          div.scrollTo({ top: div.scrollHeight, behavior: 'smooth' });
          div.scrollTop = 999999;
          div.scrollTo({ top: 999999, behavior: 'smooth' });
          
          console.log('After scrolling large div:', div.scrollTop);
          return true;
        }
      }

      console.log('No scrollable container found for bottom scroll');
      return false;
    };

    // Make function globally available IMMEDIATELY
    (window as any).scrollChatToBottom = scrollToBottom;
    console.log('BuddyRunner Web: Global scrollChatToBottom function set');

    // Try immediate scroll to ensure it works
    setTimeout(() => {
      console.log('BuddyRunner Web: Immediate scroll attempt');
      scrollToBottom();
    }, 0);

    // Debug function to inspect DOM elements
    (window as any).debugChatScroll = () => {
      console.log('=== CHAT SCROLL DEBUG ===');
      const allDivs = Array.from(document.querySelectorAll('div'));
      const scrollableDivs = allDivs.filter(div => div.scrollHeight > div.clientHeight);

      console.log('Total divs:', allDivs.length);
      console.log('Scrollable divs:', scrollableDivs.length);

      scrollableDivs.forEach((div, index) => {
        console.log(`Scrollable Div ${index}:`, {
          scrollHeight: div.scrollHeight,
          clientHeight: div.clientHeight,
          scrollTop: div.scrollTop,
          className: div.className,
          id: div.id,
          style: div.getAttribute('style')
        });
      });

      console.log('=== END DEBUG ===');
    };

    // Initial scroll attempts - only on component mount
    const initialScrollAttempts = [100, 500, 1000, 2000];
    
    const timers = initialScrollAttempts.map(delay =>
      setTimeout(() => {
        if (!hasScrolledRef.current) {
          console.log(`Initial scroll attempt at ${delay}ms`);
          const scrolled = scrollToBottom();
          if (scrolled) {
            hasScrolledRef.current = true;
          }
        }
      }, delay)
    );

    // MutationObserver for new message content
    const observer = new MutationObserver((mutations) => {
      let hasNewContent = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if new nodes contain message-like content
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              if (element.textContent && (
                element.textContent.includes('Invoice') ||
                element.textContent.includes('PHP') ||
                element.textContent.includes('accepted') ||
                element.textContent.includes('commission')
              )) {
                hasNewContent = true;
              }
            }
          });
        }
      });

      // Disabled: FlatList handles scrolling on web, don't force scroll on DOM mutations
      // if (hasNewContent) {
      //   console.log('New message content detected, scrolling to bottom...');
      //   setTimeout(scrollToBottom, 100);
      // }
    });

    // Observe the entire document body for maximum coverage
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    return () => {
      timers.forEach(timer => clearTimeout(timer));
      observer.disconnect();
    };
  }, []);

  // Fix input bar to bottom of viewport and make messages area scrollable above it
  const INPUT_BAR_HEIGHT = 56; // px, adjust if your input bar height differs
  const HEADER_HEIGHT = 64; // px, adjust if your header height differs
  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        height: '100dvh',
        width: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Fixed/sticky header at the top */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1002,
          height: HEADER_HEIGHT,
          background: 'white', // Let your header component control its own color if needed
        }}
      >
        {/* Render only the header component here if possible, or let ChatScreenRunner render it at the top */}
      </div>
      {/* Messages area: scrollable, with padding for header and input bar */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          paddingTop: HEADER_HEIGHT,
          paddingBottom: INPUT_BAR_HEIGHT,
        }}
      >
        <ChatScreenRunner />
      </div>
      {/* Input bar: fixed to bottom */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 1001,
          height: INPUT_BAR_HEIGHT,
          background: 'transparent', // Let your input bar component control its own color
        }}
      >
        {/* Render only the input bar component here if possible, or let ChatScreenRunner render it at the bottom */}
      </div>
    </div>
  );
}


