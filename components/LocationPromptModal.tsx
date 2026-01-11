import React, { useRef, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/* ================= COLORS ================= */
const colors = {
    maroon: "#8B0000",
    light: "#FAF6F5",
    border: "#E5C8C5",
    text: "#531010",
    pillText: "#FFFFFF",
    pillTextActive: "#1e293b",
    faint: "#F7F1F0",
};

interface LocationPromptModalProps {
    visible: boolean;
    onEnableLocation: () => void;
    onCancel: () => void;
    isLoading?: boolean;
    // For mobile browsers: direct geolocation handlers
    onGeolocationSuccess?: (position: GeolocationPosition) => Promise<void>;
    onGeolocationError?: (error: GeolocationPositionError) => void;
}

export default function LocationPromptModal({ 
    visible, 
    onEnableLocation,
    onCancel,
    isLoading = false,
    onGeolocationSuccess,
    onGeolocationError
}: LocationPromptModalProps) {
    const { width } = useWindowDimensions();
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    
    // Detect if this is a mobile browser (not desktop browser, not native app)
    const isMobileBrowser = (): boolean => {
        if (Platform.OS !== 'web') return false;
        if (typeof window === 'undefined') return false;
        
        const isSmallScreen = width < 900;
        const userAgent = (window as any).navigator?.userAgent || (window as any).navigator?.vendor || (window as any).opera || '';
        const isMobileUserAgent = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
        
        return isSmallScreen && isMobileUserAgent;
    };
    
    // CRITICAL: Attach native DOM event listener for mobile browsers to preserve gesture chain
    useEffect(() => {
        if (!isMobileBrowser() || !onGeolocationSuccess || !onGeolocationError || !visible) {
            return;
        }
        
        let cleanup: (() => void) | null = null;
        
        // Wait for button to be mounted in DOM
        const timeoutId = setTimeout(() => {
            if (!buttonRef.current) return;
            
            const button = buttonRef.current;
            
            // Create handler that directly calls geolocation
            const handleClick = () => {
                // Direct call - NO React, NO synthetic events, called from native DOM event
                // NO preventDefault, NO stopPropagation - let the event flow naturally
                ((window as any).navigator.geolocation as any).getCurrentPosition(
                    onGeolocationSuccess,
                    onGeolocationError,
                    {
                        enableHighAccuracy: true,
                        timeout: 20000,
                        maximumAge: 0
                    }
                );
            };
            
            // Attach native DOM event listener (bypasses React's synthetic events completely)
            // Use capture phase to ensure it fires immediately and preserves gesture chain
            button.addEventListener('click', handleClick, { capture: true, passive: true });
            
            cleanup = () => {
                button.removeEventListener('click', handleClick, { capture: true });
            };
        }, 0);
        
        return () => {
            clearTimeout(timeoutId);
            if (cleanup) cleanup();
        };
    }, [visible, onGeolocationSuccess, onGeolocationError, width]);
    
    return (
        <Modal 
            transparent 
            animationType="fade" 
            visible={visible} 
            onRequestClose={onCancel}
        >
            <View style={styles.backdrop}>
                <View style={styles.card}>
                    <View style={styles.iconWrap}>
                        <Ionicons name="location-outline" size={44} color={colors.maroon} />
                    </View>
                    <Text style={styles.title}>Enable Location</Text>
                    <Text style={styles.msg}>
                        Your status is ON, but your GPS or location is not enabled. 
                        Please enable your location to receive nearby errands and commissions.
                    </Text>
                    {isLoading ? (
                        <ActivityIndicator size="large" color={colors.maroon} style={{ marginTop: 10 }} />
                    ) : (
                        <View style={styles.buttonContainer}>
                            {isMobileBrowser() && onGeolocationSuccess && onGeolocationError ? (
                                // CRITICAL: Use native DOM button with ref for MOBILE BROWSERS
                                // Event listener attached via useEffect to bypass React's synthetic events
                                <button
                                    ref={buttonRef}
                                    style={{
                                        backgroundColor: colors.maroon,
                                        padding: '14px',
                                        borderRadius: '12px',
                                        width: '100%',
                                        border: 'none',
                                        cursor: 'pointer',
                                        marginBottom: '10px',
                                    }}
                                >
                                    <span style={{
                                        color: '#fff',
                                        fontWeight: '700',
                                        fontSize: '14px',
                                    }}>Enable Location</span>
                                </button>
                            ) : (
                                <TouchableOpacity
                                    onPress={onEnableLocation}
                                    style={styles.enableBtn}
                                    activeOpacity={0.9}
                                >
                                    <Text style={styles.enableText}>Enable Location</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                onPress={onCancel}
                                style={styles.cancelBtn}
                                activeOpacity={0.9}
                            >
                                <Text style={styles.cancelText}>Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.38)",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
    },
    card: { 
        width: 400, 
        maxWidth: "100%", 
        backgroundColor: "#fff", 
        borderRadius: 14, 
        padding: 24, 
        alignItems: "center" 
    },
    iconWrap: {
        width: 64,
        height: 64,
        borderRadius: 999,
        backgroundColor: colors.faint,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 12,
    },
    title: { 
        color: colors.text, 
        fontSize: 18, 
        fontWeight: "900", 
        marginBottom: 8, 
        textAlign: "center" 
    },
    msg: { 
        color: colors.text, 
        fontSize: 13, 
        opacity: 0.9, 
        marginBottom: 20, 
        textAlign: "center",
        lineHeight: 20,
    },
    buttonContainer: {
        width: "100%",
        gap: 10,
    },
    enableBtn: { 
        backgroundColor: colors.maroon, 
        paddingVertical: 14, 
        borderRadius: 12, 
        width: "100%", 
        alignItems: "center", 
        justifyContent: "center" 
    },
    enableText: { 
        color: "#fff", 
        fontWeight: "700",
        fontSize: 14,
    },
    cancelBtn: { 
        backgroundColor: "#fff", 
        paddingVertical: 14, 
        borderRadius: 12, 
        width: "100%", 
        alignItems: "center", 
        justifyContent: "center",
        borderWidth: 1,
        borderColor: colors.border,
    },
    cancelText: { 
        color: colors.text, 
        fontWeight: "700",
        fontSize: 14,
    },
});

