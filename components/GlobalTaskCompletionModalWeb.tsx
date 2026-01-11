import React, { useState, useEffect } from 'react';
import { TaskCompletionNotification, globalNotificationService } from '../services/GlobalNotificationService';

const GlobalTaskCompletionModalWeb: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [notification, setNotification] = useState<TaskCompletionNotification | null>(null);

  useEffect(() => {
    console.log('GlobalTaskCompletionModalWeb: Setting up subscription');
    const unsubscribe = globalNotificationService.subscribe((newNotification) => {
      console.log('GlobalTaskCompletionModalWeb: Received notification:', newNotification);
      if (newNotification) {
        setNotification(newNotification);
        setVisible(true);
        console.log('GlobalTaskCompletionModalWeb: Modal should be visible now');
      } else {
        setVisible(false);
        setNotification(null);
        console.log('GlobalTaskCompletionModalWeb: Modal hidden');
      }
    });

    return unsubscribe;
  }, []);

  const handleClose = () => {
    setVisible(false);
    setNotification(null);
    globalNotificationService.clearNotification();
  };

  const handleRate = () => {
    if (!notification) return;
    
    setVisible(false);
    setNotification(null);
    globalNotificationService.clearNotification();
    
    // For web, use confirm instead of Alert
    const shouldRate = confirm(`Rate ${notification.callerName} for their task clarity and communication?`);
    if (shouldRate) {
      alert('Rating functionality will be implemented soon!');
    }
  };

  const handleSkip = () => {
    setVisible(false);
    setNotification(null);
    globalNotificationService.clearNotification();
  };

  if (!visible || !notification) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-xl" style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
        {/* Header */}
        <div className="flex justify-end mb-4">
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Task Approved!</h2>
          
          <p className="text-gray-700 mb-2">
            Rate {notification.callerName} for their task clarity and communication?
          </p>
          
          <p className="text-sm text-gray-500">
            Your feedback helps improve the platform for everyone.
          </p>
        </div>

        {/* Buttons */}
        <div className="space-y-3">
          <button
            onClick={handleRate}
            className="w-full bg-red-800 hover:bg-red-900 text-white font-semibold py-3 px-6 rounded-xl flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            Rate BuddyCaller
          </button>

          <button
            onClick={handleSkip}
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-6 rounded-xl transition-colors"
          >
            Skip for Now
          </button>
        </div>
      </div>
    </div>
  );
};

export default GlobalTaskCompletionModalWeb;
