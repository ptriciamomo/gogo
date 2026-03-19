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
        width: Platform.OS === 'web' ? 140 : 150,
        height: Platform.OS === 'web' ? 140 : 150,
        marginBottom: 24,
        ...(Platform.OS === 'web' ? { 
            filter: 'drop-shadow(0 6px 12px rgba(0,0,0,0.12))',
        } as any : {}),
    },
    title: {
        fontSize: Platform.OS === 'web' ? 44 : 28,
        fontWeight: 'bold',
        color: '#8B0000',
        marginBottom: 14,
        fontFamily: 'serif',
        textAlign: 'center',
        ...(Platform.OS === 'web' ? {
            letterSpacing: 0.5,
        } as any : {}),
    },
    registerButton: {
        backgroundColor: '#8B0000',
        paddingVertical: 15,
        paddingHorizontal: 56,
        borderRadius: 14,
        marginBottom: 14,
        width: '100%',
        maxWidth: 220,
        alignSelf: 'center',
        ...(Platform.OS === 'web' ? {
            backgroundImage: 'linear-gradient(90deg, #ef4444, #b91c1c)',
            boxShadow: '0 12px 24px rgba(185,28,28,0.20)',
            transition: 'transform 200ms ease, box-shadow 200ms ease',
        } as any : {}),
    },
    registerText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
        textAlign: 'center',
    },
    signInPrompt: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        marginTop: 14,
    },
    signInLink: {
        color: '#8B0000',
        fontWeight: 'bold',
        textDecorationLine: 'underline',
    },
});
