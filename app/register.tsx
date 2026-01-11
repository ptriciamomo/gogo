// app/register.tsx
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRegistration } from '../stores/registration';
import { registerUser } from '../utils/supabaseHelpers';
import { responsive, rw, rh, rf, rp, rb } from '../utils/responsive';

const MAROON = '#8B0000';
const FIELD_RADIUS = 8;

type Option = { label: string; value: string };

function CustomSelect({
    placeholder,
    value,
    onChange,
    options,
    heightStyle,
}: {
    placeholder: string;
    value: string | null;
    onChange: (v: string) => void;
    options: Option[];
    heightStyle: any;
}) {
    const [open, setOpen] = useState(false);
    const isWeb = Platform.OS === 'web';

    return (
        <View
            style={[
                styles.selectBlock,
                open && { zIndex: 30 },
                Platform.OS === 'android' && open ? { elevation: 30 } : null,
                isWeb && { position: 'relative' },
                isWeb && open && { 
                    zIndex: 10000, // Very high z-index when open on web
                    ...(Platform.OS === 'web' ? {
                        isolation: 'isolate', // Create new stacking context to ensure dropdown covers button
                    } as any : {}),
                },
            ]}
        >
            <Pressable
                onPress={() => setOpen((o) => !o)}
                style={[styles.selectWrapper, heightStyle]}
                android_ripple={{ color: '#eee' }}
            >
                <Text
                    style={[styles.selectText, !value && { color: '#8a8a8a' }]}
                    numberOfLines={1}
                >
                    {value ? options.find((o) => o.value === value)?.label : placeholder}
                </Text>

                <Ionicons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color="#505050"
                    style={styles.selectIcon}
                />
            </Pressable>

            {open && (
                <View 
                    style={[
                        styles.menuInline, 
                        Platform.OS === 'android' ? { elevation: 16 } : null,
                        isWeb && styles.menuInlineWeb,
                        isWeb && { 
                            opacity: 1,
                            backgroundColor: 'rgb(255, 255, 255)', // Use rgb for guaranteed opacity
                            background: 'rgb(255, 255, 255)', // CSS background property
                            ...(Platform.OS === 'web' ? {
                                isolation: 'isolate', // Create new stacking context
                            } as any : {}),
                        }
                    ]}
                    // @ts-ignore - Web-specific prop to ensure solid background
                    {...(isWeb ? { 
                        'data-opaque': 'true',
                        'data-background': 'rgb(255, 255, 255)',
                    } : {})}
                >
                    <View style={isWeb ? {
                        backgroundColor: 'rgb(255, 255, 255)',
                        background: 'rgb(255, 255, 255)',
                        width: '100%',
                        minHeight: '100%',
                        opacity: 1,
                        ...(Platform.OS === 'web' ? {
                            mixBlendMode: 'normal',
                            // Force solid background that extends to cover button
                            position: 'relative' as any,
                            zIndex: 1,
                        } as any : {}),
                    } : {}}>
                        <ScrollView 
                            style={[
                                styles.menuScrollView,
                                isWeb && { 
                                    opacity: 1, 
                                    backgroundColor: 'rgb(255, 255, 255)',
                                    background: 'rgb(255, 255, 255)',
                                }
                            ]}
                            showsVerticalScrollIndicator={true}
                            nestedScrollEnabled={true}
                        >
                            {options.map((opt) => {
                                const selected = value === opt.value;
                                return (
                                    <Pressable
                                        key={opt.value}
                                        onPress={() => {
                                            onChange(opt.value);
                                            setOpen(false);
                                        }}
                                        style={({ pressed }) => [
                                            styles.menuItem,
                                            selected && styles.menuItemSelected,
                                            pressed && styles.menuItemPressed,
                                            isWeb && {
                                                backgroundColor: pressed ? 'rgb(242, 242, 242)' : (selected ? 'rgb(247, 236, 236)' : 'rgb(255, 255, 255)'),
                                                background: pressed ? 'rgb(242, 242, 242)' : (selected ? 'rgb(247, 236, 236)' : 'rgb(255, 255, 255)'),
                                                opacity: 1,
                                            }
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.menuItemText,
                                                selected && styles.menuItemTextSelected,
                                            ]}
                                            numberOfLines={1}
                                        >
                                            {opt.label}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </ScrollView>
                    </View>
                </View>
            )}
        </View>
    );
}

export default function RegisterScreen() {
    const router = useRouter();
    const { width: winW, height: winH } = useWindowDimensions();

    // breakpoints
    const isSM = winW < 600;
    const isMD = winW >= 600 && winW < 900;
    const isLG = winW >= 900;
    const isWeb = Platform.OS === 'web' || isLG;

    const setFromRegister = useRegistration((s) => s.setFromRegister);

    // web card width (responsive clamp) - made wider for two-column layout
    const containerWidth = useMemo(() => {
        if (!isWeb) return '100%';
        // Use clamp-like behavior: responsive percentage with min/max bounds
        const pct = isLG ? 0.65 : isMD ? 0.75 : 0.85;
        const computed = Math.floor(winW * pct);
        // Minimum 600px, maximum 1000px, but allow smaller on very small screens
        const minWidth = winW < 800 ? 320 : 600;
        return Math.min(Math.max(minWidth, computed), 1000);
    }, [isWeb, isLG, isMD, winW]);

    // mobile form max width + tiny inner pad (narrower so inputs don’t hug edges)
    const mobileWrapStyle = useMemo(() => {
        const sidePad = 18;
        const clamp = 408;
        const maxWidth = Math.min(clamp, winW - sidePad * 2);
        return { maxWidth, paddingHorizontal: 6, alignSelf: 'center' } as const;
    }, [winW]);

    // logos
    const logoSize = useMemo(() => {
        const w = isSM ? 84 : 96;
        return { width: w, height: w };
    }, [isSM]);
    const logoWebSize = useMemo(() => {
        const w = isLG ? 48 : 42;
        return { width: w, height: w };
    }, [isLG]);

    // dropdown data
    const roleItems: Option[] = useMemo(
        () => [
            { label: 'BuddyRunner', value: 'BuddyRunner' },
            { label: 'BuddyCaller', value: 'BuddyCaller' },
        ],
        []
    );
    const courseItems: Option[] = useMemo(
        () => [
            { label: 'College of Accounting Education', value: 'College of Accounting Education' },
            { label: 'College of Architecture and Fine Art Education', value: 'College of Architecture and Fine Art Education' },
            { label: 'College of Arts and Science Education', value: 'College of Arts and Science Education' },
            { label: 'College of Business Administration Education', value: 'College of Business Administration Education' },
            { label: 'College of Computing Education', value: 'College of Computing Education' },
            { label: 'College of Criminal Justice Education', value: 'College of Criminal Justice Education' },
            { label: 'College of Engineering Education', value: 'College of Engineering Education' },
            { label: 'College of Hospitality Education', value: 'College of Hospitality Education' },
            { label: 'College of Health Science Education', value: 'College of Health Science Education' },
            { label: 'College of Teacher Education', value: 'College of Teacher Education' },
            { label: 'College of Legal Education', value: 'College of Legal Education' },
            { label: 'Professional Schools', value: 'Professional Schools' },
            { label: 'Basic Education', value: 'Basic Education' },
   
   
            
        ],
        []
    );

    // fields
    const [role, setRole] = useState<string | null>(null);
    const [course, setCourse] = useState<string | null>(null);

    const [first_name, setFirstName] = useState('');
    const [middle_name, setMiddleName] = useState('');
    const [last_name, setLastName] = useState('');
    const [student_id, setStudentId] = useState('');
    const [phone, setPhone] = useState('');
    const [message, setMessage] = useState('');



    // Validation function
    const isFormValid = () => {
        // Check if all required fields are filled
        if (!role || !first_name || !last_name || !student_id || !course || !phone) {
            return false;
        }
        
        // Check if Student ID is exactly 6 digits
        if (student_id.length !== 6) {
            return false;
        }
        
        // Check if Phone number is exactly 11 digits
        if (phone.length !== 10) {
            return false;
        }
        
        return true;
    };

    const handleNext = () => {
        if (!isFormValid()) {
            if (!role || !first_name || !last_name || !student_id || !course || !phone) {
                setMessage('Please fill in all required fields');
            } else if (student_id.length !== 6) {
                setMessage('Student ID must be exactly 6 digits');
            } else if (phone.length !== 10) {
                setMessage('Phone number must be exactly 10 digits');
            }
            return;
        }

        setFromRegister({
            role: role!,
            firstName: first_name,
            middleName: middle_name,
            lastName: last_name,
            studentId: student_id,
            course: course!,
            phone,
        });


        setMessage('');

        router.push({
            pathname: '/id',
            params: {
                role,
                first_name,
                middle_name,
                last_name,
                student_id,
                course,
                phone,
            },
        });
    };

    const renderFields = () => (
        <>
            <Text style={styles.label}>Select your role:</Text>
            <CustomSelect
                placeholder="GoBuddy Role"
                value={role}
                onChange={(v) => setRole(v)}
                options={roleItems}
                heightStyle={isWeb ? styles.webFieldHeight : styles.mobileFieldHeight}
            />


            <Text style={styles.label}>First Name:</Text>
            <TextInput
                style={[styles.input, isWeb ? styles.webFieldHeight : styles.mobileFieldHeight]}
                value={first_name}
                onChangeText={(text) => {
                    // Allow any symbols except numbers
                    const noNumbers = text.replace(/[0-9]/g, '');
                    // Capitalize first letter, lowercase the rest (matches examples: "maria" → "Maria")
                    const capitalized = noNumbers ? noNumbers.charAt(0).toUpperCase() + noNumbers.slice(1).toLowerCase() : '';
                    setFirstName(capitalized);
                }}
                placeholder="Enter your first name"
                autoCapitalize="words"
                autoCorrect={true}
                keyboardType="default"
                returnKeyType="next"
            />

            <Text style={styles.label}>Middle Name:</Text>
            <TextInput
                style={[styles.input, isWeb ? styles.webFieldHeight : styles.mobileFieldHeight]}
                value={middle_name}
                onChangeText={(text) => {
                    // Allow any symbols except numbers
                    const noNumbers = text.replace(/[0-9]/g, '');
                    // Capitalize first letter, lowercase the rest (matches examples: "mendoza" → "Mendoza")
                    const capitalized = noNumbers ? noNumbers.charAt(0).toUpperCase() + noNumbers.slice(1).toLowerCase() : '';
                    setMiddleName(capitalized);
                }}
                placeholder="Enter your middle name"
                autoCapitalize="words"
                autoCorrect={true}
                keyboardType="default"
                returnKeyType="next"
            />

            <Text style={styles.label}>Last Name:</Text>
            <TextInput
                style={[styles.input, isWeb ? styles.webFieldHeight : styles.mobileFieldHeight]}
                value={last_name}
                onChangeText={(text) => {
                    // Allow any symbols except numbers
                    const noNumbers = text.replace(/[0-9]/g, '');
                    // Capitalize first letter, lowercase the rest (matches examples: "padilla" → "Padilla")
                    const capitalized = noNumbers ? noNumbers.charAt(0).toUpperCase() + noNumbers.slice(1).toLowerCase() : '';
                    setLastName(capitalized);
                }}
                placeholder="Enter your last name"
                autoCapitalize="words"
                autoCorrect={true}
                keyboardType="default"
                returnKeyType="next"
            />

            <Text style={styles.label}>Student ID Number:</Text>
            <TextInput
                style={[
                    styles.input, 
                    isWeb ? styles.webFieldHeight : styles.mobileFieldHeight,
                    student_id.length > 0 && student_id.length !== 6 && styles.inputError
                ]}
                value={student_id}
                onChangeText={(text) => {
                    // Limit to 6 digits only
                    const numericText = text.replace(/[^0-9]/g, '');
                    if (numericText.length <= 6) {
                        setStudentId(numericText);
                    }
                }}
                placeholder="Enter your student id number"
                keyboardType="number-pad"
                maxLength={6}
            />
            {student_id.length > 0 && student_id.length !== 6 && (
                <Text style={styles.errorText}>Student ID must be exactly 6 digits</Text>
            )}

            <Text style={styles.label}>Department:</Text>
            <CustomSelect
                placeholder="UM Department"
                value={course}
                onChange={(v) => setCourse(v)}
                options={courseItems}
                heightStyle={isWeb ? styles.webFieldHeight : styles.mobileFieldHeight}
            />

            <Text style={styles.label}>Phone number:</Text>
            <View
                style={[
                    styles.phoneInputContainer,
                    isWeb ? styles.webFieldHeight : styles.mobileFieldHeight,
                    phone.length > 0 && phone.length !== 10 && styles.inputError
                ]}
            >
                <View style={styles.countryCodeContainer}>
                    <Text style={styles.flag}>🇵🇭</Text>
                    <Text style={styles.countryCode}>+63</Text>
                </View>
                <TextInput
                    style={styles.phoneInput}
                    value={phone}
                    onChangeText={(text) => {
                        // Limit to 10 digits only
                        const numericText = text.replace(/[^0-9]/g, '');
                        if (numericText.length <= 10) {
                            setPhone(numericText);
                        }
                    }}
                    placeholder="Enter your phone number"
                    keyboardType="phone-pad"
                    maxLength={10}
                />
            </View>
            {phone.length > 0 && phone.length !== 10 && (
                <Text style={styles.errorText}>Phone number must be exactly 10 digits</Text>
            )}

            <TouchableOpacity 
                style={[
                    styles.registerBtn, 
                    !isFormValid() && styles.registerBtnDisabled
                ]} 
                onPress={handleNext}
                disabled={!isFormValid()}
                activeOpacity={isFormValid() ? 0.7 : 1}
            >
                <Text style={[
                    styles.registerText,
                    !isFormValid() && styles.registerTextDisabled
                ]}>Next</Text>
            </TouchableOpacity>
        </>
    );

    // Web version with two-column layout
    const renderWebFields = () => {
        // Determine if we should stack columns (on smaller screens)
        const shouldStack = winW < 800;
        
        return (
        <>
            <View style={[
                styles.twoColumnWrapper,
                shouldStack && styles.twoColumnStacked
            ]}>
                {/* Left Column - 4 fields */}
                <View style={styles.leftColumn}>
                    <Text style={styles.label}>Select your role:</Text>
                    <CustomSelect
                        placeholder="GoBuddy Role"
                        value={role}
                        onChange={(v) => setRole(v)}
                        options={roleItems}
                        heightStyle={styles.webFieldHeight}
                    />

                    <Text style={styles.label}>First Name:</Text>
                    <TextInput
                        style={[styles.input, styles.webFieldHeight]}
                        value={first_name}
                        onChangeText={(text) => {
                            // Allow any symbols except numbers
                            const noNumbers = text.replace(/[0-9]/g, '');
                            // Capitalize first letter, keep rest as typed
                            const capitalized = noNumbers ? noNumbers.charAt(0).toUpperCase() + noNumbers.slice(1) : '';
                            setFirstName(capitalized);
                        }}
                        placeholder="Enter your first name"
                        placeholderTextColor="#8a8a8a"
                        autoCapitalize="words"
                        autoCorrect={true}
                        keyboardType="default"
                        returnKeyType="next"
                    />

                    <Text style={styles.label}>Middle Name:</Text>
                    <TextInput
                        style={[styles.input, styles.webFieldHeight]}
                        value={middle_name}
                        onChangeText={(text) => {
                            // Allow any symbols except numbers
                            const noNumbers = text.replace(/[0-9]/g, '');
                            // Capitalize first letter, keep rest as typed
                            const capitalized = noNumbers ? noNumbers.charAt(0).toUpperCase() + noNumbers.slice(1) : '';
                            setMiddleName(capitalized);
                        }}
                        placeholder="Enter your middle name"
                        placeholderTextColor="#8a8a8a"
                        autoCapitalize="words"
                        autoCorrect={true}
                        keyboardType="default"
                        returnKeyType="next"
                    />

                    <Text style={styles.label}>Last Name:</Text>
                    <TextInput
                        style={[styles.input, styles.webFieldHeight]}
                        value={last_name}
                        onChangeText={(text) => {
                            // Allow any symbols except numbers
                            const noNumbers = text.replace(/[0-9]/g, '');
                            // Capitalize first letter, keep rest as typed
                            const capitalized = noNumbers ? noNumbers.charAt(0).toUpperCase() + noNumbers.slice(1) : '';
                            setLastName(capitalized);
                        }}
                        placeholder="Enter your last name"
                        placeholderTextColor="#8a8a8a"
                        autoCapitalize="words"
                        autoCorrect={true}
                        keyboardType="default"
                        returnKeyType="next"
                    />
                </View>

                {/* Right Column - 3 fields */}
                <View style={styles.rightColumn}>
                    <Text style={styles.label}>Student ID Number:</Text>
                    <TextInput
                        style={[
                            styles.input, 
                            styles.webFieldHeight,
                            student_id.length > 0 && student_id.length !== 6 && styles.inputError
                        ]}
                        value={student_id}
                        onChangeText={(text) => {
                            const numericText = text.replace(/[^0-9]/g, '');
                            if (numericText.length <= 6) {
                                setStudentId(numericText);
                            }
                        }}
                        placeholder="Enter your student id number"
                        placeholderTextColor="#8a8a8a"
                        keyboardType="number-pad"
                        maxLength={6}
                    />
                    {student_id.length > 0 && student_id.length !== 6 && (
                        <Text style={styles.errorText}>Student ID must be exactly 6 digits</Text>
                    )}

                    <Text style={styles.label}>Department:</Text>
                    <CustomSelect
                        placeholder="UM Department"
                        value={course}
                        onChange={(v) => setCourse(v)}
                        options={courseItems}
                        heightStyle={styles.webFieldHeight}
                    />

                    <Text style={styles.label}>Phone number:</Text>
                    <View
                        style={[
                            styles.phoneInputContainer,
                            styles.webFieldHeight,
                            phone.length > 0 && phone.length !== 10 && styles.inputError
                        ]}
                    >
                        <View style={styles.countryCodeContainer}>
                            <Text style={styles.flag}>🇵🇭</Text>
                            <Text style={styles.countryCode}>+63</Text>
                        </View>
                        <TextInput
                            style={styles.phoneInput}
                            value={phone}
                            onChangeText={(text) => {
                                const numericText = text.replace(/[^0-9]/g, '');
                                if (numericText.length <= 10) {
                                    setPhone(numericText);
                                }
                            }}
                            placeholder="Enter your phone number"
                            placeholderTextColor="#8a8a8a"
                            keyboardType="phone-pad"
                            maxLength={10}
                        />
                    </View>
                    {phone.length > 0 && phone.length !== 10 && (
                        <Text style={styles.errorText}>Phone number must be exactly 10 digits</Text>
                    )}
                </View>
            </View>

            {/* Centered button */}
            <View style={styles.buttonWrapper}>
                <TouchableOpacity 
                    style={[
                        styles.registerBtnWeb, 
                        !isFormValid() && styles.registerBtnDisabled
                    ]} 
                    onPress={handleNext}
                    disabled={!isFormValid()}
                    activeOpacity={isFormValid() ? 0.7 : 1}
                >
                    <Text style={[
                        styles.registerText,
                        !isFormValid() && styles.registerTextDisabled
                    ]}>Next</Text>
                </TouchableOpacity>
            </View>
        </>
        );
    };

    return (
        // ⬇️ Safe margins are here and DO NOT SCROLL
        <SafeAreaView
            edges={Platform.OS === 'web' ? [] : ['top', 'bottom']}
            style={styles.safeArea}
        >
            <StatusBar barStyle="dark-content" />
            <KeyboardAvoidingView
                style={styles.keyboardAvoid}
                behavior="padding"
                keyboardVerticalOffset={0}
            >
                <ScrollView
                    style={{ width: '100%' }}
                    contentContainerStyle={[
                        styles.scrollContent,
                        isWeb ? styles.scrollWeb : styles.scrollMobile, // no top/bottom padding here
                    ]}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {isWeb ? (
                        <View
                            style={[
                                styles.webCard,
                                { width: containerWidth, maxWidth: '100%' },
                            ]}
                        >
                            <View style={styles.headerRow}>
                                <TouchableOpacity onPress={() => {
                                    if (Platform.OS === 'web') {
                                        router.replace('/');
                                    } else {
                                        router.back();
                                    }
                                }}>
                                    <Ionicons name="arrow-back" size={16} color={MAROON} />
                                </TouchableOpacity>
                                <Text style={styles.header}>Create Account</Text>
                            </View>

                            <Image
                                source={require('../assets/images/logo.png')}
                                style={[styles.logoWeb, logoWebSize]}
                                resizeMode="contain"
                            />

                            {message ? (
                                <View style={styles.infoBanner}>
                                    <Text style={styles.infoText}>ℹ️ {message}</Text>
                                </View>
                            ) : null}

                            {renderWebFields()}
                        </View>
                    ) : (
                        <View style={[styles.mobileWrap, mobileWrapStyle]}>
                            <View style={styles.headerRow}>
                                <TouchableOpacity onPress={() => router.back()}>
                                    <Ionicons name="arrow-back" size={22} color={MAROON} />
                                </TouchableOpacity>
                                <Text style={styles.header}>  Create Account</Text>
                            </View>

                            <Image
                                source={require('../assets/images/logo.png')}
                                style={[styles.logo, logoSize]}
                                resizeMode="contain"
                            />

                            {message ? (
                                <View style={styles.infoBanner}>
                                    <Text style={styles.infoText}>ℹ️ {message}</Text>
                                </View>
                            ) : null}

                            {renderFields()}
                        </View>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#fff' },
    keyboardAvoid: { flex: 1 },

    scrollContent: { flexGrow: 1, alignItems: 'center', paddingVertical: rp(12) },
    scrollWeb: { justifyContent: 'center', paddingHorizontal: rp(6), paddingBottom: rp(40) },
    // only horizontal padding; top/bottom are handled by SafeAreaView so they don't scroll
    scrollMobile: { justifyContent: 'flex-start', paddingHorizontal: rp(16) },

    // Web card
    webCard: {
        backgroundColor: '#fff',
        borderTopLeftRadius: rb(12),
        borderTopRightRadius: rb(12),
        borderBottomLeftRadius: rb(FIELD_RADIUS),
        borderBottomRightRadius: rb(FIELD_RADIUS),
        borderWidth: 1,
        borderColor: MAROON,
        padding: rp(20),
        marginHorizontal: rp(6),
        width: '100%',
        maxWidth: '100%',
    },

    // Two-column layout for web
    twoColumnWrapper: {
        flexDirection: 'row',
        gap: rp(20),
        width: '100%',
    },
    twoColumnStacked: {
        flexDirection: 'column',
    },
    leftColumn: {
        flex: 1,
        minWidth: 0, // Allow flex items to shrink below their content size
    },
    rightColumn: {
        flex: 1,
        minWidth: 0, // Allow flex items to shrink below their content size
        ...(Platform.OS === 'web' ? {
            position: 'relative' as any,
            zIndex: 0, // Lower z-index so dropdown can cover elements below
        } : {}),
    },
    buttonWrapper: {
        width: '100%',
        alignItems: 'center',
        marginTop: 18,
        ...(Platform.OS === 'web' ? {
            position: 'relative' as any,
            zIndex: -1, // Negative z-index to ensure dropdown covers it
        } : {}),
    },

    // Mobile container
    mobileWrap: { width: '100%' },

    headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: rp(6) },
    header: { fontSize: rf(15), fontWeight: '700', color: MAROON, marginLeft: rp(6) },

    // logos
    logo: { alignSelf: 'center', marginVertical: rp(12) },
    logoWeb: { alignSelf: 'center', marginVertical: rp(6) },

    // banners
    infoBanner: {
        backgroundColor: '#e7f3fe',
        borderLeftWidth: 3,
        borderLeftColor: '#2196F3',
        padding: rp(6),
        marginBottom: rp(8),
        borderRadius: rb(6),
    },
    infoText: { color: '#0b5394', fontSize: rf(12), fontWeight: '600' },

    // labels
    label: { fontWeight: '700', color: MAROON, marginTop: rp(6), marginBottom: rp(4), fontSize: 13 },

    // inputs
    input: {
        borderWidth: 1,
        borderColor: MAROON,
        borderRadius: rb(FIELD_RADIUS),
        paddingHorizontal: 10,
        fontSize: 13,
        color: '#000',
        marginBottom: rp(8),
        width: '100%',
        backgroundColor: '#fff',
    },

    // Custom select
    selectBlock: { 
        width: '100%', 
        marginBottom: rp(8),
        ...(Platform.OS === 'web' ? {
            position: 'relative' as any,
            zIndex: 1, // Ensure proper stacking context
        } : {}),
    },
    selectWrapper: {
        borderWidth: 1,
        borderColor: MAROON,
        borderRadius: rb(FIELD_RADIUS),
        backgroundColor: '#fff',
        paddingHorizontal: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    selectText: { fontSize: 13, color: '#000', flex: 1, paddingRight: rp(12) },
    selectIcon: { marginLeft: rp(8) },

    // Menu
    menuInline: {
        alignSelf: 'stretch',
        borderWidth: 1,
        borderColor: MAROON,
        borderTopWidth: 0,
        borderBottomLeftRadius: rb(FIELD_RADIUS),
        borderBottomRightRadius: rb(FIELD_RADIUS),
        backgroundColor: 'rgb(255, 255, 255)', // Use rgb for guaranteed opacity
        overflow: 'hidden',
        maxHeight: rh(25), // Limit dropdown height to make it scrollable
    },
    menuInlineWeb: {
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        zIndex: 9999, // Very high z-index to ensure it's above everything
        marginTop: -1, // Overlap the border with the select wrapper
        borderTopWidth: 1, // Restore top border since we're overlapping
        backgroundColor: 'rgb(255, 255, 255)', // Use rgb for guaranteed opacity
        background: 'rgb(255, 255, 255)', // CSS background property
        opacity: 1, // Ensure full opacity
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 5,
        ...(Platform.OS === 'web' ? {
            // Web-specific styles to ensure complete opacity and solid background
            willChange: 'auto',
            backfaceVisibility: 'hidden',
            // Force solid background with no transparency
            WebkitBackgroundClip: 'padding-box',
            backgroundClip: 'padding-box',
            // Ensure no transparency
            mixBlendMode: 'normal',
            // Force hardware acceleration and solid rendering
            transform: 'translateZ(0)',
            WebkitTransform: 'translateZ(0)',
            // Create new stacking context to ensure it's above button
            isolation: 'isolate',
        } as any : {}),
    },
    menuScrollView: {
        maxHeight: rh(25), // Maximum height for scrollable area
        backgroundColor: 'rgb(255, 255, 255)', // Use rgb for guaranteed opacity
        ...(Platform.OS === 'web' ? {
            backgroundColor: 'rgb(255, 255, 255)',
            background: 'rgb(255, 255, 255)',
            opacity: 1,
            // Force solid background
            WebkitBackgroundClip: 'padding-box',
            backgroundClip: 'padding-box',
            mixBlendMode: 'normal',
            transform: 'translateZ(0)',
            WebkitTransform: 'translateZ(0)',
        } as any : {}),
    },
    menuItem: { 
        paddingVertical: rp(10), 
        paddingHorizontal: rp(12),
        backgroundColor: 'rgb(255, 255, 255)', // Use rgb for guaranteed opacity
        ...(Platform.OS === 'web' ? {
            backgroundColor: 'rgb(255, 255, 255)',
            background: 'rgb(255, 255, 255)',
            opacity: 1,
            // Force solid background
            WebkitBackgroundClip: 'padding-box',
            backgroundClip: 'padding-box',
            mixBlendMode: 'normal',
            transform: 'translateZ(0)',
            WebkitTransform: 'translateZ(0)',
        } as any : {}),
    },
    menuItemPressed: { backgroundColor: '#f2f2f2' },
    menuItemSelected: { backgroundColor: '#f7ecec' },
    menuItemText: { fontSize: 13, color: '#1f1f1f' },
    menuItemTextSelected: { color: MAROON, fontWeight: '700' },

    webFieldHeight: { 
        minHeight: 38, 
        paddingVertical: 8,
    },
    mobileFieldHeight: { height: 50, paddingVertical: 0 },

    phoneInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: MAROON,
        borderRadius: FIELD_RADIUS,
        marginBottom: rp(8),
        backgroundColor: '#fff',
        width: '100%',
    },
    countryCodeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        height: '100%',
        borderRightWidth: 1,
        borderRightColor: MAROON,
        backgroundColor: '#f8f8f8',
        borderTopLeftRadius: FIELD_RADIUS,
        borderBottomLeftRadius: FIELD_RADIUS,
    },
    flag: { fontSize: 18, marginRight: 6 },
    countryCode: { fontSize: 12, color: MAROON, fontWeight: '700' },
    phoneInput: { 
        flex: 1, 
        paddingHorizontal: 10, 
        fontSize: 13, 
        color: '#000',
        height: '100%',
    },


    registerBtn: {
        backgroundColor: MAROON,
        paddingVertical: 14,
        borderRadius: rb(FIELD_RADIUS),
        alignItems: 'center',
        marginTop: rp(10),
        width: '100%',
    },
    registerBtnWeb: {
        backgroundColor: MAROON,
        height: 44,
        borderRadius: rb(FIELD_RADIUS),
        alignItems: 'center',
        justifyContent: 'center',
        width: '60%',
        maxWidth: 400,
        ...(Platform.OS === 'web' ? {
            position: 'relative' as any,
            zIndex: -1, // Negative z-index to ensure dropdown covers it
        } : {}),
    },
    registerBtnDisabled: {
        backgroundColor: '#ccc',
        opacity: 0.6,
    },
    registerText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    registerTextDisabled: { color: '#999' },

    // Error styles
    inputError: {
        borderColor: '#ff4444',
        borderWidth: 2,
    },
    errorText: {
        color: '#ff4444',
        fontSize: 12,
        marginTop: 4,
        marginLeft: 4,
    },
});
