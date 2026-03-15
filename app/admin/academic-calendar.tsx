import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState, useEffect } from "react";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
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
type AcademicCalendarEntry = {
    id: number;
    school_year?: string;
    semester: string;
    term: string;
    start_date: string;
    end_date: string;
    status?: string;
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
    }, [fetchProfile]);

    return { loading, fullName };
}

export default function AdminAcademicCalendar() {
    const router = useRouter();
    const { loading: authLoading, fullName } = useAuthProfile();
    const { width: screenWidth } = useWindowDimensions();
    const [calendarEntries, setCalendarEntries] = useState<AcademicCalendarEntry[]>([]);
    const [loadingEntries, setLoadingEntries] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [isChangeMode, setIsChangeMode] = useState(false);
    const [editingEntry, setEditingEntry] = useState<AcademicCalendarEntry | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Form state - manage all 4 terms for a school year (for modal)
    const [formSchoolYear, setFormSchoolYear] = useState("");
    const [originalSchoolYear, setOriginalSchoolYear] = useState("");
    const [formFirstSemFirstTermStart, setFormFirstSemFirstTermStart] = useState("");
    const [formFirstSemFirstTermEnd, setFormFirstSemFirstTermEnd] = useState("");
    const [formFirstSemSecondTermStart, setFormFirstSemSecondTermStart] = useState("");
    const [formFirstSemSecondTermEnd, setFormFirstSemSecondTermEnd] = useState("");
    const [formSecondSemFirstTermStart, setFormSecondSemFirstTermStart] = useState("");
    const [formSecondSemFirstTermEnd, setFormSecondSemFirstTermEnd] = useState("");
    const [formSecondSemSecondTermStart, setFormSecondSemSecondTermStart] = useState("");
    const [formSecondSemSecondTermEnd, setFormSecondSemSecondTermEnd] = useState("");

    // Page-level editing state
    const [pageSchoolYear, setPageSchoolYear] = useState("");
    const [pageOriginalSchoolYear, setPageOriginalSchoolYear] = useState("");
    const [pageFirstSemFirstTermStart, setPageFirstSemFirstTermStart] = useState("");
    const [pageFirstSemFirstTermEnd, setPageFirstSemFirstTermEnd] = useState("");
    const [pageFirstSemSecondTermStart, setPageFirstSemSecondTermStart] = useState("");
    const [pageFirstSemSecondTermEnd, setPageFirstSemSecondTermEnd] = useState("");
    const [pageSecondSemFirstTermStart, setPageSecondSemFirstTermStart] = useState("");
    const [pageSecondSemFirstTermEnd, setPageSecondSemFirstTermEnd] = useState("");
    const [pageSecondSemSecondTermStart, setPageSecondSemSecondTermStart] = useState("");
    const [pageSecondSemSecondTermEnd, setPageSecondSemSecondTermEnd] = useState("");
    const [isSavingPage, setIsSavingPage] = useState(false);

    // Responsive breakpoints
    const isSmall = screenWidth < 768;

    React.useEffect(() => {
        if (Platform.OS !== 'web') {
            Alert.alert('Not Available', 'Admin panel is only available on web.');
            router.replace('/login');
            return;
        }
    }, []);

    React.useEffect(() => {
        fetchCalendarEntries();
    }, []);

    React.useEffect(() => {
        // Load current calendar into page-level state when entries are loaded
        if (calendarEntries.length > 0 && !loadingEntries) {
            loadCalendarToPage();
        }
    }, [calendarEntries, loadingEntries]);

    // Helper function to update year in a date string
    const updateYearInDate = (dateString: string, newYear: string): string => {
        if (!dateString || !newYear) return dateString;
        const parts = dateString.split("-");
        if (parts.length !== 3) return dateString;
        return `${newYear}-${parts[1]}-${parts[2]}`;
    };

    // Auto-adjust year in dates when school year changes in modal
    React.useEffect(() => {
        if (!showModal || !formSchoolYear || !formSchoolYear.includes("-")) return;

        const parts = formSchoolYear.trim().split("-");
        if (parts.length !== 2) return;

        const firstYear = parts[0].trim();
        const secondYear = parts[1].trim();

        // Validate years are numeric (4 digits)
        if (!/^\d{4}$/.test(firstYear) || !/^\d{4}$/.test(secondYear)) return;

        // Update 1st Semester dates with firstYear (only if dates exist and year needs updating)
        if (formFirstSemFirstTermStart) {
            const updated = updateYearInDate(formFirstSemFirstTermStart, firstYear);
            if (updated !== formFirstSemFirstTermStart) {
                setFormFirstSemFirstTermStart(updated);
            }
        }
        if (formFirstSemFirstTermEnd) {
            const updated = updateYearInDate(formFirstSemFirstTermEnd, firstYear);
            if (updated !== formFirstSemFirstTermEnd) {
                setFormFirstSemFirstTermEnd(updated);
            }
        }
        if (formFirstSemSecondTermStart) {
            const updated = updateYearInDate(formFirstSemSecondTermStart, firstYear);
            if (updated !== formFirstSemSecondTermStart) {
                setFormFirstSemSecondTermStart(updated);
            }
        }
        if (formFirstSemSecondTermEnd) {
            const updated = updateYearInDate(formFirstSemSecondTermEnd, firstYear);
            if (updated !== formFirstSemSecondTermEnd) {
                setFormFirstSemSecondTermEnd(updated);
            }
        }

        // Update 2nd Semester dates with secondYear (only if dates exist and year needs updating)
        if (formSecondSemFirstTermStart) {
            const updated = updateYearInDate(formSecondSemFirstTermStart, secondYear);
            if (updated !== formSecondSemFirstTermStart) {
                setFormSecondSemFirstTermStart(updated);
            }
        }
        if (formSecondSemFirstTermEnd) {
            const updated = updateYearInDate(formSecondSemFirstTermEnd, secondYear);
            if (updated !== formSecondSemFirstTermEnd) {
                setFormSecondSemFirstTermEnd(updated);
            }
        }
        if (formSecondSemSecondTermStart) {
            const updated = updateYearInDate(formSecondSemSecondTermStart, secondYear);
            if (updated !== formSecondSemSecondTermStart) {
                setFormSecondSemSecondTermStart(updated);
            }
        }
        if (formSecondSemSecondTermEnd) {
            const updated = updateYearInDate(formSecondSemSecondTermEnd, secondYear);
            if (updated !== formSecondSemSecondTermEnd) {
                setFormSecondSemSecondTermEnd(updated);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formSchoolYear, showModal]);

    const loadCalendarToPage = () => {
        if (calendarEntries.length === 0) return;

        // Get the latest school year
        const latestSchoolYear = calendarEntries[0]?.school_year;
        if (!latestSchoolYear) return;

        // Filter entries for the latest school year
        const yearEntries = calendarEntries.filter(e => e.school_year === latestSchoolYear);

        // Initialize page state
        setPageOriginalSchoolYear(latestSchoolYear);
        setPageSchoolYear(latestSchoolYear);
        setPageFirstSemFirstTermStart("");
        setPageFirstSemFirstTermEnd("");
        setPageFirstSemSecondTermStart("");
        setPageFirstSemSecondTermEnd("");
        setPageSecondSemFirstTermStart("");
        setPageSecondSemFirstTermEnd("");
        setPageSecondSemSecondTermStart("");
        setPageSecondSemSecondTermEnd("");

        // Populate page state with existing data
        yearEntries.forEach((e) => {
            if (e.semester === "1st Semester" && e.term === "1st Term") {
                setPageFirstSemFirstTermStart(e.start_date || "");
                setPageFirstSemFirstTermEnd(e.end_date || "");
            } else if (e.semester === "1st Semester" && e.term === "2nd Term") {
                setPageFirstSemSecondTermStart(e.start_date || "");
                setPageFirstSemSecondTermEnd(e.end_date || "");
            } else if (e.semester === "2nd Semester" && e.term === "1st Term") {
                setPageSecondSemFirstTermStart(e.start_date || "");
                setPageSecondSemFirstTermEnd(e.end_date || "");
            } else if (e.semester === "2nd Semester" && e.term === "2nd Term") {
                setPageSecondSemSecondTermStart(e.start_date || "");
                setPageSecondSemSecondTermEnd(e.end_date || "");
            }
        });
    };

    const handlePageSave = async () => {
        // Validate school year
        if (!pageSchoolYear.trim()) {
            Alert.alert('Validation Error', 'Please enter a school year.');
            return;
        }

        // Validate all dates are filled
        if (!pageFirstSemFirstTermStart || !pageFirstSemFirstTermEnd ||
            !pageFirstSemSecondTermStart || !pageFirstSemSecondTermEnd ||
            !pageSecondSemFirstTermStart || !pageSecondSemFirstTermEnd ||
            !pageSecondSemSecondTermStart || !pageSecondSemSecondTermEnd) {
            Alert.alert('Validation Error', 'Please fill in all start and end dates for all terms.');
            return;
        }

        try {
            setIsSavingPage(true);
            const schoolYear = pageSchoolYear.trim();
            const originalYear = pageOriginalSchoolYear.trim() || schoolYear;

            // Delete existing entries for the original school year
            const { error: deleteError } = await supabase
                .from("academic_calendar")
                .delete()
                .eq("school_year", originalYear);

            if (deleteError) throw deleteError;

            // Insert the 4 new entries
            const entriesToInsert = [
                {
                    school_year: schoolYear,
                    semester: "1st Semester",
                    term: "1st Term",
                    start_date: pageFirstSemFirstTermStart.trim(),
                    end_date: pageFirstSemFirstTermEnd.trim(),
                },
                {
                    school_year: schoolYear,
                    semester: "1st Semester",
                    term: "2nd Term",
                    start_date: pageFirstSemSecondTermStart.trim(),
                    end_date: pageFirstSemSecondTermEnd.trim(),
                },
                {
                    school_year: schoolYear,
                    semester: "2nd Semester",
                    term: "1st Term",
                    start_date: pageSecondSemFirstTermStart.trim(),
                    end_date: pageSecondSemFirstTermEnd.trim(),
                },
                {
                    school_year: schoolYear,
                    semester: "2nd Semester",
                    term: "2nd Term",
                    start_date: pageSecondSemSecondTermStart.trim(),
                    end_date: pageSecondSemSecondTermEnd.trim(),
                },
            ];

            const { error: insertError } = await supabase
                .from("academic_calendar")
                .insert(entriesToInsert);

            if (insertError) throw insertError;

            Alert.alert('Success', `Academic calendar for ${schoolYear} saved successfully.`);
            fetchCalendarEntries();
        } catch (error: any) {
            console.error('Error saving academic calendar:', error);
            Alert.alert('Error', error?.message || 'Failed to save academic calendar.');
        } finally {
            setIsSavingPage(false);
        }
    };

    const fetchCalendarEntries = async () => {
        try {
            setLoadingEntries(true);
            const { data, error } = await supabase
                .from("academic_calendar")
                .select("*")
                .order("school_year", { ascending: false })
                .order("semester", { ascending: true })
                .order("term", { ascending: true });

            if (error) throw error;
            setCalendarEntries(data || []);
        } catch (error) {
            console.error('Error fetching academic calendar:', error);
            Alert.alert('Error', 'Failed to load academic calendar entries.');
        } finally {
            setLoadingEntries(false);
        }
    };

    const handleAddClick = async () => {
        try {
            setIsChangeMode(true);
            setIsEditMode(false);
            setEditingEntry(null);

            // Fetch the latest school year's calendar entries
            const { data: allEntries, error: fetchError } = await supabase
                .from("academic_calendar")
                .select("*")
                .order("school_year", { ascending: false })
                .order("semester", { ascending: true })
                .order("term", { ascending: true });

            if (fetchError) throw fetchError;

            if (!allEntries || allEntries.length === 0) {
                Alert.alert('No Calendar Found', 'No academic calendar entries found. Please add a calendar first.');
                setIsChangeMode(false);
                return;
            }

            // Get the latest school year (first entry after ordering by school_year DESC)
            const latestSchoolYear = allEntries[0]?.school_year;
            if (!latestSchoolYear) {
                Alert.alert('Error', 'Cannot find school year in calendar entries.');
                setIsChangeMode(false);
                return;
            }

            // Filter entries for the latest school year
            const yearEntries = allEntries.filter(e => e.school_year === latestSchoolYear);

            // Store original school year and set form value
            setOriginalSchoolYear(latestSchoolYear);
            setFormSchoolYear(latestSchoolYear);
            setFormFirstSemFirstTermStart("");
            setFormFirstSemFirstTermEnd("");
            setFormFirstSemSecondTermStart("");
            setFormFirstSemSecondTermEnd("");
            setFormSecondSemFirstTermStart("");
            setFormSecondSemFirstTermEnd("");
            setFormSecondSemSecondTermStart("");
            setFormSecondSemSecondTermEnd("");

            // Populate form with existing data
            yearEntries.forEach((e) => {
                if (e.semester === "1st Semester" && e.term === "1st Term") {
                    setFormFirstSemFirstTermStart(e.start_date || "");
                    setFormFirstSemFirstTermEnd(e.end_date || "");
                } else if (e.semester === "1st Semester" && e.term === "2nd Term") {
                    setFormFirstSemSecondTermStart(e.start_date || "");
                    setFormFirstSemSecondTermEnd(e.end_date || "");
                } else if (e.semester === "2nd Semester" && e.term === "1st Term") {
                    setFormSecondSemFirstTermStart(e.start_date || "");
                    setFormSecondSemFirstTermEnd(e.end_date || "");
                } else if (e.semester === "2nd Semester" && e.term === "2nd Term") {
                    setFormSecondSemSecondTermStart(e.start_date || "");
                    setFormSecondSemSecondTermEnd(e.end_date || "");
                }
            });

            setShowModal(true);
        } catch (error: any) {
            console.error('Error loading current academic calendar:', error);
            Alert.alert('Error', 'Failed to load current academic calendar.');
            setIsChangeMode(false);
        }
    };

    const handleEditClick = async (entry: AcademicCalendarEntry) => {
        if (!entry.school_year) {
            Alert.alert('Error', 'Cannot edit entry without school year.');
            return;
        }

        try {
            setIsEditMode(true);
            setIsChangeMode(false);
            setEditingEntry(entry);
            setOriginalSchoolYear(entry.school_year);
            setFormSchoolYear(entry.school_year);

            // Fetch all entries for this school year
            const { data: yearEntries, error } = await supabase
                .from("academic_calendar")
                .select("*")
                .eq("school_year", entry.school_year)
                .order("semester", { ascending: true })
                .order("term", { ascending: true });

            if (error) throw error;

            // Initialize form with empty values
            setFormFirstSemFirstTermStart("");
            setFormFirstSemFirstTermEnd("");
            setFormFirstSemSecondTermStart("");
            setFormFirstSemSecondTermEnd("");
            setFormSecondSemFirstTermStart("");
            setFormSecondSemFirstTermEnd("");
            setFormSecondSemSecondTermStart("");
            setFormSecondSemSecondTermEnd("");

            // Populate form with existing data
            if (yearEntries) {
                yearEntries.forEach((e) => {
                    if (e.semester === "1st Semester" && e.term === "1st Term") {
                        setFormFirstSemFirstTermStart(e.start_date || "");
                        setFormFirstSemFirstTermEnd(e.end_date || "");
                    } else if (e.semester === "1st Semester" && e.term === "2nd Term") {
                        setFormFirstSemSecondTermStart(e.start_date || "");
                        setFormFirstSemSecondTermEnd(e.end_date || "");
                    } else if (e.semester === "2nd Semester" && e.term === "1st Term") {
                        setFormSecondSemFirstTermStart(e.start_date || "");
                        setFormSecondSemFirstTermEnd(e.end_date || "");
                    } else if (e.semester === "2nd Semester" && e.term === "2nd Term") {
                        setFormSecondSemSecondTermStart(e.start_date || "");
                        setFormSecondSemSecondTermEnd(e.end_date || "");
                    }
                });
            }

            setShowModal(true);
        } catch (error: any) {
            console.error('Error loading school year data:', error);
            Alert.alert('Error', 'Failed to load academic calendar data.');
        }
    };

    const handleSave = async () => {
        // Validate school year
        if (!formSchoolYear.trim()) {
            Alert.alert('Validation Error', 'Please enter a school year.');
            return;
        }

        // Validate all dates are filled
        if (!formFirstSemFirstTermStart || !formFirstSemFirstTermEnd ||
            !formFirstSemSecondTermStart || !formFirstSemSecondTermEnd ||
            !formSecondSemFirstTermStart || !formSecondSemFirstTermEnd ||
            !formSecondSemSecondTermStart || !formSecondSemSecondTermEnd) {
            Alert.alert('Validation Error', 'Please fill in all start and end dates for all terms.');
            return;
        }

        try {
            setIsSaving(true);
            const schoolYear = formSchoolYear.trim();
            const originalYear = originalSchoolYear.trim() || schoolYear;

            // Step 1: Delete ALL existing entries for the ORIGINAL school year
            // This ensures we replace the entire calendar, not add duplicates
            // Use originalSchoolYear to delete old entries, even if school year was changed
            const { data: deletedData, error: deleteError } = await supabase
                .from("academic_calendar")
                .delete()
                .eq("school_year", originalYear)
                .select();

            if (deleteError) {
                console.error('Delete error:', deleteError);
                throw deleteError;
            }

            // Log deletion for debugging (optional, can be removed in production)
            if (deletedData && deletedData.length > 0) {
                console.log(`Deleted ${deletedData.length} existing entries for school year ${originalYear}`);
            }

            // Step 2: Insert the 4 new entries for this school year
            const entriesToInsert = [
                {
                    school_year: schoolYear,
                    semester: "1st Semester",
                    term: "1st Term",
                    start_date: formFirstSemFirstTermStart.trim(),
                    end_date: formFirstSemFirstTermEnd.trim(),
                },
                {
                    school_year: schoolYear,
                    semester: "1st Semester",
                    term: "2nd Term",
                    start_date: formFirstSemSecondTermStart.trim(),
                    end_date: formFirstSemSecondTermEnd.trim(),
                },
                {
                    school_year: schoolYear,
                    semester: "2nd Semester",
                    term: "1st Term",
                    start_date: formSecondSemFirstTermStart.trim(),
                    end_date: formSecondSemFirstTermEnd.trim(),
                },
                {
                    school_year: schoolYear,
                    semester: "2nd Semester",
                    term: "2nd Term",
                    start_date: formSecondSemSecondTermStart.trim(),
                    end_date: formSecondSemSecondTermEnd.trim(),
                },
            ];

            const { error: insertError } = await supabase
                .from("academic_calendar")
                .insert(entriesToInsert);

            if (insertError) {
                console.error('Insert error:', insertError);
                throw insertError;
            }

            const successMessage = isChangeMode 
                ? `Academic calendar for ${schoolYear} updated successfully.`
                : `Academic calendar for ${schoolYear} saved successfully.`;
            Alert.alert('Success', successMessage);
            setShowModal(false);
            setIsChangeMode(false);
            fetchCalendarEntries();
        } catch (error: any) {
            console.error('Error saving academic calendar:', error);
            Alert.alert('Error', error?.message || 'Failed to save academic calendar.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        setShowModal(false);
        setIsEditMode(false);
        setIsChangeMode(false);
        setEditingEntry(null);
        setFormSchoolYear("");
        setOriginalSchoolYear("");
        setFormFirstSemFirstTermStart("");
        setFormFirstSemFirstTermEnd("");
        setFormFirstSemSecondTermStart("");
        setFormFirstSemSecondTermEnd("");
        setFormSecondSemFirstTermStart("");
        setFormSecondSemFirstTermEnd("");
        setFormSecondSemSecondTermStart("");
        setFormSecondSemSecondTermEnd("");
    };

    const formatDate = (dateString: string) => {
        if (!dateString) return "N/A";
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        } catch {
            return dateString;
        }
    };


    if (authLoading) {
        return (
            <View style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color={colors.maroon} />
            </View>
        );
    }

    if (Platform.OS !== 'web') {
        return null;
    }

    return (
        <View style={{ flex: 1 }}>
            <View style={styles.topBar}>
                <View>
                    <Text style={styles.welcome}>Academic Calendar</Text>
                    <Text style={styles.description}>Manage the academic semester and term schedule used by the system.</Text>
                </View>
                <TouchableOpacity
                    style={styles.addButton}
                    onPress={handleAddClick}
                    activeOpacity={0.7}
                >
                    <Text style={styles.addButtonText}>Change Academic Calendar</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1, backgroundColor: '#fff' }}>
                <View style={styles.content}>
                    {loadingEntries ? (
                        <View style={{ padding: 40, alignItems: 'center' }}>
                            <ActivityIndicator size="large" color={colors.maroon} />
                        </View>
                    ) : calendarEntries.length === 0 ? (
                        <View style={styles.emptyState}>
                            <Ionicons name="calendar-outline" size={48} color={colors.border} />
                            <Text style={styles.emptyStateText}>No academic calendar entries found.</Text>
                        </View>
                    ) : (
                        <View style={styles.pageLayout}>
                            {/* School Year Section */}
                            <View style={styles.pageSchoolYearSection}>
                                <Text style={styles.schoolYearLabel}>Academic School Year</Text>
                                <Text style={styles.schoolYearValue}>{pageSchoolYear || "N/A"}</Text>
                            </View>

                            {/* First Semester Section */}
                            <View style={styles.pageSemesterWrapper}>
                                <Text style={styles.pageSemesterTitle}>1st Semester</Text>
                                <View style={styles.pageSemesterSection}>
                                    <View style={styles.pageTermSubsection}>
                                    <Text style={styles.pageTermLabel}>1st Term</Text>
                                    <View style={styles.pageDateRow}>
                                        <View style={styles.pageDateDisplayContainer}>
                                            <Text style={styles.pageDateLabel}>Start Date</Text>
                                            <Text style={styles.pageDateValue}>
                                                {formatDate(pageFirstSemFirstTermStart)}
                                            </Text>
                                        </View>
                                        <View style={styles.pageDateDisplayContainer}>
                                            <Text style={styles.pageDateLabel}>End Date</Text>
                                            <Text style={styles.pageDateValue}>
                                                {formatDate(pageFirstSemFirstTermEnd)}
                                            </Text>
                                        </View>
                                    </View>
                                </View>

                                <View style={styles.pageTermSubsection}>
                                    <Text style={styles.pageTermLabel}>2nd Term</Text>
                                    <View style={styles.pageDateRow}>
                                        <View style={styles.pageDateDisplayContainer}>
                                            <Text style={styles.pageDateLabel}>Start Date</Text>
                                            <Text style={styles.pageDateValue}>
                                                {formatDate(pageFirstSemSecondTermStart)}
                                            </Text>
                                        </View>
                                        <View style={styles.pageDateDisplayContainer}>
                                            <Text style={styles.pageDateLabel}>End Date</Text>
                                            <Text style={styles.pageDateValue}>
                                                {formatDate(pageFirstSemSecondTermEnd)}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                            </View>

                            {/* Second Semester Section */}
                            <View style={styles.pageSemesterWrapper}>
                                <Text style={styles.pageSemesterTitle}>2nd Semester</Text>
                                <View style={styles.pageSemesterSection}>
                                    <View style={styles.pageTermSubsection}>
                                    <Text style={styles.pageTermLabel}>1st Term</Text>
                                    <View style={styles.pageDateRow}>
                                        <View style={styles.pageDateDisplayContainer}>
                                            <Text style={styles.pageDateLabel}>Start Date</Text>
                                            <Text style={styles.pageDateValue}>
                                                {formatDate(pageSecondSemFirstTermStart)}
                                            </Text>
                                        </View>
                                        <View style={styles.pageDateDisplayContainer}>
                                            <Text style={styles.pageDateLabel}>End Date</Text>
                                            <Text style={styles.pageDateValue}>
                                                {formatDate(pageSecondSemFirstTermEnd)}
                                            </Text>
                                        </View>
                                    </View>
                                </View>

                                <View style={styles.pageTermSubsection}>
                                    <Text style={styles.pageTermLabel}>2nd Term</Text>
                                    <View style={styles.pageDateRow}>
                                        <View style={styles.pageDateDisplayContainer}>
                                            <Text style={styles.pageDateLabel}>Start Date</Text>
                                            <Text style={styles.pageDateValue}>
                                                {formatDate(pageSecondSemSecondTermStart)}
                                            </Text>
                                        </View>
                                        <View style={styles.pageDateDisplayContainer}>
                                            <Text style={styles.pageDateLabel}>End Date</Text>
                                            <Text style={styles.pageDateValue}>
                                                {formatDate(pageSecondSemSecondTermEnd)}
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            </View>
                            </View>
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* Add/Edit Modal */}
            {showModal && (
                <Modal
                    visible={showModal}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={handleCancel}
                >
                    <TouchableOpacity
                        style={styles.modalOverlay}
                        activeOpacity={1}
                        onPress={handleCancel}
                    >
                        <TouchableOpacity
                            activeOpacity={1}
                            onPress={(e) => {
                                e.stopPropagation();
                            }}
                            style={styles.modalContent}
                        >
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>
                                    {isChangeMode ? `Change Academic Calendar - ${formSchoolYear}` : isEditMode ? `Edit Academic Calendar - ${formSchoolYear}` : "Add Academic Calendar"}
                                </Text>
                                <TouchableOpacity onPress={handleCancel} style={styles.modalCloseButton}>
                                    <Ionicons name="close" size={24} color={colors.text} />
                                </TouchableOpacity>
                            </View>

                            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                                <View style={styles.formGroup}>
                                    <Text style={styles.formLabel}>School Year *</Text>
                                    <TextInput
                                        style={[styles.formInput, isEditMode && styles.formInputDisabled]}
                                        placeholder="e.g., 2025-2026"
                                        placeholderTextColor="#999"
                                        value={formSchoolYear}
                                        onChangeText={setFormSchoolYear}
                                        editable={!isEditMode}
                                    />
                                    <Text style={styles.formHint}>Format: YYYY-YYYY (e.g., 2025-2026)</Text>
                                    {isEditMode && (
                                        <Text style={styles.formHint}>School year cannot be changed when editing.</Text>
                                    )}
                                </View>

                                {/* First Semester */}
                                <View style={styles.semesterSection}>
                                    <Text style={styles.semesterTitle}>1st Semester</Text>
                                    
                                    <View style={styles.termSubsection}>
                                        <Text style={styles.termLabel}>1st Term</Text>
                                        <View style={styles.dateRow}>
                                            <View style={styles.dateInputContainer}>
                                                <Text style={styles.formLabel}>Start Date *</Text>
                                                <TextInput
                                                    style={styles.formInput}
                                                    placeholder="YYYY-MM-DD"
                                                    placeholderTextColor="#999"
                                                    value={formFirstSemFirstTermStart}
                                                    onChangeText={setFormFirstSemFirstTermStart}
                                                />
                                            </View>
                                            <View style={styles.dateInputContainer}>
                                                <Text style={styles.formLabel}>End Date *</Text>
                                                <TextInput
                                                    style={styles.formInput}
                                                    placeholder="YYYY-MM-DD"
                                                    placeholderTextColor="#999"
                                                    value={formFirstSemFirstTermEnd}
                                                    onChangeText={setFormFirstSemFirstTermEnd}
                                                />
                                            </View>
                                        </View>
                                    </View>

                                    <View style={styles.termSubsection}>
                                        <Text style={styles.termLabel}>2nd Term</Text>
                                        <View style={styles.dateRow}>
                                            <View style={styles.dateInputContainer}>
                                                <Text style={styles.formLabel}>Start Date *</Text>
                                                <TextInput
                                                    style={styles.formInput}
                                                    placeholder="YYYY-MM-DD"
                                                    placeholderTextColor="#999"
                                                    value={formFirstSemSecondTermStart}
                                                    onChangeText={setFormFirstSemSecondTermStart}
                                                />
                                            </View>
                                            <View style={styles.dateInputContainer}>
                                                <Text style={styles.formLabel}>End Date *</Text>
                                                <TextInput
                                                    style={styles.formInput}
                                                    placeholder="YYYY-MM-DD"
                                                    placeholderTextColor="#999"
                                                    value={formFirstSemSecondTermEnd}
                                                    onChangeText={setFormFirstSemSecondTermEnd}
                                                />
                                            </View>
                                        </View>
                                    </View>
                                </View>

                                {/* Second Semester */}
                                <View style={styles.semesterSection}>
                                    <Text style={styles.semesterTitle}>2nd Semester</Text>
                                    
                                    <View style={styles.termSubsection}>
                                        <Text style={styles.termLabel}>1st Term</Text>
                                        <View style={styles.dateRow}>
                                            <View style={styles.dateInputContainer}>
                                                <Text style={styles.formLabel}>Start Date *</Text>
                                                <TextInput
                                                    style={styles.formInput}
                                                    placeholder="YYYY-MM-DD"
                                                    placeholderTextColor="#999"
                                                    value={formSecondSemFirstTermStart}
                                                    onChangeText={setFormSecondSemFirstTermStart}
                                                />
                                            </View>
                                            <View style={styles.dateInputContainer}>
                                                <Text style={styles.formLabel}>End Date *</Text>
                                                <TextInput
                                                    style={styles.formInput}
                                                    placeholder="YYYY-MM-DD"
                                                    placeholderTextColor="#999"
                                                    value={formSecondSemFirstTermEnd}
                                                    onChangeText={setFormSecondSemFirstTermEnd}
                                                />
                                            </View>
                                        </View>
                                    </View>

                                    <View style={styles.termSubsection}>
                                        <Text style={styles.termLabel}>2nd Term</Text>
                                        <View style={styles.dateRow}>
                                            <View style={styles.dateInputContainer}>
                                                <Text style={styles.formLabel}>Start Date *</Text>
                                                <TextInput
                                                    style={styles.formInput}
                                                    placeholder="YYYY-MM-DD"
                                                    placeholderTextColor="#999"
                                                    value={formSecondSemSecondTermStart}
                                                    onChangeText={setFormSecondSemSecondTermStart}
                                                />
                                            </View>
                                            <View style={styles.dateInputContainer}>
                                                <Text style={styles.formLabel}>End Date *</Text>
                                                <TextInput
                                                    style={styles.formInput}
                                                    placeholder="YYYY-MM-DD"
                                                    placeholderTextColor="#999"
                                                    value={formSecondSemSecondTermEnd}
                                                    onChangeText={setFormSecondSemSecondTermEnd}
                                                />
                                            </View>
                                        </View>
                                    </View>
                                </View>
                            </ScrollView>

                            <View style={styles.modalFooter}>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.modalButtonCancel]}
                                    onPress={handleCancel}
                                    disabled={isSaving}
                                >
                                    <Text style={styles.modalButtonCancelText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.modalButtonSave]}
                                    onPress={handleSave}
                                    disabled={isSaving}
                                >
                                    {isSaving ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <Text style={styles.modalButtonSaveText}>Save</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </Modal>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    topBar: {
        paddingHorizontal: 24,
        paddingVertical: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: '#fff',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    welcome: {
        fontSize: 24,
        fontWeight: "700",
        color: colors.text,
        marginBottom: 4,
    },
    description: {
        fontSize: 14,
        color: colors.text,
        opacity: 0.7,
    },
    addButton: {
        backgroundColor: colors.maroon,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 8,
        flexDirection: "row",
        alignItems: "center",
    },
    addButtonText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "600",
    },
    content: {
        padding: 24,
        width: '100%',
        alignItems: 'center',
    },
    emptyState: {
        padding: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyStateText: {
        marginTop: 16,
        fontSize: 16,
        color: colors.text,
        opacity: 0.6,
    },
    tableContainer: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        backgroundColor: "#fff",
        overflow: "hidden",
        minWidth: 850,
    },
    tableHeader: {
        flexDirection: "row",
        backgroundColor: colors.faint,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingVertical: 14,
        paddingHorizontal: 20,
        alignItems: "center",
    },
    tableHeaderText: {
        color: colors.text,
        fontSize: 13,
        fontWeight: "700",
        letterSpacing: 0.2,
    },
    tableRow: {
        flexDirection: "row",
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingVertical: 14,
        paddingHorizontal: 20,
        alignItems: "center",
        backgroundColor: "#fff",
    },
    tableRowAlternate: {
        flexDirection: "row",
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingVertical: 14,
        paddingHorizontal: 20,
        alignItems: "center",
        backgroundColor: colors.faint,
    },
    tableCell: {
        paddingRight: 16,
    },
    tableCellText: {
        color: colors.text,
        fontSize: 13,
        lineHeight: 20,
    },
    tableCellSchoolYear: {
        width: 150,
    },
    tableCellSemester: {
        width: 150,
    },
    tableCellTerm: {
        width: 120,
    },
    tableCellStartDate: {
        width: 150,
    },
    tableCellEndDate: {
        width: 150,
    },
    tableCellActions: {
        width: 80,
        alignItems: "center",
    },
    editButton: {
        padding: 6,
        borderRadius: 4,
        backgroundColor: colors.faint,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
    },
    modalContent: {
        backgroundColor: "#fff",
        borderRadius: 12,
        width: "100%",
        maxWidth: 700,
        maxHeight: "90%",
        ...(Platform.OS === 'web' ? {
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        } : {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 8,
        }),
    },
    modalHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: "700",
        color: colors.text,
    },
    modalCloseButton: {
        padding: 4,
    },
    modalBody: {
        padding: 20,
        ...(Platform.OS === 'web' ? {
            overflow: 'visible' as any,
        } : {}),
    },
    formGroup: {
        marginBottom: 20,
        zIndex: 1,
    },
    formGroupDropdownOpen: {
        zIndex: 100,
    },
    semesterSection: {
        marginBottom: 24,
        padding: 16,
        backgroundColor: colors.faint,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
    },
    semesterTitle: {
        fontSize: 16,
        fontWeight: "700",
        color: colors.text,
        marginBottom: 16,
    },
    termSubsection: {
        marginBottom: 16,
        paddingLeft: 12,
    },
    termLabel: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.text,
        marginBottom: 12,
        opacity: 0.8,
    },
    dateRow: {
        flexDirection: "row",
        gap: 12,
    },
    dateInputContainer: {
        flex: 1,
    },
    formLabel: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.text,
        marginBottom: 8,
    },
    formInput: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: colors.text,
        backgroundColor: "#fff",
    },
    formInputDisabled: {
        backgroundColor: colors.faint,
        color: colors.text,
        opacity: 0.7,
    },
    formHint: {
        fontSize: 12,
        color: colors.text,
        opacity: 0.6,
        marginTop: 4,
    },
    dropdownContainer: {
        position: 'relative' as any,
        zIndex: 10,
    },
    dropdown: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: "#fff",
    },
    dropdownText: {
        fontSize: 14,
        color: colors.text,
    },
    dropdownOptions: {
        position: 'absolute' as any,
        top: '100%',
        left: 0,
        right: 0,
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        marginTop: 4,
        zIndex: 9999,
        ...(Platform.OS === 'web' ? {
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        } : {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 8,
            elevation: 10,
        }),
    },
    dropdownOption: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    dropdownOptionLast: {
        borderBottomWidth: 0,
    },
    dropdownOptionText: {
        fontSize: 14,
        color: colors.text,
    },
    modalFooter: {
        flexDirection: "row",
        justifyContent: "flex-end",
        gap: 12,
        padding: 20,
        borderTopWidth: 1,
        borderTopColor: colors.border,
    },
    modalButton: {
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
        minWidth: 80,
        alignItems: "center",
    },
    modalButtonCancel: {
        backgroundColor: colors.faint,
    },
    modalButtonCancelText: {
        color: colors.text,
        fontSize: 14,
        fontWeight: "600",
    },
    modalButtonSave: {
        backgroundColor: colors.maroon,
    },
    modalButtonSaveText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "600",
    },
    // Page layout styles
    pageLayout: {
        width: '100%',
        maxWidth: 900,
        alignSelf: 'center',
    },
    pageSchoolYearSection: {
        marginBottom: 32,
        padding: 20,
        backgroundColor: "#fff",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#E0E0E0",
        alignItems: 'center',
        justifyContent: 'center',
        ...(Platform.OS === 'web' ? {
            boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
        } : {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 4,
            elevation: 2,
        }),
    },
    schoolYearLabel: {
        fontSize: 13,
        color: colors.text,
        opacity: 0.6,
        marginBottom: 8,
        fontWeight: "500",
        textAlign: 'center',
    },
    schoolYearValue: {
        fontSize: 26,
        fontWeight: "700",
        color: colors.text,
        textAlign: 'center',
    },
    pageSemesterWrapper: {
        marginBottom: 32,
    },
    pageSemesterTitle: {
        fontSize: 20,
        fontWeight: "700",
        color: colors.text,
        marginBottom: 12,
    },
    pageSemesterSection: {
        padding: 16,
        backgroundColor: "#fff",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
    },
    pageTermSubsection: {
        marginBottom: 20,
        paddingLeft: 12,
    },
    pageTermLabel: {
        fontSize: 15,
        fontWeight: "600",
        color: colors.text,
        marginBottom: 12,
        opacity: 0.9,
    },
    pageDateRow: {
        flexDirection: "row",
        gap: 16,
        marginBottom: 8,
    },
    pageDateInputContainer: {
        flex: 1,
    },
    pageDateDisplayContainer: {
        flex: 1,
    },
    pageDateLabel: {
        fontSize: 13,
        fontWeight: "500",
        color: colors.text,
        opacity: 0.7,
        marginBottom: 6,
    },
    pageDateValue: {
        fontSize: 15,
        fontWeight: "500",
        color: colors.text,
        paddingVertical: 4,
    },
    pageFormLabel: {
        fontSize: 14,
        fontWeight: "600",
        color: colors.text,
        marginBottom: 8,
    },
    pageFormInput: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: colors.text,
        backgroundColor: "#fff",
    },
    pageFormHint: {
        fontSize: 12,
        color: colors.text,
        opacity: 0.6,
        marginTop: 4,
    },
});
