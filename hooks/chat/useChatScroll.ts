import { useRef, useEffect } from 'react';
import { ScrollView, Platform } from 'react-native';

export function useChatScroll(messages: any[]) {
  const scrollViewRef = useRef<ScrollView>(null);
  const webScrollRef = useRef<HTMLDivElement | null>(null);

  // Debug function to log ScrollView state
  const debugScrollViewState = (isDateFiltered: boolean, filteredMessages: any[]) => {
    if (scrollViewRef.current) {
      console.log('ScrollView Debug Info:');
      console.log('- isDateFiltered:', isDateFiltered);
      console.log('- messages.length:', messages.length);
      console.log('- filteredMessages.length:', filteredMessages.length);
      console.log('- ScrollView ref exists:', !!scrollViewRef.current);
    }
  };

  // Function to scroll to a specific message
  const scrollToMessage = (
    messageId: string,
    isDateFiltered: boolean,
    filteredMessages: any[]
  ) => {
    debugScrollViewState(isDateFiltered, filteredMessages);
    
    if (scrollViewRef.current) {
      // Use filteredMessages if date filtering is active, otherwise use messages
      const messagesToSearch = isDateFiltered ? filteredMessages : messages;
      const messageIndex = messagesToSearch.findIndex(msg => msg.id === messageId);
      console.log(`=== SCROLL TO MESSAGE DEBUG ===`);
      console.log(`Looking for message ${messageId} in ${isDateFiltered ? 'filtered' : 'all'} messages, found at index: ${messageIndex}`);
      console.log(`Total messages to search: ${messagesToSearch.length}`);
      console.log(`Message IDs in array:`, messagesToSearch.map(msg => msg.id));
      console.log(`Target message timestamp:`, messagesToSearch[messageIndex]?.timestamp);
      console.log(`=== END SCROLL DEBUG ===`);
      
      if (messageIndex !== -1) {
        // Calculate scroll position based on message index
        // Each message typically takes up around 100-150px including margins
        const baseHeight = 130; // Base height per message
        const scrollPosition = messageIndex * baseHeight;
        
        console.log(`Scrolling to message ${messageId} at position ${scrollPosition}`);
        
        if (Platform.OS === 'web') {
          // Web-specific scrolling implementation
          const scrollToMessageWeb = () => {
            console.log('Web scroll attempt for message:', messageId);
            
            // Method 1: Try to find the actual message element by data attributes or content
            const messageElement = document.querySelector(`[data-message-id="${messageId}"]`) ||
                                 document.querySelector(`[data-testid*="${messageId}"]`) ||
                                 Array.from(document.querySelectorAll('div')).find(div => 
                                   div.textContent && div.textContent.includes(messageId)
                                 );
            
            if (messageElement) {
              console.log('Found message element, scrolling to it...');
              messageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
              return true;
            }

            // Method 2: Try to find the ScrollView by nativeID
            const scrollViewById = document.getElementById('messages-scroll-view') as HTMLElement | null;
            if (scrollViewById) {
              console.log('Found ScrollView by ID, scrolling to calculated position...');
              scrollViewById.scrollTop = scrollPosition;
              return true;
            }

            // Method 3: Find by React Native Web ScrollView class
            const scrollViewByClass = document.querySelector('[class*="ScrollView"], [class*="scroll-view"]') as HTMLElement | null;
            if (scrollViewByClass) {
              console.log('Found ScrollView by class, scrolling to calculated position...');
              scrollViewByClass.scrollTop = scrollPosition;
              return true;
            }

            // Method 4: Find any element with overflow and scrollable content
            const allDivs = Array.from(document.querySelectorAll('div'));
            for (const div of allDivs) {
              const style = window.getComputedStyle(div);
              if (style.overflowY === 'scroll' || style.overflowY === 'auto' ||
                  style.overflow === 'scroll' || style.overflow === 'auto') {
                if (div.scrollHeight > div.clientHeight) {
                  console.log('Found scrollable div, scrolling to calculated position...');
                  div.scrollTop = scrollPosition;
                  return true;
                }
              }
            }

            // Method 5: Find the largest scrollable container
            let maxScrollHeight = 0;
            let targetElement: HTMLElement | null = null;

            for (const div of allDivs) {
              if (div.scrollHeight > div.clientHeight && div.scrollHeight > maxScrollHeight) {
                maxScrollHeight = div.scrollHeight;
                targetElement = div;
              }
            }

            if (targetElement) {
              console.log('Found largest scrollable container, scrolling to calculated position...');
              targetElement.scrollTop = scrollPosition;
              return true;
            }

            // Method 6: Try to scroll to top as fallback
            console.log('No specific element found, scrolling to top...');
            const scrollContainer = (scrollViewById || scrollViewByClass || targetElement) as HTMLElement | null;
            if (scrollContainer) {
              scrollContainer.scrollTop = 0;
              return true;
            }

            console.log('No scrollable container found for web scrolling');
            return false;
          };

          // Multiple attempts for web scrolling with increasing delays
          setTimeout(() => scrollToMessageWeb(), 100);
          setTimeout(() => scrollToMessageWeb(), 300);
          setTimeout(() => scrollToMessageWeb(), 600);
          setTimeout(() => scrollToMessageWeb(), 1000);
          setTimeout(() => scrollToMessageWeb(), 2000);
          
        } else {
          // Native mobile scrolling
          // Primary scroll attempt
          scrollViewRef.current.scrollTo({
            y: scrollPosition,
            animated: true
          });
          
          // Secondary attempt with slight adjustment to ensure visibility
          setTimeout(() => {
            if (scrollViewRef.current) {
              scrollViewRef.current.scrollTo({
                y: Math.max(0, scrollPosition - 30), // Scroll slightly up to ensure message is visible
                animated: true
              });
            }
          }, 200);
          
          // Third attempt with different position
          setTimeout(() => {
            if (scrollViewRef.current) {
              scrollViewRef.current.scrollTo({
                y: scrollPosition + 20, // Scroll slightly down
                animated: true
              });
            }
          }, 400);
          
          // Final attempt - scroll to top then to message for better accuracy
          setTimeout(() => {
            if (scrollViewRef.current) {
              console.log('Final attempt: scroll to top then to message');
              scrollViewRef.current.scrollTo({ y: 0, animated: false });
              setTimeout(() => {
                if (scrollViewRef.current) {
                  scrollViewRef.current.scrollTo({ y: scrollPosition, animated: true });
                }
              }, 50);
            }
          }, 800);
        }
        
      } else {
        console.log(`Message ${messageId} not found in ${isDateFiltered ? 'filtered' : 'all'} messages array`);
        console.log('Available message IDs:', messagesToSearch.map(msg => msg.id));
        
        // If message not found, try scrolling to show filtered results
        if (isDateFiltered && filteredMessages.length > 0) {
          console.log('Scrolling to show filtered results');
          if (Platform.OS === 'web') {
            // Web-specific scroll to top with multiple methods
            const scrollToTopWeb = () => {
              console.log('Attempting to scroll to top for filtered results...');
              
              // Method 1: Try to find the ScrollView by nativeID
              const scrollViewById = document.getElementById('messages-scroll-view');
              if (scrollViewById) {
                console.log('Found ScrollView by ID, scrolling to top...');
                scrollViewById.scrollTop = 0;
                return true;
              }

              // Method 2: Find by React Native Web ScrollView class
              const scrollViewByClass = document.querySelector('[class*="ScrollView"], [class*="scroll-view"]');
              if (scrollViewByClass) {
                console.log('Found ScrollView by class, scrolling to top...');
                scrollViewByClass.scrollTop = 0;
                return true;
              }

              // Method 3: Find any element with overflow and scrollable content
              const allDivs = Array.from(document.querySelectorAll('div'));
              for (const div of allDivs) {
                const style = window.getComputedStyle(div);
                if (style.overflowY === 'scroll' || style.overflowY === 'auto' ||
                    style.overflow === 'scroll' || style.overflow === 'auto') {
                  if (div.scrollHeight > div.clientHeight) {
                    console.log('Found scrollable div, scrolling to top...');
                    div.scrollTop = 0;
                    return true;
                  }
                }
              }

              // Method 4: Find the largest scrollable container
              let maxScrollHeight = 0;
              let targetElement = null;

              for (const div of allDivs) {
                if (div.scrollHeight > div.clientHeight && div.scrollHeight > maxScrollHeight) {
                  maxScrollHeight = div.scrollHeight;
                  targetElement = div;
                }
              }

              if (targetElement) {
                console.log('Found largest scrollable container, scrolling to top...');
                targetElement.scrollTop = 0;
                return true;
              }

              console.log('No scrollable container found for scrolling to top');
              return false;
            };
            
            setTimeout(() => scrollToTopWeb(), 100);
            setTimeout(() => scrollToTopWeb(), 300);
            setTimeout(() => scrollToTopWeb(), 600);
            setTimeout(() => scrollToTopWeb(), 1000);
          } else {
            scrollViewRef.current.scrollTo({
              y: 0,
              animated: true
            });
          }
        } else {
          // Fallback: scroll to top
          if (Platform.OS === 'web') {
            const scrollToTopWeb = () => {
              const scrollViewById = document.getElementById('messages-scroll-view');
              if (scrollViewById) {
                scrollViewById.scrollTop = 0;
                return true;
              }
              const scrollViewByClass = document.querySelector('[class*="ScrollView"], [class*="scroll-view"]');
              if (scrollViewByClass) {
                scrollViewByClass.scrollTop = 0;
                return true;
              }
              return false;
            };
            setTimeout(() => scrollToTopWeb(), 100);
          } else {
            scrollViewRef.current.scrollTo({
              y: 0,
              animated: true
            });
          }
        }
      }
    } else {
      console.log('ScrollView ref is null');
    }
  };

  // Web-compatible scroll to bottom function
  const scrollToBottom = () => {
    if (Platform.OS === 'web') {
      // Try global scroll function first (from web wrapper)
      if ((window as any).scrollChatToBottom) {
        try {
          (window as any).scrollChatToBottom();
          return;
        } catch (error) {
          console.warn('Global scroll function failed:', error);
        }
      }
      
      // Try web-specific DOM scrolling
      if (webScrollRef.current) {
        try {
          webScrollRef.current.scrollTop = webScrollRef.current.scrollHeight;
          return;
        } catch (error) {
          console.warn('Web scroll ref failed:', error);
        }
      }
      
      // Fallback to React Native ScrollView methods
      if (scrollViewRef.current) {
        try {
          scrollViewRef.current.scrollTo({
            y: 999999, // Large number to ensure we scroll to the bottom
            animated: true
          });
        } catch (error) {
          // Fallback: try scrollToEnd
          try {
            scrollViewRef.current.scrollToEnd({ animated: true });
          } catch (fallbackError) {
            console.warn('Scroll to bottom failed:', fallbackError);
            // Last resort: try to find the actual DOM element and scroll it
            try {
              const scrollElement = scrollViewRef.current as any;
              if (scrollElement && scrollElement._nativeTag) {
                const domElement = document.getElementById(scrollElement._nativeTag);
                if (domElement) {
                  domElement.scrollTop = domElement.scrollHeight;
                }
              }
            } catch (domError) {
              console.warn('DOM scroll fallback failed:', domError);
            }
          }
        }
      }
    } else {
      // Native mobile scrolling
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollToEnd({ animated: true });
      }
    }
  };

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-scroll to bottom when component mounts (for web version)
  useEffect(() => {
    if (Platform.OS === 'web') {
      // Initial scroll attempts - only on mount
      const timers = [
        setTimeout(() => scrollToBottom(), 100),
        setTimeout(() => scrollToBottom(), 500),
        setTimeout(() => scrollToBottom(), 1000),
        setTimeout(() => scrollToBottom(), 2000)
      ];

      return () => {
        timers.forEach(timer => clearTimeout(timer));
      };
    }
  }, []); // Empty dependency array means this runs only on mount

  return {
    scrollViewRef,
    webScrollRef,
    scrollToBottom,
    scrollToMessage,
  };
}

