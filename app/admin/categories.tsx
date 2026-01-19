import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState, useEffect } from "react";
import {
    ActivityIndicator,
    Alert,
    Image,
    Platform,
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
            // UI only - no actual auth check
            setFullName("Admin");
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

type Category = {
    id: string;
    code: string;
    name: string;
    is_active: boolean;
    order: number;
    isNew?: boolean; // Track newly added categories
};

type ErrandItem = {
    id: string;
    name: string;
    price: number;
    subcategory: string | null;
    is_active: boolean;
    sort_order: number | null;
};

export default function AdminCategories() {
    const router = useRouter();
    const { loading, fullName } = useAuthProfile();
    const { width: screenWidth } = useWindowDimensions();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [confirmLogout, setConfirmLogout] = useState(false);
    const [categories, setCategories] = useState<Category[]>([]);
    const [categoriesLoading, setCategoriesLoading] = useState(true);
    const [categoriesError, setCategoriesError] = useState<string | null>(null);
    const [localCategories, setLocalCategories] = useState<Category[]>([]);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingCategory, setEditingCategory] = useState<Category | null>(null);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [editCategoryName, setEditCategoryName] = useState("");

    // Item preview and management state
    const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
    const [categoryItems, setCategoryItems] = useState<Record<string, { items: ErrandItem[]; loading: boolean; error: string | null }>>({});
    
    // Item CRUD state
    const [editingItem, setEditingItem] = useState<{ item: ErrandItem; categoryId: string } | null>(null);
    const [showAddItemModal, setShowAddItemModal] = useState<{ categoryId: string; categoryName: string } | null>(null);
    const [newItemDraft, setNewItemDraft] = useState<{ name: string; price: string; subcategory: string; sort_order: string }>({ name: "", price: "", subcategory: "", sort_order: "" });
    const [editItemDraft, setEditItemDraft] = useState<{ name: string; price: string; subcategory: string; sort_order: string; is_active: boolean }>({ name: "", price: "", subcategory: "", sort_order: "", is_active: true });
    const [itemSaving, setItemSaving] = useState(false);
    const [itemSaveError, setItemSaveError] = useState<string | null>(null);

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
        // Auto-collapse sidebar on small screens
        if (isSmall) {
            setSidebarOpen(false);
        }
    }, [isSmall]);

    // Fetch items for a specific category (lazy loading, read-only preview)
    const fetchCategoryItems = async (categoryId: string, categoryName: string) => {
        // Special categories that don't use errand_items
        if (categoryName === "Printing" || categoryName === "Deliver Items") {
            setCategoryItems(prev => ({
                ...prev,
                [categoryId]: { items: [], loading: false, error: null }
            }));
            return;
        }

        // Mark as loading
        setCategoryItems(prev => ({
            ...prev,
            [categoryId]: { items: prev[categoryId]?.items || [], loading: true, error: null }
        }));

        try {
            const { data, error } = await supabase
                .from('errand_items')
                .select('id, name, price, subcategory, is_active, sort_order')
                .eq('category_id', parseInt(categoryId, 10))
                .order('subcategory', { ascending: true, nullsFirst: false })
                .order('sort_order', { ascending: true, nullsFirst: false });

            if (error) {
                throw error;
            }

            setCategoryItems(prev => ({
                ...prev,
                [categoryId]: { items: (data || []) as ErrandItem[], loading: false, error: null }
            }));
        } catch (err) {
            console.error('Error fetching category items:', err);
            setCategoryItems(prev => ({
                ...prev,
                [categoryId]: { items: prev[categoryId]?.items || [], loading: false, error: err instanceof Error ? err.message : 'Failed to load items' }
            }));
        }
    };

    // Handle category expand/collapse
    const toggleCategoryExpand = (categoryId: string, categoryName: string) => {
        const isExpanded = expandedCategories.has(categoryId);
        if (isExpanded) {
            // Collapse
            setExpandedCategories(prev => {
                const next = new Set(prev);
                next.delete(categoryId);
                return next;
            });
        } else {
            // Expand - fetch items if not already loaded
            setExpandedCategories(prev => new Set(prev).add(categoryId));
            if (!categoryItems[categoryId]) {
                fetchCategoryItems(categoryId, categoryName);
            }
        }
    };

    // Item CRUD handlers
    const handleToggleItemActive = async (itemId: string, categoryId: string, currentActive: boolean) => {
        try {
            setItemSaving(true);
            setItemSaveError(null);

            const { error } = await supabase
                .from('errand_items')
                .update({ is_active: !currentActive })
                .eq('id', itemId);

            if (error) throw error;

            // Optimistic update - refetch items
            const category = localCategories.find(c => c.id === categoryId);
            if (category) {
                await fetchCategoryItems(categoryId, category.name);
            }
        } catch (err) {
            console.error('Error toggling item active status:', err);
            setItemSaveError(err instanceof Error ? err.message : 'Failed to update item');
            Alert.alert('Error', `Failed to update item: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setItemSaving(false);
        }
    };

    const handleOpenEditItem = (item: ErrandItem, categoryId: string) => {
        setEditingItem({ item, categoryId });
        setEditItemDraft({
            name: item.name,
            price: String(item.price),
            subcategory: item.subcategory || "",
            sort_order: item.sort_order !== null ? String(item.sort_order) : "",
            is_active: item.is_active,
        });
    };

    const handleSaveEditItem = async () => {
        if (!editingItem) return;

        if (!editItemDraft.name.trim()) {
            Alert.alert('Error', 'Item name cannot be empty');
            return;
        }

        const priceNum = parseFloat(editItemDraft.price);
        if (isNaN(priceNum) || priceNum < 0) {
            Alert.alert('Error', 'Price must be a valid number');
            return;
        }

        try {
            setItemSaving(true);
            setItemSaveError(null);

            const updateData: any = {
                name: editItemDraft.name.trim(),
                price: priceNum,
                is_active: editItemDraft.is_active,
            };

            if (editItemDraft.subcategory.trim()) {
                updateData.subcategory = editItemDraft.subcategory.trim();
            } else {
                updateData.subcategory = null;
            }

            if (editItemDraft.sort_order.trim()) {
                const sortOrderNum = parseInt(editItemDraft.sort_order, 10);
                if (!isNaN(sortOrderNum)) {
                    updateData.sort_order = sortOrderNum;
                }
            } else {
                updateData.sort_order = null;
            }

            const { error } = await supabase
                .from('errand_items')
                .update(updateData)
                .eq('id', editingItem.item.id);

            if (error) throw error;

            // Refetch items
            const category = localCategories.find(c => c.id === editingItem.categoryId);
            if (category) {
                await fetchCategoryItems(editingItem.categoryId, category.name);
            }

            setEditingItem(null);
            setEditItemDraft({ name: "", price: "", subcategory: "", sort_order: "", is_active: true });
        } catch (err) {
            console.error('Error updating item:', err);
            setItemSaveError(err instanceof Error ? err.message : 'Failed to update item');
            Alert.alert('Error', `Failed to update item: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setItemSaving(false);
        }
    };

    const handleOpenAddItem = (categoryId: string, categoryName: string) => {
        // Skip for special categories
        if (categoryName === "Printing" || categoryName === "Deliver Items") {
            return;
        }
        setShowAddItemModal({ categoryId, categoryName });
        setNewItemDraft({ name: "", price: "", subcategory: "", sort_order: "" });
    };

    const handleAddItem = async () => {
        if (!showAddItemModal) return;

        if (!newItemDraft.name.trim()) {
            Alert.alert('Error', 'Item name cannot be empty');
            return;
        }

        const priceNum = parseFloat(newItemDraft.price);
        if (isNaN(priceNum) || priceNum < 0) {
            Alert.alert('Error', 'Price must be a valid number');
            return;
        }

        try {
            setItemSaving(true);
            setItemSaveError(null);

            const insertData: any = {
                category_id: parseInt(showAddItemModal.categoryId, 10),
                name: newItemDraft.name.trim(),
                price: priceNum,
                is_active: true,
            };

            if (newItemDraft.subcategory.trim()) {
                insertData.subcategory = newItemDraft.subcategory.trim();
            }

            if (newItemDraft.sort_order.trim()) {
                const sortOrderNum = parseInt(newItemDraft.sort_order, 10);
                if (!isNaN(sortOrderNum)) {
                    insertData.sort_order = sortOrderNum;
                }
            }

            const { error } = await supabase
                .from('errand_items')
                .insert([insertData]);

            if (error) throw error;

            // Refetch items
            await fetchCategoryItems(showAddItemModal.categoryId, showAddItemModal.categoryName);

            setShowAddItemModal(null);
            setNewItemDraft({ name: "", price: "", subcategory: "", sort_order: "" });
        } catch (err) {
            console.error('Error adding item:', err);
            setItemSaveError(err instanceof Error ? err.message : 'Failed to add item');
            Alert.alert('Error', `Failed to add item: ${err instanceof Error ? err.message : 'Unknown error'}`);
        } finally {
            setItemSaving(false);
        }
    };

    // Fetch categories from database
    useEffect(() => {
        const fetchCategories = async () => {
            try {
                setCategoriesLoading(true);
                setCategoriesError(null);

                // Fetch all categories (active and inactive) for admin view
                const { data, error } = await supabase
                    .from('errand_categories')
                    .select('id, code, name, is_active, order')
                    .order('order', { ascending: true });

                if (error) {
                    console.error('Error fetching categories:', error);
                    setCategoriesError(error.message || 'Failed to load categories');
                    setCategories([]);
                    return;
                }

                const fetchedCategories = data || [];
                setCategories(fetchedCategories);
                // Initialize local editable copy
                setLocalCategories(fetchedCategories);
                setHasUnsavedChanges(false);
            } catch (err) {
                console.error('Unexpected error fetching categories:', err);
                setCategoriesError(err instanceof Error ? err.message : 'An unexpected error occurred');
                setCategories([]);
                setLocalCategories([]);
            } finally {
                setCategoriesLoading(false);
            }
        };

        fetchCategories();
    }, []);

    const handleLogout = async () => {
        setConfirmLogout(false);
        // UI only - no actual logout
        router.replace('/login');
    };

    // UI-only handlers for local state manipulation
    const handleMoveUp = (categoryId: string) => {
        setLocalCategories((prev) => {
            const index = prev.findIndex((c) => c.id === categoryId);
            if (index <= 0) return prev; // Can't move first item up

            const newCategories = [...prev];
            [newCategories[index - 1], newCategories[index]] = [newCategories[index], newCategories[index - 1]];
            setHasUnsavedChanges(true);
            return newCategories;
        });
    };

    const handleMoveDown = (categoryId: string) => {
        setLocalCategories((prev) => {
            const index = prev.findIndex((c) => c.id === categoryId);
            if (index < 0 || index >= prev.length - 1) return prev; // Can't move last item down

            const newCategories = [...prev];
            [newCategories[index], newCategories[index + 1]] = [newCategories[index + 1], newCategories[index]];
            setHasUnsavedChanges(true);
            return newCategories;
        });
    };

    const handleToggleActive = (categoryId: string) => {
        setLocalCategories((prev) => {
            const newCategories = prev.map((c) =>
                c.id === categoryId ? { ...c, is_active: !c.is_active } : c
            );
            setHasUnsavedChanges(true);
            return newCategories;
        });
    };

    // Add new category to local state
    const handleAddCategory = () => {
        if (!newCategoryName.trim()) {
            Alert.alert('Error', 'Category name cannot be empty');
            return;
        }

        const maxOrder = localCategories.length > 0 
            ? Math.max(...localCategories.map(c => c.order))
            : 0;

        const newCategory: Category = {
            id: `temp-${Date.now()}-${Math.random()}`, // Temporary ID for new categories
            code: newCategoryName.trim().toLowerCase().replace(/\s+/g, '_'),
            name: newCategoryName.trim(),
            is_active: true,
            order: maxOrder + 1,
            isNew: true,
        };

        setLocalCategories((prev) => [...prev, newCategory]);
        setHasUnsavedChanges(true);
        setNewCategoryName("");
        setShowAddModal(false);
    };

    // Open edit modal
    const handleEditClick = (categoryId: string) => {
        const category = localCategories.find(c => c.id === categoryId);
        if (category) {
            setEditingCategory(category);
            setEditCategoryName(category.name);
            setShowEditModal(true);
        }
    };

    // Save edited category name
    const handleSaveEdit = () => {
        if (!editCategoryName.trim()) {
            Alert.alert('Error', 'Category name cannot be empty');
            return;
        }

        if (!editingCategory) return;

        setLocalCategories((prev) =>
            prev.map((c) =>
                c.id === editingCategory.id
                    ? { ...c, name: editCategoryName.trim() }
                    : c
            )
        );
        setHasUnsavedChanges(true);
        setShowEditModal(false);
        setEditingCategory(null);
        setEditCategoryName("");
    };

    // Check if local categories differ from fetched categories
    const hasActualChanges = () => {
        // Check for new categories
        const hasNewCategories = localCategories.some(c => c.isNew || !categories.find(f => f.id === c.id));
        if (hasNewCategories) return true;

        if (localCategories.length !== categories.length) return true;
        
        for (let i = 0; i < localCategories.length; i++) {
            const local = localCategories[i];
            const localOrder = i + 1; // Current position in array
            const fetched = categories.find(c => c.id === local.id);
            
            if (!fetched) return true;
            // Compare name
            if (local.name !== fetched.name) return true;
            // Compare is_active status
            if (local.is_active !== fetched.is_active) return true;
            // Compare current array position with fetched order
            if (localOrder !== fetched.order) return true;
        }
        
        return false;
    };

    // Save changes to database
    const handleSaveChanges = async () => {
        if (!hasUnsavedChanges || saving || !hasActualChanges()) return;

        try {
            setSaving(true);
            setSaveError(null);
            setSaveSuccess(false);

            // Process each category: insert new ones, update existing ones
            for (let i = 0; i < localCategories.length; i++) {
                const category = localCategories[i];
                const newOrder = i + 1;

                if (category.isNew) {
                    // Insert new category
                    const { error } = await supabase
                        .from('errand_categories')
                        .insert({
                            code: category.code,
                            name: category.name,
                            is_active: category.is_active,
                            order: newOrder,
                        });

                    if (error) {
                        console.error('Error inserting category:', error);
                        setSaveError(`Failed to add category "${category.name}": ${error.message}`);
                        setSaving(false);
                        return;
                    }
                } else {
                    // Update existing category
                    const { error } = await supabase
                        .from('errand_categories')
                        .update({
                            name: category.name,
                            order: newOrder,
                            is_active: category.is_active,
                        })
                        .eq('id', category.id);

                    if (error) {
                        console.error('Error updating category:', error);
                        setSaveError(`Failed to update category "${category.name}": ${error.message}`);
                        setSaving(false);
                        return;
                    }
                }
            }

            // All updates succeeded - re-fetch all categories (active and inactive for admin view)
            setSaveSuccess(true);
            const { data, error } = await supabase
                .from('errand_categories')
                .select('id, code, name, is_active, order')
                .order('order', { ascending: true });

            if (error) {
                console.error('Error re-fetching categories after save:', error);
                setSaveError(`Changes saved, but failed to refresh: ${error.message}`);
                setSaving(false);
                return;
            }

            const fetchedCategories = data || [];
            setCategories(fetchedCategories);
            // Update localCategories to match fetched (only active categories)
            setLocalCategories(fetchedCategories);
            setHasUnsavedChanges(false);
            setSaving(false);

            // Clear success message after 3 seconds
            setTimeout(() => {
                setSaveSuccess(false);
            }, 3000);
        } catch (err) {
            console.error('Unexpected error saving changes:', err);
            setSaveError(err instanceof Error ? err.message : 'An unexpected error occurred');
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color={colors.maroon} />
            </SafeAreaView>
        );
    }

    if (Platform.OS !== 'web') {
        return null;
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={{ flex: 1, flexDirection: 'row', backgroundColor: '#fff' }}>
                {/* Sidebar Overlay on small screens */}
                {(isSmall && sidebarOpen) && (
                    <TouchableOpacity 
                        style={[styles.sidebarOverlay, { width: screenWidth }]}
                        activeOpacity={1}
                        onPress={() => setSidebarOpen(false)}
                    />
                )}
                
                <Sidebar
                    open={sidebarOpen}
                    onToggle={() => setSidebarOpen((v) => !v)}
                    onLogout={() => setConfirmLogout(true)}
                    userName={fullName}
                    activeRoute="categories"
                    isSmall={isSmall}
                />
                
                <View style={styles.mainArea}>
                    <View style={styles.topBar}>
                        <Text style={styles.welcome}>Category List</Text>
                    </View>

                    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }}>
                        <View style={styles.content}>
                            {/* Section 1: Errands */}
                            <View style={styles.section}>
                                <View style={styles.sectionHeaderRow}>
                                    <Text style={styles.sectionHeader}>Errands</Text>
                                    <View style={styles.headerButtons}>
                                        <TouchableOpacity
                                            style={styles.addButton}
                                            onPress={() => {
                                                setNewCategoryName("");
                                                setShowAddModal(true);
                                            }}
                                            activeOpacity={0.7}
                                        >
                                            <Ionicons name="add-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                                            <Text style={styles.addButtonText}>Add Category</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[
                                                styles.saveButton,
                                                (!hasUnsavedChanges || saving || !hasActualChanges()) ? styles.saveButtonDisabled : null,
                                            ]}
                                            onPress={handleSaveChanges}
                                            disabled={!hasUnsavedChanges || saving || !hasActualChanges()}
                                            activeOpacity={0.7}
                                        >
                                            {saving ? (
                                                <View style={styles.saveButtonContent}>
                                                    <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                                                    <Text style={styles.saveButtonText}>Saving...</Text>
                                                </View>
                                            ) : (
                                                <Text style={styles.saveButtonText}>Save Changes</Text>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                {saveError && (
                                    <View style={styles.saveErrorContainer}>
                                        <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
                                        <Text style={styles.saveErrorText}>{saveError}</Text>
                                    </View>
                                )}
                                {saveSuccess && (
                                    <View style={styles.saveSuccessContainer}>
                                        <Ionicons name="checkmark-circle-outline" size={16} color="#10B981" />
                                        <Text style={styles.saveSuccessText}>Changes saved successfully!</Text>
                                    </View>
                                )}
                                <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                                    <View style={styles.tableContainer}>
                                        <View style={styles.tableHeader}>
                                            <Text style={[styles.tableHeaderText, styles.tableCellOrder]}>Order</Text>
                                            <Text style={[styles.tableHeaderText, styles.tableCellCategory]}>Category</Text>
                                            <Text style={[styles.tableHeaderText, styles.tableCellActive]}>Active</Text>
                                            <Text style={[styles.tableHeaderText, styles.tableCellActions]}>Actions</Text>
                                        </View>
                                        {categoriesLoading ? (
                                            <View style={styles.tableRow}>
                                                <View style={[styles.tableCellOrder, { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 }]}>
                                                    <ActivityIndicator size="small" color={colors.maroon} />
                                                    <Text style={[styles.tableCellText, { marginTop: 8, opacity: 0.6 }]}>Loading categories...</Text>
                                                </View>
                                            </View>
                                        ) : categoriesError ? (
                                            <View style={styles.tableRow}>
                                                <View style={[styles.tableCellOrder, { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 }]}>
                                                    <Ionicons name="alert-circle-outline" size={20} color="#EF4444" />
                                                    <Text style={[styles.tableCellText, { marginTop: 8, color: "#EF4444" }]}>Error: {categoriesError}</Text>
                                                </View>
                                            </View>
                                        ) : categories.length === 0 ? (
                                            <View style={styles.tableRow}>
                                                <View style={[styles.tableCellOrder, { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 }]}>
                                                    <Text style={[styles.tableCellText, { opacity: 0.6 }]}>No categories found</Text>
                                                </View>
                                            </View>
                                        ) : (
                                            localCategories.map((category, index) => (
                                                <React.Fragment key={category.id}>
                                                    <CategoryTableRow
                                                        categoryId={category.id}
                                                        order={index + 1}
                                                        category={category.name}
                                                        active={category.is_active}
                                                        index={index}
                                                        totalItems={localCategories.length}
                                                        onMoveUp={handleMoveUp}
                                                        onMoveDown={handleMoveDown}
                                                        onToggleActive={handleToggleActive}
                                                        onEdit={handleEditClick}
                                                        isExpanded={expandedCategories.has(category.id)}
                                                        onToggleExpand={() => toggleCategoryExpand(category.id, category.name)}
                                                        itemsData={categoryItems[category.id]}
                                                        onToggleItemActive={handleToggleItemActive}
                                                        onEditItem={handleOpenEditItem}
                                                        onAddItem={handleOpenAddItem}
                                                    />
                                                </React.Fragment>
                                            ))
                                        )}
                                    </View>
                                </ScrollView>
                            </View>

                            {/* Section 2: Commissions */}
                            <View style={styles.section}>
                                <Text style={styles.sectionHeader}>Commissions</Text>
                                <View style={styles.comingSoonContainer}>
                                    <Text style={styles.comingSoonText}>Coming soon</Text>
                                </View>
                            </View>
                        </View>
                    </ScrollView>
                </View>
            </View>

            {/* Logout Confirmation Modal */}
            {confirmLogout && (
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Confirm Logout</Text>
                        <Text style={styles.modalMessage}>Are you sure you want to logout?</Text>
                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonCancel]}
                                onPress={() => setConfirmLogout(false)}
                            >
                                <Text style={styles.modalButtonCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonConfirm]}
                                onPress={handleLogout}
                            >
                                <Text style={styles.modalButtonConfirmText}>Logout</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            )}

            {/* Add Category Modal */}
            {showAddModal && (
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Add Category</Text>
                        <Text style={styles.modalMessage}>Enter the category name:</Text>
                        <TextInput
                            style={styles.modalInput}
                            value={newCategoryName}
                            onChangeText={setNewCategoryName}
                            placeholder="Category name"
                            placeholderTextColor={colors.border}
                            autoFocus
                        />
                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonCancel]}
                                onPress={() => {
                                    setShowAddModal(false);
                                    setNewCategoryName("");
                                }}
                            >
                                <Text style={styles.modalButtonCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonConfirm]}
                                onPress={handleAddCategory}
                            >
                                <Text style={styles.modalButtonConfirmText}>Add</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            )}

            {/* Edit Category Modal */}
            {showEditModal && editingCategory && (
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Edit Category</Text>
                        <Text style={styles.modalMessage}>Enter the new category name:</Text>
                        <TextInput
                            style={styles.modalInput}
                            value={editCategoryName}
                            onChangeText={setEditCategoryName}
                            placeholder="Category name"
                            placeholderTextColor={colors.border}
                            autoFocus
                        />
                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonCancel]}
                                onPress={() => {
                                    setShowEditModal(false);
                                    setEditingCategory(null);
                                    setEditCategoryName("");
                                }}
                            >
                                <Text style={styles.modalButtonCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonConfirm]}
                                onPress={handleSaveEdit}
                            >
                                <Text style={styles.modalButtonConfirmText}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            )}

            {/* Add Item Modal */}
            {showAddItemModal && (
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Add Item to {showAddItemModal.categoryName}</Text>
                        {itemSaveError && (
                            <View style={styles.saveErrorContainer}>
                                <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
                                <Text style={styles.saveErrorText}>{itemSaveError}</Text>
                            </View>
                        )}
                        <Text style={styles.modalMessage}>Item name:</Text>
                        <TextInput
                            style={styles.modalInput}
                            value={newItemDraft.name}
                            onChangeText={(text) => setNewItemDraft(prev => ({ ...prev, name: text }))}
                            placeholder="Item name"
                            placeholderTextColor={colors.border}
                            autoFocus
                        />
                        <Text style={styles.modalMessage}>Price (₱):</Text>
                        <TextInput
                            style={styles.modalInput}
                            value={newItemDraft.price}
                            onChangeText={(text) => setNewItemDraft(prev => ({ ...prev, price: text }))}
                            placeholder="0.00"
                            placeholderTextColor={colors.border}
                            keyboardType="numeric"
                        />
                        <Text style={styles.modalMessage}>Subcategory (optional):</Text>
                        <TextInput
                            style={styles.modalInput}
                            value={newItemDraft.subcategory}
                            onChangeText={(text) => setNewItemDraft(prev => ({ ...prev, subcategory: text }))}
                            placeholder="e.g., Canteen, Drinks"
                            placeholderTextColor={colors.border}
                        />
                        <Text style={styles.modalMessage}>Sort order (optional):</Text>
                        <TextInput
                            style={styles.modalInput}
                            value={newItemDraft.sort_order}
                            onChangeText={(text) => setNewItemDraft(prev => ({ ...prev, sort_order: text }))}
                            placeholder="0"
                            placeholderTextColor={colors.border}
                            keyboardType="numeric"
                        />
                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonCancel]}
                                onPress={() => {
                                    setShowAddItemModal(null);
                                    setNewItemDraft({ name: "", price: "", subcategory: "", sort_order: "" });
                                    setItemSaveError(null);
                                }}
                                disabled={itemSaving}
                            >
                                <Text style={styles.modalButtonCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonConfirm, itemSaving && { opacity: 0.6 }]}
                                onPress={handleAddItem}
                                disabled={itemSaving}
                            >
                                {itemSaving ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Text style={styles.modalButtonConfirmText}>Add</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            )}

            {/* Edit Item Modal */}
            {editingItem && (
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Edit Item</Text>
                        {itemSaveError && (
                            <View style={styles.saveErrorContainer}>
                                <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
                                <Text style={styles.saveErrorText}>{itemSaveError}</Text>
                            </View>
                        )}
                        <Text style={styles.modalMessage}>Item name:</Text>
                        <TextInput
                            style={styles.modalInput}
                            value={editItemDraft.name}
                            onChangeText={(text) => setEditItemDraft(prev => ({ ...prev, name: text }))}
                            placeholder="Item name"
                            placeholderTextColor={colors.border}
                            autoFocus
                        />
                        <Text style={styles.modalMessage}>Price (₱):</Text>
                        <TextInput
                            style={styles.modalInput}
                            value={editItemDraft.price}
                            onChangeText={(text) => setEditItemDraft(prev => ({ ...prev, price: text }))}
                            placeholder="0.00"
                            placeholderTextColor={colors.border}
                            keyboardType="numeric"
                        />
                        <Text style={styles.modalMessage}>Subcategory (optional):</Text>
                        <TextInput
                            style={styles.modalInput}
                            value={editItemDraft.subcategory}
                            onChangeText={(text) => setEditItemDraft(prev => ({ ...prev, subcategory: text }))}
                            placeholder="e.g., Canteen, Drinks"
                            placeholderTextColor={colors.border}
                        />
                        <Text style={styles.modalMessage}>Sort order (optional):</Text>
                        <TextInput
                            style={styles.modalInput}
                            value={editItemDraft.sort_order}
                            onChangeText={(text) => setEditItemDraft(prev => ({ ...prev, sort_order: text }))}
                            placeholder="0"
                            placeholderTextColor={colors.border}
                            keyboardType="numeric"
                        />
                        <TouchableOpacity
                            style={styles.checkboxContainer}
                            onPress={() => setEditItemDraft(prev => ({ ...prev, is_active: !prev.is_active }))}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.checkbox, editItemDraft.is_active && styles.checkboxSelected]}>
                                {editItemDraft.is_active && <Ionicons name="checkmark" size={12} color="white" />}
                            </View>
                            <Text style={styles.checkboxLabel}>Active</Text>
                        </TouchableOpacity>
                        <View style={styles.modalActions}>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonCancel]}
                                onPress={() => {
                                    setEditingItem(null);
                                    setEditItemDraft({ name: "", price: "", subcategory: "", sort_order: "", is_active: true });
                                    setItemSaveError(null);
                                }}
                                disabled={itemSaving}
                            >
                                <Text style={styles.modalButtonCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonConfirm, itemSaving && { opacity: 0.6 }]}
                                onPress={handleSaveEditItem}
                                disabled={itemSaving}
                            >
                                {itemSaving ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Text style={styles.modalButtonConfirmText}>Save</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            )}
        </SafeAreaView>
    );
}

function Sidebar({
    open,
    onToggle,
    onLogout,
    userName,
    activeRoute,
    isSmall,
}: {
    open: boolean;
    onToggle: () => void;
    onLogout: () => void;
    userName: string;
    activeRoute?: string;
    isSmall: boolean;
}) {
    const router = useRouter();
    return (
        <View style={[
            styles.sidebar, 
            { 
                width: open ? (isSmall ? 260 : 260) : 74,
                ...(isSmall && open ? {
                    position: 'absolute' as any,
                    left: 0,
                    top: 0,
                    bottom: 0,
                    zIndex: 1000,
                    elevation: 10,
                } : {}),
            }
        ]}>
            <View style={styles.sidebarHeader}>
                <View
                    style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: open ? 10 : 0,
                        justifyContent: open ? "flex-start" : "center",
                        paddingHorizontal: open ? 16 : 6,
                        paddingVertical: 16,
                    }}
                >
                    <TouchableOpacity onPress={onToggle} style={[styles.sideMenuBtn, !open && { marginRight: 0 }]}>
                        <Ionicons name="menu-outline" size={20} color="#fff" />
                    </TouchableOpacity>
                    {open && (
                        <>
                            <Image source={require("../../assets/images/logo.png")} style={{ width: 22, height: 22, resizeMode: "contain" }} />
                            <Text style={styles.brand}>GoBuddy Admin</Text>
                        </>
                    )}
                </View>
            </View>

            <View style={{ flex: 1, justifyContent: "space-between", backgroundColor: "#fff" }}>
                <View style={{ paddingTop: 8 }}>
                    <SideItem
                        label="Dashboard"
                        icon="home-outline"
                        open={open}
                        active={activeRoute === 'home'}
                        onPress={() => router.push("/admin/home")}
                    />
                    <Separator />
                    <SideItem
                        label="List of Students"
                        icon="people-outline"
                        open={open}
                        active={activeRoute === 'students'}
                        onPress={() => router.push("/admin/students")}
                    />
                    <Separator />
                    <SideItem
                        label="Settlements"
                        icon="cash-outline"
                        open={open}
                        active={activeRoute === 'settlements'}
                        onPress={() => router.push("/admin/settlements")}
                    />
                    <Separator />
                    <SideItem
                        label="Student ID Approval"
                        icon="id-card-outline"
                        open={open}
                        active={activeRoute === 'id_images'}
                        onPress={() => router.push("/admin/id_images")}
                    />
                    <Separator />
                    <SideItem
                        label="Errands Transactions"
                        icon="briefcase-outline"
                        open={open}
                        active={activeRoute === 'errands'}
                        onPress={() => router.push("/admin/errands")}
                    />
                    <Separator />
                    <SideItem
                        label="Commission Transactions"
                        icon="document-text-outline"
                        open={open}
                        active={activeRoute === 'commissions'}
                        onPress={() => router.push("/admin/commissions")}
                    />
                    <Separator />
                    <SideItem
                        label="Category List"
                        icon="list-outline"
                        open={open}
                        active={activeRoute === 'categories'}
                        onPress={() => router.push("/admin/categories")}
                    />
                    <Separator />
                </View>

                <View style={styles.sidebarFooter}>
                    <View style={styles.userCard}>
                        <View style={styles.userAvatar}>
                            <Ionicons name="person" size={18} color="#fff" />
                        </View>
                        {open && (
                            <View style={{ flex: 1 }}>
                                <Text style={styles.userName}>{userName || "Admin"}</Text>
                            </View>
                        )}
                    </View>
                    <TouchableOpacity onPress={onLogout} activeOpacity={0.8} style={styles.logoutBtn}>
                        <Ionicons name="log-out-outline" size={18} color="#fff" />
                        {open && <Text style={styles.logoutText}>Logout</Text>}
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

function Separator() {
    return <View style={styles.separator} />;
}

function CategoryTableRow({
    categoryId,
    order,
    category,
    active,
    index,
    totalItems,
    onMoveUp,
    onMoveDown,
    onToggleActive,
    onEdit,
    isExpanded,
    onToggleExpand,
    itemsData,
    onToggleItemActive,
    onEditItem,
    onAddItem,
}: {
    categoryId: string;
    order: number;
    category: string;
    active: boolean;
    index: number;
    totalItems: number;
    onMoveUp: (id: string) => void;
    onMoveDown: (id: string) => void;
    onToggleActive: (id: string) => void;
    onEdit: (id: string) => void;
    isExpanded?: boolean;
    onToggleExpand?: () => void;
    itemsData?: { items: ErrandItem[]; loading: boolean; error: string | null };
    onToggleItemActive?: (itemId: string, categoryId: string, currentActive: boolean) => void;
    onEditItem?: (item: ErrandItem, categoryId: string) => void;
    onAddItem?: (categoryId: string, categoryName: string) => void;
}) {
    const rowStyle = index % 2 === 0 ? styles.tableRow : styles.tableRowAlternate;
    const canMoveUp = index > 0;
    const canMoveDown = index < totalItems - 1;
    
    return (
        <>
        <View style={rowStyle}>
            <Text style={[styles.tableCellText, styles.tableCellOrder]}>{order}</Text>
            <Text style={[styles.tableCellText, styles.tableCellCategory]}>{category}</Text>
            <View style={styles.tableCellActive}>
                <TouchableOpacity
                    onPress={() => onToggleActive(categoryId)}
                    activeOpacity={0.7}
                >
                    <View style={[styles.activeBadge, !active && styles.activeBadgeInactive]}>
                        <Text style={styles.activeBadgeText}>{active ? 'Active' : 'Inactive'}</Text>
                    </View>
                </TouchableOpacity>
            </View>
            <View style={styles.tableCellActions}>
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={onToggleExpand}
                    activeOpacity={0.7}
                >
                    <Ionicons 
                        name={isExpanded ? "chevron-down-outline" : "chevron-forward-outline"} 
                        size={16} 
                        color={colors.text} 
                    />
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.actionButton, !canMoveUp && styles.actionButtonDisabled]}
                    onPress={() => canMoveUp && onMoveUp(categoryId)}
                    disabled={!canMoveUp}
                >
                    <Ionicons name="chevron-up-outline" size={16} color={canMoveUp ? colors.text : colors.border} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.actionButton, !canMoveDown && styles.actionButtonDisabled]}
                    onPress={() => canMoveDown && onMoveDown(categoryId)}
                    disabled={!canMoveDown}
                >
                    <Ionicons name="chevron-down-outline" size={16} color={canMoveDown ? colors.text : colors.border} />
                </TouchableOpacity>
                <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => onEdit(categoryId)}
                    activeOpacity={0.7}
                >
                    <Ionicons name="create-outline" size={16} color={colors.text} />
                </TouchableOpacity>
            </View>
        </View>
        {isExpanded && (
            <CategoryItemsPreview 
                category={category}
                categoryId={categoryId}
                itemsData={itemsData}
                onToggleItemActive={onToggleItemActive}
                onEditItem={onEditItem}
                onAddItem={onAddItem}
            />
        )}
        </>
    );
}

type CategoryItemsPreviewProps = {
    category: string;
    categoryId: string;
    itemsData?: { items: ErrandItem[]; loading: boolean; error: string | null };
    onToggleItemActive?: (itemId: string, categoryId: string, currentActive: boolean) => void;
    onEditItem?: (item: ErrandItem, categoryId: string) => void;
    onAddItem?: (categoryId: string, categoryName: string) => void;
};

function CategoryItemsPreview({
    category,
    categoryId,
    itemsData,
    onToggleItemActive,
    onEditItem,
    onAddItem,
}: CategoryItemsPreviewProps) {
    // Special handling for categories that don't use errand_items
    if (category === "Printing") {
        return (
            <View style={styles.itemsPreviewContainer}>
                <View style={styles.itemsPreviewNote}>
                    <Ionicons name="information-circle-outline" size={16} color={colors.text} style={{ opacity: 0.6, marginRight: 8 }} />
                    <Text style={styles.itemsPreviewNoteText}>
                        Printing uses file upload and size/color pricing.
                    </Text>
                </View>
            </View>
        );
    }

    if (category === "Deliver Items") {
        return (
            <View style={styles.itemsPreviewContainer}>
                <View style={styles.itemsPreviewNote}>
                    <Ionicons name="information-circle-outline" size={16} color={colors.text} style={{ opacity: 0.6, marginRight: 8 }} />
                    <Text style={styles.itemsPreviewNoteText}>
                        Delivery Items use destinations from campus_locations.
                    </Text>
                </View>
            </View>
        );
    }

    // Loading state
    if (!itemsData || itemsData.loading) {
        return (
            <View style={styles.itemsPreviewContainer}>
                <View style={styles.itemsPreviewLoading}>
                    <ActivityIndicator size="small" color={colors.maroon} />
                    <Text style={styles.itemsPreviewLoadingText}>Loading items...</Text>
                </View>
            </View>
        );
    }

    // Error state
    if (itemsData.error) {
        return (
            <View style={styles.itemsPreviewContainer}>
                <View style={styles.itemsPreviewError}>
                    <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
                    <Text style={styles.itemsPreviewErrorText}>{itemsData.error}</Text>
                </View>
            </View>
        );
    }

    // Empty state
    if (!itemsData.items || itemsData.items.length === 0) {
        return (
            <View style={styles.itemsPreviewContainer}>
                {/* Add Item Button */}
                {onAddItem && (
                    <TouchableOpacity
                        style={styles.addItemButton}
                        onPress={() => onAddItem(categoryId, category)}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="add-outline" size={14} color="#fff" style={{ marginRight: 6 }} />
                        <Text style={styles.addItemButtonText}>Add Item</Text>
                    </TouchableOpacity>
                )}
                <View style={styles.itemsPreviewEmpty}>
                    <Text style={styles.itemsPreviewEmptyText}>No items configured for this category</Text>
                </View>
            </View>
        );
    }

    // Group items by subcategory if present
    const groupedBySubcategory: Record<string, ErrandItem[]> = {};
    const itemsWithoutSubcategory: ErrandItem[] = [];

    itemsData.items.forEach(item => {
        if (item.subcategory) {
            if (!groupedBySubcategory[item.subcategory]) {
                groupedBySubcategory[item.subcategory] = [];
            }
            groupedBySubcategory[item.subcategory].push(item);
        } else {
            itemsWithoutSubcategory.push(item);
        }
    });

    return (
        <View style={styles.itemsPreviewContainer}>
            {/* Add Item Button */}
            {onAddItem && (
                <TouchableOpacity
                    style={styles.addItemButton}
                    onPress={() => onAddItem(categoryId, category)}
                    activeOpacity={0.7}
                >
                    <Ionicons name="add-outline" size={14} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={styles.addItemButtonText}>Add Item</Text>
                </TouchableOpacity>
            )}
            
            <View style={styles.itemsPreviewContent}>
                {Object.keys(groupedBySubcategory).length > 0 && (
                    Object.entries(groupedBySubcategory).map(([subcategory, items]) => (
                        <View key={subcategory} style={styles.itemsPreviewGroup}>
                            <Text style={styles.itemsPreviewSubcategory}>{subcategory}</Text>
                            {items.map((item) => (
                                <ItemRow
                                    key={item.id}
                                    item={item}
                                    categoryId={categoryId}
                                    onToggleActive={onToggleItemActive}
                                    onEdit={onEditItem}
                                />
                            ))}
                        </View>
                    ))
                )}
                {itemsWithoutSubcategory.length > 0 && (
                    <View style={styles.itemsPreviewGroup}>
                        {itemsWithoutSubcategory.map((item) => (
                            <ItemRow
                                key={item.id}
                                item={item}
                                categoryId={categoryId}
                                onToggleActive={onToggleItemActive}
                                onEdit={onEditItem}
                            />
                        ))}
                    </View>
                )}
            </View>
        </View>
    );
}

type ItemRowProps = {
    item: ErrandItem;
    categoryId: string;
    onToggleActive?: (itemId: string, categoryId: string, currentActive: boolean) => void;
    onEdit?: (item: ErrandItem, categoryId: string) => void;
};

function ItemRow({
    item,
    categoryId,
    onToggleActive,
    onEdit,
}: ItemRowProps) {
    return (
        <View style={styles.itemsPreviewRow}>
            <Text style={styles.itemsPreviewItemName}>{item.name}</Text>
            <Text style={styles.itemsPreviewPrice}>₱{item.price}</Text>
            <TouchableOpacity
                onPress={() => onToggleActive?.(item.id, categoryId, item.is_active)}
                activeOpacity={0.7}
            >
                <View style={[styles.itemsPreviewBadge, !item.is_active && styles.itemsPreviewBadgeInactive]}>
                    <Text style={styles.itemsPreviewBadgeText}>
                        {item.is_active ? 'Active' : 'Inactive'}
                    </Text>
                </View>
            </TouchableOpacity>
            {item.sort_order !== null && (
                <Text style={styles.itemsPreviewOrder}>Order: {item.sort_order}</Text>
            )}
            {item.subcategory && (
                <Text style={styles.itemsPreviewSubcategoryLabel}>{item.subcategory}</Text>
            )}
            {onEdit && (
                <TouchableOpacity
                    style={styles.itemsPreviewEditButton}
                    onPress={() => onEdit(item, categoryId)}
                    activeOpacity={0.7}
                >
                    <Ionicons name="create-outline" size={14} color={colors.text} />
                </TouchableOpacity>
            )}
        </View>
    );
}

function SideItem({
    label,
    icon,
    open,
    active,
    onPress,
}: {
    label: string;
    icon: any;
    open: boolean;
    active?: boolean;
    onPress?: () => void;
}) {
    return (
        <TouchableOpacity
            activeOpacity={0.9}
            onPress={onPress}
            style={[styles.sideItem, active && styles.sideItemActive, !open && styles.sideItemCollapsed]}
        >
            <Ionicons name={icon} size={18} color={active ? colors.maroon : colors.text} />
            {open && (
                <Text style={[styles.sideItemText, active && styles.sideItemTextActive]}>{label}</Text>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#fff",
    },
    sidebarOverlay: {
        position: 'absolute' as any,
        top: 0,
        left: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.3)',
        zIndex: 999,
    },
    sidebar: {
        borderRightColor: colors.border,
        borderRightWidth: 1,
        backgroundColor: "#fff",
    },
    sidebarHeader: {
        backgroundColor: "#a01a1a",
        ...(Platform.OS === 'web' ? {
            background: `linear-gradient(135deg, #a01a1a 0%, #8B0000 100%)`,
        } : {}),
        borderBottomWidth: 1,
        borderBottomColor: "#8B0000",
    },
    brand: {
        fontSize: 16,
        fontWeight: "700",
        color: "#fff",
    },
    sideMenuBtn: {
        padding: 8,
        borderRadius: 4,
        marginRight: 8,
    },
    sideItem: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginHorizontal: 8,
        borderRadius: 8,
    },
    sideItemCollapsed: {
        justifyContent: "center",
        paddingHorizontal: 8,
    },
    sideItemActive: {
        backgroundColor: colors.faint,
    },
    sideItemText: {
        fontSize: 14,
        color: colors.text,
        fontWeight: "500",
    },
    sideItemTextActive: {
        color: colors.maroon,
        fontWeight: "600",
    },
    separator: {
        height: 1,
        backgroundColor: colors.border,
        marginVertical: 4,
        marginHorizontal: 12,
    },
    sidebarFooter: {
        padding: 12,
        gap: 10,
    },
    userCard: {
        backgroundColor: "#a01a1a",
        ...(Platform.OS === 'web' ? {
            background: `linear-gradient(135deg, #a01a1a 0%, #8B0000 100%)`,
        } : {}),
        borderRadius: 8,
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    userAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: "rgba(255,255,255,0.2)",
        justifyContent: "center",
        alignItems: "center",
    },
    userName: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "600",
    },
    logoutBtn: {
        backgroundColor: "#8B0000",
        borderRadius: 8,
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
    },
    logoutText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "600",
    },
    mainArea: {
        flex: 1,
        backgroundColor: "#fff",
    },
    topBar: {
        height: 90,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingHorizontal: 24,
        backgroundColor: "#fff",
        ...(Platform.OS === 'web' ? {
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
        } : {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.05,
            shadowRadius: 4,
            elevation: 2,
        }),
    },
    welcome: {
        color: colors.text,
        fontSize: 18,
        fontWeight: "900",
    },
    content: {
        width: "100%",
        maxWidth: 1200,
        alignSelf: "center",
        paddingHorizontal: 24,
        paddingVertical: 16,
        backgroundColor: "#fafafa",
    },
    section: {
        marginBottom: 40,
    },
    sectionHeaderRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16,
    },
    sectionHeader: {
        color: colors.text,
        fontSize: 20,
        fontWeight: "700",
    },
    headerButtons: {
        flexDirection: "row",
        gap: 12,
        alignItems: "center",
    },
    addButton: {
        backgroundColor: "#10B981",
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
    saveButton: {
        backgroundColor: colors.maroon,
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
    },
    saveButtonDisabled: {
        backgroundColor: colors.border,
        opacity: 0.6,
    },
    saveButtonContent: {
        flexDirection: "row",
        alignItems: "center",
    },
    saveButtonText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "600",
    },
    saveErrorContainer: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: "#FEE2E2",
        borderWidth: 1,
        borderColor: "#FCA5A5",
        borderRadius: 6,
        padding: 12,
        marginBottom: 12,
    },
    saveErrorText: {
        color: "#DC2626",
        fontSize: 13,
        fontWeight: "500",
        flex: 1,
    },
    saveSuccessContainer: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: "#D1FAE5",
        borderWidth: 1,
        borderColor: "#6EE7B7",
        borderRadius: 6,
        padding: 12,
        marginBottom: 12,
    },
    saveSuccessText: {
        color: "#059669",
        fontSize: 13,
        fontWeight: "500",
        flex: 1,
    },
    tableContainer: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        backgroundColor: "#fff",
        overflow: "hidden",
        minWidth: 1000,
    },
    tableHeader: {
        flexDirection: "row",
        backgroundColor: colors.faint,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingVertical: 14,
        paddingHorizontal: 20,
    },
    tableHeaderText: {
        color: colors.text,
        fontSize: 13,
        fontWeight: "700",
    },
    tableRow: {
        flexDirection: "row",
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingVertical: 16,
        paddingHorizontal: 20,
        alignItems: "center",
        minHeight: 56,
        backgroundColor: "#fff",
    },
    tableRowAlternate: {
        flexDirection: "row",
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        paddingVertical: 16,
        paddingHorizontal: 20,
        alignItems: "center",
        minHeight: 56,
        backgroundColor: "#F5F5F5",
    },
    tableCellText: {
        color: colors.text,
        fontSize: 13,
    },
    tableCellOrder: {
        width: 150,
        paddingRight: 24,
    },
    tableCellCategory: {
        width: 400,
        paddingRight: 24,
    },
    tableCellActive: {
        width: 180,
        paddingRight: 24,
    },
    tableCellActions: {
        width: 220,
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
    },
    activeBadge: {
        backgroundColor: "#10B981",
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        alignSelf: "flex-start",
    },
    activeBadgeInactive: {
        backgroundColor: "#6B7280",
    },
    activeBadgeText: {
        color: "#fff",
        fontSize: 12,
        fontWeight: "600",
    },
    actionButton: {
        padding: 6,
        borderRadius: 4,
        backgroundColor: colors.faint,
    },
    actionButtonDisabled: {
        opacity: 0.4,
    },
    comingSoonContainer: {
        backgroundColor: "#fff",
        borderRadius: 8,
        padding: 32,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: "center",
        justifyContent: "center",
    },
    comingSoonText: {
        fontSize: 16,
        color: colors.text,
        opacity: 0.6,
        fontStyle: "italic",
    },
    modalOverlay: {
        position: 'absolute' as any,
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 24,
        width: '90%',
        maxWidth: 400,
        ...(Platform.OS === 'web' ? {
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        } : {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 8,
        }),
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: "700",
        color: colors.text,
        marginBottom: 12,
    },
    modalMessage: {
        fontSize: 14,
        color: colors.text,
        opacity: 0.8,
        marginBottom: 12,
    },
    modalInput: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 14,
        color: colors.text,
        backgroundColor: "#fff",
        marginBottom: 24,
    },
    modalActions: {
        flexDirection: "row",
        gap: 12,
        justifyContent: "flex-end",
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
    modalButtonConfirm: {
        backgroundColor: colors.maroon,
    },
    modalButtonConfirmText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "600",
    },
    // Item preview styles (read-only UI enhancement)
    itemsPreviewContainer: {
        backgroundColor: "#FAFAFA",
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingVertical: 12,
        paddingHorizontal: 20,
    },
    itemsPreviewContent: {
        gap: 12,
    },
    itemsPreviewGroup: {
        marginBottom: 8,
    },
    itemsPreviewSubcategory: {
        fontSize: 13,
        fontWeight: "600",
        color: colors.text,
        marginBottom: 6,
        opacity: 0.8,
    },
    itemsPreviewRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 6,
        paddingHorizontal: 12,
        backgroundColor: "#fff",
        borderRadius: 4,
        marginBottom: 4,
        gap: 12,
    },
    itemsPreviewItemName: {
        fontSize: 13,
        color: colors.text,
        flex: 1,
    },
    itemsPreviewPrice: {
        fontSize: 13,
        fontWeight: "600",
        color: colors.maroon,
        minWidth: 60,
    },
    itemsPreviewBadge: {
        backgroundColor: "#10B981",
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    itemsPreviewBadgeInactive: {
        backgroundColor: "#6B7280",
    },
    itemsPreviewBadgeText: {
        color: "#fff",
        fontSize: 11,
        fontWeight: "600",
    },
    itemsPreviewOrder: {
        fontSize: 11,
        color: colors.text,
        opacity: 0.5,
        minWidth: 70,
    },
    itemsPreviewLoading: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 8,
    },
    itemsPreviewLoadingText: {
        fontSize: 13,
        color: colors.text,
        opacity: 0.6,
    },
    itemsPreviewError: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        paddingVertical: 8,
    },
    itemsPreviewErrorText: {
        fontSize: 13,
        color: "#EF4444",
    },
    itemsPreviewEmpty: {
        paddingVertical: 8,
    },
    itemsPreviewEmptyText: {
        fontSize: 13,
        color: colors.text,
        opacity: 0.6,
        fontStyle: "italic",
    },
    itemsPreviewNote: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: "#EFF6FF",
        borderRadius: 4,
        borderLeftWidth: 3,
        borderLeftColor: colors.maroon,
    },
    itemsPreviewNoteText: {
        fontSize: 13,
        color: colors.text,
        opacity: 0.8,
        flex: 1,
    },
    // Item management styles
    addItemButton: {
        backgroundColor: "#10B981",
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 6,
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        marginBottom: 12,
    },
    addItemButtonText: {
        color: "#fff",
        fontSize: 13,
        fontWeight: "600",
    },
    itemsPreviewEditButton: {
        padding: 4,
        borderRadius: 4,
        backgroundColor: colors.faint,
    },
    itemsPreviewSubcategoryLabel: {
        fontSize: 11,
        color: colors.text,
        opacity: 0.6,
        fontStyle: "italic",
        minWidth: 80,
    },
    checkboxContainer: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginTop: 8,
        marginBottom: 8,
    },
    checkbox: {
        width: 20,
        height: 20,
        borderWidth: 2,
        borderColor: colors.border,
        borderRadius: 4,
        backgroundColor: "#fff",
        justifyContent: "center",
        alignItems: "center",
    },
    checkboxSelected: {
        backgroundColor: colors.maroon,
        borderColor: colors.maroon,
    },
    checkboxLabel: {
        fontSize: 14,
        color: colors.text,
        fontWeight: "500",
    },
});
