import React from 'react';
import { Text } from 'react-native';

// Native fallback - this component should only be used on web
// On native, it returns the plain text to maintain compatibility
const NoRunnersAvailableCard: React.FC = () => {
    return <Text style={{ color: '#531010', opacity: 0.7 }}>No runners available.</Text>;
};

export default NoRunnersAvailableCard;
