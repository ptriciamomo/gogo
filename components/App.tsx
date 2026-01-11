import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, SafeAreaView } from 'react-native';
// import PostCommission from './PostCommission';
// import ChatScreenRunner from './ChatScreenRunner';
// import ChatScreenCaller from './ChatScreenCaller';
import TaskReview from './TaskReview';
import RunnerProfilePage from './RunnerProfilePage';
import { responsive, rw, rh, rf, rp, rb } from '../utils/responsive';

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<'home' | 'commission' | 'chatRunner' | 'chatCaller' | 'taskReview' | 'runnerProfile'>('home');

  // Mock runner data for the profile page
  const mockRunner = {
    id: 'runner-1',
    name: 'Aeri Uchinaga',
    profilePicture: 'https://via.placeholder.com/100x100/8B2323/FFFFFF?text=AU',
    role: 'CCE',
    status: 'Available' as 'Available' | 'Busy' | 'Offline',
    works: [
      {
        id: 'work-1',
        title: 'Ferraris Drip Logo',
        image: 'https://via.placeholder.com/80x80/F5F5DC/0000FF?text=FD',
        category: 'Logo'
      },
      {
        id: 'work-2',
        title: 'Sugar & Spice Branding',
        image: 'https://via.placeholder.com/80x80/FFB6C1/DC143C?text=S&S',
        category: 'Branding'
      }
    ],
    reviews: [
      {
        id: 'review-1',
        reviewerName: 'Yu Jimin',
        reviewerImage: 'https://via.placeholder.com/32x32/8B2323/FFFFFF?text=YJ',
        rating: 5,
        comment: 'She was easy to work with and very accommodating',
        date: 'Aug 3, 2025'
      },
      {
        id: 'review-2',
        reviewerName: 'Ning Yizhuo',
        reviewerImage: 'https://via.placeholder.com/32x32/8B2323/FFFFFF?text=NY',
        rating: 5,
        comment: 'I have a great experience doing errands for her.',
        date: 'Aug 7, 2025'
      }
    ]
  };

  const renderHomeScreen = () => (
    <SafeAreaView style={styles.container}>
      <View style={styles.homeContainer}>
        <Text style={styles.title}>GoBuddy App</Text>
        <Text style={styles.subtitle}>Choose a feature to explore</Text>
        
        <TouchableOpacity 
          style={styles.button} 
          onPress={() => setCurrentScreen('commission')}
        >
          <Text style={styles.buttonText}>Post Commission</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.button} 
          onPress={() => setCurrentScreen('chatRunner')}
        >
          <Text style={styles.buttonText}>Runner Chat</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.button} 
          onPress={() => setCurrentScreen('chatCaller')}
        >
          <Text style={styles.buttonText}>Caller Chat</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  const renderCurrentScreen = () => {
    switch (currentScreen) {
      case 'commission':
        return <View><Text>PostCommission component not available</Text></View>;
      case 'chatRunner':
        return (
          <View><Text>ChatScreenRunner component not available</Text></View>
        );
      case 'chatCaller':
        return (
          <View><Text>ChatScreenCaller component not available</Text></View>
        );
      case 'taskReview':
        return <TaskReview onBack={() => setCurrentScreen('chatRunner')} />;
      case 'runnerProfile':
        return (
          <RunnerProfilePage
            runner={mockRunner}
            onBack={() => setCurrentScreen('chatCaller')}
            onRequest={() => {
              // Navigate back to chat to send a request message
              setCurrentScreen('chatCaller');
            }}
            onReport={() => {
              // Handle report functionality
              console.log('Report runner');
            }}
          />
        );
      default:
        return renderHomeScreen();
    }
  };

  return (
    <View style={styles.container}>
      {renderCurrentScreen()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
  },
  homeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: rp(20),
    backgroundColor: 'white',
    width: '100%',
  },
  title: {
    fontSize: rf(28),
    fontWeight: 'bold',
    color: '#8B2323',
    marginBottom: rp(8),
    textAlign: 'center',
  },
  subtitle: {
    fontSize: rf(16),
    color: '#666',
    marginBottom: rp(40),
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#8B2323',
    paddingHorizontal: rp(30),
    paddingVertical: rp(15),
    borderRadius: rb(8),
    marginVertical: rp(10),
    minWidth: rw(200),
    width: responsive.percentageWidth(80),
    maxWidth: rw(300),
    alignItems: 'center',
    height: responsive.buttonHeight(),
    justifyContent: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: rf(16),
    fontWeight: '600',
  },
});

export default App;
