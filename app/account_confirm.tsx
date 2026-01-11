// app/accoun_confirm.tsx
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState, useRef, useCallback } from 'react';
import {
    Alert,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useRegistration } from '../stores/registration';
import { uploadImageToStorage } from '../utils/supabaseHelpers';

const MAROON = '#8B0000';

// Map role -> home path (case/whitespace insensitive)
const getHomePathForRole = (raw?: string) => {
    const role = (raw ?? '').trim().toLowerCase();
    if (role === 'buddyrunner') return '/login';
    if (role === 'buddycaller') return '/login';
    return '/';
};

export default function AccountConfirm() {
    const router = useRouter();
    const { width: winW } = useWindowDimensions();
    const isWeb = Platform.OS === 'web' || winW >= 900;

    const { email: emailParam } = useLocalSearchParams<{ email?: string }>();

    const containerWidth = isWeb
        ? Math.min(Math.max(340, Math.floor(winW * 0.26)), 440)
        : '100%';

    const modalWidth = isWeb
        ? Math.min(Math.max(320, Math.floor(winW * 0.28)), 420)
        : '100%';

    const {
        role,
        firstName,
        middleName,
        lastName,
        studentId,
        course,
        phone,
        email, // from store
        idImageUri,
        clearAll,
        updateField,
    } = useRegistration();

    // Which email to show/use
    const emailToShow = email || String(emailParam || '');

    const [submitting, setSubmitting] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);
    const [editData, setEditData] = useState({
        firstName: '',
        middleName: '',
        lastName: '',
        studentId: '',
        course: '',
        phone: '',
        role: '',
    });
    const [openDropdown, setOpenDropdown] = useState<'role' | 'course' | null>(null);

    // Dropdown options
    const roleOptions = [
        { label: 'BuddyRunner', value: 'BuddyRunner' },
        { label: 'BuddyCaller', value: 'BuddyCaller' },
    ];

    const courseOptions = [
        { label: 'College of Accounting Education', value: 'College of Accounting Education' },
        { label: 'College of Architecture and Fine Art Education', value: 'College of Architecture and Fine Art Education' },
        { label: 'College of Arts and Science Education', value: 'College of Arts and Science Education' },
        { label: 'College of Business Administration Education', value: 'College of Business Administration Education' },
        { label: 'College of Computing Education', value: 'College of Computing Education' },
        { label: 'College of Criminal Justice Education', value: 'College of Criminal Justice Education' },
        { label: 'College of Hospitality Education', value: 'College of Hospitality Education' },
        { label: 'College of Health Science Education', value: 'College of Health Science Education' },
        { label: 'College of Teacher Education', value: 'College of Teacher Education' },
        { label: 'College of Legal Education', value: 'College of Legal Education' },
        { label: 'Professional Schools', value: 'Professional Schools' },
        { label: 'Basic Education', value: 'Basic Education' },
    ];

    // ---------- validation ----------
    const missing: string[] = useMemo(() => {
        const req = [
            ['First Name', firstName],
            ['Last Name', lastName],
            ['Student Errand Role', role],
            ['Student ID Number', studentId],
            ['Course', course],
            ['Phone Number', phone],
            ['Email Address', emailToShow],
        ];
        return req
            .filter(([, v]) => !String(v || '').trim())
            .map(([k]) => k as string);
    }, [firstName, lastName, role, studentId, course, phone, emailToShow]);

    const onEdit = () => {
        // Populate edit data with current values
        setEditData({
            firstName: firstName,
            middleName: middleName,
            lastName: lastName,
            studentId: studentId,
            course: course,
            phone: phone,
            role: role,
        });
        setOpenDropdown(null); // Reset dropdown state
        setShowEditModal(true);
    };

    const onSaveEdit = () => {
        // Update the store with edited data
        updateField('firstName', editData.firstName);
        updateField('middleName', editData.middleName);
        updateField('lastName', editData.lastName);
        updateField('studentId', editData.studentId);
        updateField('course', editData.course);
        updateField('phone', editData.phone);
        updateField('role', editData.role);
        setOpenDropdown(null); // Reset dropdown state
        setShowEditModal(false);
    };

    const onCancelEdit = () => {
        setOpenDropdown(null); // Reset dropdown state
        setShowEditModal(false);
    };

    // Helper function to capitalize first letter and lowercase the rest
    const capitalizeFirstLetter = (text: string): string => {
        if (!text) return text;
        // Remove invalid characters first
        const cleaned = text.replace(/[^a-zA-Z\s.'-]/g, '');
        if (!cleaned) return '';
        // Capitalize first letter, lowercase the rest (matches examples: "maria" → "Maria")
        return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
    };

    // Stable input handlers to prevent re-renders
    const handleFirstNameChange = useCallback((text: string) => {
        const capitalized = capitalizeFirstLetter(text);
        setEditData(prev => ({ ...prev, firstName: capitalized }));
    }, []);

    const handleMiddleNameChange = useCallback((text: string) => {
        const capitalized = capitalizeFirstLetter(text);
        setEditData(prev => ({ ...prev, middleName: capitalized }));
    }, []);

    const handleLastNameChange = useCallback((text: string) => {
        const capitalized = capitalizeFirstLetter(text);
        setEditData(prev => ({ ...prev, lastName: capitalized }));
    }, []);

    const handleStudentIdChange = useCallback((text: string) => {
        const numbersOnly = text.replace(/[^0-9]/g, '');
        if (numbersOnly.length <= 6) {
            setEditData(prev => ({ ...prev, studentId: numbersOnly }));
        }
    }, []);

    const handlePhoneChange = useCallback((text: string) => {
        const numbersOnly = text.replace(/[^0-9]/g, '');
        if (numbersOnly.length <= 11) {
            setEditData(prev => ({ ...prev, phone: numbersOnly }));
        }
    }, []);

    const handleRoleChange = useCallback((value: string) => {
        setEditData(prev => ({ ...prev, role: value }));
    }, []);

    const handleCourseChange = useCallback((value: string) => {
        setEditData(prev => ({ ...prev, course: value }));
    }, []);

    const goHomeForRole = (r?: string) => {
        const path = getHomePathForRole(r);
        console.log('Routing to', path, 'for role:', r);
        router.replace(path);
    };

    const handleSuccessModalOK = () => {
        console.log('User clicked OK, clearing data and redirecting...');
        try {
            clearAll();
            console.log('Data cleared, redirecting to:', getHomePathForRole(role));
            router.replace('/login');
        } catch (redirectError) {
            console.error('Error during redirect:', redirectError);
            // Fallback redirect
            router.replace('/login');
        }
    };

    const onRegister = async () => {
        if (submitting) return;

        if (missing.length) {
            Alert.alert('Missing info', `Please complete: ${missing.join(', ')}`);
            return;
        }

        try {
            setSubmitting(true);
            console.log('=== REGISTRATION STARTED ===');

            // must be signed in already (after /verify)
            console.log('Step 1: Checking authentication...');
            const authPromise = supabase.auth.getUser();
            const authTimeout = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Auth check timeout')), 10000)
            );
            
            const { data: auth, error: authErr } = await Promise.race([authPromise, authTimeout]) as any;
            if (authErr) throw authErr;

            const uid = auth.user?.id;
            if (!uid) {
                Alert.alert('Not signed in', 'Please verify your email first.');
                return;
            }
            console.log('Step 1: Authentication verified, user ID:', uid);

                // --- Check for existing user and id_image_path FIRST (before any upload attempts) ---
                console.log('Step 2: Checking for existing user and id_image_path...');
                let existingImagePath: string | null = null;
                try {
                    const { data: existingUser, error: existingUserError } = await supabase
                        .from('users')
                        .select('id_image_path')
                        .eq('id', uid)
                        .maybeSingle();
                    
                    if (existingUserError && existingUserError.code !== 'PGRST116') {
                        console.log('Step 2: Error checking existing user:', existingUserError);
                    }
                    
                    if (existingUser?.id_image_path) {
                        existingImagePath = existingUser.id_image_path;
                        console.log('Step 2: Found existing id_image_path:', existingImagePath);
                    } else {
                        console.log('Step 2: No existing id_image_path found (new user or no image)');
                    }
                } catch (checkErr) {
                    console.log('Step 2: Could not check existing user (may be new user):', checkErr);
                }

                // --- Upload ID image (optional). Do not block if this fails. ---
                let idImagePath: string | null = null;
                console.log('Step 2b: Checking idImageUri from registration store...');
                console.log('Step 2b: idImageUri value:', idImageUri);
                console.log('Step 2b: idImageUri type:', typeof idImageUri);
                console.log('Step 2b: idImageUri truthy?', !!idImageUri);
                console.log('Step 2b: idImageUri length:', idImageUri?.length);
                
                if (idImageUri) {
                    try {
                        console.log('Step 2b: Starting image upload for user:', uid);
                        console.log('Image URI:', idImageUri);
                        console.log('Image URI type:', typeof idImageUri);
                        console.log('Image URI length:', idImageUri?.length);
                        
                        // Generate a unique filename with user ID and timestamp
                        const timestamp = Date.now();
                        const fileName = `student_id_${uid}_${timestamp}.jpg`;
                        console.log('Generated filename:', fileName);
                        
                        // Add timeout for image upload (20 seconds - increased for reliability)
                        const uploadPromise = uploadImageToStorage(idImageUri, fileName, 'student-ids');
                        const timeoutPromise = new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Image upload timeout after 20 seconds')), 20000)
                        );
                        
                        console.log('Starting image upload with timeout...');
                        const uploadResult = await Promise.race([uploadPromise, timeoutPromise]) as any;
                        
                        console.log('Step 2b: Upload result received:', uploadResult);
                        console.log('Step 2b: Upload result type:', typeof uploadResult);
                        console.log('Step 2b: Upload result keys:', uploadResult ? Object.keys(uploadResult) : 'null');
                        
                        if (uploadResult && uploadResult.success) {
                            // Use publicUrl if available, otherwise use path
                            idImagePath = uploadResult.publicUrl || uploadResult.path;
                            console.log('Step 2b: Image upload successful!');
                            console.log('Step 2b: Saved image path:', idImagePath);
                            console.log('Step 2b: Full upload result:', JSON.stringify(uploadResult, null, 2));
                            
                            if (!idImagePath) {
                                console.error('Step 2b: ERROR - Upload succeeded but no path/publicUrl returned!');
                                console.error('Step 2b: Upload result:', uploadResult);
                            }
                        } else {
                            console.error('Step 2b: Image upload failed - no success flag');
                            console.error('Step 2b: Upload result:', uploadResult);
                            throw new Error('Image upload did not return success');
                        }
                    } catch (uploadErr: any) {
                        console.error('Step 2b: ID upload ERROR:', uploadErr?.message || uploadErr);
                        console.error('Step 2b: Full error:', uploadErr);
                        // Continue without image - don't block registration
                        // But log the error clearly
                        Alert.alert(
                            'Image Upload Notice',
                            'Your student ID image could not be uploaded, but registration will continue. You can update your ID image later in your profile settings.',
                            [{ text: 'OK' }]
                        );
                    }
                } else {
                    console.log('Step 2b: No image to upload, skipping...');
                }

                // --- Save profile (this must succeed) ---
                console.log('Step 3: Saving user profile to database...');
                
                // Use new image path if available, otherwise preserve existing one
                const finalImagePath = idImagePath || existingImagePath;
                console.log('Step 3: Final image path to save:', finalImagePath || 'NULL');
                console.log('Step 3: New image path:', idImagePath || 'NULL');
                console.log('Step 3: Existing image path:', existingImagePath || 'NULL');
                
                // Check if user already exists to decide between insert and update
                let userExists = false;
                try {
                    const { data: checkUser, error: checkUserError } = await supabase
                        .from('users')
                        .select('id')
                        .eq('id', uid)
                        .maybeSingle();
                    
                    if (checkUserError && checkUserError.code !== 'PGRST116') {
                        console.log('Step 3: Error checking user existence:', checkUserError);
                    }
                    
                    userExists = !!checkUser;
                    console.log('Step 3: User exists in database:', userExists);
                } catch (checkErr) {
                    console.log('Step 3: User does not exist (will insert):', checkErr);
                    userExists = false;
                }
                
                let dbPromise: any;
                
                if (userExists) {
                    // User exists - use UPDATE to preserve existing fields
                    const updateData: any = {
                        email: emailToShow,
                        role,
                        first_name: firstName,
                        middle_name: middleName,
                        last_name: lastName,
                        student_id_number: studentId,
                        course,
                        phone,
                    };
                    
                    // CRITICAL: Always include id_image_path in update if we have any value
                    // This ensures the image is saved to the database
                    if (idImagePath) {
                        // New image uploaded - use it
                        updateData.id_image_path = idImagePath;
                        console.log('Step 3: Updating with NEW image path:', idImagePath);
                    } else if (existingImagePath) {
                        // No new image but existing one - explicitly preserve it
                        updateData.id_image_path = existingImagePath;
                        console.log('Step 3: Preserving EXISTING image path:', existingImagePath);
                    } else {
                        // No image at all - this is fine, user can add it later
                        console.log('Step 3: No image path to save (user did not upload image)');
                    }
                    
                    console.log('Step 3: Update data:', { ...updateData, id_image_path: updateData.id_image_path ? 'Has path' : 'Not included' });
                    dbPromise = supabase.from('users').update(updateData).eq('id', uid).select();
                } else {
                    // New user - use INSERT
                    const insertData: any = {
                        id: uid,
                        email: emailToShow,
                        role,
                        first_name: firstName,
                        middle_name: middleName,
                        last_name: lastName,
                        student_id_number: studentId,
                        course,
                        phone,
                    };
                    
                    // Include id_image_path if we have one (new or existing shouldn't exist for new user)
                    if (finalImagePath) {
                        insertData.id_image_path = finalImagePath;
                        console.log('Step 3: Including id_image_path in insert:', finalImagePath);
                    } else {
                        console.log('Step 3: No id_image_path to include in insert');
                    }
                    
                    console.log('Step 3: Insert data:', { ...insertData, id_image_path: insertData.id_image_path ? 'Has path' : 'NULL' });
                    console.log('Step 3: Full insert data object:', JSON.stringify(insertData, null, 2));
                    dbPromise = supabase.from('users').insert(insertData).select();
                }
                
                const dbTimeout = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Database operation timeout')), 10000)
                );
                
                console.log('Step 3: Executing database operation...');
                const { data: dbData, error: dbErr } = await Promise.race([dbPromise, dbTimeout]) as any;
                
                console.log('Step 3: Database operation completed');
                console.log('Step 3: Database response data:', dbData);
                console.log('Step 3: Database error:', dbErr);

            if (dbErr) {
                console.error('Step 3: Database error:', dbErr);
                console.error('Step 3: Database error details:', JSON.stringify(dbErr, null, 2));
                console.error('Step 3: Attempted to save id_image_path:', finalImagePath || 'NULL');
                
                // Check if this is a blocked email error
                const errorMessage = dbErr.message || (dbErr as any)?.details?.message || '';
                if (errorMessage.includes('blocked account') || errorMessage.includes('blocked account and cannot be used for registration')) {
                    Alert.alert(
                        'Registration Blocked',
                        'This email is associated with a blocked account and cannot be used for registration. Please contact support if you believe this is an error.',
                        [
                            {
                                text: 'OK',
                                onPress: () => {
                                    // Sign out and clear everything
                                    supabase.auth.signOut().finally(() => {
                                        clearAll();
                                        router.replace('/register');
                                    });
                                }
                            }
                        ]
                    );
                    return;
                }
                
                throw dbErr;
            }
            
            console.log('Step 3: User profile saved successfully');
            
            // --- Step 4: Verify id_image_path was saved correctly ---
            if (finalImagePath) {
                console.log('Step 4: Verifying id_image_path was saved to database...');
                try {
                    const { data: verifyUser, error: verifyErr } = await supabase
                        .from('users')
                        .select('id_image_path')
                        .eq('id', uid)
                        .maybeSingle();
                    
                    if (verifyErr && verifyErr.code !== 'PGRST116') {
                        console.error('Step 4: Error verifying saved image path:', verifyErr);
                    } else {
                        console.log('Step 4: Verified saved id_image_path:', verifyUser?.id_image_path);
                        console.log('Step 4: Expected id_image_path:', finalImagePath);
                        
                        // If the image path is missing, do a direct update
                        if (!verifyUser?.id_image_path || verifyUser.id_image_path !== finalImagePath) {
                            console.warn('Step 4: WARNING - id_image_path not found or different!');
                            console.warn('Step 4: Attempting direct update...');
                            
                            const { error: fixErr } = await supabase
                                .from('users')
                                .update({ id_image_path: finalImagePath })
                                .eq('id', uid);
                            
                            if (fixErr) {
                                console.error('Step 4: Failed to fix id_image_path:', fixErr);
                            } else {
                                console.log('Step 4: Successfully fixed id_image_path');
                                
                                // Verify one more time
                                const { data: verifyAgain } = await supabase
                                    .from('users')
                                    .select('id_image_path')
                                    .eq('id', uid)
                                    .maybeSingle();
                                console.log('Step 4: Final verification:', verifyAgain?.id_image_path);
                            }
                        } else {
                            console.log('Step 4: ✓ id_image_path verified and correct!');
                        }
                    }
                } catch (verifyEx) {
                    console.error('Step 4: Exception during verification:', verifyEx);
                }
            } else {
                console.log('Step 4: No image path to verify');
            }

            // Show success message before redirecting
            console.log('Registration completed successfully, showing success alert...');
            
            if (isWeb) {
                // For web version, show custom modal
                setShowSuccessModal(true);
            } else {
                // For mobile version, use Alert
                Alert.alert(
                    'Registration Successful!', 
                    'Your account has been created successfully. You can now log in with your credentials.',
                    [
                        {
                            text: 'OK',
                            onPress: () => {
                                console.log('User clicked OK, clearing data and redirecting...');
                                try {
                                    clearAll();
                                    console.log('Data cleared, redirecting to:', getHomePathForRole(role));
                                    goHomeForRole(role);
                                } catch (redirectError) {
                                    console.error('Error during redirect:', redirectError);
                                    // Fallback redirect
                                    router.replace('/login');
                                }
                            }
                        }
                    ]
                );
            }
        } catch (e: any) {
            console.error('Register error:', e);
            
            // Check if this is a blocked email error
            const errorMessage = e?.message || (e as any)?.details?.message || '';
            if (errorMessage.includes('blocked account') || errorMessage.includes('blocked account and cannot be used for registration')) {
                Alert.alert(
                    'Registration Blocked',
                    'This email is associated with a blocked account and cannot be used for registration. Please contact support if you believe this is an error.',
                    [
                        {
                            text: 'OK',
                            onPress: () => {
                                // Sign out and clear everything
                                supabase.auth.signOut().finally(() => {
                                    clearAll();
                                    router.replace('/register');
                                });
                            }
                        }
                    ]
                );
                return;
            } else {
                Alert.alert('Error', errorMessage || 'Could not complete registration.');
            }
        } finally {
            setSubmitting(false);
        }
    };


    // ---------- Custom Select Component ----------
    const CustomSelect = React.memo(({
        placeholder,
        value,
        onChange,
        options,
        dropdownId,
        onOpenChange,
    }: {
        placeholder: string;
        value: string | null;
        onChange: (v: string) => void;
        options: { label: string; value: string }[];
        dropdownId?: 'role' | 'course';
        onOpenChange?: (open: boolean) => void;
    }) => {
        const [open, setOpen] = useState(false);

        const isWeb = Platform.OS === 'web';
        
        const handleToggle = useCallback(() => {
            const newOpen = !open;
            setOpen(newOpen);
            if (onOpenChange) {
                onOpenChange(newOpen);
            }
        }, [open, onOpenChange]);
        
        const handleSelect = useCallback((value: string) => {
            onChange(value);
            setOpen(false);
            if (onOpenChange) {
                onOpenChange(false);
            }
        }, [onChange, onOpenChange]);
        
        return (
            <View
                style={[
                    styles.selectBlock,
                    open && { zIndex: 30 },
                    Platform.OS === 'android' && open ? { elevation: 30 } : null,
                    isWeb && { position: 'relative', zIndex: 1 },
                    isWeb && open && { 
                        zIndex: 100000,
                        ...(Platform.OS === 'web' ? {
                            isolation: 'isolate', // Create new stacking context to ensure dropdown covers content
                        } as any : {}),
                    },
                ]}
            >
                <Pressable
                    onPress={handleToggle}
                    style={styles.selectWrapper}
                    android_ripple={{ color: '#eee' }}
                    onStartShouldSetResponder={() => true}
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
                                position: 'relative' as any,
                                zIndex: 99999,
                            } as any : {}),
                        } : {}}>
                            <ScrollView 
                                style={[
                                    styles.menuScrollView,
                                    isWeb && { 
                                        opacity: 1, 
                                        backgroundColor: 'rgb(255, 255, 255)',
                                        ...(Platform.OS === 'web' ? {
                                            background: 'rgb(255, 255, 255)',
                                            zIndex: 99999,
                                        } as any : {}),
                                    }
                                ]}
                                showsVerticalScrollIndicator={true}
                                nestedScrollEnabled={true}
                            >
                                {options.map((opt) => {
                                    const selected = value === opt.value;
                                    return (
                                        <View
                                            key={opt.value}
                                            style={isWeb ? {
                                                backgroundColor: 'rgb(255, 255, 255)',
                                                background: 'rgb(255, 255, 255)',
                                                opacity: 1,
                                                width: '100%',
                                            } as any : {}}
                                        >
                                            <Pressable
                                                onPress={() => handleSelect(opt.value)}
                                                style={({ pressed }) => [
                                                    styles.menuItem,
                                                    selected && styles.menuItemSelected,
                                                    pressed && styles.menuItemPressed,
                                                    isWeb && {
                                                        backgroundColor: pressed ? 'rgb(242, 242, 242)' : (selected ? 'rgb(247, 236, 236)' : 'rgb(255, 255, 255)'),
                                                        background: pressed ? 'rgb(242, 242, 242)' : (selected ? 'rgb(247, 236, 236)' : 'rgb(255, 255, 255)'),
                                                        opacity: 1,
                                                        width: '100%',
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
                                        </View>
                                    );
                                })}
                            </ScrollView>
                        </View>
                    </View>
                )}
            </View>
        );
    });

    // ---------- small field ----------
    function Field({
        label,
        value,
        compact,
    }: {
        label: string;
        value: string;
        compact?: boolean;
    }) {
        return (
            <View style={{ marginBottom: compact ? 6 : 8 }}>
                <View style={styles.inlineRow}>
                    <Text style={[styles.label, compact && styles.labelWeb]}>{label}:</Text>
                    <Text style={[styles.value, compact && styles.valueWeb]} numberOfLines={1}>
                        {value || '—'}
                    </Text>
                </View>
            </View>
        );
    }

    // ---------- layouts ----------
    const WebLayout = () => (
        <SafeAreaView style={[styles.page, styles.center]}>
            <View style={[styles.cardWeb, { width: containerWidth }]}>
                <View style={styles.headerRowWeb}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={16} color={MAROON} />
                    </TouchableOpacity>
                    <Text style={styles.headerWeb}>Account Confirmation</Text>
                </View>

                <Image
                    source={require('../assets/images/logo.png')}
                    style={styles.logoWeb}
                    resizeMode="contain"
                />
                <Text style={styles.subtitleWeb}>Student Information</Text>

                <View style={styles.editRow}>
                    <TouchableOpacity style={styles.editBtn} onPress={onEdit} activeOpacity={0.9}>
                        <Text style={styles.editTxt}>Edit</Text>
                    </TouchableOpacity>
                </View>

                <Field label="First Name" value={firstName} compact />
                <Field label="Middle Name" value={middleName} compact />
                <Field label="Last Name" value={lastName} compact />
                <Field label="Student Role" value={role} compact />
                <Field label="Student ID Number" value={studentId} compact />
                <Field label="Course" value={course} compact />
                <Field label="Phone Number" value={phone} compact />

                <Text style={[styles.label, styles.labelWeb, { marginTop: 4 }]}>ID Picture:</Text>
                <View style={styles.idBoxWeb}>
                    {idImageUri ? (
                        <Image source={{ uri: idImageUri }} style={styles.idImgWeb} />
                    ) : (
                        <View style={styles.idPlaceholderWeb} />
                    )}
                </View>

                <Field label="Email Address" value={emailToShow} compact />

                <TouchableOpacity
                    style={[styles.registerWeb, submitting && styles.registerDisabled]}
                    onPress={onRegister}
                    disabled={submitting}
                    activeOpacity={0.95}
                >
                    <Text style={styles.registerWebTxt}>
                        {submitting ? 'Saving…' : 'Register'}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Success Modal */}
            {showSuccessModal && (
                <Modal
                    visible={showSuccessModal}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={handleSuccessModalOK}
                >
                    <View style={styles.successModalOverlay}>
                        <View style={styles.successModalContent}>
                            <Text style={styles.successModalTitle}>Registration Successful!</Text>
                            <Text style={styles.successModalMessage}>
                                Your account has been created successfully. You can now log in with your credentials.
                            </Text>
                            <TouchableOpacity
                                style={styles.successModalButton}
                                onPress={handleSuccessModalOK}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.successModalButtonText}>OK</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            )}
        </SafeAreaView>
    );

    const MobileLayout = () => (
        <SafeAreaView style={styles.page}>
            <View style={styles.mobContainer}>
                <View style={styles.headerRowMob}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={24} color={MAROON} />
                    </TouchableOpacity>
                    <Text style={styles.headerMob}>Account Confirmation</Text>
                </View>

                <Image
                    source={require('../assets/images/logo.png')}
                    style={styles.logoMob}
                    resizeMode="contain"
                />
                <Text style={styles.subtitleMob}>Student Information</Text>

                <View style={styles.editRow}>
                    <TouchableOpacity style={styles.editBtn} onPress={onEdit} activeOpacity={0.9}>
                        <Text style={styles.editTxt}>Edit</Text>
                    </TouchableOpacity>
                </View>

                <Field label="First Name" value={firstName} />
                <Field label="Middle Name" value={middleName} />
                <Field label="Last Name" value={lastName} />
                <Field label="Student Errand Role" value={role} />
                <Field label="Student ID Number" value={studentId} />
                <Field label="Course" value={course} />
                <Field label="Phone Number" value={phone} />

                <Text style={[styles.label, { marginTop: 6 }]}>ID Picture:</Text>
                <View style={styles.idBoxMob}>
                    {idImageUri ? (
                        <Image source={{ uri: idImageUri }} style={styles.idImgMob} />
                    ) : (
                        <View style={styles.idPlaceholderMob} />
                    )}
                </View>

                <Field label="Email Address" value={emailToShow} />

                <TouchableOpacity
                    style={[styles.registerMob, submitting && styles.registerDisabled]}
                    onPress={onRegister}
                    disabled={submitting}
                    activeOpacity={0.95}
                >
                    <Text style={styles.registerMobTxt}>
                        {submitting ? 'Saving…' : 'Register'}
                    </Text>
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );

    // ---------- Edit Form Modal ----------
    if (isWeb) {
        return (
            <>
                <WebLayout />
                {showEditModal && (
                    <Modal
                        visible={showEditModal}
                        animationType="fade"
                        transparent={true}
                        onRequestClose={onCancelEdit}
                    >
                        <SafeAreaView style={[styles.modalContainer, styles.modalContainerWeb]}>
                            <View style={[styles.modalContentWrapper, styles.modalContentWrapperWeb, { maxWidth: modalWidth }]}>
                                <View style={[styles.modalHeader, styles.modalHeaderWeb]}>
                                    <Text style={styles.modalTitle}>Edit Information</Text>
                                    <TouchableOpacity onPress={onCancelEdit} style={styles.closeButton}>
                                        <Ionicons name="close" size={24} color={MAROON} />
                                    </TouchableOpacity>
                                </View>

                                <KeyboardAvoidingView 
                                    style={styles.modalContent}
                                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                                >
                                    <ScrollView 
                                        style={[styles.modalBody, styles.modalBodyWeb]} 
                                        showsVerticalScrollIndicator={true}
                                        keyboardShouldPersistTaps="handled"
                                        contentContainerStyle={[styles.scrollContentContainer, styles.scrollContentContainerWeb]}
                                    >
                                        <View style={[styles.formField, styles.formFieldWeb]}>
                                            <Text style={styles.formLabel}>First Name:</Text>
                                            <TextInput
                                                style={[styles.formInput, styles.formInputWeb]}
                                                value={editData.firstName}
                                                onChangeText={handleFirstNameChange}
                                                placeholder="Enter your first name"
                                                autoCapitalize="words"
                                                autoCorrect={true}
                                                keyboardType="default"
                                                blurOnSubmit={false}
                                            />
                                        </View>

                                        <View style={[styles.formField, styles.formFieldWeb]}>
                                            <Text style={styles.formLabel}>Middle Name:</Text>
                                            <TextInput
                                                style={[styles.formInput, styles.formInputWeb]}
                                                value={editData.middleName}
                                                onChangeText={handleMiddleNameChange}
                                                placeholder="Enter your middle name"
                                                autoCapitalize="words"
                                                autoCorrect={true}
                                                keyboardType="default"
                                                blurOnSubmit={false}
                                            />
                                        </View>

                                        <View style={[styles.formField, styles.formFieldWeb]}>
                                            <Text style={styles.formLabel}>Last Name:</Text>
                                            <TextInput
                                                style={[styles.formInput, styles.formInputWeb]}
                                                value={editData.lastName}
                                                onChangeText={handleLastNameChange}
                                                placeholder="Enter your last name"
                                                autoCapitalize="words"
                                                autoCorrect={true}
                                                keyboardType="default"
                                                blurOnSubmit={false}
                                            />
                                        </View>

                                        <View style={[
                                            styles.formField, 
                                            styles.formFieldWeb, 
                                            styles.formFieldWithDropdown,
                                            openDropdown === 'role' && isWeb && { zIndex: 100000 }
                                        ]}>
                                            <Text style={styles.formLabel}>Student Role:</Text>
                                            <View style={styles.selectWrapperWeb}>
                                                <CustomSelect
                                                    placeholder="Select your role"
                                                    value={editData.role}
                                                    onChange={handleRoleChange}
                                                    options={roleOptions}
                                                    dropdownId="role"
                                                    onOpenChange={(open) => setOpenDropdown(open ? 'role' : null)}
                                                />
                                            </View>
                                        </View>

                                        <View style={[styles.formField, styles.formFieldWeb]}>
                                            <Text style={styles.formLabel}>Student ID Number:</Text>
                                            <TextInput
                                                style={[styles.formInput, styles.formInputWeb]}
                                                value={editData.studentId}
                                                onChangeText={handleStudentIdChange}
                                                placeholder="Enter your student ID number"
                                                keyboardType="number-pad"
                                                maxLength={6}
                                                blurOnSubmit={false}
                                            />
                                        </View>

                                        <View style={[
                                            styles.formField, 
                                            styles.formFieldWeb, 
                                            styles.formFieldWithDropdown,
                                            openDropdown === 'course' && isWeb && { zIndex: 100000 }
                                        ]}>
                                            <Text style={styles.formLabel}>Course:</Text>
                                            <View style={styles.selectWrapperWeb}>
                                                <CustomSelect
                                                    placeholder="Select your course"
                                                    value={editData.course}
                                                    onChange={handleCourseChange}
                                                    options={courseOptions}
                                                    dropdownId="course"
                                                    onOpenChange={(open) => setOpenDropdown(open ? 'course' : null)}
                                                />
                                            </View>
                                        </View>

                                        <View style={[styles.formField, styles.formFieldWeb]}>
                                            <Text style={styles.formLabel}>Phone Number:</Text>
                                            <TextInput
                                                style={[styles.formInput, styles.formInputWeb]}
                                                value={editData.phone}
                                                onChangeText={handlePhoneChange}
                                                placeholder="Enter your phone number"
                                                keyboardType="phone-pad"
                                                maxLength={11}
                                                blurOnSubmit={false}
                                            />
                                        </View>
                                    </ScrollView>

                                    <View style={[styles.modalFooter, styles.modalFooterWeb]}>
                                        <TouchableOpacity style={[styles.cancelButton, styles.cancelButtonWeb]} onPress={onCancelEdit}>
                                            <Text style={styles.cancelButtonText}>Cancel</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[styles.saveButton, styles.saveButtonWeb]} onPress={onSaveEdit}>
                                            <Text style={styles.saveButtonText}>Save Changes</Text>
                                        </TouchableOpacity>
                                    </View>
                                </KeyboardAvoidingView>
                            </View>
                        </SafeAreaView>
                    </Modal>
                )}
            </>
        );
    }

    // Mobile version - keep original behavior
    if (!showEditModal) {
        return <MobileLayout />;
    }

    return (
        <Modal
            visible={showEditModal}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={onCancelEdit}
        >
            <SafeAreaView style={styles.modalContainer}>
                <View style={styles.modalContentWrapper}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Edit Information</Text>
                        <TouchableOpacity onPress={onCancelEdit} style={styles.closeButton}>
                            <Ionicons name="close" size={24} color={MAROON} />
                        </TouchableOpacity>
                    </View>

                    <KeyboardAvoidingView 
                        style={styles.modalContent}
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                    >
                        <ScrollView 
                            style={styles.modalBody} 
                            showsVerticalScrollIndicator={true}
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={styles.scrollContentContainer}
                        >
                        <View style={styles.formField}>
                            <Text style={styles.formLabel}>First Name:</Text>
                            <TextInput
                                style={styles.formInput}
                                value={editData.firstName}
                                onChangeText={handleFirstNameChange}
                                placeholder="Enter your first name"
                                autoCapitalize="words"
                                autoCorrect={true}
                                keyboardType="default"
                                blurOnSubmit={false}
                            />
                        </View>

                        <View style={styles.formField}>
                            <Text style={styles.formLabel}>Middle Name:</Text>
                            <TextInput
                                style={styles.formInput}
                                value={editData.middleName}
                                onChangeText={handleMiddleNameChange}
                                placeholder="Enter your middle name"
                                autoCapitalize="words"
                                autoCorrect={true}
                                keyboardType="default"
                                blurOnSubmit={false}
                            />
                        </View>

                        <View style={styles.formField}>
                            <Text style={styles.formLabel}>Last Name:</Text>
                            <TextInput
                                style={styles.formInput}
                                value={editData.lastName}
                                onChangeText={handleLastNameChange}
                                placeholder="Enter your last name"
                                autoCapitalize="words"
                                autoCorrect={true}
                                keyboardType="default"
                                blurOnSubmit={false}
                            />
                        </View>

                        <View style={styles.formField}>
                            <Text style={styles.formLabel}>Student Role:</Text>
                            <View style={styles.selectWrapperWeb}>
                                <CustomSelect
                                    placeholder="Select your role"
                                    value={editData.role}
                                    onChange={handleRoleChange}
                                    options={roleOptions}
                                />
                            </View>
                        </View>

                        <View style={styles.formField}>
                            <Text style={styles.formLabel}>Student ID Number:</Text>
                            <TextInput
                                style={styles.formInput}
                                value={editData.studentId}
                                onChangeText={handleStudentIdChange}
                                placeholder="Enter your student ID number"
                                keyboardType="number-pad"
                                maxLength={6}
                                blurOnSubmit={false}
                            />
                        </View>

                        <View style={styles.formField}>
                            <Text style={styles.formLabel}>Course:</Text>
                            <View style={styles.selectWrapperWeb}>
                                <CustomSelect
                                    placeholder="Select your course"
                                    value={editData.course}
                                    onChange={handleCourseChange}
                                    options={courseOptions}
                                />
                            </View>
                        </View>

                        <View style={styles.formField}>
                            <Text style={styles.formLabel}>Phone Number:</Text>
                            <TextInput
                                style={styles.formInput}
                                value={editData.phone}
                                onChangeText={handlePhoneChange}
                                placeholder="Enter your phone number"
                                keyboardType="phone-pad"
                                maxLength={11}
                                blurOnSubmit={false}
                            />
                        </View>
                    </ScrollView>

                    <View style={styles.modalFooter}>
                        <TouchableOpacity style={styles.cancelButton} onPress={onCancelEdit}>
                            <Text style={styles.cancelButtonText}>Cancel</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.saveButton} onPress={onSaveEdit}>
                            <Text style={styles.saveButtonText}>Save Changes</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
                </View>
            </SafeAreaView>
        </Modal>
    );

}

// ---------- styles ----------
const styles = StyleSheet.create({
    page: {
        flex: 1,
        backgroundColor: '#fff',
        padding: 24,
    },
    center: {
        alignItems: 'center',
        justifyContent: 'center',
    },

    // Mobile wrapper
    mobContainer: {
        alignSelf: 'center',
        width: '92%',
        maxWidth: 340,
    },

    // Headers
    headerRowMob: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 14,
    },
    headerMob: { fontSize: 16, fontWeight: '600', color: MAROON },

    headerRowWeb: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
    },
    headerWeb: { fontSize: 14, fontWeight: '600', color: MAROON },

    // Web card
    cardWeb: {
        width: 700,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E7B9B9',
        backgroundColor: '#fff',
        paddingVertical: 16,
        paddingHorizontal: 18,
    },

    // Logos / subtitles
    logoMob: {
        width: 80,
        height: 80,
        alignSelf: 'center',
        marginTop: 6,
        marginBottom: 10,
    },
    logoWeb: {
        width: 72,
        height: 72,
        alignSelf: 'center',
        marginTop: 6,
        marginBottom: 8,
    },
    subtitleMob: {
        textAlign: 'center',
        color: "#8B0000",
        marginBottom: 8,
        fontWeight: '600',
    },
    subtitleWeb: {
        textAlign: 'center',
        color: "#8B0000",
        marginBottom: 6,
        fontSize: 12,
        fontWeight: '600',
    },

    // Edit button
    editRow: { alignItems: 'flex-end', marginBottom: 6 },
    editBtn: {
        backgroundColor: "#8B0000",
        borderRadius: 6,
        paddingHorizontal: 14,
        paddingVertical: 6,
    },
    editTxt: { color: '#fff', fontWeight: '700', fontSize: 12 },

    // Modal styles
    modalContainer: {
        flex: 1,
        backgroundColor: '#fff',
    },
    modalContentWrapper: {
        flex: 1,
        ...(Platform.OS === 'web' ? {
            overflow: 'visible',
        } : {}),
    },
    modalContent: {
        flex: 1,
        ...(Platform.OS === 'web' ? {
            overflow: 'visible',
        } : {}),
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 0,
    },
    modalTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: MAROON,
    },
    closeButton: {
        padding: 4,
    },
    modalBody: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 20,
        ...(Platform.OS === 'web' ? {
            overflow: 'visible',
        } : {}),
    },
    scrollContentContainer: {
        paddingBottom: 20,
        ...(Platform.OS === 'web' ? {
            overflow: 'visible',
        } : {}),
    },
    formField: {
        marginBottom: 16,
    },
    formLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: MAROON,
        marginBottom: 6,
    },
    formInput: {
        borderWidth: 1,
        borderColor: MAROON,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 13,
        color: '#000',
        backgroundColor: '#fff',
    },
    modalFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderTopWidth: 0,
        gap: 12,
    },
    cancelButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: MAROON,
        alignItems: 'center',
    },
    cancelButtonText: {
        color: MAROON,
        fontSize: 13,
        fontWeight: '600',
    },
    saveButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: MAROON,
        alignItems: 'center',
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '600',
    },

    // Web-specific modal styles
    modalContainerWeb: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        backgroundColor: 'transparent',
    },
    modalContentWrapperWeb: {
        width: '100%',
        backgroundColor: '#fff',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#E7B9B9',
        overflow: 'visible',
        ...(Platform.OS === 'web' ? { 
            boxShadow: '0px 4px 20px rgba(0,0,0,0.15)',
            position: 'relative',
            zIndex: 1,
        } : {}),
    },
    modalHeaderWeb: {
        paddingHorizontal: 18,
        paddingVertical: 16,
        borderBottomWidth: 0,
    },
    modalBodyWeb: {
        paddingHorizontal: 18,
        paddingTop: 16,
        ...(Platform.OS === 'web' ? {
            overflow: 'visible',
        } : {}),
    },
    scrollContentContainerWeb: {
        paddingBottom: 0,
        ...(Platform.OS === 'web' ? {
            overflow: 'visible',
            position: 'relative',
        } : {}),
    },
    formFieldWeb: {
        marginBottom: 8,
        width: '100%',
        ...(Platform.OS === 'web' ? {
            overflow: 'visible',
            position: 'relative',
        } : {}),
    },
    formFieldWithDropdown: {
        ...(Platform.OS === 'web' ? {
            // Ensure form fields with dropdowns can have high z-index when dropdown is open
            position: 'relative',
            zIndex: 1,
        } : {}),
    },
    formInputWeb: {
        maxWidth: '100%',
    },
    selectWrapperWeb: {
        maxWidth: '100%',
    },
    modalFooterWeb: {
        paddingHorizontal: 18,
        paddingTop: 2,
        paddingBottom: 10,
        justifyContent: 'center',
        gap: 12,
        borderTopWidth: 0,
    },
    cancelButtonWeb: {
        flex: 1,
        maxWidth: '48%',
    },
    saveButtonWeb: {
        flex: 1,
        maxWidth: '48%',
    },

    // Custom select styles
    selectBlock: { 
        width: '100%',
        ...(Platform.OS === 'web' ? { 
            position: 'relative',
            overflow: 'visible',
            zIndex: 1,
        } : {}),
    },
    selectWrapper: {
        borderWidth: 1,
        borderColor: MAROON,
        borderRadius: 8,
        backgroundColor: '#fff',
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    selectText: { fontSize: 13, color: '#000', flex: 1, paddingRight: 12 },
    selectIcon: { marginLeft: 8 },
    menuInline: {
        alignSelf: 'stretch',
        borderWidth: 1,
        borderColor: MAROON,
        borderTopWidth: 0,
        borderBottomLeftRadius: 8,
        borderBottomRightRadius: 8,
        backgroundColor: '#fff',
        overflow: 'hidden',
        maxHeight: 200,
        ...(Platform.OS === 'web' ? {
            backgroundColor: 'rgb(255, 255, 255)',
            background: 'rgb(255, 255, 255)',
            opacity: 1,
        } : {}),
    },
    menuInlineWeb: {
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        zIndex: 100001, // Very high z-index to ensure it's above everything
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
            // Create new stacking context to ensure it's above everything
            isolation: 'isolate',
            boxShadow: '0px 4px 12px rgba(0,0,0,0.15)',
        } as any : {}),
    },
    menuScrollView: {
        maxHeight: 200,
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
            zIndex: 99999,
        } as any : {}),
    },
    menuItem: { 
        paddingVertical: 12, 
        paddingHorizontal: 12,
        ...(Platform.OS === 'web' ? {
            backgroundColor: 'rgb(255, 255, 255)',
            background: 'rgb(255, 255, 255)',
            opacity: 1,
        } : {}),
    },
    menuItemPressed: { 
        backgroundColor: '#f2f2f2',
        ...(Platform.OS === 'web' ? {
            backgroundColor: 'rgb(242, 242, 242)',
            background: 'rgb(242, 242, 242)',
            opacity: 1,
        } : {}),
    },
    menuItemSelected: { 
        backgroundColor: '#f7ecec',
        ...(Platform.OS === 'web' ? {
            backgroundColor: 'rgb(247, 236, 236)',
            background: 'rgb(247, 236, 236)',
            opacity: 1,
        } : {}),
    },
    menuItemText: { fontSize: 13, color: '#1f1f1f' },
    menuItemTextSelected: { color: MAROON, fontWeight: '700' },

    // Inline field row
    inlineRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
    label: { color: MAROON, fontWeight: '700', fontSize: 12 },
    labelWeb: { fontSize: 12 },
    value: { color: '#3a3a3a', marginLeft: 6, fontSize: 12 },
    valueWeb: { fontSize: 11 },


    // ID blocks
    idBoxWeb: { marginTop: 2, marginBottom: 8, alignItems: 'flex-start' },
    idImgWeb: { width: 280, height: 120, borderRadius: 6, backgroundColor: '#eee' },
    idPlaceholderWeb: {
        width: 280,
        height: 120,
        borderRadius: 6,
        backgroundColor: '#e3e3e3',
        marginTop: 6,
    },

    idBoxMob: {
        marginTop: 4,
        marginBottom: 10,
        alignItems: 'center',
    },
    idImgMob: {
        width: 260,
        height: 150,
        borderRadius: 6,
        backgroundColor: '#eee',
    },
    idPlaceholderMob: {
        width: 260,
        height: 150,
        borderRadius: 6,
        backgroundColor: '#e3e3e3',
    },

    // Register buttons
    registerMob: {
        backgroundColor: MAROON,
        borderRadius: 8,
        paddingVertical: 12,
        alignItems: 'center',
        marginTop: 10,
        alignSelf: 'center',
        width: 260,
    },
    registerMobTxt: { color: '#fff', fontWeight: '700' },

    registerWeb: {
        alignSelf: 'center',
        width: 260,
        backgroundColor: MAROON,
        borderRadius: 8,
        paddingVertical: 10,
        alignItems: 'center',
        marginTop: 10,
        marginBottom: 15,
    },
    registerWebTxt: { color: '#fff', fontWeight: '700', fontSize: 13 },
    registerDisabled: { opacity: 0.6 },

    // Success Modal Styles
    successModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    successModalContent: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 24,
        width: 400,
        maxWidth: '90%',
        alignItems: 'center',
    },
    successModalTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#000',
        marginBottom: 12,
        textAlign: 'center',
    },
    successModalMessage: {
        fontSize: 14,
        color: '#666',
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20,
    },
    successModalButton: {
        backgroundColor: MAROON,
        borderRadius: 8,
        paddingVertical: 12,
        paddingHorizontal: 48,
        alignItems: 'center',
        width: '100%',
    },
    successModalButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
});
