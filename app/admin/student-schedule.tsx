import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
    Alert,
    Image,
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
} from "react-native";
import { supabase } from "../../lib/supabase";

/* ================= COLORS ================= */
const colors = {
    maroon: "#8B0000",
    light: "#FAF6F5",
    border: "#E5C8C5",
    text: "#531010",
    faint: "#F7F1F0",
};

/* ===================== TYPES ===================== */
type StudentInfo = {
    studentId: string;
    fullName: string;
    email: string;
    semester: string;
    yearLevel: string;
    program: string;
};

type ScheduleItem = {
    code: string;
    title: string;
    description: string;
    day: string;
    term: string;
    time: string;
};

/* ===================== AUTH PROFILE HOOK ===================== */
function titleCase(s?: string | null) {
    if (!s) return "";
    return s
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : w))
        .join(" ");
}

function useAuthProfile() {
    const router = useRouter();
    const [loading, setLoading] = React.useState(true);
    const [fullName, setFullName] = React.useState<string>("");

    const fetchProfile = React.useCallback(async () => {
        try {
            const { data: userRes } = await supabase.auth.getUser();
            const user = userRes?.user;
            if (!user) {
                setLoading(false);
                return;
            }
            const { data: row, error } = await supabase
                .from("users")
                .select("id, role, first_name, last_name, is_blocked")
                .eq("id", user.id)
                .single();
            if (error) throw error;

            if (row?.is_blocked) {
                await supabase.auth.signOut();
                router.replace('/login');
                return;
            }

            const roleRaw = (row?.role || "").toString().toLowerCase();
            if (roleRaw !== 'admin') {
                Alert.alert('Access Denied', 'You do not have admin privileges.');
                await supabase.auth.signOut();
                router.replace('/login');
                return;
            }

            const f = titleCase(row?.first_name || "");
            const l = titleCase(row?.last_name || "");
            const finalFull =
                (f && l ? `${f} ${l}` : "").trim() ||
                titleCase((user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || "") ||
                "Admin";
            setFullName(finalFull);
        } catch {
            setFullName("Admin");
        } finally {
            setLoading(false);
        }
    }, [router]);

    React.useEffect(() => {
        fetchProfile();
        const { data: sub } = supabase.auth.onAuthStateChange(() => fetchProfile());
        return () => sub?.subscription?.unsubscribe?.();
    }, [fetchProfile]);
    return { loading, fullName };
}

export default function AdminStudentSchedule() {
    const router = useRouter();
    const { loading, fullName } = useAuthProfile();
    const { width: screenWidth } = useWindowDimensions();
    const [searchQuery, setSearchQuery] = useState("");
    const [isEditMode, setIsEditMode] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);

    // Placeholder data - will be replaced with database queries later
    const [studentInfo, setStudentInfo] = useState<StudentInfo>({
        studentId: "536469",
        fullName: "Abellon, Anthony",
        email: "a.abellon.536469@umindanao.edu.ph",
        semester: "First Semester 2025-26",
        yearLevel: "3rd Year",
        program: "Bachelor of Science in Information Technology",
    });

    // Backup for cancel functionality
    const [originalStudentInfo, setOriginalStudentInfo] = useState<StudentInfo>(studentInfo);
    const [originalScheduleItems, setOriginalScheduleItems] = useState<ScheduleItem[]>([]);

    const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([]);

    // Initialize backup on mount
    React.useEffect(() => {
        setOriginalScheduleItems([...scheduleItems]);
        setOriginalStudentInfo({ ...studentInfo });
    }, []);

    const loadStudentSchedule = React.useCallback(async () => {
        const studentId = (studentInfo.studentId || "").trim();
        if (!studentId) return;

        try {
            setIsLoadingSchedule(true);
            const { data, error } = await supabase
                .from("student_subjects")
                .select("*")
                .eq("student_id", studentId)
                .order("subject_code");

            if (error) throw error;

            const mapped: ScheduleItem[] = (data || []).map((row: any) => ({
                code: (row?.subject_code ?? "").toString(),
                title: (row?.subject_title ?? "").toString(),
                description: (row?.description ?? "").toString(),
                day: (row?.day ?? "").toString(),
                term: (row?.term ?? "").toString(),
                time: (row?.time ?? "").toString(),
            }));

            setScheduleItems(mapped);
            setOriginalScheduleItems(mapped);
        } catch (e: any) {
            const msg =
                typeof e?.message === "string"
                    ? e.message
                    : "Failed to load student schedule.";
            Alert.alert("Load Failed", msg);
        } finally {
            setIsLoadingSchedule(false);
        }
    }, [studentInfo.studentId]);

    React.useEffect(() => {
        loadStudentSchedule();
    }, [loadStudentSchedule]);

    // Responsive breakpoints
    const isSmall = screenWidth < 768;

    React.useEffect(() => {
        if (Platform.OS !== 'web') {
            Alert.alert('Not Available', 'Admin panel is only available on web.');
            router.replace('/login');
            return;
        }
    }, []);


    const handleEditClick = () => {
        // Save current state as backup
        setOriginalStudentInfo({ ...studentInfo });
        setOriginalScheduleItems([...scheduleItems]);
        setIsEditMode(true);
    };

    const handleSave = async () => {
        const studentId = (studentInfo.studentId || "").trim();
        if (!studentId) {
            Alert.alert("Missing Student ID", "Student ID is required to save changes.");
            return;
        }

        try {
            setIsSaving(true);

            // 1) Update academic info (students)
            const { error: studentsErr } = await supabase
                .from("students")
                .update({
                    semester: (studentInfo.semester || "").trim() || null,
                    year_level: (studentInfo.yearLevel || "").trim() || null,
                })
                .eq("student_id", studentId);
            if (studentsErr) throw studentsErr;

            // 2) Update program/course (users)
            const { error: usersErr } = await supabase
                .from("users")
                .update({
                    course: (studentInfo.program || "").trim() || null,
                })
                .eq("student_id_number", studentId);
            if (usersErr) throw usersErr;

            // 3) Update schedule rows (delete + insert)
            const { error: deleteErr } = await supabase
                .from("student_subjects")
                .delete()
                .eq("student_id", studentId);
            if (deleteErr) throw deleteErr;

            const subjectsToInsert = scheduleItems
                .map((s) => ({
                    student_id: studentId,
                    subject_code: (s.code || "").trim() || null,
                    subject_title: (s.title || "").trim() || null,
                    description: (s.description || "").trim() || null,
                    day: (s.day || "").trim() || null,
                    term: (s.term || "").trim() || null,
                    time: (s.time || "").trim() || null,
                }))
                .filter(
                    (s) =>
                        s.subject_code ||
                        s.subject_title ||
                        s.description ||
                        s.day ||
                        s.term ||
                        s.time
                );

            if (subjectsToInsert.length > 0) {
                const { error: insertErr } = await supabase
                    .from("student_subjects")
                    .insert(subjectsToInsert);
                if (insertErr) throw insertErr;
            }

            setOriginalStudentInfo({ ...studentInfo });
            setOriginalScheduleItems([...scheduleItems]);
            setIsEditMode(false);
            Alert.alert("Saved", "Student schedule updated successfully.");
        } catch (e: any) {
            const msg =
                typeof e?.message === "string"
                    ? e.message
                    : "Failed to save changes. Please try again.";
            Alert.alert("Save Failed", msg);
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        // Restore original values
        setStudentInfo({ ...originalStudentInfo });
        setScheduleItems([...originalScheduleItems]);
        setIsEditMode(false);
    };

    const handleStudentInfoChange = (field: keyof StudentInfo, value: string) => {
        setStudentInfo({ ...studentInfo, [field]: value });
    };

    const handleScheduleItemChange = (index: number, field: keyof ScheduleItem, value: string) => {
        const updated = [...scheduleItems];
        updated[index] = { ...updated[index], [field]: value };
        setScheduleItems(updated);
    };

    if (loading) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                <Text>Loading...</Text>
            </SafeAreaView>
        );
    }

    return (
        <View style={{ flex: 1 }}>
                    <View style={styles.topBar}>
                        <Text style={styles.welcome}>Student Schedule</Text>
                    </View>

                    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }}>
                        {Platform.OS === 'web' && (
                            <style>{`
                                .schedule-table-row:hover {
                                    background-color: ${colors.faint} !important;
                                }
                            `}</style>
                        )}
                        <View style={styles.content}>
                            {/* Search Bar */}
                            <View style={styles.searchBarContainer}>
                                <View style={styles.searchContainer}>
                                    <Ionicons name="search-outline" size={20} color={colors.text} style={{ opacity: 0.6 }} />
                                    <TextInput
                                        style={styles.searchInput}
                                        placeholder="Search student by name or student ID"
                                        placeholderTextColor="#999"
                                        value={searchQuery}
                                        onChangeText={setSearchQuery}
                                    />
                                    {searchQuery.length > 0 && (
                                        <TouchableOpacity onPress={() => setSearchQuery("")}>
                                            <Ionicons name="close-circle" size={20} color={colors.text} />
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>

                            {/* Student Information Section */}
                            <View style={styles.studentInfoSection}>
                                <View style={styles.studentInfoHeader}>
                                    <View style={{ flex: 1 }} />
                                    {isEditMode ? (
                                        <View style={styles.editModeButtons}>
                                            <TouchableOpacity
                                                style={[styles.saveCancelButton, styles.cancelButton]}
                                                onPress={handleCancel}
                                                activeOpacity={0.7}
                                                disabled={isSaving}
                                            >
                                                <Text style={styles.cancelButtonText}>Cancel</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[styles.saveCancelButton, styles.saveButton]}
                                                onPress={handleSave}
                                                activeOpacity={0.7}
                                                disabled={isSaving}
                                            >
                                                <Text style={styles.saveButtonText}>{isSaving ? "Saving..." : "Save"}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    ) : (
                                        <TouchableOpacity
                                            style={styles.editButton}
                                            onPress={handleEditClick}
                                            activeOpacity={0.7}
                                        >
                                            <Ionicons name="pencil-outline" size={16} color={colors.maroon} />
                                            <Text style={styles.editButtonText}>Edit</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                                {isEditMode ? (
                                    <>
                                        <TextInput
                                            style={[styles.studentId, styles.editableInput]}
                                            value={studentInfo.studentId}
                                            onChangeText={(text) => handleStudentInfoChange('studentId', text)}
                                        />
                                        <TextInput
                                            style={[styles.studentName, styles.editableInput]}
                                            value={studentInfo.fullName}
                                            onChangeText={(text) => handleStudentInfoChange('fullName', text)}
                                        />
                                        <TextInput
                                            style={[styles.studentEmail, styles.editableInput]}
                                            value={studentInfo.email}
                                            onChangeText={(text) => handleStudentInfoChange('email', text)}
                                        />
                                        <TextInput
                                            style={[styles.studentSemester, styles.editableInput]}
                                            value={studentInfo.semester}
                                            onChangeText={(text) => handleStudentInfoChange('semester', text)}
                                        />
                                        <View style={styles.programInputRow}>
                                            <TextInput
                                                style={[styles.studentYearLevel, styles.editableInput]}
                                                value={studentInfo.yearLevel}
                                                onChangeText={(text) => handleStudentInfoChange('yearLevel', text)}
                                                placeholder="Year Level"
                                                placeholderTextColor="#999"
                                            />
                                            <TextInput
                                                style={[styles.studentProgram, styles.editableInput]}
                                                value={studentInfo.program}
                                                onChangeText={(text) => handleStudentInfoChange('program', text)}
                                                placeholder="Program"
                                                placeholderTextColor="#999"
                                            />
                                        </View>
                                    </>
                                ) : (
                                    <>
                                        <Text style={styles.studentId}>{studentInfo.studentId}</Text>
                                        <Text style={styles.studentName}>{studentInfo.fullName}</Text>
                                        <Text style={styles.studentEmail}>{studentInfo.email}</Text>
                                        <Text style={styles.studentSemester}>{studentInfo.semester}</Text>
                                        <Text style={styles.studentProgram}>
                                            {studentInfo.yearLevel} {studentInfo.program}
                                        </Text>
                                    </>
                                )}
                            </View>

                            {/* Section Title */}
                            <View style={styles.sectionTitleContainer}>
                                <Text style={styles.sectionTitle}>Official Class Schedule</Text>
                                <Text style={styles.sectionSubtitle}>{studentInfo.semester}</Text>
                            </View>

                            {/* Schedule Table */}
                            <View style={styles.tableOuterContainer}>
                                <View style={styles.tableContainer}>
                                    {isEditMode ? (
                                        <View style={[styles.tableWrapper, styles.tableWrapperEditMode]}>
                                            <View style={[styles.tableHeader, styles.tableRowEditMode]}>
                                                <View style={[styles.tableHeaderCell, styles.tableCellNo]}>
                                                    <Text style={styles.tableCellNoText}>No.</Text>
                                                </View>
                                                <Text style={[styles.tableHeaderCell, styles.tableCellCode]}>Code</Text>
                                                <Text style={[styles.tableHeaderCell, styles.tableCellTitle]}>Title</Text>
                                                <Text style={[styles.tableHeaderCell, styles.tableCellDescription]}>Description</Text>
                                                <Text style={[styles.tableHeaderCell, styles.tableCellDay]}>Day</Text>
                                                <Text style={[styles.tableHeaderCell, styles.tableCellTerm]}>Term</Text>
                                                <Text style={[styles.tableHeaderCell, styles.tableCellTime]}>Time</Text>
                                            </View>
                                            {scheduleItems.map((item, index) => (
                                                <Pressable 
                                                    key={index} 
                                                style={({ pressed }) => [
                                                    styles.tableRow,
                                                    styles.tableRowEditMode,
                                                    index === scheduleItems.length - 1 && styles.tableRowLast,
                                                    pressed && styles.tableRowPressed,
                                                ]}
                                                    {...(Platform.OS === 'web' ? { className: 'schedule-table-row' } : {})}
                                                >
                                                    <View style={[styles.tableCellEditMode, styles.tableCellNo, styles.tableCellNoEditMode]}>
                                                        <Text style={styles.tableCellNoText}>{index + 1}</Text>
                                                    </View>
                                                    <View style={[styles.tableCellEditMode, styles.tableCellCode]}>
                                                        <TextInput
                                                            style={styles.editableTableCell}
                                                            value={item.code}
                                                            onChangeText={(text) => handleScheduleItemChange(index, 'code', text)}
                                                        />
                                                    </View>
                                                    <View style={[styles.tableCellEditMode, styles.tableCellTitle]}>
                                                        <TextInput
                                                            style={styles.editableTableCell}
                                                            value={item.title}
                                                            onChangeText={(text) => handleScheduleItemChange(index, 'title', text)}
                                                        />
                                                    </View>
                                                    <View style={[styles.tableCellEditMode, styles.tableCellDescription, styles.tableCellDescriptionEditMode]}>
                                                        <TextInput
                                                            style={styles.editableTableCell}
                                                            value={item.description}
                                                            onChangeText={(text) => handleScheduleItemChange(index, 'description', text)}
                                                        />
                                                    </View>
                                                    <View style={[styles.tableCellEditMode, styles.tableCellDay]}>
                                                        <TextInput
                                                            style={styles.editableTableCell}
                                                            value={item.day}
                                                            onChangeText={(text) => handleScheduleItemChange(index, 'day', text)}
                                                        />
                                                    </View>
                                                    <View style={[styles.tableCellEditMode, styles.tableCellTerm]}>
                                                        <TextInput
                                                            style={styles.editableTableCell}
                                                            value={item.term}
                                                            onChangeText={(text) => handleScheduleItemChange(index, 'term', text)}
                                                        />
                                                    </View>
                                                    <View style={[styles.tableCellEditMode, styles.tableCellTime]}>
                                                        <TextInput
                                                            style={styles.editableTableCell}
                                                            value={item.time}
                                                            onChangeText={(text) => handleScheduleItemChange(index, 'time', text)}
                                                        />
                                                    </View>
                                                </Pressable>
                                            ))}
                                        </View>
                                    ) : (
                                        <ScrollView 
                                            horizontal 
                                            showsHorizontalScrollIndicator={false}
                                            contentContainerStyle={styles.scrollViewContent}
                                        >
                                            <View style={[styles.tableWrapper, styles.tableWrapperEditMode]}>
                                                <View style={[styles.tableHeader, styles.tableRowEditMode]}>
                                                    <View style={[styles.tableHeaderCell, styles.tableCellNo]}>
                                                        <Text style={styles.tableCellNoText}>No.</Text>
                                                    </View>
                                                    <Text style={[styles.tableHeaderCell, styles.tableCellCode]}>Code</Text>
                                                    <Text style={[styles.tableHeaderCell, styles.tableCellTitle]}>Title</Text>
                                                    <Text style={[styles.tableHeaderCell, styles.tableCellDescription]}>Description</Text>
                                                    <Text style={[styles.tableHeaderCell, styles.tableCellDay]}>Day</Text>
                                                    <Text style={[styles.tableHeaderCell, styles.tableCellTerm]}>Term</Text>
                                                    <Text style={[styles.tableHeaderCell, styles.tableCellTime]}>Time</Text>
                                                </View>
                                                {scheduleItems.map((item, index) => (
                                                    <Pressable 
                                                        key={index} 
                                                    style={({ pressed }) => [
                                                        styles.tableRow,
                                                        styles.tableRowEditMode,
                                                        index === scheduleItems.length - 1 && styles.tableRowLast,
                                                        pressed && styles.tableRowPressed,
                                                    ]}
                                                        {...(Platform.OS === 'web' ? { className: 'schedule-table-row' } : {})}
                                                    >
                                                        <View style={[styles.tableCell, styles.tableCellNo]}>
                                                            <Text style={styles.tableCellNoText}>{index + 1}</Text>
                                                        </View>
                                                        <Text style={[styles.tableCell, styles.tableCellCode]}>{item.code}</Text>
                                                        <Text style={[styles.tableCell, styles.tableCellTitle]}>{item.title}</Text>
                                                        <Text style={[styles.tableCell, styles.tableCellDescription]}>{item.description}</Text>
                                                        <Text style={[styles.tableCell, styles.tableCellDay]}>{item.day}</Text>
                                                        <Text style={[styles.tableCell, styles.tableCellTerm]}>{item.term}</Text>
                                                        <Text style={[styles.tableCell, styles.tableCellTime]}>{item.time}</Text>
                                                    </Pressable>
                                                ))}
                                            </View>
                                        </ScrollView>
                                    )}
                                </View>
                            </View>
                        </View>
                    </ScrollView>
        </View>
    );
}


const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
    },
    topBar: {
        paddingHorizontal: 24,
        paddingVertical: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: '#fff',
    },
    welcome: {
        fontSize: 24,
        fontWeight: "700",
        color: colors.text,
    },
    content: {
        padding: 24,
        width: '100%',
        alignItems: 'center',
    },
    searchBarContainer: {
        width: '100%',
        maxWidth: 1050,
        marginBottom: 32,
    },
    searchContainer: {
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: "#fff",
        gap: 12,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        color: colors.text,
    },
    studentInfoSection: {
        alignItems: 'center',
        marginBottom: 32,
        paddingBottom: 24,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        width: '100%',
        maxWidth: 1050,
        position: 'relative',
    },
    studentInfoHeader: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginBottom: 16,
    },
    editButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: '#fff',
    },
    editButtonText: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.maroon,
    },
    editModeButtons: {
        flexDirection: 'row',
        gap: 12,
        alignItems: 'center',
    },
    saveCancelButton: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
        minWidth: 100,
        alignItems: 'center',
    },
    saveButton: {
        backgroundColor: colors.maroon,
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: "600",
    },
    cancelButton: {
        backgroundColor: colors.faint,
        borderWidth: 1,
        borderColor: colors.border,
    },
    cancelButtonText: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "600",
    },
    editableInput: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: '#fff',
        textAlign: 'center',
        alignSelf: 'center',
    },
    programInputRow: {
        width: '100%',
        gap: 8,
        alignItems: 'center',
    },
    studentYearLevel: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
        marginBottom: 6,
        width: 100,
        height: 32,
        paddingVertical: 0,
    },
    studentId: {
        fontSize: 28,
        fontWeight: "800",
        color: colors.maroon,
        marginBottom: 8,
        width: 110,
        height: 40,
        paddingVertical: 0,
    },
    studentName: {
        fontSize: 20,
        fontWeight: "600",
        color: colors.text,
        marginBottom: 6,
        height: 32,
        paddingVertical: 0,
    },
    studentEmail: {
        fontSize: 16,
        color: colors.text,
        marginBottom: 6,
        opacity: 0.8,
        width: 320,
        height: 32,
        paddingVertical: 0,
    },
    studentSemester: {
        fontSize: 16,
        fontWeight: "600",
        color: colors.text,
        marginBottom: 6,
    },
    studentProgram: {
        fontSize: 16,
        color: colors.text,
        opacity: 0.8,
        textAlign: 'center',
        width: 460,
        height: 32,
        paddingVertical: 0,
    },
    sectionTitleContainer: {
        marginBottom: 20,
        alignItems: 'center',
        width: '100%',
        maxWidth: 1050,
    },
    tableOuterContainer: {
        width: '100%',
        maxWidth: 1050,
        alignItems: 'center',
    },
    sectionTitle: {
        fontSize: 22,
        fontWeight: "700",
        color: colors.text,
        marginBottom: 4,
    },
    sectionSubtitle: {
        fontSize: 18,
        fontWeight: "600",
        color: colors.text,
        opacity: 0.8,
    },
    tableContainer: {
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: '#fff',
        overflow: 'hidden',
        marginTop: 8,
        width: '100%',
    },
    tableWrapper: {
        width: '100%',
    },
    tableWrapperEditMode: {
        width: '100%',
        alignSelf: 'stretch',
    },
    scrollViewContent: {
        flexGrow: 1,
        minWidth: '100%',
        alignSelf: 'stretch',
    },
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: colors.faint,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        width: '100%',
    },
    tableHeaderCell: {
        paddingVertical: 16,
        paddingHorizontal: 18,
        fontSize: 14,
        fontWeight: "700",
        color: colors.text,
        borderRightWidth: 1,
        borderRightColor: colors.border,
        textAlign: 'left',
    },
    tableRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: '#fff',
        width: '100%',
    },
    tableRowEditMode: {
        width: '100%',
        alignSelf: 'stretch',
    },
    tableRowPressed: {
        backgroundColor: colors.faint,
    },
    tableRowLast: {
        borderBottomWidth: 0,
    },
    tableCell: {
        paddingVertical: 16,
        paddingHorizontal: 18,
        fontSize: 14,
        color: colors.text,
        borderRightWidth: 1,
        borderRightColor: colors.border,
        textAlign: 'left',
    },
    tableCellEditMode: {
        paddingVertical: 8,
        paddingHorizontal: 8,
        borderRightWidth: 1,
        borderRightColor: colors.border,
        alignItems: 'stretch',
        flexShrink: 0,
    },
    tableCellNo: {
        width: 50,
        backgroundColor: colors.faint,
        alignItems: 'center',
        justifyContent: 'center',
    },
    tableCellNoEditMode: {
        backgroundColor: colors.faint,
    },
    tableCellNoText: {
        fontSize: 14,
        color: colors.text,
        textAlign: 'center',
    },
    tableCellCode: {
        width: 110,
        fontWeight: "600",
    },
    tableCellTitle: {
        width: 100,
        flexShrink: 0,
    },
    tableCellDescription: {
        flex: 1,
        minWidth: 250,
    },
    tableCellDescriptionEditMode: {
        flex: 1,
        minWidth: 250,
    },
    tableCellDay: {
        width: 110,
    },
    tableCellTerm: {
        width: 130,
    },
    tableCellTime: {
        width: 120,
        borderRightWidth: 0,
    },
    tableCellTimeEditMode: {
        // Keep same width as normal mode
    },
    editableTableCell: {
        width: '100%',
        alignSelf: 'stretch',
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 8,
        backgroundColor: '#fff',
        fontSize: 14,
        color: colors.text,
        minHeight: 36,
    },
    modalOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10000,
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 24,
        width: '90%',
        maxWidth: 400,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: "700",
        color: colors.text,
        marginBottom: 12,
    },
    modalMessage: {
        fontSize: 16,
        color: colors.text,
        marginBottom: 24,
        opacity: 0.8,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
        justifyContent: 'flex-end',
    },
    modalButton: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
        minWidth: 100,
        alignItems: 'center',
    },
    modalButtonCancel: {
        backgroundColor: colors.faint,
    },
    modalButtonConfirm: {
        backgroundColor: colors.maroon,
    },
    modalButtonCancelText: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "600",
    },
    modalButtonConfirmText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: "600",
    },
});
