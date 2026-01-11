// Import React and necessary hooks for state management
import React from 'react';
// Import React Native components for building the UI
import {
  View,            // Basic container component
  Text,            // Text display component
  TouchableOpacity, // Touchable button component
  StyleSheet,      // For styling components
  ScrollView,      // Scrollable container for content
} from 'react-native';
import { responsive, rw, rh, rf, rp, rb } from '../utils/responsive';

// Props interface for the TermsAndConditions component
interface TermsAndConditionsProps {
  onAgree: () => void;          // Function to call when user agrees to terms
  onClose: () => void;          // Function to call when user wants to close modal
}

// Terms and Conditions component - displays the full terms in a modal
const TermsAndConditions: React.FC<TermsAndConditionsProps> = ({ onAgree, onClose }) => {
  // Main component render - returns the terms modal UI
  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContainer}>
        {/* Modal Header */}
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Terms and Conditions</Text>
        </View>
        
        {/* Modal Content */}
        <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
          <View style={styles.modalTextContainer}>
            <Text style={styles.sectionTitle}>1. Acceptance of Terms</Text>
            <Text style={styles.modalText}>
              By using GoBuddy's services, you agree to be bound by these Terms and Conditions. If you do not agree to these terms, please do not use our services.
            </Text>
            
            <Text style={styles.sectionTitle}>2. Service Description</Text>
            <Text style={styles.modalText}>
              GoBuddy is a platform that connects users with service providers for various commission-based tasks. We facilitate the connection but are not responsible for the quality or completion of services provided by third parties.
            </Text>
            
            <Text style={styles.sectionTitle}>3. User Responsibilities</Text>
            <Text style={styles.modalText}>
              Users are responsible for:{'\n'}• Providing accurate and complete information{'\n'}• Communicating clearly with service providers{'\n'}• Paying for services as agreed{'\n'}• Following all applicable laws and regulations
            </Text>
            
            <Text style={styles.sectionTitle}>4. Payment Terms</Text>
            <Text style={styles.modalText}>
              All payments must be made through our secure payment system. GoBuddy reserves the right to hold funds until service completion. Refunds are subject to our refund policy.
            </Text>
            
            <Text style={styles.sectionTitle}>5. Service Provider Responsibilities</Text>
            <Text style={styles.modalText}>
              Service providers must:{'\n'}• Complete services as described{'\n'}• Maintain professional standards{'\n'}• Communicate promptly with clients{'\n'}• Comply with all applicable laws
            </Text>
            
            <Text style={styles.sectionTitle}>6. Limitation of Liability</Text>
            <Text style={styles.modalText}>
              GoBuddy shall not be liable for any indirect, incidental, special, or consequential damages arising from the use of our services. Our total liability shall not exceed the amount paid for the specific service.
            </Text>
            
            <Text style={styles.sectionTitle}>7. Privacy Policy</Text>
            <Text style={styles.modalText}>
              We collect and use your personal information in accordance with our Privacy Policy. By using our services, you consent to the collection and use of your information as described in our Privacy Policy.
            </Text>
            
            <Text style={styles.sectionTitle}>8. Termination</Text>
            <Text style={styles.modalText}>
              We may terminate or suspend your account at any time for violation of these terms. You may also terminate your account at any time by contacting our support team.
            </Text>
            
            <Text style={styles.sectionTitle}>9. Changes to Terms</Text>
            <Text style={styles.modalText}>
              We reserve the right to modify these terms at any time. Changes will be effective immediately upon posting. Continued use of our services constitutes acceptance of the modified terms.
            </Text>
            
            <Text style={styles.sectionTitle}>10. Contact Information</Text>
            <Text style={styles.modalText}>
              If you have any questions about these Terms and Conditions, please contact us at support@gobuddy.com or call us at (555) 123-4567.
            </Text>
            
            <Text style={styles.lastUpdated}>Last updated: January 2025</Text>
          </View>
        </ScrollView>
        
        {/* Modal Footer */}
        <View style={styles.modalFooter}>
          <TouchableOpacity style={styles.agreeButton} onPress={onAgree}>
            <Text style={styles.agreeButtonText}>I Agree</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// StyleSheet object containing all component styles
const styles = StyleSheet.create({
  // Modal overlay (background)
  modalOverlay: {
    position: 'absolute',        // Position absolutely
    top: 0,                      // Cover entire screen
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Semi-transparent black background
    justifyContent: 'center',    // Center modal vertically
    alignItems: 'center',        // Center modal horizontally
    zIndex: 1000,                // High z-index to appear above everything
  },
  // Modal container
  modalContainer: {
    backgroundColor: 'white',    // White background
    borderRadius: rb(12),        // 12px rounded corners
    margin: rp(20),              // 20px margin from screen edges
    maxHeight: '80%',            // Maximum 80% of screen height
    width: '90%',                // 90% of screen width
    shadowColor: '#000',         // Shadow color
    shadowOffset: {
      width: 0,                  // No horizontal shadow
      height: 4,                 // 4px vertical shadow
    },
    shadowOpacity: 0.3,          // 30% shadow opacity
    shadowRadius: 8,             // 8px shadow blur
    elevation: 8,                // Android shadow elevation
  },
  // Modal header
  modalHeader: {
    padding: rp(20),             // 20px padding
    borderBottomWidth: 1,        // 1px bottom border
    borderBottomColor: '#e0e0e0', // Light gray border
  },
  // Modal title
  modalTitle: {
    fontSize: rf(18),            // 18px font size
    fontWeight: '600',           // Semi-bold font weight
    color: '#8B2323',            // Reddish-brown color
    textAlign: 'center',         // Center text
  },
  // Modal content (scrollable area)
  modalContent: {
    maxHeight: rh(37.5),         // Maximum height of 300px
    padding: rp(20),             // 20px padding
  },
  // Modal text container
  modalTextContainer: {
    paddingBottom: rp(10),       // 10px bottom padding
  },
  // Modal text
  modalText: {
    fontSize: rf(14),            // 14px font size
    color: '#8B2323',            // Reddish-brown color
    lineHeight: rf(20),          // 20px line height
    marginBottom: rp(16),        // 16px bottom margin between sections
  },
  // Section title styling
  sectionTitle: {
    fontSize: rf(16),            // 16px font size
    fontWeight: '600',           // Semi-bold font weight
    color: '#8B2323',            // Reddish-brown color
    marginTop: rp(16),           // 16px top margin
    marginBottom: rp(8),         // 8px bottom margin
  },
  // Last updated text styling
  lastUpdated: {
    fontSize: rf(12),            // 12px font size
    fontStyle: 'italic',         // Italic text
    color: '#666',               // Gray color
    textAlign: 'center',         // Center text
    marginTop: rp(16),           // 16px top margin
  },
  // Modal footer
  modalFooter: {
    padding: rp(20),             // 20px padding
    borderTopWidth: 1,           // 1px top border
    borderTopColor: '#e0e0e0',   // Light gray border
  },
  // Agree button
  agreeButton: {
    backgroundColor: '#8B2323',  // Reddish-brown background
    paddingVertical: rp(12),     // 12px top/bottom padding
    borderRadius: rb(8),         // 8px rounded corners
    alignItems: 'center',        // Center content horizontally
  },
  // Agree button text
  agreeButtonText: {
    color: 'white',              // White text color
    fontSize: rf(16),            // 16px font size
    fontWeight: '600',           // Semi-bold font weight
  },
});

export default TermsAndConditions;