import { useRouter } from 'expo-router';
import "expo-router/entry";
import React from 'react';
import {
    Dimensions,
    Image,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';


export default function WelcomeScreen() {
    const router = useRouter();

    // Responsive container style for web and mobile
    const containerStyle =
        Platform.OS === 'web'
            ? [styles.container, styles.webContainer]
            : styles.container;

    return (
        <View style={styles.outer}>
            <View style={containerStyle}>
                <Image
                    source={require('../assets/images/logo.png')}
                    style={styles.logo}
                    resizeMode="contain"
                />
                <Text style={styles.title}>GoBuddy</Text>

                <TouchableOpacity
                    style={styles.registerButton}
                    onPress={() => router.push('/agree_terms')}
                >
                    <Text style={styles.registerText}>Register</Text>
                </TouchableOpacity>

                <Text style={styles.signInPrompt}>
                    Already have an account?
                    <Text
                        style={styles.signInLink}
                        onPress={() => router.push('/login')}
                    >
                        {' '}
                        Sign in
                    </Text>
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    outer: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: Dimensions.get('window').height,
    },
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        minHeight: Dimensions.get('window').height,
    },
    webContainer: {
        maxWidth: 600,
        width: '100%',
        alignSelf: 'center',
        borderRadius: 12,
    },
    logo: {
        width: Platform.OS === 'web' ? 120 : 150,
        height: Platform.OS === 'web' ? 120 : 150,
        marginBottom: 20,
    },
    title: {
        fontSize: Platform.OS === 'web' ? 36 : 28,
        fontWeight: 'bold',
        color: '#8B0000',
        marginBottom: 30,
        fontFamily: 'serif',
        textAlign: 'center',
    },
    registerButton: {
        backgroundColor: '#8B0000',
        paddingVertical: 14,
        paddingHorizontal: 48,
        borderRadius: 8,
        marginBottom: 20,
        width: '100%',
        maxWidth: 220,
        alignSelf: 'center',
    },
    registerText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '600',
        textAlign: 'center',
    },
    signInPrompt: {
        fontSize: 15,
        color: '#444444',
        textAlign: 'center',
    },
    signInLink: {
        color: '#8B0000',
        fontWeight: 'bold',
    },
});
