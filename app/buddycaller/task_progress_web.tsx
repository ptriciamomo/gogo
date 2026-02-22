import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
	Image,
	SafeAreaView,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	TouchableWithoutFeedback,
	View,
	Alert,
	Modal,
	TextInput,
	Platform,
	ActivityIndicator,
	useWindowDimensions,
} from "react-native";
import { supabase } from "../../lib/supabase";
import FileViewer from "../../components/FileViewer";
import TaskApprovalConfirmationModalWeb from "../../components/TaskApprovalConfirmationModalWeb";
import CallerRateAndFeedbackModalWeb from "../../components/CallerRateAndFeedbackModalWeb";
import { globalNotificationService } from "../../services/GlobalNotificationService";
import { approvalModalService } from "../../services/ApprovalModalService";

/* ================= COLORS ================= */
const colors = {
	maroon: "#8B0000",
	light: "#FAF6F5",
	border: "#E5C8C5",
	text: "#531010",
	pillText: "#FFFFFF",
	pillTextActive: "#1e293b",
	faint: "#F7F1F0",
	accent: "#FEF2F2",
	accentText: "#991B1B",
};

/* ================ TYPES ================== */
type Commission = {
	id: number;
	title: string | null;
	description: string | null;
	commission_type: string | null;
	due_at: string | null;
	runner_id: string | null;
	buddycaller_id: string | null;
	status: string | null;
	created_at: string | null;
};

type User = {
	id: string;
	first_name: string | null;
	last_name: string | null;
	course: string | null;
	student_id_number: string | null;
	profile_picture_url: string | null;
};

type TaskStatus = "requested" | "accepted" | "invoice_accepted" | "in_progress" | "file_uploaded" | "under_review" | "revision" | "completed" | "cancelled";

/* ===================== AUTH PROFILE HOOK ===================== */
type ProfileRow = { id: string; role: string | null; first_name: string | null; last_name: string | null; profile_picture_url: string | null };

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
	const [loading, setLoading] = useState(true);
	const [fullName, setFullName] = useState<string>("");
	const [roleLabel, setRoleLabel] = useState<string>("");
	const [profilePictureUrl, setProfilePictureUrl] = useState<string | null>(null);

	const fetchProfile = useCallback(async () => {
		try {
			const { data: userRes } = await supabase.auth.getUser();
			const user = userRes?.user;
			if (!user) { setLoading(false); return; }
			const { data: row } = await supabase
				.from("users")
				.select("id, role, first_name, last_name, profile_picture_url")
				.eq("id", user.id)
				.single<ProfileRow>();
			const f = titleCase(row?.first_name || "");
			const l = titleCase(row?.last_name || "");
			const finalFull = (f && l ? `${f} ${l}` : "").trim() || "User";
			setFullName(finalFull);
			const roleRaw = (row?.role || "").toString().toLowerCase();
			setRoleLabel(roleRaw === "buddyrunner" ? "BuddyRunner" : roleRaw === "buddycaller" ? "BuddyCaller" : "");
			setProfilePictureUrl(row?.profile_picture_url || null);
		} finally { setLoading(false); }
	}, []);

	useEffect(() => {
		fetchProfile();
		const { data: sub } = supabase.auth.onAuthStateChange(() => fetchProfile());
		return () => sub?.subscription?.unsubscribe?.();
	}, [fetchProfile]);

	return { loading, fullName, roleLabel, profilePictureUrl };
}

/* ===================== MAIN COMPONENT ===================== */
export default function TaskProgressWeb() {
	const router = useRouter();
	const { id } = useLocalSearchParams<{ id?: string }>();
	const { width } = useWindowDimensions();

	// Responsive sidebar: collapse on small screens (< 1024px), expand on larger screens
	const isSmallScreen = width < 1024;
	const [open, setOpen] = useState(!isSmallScreen);

	// Auto-collapse/expand sidebar based on screen size
	useEffect(() => {
		setOpen(!isSmallScreen);
	}, [isSmallScreen]);

	// Responsive breakpoints for content
	const isSmallContent = width < 600;
	const isMediumContent = width >= 600 && width < 900;
	const isLargeContent = width >= 900;
	
	const [loading, setLoading] = useState(true);
	const [commission, setCommission] = useState<Commission | null>(null);
	const [runner, setRunner] = useState<User | null>(null);
	const [taskStatus, setTaskStatus] = useState<TaskStatus>("requested");
	const [uploadedFiles, setUploadedFiles] = useState<Array<{
		id: string;
		url: string;
		name: string;
		type: string;
		size?: number;
		uploadedAt: string;
	}>>([]);
	const [approving, setApproving] = useState(false);
	const [invoiceStatus, setInvoiceStatus] = useState<string | null>(null);
	const [isUpdating, setIsUpdating] = useState(false);
	const [revisionModalVisible, setRevisionModalVisible] = useState(false);
	const [revisionComment, setRevisionComment] = useState("");
	const [selectedFilesForRevision, setSelectedFilesForRevision] = useState<string[]>([]);
	const [revisionCount, setRevisionCount] = useState<number>(0);
	const [revisionCompletedAt, setRevisionCompletedAt] = useState<string | null>(null);
	const [revisionNotes, setRevisionNotes] = useState<string | null>(null);
	const [revisionRequestedAt, setRevisionRequestedAt] = useState<string | null>(null);
	const [showErrorModal, setShowErrorModal] = useState(false);
	const [errorMessage, setErrorMessage] = useState("");
	const [revisedFiles, setRevisedFiles] = useState<Array<{
		id: string;
		url: string;
		name: string;
		type: string;
		size?: number;
		uploadedAt: string;
	}>>([]);
	const [fileViewerVisible, setFileViewerVisible] = useState(false);
	const [selectedFile, setSelectedFile] = useState<{
		url: string;
		name: string;
		type: string;
	} | null>(null);
	const [approvalConfirmationVisible, setApprovalConfirmationVisible] = useState(false);
	const [successModalVisible, setSuccessModalVisible] = useState(false);
	const [ratingModalVisible, setRatingModalVisible] = useState(false);
	const [invoiceAmount, setInvoiceAmount] = useState<number | null>(null);
	
	// Link upload functionality
	const [uploadType, setUploadType] = useState<'file' | 'link' | null>(null);
	const [linkInput, setLinkInput] = useState("");
	const [isUploading, setIsUploading] = useState(false);
	const [showUploadTypeModal, setShowUploadTypeModal] = useState(false);

	const fetchData = useCallback(async () => {
		console.log("Task Progress Web: fetchData called with id:", id);
		if (!id) {
			console.log("Task Progress Web: No id provided, returning");
			return;
		}
		
		setLoading(true);
		try {
			const numericId = Number(id);
			console.log("Task Progress Web: Converted id to numeric:", numericId);
			if (!Number.isFinite(numericId)) {
				throw new Error(`Invalid commission id: ${id}`);
			}

			console.log("Task Progress Web: Fetching task progress for commission_id:", numericId);

			// Fetch task progress data using the new table
			const { data: taskProgressData, error: taskProgressError } = await supabase
				.from("task_progress")
				.select("*")
				.eq("commission_id", numericId)
				.single();

			if (taskProgressError && taskProgressError.code !== 'PGRST116') {
				console.error("Task Progress Web: Error fetching task progress:", taskProgressError);
				throw taskProgressError;
			}

			// If no task progress exists, create one using the helper function
			let taskProgress = taskProgressData;
			if (!taskProgress) {
				console.log("Task Progress Web: No task progress found, creating one...");
				const { data: newTaskProgress, error: createError } = await supabase
					.rpc('create_task_progress_if_not_exists', {
						p_commission_id: numericId
					});

				if (createError) {
					console.error("Task Progress Web: Error creating task progress:", createError);
					throw createError;
				}
				
				if (newTaskProgress && newTaskProgress.length > 0) {
					// Fetch the complete task progress record from the database
					const { data: completeTaskProgress, error: fetchError } = await supabase
						.from("task_progress")
						.select("*")
						.eq("id", newTaskProgress[0].id)
						.single();
					
					if (fetchError) {
						console.error("Task Progress Web: Error fetching complete task progress:", fetchError);
						throw fetchError;
					}
					
					taskProgress = completeTaskProgress;
				} else {
					throw new Error("Failed to create task progress record");
				}
			}

			console.log("Task Progress Web: Task progress data:", taskProgress);
			console.log("Task Progress Web: Raw task progress invoice_id:", taskProgress.invoice_id);
			console.log("Task Progress Web: Raw task progress invoice_status:", taskProgress.invoice_status);
			console.log("Task Progress Web: Raw task progress status:", taskProgress.status);
			console.log("Task Progress Web: Raw task progress file_url:", taskProgress.file_url);
			console.log("Task Progress Web: Raw task progress file_uploaded:", taskProgress.file_uploaded);

			// Fetch commission data for additional info
			console.log("Task Progress Web: Fetching commission with id:", numericId);
			const { data: cm, error: cmError } = await supabase
				.from("commission")
				.select("*")
				.eq("id", numericId)
				.single();
			
			if (cmError) {
				console.error("Task Progress Web: Error fetching commission:", cmError);
				throw cmError;
			}
			console.log("Task Progress Web: Commission data:", cm);
			setCommission(cm as Commission);

			// Fetch runner data (fallback to commission.runner_id if task_progress.runner_id is null)
			const runnerIdToUse = taskProgress.runner_id || (cm as any)?.runner_id || null;
			if (runnerIdToUse) {
				const { data: runnerData, error: runnerError } = await supabase
					.from("users")
					.select("*")
					.eq("id", runnerIdToUse)
					.single();
				
				if (runnerError) throw runnerError;
				setRunner(runnerData as User);
			}

			// Fetch invoice data for this commission
			const { data: invoiceData, error: invoiceError } = await supabase
				.from("invoices")
				.select("amount")
				.eq("commission_id", numericId)
				.maybeSingle();
			
			if (invoiceError && invoiceError.code !== 'PGRST116') {
				console.error("Error fetching invoice:", invoiceError);
			} else if (invoiceData && invoiceData.amount) {
				setInvoiceAmount(typeof invoiceData.amount === 'number' ? invoiceData.amount : parseFloat(invoiceData.amount));
			} else {
				setInvoiceAmount(null);
			}

			// Set file upload status - handle multiple files
			console.log("=== FILE DATA DEBUG (WEB) ===");
			console.log("taskProgress.file_url:", taskProgress.file_url);
			console.log("taskProgress.file_type:", taskProgress.file_type);
			console.log("taskProgress.file_size:", taskProgress.file_size);
			console.log("taskProgress.file_name:", taskProgress.file_name);
			console.log("taskProgress.file_uploaded:", taskProgress.file_uploaded);
			console.log("taskProgress object keys:", Object.keys(taskProgress));
			console.log("=== END FILE DATA DEBUG (WEB) ===");
			
			if (taskProgress.file_url && taskProgress.file_uploaded) {
				try {
					console.log("=== LOADING FILES FROM DATABASE (WEB) ===");
					console.log("Raw file_url from database:", taskProgress.file_url);
					console.log("Raw file_name from database:", taskProgress.file_name);
					console.log("Raw file_type from database:", taskProgress.file_type);
					
					// Parse multiple files from comma-separated values
					const fileUrls = taskProgress.file_url.split(',').map((url: string) => url.trim()).filter(Boolean);
					const fileTypes = taskProgress.file_type ? taskProgress.file_type.split(',').map((type: string) => type.trim()) : [];
					const fileSizes = taskProgress.file_size ? taskProgress.file_size.split(',').map((s: string) => parseInt(s) || 0) : [];
					const fileNames = taskProgress.file_name ? taskProgress.file_name.split(',').map((name: string) => name.trim()) : [];
					const uploadedAt = taskProgress.uploaded_at || new Date().toISOString();
					
					console.log("Parsed fileUrls:", fileUrls);
					console.log("Parsed fileNames:", fileNames);
					console.log("=== END LOADING FILES FROM DATABASE (WEB) ===");
					
					const files = fileUrls.map((url: string, index: number) => ({
						id: `${commission?.id || 'unknown'}-${index}-${Date.now()}`,
						url: url,
						name: fileTypes[index] === "link" 
							? url 
							: (fileNames[index] && fileNames[index].trim()) || url.split("/").pop()?.split("?")[0] || "Unknown file",
						type: fileTypes[index] || "unknown",
						size: fileSizes[index] || 0,
						uploadedAt: uploadedAt,
					}));
					
					console.log("Parsed files for revision modal:", files);
					setUploadedFiles(files);
				} catch (error) {
					console.error("Error parsing uploaded files:", error);
					// Fallback: treat as single file
					setUploadedFiles([{
						id: `${commission?.id || 'unknown'}-0-${Date.now()}`,
						url: taskProgress.file_url,
						name: taskProgress.file_type === "link" 
							? taskProgress.file_url 
							: (taskProgress.file_name && taskProgress.file_name.trim()) || taskProgress.file_url.split("/").pop()?.split("?")[0] || "Unknown file",
						type: taskProgress.file_type || "unknown",
						size: parseInt(taskProgress.file_size) || 0,
						uploadedAt: taskProgress.uploaded_at || new Date().toISOString(),
					}]);
				}
			} else {
				console.log("No files found - file_url:", taskProgress.file_url, "file_uploaded:", taskProgress.file_uploaded);
				setUploadedFiles([]);
			}


			// Parse revised files for main display
			if (taskProgress.revised_file_url) {
				try {
					const revisedFileUrls = taskProgress.revised_file_url.split(',');
					const revisedFileTypes = taskProgress.revised_file_type ? taskProgress.revised_file_type.split(',') : [];
					const revisedFileSizes = taskProgress.revised_file_size ? taskProgress.revised_file_size.split(',') : [];
					const revisedFileNames = taskProgress.revised_file_name ? taskProgress.revised_file_name.split(',') : [];
					const revisedUploadedAt = taskProgress.revised_uploaded_at || new Date().toISOString();
					
					const revisedFiles = revisedFileUrls.map((url: string, index: number) => {
						// Use the same filename logic as original files for consistency
						let fileName = "Unknown file";
						
						if (revisedFileTypes[index] === "link") {
							fileName = url.trim();
						} else if (revisedFileNames[index] && revisedFileNames[index].trim()) {
							// Use the original filename from database (this is what we want for revised files too)
							fileName = revisedFileNames[index].trim();
						} else {
							// Fallback to extracting from URL only if database name is not available
							fileName = url.split("/").pop()?.split("?")[0] || "Unknown file";
						}
						
						console.log(`=== REVISED FILE NAME ASSIGNMENT DEBUG (File ${index}) ===`);
						console.log("Revised File URL:", url);
						console.log("Revised File type:", revisedFileTypes[index]);
						console.log("Original revised filename from database:", revisedFileNames[index]);
						console.log("Final assigned revised filename:", fileName);
						console.log("=== END REVISED FILE NAME ASSIGNMENT DEBUG ===");
						
						return {
							id: `revised-${commission?.id || 'unknown'}-${index}-${Date.now()}`,
							url: url.trim(),
							name: fileName,
							type: revisedFileTypes[index]?.trim() || "unknown",
							size: parseInt(revisedFileSizes[index]) || 0,
							uploadedAt: revisedUploadedAt,
						};
					});
					
					console.log("Revised files parsed for main display (web):", revisedFiles);
					setRevisedFiles(revisedFiles);
				} catch (error) {
					console.error("Error parsing revised files for display:", error);
					setRevisedFiles([]);
				}
			} else {
				setRevisedFiles([]);
			}

			// Set invoice status from task_progress invoice_status field
			setInvoiceStatus(taskProgress.invoice_status);
			console.log("Task Progress Web: Invoice status from task_progress:", taskProgress.invoice_status);

			// Set task status from task_progress table
			setTaskStatus(taskProgress.status as TaskStatus);
			
			// Clear selection indicators when revision is completed or task is approved
			if (taskProgress.status === "completed" || taskProgress.revision_completed_at) {
				setSelectedFilesForRevision([]);
			}
			console.log("Task Progress Web: Task status set to:", taskProgress.status);
			console.log("Task Progress Web: Invoice ID from task_progress:", taskProgress.invoice_id);
			
			// Load revision data
			setRevisionNotes(taskProgress.revision_notes || null);
			setRevisionRequestedAt(taskProgress.revision_requested_at || null);
			setRevisionCompletedAt(taskProgress.revision_completed_at || null);
			setRevisionCount(taskProgress.revision_count || 0);
			
			// Load selected files for revision
			if (taskProgress.selected_files_for_revision) {
				try {
					// Try to parse as JSON first (new format)
					const selectedFilesData = JSON.parse(taskProgress.selected_files_for_revision);
					if (Array.isArray(selectedFilesData)) {
						// Extract URLs from the array of objects
						const urls = selectedFilesData.map((file: any) => file.url).filter(Boolean);
						setSelectedFilesForRevision(urls);
					} else {
						setSelectedFilesForRevision([]);
					}
				} catch (error) {
					// Fallback to old format (comma-separated URLs)
					const selectedFiles = taskProgress.selected_files_for_revision.split(',').filter(Boolean);
					setSelectedFilesForRevision(selectedFiles);
				}
			} else {
				setSelectedFilesForRevision([]);
			}
			
		} catch (err: any) {
			console.error("Task progress fetch error:", err);
			Alert.alert("Error", "Failed to load task progress");
		} finally {
			setLoading(false);
		}
	}, [id]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	// Real-time subscription for task progress and invoice updates
	useEffect(() => {
		if (!id) return;

		const channel = supabase
			.channel(`task_progress_web_${id}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'task_progress',
					filter: `commission_id=eq.${parseInt(id)}`
				},
				async (payload) => {
					console.log('Task Progress Web: Task progress update received:', payload);
					console.log('Task Progress Web: New status:', (payload.new as any)?.status);
					// Refresh data when task progress is updated
					setIsUpdating(true);
					await fetchData();
					// Keep updating indicator visible for a brief moment
					setTimeout(() => setIsUpdating(false), 500);
				}
			)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'invoices',
					filter: `commission_id=eq.${parseInt(id)}`
				},
				async (payload) => {
					console.log('Task Progress Web: Invoice update received:', payload);
					console.log('Task Progress Web: Invoice commission_id:', (payload.new as any)?.commission_id, 'Expected commission_id:', id);
					console.log('Task Progress Web: Invoice event type:', payload.eventType);
					console.log('Task Progress Web: Invoice table:', payload.table);
					// Refresh data when invoice is created, updated, or deleted
					setIsUpdating(true);
					await fetchData();
					// Keep updating indicator visible for a brief moment
					setTimeout(() => setIsUpdating(false), 500);
				}
			)
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [id, fetchData]);

	const getProgressSteps = () => {
		// Only show "Accepted" and "In Progress" as completed/active if invoice is actually accepted
		const isInvoiceAccepted = invoiceStatus === "accepted";
		
		console.log("Task Progress Web Debug - invoiceStatus:", invoiceStatus);
		console.log("Task Progress Web Debug - isInvoiceAccepted:", isInvoiceAccepted);
		
		return [
			{ 
				key: "requested", 
				label: "Requested", 
				completed: true, 
				active: false 
			},
			{ 
				key: "accepted", 
				label: "Accepted", 
				completed: isInvoiceAccepted, 
				active: false 
			},
			{ 
				key: "in_progress", 
				label: "In Progress", 
				completed: taskStatus === "completed", 
				active: isInvoiceAccepted && taskStatus !== "completed" // When invoice is accepted, In Progress becomes active (yellow) unless task is completed
			},
			{ 
				key: "revision", 
				label: "Revision", 
				completed: taskStatus === "completed", 
				active: taskStatus === "revision"
			},
			{ 
				key: "completed", 
				label: "Completed", 
				completed: taskStatus === "completed", 
				active: false 
			},
		];
	};

	const formatDueDate = (dueAt: string | null) => {
		if (!dueAt) return "No due date set";
		try {
			const date = new Date(dueAt);
			return date.toLocaleDateString("en-US", {
				month: "long",
				day: "numeric",
				year: "numeric",
				hour: "numeric",
				minute: "2-digit",
			});
		} catch {
			return "Invalid date";
		}
	};

	const handleViewFile = async (fileUrl: string) => {
		console.log("=== FILE VIEWING DEBUG (WEB) ===");
		console.log("File URL to open:", fileUrl);
		
		// Check if it's a local file URI (which shouldn't happen for uploaded files)
		if (fileUrl.startsWith('file://')) {
			console.error("ERROR: Received local file URI instead of Supabase storage URL:", fileUrl);
			alert("File URL is invalid. Please try again or contact support.");
			return;
		}
		
		// Files are now parsed individually, so no comma check needed
		
		try {
			// Find the file info to get the proper filename - check both uploadedFiles and revisedFiles
			let fileInfo = uploadedFiles.find(f => f.url === fileUrl);
			if (!fileInfo) {
				fileInfo = revisedFiles.find(f => f.url === fileUrl);
			}
			
			if (!fileInfo) {
				alert("File information not found.");
				return;
			}
			
			// Set the selected file and show the file viewer
			setSelectedFile({
				url: fileUrl,
				name: fileInfo.name || 'Unknown File',
				type: fileInfo.type || 'application/octet-stream'
			});
			setFileViewerVisible(true);
			
		} catch (err) {
			console.error("Failed to open file:", err);
			alert("Failed to open file. Please try again.");
		}
	};

	const handleApprove = () => {
		if (!commission?.id) {
			Alert.alert("Error", "Commission ID not found.");
			return;
		}
		setApprovalConfirmationVisible(true);
	};

	const handleConfirmApproval = async () => {
		console.log('Task Progress Web: handleConfirmApproval called');
		console.log('Task Progress Web: commission:', commission);
		console.log('Task Progress Web: runner:', runner);
		
		if (!commission?.id || !runner?.id) {
			Alert.alert("Error", "Missing commission or runner information.");
			return;
		}

		setApproving(true);
		try {
			// Get current user info and profile in parallel for faster processing
			const [userResult, userProfileResult] = await Promise.all([
				supabase.auth.getUser(),
				supabase
					.from('users')
					.select('first_name, last_name')
					.eq('id', commission.buddycaller_id) // Use commission.buddycaller_id directly instead of getting current user
					.single()
			]);

			if (userResult.error || !userResult.data.user) {
				throw new Error("User not authenticated");
			}

			const callerName = userProfileResult.data ? 
				`${userProfileResult.data.first_name} ${userProfileResult.data.last_name}`.trim() : "You";

			// Execute database operations in parallel for maximum speed
			const [commissionResult, taskProgressResult] = await Promise.all([
				// Update commission table
				supabase
					.from('commission')
					.update({ 
						status: 'completed'
					})
					.eq('id', commission.id),
				
				// Update task_progress table
				supabase
					.from('task_progress')
					.update({ 
						status: 'completed',
						completed_at: new Date().toISOString()
					})
					.eq('commission_id', commission.id)
			]);

			if (commissionResult.error) {
				console.error('Task Progress Web: Commission update error:', commissionResult.error);
				throw commissionResult.error;
			}
			if (taskProgressResult.error) {
				console.error('Task Progress Web: Task progress update error:', taskProgressResult.error);
				throw taskProgressResult.error;
			}

			// Show success modal first, then rating modal on OK
			setApprovalConfirmationVisible(false);
			setSuccessModalVisible(true);

			// Send approval notification to runner (client-side; no DB dependency)
			const approvalNotification = {
				id: `approval_${Date.now()}`,
				commissionId: Number(commission.id),
				commissionTitle: commission.title || 'Untitled Commission',
				callerName: callerName,
				callerId: commission.buddycaller_id || '',
				runnerId: runner.id,
				timestamp: new Date().toISOString()
			};

			console.log('Task Progress Web: About to send approval notification:', approvalNotification);
			console.log('Task Progress Web: Global approval listeners count before sending:', globalNotificationService.getApprovalListenersCount());
			console.log('Task Progress Web: approvalModalService available:', !!approvalModalService);
			console.log('Task Progress Web: Simple approval listeners count before sending:', approvalModalService.getListenerCount());
			
			// Send notification through both services for redundancy
			globalNotificationService.notifyTaskApproval(approvalNotification);
			approvalModalService.notifyApproval(approvalNotification);

			// NEW: Direct realtime broadcast (runner-specific channel, no DB)
			try {
				const channelName = `task_approvals_${runner.id}`;
				console.log('Task Progress Web: Broadcasting approval on channel:', channelName);
				supabase
					.channel(channelName)
					.send({ type: 'broadcast', event: 'task_approval', payload: approvalNotification });
			} catch (e) {
				console.warn('Task Progress Web: Failed to broadcast approval:', e);
			}
			console.log('Task Progress Web: Approval notification sent to both services');
			console.log('Task Progress Web: Simple approval listeners count after sending:', approvalModalService.getListenerCount());
			
			// Add a small delay to ensure the notification is processed
			setTimeout(() => {
				console.log('Task Progress Web: Checking if notification was received after delay');
			}, 100);
		} catch (error) {
			console.error("Approval error:", error);
			Alert.alert("Error", "Failed to approve task");
		} finally {
			setApproving(false);
		}
	};


	const handleMakeComment = () => {
		setRevisionModalVisible(true);
	};

	// Link upload handlers
	const handleTextboxPress = () => {
		setShowUploadTypeModal(true);
	};

	const handleUploadTypeSelection = (type: 'file' | 'link') => {
		setUploadType(type);
		setShowUploadTypeModal(false);
		if (type === 'link') {
			// Focus on link input after modal closes
			setTimeout(() => {
				// Link input will be focused automatically when rendered
			}, 100);
		}
	};

	const handleCloseUploadTypeModal = () => {
		setShowUploadTypeModal(false);
	};

	const handleLinkInputChange = (text: string) => {
		setLinkInput(text);
	};

	const handleLinkUpload = async () => {
		if (!linkInput.trim()) {
			Alert.alert("Error", "Please enter a valid link.");
			return;
		}

		if (!commission?.id) {
			Alert.alert("Error", "Commission ID not found.");
			return;
		}

		setIsUploading(true);
		try {
			// Add the link to selected files
			const linkFile = {
				id: `link-${Date.now()}`,
				url: linkInput.trim(),
				name: linkInput.trim(),
				type: "link",
				size: 0,
				uploadedAt: new Date().toISOString()
			};

			setSelectedFiles(prev => [...prev, linkFile]);
			
			// Reset link input and upload type
			setLinkInput("");
			setUploadType(null);
			
			Alert.alert("Success", "Link added successfully!");
		} catch (error) {
			console.error("Link upload error:", error);
			Alert.alert("Error", "Failed to add link. Please try again.");
		} finally {
			setIsUploading(false);
		}
	};

	// File upload handlers
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [selectedFiles, setSelectedFiles] = useState<Array<{
		id: string;
		url: string;
		name: string;
		type: string;
		size?: number;
		uploadedAt: string;
	}>>([]);

	const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const files = event.target.files;
		if (files && files.length > 0) {
			const newFiles = Array.from(files).map(file => ({
				id: `file-${Date.now()}-${Math.random()}`,
				url: URL.createObjectURL(file),
				name: file.name,
				type: file.type || "unknown",
				size: file.size,
				uploadedAt: new Date().toISOString()
			}));
			setSelectedFiles(prev => [...prev, ...newFiles]);
		}
	};

	const handleRemoveSelectedFile = (index: number) => {
		setSelectedFiles(prev => prev.filter((_, i) => i !== index));
	};

	const handleUploadFile = async () => {
		if (selectedFiles.length === 0) {
			Alert.alert("Error", "No files selected.");
			return;
		}

		if (!commission?.id) {
			Alert.alert("Error", "Commission ID not found.");
			return;
		}

		setIsUploading(true);
		try {
			// Here you would implement the actual file upload logic
			// For now, just simulate success
			Alert.alert("Success", "Files uploaded successfully!");
			setSelectedFiles([]);
			setUploadType(null);
		} catch (error) {
			console.error("File upload error:", error);
			Alert.alert("Error", "Failed to upload files. Please try again.");
		} finally {
			setIsUploading(false);
		}
	};

	const handleSubmitRevision = async () => {
		console.log("handleSubmitRevision called");
		console.log("revisionComment:", revisionComment);
		console.log("selectedFilesForRevision:", selectedFilesForRevision);
		console.log("id:", id);
		
		if (!revisionComment.trim()) {
			setErrorMessage("Please enter revision comments.");
			setShowErrorModal(true);
			return;
		}

		if (selectedFilesForRevision.length === 0) {
			setErrorMessage("Please select at least one file for revision.");
			setShowErrorModal(true);
			return;
		}

		try {
			setIsUpdating(true);
			console.log("Starting revision submission...");
			
			// Update task_progress status to "revision" - preserve original files
			const { error } = await supabase
				.from('task_progress')
				.update({
					status: 'revision',
					revision_notes: revisionComment,
					revision_requested_at: new Date().toISOString(),
					revision_count: (revisionCount || 0) + 1,
					selected_files_for_revision: JSON.stringify(selectedFilesForRevision.map(url => {
						const										file = uploadedFiles.find(f => f.url === url);
						return {
							url: url,
							name: file?.name || url.split('/').pop()?.split('?')[0] || 'Unknown file'
						};
					}))
					// Note: We don't update file_url, file_name, file_type, file_size, or file_uploaded
					// This preserves the original uploaded files so they remain visible to the runner
				})
				.eq('commission_id', id);

			console.log("Database update result:", { error });

			if (error) {
				console.error("Database error:", error);
				throw error;
			}

			console.log("Revision submitted successfully");
			Alert.alert("Success", "Revision request sent successfully!");
			setRevisionModalVisible(false);
			setRevisionComment("");
			// Don't clear selectedFilesForRevision - keep indicators visible until revision is resolved
			
			// Refresh data
			fetchData();
		} catch (error: any) {
			console.error('Error submitting revision:', error);
			setErrorMessage(`Failed to submit revision request: ${error.message || error}`);
			setShowErrorModal(true);
		} finally {
			setIsUpdating(false);
		}
	};


	const { fullName, roleLabel, profilePictureUrl } = useAuthProfile();

	if (loading) {
		return (
			<SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
				<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
					<Text style={{ color: colors.text, fontSize: 16 }}>Loading...</Text>
				</View>
			</SafeAreaView>
		);
	}

	if (!commission || !runner) {
		return (
			<SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
				<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
					<Text style={{ color: colors.text, fontSize: 16 }}>Commission not found</Text>
					<TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
						<Text style={{ color: colors.maroon, fontSize: 14 }}>Go Back</Text>
					</TouchableOpacity>
				</View>
			</SafeAreaView>
		);
	}

	const runnerName = `${runner.first_name || ""} ${runner.last_name || ""}`.trim() || "BuddyRunner";
	const runnerInfo = [runner.course, runner.student_id_number].filter(Boolean).join(" • ") || "No info";

	return (
		<SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
			<View style={{ flex: 1, flexDirection: "row", position: "relative" }}>
				{/* Overlay backdrop for small screens when sidebar is open */}
				{isSmallScreen && open && (
					<TouchableOpacity
						style={web.sidebarOverlay}
						activeOpacity={1}
						onPress={() => setOpen(false)}
					/>
				)}
				<Sidebar
					open={open}
					isSmallScreen={isSmallScreen}
					onToggle={() => setOpen(!open)}
					onLogout={() => { supabase.auth.signOut(); router.replace("/login"); }}
					userName={fullName}
					userRole={roleLabel || "BuddyCaller"}
					profilePictureUrl={profilePictureUrl}
				/>

				<View style={web.mainArea}>
					<View style={[
						web.topBar,
						isSmallScreen && web.topBarSmall,
						{
							height: isSmallContent ? 70 : 90,
							paddingHorizontal: isSmallContent ? 12 : 16
						}
					]}>
						{isSmallScreen ? (
							<>
								{/* Left side: Hamburger menu and back button together */}
								<View style={web.leftButtonsContainer}>
									<TouchableOpacity
										onPress={() => setOpen(true)}
										style={web.hamburgerBtn}
										activeOpacity={0.7}
									>
										<Ionicons name="menu-outline" size={24} color={colors.text} />
									</TouchableOpacity>
									<TouchableOpacity 
										onPress={() => router.back()} 
										style={[
											web.backButton,
											web.backButtonSmall
										]}
									>
										<Ionicons name="arrow-back" size={18} color={colors.text} />
									</TouchableOpacity>
								</View>
								{/* Center: Task Progress text */}
								<Text style={[
									web.welcome,
									web.welcomeSmall,
									web.welcomeCentered
								]}>Task Progress</Text>
								{/* Right side: Notification icon */}
								<TouchableOpacity
									onPress={() => router.push("/buddycaller/notification")}
									style={[
										web.notificationIcon,
										{ padding: 6 }
									]}
									activeOpacity={0.9}
								>
									<Ionicons name="notifications-outline" size={20} color={colors.text} />
								</TouchableOpacity>
							</>
						) : (
							<>
						<TouchableOpacity 
							onPress={() => router.push("/buddycaller/my_request_commission_web")} 
							style={[
								web.backButton,
								{
									paddingVertical: isSmallContent ? 6 : 8,
									paddingHorizontal: isSmallContent ? 10 : 12
								}
							]}
						>
							<Ionicons name="arrow-back" size={isSmallContent ? 18 : 20} color={colors.text} />
							<Text style={[
								web.backText,
								{ fontSize: isSmallContent ? 13 : 14 }
							]}>Back</Text>
						</TouchableOpacity>
						<Text style={[
							web.welcome,
							{ fontSize: isSmallContent ? 16 : isMediumContent ? 17 : 18 }
						]}>Task Progress</Text>
						<TouchableOpacity
							onPress={() => router.push("/buddycaller/notification")}
							style={[
								web.notificationIcon,
								{ padding: isSmallContent ? 6 : 8 }
							]}
							activeOpacity={0.9}
						>
							<Ionicons name="notifications-outline" size={isSmallContent ? 20 : 24} color={colors.text} />
						</TouchableOpacity>
							</>
						)}
					</View>

					<ScrollView contentContainerStyle={{ paddingVertical: isSmallContent ? 16 : 24, paddingHorizontal: isSmallContent ? 12 : 0 }}>
						<View style={[
							web.container, 
							{ 
								maxWidth: isSmallContent ? '100%' : isMediumContent ? '95%' : 980,
								paddingHorizontal: isSmallContent ? 12 : 8
							}
						]}>
							{/* Runner Profile Card */}
							<View style={[
								web.profileCard,
								{
									padding: isSmallContent ? 16 : isMediumContent ? 18 : 20,
									marginBottom: isSmallContent ? 16 : 24
								}
							]}>
								<View style={web.profileHeader}>
									<View style={[
										web.profileImage,
										{
											width: isSmallContent ? 50 : isMediumContent ? 55 : 60,
											height: isSmallContent ? 50 : isMediumContent ? 55 : 60,
											borderRadius: isSmallContent ? 25 : isMediumContent ? 27.5 : 30,
											marginRight: isSmallContent ? 12 : 16
										}
									]}>
										{runner.profile_picture_url ? (
											<Image source={{ uri: runner.profile_picture_url }} style={{
												width: isSmallContent ? 50 : isMediumContent ? 55 : 60,
												height: isSmallContent ? 50 : isMediumContent ? 55 : 60,
												borderRadius: isSmallContent ? 25 : isMediumContent ? 27.5 : 30,
												overflow: "hidden",
											}} />
										) : (
											<Ionicons name="person" size={isSmallContent ? 20 : isMediumContent ? 22 : 24} color={colors.maroon} />
										)}
									</View>
									<View style={web.runnerInfo}>
										<Text style={[
											web.runnerName,
											{ fontSize: isSmallContent ? 16 : isMediumContent ? 17 : 18 }
										]}>{runnerName}</Text>
										<Text style={[
											web.runnerDetails,
											{ fontSize: isSmallContent ? 12 : 14 }
										]}>{runnerInfo}</Text>
										<Text style={[
											web.runnerRole,
											{ fontSize: isSmallContent ? 12 : 14 }
										]}>BuddyRunner</Text>
									</View>
									<TouchableOpacity 
										style={[
											web.chatButton,
											{
												width: isSmallContent ? 38 : 44,
												height: isSmallContent ? 38 : 44,
												borderRadius: isSmallContent ? 19 : 22
											}
										]}
										onPress={() => router.push({
											pathname: "/buddycaller/start_conversation",
											params: { otherUserId: runner.id }
										})}
									>
										<Ionicons name="chatbubbles" size={isSmallContent ? 18 : 20} color={colors.maroon} />
									</TouchableOpacity>
								</View>
								<TouchableOpacity 
									style={[
										web.viewProfileButton,
										{
											paddingVertical: isSmallContent ? 8 : 10,
											paddingHorizontal: isSmallContent ? 16 : 20
										}
									]}
									onPress={() => router.push({
										pathname: "/buddyrunner/profile",
										params: { 
											userId: runner.id,
											isViewingOtherUser: 'true',
											returnTo: 'BuddyCallerTaskProgress'
										}
									})}
								>
									<Text style={[
										web.viewProfileText,
										{ fontSize: isSmallContent ? 13 : 14 }
									]}>View Profile</Text>
								</TouchableOpacity>
							</View>

							{/* Task Progress Card */}
							<View style={[
								web.taskCard,
								{
									padding: isSmallContent ? 16 : isMediumContent ? 20 : 24,
									marginBottom: isSmallContent ? 16 : 24
								}
							]}>
								<View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
									<View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
										<Text style={[
											web.taskTitle,
											{ 
												fontSize: isSmallContent ? 16 : isMediumContent ? 17 : 18,
												marginBottom: isSmallContent ? 16 : 20
											}
										]}>Task Progress</Text>
										{isUpdating && (
											<View style={web.updatingIndicator}>
												<Text style={web.updatingText}>Updating...</Text>
											</View>
										)}
									</View>
									<TouchableOpacity 
										onPress={() => fetchData()} 
										style={[
											web.refreshButton,
											{ padding: isSmallContent ? 8 : 10 }
										]}
										disabled={loading || isUpdating}
									>
										<Ionicons 
											name="refresh" 
											size={isSmallContent ? 18 : 22} 
											color={loading || isUpdating ? "#999" : colors.maroon} 
										/>
									</TouchableOpacity>
								</View>
								
								{/* Progress Steps */}
								<View style={[
									web.progressContainer,
									{ marginBottom: isSmallContent ? 10 : 12 }
								]}>
									{getProgressSteps().map((step, index) => (
										<React.Fragment key={step.key}>
											<View style={[
												web.progressStep,
												{
													width: isSmallContent ? 28 : isMediumContent ? 30 : 32,
													height: isSmallContent ? 28 : isMediumContent ? 30 : 32,
													borderRadius: isSmallContent ? 14 : isMediumContent ? 15 : 16
												},
												step.completed && web.progressStepCompleted,
												step.active && web.progressStepActive
											]}>
												{step.completed ? (
													<Ionicons name="checkmark" size={isSmallContent ? 16 : 18} color="#fff" />
												) : step.active ? (
													<Ionicons name="ellipse" size={isSmallContent ? 12 : 14} color="#fff" />
												) : (
													<View style={[
														web.progressStepDot,
														{
															width: isSmallContent ? 10 : 12,
															height: isSmallContent ? 10 : 12,
															borderRadius: isSmallContent ? 5 : 6
														}
													]} />
												)}
											</View>
											{index < getProgressSteps().length - 1 && (
												<View style={[
													web.progressLine,
													{
														height: isSmallContent ? 2 : 3,
														marginHorizontal: isSmallContent ? 8 : 12
													},
													step.completed && web.progressLineCompleted,
													step.active && web.progressLineActive
												]} />
											)}
										</React.Fragment>
									))}
								</View>
								<View style={[
									web.progressLabels,
									{ marginBottom: isSmallContent ? 16 : 20 }
								]}>
									{getProgressSteps().map((step, index) => (
										<Text key={step.key} style={[
											web.progressLabel,
											{
												fontSize: isSmallContent ? 10 : isMediumContent ? 11 : 12
											},
											index === 0 && web.progressLabelLeft, // Requested - move left
											index === 1 && web.progressLabelLeft, // Accepted - move left
											index === 3 && web.progressLabelRight, // Revision - move right
											index === 4 && web.progressLabelRight, // Completed - move right
										]}>{step.label}</Text>
									))}
								</View>
							</View>

							{/* Task Details Card */}
							<View style={[
								web.taskDetailsCard,
								{
									padding: isSmallContent ? 16 : isMediumContent ? 18 : 20,
									marginTop: isSmallContent ? 16 : 24,
									marginBottom: isSmallContent ? 16 : 24
								}
							]}>
								<View style={[
									web.taskDetailsHeader,
									{ marginBottom: isSmallContent ? 16 : 20 }
								]}>
									<View style={[
										web.taskDetailsIcon,
										{
											width: isSmallContent ? 40 : isMediumContent ? 44 : 48,
											height: isSmallContent ? 40 : isMediumContent ? 44 : 48,
											borderRadius: isSmallContent ? 20 : isMediumContent ? 22 : 24,
											marginRight: isSmallContent ? 12 : 16
										}
									]}>
										<Ionicons name="briefcase" size={isSmallContent ? 20 : isMediumContent ? 22 : 24} color={colors.maroon} />
									</View>
									<Text style={[
										web.taskDetailsTitle,
										{ fontSize: isSmallContent ? 16 : isMediumContent ? 17 : 18 }
									]}>Task Details</Text>
								</View>
								
								<View style={web.taskDetailsContent}>
									<View style={web.taskDetailRow}>
										<Text style={[
											web.taskDetailLabel,
											{ fontSize: isSmallContent ? 13 : 14 }
										]}>Commission Title:</Text>
										<Text style={[
											web.taskDetailValue,
											{ fontSize: isSmallContent ? 14 : 16 }
										]}>{commission.title || "N/A"}</Text>
									</View>

									<View style={web.taskDetailRow}>
										<Text style={[
											web.taskDetailLabel,
											{ fontSize: isSmallContent ? 13 : 14 }
										]}>Type:</Text>
										<Text style={[
											web.taskDetailValue,
											{ fontSize: isSmallContent ? 14 : 16 }
										]}>{commission.commission_type || "N/A"}</Text>
									</View>

									<View style={web.taskDetailRow}>
										<Text style={[
											web.taskDetailLabel,
											{ fontSize: isSmallContent ? 13 : 14 }
										]}>Meetup Location:</Text>
										<Text style={[
											web.taskDetailValue,
											{ fontSize: isSmallContent ? 14 : 16 }
										]}>—</Text>
									</View>

									<View style={web.taskDetailRow}>
										<Text style={[
											web.taskDetailLabel,
											{ fontSize: isSmallContent ? 13 : 14 }
										]}>Due At:</Text>
										<Text style={[
											web.taskDetailValue,
											{ fontSize: isSmallContent ? 14 : 16 }
										]}>
											{commission.due_at ? new Date(commission.due_at).toLocaleString() : "N/A"}
										</Text>
									</View>

									<View style={web.taskDetailDivider} />

									<View style={web.taskDetailRow}>
										<Text style={[
											web.taskDetailLabel,
											{ fontSize: isSmallContent ? 13 : 14 }
										]}>Commission Description:</Text>
										<Text style={[
											web.taskDetailValue,
											{ fontSize: isSmallContent ? 14 : 16 }
										]}>{commission.description || "No description provided"}</Text>
									</View>

									{/* Invoice Breakdown Section */}
									{invoiceAmount !== null && (
										<>
											<View style={web.taskDetailDivider} />
											<View style={web.invoiceBreakdownSection}>
												<Text style={[
													web.invoiceBreakdownTitle,
													{ fontSize: isSmallContent ? 14 : 16 }
												]}>Invoice Details:</Text>
												{(() => {
													// Reverse calculate subtotal from total
													// Total = Subtotal × 1.22 (where 1.22 = 1 + 0.12 VAT + 0.10 Service Fee)
													const total = invoiceAmount;
													const subtotal = total / 1.22;
													const vatDeduction = subtotal * 0.12;
													const serviceFee = subtotal * 0.10;
													const totalServiceFee = vatDeduction + serviceFee;
													
													return (
														<View style={web.invoiceBreakdownContainer}>
															<View style={web.invoiceBreakdownRow}>
																<Text style={[
																	web.invoiceBreakdownLabel,
																	{ fontSize: isSmallContent ? 14 : 16 }
																]}>Subtotal:</Text>
																<Text style={[
																	web.invoiceBreakdownValue,
																	{ fontSize: isSmallContent ? 14 : 16 }
																]}>₱{subtotal.toFixed(2)}</Text>
															</View>
															<View style={web.invoiceBreakdownRow}>
																<Text style={[
																	web.invoiceBreakdownLabel,
																	{ fontSize: isSmallContent ? 14 : 16 }
																]}>Service Fee:</Text>
																<Text style={[
																	web.invoiceBreakdownValue,
																	{ fontSize: isSmallContent ? 14 : 16 }
																]}>₱{totalServiceFee.toFixed(2)}</Text>
															</View>
															<View style={[web.invoiceBreakdownRow, web.invoiceBreakdownTotalRow]}>
																<Text style={[
																	web.invoiceBreakdownTotalLabel,
																	{ fontSize: isSmallContent ? 15 : 17 }
																]}>Total:</Text>
																<Text style={[
																	web.invoiceBreakdownTotalValue,
																	{ fontSize: isSmallContent ? 15 : 17 }
																]}>₱{total.toFixed(2)}</Text>
															</View>
														</View>
													);
												})()}
											</View>
										</>
									)}
								</View>
							</View>

							{/* Uploaded File Card */}
							<View style={[
								web.uploadedFileCard,
								{
									padding: isSmallContent ? 16 : isMediumContent ? 18 : 20,
									marginBottom: isSmallContent ? 16 : 24
								}
							]}>
								<View style={web.uploadedFileHeader}>
									<Text style={[
										web.uploadedFileTitle,
										{ fontSize: isSmallContent ? 16 : isMediumContent ? 17 : 18 }
									]}>Uploaded Files:</Text>
								</View>
								{/* Show Original Files */}
								{uploadedFiles.length > 0 && (
									<View style={web.filesList}>
										<Text style={[
											web.sectionSubtitle,
											{ fontSize: isSmallContent ? 12 : 14 }
										]}>Original Files:</Text>
										{uploadedFiles.map((file, index) => (
											<TouchableOpacity 
												key={file.id} 
												style={[
													web.fileContainer,
													selectedFilesForRevision.includes(file.url) && web.selectedFileContainer
												]}
												onPress={() => handleViewFile(file.url)}
											>
												<View style={web.fileInfo}>
													<Ionicons 
														name={file.type === "link" ? "link" : "document"} 
														size={isSmallContent ? 20 : 24} 
														color={selectedFilesForRevision.includes(file.url) ? "#fff" : colors.maroon} 
													/>
													<Text style={[
														web.fileName,
														selectedFilesForRevision.includes(file.url) && web.selectedFileName,
														{ fontSize: isSmallContent ? 13 : 14 }
													]} numberOfLines={1}>
														{file.name}
													</Text>
													{selectedFilesForRevision.includes(file.url) && (
														<View style={web.selectedIndicator}>
															<Ionicons name="checkmark-circle" size={isSmallContent ? 16 : 18} color="#fff" />
															<Text style={[
																web.selectedIndicatorText,
																{ fontSize: isSmallContent ? 12 : 14 }
															]}>Selected for Revision</Text>
														</View>
													)}
												</View>
												<TouchableOpacity 
													style={[
														web.viewButton,
														selectedFilesForRevision.includes(file.url) && web.selectedViewButton
													]}
													onPress={() => handleViewFile(file.url)}
												>
													<Text style={[
														web.viewButtonText,
														selectedFilesForRevision.includes(file.url) && web.selectedViewButtonText,
														{ fontSize: isSmallContent ? 12 : 14 }
													]}>View</Text>
												</TouchableOpacity>
											</TouchableOpacity>
										))}
									</View>
								)}

								{/* Show Revised Files */}
								{revisedFiles.length > 0 && (
									<View style={web.filesList}>
										<Text style={[
											web.sectionSubtitle, 
											web.revisedSectionSubtitle,
											{ fontSize: isSmallContent ? 12 : 14 }
										]}>Revised Files:</Text>
										{revisedFiles.map((file, index) => (
											<TouchableOpacity 
												key={file.id} 
												style={[web.fileContainer, web.revisedFileContainer]}
												onPress={() => handleViewFile(file.url)}
											>
												<View style={web.fileInfo}>
													<Ionicons 
														name={file.type === "link" ? "link" : "document"} 
														size={isSmallContent ? 20 : 24} 
														color="#22c55e" 
													/>
													<View style={web.fileNameContainer}>
														<Text style={[
															web.fileName, 
															web.revisedFileName,
															{ fontSize: isSmallContent ? 13 : 14 }
														]} numberOfLines={1}>
															{file.name}
														</Text>
														<View style={web.revisionFileBadge}>
															<Ionicons name="refresh" size={isSmallContent ? 12 : 14} color="#22c55e" />
															<Text style={[
																web.revisionFileBadgeText,
																{ fontSize: isSmallContent ? 11 : 12 }
															]}>Revised</Text>
														</View>
													</View>
												</View>
												<TouchableOpacity 
													style={[web.viewButton, web.revisedViewButton]}
													onPress={() => handleViewFile(file.url)}
												>
													<Text style={[
														web.viewButtonText, 
														web.revisedViewButtonText,
														{ fontSize: isSmallContent ? 12 : 14 }
													]}>View</Text>
												</TouchableOpacity>
											</TouchableOpacity>
										))}
									</View>
								)}


								{/* No Files Message */}
								{uploadedFiles.length === 0 && revisedFiles.length === 0 && (
									<View style={web.noFileContainer}>
										<Text style={web.noFileText}>No files uploaded yet</Text>
									</View>
								)}

								{/* File Upload Section */}
								{uploadedFiles.length === 0 && revisedFiles.length === 0 && (
									<View style={web.uploadSection}>
										{/* Hidden File Input */}
										<input
											type="file"
											ref={fileInputRef}
											onChange={handleFileChange}
											style={{ display: "none" }}
											accept="*/*" // Allow all file types including images and videos
											multiple // Allow multiple file selection
										/>


										{/* Link Input - Show when link upload is selected */}
										{uploadType === 'link' && (
											<View style={web.linkInputContainer}>
												<Text style={web.linkInputLabel}>Enter Link:</Text>
												<TextInput
													style={web.linkInput}
													value={linkInput}
													onChangeText={handleLinkInputChange}
													placeholder="https://example.com"
													placeholderTextColor="#999"
													keyboardType="url"
													autoCapitalize="none"
													autoCorrect={false}
												/>
												<View style={web.linkButtonContainer}>
													<TouchableOpacity 
														style={web.linkCancelButton}
														onPress={() => {
															setUploadType(null);
															setLinkInput("");
														}}
													>
														<Text style={web.linkCancelButtonText}>Cancel</Text>
													</TouchableOpacity>
													<TouchableOpacity 
														style={web.linkSubmitButton}
														onPress={handleLinkUpload}
														disabled={!linkInput.trim()}
													>
														<Text style={web.linkSubmitButtonText}>OK</Text>
													</TouchableOpacity>
												</View>
											</View>
										)}

										{/* Selected Files Display */}
										{selectedFiles.length > 0 && (
											<View style={web.selectedFilesContainer}>
												<Text style={web.selectedFilesTitle}>
													Selected Files ({selectedFiles.length}):
												</Text>
												{selectedFiles.map((file, index) => (
													<View key={index} style={web.selectedFileItem}>
														<View style={web.selectedFileInfo}>
															<Ionicons 
																name={file.type === "link" ? "link" : "document"} 
																size={24} 
																color={colors.maroon} 
															/>
															<Text style={web.selectedFileName} numberOfLines={1}>
																{file.name}
															</Text>
														</View>
														<div 
															style={{
																padding: 6,
																borderRadius: 4,
																backgroundColor: "#fff",
																border: "1px solid #dc3545",
																cursor: isUploading ? "not-allowed" : "pointer",
																display: "flex",
																alignItems: "center",
																justifyContent: "center",
																userSelect: "none",
																WebkitUserSelect: "none",
																MozUserSelect: "none",
																msUserSelect: "none",
															}}
															onClick={() => handleRemoveSelectedFile(index)}
														>
															<Ionicons name="close" size={16} color="#dc3545" />
														</div>
													</View>
												))}
											</View>
										)}

										{/* Upload Button - only show when files are selected */}
										{selectedFiles.length > 0 && (
											<View style={web.uploadButtonContainer}>
												<TouchableOpacity 
													style={[
														web.uploadButton, 
														(isUploading || taskStatus === "completed") && web.uploadButtonDisabled,
														{
															paddingVertical: isSmallContent ? 10 : 12,
															paddingHorizontal: isSmallContent ? 20 : 24
														}
													]} 
													onPress={handleUploadFile}
													disabled={isUploading || taskStatus === "completed"}
												>
													{isUploading ? (
														<ActivityIndicator color="#fff" size="small" />
													) : taskStatus === "completed" ? (
														<Text style={[
															web.uploadButtonText,
															{ fontSize: isSmallContent ? 14 : 16 }
														]}>Task Completed</Text>
													) : (
														<Text style={[
															web.uploadButtonText,
															{ fontSize: isSmallContent ? 14 : 16 }
														]}>Upload</Text>
													)}
												</TouchableOpacity>
											</View>
										)}
									</View>
								)}

								{/* Action Buttons */}
								<View style={web.buttonContainer}>
									<TouchableOpacity 
										style={[
											web.approveButton,
											(approving || taskStatus === "completed" || (taskStatus === "revision" && revisedFiles.length === 0)) && web.approveButtonDisabled,
											{
												paddingVertical: isSmallContent ? 12 : 16,
												paddingHorizontal: isSmallContent ? 24 : 32
											}
										]} 
										onPress={handleApprove}
										disabled={approving || taskStatus === "completed" || (taskStatus === "revision" && revisedFiles.length === 0)}
									>
										<Text style={[
											web.approveButtonText,
											{ fontSize: isSmallContent ? 16 : 18 }
										]}>
											{approving ? "Approving..." : 
											 taskStatus === "completed" ? "Approved" : 
											 taskStatus === "revision" && revisedFiles.length === 0 ? "Revision Pending" : 
											 "Approve"}
										</Text>
									</TouchableOpacity>
									
									<TouchableOpacity 
										style={[
											web.commentButton, 
											((taskStatus === "revision" && !revisionCompletedAt) || taskStatus === "completed") && web.commentButtonDisabled,
											{
												paddingVertical: isSmallContent ? 12 : 16,
												paddingHorizontal: isSmallContent ? 24 : 32
											}
										]} 
										onPress={handleMakeComment}
										disabled={(taskStatus === "revision" && !revisionCompletedAt) || taskStatus === "completed"}
									>
										<Text style={[
											web.commentButtonText,
											((taskStatus === "revision" && !revisionCompletedAt) || taskStatus === "completed") && web.commentButtonTextDisabled,
											{ fontSize: isSmallContent ? 16 : 18 }
										]}>
											{taskStatus === "completed" ? "Task Completed" : 
											 taskStatus === "revision" && !revisionCompletedAt ? "Revision Pending" : "Make Changes"}
										</Text>
									</TouchableOpacity>
								</View>
							</View>
						</View>
					</ScrollView>
				</View>
			</View>

			{/* Revision Request Modal - Web Optimized */}
			{revisionModalVisible && (
				<View style={web.modalOverlayWeb}>
					<TouchableWithoutFeedback onPress={() => {
						console.log("Modal overlay pressed - closing modal");
						setRevisionModalVisible(false);
					}}>
						<View style={web.modalOverlayWeb} />
					</TouchableWithoutFeedback>
					
					<TouchableWithoutFeedback onPress={() => {
						console.log("Modal content pressed - preventing close");
					}}>
						<View style={web.modalContainerWeb}>
							<View style={web.modalHeader}>
								<Text style={web.modalTitle}>Request Revision</Text>
								<TouchableOpacity
									onPress={() => {
										console.log("Close button pressed");
										setRevisionModalVisible(false);
										setSelectedFilesForRevision([]);
									}}
									style={web.closeButton}
									activeOpacity={0.7}
								>
									<Ionicons name="close" size={24} color={colors.text} />
								</TouchableOpacity>
							</View>

							<View style={web.modalContent}>
								<Text style={[
									web.sectionLabel,
									{ fontSize: isSmallContent ? 14 : 16 }
								]}>Select files for revision:</Text>
								<ScrollView style={web.fileSelectionContainer} showsVerticalScrollIndicator={false}>
									{uploadedFiles.map((file, index) => (
										<TouchableOpacity
											key={index}
											style={[
												web.fileSelectionItem,
												selectedFilesForRevision.includes(file.url) && web.fileSelectionItemSelected
											]}
											onPress={() => {
												console.log("File selection pressed:", file.name);
												if (selectedFilesForRevision.includes(file.url)) {
													setSelectedFilesForRevision(prev => prev.filter(url => url !== file.url));
												} else {
													setSelectedFilesForRevision(prev => [...prev, file.url]);
												}
											}}
											activeOpacity={0.7}
										>
											<Ionicons 
												name={file.type === "link" ? "link" : "document"} 
												size={20} 
												color={selectedFilesForRevision.includes(file.url) ? "#fff" : colors.maroon} 
											/>
											<Text style={[
												web.fileSelectionText,
												selectedFilesForRevision.includes(file.url) && web.fileSelectionTextSelected
											]}>
												{file.name}
											</Text>
											{selectedFilesForRevision.includes(file.url) && (
												<Ionicons name="checkmark" size={16} color="#fff" />
											)}
										</TouchableOpacity>
									))}
								</ScrollView>

								<Text style={[
									web.sectionLabel,
									{ fontSize: isSmallContent ? 14 : 16 }
								]}>Revision comments:</Text>
								<TextInput
									style={[
										web.commentInput,
										{ fontSize: isSmallContent ? 13 : 14 }
									]}
									placeholder="Describe what needs to be changed..."
									value={revisionComment}
									onChangeText={setRevisionComment}
									multiline
									numberOfLines={4}
									textAlignVertical="top"
								/>
							</View>

							<View style={web.modalActions}>
								<TouchableOpacity
									style={[
										web.cancelButton,
										{
											paddingVertical: isSmallContent ? 12 : 16,
											paddingHorizontal: isSmallContent ? 24 : 32
										}
									]}
									onPress={() => {
										console.log("Cancel button pressed");
										setRevisionModalVisible(false);
										setSelectedFilesForRevision([]);
									}}
									activeOpacity={0.7}
								>
									<Text style={[
										web.cancelButtonText,
										{ fontSize: isSmallContent ? 14 : 16 }
									]}>Cancel</Text>
								</TouchableOpacity>
								<TouchableOpacity
									style={[
										web.submitButton, 
										isUpdating && web.submitButtonDisabled,
										{
											paddingVertical: isSmallContent ? 12 : 16,
											paddingHorizontal: isSmallContent ? 24 : 32
										}
									]}
									onPress={() => {
										console.log("Submit button pressed - isUpdating:", isUpdating);
										if (!isUpdating) {
											handleSubmitRevision();
										}
									}}
									disabled={isUpdating}
									activeOpacity={0.7}
								>
									<Text style={[
										web.submitButtonText,
										{ fontSize: isSmallContent ? 14 : 16 }
									]}>
										{isUpdating ? "Submitting..." : "Submit Revision"}
									</Text>
								</TouchableOpacity>
							</View>
						</View>
					</TouchableWithoutFeedback>
				</View>
			)}

			{/* Custom Error Modal */}
			<Modal
				visible={showErrorModal}
				transparent
				animationType="fade"
				onRequestClose={() => setShowErrorModal(false)}
			>
				<View style={web.errorModalOverlay}>
					<View style={web.errorModalContainer}>
						<Text style={web.errorModalTitle}>Error</Text>
						<Text style={web.errorModalMessage}>{errorMessage}</Text>
						<TouchableOpacity
							style={web.errorModalButton}
							onPress={() => setShowErrorModal(false)}
						>
							<Text style={web.errorModalButtonText}>OK</Text>
						</TouchableOpacity>
					</View>
				</View>
			</Modal>

			{/* File Viewer Modal */}
			{selectedFile && (
				<FileViewer
					visible={fileViewerVisible}
					onClose={() => {
						setFileViewerVisible(false);
						setSelectedFile(null);
					}}
					fileUrl={selectedFile.url}
					fileName={selectedFile.name}
					fileType={selectedFile.type}
				/>
			)}

			{/* Approval Confirmation Modal */}
			<TaskApprovalConfirmationModalWeb
				visible={approvalConfirmationVisible}
				onClose={() => setApprovalConfirmationVisible(false)}
				onConfirm={handleConfirmApproval}
				taskTitle={commission?.title || ""}
				isApproving={approving}
			/>

			{/* Success Modal */}
			{successModalVisible && (
				<View style={web.modalOverlayWeb}>
					<TouchableWithoutFeedback onPress={() => setSuccessModalVisible(false)}>
						<View style={web.modalOverlayWeb} />
					</TouchableWithoutFeedback>
					
					<TouchableWithoutFeedback onPress={() => {
						// Prevent modal from closing when clicking inside
					}}>
						<View style={web.successModalContainer}>
							<View style={web.successModalHeader}>
								<Text style={web.successModalTitle}>Success</Text>
							</View>
							
							<View style={web.successModalContent}>
								<Text style={web.successModalMessage}>Task approved successfully!</Text>
							</View>

							<View style={web.successModalButtonContainer}>
								<TouchableOpacity 
									style={web.successModalButton} 
									onPress={() => {
										setSuccessModalVisible(false);
										setRatingModalVisible(true);
									}}
									activeOpacity={0.8}
								>
									<Text style={web.successModalButtonText}>OK</Text>
								</TouchableOpacity>
							</View>
						</View>
					</TouchableWithoutFeedback>
				</View>
			)}

			{/* Rate and Feedback Modal */}
			<CallerRateAndFeedbackModalWeb
				visible={ratingModalVisible}
				onClose={() => {
					setRatingModalVisible(false);
					// Only redirect to home if not already there (web only)
					if (Platform.OS === 'web' && typeof window !== 'undefined') {
						const currentPath = window.location.pathname;
						if (currentPath !== '/buddycaller/home') {
							router.replace("/buddycaller/home");
						}
					}
				}}
				onSubmit={() => {
					setRatingModalVisible(false);
					// Only redirect to home if not already there (web only)
					if (Platform.OS === 'web' && typeof window !== 'undefined') {
						const currentPath = window.location.pathname;
						if (currentPath !== '/buddycaller/home') {
							router.replace("/buddycaller/home");
						}
					}
				}}
				taskTitle={commission?.title || ""}
				runnerName={runner ? `${runner.first_name} ${runner.last_name}`.trim() : "Runner"}
				commissionId={commission?.id || 0}
				buddyrunnerId={runner?.id || ""}
			/>

			{/* Upload Type Selection Modal */}
			{showUploadTypeModal && (
				<View style={web.modalOverlay}>
					<View style={web.modalContainer}>
						<Text style={web.modalTitle}>
							Upload Type
						</Text>
						<Text style={web.modalSubtitle}>
							Choose how you want to upload your work:
						</Text>
						
						<View style={web.modalOptions}>
							<TouchableOpacity 
								style={web.modalOption}
								onPress={() => handleUploadTypeSelection('file')}
								activeOpacity={0.8}
							>
								<Ionicons name="document" size={24} color={colors.maroon} />
								<View style={web.modalOptionContent}>
									<Text style={web.modalOptionTitle}>Upload Files</Text>
									<Text style={web.modalOptionDescription}>
										Upload documents, images, or other files
									</Text>
								</View>
							</TouchableOpacity>
							
							<TouchableOpacity 
								style={web.modalOption}
								onPress={() => handleUploadTypeSelection('link')}
								activeOpacity={0.8}
							>
								<Ionicons name="link" size={24} color={colors.maroon} />
								<View style={web.modalOptionContent}>
									<Text style={web.modalOptionTitle}>Upload Link</Text>
									<Text style={web.modalOptionDescription}>
										Share a link to your work
									</Text>
								</View>
							</TouchableOpacity>
						</View>
						
						<View style={web.modalFooter}>
							<TouchableOpacity 
								style={web.modalCancelButton}
								onPress={handleCloseUploadTypeModal}
								activeOpacity={0.8}
							>
								<Text style={web.modalCancelButtonText}>Cancel</Text>
							</TouchableOpacity>
						</View>
					</View>
				</View>
			)}

		</SafeAreaView>
	);
}

/* ======================= SIDEBAR (WEB) ======================= */
function Sidebar({ open, isSmallScreen, onToggle, onLogout, userName, userRole, profilePictureUrl }: { open: boolean; isSmallScreen: boolean; onToggle: () => void; onLogout: () => void; userName: string; userRole: string; profilePictureUrl?: string | null; }) {
	const router = useRouter();
	
	// On small screens, sidebar should be hidden (off-screen) when closed, visible when open
	// On larger screens, sidebar should be visible (collapsed or expanded)
	const sidebarStyle = isSmallScreen
		? [
				web.sidebar,
				web.sidebarSmallScreen,
				{
					transform: [{ translateX: open ? 0 : -260 }],
					width: 260,
				},
			]
		: [web.sidebar, { width: open ? 260 : 74 }];
	
	return (
		<View style={sidebarStyle}>
			<View style={{ paddingHorizontal: open ? 12 : 6, paddingVertical: 12 }}>
				<View
					style={{
						flexDirection: "row",
						alignItems: "center",
						gap: open ? 10 : 0,
						justifyContent: open ? "flex-start" : "center",
					}}
				>
					<TouchableOpacity onPress={onToggle} style={[web.sideMenuBtn, !open && { marginRight: 0 }]}>
						<Ionicons name="menu-outline" size={20} color={colors.text} />
					</TouchableOpacity>
					{open && (
						<>
							<Image source={require("../../assets/images/logo.png")} style={{ width: 22, height: 22, resizeMode: "contain" }} />
							<Text style={web.brand}>GoBuddy</Text>
						</>
					)}
				</View>
			</View>

			<View style={{ flex: 1, justifyContent: "space-between" }}>
				<View style={{ paddingTop: 8 }}>
					<SideItem label="Home" icon="home-outline" open={open} onPress={() => router.push("/buddycaller/home")} />
					<Separator />
					<SideItem label="Messages" icon="chatbubbles-outline" open={open} onPress={() => router.push("/buddycaller/messages_hub")} />
					<SideItem label="Profile" icon="person-outline" open={open} onPress={() => router.push("/buddycaller/profile")} />
				</View>

				<View style={web.sidebarFooter}>
					<View style={web.userCard}>
						<View style={web.userAvatar}>
							{profilePictureUrl ? (
								<Image
									source={{ uri: profilePictureUrl }}
									style={{ width: 34, height: 34, borderRadius: 17, overflow: "hidden" }}
									resizeMode="cover"
								/>
							) : (
								<Ionicons name="person" size={18} color={colors.maroon} />
							)}
						</View>
						{open && (
							<View style={{ flex: 1 }}>
								<Text style={web.userName}>{userName || "User"}</Text>
								{!!userRole && <Text style={web.userRole}>{userRole}</Text>}
							</View>
						)}
					</View>
					<TouchableOpacity onPress={onLogout} activeOpacity={0.9} style={web.logoutBtn}>
						<Ionicons name="log-out-outline" size={18} color={colors.maroon} />
						{open && <Text style={web.logoutText}>Logout</Text>}
					</TouchableOpacity>
				</View>
			</View>
		</View>
	);
}

function Separator() { return <View style={{ height: 1, backgroundColor: colors.border }} />; }

function SideItem({ label, icon, open, active, onPress }: { label: string; icon: any; open: boolean; active?: boolean; onPress?: () => void; }) {
	return (
		<TouchableOpacity 
			activeOpacity={0.9} 
			onPress={onPress} 
			style={[web.sideItem, active && { backgroundColor: colors.maroon }, !open && web.sideItemCollapsed]}
		> 
			<Ionicons name={icon} size={18} color={active ? "#fff" : colors.text} />
			{open && (
				<Text style={[web.sideItemText, active && { color: "#fff", fontWeight: "700" }]}>{label}</Text>
			)}
		</TouchableOpacity>
	);
}

/* ======================= STYLES (WEB) ======================= */
const web = StyleSheet.create({
	sidebar: { borderRightColor: "#EDE9E8", borderRightWidth: 1, backgroundColor: "#fff" },
	sidebarSmallScreen: {
		position: "absolute",
		left: 0,
		top: 0,
		bottom: 0,
		zIndex: 1000,
		elevation: 1000,
		shadowColor: "#000",
		shadowOffset: { width: 2, height: 0 },
		shadowOpacity: 0.25,
		shadowRadius: 4,
	},
	sidebarOverlay: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: "rgba(0, 0, 0, 0.5)",
		zIndex: 999,
		elevation: 999,
	},
	hamburgerBtn: {
		padding: 8,
		borderRadius: 8,
		backgroundColor: colors.faint,
		marginRight: 8,
	},
	leftButtonsContainer: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	brand: { color: colors.text, fontWeight: "800", fontSize: 16 },
	sideMenuBtn: {
		width: 40,
		height: 40,
		borderRadius: 10,
		backgroundColor: colors.faint,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 10,
	},
	sideItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 14, paddingHorizontal: 16 },
	sideItemCollapsed: { justifyContent: "center", paddingHorizontal: 0 },
	sideItemText: { color: colors.text, fontSize: 14, fontWeight: "600" },
	sidebarFooter: { padding: 12, gap: 10 },
	userCard: { backgroundColor: colors.faint, borderRadius: 10, padding: 10, flexDirection: "row", alignItems: "center", gap: 10 },
	userAvatar: { width: 34, height: 34, borderRadius: 999, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
	userName: { color: colors.text, fontSize: 12, fontWeight: "800" },
	userRole: { color: colors.text, fontSize: 10, opacity: 0.7 },
	logoutBtn: { borderWidth: 1, borderColor: colors.maroon, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#fff" },
	logoutText: { color: colors.maroon, fontWeight: "700" },
	mainArea: { flex: 1, backgroundColor: "#fff" },
	topBar: { height: 90, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#EDE9E8", paddingHorizontal: 16, gap: 16 },
	topBarSmall: { height: 70, paddingHorizontal: 12, gap: 12 },
	notificationIcon: { padding: 8, borderRadius: 8, backgroundColor: colors.faint, position: "relative" },
	backButton: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: colors.faint },
	backButtonSmall: { paddingVertical: 6, paddingHorizontal: 8, gap: 4 },
	backText: { color: colors.text, fontSize: 14, fontWeight: "600" },
	welcome: { color: colors.text, fontSize: 18, fontWeight: "900" },
	welcomeSmall: { fontSize: 16 },
	welcomeCentered: { flex: 1, textAlign: "center" },
	container: { width: "100%", maxWidth: 980, alignSelf: "center", paddingHorizontal: 8 },
	profileCard: {
		backgroundColor: "#fff",
		borderRadius: 12,
		padding: 20,
		marginBottom: 24,
		borderWidth: 1,
		borderColor: colors.border,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	profileHeader: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 16,
	},
	profileImage: {
		width: 60,
		height: 60,
		borderRadius: 30,
		backgroundColor: colors.faint,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 16,
	},
	runnerInfo: {
		flex: 1,
	},
	runnerName: {
		fontSize: 18,
		fontWeight: "800",
		color: colors.text,
		marginBottom: 4,
	},
	runnerDetails: {
		fontSize: 14,
		color: colors.text,
		opacity: 0.7,
		marginBottom: 4,
	},
	runnerRole: {
		fontSize: 14,
		color: colors.text,
		opacity: 0.7,
	},
	chatButton: {
		width: 44,
		height: 44,
		borderRadius: 22,
		backgroundColor: colors.faint,
		alignItems: "center",
		justifyContent: "center",
	},
	viewProfileButton: {
		backgroundColor: colors.maroon,
		paddingVertical: 10,
		paddingHorizontal: 20,
		borderRadius: 8,
		alignSelf: "flex-start",
	},
	viewProfileText: {
		color: "#fff",
		fontSize: 14,
		fontWeight: "600",
	},
	taskCard: {
		backgroundColor: "#fff",
		borderRadius: 12,
		padding: 24,
		borderWidth: 1,
		borderColor: colors.border,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	taskTitle: {
		fontSize: 18,
		fontWeight: "800",
		color: colors.text,
		marginBottom: 20,
	},
	updatingIndicator: {
		backgroundColor: "#E3F2FD",
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 14,
		borderWidth: 1,
		borderColor: "#2196F3",
	},
	updatingText: {
		fontSize: 14,
		color: "#2196F3",
		fontWeight: "600",
	},
	refreshButton: {
		padding: 10,
		borderRadius: 22,
		backgroundColor: "#F5F5F5",
	},
	progressContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 12,
	},
	progressStep: {
		width: 32,
		height: 32,
		borderRadius: 16,
		backgroundColor: "#D1D5DB",
		alignItems: "center",
		justifyContent: "center",
	},
	progressStepCompleted: {
		backgroundColor: colors.maroon,
	},
	progressStepActive: {
		backgroundColor: "#F59E0B", // Yellow/orange color for active state
	},
	progressStepDot: {
		width: 12,
		height: 12,
		borderRadius: 6,
		backgroundColor: "#fff",
	},
	progressLine: {
		flex: 1,
		height: 3,
		backgroundColor: "#D1D5DB",
		marginHorizontal: 12,
	},
	progressLineCompleted: {
		backgroundColor: colors.maroon,
	},
	progressLineActive: {
		backgroundColor: "#F59E0B", // Yellow/orange color for active line
	},
	progressLabels: {
		flexDirection: "row",
		justifyContent: "space-between",
		marginBottom: 20,
	},
	progressLabel: {
		fontSize: 12,
		color: colors.text,
		textAlign: "center",
		flex: 1,
		fontWeight: "600",
	},
	progressLabelLeft: {
		textAlign: "left",
		paddingLeft: 4,
	},
	progressLabelRight: {
		textAlign: "right",
		paddingRight: 4,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: "900",
		color: colors.text,
		marginBottom: 16,
	},
	detailContainer: {
		marginBottom: 16,
	},
	detailLabel: {
		backgroundColor: colors.maroon,
		borderRadius: 6,
		paddingHorizontal: 12,
		paddingVertical: 6,
		alignSelf: "flex-start",
		marginBottom: 8,
	},
	detailLabelText: {
		color: "#fff",
		fontSize: 14,
		fontWeight: "700",
	},
	detailText: {
		fontSize: 16,
		color: colors.text,
		lineHeight: 24,
	},
	taskDetailsCard: {
		backgroundColor: "#fff",
		borderRadius: 12,
		padding: 20,
		marginTop: 24,
		marginBottom: 24,
		borderWidth: 1,
		borderColor: colors.border,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	taskDetailsHeader: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 20,
	},
	taskDetailsIcon: {
		width: 48,
		height: 48,
		borderRadius: 24,
		backgroundColor: colors.faint,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 16,
	},
	taskDetailsTitle: {
		fontSize: 18,
		fontWeight: "800",
		color: colors.text,
		marginBottom: 16,
	},
	taskDetailsContent: {
		marginBottom: 0,
	},
	taskDetailRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 12,
	},
	taskDetailLabel: {
		fontSize: 16,
		fontWeight: "600",
		color: colors.maroon,
		flex: 1,
	},
	taskDetailValue: {
		fontSize: 16,
		color: colors.text,
		flex: 2,
		textAlign: "right",
	},
	invoiceBreakdownSection: {
		marginTop: 20,
	},
	invoiceBreakdownTitle: {
		fontSize: 16,
		fontWeight: "600",
		color: colors.maroon,
		marginBottom: 12,
	},
	invoiceBreakdownContainer: {
		backgroundColor: colors.faint,
		borderRadius: 8,
		padding: 16,
		borderWidth: 1,
		borderColor: colors.border,
	},
	invoiceBreakdownRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 10,
	},
	invoiceBreakdownLabel: {
		fontSize: 16,
		fontWeight: "500",
		color: colors.text,
		flex: 1,
	},
	invoiceBreakdownValue: {
		fontSize: 16,
		fontWeight: "600",
		color: colors.text,
		textAlign: "right",
	},
	invoiceBreakdownTotalRow: {
		borderTopWidth: 1,
		borderTopColor: colors.border,
		paddingTop: 10,
		marginTop: 6,
		marginBottom: 0,
	},
	invoiceBreakdownTotalLabel: {
		fontSize: 17,
		fontWeight: "700",
		color: colors.maroon,
		flex: 1,
	},
	invoiceBreakdownTotalValue: {
		fontSize: 17,
		fontWeight: "700",
		color: colors.maroon,
		textAlign: "right",
	},
	taskDetailDivider: {
		height: 1,
		backgroundColor: "#E0E0E0",
		marginVertical: 16,
		marginHorizontal: 0,
	},
	uploadedFileCard: {
		backgroundColor: "#fff",
		borderRadius: 12,
		padding: 20,
		marginBottom: 24,
		borderWidth: 1,
		borderColor: colors.border,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	uploadedFileTitle: {
		fontSize: 18,
		fontWeight: "800",
		color: colors.text,
		marginBottom: 16,
	},
	uploadedFileHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 16,
	},
	revisionIndicator: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#dcfce7",
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 16,
		borderWidth: 1,
		borderColor: "#22c55e",
	},
	revisionIndicatorText: {
		fontSize: 14,
		fontWeight: "600",
		color: "#22c55e",
		marginLeft: 6,
	},
	revisedFileContainer: {
		backgroundColor: "#f0fdf4",
		borderColor: "#22c55e",
		borderWidth: 1,
	},
	fileNameContainer: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
	},
	revisedFileName: {
		color: "#22c55e",
		fontWeight: "600",
	},
	revisionFileBadge: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#dcfce7",
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 12,
		marginLeft: 12,
	},
	revisionFileBadgeText: {
		fontSize: 12,
		fontWeight: "600",
		color: "#22c55e",
		marginLeft: 4,
	},
	revisedViewButton: {
		backgroundColor: "#22c55e",
	},
	revisedViewButtonText: {
		color: "#ffffff",
	},
	filesList: {
		marginBottom: 16,
	},
	fileContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderWidth: 1,
		borderColor: colors.maroon,
		borderRadius: 8,
		padding: 16,
		backgroundColor: "#fff",
		marginBottom: 20,
	},
	fileInfo: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
	},
	fileName: {
		fontSize: 16,
		color: colors.text,
		marginLeft: 12,
		fontWeight: "600",
	},
	viewButton: {
		backgroundColor: colors.maroon,
		borderRadius: 6,
		paddingVertical: 8,
		paddingHorizontal: 16,
	},
	viewButtonText: {
		color: "#fff",
		fontSize: 14,
		fontWeight: "700",
	},
	selectedFileContainer: {
		backgroundColor: "#f59e0b",
		borderColor: "#f59e0b",
	},
	selectedFileName: {
		color: "#fff",
	},
	selectedIndicator: {
		flexDirection: "row",
		alignItems: "center",
		marginTop: 6,
	},
	selectedIndicatorText: {
		color: "#fff",
		fontSize: 14,
		fontWeight: "600",
		marginLeft: 6,
	},
	selectedViewButton: {
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#fff",
	},
	selectedViewButtonText: {
		color: "#f59e0b",
	},
	noFileContainer: {
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: 8,
		padding: 16,
		backgroundColor: "#F9FAFB",
		marginBottom: 20,
		alignItems: "center",
	},
	noFileText: {
		fontSize: 16,
		color: colors.text,
		opacity: 0.7,
	},
	buttonContainer: {
		flexDirection: "row",
		gap: 16,
		marginTop: 12,
	},
	approveButton: {
		backgroundColor: colors.maroon,
		borderRadius: 8,
		paddingVertical: 16,
		paddingHorizontal: 32,
		alignItems: "center",
		justifyContent: "center",
		flex: 1,
	},
	approveButtonDisabled: {
		backgroundColor: "#D1D5DB",
	},
	approveButtonText: {
		color: "#fff",
		fontSize: 18,
		fontWeight: "700",
	},
	commentButton: {
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: colors.maroon,
		borderRadius: 8,
		paddingVertical: 16,
		paddingHorizontal: 32,
		alignItems: "center",
		justifyContent: "center",
		flex: 1,
	},
	commentButtonText: {
		color: colors.maroon,
		fontSize: 18,
		fontWeight: "700",
	},
	commentButtonDisabled: {
		backgroundColor: "#f5f5f5",
		borderColor: "#ccc",
		opacity: 0.6,
	},
	commentButtonTextDisabled: {
		color: "#999",
	},
	// Revision Modal Styles
	modalOverlay: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: "rgba(0, 0, 0, 0.5)",
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
		zIndex: 9999,
	},
	modalOverlayWeb: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: "rgba(0, 0, 0, 0.5)",
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
		zIndex: 9999,
		width: '100%',
		height: '100%',
	},
	modalContainerWeb: {
		backgroundColor: "#fff",
		borderRadius: 12,
		width: "100%",
		maxWidth: 600,
		maxHeight: "90%",
		flex: 1,
		flexDirection: "column",
		position: 'relative',
		zIndex: 10000,
	},
	modalContainer: {
		backgroundColor: "#fff",
		borderRadius: 12,
		width: "100%",
		maxWidth: 600,
		maxHeight: "90%",
		flex: 1,
		flexDirection: "column",
	},
	modalHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		padding: 24,
		borderBottomWidth: 1,
		borderBottomColor: colors.border,
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: "700",
		color: colors.text,
	},
	closeButton: {
		padding: 4,
	},
	modalContent: {
		padding: 24,
		flex: 1,
		flexDirection: "column",
	},
	sectionLabel: {
		fontSize: 16,
		fontWeight: "600",
		color: colors.text,
		marginBottom: 12,
		marginTop: 8,
	},
	fileSelectionContainer: {
		flex: 1,
		maxHeight: 300,
		marginBottom: 20,
	},
	fileSelectionItem: {
		flexDirection: "row",
		alignItems: "center",
		padding: 16,
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: 8,
		marginBottom: 8,
		backgroundColor: "#fff",
	},
	fileSelectionItemSelected: {
		backgroundColor: colors.maroon,
		borderColor: colors.maroon,
	},
	fileSelectionText: {
		flex: 1,
		marginLeft: 12,
		fontSize: 14,
		color: colors.text,
	},
	fileSelectionTextSelected: {
		color: "#fff",
	},
	commentInput: {
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: 8,
		padding: 16,
		fontSize: 14,
		color: colors.text,
		minHeight: 120,
		textAlignVertical: "top",
	},
	modalActions: {
		flexDirection: "row",
		justifyContent: "space-between",
		padding: 24,
		borderTopWidth: 1,
		borderTopColor: colors.border,
		gap: 16,
	},
	cancelButton: {
		flex: 1,
		paddingVertical: 16,
		paddingHorizontal: 32,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.border,
		alignItems: "center",
		justifyContent: "center",
	},
	cancelButtonText: {
		fontSize: 16,
		fontWeight: "600",
		color: colors.text,
	},
	submitButton: {
		flex: 1,
		paddingVertical: 16,
		paddingHorizontal: 32,
		borderRadius: 8,
		backgroundColor: colors.maroon,
		alignItems: "center",
		justifyContent: "center",
	},
	submitButtonDisabled: {
		opacity: 0.6,
	},
	submitButtonText: {
		fontSize: 16,
		fontWeight: "600",
		color: "#fff",
	},
	// Custom Error Modal Styles
	errorModalOverlay: {
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.5)",
		justifyContent: "center",
		alignItems: "center",
	},
	errorModalContainer: {
		backgroundColor: "#2d2d2d",
		borderRadius: 12,
		padding: 24,
		minWidth: 280,
		maxWidth: 400,
		alignItems: "center",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.3,
		shadowRadius: 8,
		elevation: 8,
	},
	errorModalTitle: {
		fontSize: 18,
		fontWeight: "700",
		color: "#ffffff",
		marginBottom: 12,
		textAlign: "center",
	},
	errorModalMessage: {
		fontSize: 16,
		fontWeight: "400",
		color: "#ffffff",
		textAlign: "center",
		marginBottom: 20,
		lineHeight: 22,
	},
	errorModalButton: {
		backgroundColor: "transparent",
		paddingVertical: 12,
		paddingHorizontal: 24,
		borderRadius: 8,
		minWidth: 80,
		alignItems: "center",
		justifyContent: "center",
	},
	errorModalButtonText: {
		fontSize: 16,
		fontWeight: "600",
		color: "#007AFF",
	},
	sectionSubtitle: {
		fontSize: 14,
		fontWeight: "600",
		color: colors.text,
		marginBottom: 8,
		marginTop: 8,
	},
	revisedSectionSubtitle: {
		color: "#22c55e",
	},
	revisedFileCard: {
		backgroundColor: "#f0fdf4",
		borderColor: "#22c55e",
		borderWidth: 1,
	},
	revisedFileTitle: {
		color: "#22c55e",
	},
	// File upload styles
	uploadSection: {
		marginBottom: 20,
		padding: 16,
		backgroundColor: "#f8f9fa",
		borderRadius: 8,
		borderWidth: 1,
		borderColor: "#e9ecef",
	},
	addFileButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#fff",
		borderWidth: 2,
		borderColor: colors.maroon,
		borderRadius: 8,
		paddingVertical: 12,
		paddingHorizontal: 16,
		gap: 8,
	},
	addFileButtonDisabled: {
		backgroundColor: "#f8f9fa",
		borderColor: "#dee2e6",
	},
	addFileButtonText: {
		color: colors.maroon,
		fontSize: 16,
		fontWeight: "600",
	},
	addFileButtonTextDisabled: {
		color: "#6c757d",
	},
	linkInputContainer: {
		marginTop: 16,
	},
	linkInputLabel: {
		fontSize: 14,
		fontWeight: "600",
		color: colors.text,
		marginBottom: 8,
	},
	linkInput: {
		borderWidth: 1,
		borderColor: "#ced4da",
		borderRadius: 6,
		paddingVertical: 10,
		paddingHorizontal: 12,
		fontSize: 16,
		backgroundColor: "#fff",
		marginBottom: 12,
	},
	linkButtonContainer: {
		flexDirection: "row",
		gap: 12,
	},
	linkCancelButton: {
		flex: 1,
		backgroundColor: "#6c757d",
		borderRadius: 6,
		paddingVertical: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	linkCancelButtonText: {
		color: "#fff",
		fontSize: 14,
		fontWeight: "600",
	},
	linkSubmitButton: {
		flex: 1,
		backgroundColor: colors.maroon,
		borderRadius: 6,
		paddingVertical: 10,
		alignItems: "center",
		justifyContent: "center",
	},
	linkSubmitButtonText: {
		color: "#fff",
		fontSize: 14,
		fontWeight: "600",
	},
	selectedFilesContainer: {
		marginTop: 16,
	},
	selectedFilesTitle: {
		fontSize: 14,
		fontWeight: "600",
		color: colors.text,
		marginBottom: 8,
	},
	selectedFileItem: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#dee2e6",
		borderRadius: 6,
		padding: 12,
		marginBottom: 8,
	},
	selectedFileInfo: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
		gap: 8,
	},
	uploadButtonContainer: {
		marginTop: 16,
	},
	uploadButton: {
		backgroundColor: colors.maroon,
		borderRadius: 8,
		paddingVertical: 12,
		paddingHorizontal: 24,
		alignItems: "center",
		justifyContent: "center",
	},
	uploadButtonDisabled: {
		backgroundColor: "#6c757d",
	},
	uploadButtonText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "600",
	},
	// Modal styles
	modalSubtitle: {
		fontSize: 16,
		color: "#6b7280",
		textAlign: "center",
		marginBottom: 24,
	},
	modalOptions: {
		gap: 16,
		marginBottom: 24,
	},
	modalOption: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#f8f9fa",
		borderRadius: 12,
		padding: 16,
		borderWidth: 1,
		borderColor: "#e9ecef",
	},
	modalOptionContent: {
		marginLeft: 16,
		flex: 1,
	},
	modalOptionTitle: {
		fontSize: 16,
		fontWeight: "600",
		color: colors.text,
		marginBottom: 4,
	},
	modalOptionDescription: {
		fontSize: 14,
		color: "#6b7280",
	},
	modalFooter: {
		flexDirection: "row",
		justifyContent: "center",
	},
	modalCancelButton: {
		backgroundColor: "#6c757d",
		borderRadius: 8,
		paddingVertical: 12,
		paddingHorizontal: 24,
	},
	modalCancelButtonText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "600",
	},
	// Success Modal styles
	successModalContainer: {
		backgroundColor: "#fff",
		borderRadius: 12,
		width: "100%",
		maxWidth: 300,
		position: 'absolute',
		zIndex: 10000,
		padding: 20,
		alignItems: 'center',
		shadowColor: '#000',
		shadowOffset: {
			width: 0,
			height: 10,
		},
		shadowOpacity: 0.25,
		shadowRadius: 20,
		elevation: 10,
	},
	successModalHeader: {
		marginBottom: 16,
	},
	successModalTitle: {
		fontSize: 20,
		fontWeight: '700',
		color: colors.text,
		textAlign: 'center',
	},
	successModalContent: {
		marginBottom: 20,
	},
	successModalMessage: {
		fontSize: 16,
		color: colors.text,
		textAlign: 'center',
		lineHeight: 22,
	},
	successModalButtonContainer: {
		width: '100%',
	},
	successModalButton: {
		backgroundColor: colors.maroon,
		borderRadius: 8,
		paddingVertical: 12,
		paddingHorizontal: 24,
		alignItems: 'center',
		width: '100%',
	},
	successModalButtonText: {
		color: '#fff',
		fontSize: 16,
		fontWeight: '600',
	},
});
