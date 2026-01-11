import { useState } from 'react';
import { Platform } from 'react-native';

export function useDateFilter(
  messages: any[],
  scrollToMessage: (messageId: string, isDateFiltered: boolean, filteredMessages: any[]) => void,
  scrollViewRef: React.RefObject<any>,
  webScrollRef: React.RefObject<HTMLDivElement | null>
) {
  const [filteredMessages, setFilteredMessages] = useState<any[]>([]);
  const [isDateFiltered, setIsDateFiltered] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Helper function to format date for display
  const formatDateForDisplay = (dateString: string | null) => {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      };
      return date.toLocaleDateString('en-US', options);
    } catch (error) {
      if (__DEV__) console.error('Error formatting date:', error);
      return dateString; // Fallback to original string
    }
  };

  // Function to clear date filter
  const clearDateFilter = () => {
    setIsDateFiltered(false);
    setFilteredMessages([]);
    setSelectedDate(null);
    
    // Scroll to bottom to show latest messages
    setTimeout(() => {
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollToEnd({ animated: true });
      }
    }, 100);
  };

  // Handle date filtering callback
  const handleDateFiltered = (filteredData: any) => {
    console.log('=== DATE FILTERED CALLBACK START ===');
    console.log('Date filtered data received:', filteredData);
    console.log('Previous filter state - isDateFiltered:', isDateFiltered);
    console.log('Previous messages count:', messages.length);
    console.log('Previous filtered messages count:', filteredMessages.length);
    
    // Reset any previous filter state
    setIsDateFiltered(false);
    
    // Set new filtered messages and selected date
    setFilteredMessages(filteredData.messages || []);
    setSelectedDate(filteredData.selectedDate || null);
    setIsDateFiltered(true);
    
    console.log('New filter state - isDateFiltered:', true);
    console.log('New filtered messages count:', filteredData.messages?.length || 0);
    console.log('New filtered messages:', filteredData.messages);
    console.log('Selected date:', filteredData.selectedDate);
    console.log('Oldest invoice message ID:', filteredData.oldestInvoiceMessageId);
    
    // Auto-scroll to the oldest invoice message
    if (filteredData.oldestInvoiceMessageId) {
      console.log('Attempting to scroll to oldest invoice message:', filteredData.oldestInvoiceMessageId);
      
      // Make scroll function globally available for web
      if (Platform.OS === 'web') {
        (window as any).scrollToOldestInvoice = () => {
          console.log('Global scroll function called for oldest invoice:', filteredData.oldestInvoiceMessageId);
          scrollToMessage(filteredData.oldestInvoiceMessageId, true, filteredData.messages || []);
        };
        
        // IMMEDIATELY force scroll to top for web
        console.log('IMMEDIATE FORCE SCROLL TO TOP FOR WEB');
        if ((window as any).forceScrollToTop) {
          (window as any).forceScrollToTop();
        }
      }
      
      // Use multiple attempts with increasing delays to ensure messages are rendered
      setTimeout(() => {
        console.log('Scroll attempt 1 (300ms)');
        scrollToMessage(filteredData.oldestInvoiceMessageId, true, filteredData.messages || []);
      }, 300);
      
      setTimeout(() => {
        console.log('Scroll attempt 2 (800ms)');
        scrollToMessage(filteredData.oldestInvoiceMessageId, true, filteredData.messages || []);
      }, 800);
      
      setTimeout(() => {
        console.log('Scroll attempt 3 (1500ms)');
        scrollToMessage(filteredData.oldestInvoiceMessageId, true, filteredData.messages || []);
      }, 1500);
      
      setTimeout(() => {
        console.log('Scroll attempt 4 (2500ms)');
        scrollToMessage(filteredData.oldestInvoiceMessageId, true, filteredData.messages || []);
      }, 2500);
      
      setTimeout(() => {
        console.log('Scroll attempt 5 (4000ms)');
        scrollToMessage(filteredData.oldestInvoiceMessageId, true, filteredData.messages || []);
      }, 4000);
      
    } else {
      console.log('No oldest invoice message ID found');
      if (filteredData.messages && filteredData.messages.length > 0) {
        console.log('Scrolling to top to show filtered results');
        // If we have filtered messages but no specific oldest message, scroll to top
        if (Platform.OS === 'web') {
          // IMMEDIATELY force scroll to top for web
          console.log('IMMEDIATE FORCE SCROLL TO TOP FOR FILTERED RESULTS');
          if ((window as any).forceScrollToTop) {
            (window as any).forceScrollToTop();
          }
          
          // Web-specific scroll to top
          const scrollToTopWeb = () => {
            console.log('Web scroll to top for filtered results...');
            
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

            console.log('No scrollable container found for scrolling to top');
            return false;
          };
          
          setTimeout(() => scrollToTopWeb(), 300);
          setTimeout(() => scrollToTopWeb(), 600);
          setTimeout(() => scrollToTopWeb(), 1000);
          setTimeout(() => scrollToTopWeb(), 2000);
        } else {
          // Native mobile scrolling
          setTimeout(() => {
            if (scrollViewRef.current) {
              scrollViewRef.current.scrollTo({
                y: 0,
                animated: true
              });
            }
          }, 300);
          
          setTimeout(() => {
            if (scrollViewRef.current) {
              scrollViewRef.current.scrollTo({
                y: 0,
                animated: true
              });
            }
          }, 1000);
        }
      } else {
        console.log('No messages found for this date');
        // If no messages found, still scroll to top
        if (Platform.OS === 'web') {
          // IMMEDIATELY force scroll to top for web
          console.log('IMMEDIATE FORCE SCROLL TO TOP FOR NO MESSAGES');
          if ((window as any).forceScrollToTop) {
            (window as any).forceScrollToTop();
          }
          
          // Web-specific scroll to top
          const scrollToTopWeb = () => {
            console.log('Web scroll to top for no messages...');
            
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
          
          setTimeout(() => scrollToTopWeb(), 300);
          setTimeout(() => scrollToTopWeb(), 1000);
        } else {
          // Native mobile scrolling
          setTimeout(() => {
            if (scrollViewRef.current) {
              scrollViewRef.current.scrollTo({
                y: 0,
                animated: true
              });
            }
          }, 300);
        }
      }
    }
    console.log('=== DATE FILTERED CALLBACK END ===');
  };

  return {
    filteredMessages,
    isDateFiltered,
    selectedDate,
    formatDateForDisplay,
    clearDateFilter,
    handleDateFiltered,
  };
}

