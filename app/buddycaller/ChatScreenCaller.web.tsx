// Web-specific entry for ChatScreenCaller
// IMPORTANT: Avoid circular import by explicitly referencing the .tsx file.
// The bundler prefers .web first; using the explicit extension points to the base file.
import React, { useEffect, useRef } from 'react';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - explicit .tsx extension avoids platform resolution loop on web
import ChatScreenCaller from './ChatScreenCaller.tsx';

export default function ChatScreenCallerWeb() {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  // Web-specific auto-scroll implementation
  useEffect(() => {
    const scrollToBottom = () => {
      console.log('=== SCROLL TO BOTTOM ATTEMPT ===');

      // Method 1: Direct React Native Web ScrollView targeting
      const rnScrollView = document.querySelector('div[style*="overflow"]') as HTMLElement;
      if (rnScrollView && rnScrollView.scrollHeight > rnScrollView.clientHeight) {
        console.log('Found RN ScrollView, scrolling to bottom...');
        rnScrollView.scrollTop = rnScrollView.scrollHeight;
        return true;
      }

      // Method 2: Find by React Native Web specific classes
      const rnElements = Array.from(document.querySelectorAll('div[class*="ScrollView"], div[class*="scroll"], div[class*="overflow"]'));
      for (const element of rnElements) {
        const el = element as HTMLElement;
        if (el.scrollHeight > el.clientHeight) {
          console.log('Found scrollable RN element, scrolling to bottom...');
          el.scrollTop = el.scrollHeight;
          return true;
        }
      }

      // Method 3: Find the main chat container by looking for flex: 1
      const flexElements = Array.from(document.querySelectorAll('div[style*="flex: 1"], div[style*="flex:1"]'));
      for (const element of flexElements) {
        const el = element as HTMLElement;
        if (el.scrollHeight > el.clientHeight) {
          console.log('Found flex scrollable element, scrolling to bottom...');
          el.scrollTop = el.scrollHeight;
          return true;
        }
      }

      // Method 4: Find any element with scrollable content
      const allDivs = Array.from(document.querySelectorAll('div'));
      for (const div of allDivs) {
        if (div.scrollHeight > div.clientHeight && div.scrollHeight > 500) {
          console.log('Found large scrollable div, scrolling to bottom...');
          div.scrollTop = div.scrollHeight;
          return true;
        }
      }

      console.log('No scrollable container found for bottom scroll');
      return false;
    };

    // FORCE SCROLL TO TOP - This is the key function for date filtering
    const forceScrollToTop = () => {
      console.log('=== FORCE SCROLL TO TOP ===');
      
      // Get ALL divs and try to scroll each one to top
      const allDivs = Array.from(document.querySelectorAll('div'));
      let scrolled = false;
      
      for (const div of allDivs) {
        const style = window.getComputedStyle(div);
        const hasScroll = style.overflowY === 'scroll' || style.overflowY === 'auto' ||
                         style.overflow === 'scroll' || style.overflow === 'auto';
        
        if (hasScroll && div.scrollHeight > div.clientHeight) {
          console.log('Found scrollable div, forcing scroll to top:', {
            scrollHeight: div.scrollHeight,
            clientHeight: div.clientHeight,
            scrollTop: div.scrollTop
          });
          
          // Force scroll to top
          div.scrollTop = 0;
          scrolled = true;
          
          // Also try smooth scroll
          div.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
      
      // Also try to scroll the entire page
      window.scrollTo({ top: 0, behavior: 'smooth' });
      
      // Try to find and scroll any scrollable containers
      const scrollContainers = document.querySelectorAll('[style*="overflow"], [class*="ScrollView"], [class*="scroll"]');
      scrollContainers.forEach(container => {
        if (container.scrollHeight > container.clientHeight) {
          console.log('Scrolling container to top:', container);
          container.scrollTop = 0;
          container.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
      
      console.log('Force scroll to top completed, scrolled:', scrolled);
      return scrolled;
    };

    // Make functions globally available
    (window as any).scrollChatToBottom = scrollToBottom;
    (window as any).forceScrollToTop = forceScrollToTop;

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

    // AGGRESSIVE MutationObserver for date filtering
    const observer = new MutationObserver((mutations) => {
      let hasNewContent = false;
      let hasDateFilterContent = false;
      
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
              
              // Check for date filter banner - this is the key trigger
              if (element.textContent && (
                element.textContent.includes('Invoices for') ||
                element.textContent.includes('Filtered by date') ||
                element.textContent.includes('Showing invoices')
              )) {
                hasDateFilterContent = true;
                console.log('DATE FILTER DETECTED! Text:', element.textContent);
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
      
      if (hasDateFilterContent) {
        console.log('=== DATE FILTER CONTENT DETECTED - FORCING SCROLL TO TOP ===');
        
        // IMMEDIATE scroll to top - no delays
        forceScrollToTop();
        
        // Multiple aggressive attempts
        setTimeout(() => {
          console.log('Force scroll to top attempt 1 (100ms)');
          forceScrollToTop();
        }, 100);
        
        setTimeout(() => {
          console.log('Force scroll to top attempt 2 (300ms)');
          forceScrollToTop();
        }, 300);
        
        setTimeout(() => {
          console.log('Force scroll to top attempt 3 (600ms)');
          forceScrollToTop();
        }, 600);
        
        setTimeout(() => {
          console.log('Force scroll to top attempt 4 (1000ms)');
          forceScrollToTop();
        }, 1000);
        
        setTimeout(() => {
          console.log('Force scroll to top attempt 5 (2000ms)');
          forceScrollToTop();
        }, 2000);
        
        // Also try to call the global scroll function if it exists
        setTimeout(() => {
          if ((window as any).scrollToOldestInvoice) {
            console.log('Calling global scroll to oldest invoice function...');
            (window as any).scrollToOldestInvoice();
          }
        }, 500);
      }
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

  return (
    <div ref={containerRef} style={{ height: '100%', width: '100%' }}>
      <ChatScreenCaller />
    </div>
  );
}


