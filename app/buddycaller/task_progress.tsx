import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import React, { useState, useEffect, useCallback } from "react";
import {
	Image,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
	Alert,
	Linking,
	Modal,
	TextInput,
	TouchableWithoutFeedback,
	Keyboard,
	Platform,
} from "react-native";
import { SafeAreaView as SAView, useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import TaskApprovalConfirmationModal from "@/components/TaskApprovalConfirmationModal";
import CallerRateAndFeedbackModal from "../../components/CallerRateAndFeedbackModal";
import FileViewer from "../../components/FileViewer";
import { globalNotificationService } from "../../services/GlobalNotificationService";
import { approvalModalService } from "../../services/ApprovalModalService";
import { RealtimeChannel } from "@supabase/supabase-js";

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

/* ===================== MAIN COMPONENT ===================== */
export default function TaskProgressMobile() {
	const router = useRouter();
	const { id } = useLocalSearchParams<{ id?: string }>();
	const insets = useSafeAreaInsets();
	
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
	const [ratingModalVisible, setRatingModalVisible] = useState(false);
	const [invoiceAmount, setInvoiceAmount] = useState<number | null>(null);

	const fetchData = useCallback(async () => {
		console.log("Task Progress: fetchData called with id:", id);
		if (!id) {
			console.log("Task Progress: No id provided, returning");
			return;
		}
		
		setLoading(true);
		try {
			const numericId = Number(id);
			console.log("Task Progress: Converted id to numeric:", numericId);
			if (!Number.isFinite(numericId)) {
				throw new Error(`Invalid commission id: ${id}`);
			}

			console.log("Task Progress: Fetching task progress for commission_id:", numericId);

			// Fetch task progress data using the new table
			const { data: taskProgressData, error: taskProgressError } = await supabase
				.from("task_progress")
				.select("*")
				.eq("commission_id", numericId)
				.single();

			if (taskProgressError && taskProgressError.code !== 'PGRST116') {
				console.error("Task Progress: Error fetching task progress:", taskProgressError);
				throw taskProgressError;
			}

			// If no task progress exists, create one using the helper function
			let taskProgress = taskProgressData;
			if (!taskProgress) {
				console.log("Task Progress: No task progress found, creating one...");
				const { data: newTaskProgress, error: createError } = await supabase
					.rpc('create_task_progress_if_not_exists', {
						p_commission_id: numericId
					});

				if (createError) {
					console.error("Task Progress: Error creating task progress:", createError);
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
						console.error("Task Progress: Error fetching complete task progress:", fetchError);
						throw fetchError;
					}
					
					taskProgress = completeTaskProgress;
				} else {
					throw new Error("Failed to create task progress record");
				}
			}

			console.log("Task Progress: Task progress data:", taskProgress);
			console.log("Task Progress: Raw task progress invoice_id:", taskProgress.invoice_id);
			console.log("Task Progress: Raw task progress invoice_status:", taskProgress.invoice_status);
			console.log("Task Progress: Raw task progress status:", taskProgress.status);
			console.log("Task Progress: Raw task progress file_url:", taskProgress.file_url);
			console.log("Task Progress: Raw task progress file_uploaded:", taskProgress.file_uploaded);

			// Fetch commission data for additional info
			console.log("Task Progress: Fetching commission with id:", numericId);
			const { data: cm, error: cmError } = await supabase
				.from("commission")
				.select("*")
				.eq("id", numericId)
				.single();
			
			if (cmError) {
				console.error("Task Progress: Error fetching commission:", cmError);
				throw cmError;
			}
			console.log("Task Progress: Commission data:", cm);
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
			console.log("=== FILE DATA DEBUG (MOBILE) ===");
			console.log("taskProgress.file_url:", taskProgress.file_url);
			console.log("taskProgress.file_type:", taskProgress.file_type);
			console.log("taskProgress.file_size:", taskProgress.file_size);
			console.log("taskProgress.file_name:", taskProgress.file_name);
			console.log("taskProgress.file_uploaded:", taskProgress.file_uploaded);
			console.log("taskProgress object keys:", Object.keys(taskProgress));
			console.log("=== END FILE DATA DEBUG (MOBILE) ===");
			
			if (taskProgress.file_url && taskProgress.file_uploaded) {
				try {
					console.log("=== LOADING FILES FROM DATABASE ===");
					console.log("Raw file_url from database:", taskProgress.file_url);
					console.log("Raw file_name from database:", taskProgress.file_name);
					console.log("Raw file_type from database:", taskProgress.file_type);
					console.log("File URL contains 'file://':", taskProgress.file_url.includes('file://'));
					console.log("File URL contains 'supabase':", taskProgress.file_url.includes('supabase'));
					
					// Parse multiple files from comma-separated values
					const fileUrls = taskProgress.file_url.split(',').map((url: string) => url.trim()).filter(Boolean);
					const fileTypes = taskProgress.file_type ? taskProgress.file_type.split(',').map((type: string) => type.trim()) : [];
					const fileSizes = taskProgress.file_size ? taskProgress.file_size.split(',').map((s: string) => parseInt(s) || 0) : [];
					const fileNames = taskProgress.file_name ? taskProgress.file_name.split(',').map((name: string) => name.trim()) : [];
					const uploadedAt = taskProgress.uploaded_at || new Date().toISOString();
					
					console.log("Parsed fileUrls:", fileUrls);
					console.log("Parsed fileNames:", fileNames);
					console.log("First fileUrl contains 'file://':", fileUrls[0]?.includes('file://'));
					console.log("First fileUrl contains 'supabase':", fileUrls[0]?.includes('supabase'));
					console.log("=== END LOADING FILES FROM DATABASE ===");
					
					const files = fileUrls.map((url: string, index: number) => {
						// Prioritize original filename from database
						let fileName = "Unknown file";
						
						if (fileTypes[index] === "link") {
							fileName = url;
						} else if (fileNames[index] && fileNames[index].trim()) {
							// Use the original filename from database (this is what we want for mobile)
							fileName = fileNames[index].trim();
						} else {
							// Fallback to extracting from URL only if database name is not available
							fileName = url.split("/").pop()?.split("?")[0] || "Unknown file";
						}
						
						console.log(`=== FILE NAME ASSIGNMENT DEBUG (File ${index}) ===`);
						console.log("File URL:", url);
						console.log("File type:", fileTypes[index]);
						console.log("Original filename from database:", fileNames[index]);
						console.log("Final assigned filename:", fileName);
						console.log("=== END FILE NAME ASSIGNMENT DEBUG ===");
						
						return {
						id: `${commission?.id || 'unknown'}-${index}-${Date.now()}`,
						url: url,
							name: fileName,
						type: fileTypes[index] || "unknown",
						size: fileSizes[index] || 0,
						uploadedAt: uploadedAt,
						};
					});
					
					console.log("Parsed files for revision modal:", files);
					console.log("First file URL in final array:", files[0]?.url);
					console.log("First file URL contains 'file://':", files[0]?.url?.includes('file://'));
					console.log("First file URL contains 'supabase':", files[0]?.url?.includes('supabase'));
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
					
					console.log("Revised files parsed for main display (mobile):", revisedFiles);
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
			console.log("Task Progress: Invoice status from task_progress:", taskProgress.invoice_status);

			// Set task status from task_progress table
			setTaskStatus(taskProgress.status as TaskStatus);
			
			// Clear selection indicators when revision is completed or task is approved
			if (taskProgress.status === "completed" || taskProgress.revision_completed_at) {
				setSelectedFilesForRevision([]);
			}
			console.log("Task Progress: Task status set to:", taskProgress.status);
			console.log("Task Progress: Invoice ID from task_progress:", taskProgress.invoice_id);
			
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
			.channel(`task_progress_${id}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'task_progress',
					filter: `commission_id=eq.${parseInt(id)}`
				},
				async (payload) => {
					console.log('Task Progress: Task progress update received:', payload);
					console.log('Task Progress: New status:', (payload.new as any)?.status);
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
					console.log('Task Progress: Invoice update received:', payload);
					console.log('Task Progress: Invoice commission_id:', (payload.new as any)?.commission_id, 'Expected commission_id:', id);
					console.log('Task Progress: Invoice event type:', payload.eventType);
					console.log('Task Progress: Invoice table:', payload.table);
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
		
		console.log("Task Progress Debug - invoiceStatus:", invoiceStatus);
		console.log("Task Progress Debug - isInvoiceAccepted:", isInvoiceAccepted);
		
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
		console.log("=== FILE VIEWING DEBUG ===");
		console.log("File URL to open:", fileUrl);
		
		// Check if it's a local file URI (which shouldn't happen for uploaded files)
		if (fileUrl.startsWith('file://')) {
			console.error("ERROR: Received local file URI instead of Supabase storage URL:", fileUrl);
			Alert.alert("Error", "File URL is invalid. Please try again or contact support.");
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
				Alert.alert("Error", "File information not found.");
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
			Alert.alert("Error", "Failed to open file. Please try again.");
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
		console.log('Task Progress Mobile: handleConfirmApproval called');
		console.log('Task Progress Mobile: commission:', commission);
		console.log('Task Progress Mobile: runner:', runner);
		
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
				console.error('Task Progress Mobile: Commission update error:', commissionResult.error);
				throw commissionResult.error;
			}
			if (taskProgressResult.error) {
				console.error('Task Progress Mobile: Task progress update error:', taskProgressResult.error);
				throw taskProgressResult.error;
			}

			// Show success alert first, then rating modal on OK
			setApprovalConfirmationVisible(false);
			Alert.alert("Success", "Task approved successfully!", [
				{ text: "OK", onPress: () => setRatingModalVisible(true) }
			]);

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

			console.log('Task Progress Mobile: About to send approval notification:', approvalNotification);
			console.log('Task Progress Mobile: Global approval listeners count before sending:', globalNotificationService.getApprovalListenersCount());
			console.log('Task Progress Mobile: approvalModalService available:', !!approvalModalService);
			console.log('Task Progress Mobile: Simple approval listeners count before sending:', approvalModalService.getListenerCount());
			
			// Send notification through both services for redundancy
			globalNotificationService.notifyTaskApproval(approvalNotification);
			approvalModalService.notifyApproval(approvalNotification);

			// NEW: Direct realtime broadcast (runner-specific channel, no DB)
			try {
				const channelName = `task_approvals_${runner.id}`;
				console.log('Task Progress Mobile: Broadcasting approval on channel:', channelName);
				supabase
					.channel(channelName)
					.send({ type: 'broadcast', event: 'task_approval', payload: approvalNotification });
			} catch (e) {
				console.warn('Task Progress Mobile: Failed to broadcast approval:', e);
			}
			console.log('Task Progress Mobile: Approval notification sent to both services');
			console.log('Task Progress Mobile: Simple approval listeners count after sending:', approvalModalService.getListenerCount());
			
			// Add a small delay to ensure the notification is processed
			setTimeout(() => {
				console.log('Task Progress Mobile: Checking if notification was received after delay');
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

	const handleSubmitRevision = async () => {
		if (!revisionComment.trim()) {
			Alert.alert("Error", "Please enter revision comments.");
			return;
		}

		if (selectedFilesForRevision.length === 0) {
			Alert.alert("Error", "Please select at least one file for revision.");
			return;
		}

		try {
			setIsUpdating(true);
			
			// Update task_progress status to "revision" - preserve original files
			const { error } = await supabase
				.from('task_progress')
				.update({
					status: 'revision',
					revision_notes: revisionComment,
					revision_requested_at: new Date().toISOString(),
					revision_count: (revisionCount || 0) + 1,
					selected_files_for_revision: JSON.stringify(selectedFilesForRevision.map(url => {
						const file = uploadedFiles.find(f => f.url === url);
						return {
							url: url,
							name: file?.name || url.split('/').pop()?.split('?')[0] || 'Unknown file'
						};
					}))
					// Note: We don't update file_url, file_name, file_type, file_size, or file_uploaded
					// This preserves the original uploaded files so they remain visible to the runner
				})
				.eq('commission_id', id);

			if (error) throw error;

			Alert.alert("Success", "Revision request sent successfully!");
			setRevisionModalVisible(false);
			setRevisionComment("");
			// Don't clear selectedFilesForRevision - keep indicators visible until revision is resolved
			
			// Refresh data
			fetchData();
		} catch (error) {
			console.error('Error submitting revision:', error);
			Alert.alert("Error", "Failed to submit revision request.");
		} finally {
			setIsUpdating(false);
		}
	};


	if (loading) {
		return (
			<SAView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: "#fff" }}>
				<Stack.Screen options={{ animation: "none" }} />
				<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
					<Text style={{ color: colors.text, fontSize: 16 }}>Loading...</Text>
				</View>
			</SAView>
		);
	}

	if (!commission || !runner) {
		return (
			<SAView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: "#fff" }}>
				<Stack.Screen options={{ animation: "none" }} />
				<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
					<Text style={{ color: colors.text, fontSize: 16 }}>Commission not found</Text>
					<TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
						<Text style={{ color: colors.maroon, fontSize: 14 }}>Go Back</Text>
					</TouchableOpacity>
				</View>
			</SAView>
		);
	}

	const runnerName = `${runner.first_name || ""} ${runner.last_name || ""}`.trim() || "BuddyRunner";
	const runnerInfo = [runner.course, runner.student_id_number].filter(Boolean).join(" • ") || "No info";

	return (
		<SAView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: "#fff" }}>
			<Stack.Screen options={{ animation: "none" }} />

			{/* Header */}
			<View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10 }}>
				<View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
					<View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
						<TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
							<Ionicons name="arrow-back" size={24} color={colors.text} />
						</TouchableOpacity>
						<Image source={require("../../assets/images/logo.png")} style={{ width: 22, height: 22, resizeMode: "contain" }} />
						<Text style={{ fontWeight: "900", color: colors.text, fontSize: 18 }}>GoBuddy</Text>
					</View>
					<TouchableOpacity onPress={() => router.push("/buddycaller/notification")} activeOpacity={0.9}>
						<Ionicons name="notifications-outline" size={24} color={colors.text} />
					</TouchableOpacity>
				</View>
			</View>

			<Text style={{ paddingHorizontal: 16, color: colors.text, fontWeight: "800", fontSize: 16, marginBottom: 6 }}>
				Task Progress
			</Text>

			<ScrollView contentContainerStyle={{ padding: 16, paddingBottom: (insets.bottom || 0) + 100 }}>
				{/* Runner Profile Card */}
				<View style={m.profileCard}>
					<View style={m.profileHeader}>
						<View style={m.profileImage}>
							{runner.profile_picture_url ? (
								<Image source={{ uri: runner.profile_picture_url }} style={m.profileImage} />
							) : (
								<Ionicons name="person" size={24} color={colors.maroon} />
							)}
						</View>
						<View style={m.runnerInfo}>
							<Text style={m.runnerName}>{runnerName}</Text>
							<Text style={m.runnerDetails}>{runnerInfo}</Text>
							<Text style={m.runnerRole}>BuddyRunner</Text>
						</View>
						<TouchableOpacity 
							style={m.chatButton}
							onPress={() => router.push({
								pathname: "/buddycaller/start_conversation",
								params: { otherUserId: runner.id }
							})}
						>
							<Ionicons name="chatbubbles" size={20} color={colors.maroon} />
						</TouchableOpacity>
					</View>
					<TouchableOpacity 
						style={m.viewProfileButton}
						onPress={() => router.push({
							pathname: "/buddyrunner/profile",
							params: { 
								userId: runner.id,
								isViewingOtherUser: 'true',
								returnTo: 'BuddyCallerTaskProgress'
							}
						})}
					>
						<Text style={m.viewProfileText}>View Profile</Text>
					</TouchableOpacity>
				</View>

				{/* Task Progress Card */}
				<View style={m.taskCard}>
					<View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
						<View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
							<Text style={m.taskTitle}>Task Progress</Text>
							{isUpdating && (
								<View style={m.updatingIndicator}>
									<Text style={m.updatingText}>Updating...</Text>
								</View>
							)}
						</View>
						<TouchableOpacity 
							onPress={() => fetchData()} 
							style={m.refreshButton}
							disabled={loading || isUpdating}
						>
							<Ionicons 
								name="refresh" 
								size={20} 
								color={loading || isUpdating ? "#999" : colors.maroon} 
							/>
						</TouchableOpacity>
					</View>
					
					{/* Progress Steps */}
					<View style={m.progressContainer}>
								{getProgressSteps().map((step, index) => (
									<React.Fragment key={step.key}>
										<View style={[
											m.progressStep, 
											step.completed && m.progressStepCompleted,
											step.active && m.progressStepActive
										]}>
											{step.completed ? (
												<Ionicons name="checkmark" size={16} color="#fff" />
											) : step.active ? (
												<Ionicons name="ellipse" size={12} color="#fff" />
											) : (
												<View style={m.progressStepDot} />
											)}
										</View>
										{index < getProgressSteps().length - 1 && (
											<View style={[
												m.progressLine, 
												step.completed && m.progressLineCompleted,
												step.active && m.progressLineActive
											]} />
										)}
									</React.Fragment>
								))}
					</View>
					<View style={m.progressLabels}>
						{getProgressSteps().map((step, index) => (
							<Text key={step.key} style={[
								m.progressLabel,
								index === 0 && m.progressLabelLeft, // Requested - move left
								index === 1 && m.progressLabelLeft, // Accepted - move left
								index === 3 && m.progressLabelRight, // Revision - move right
								index === 4 && m.progressLabelRight, // Completed - move right
							]}>{step.label}</Text>
						))}
					</View>
				</View>

				{/* Task Details Card */}
				<View style={m.taskDetailsCard}>
					<View style={m.taskDetailsHeader}>
						<View style={m.taskDetailsIcon}>
							<Ionicons name="briefcase" size={24} color={colors.maroon} />
						</View>
						<Text style={m.taskDetailsTitle}>Task Details</Text>
					</View>
					
					<View style={m.taskDetailsContent}>
						<View style={m.taskDetailRow}>
							<Text style={m.taskDetailLabel}>Commission Title:</Text>
							<Text style={m.taskDetailValue}>{commission.title || "N/A"}</Text>
						</View>

						<View style={m.taskDetailRow}>
							<Text style={m.taskDetailLabel}>Type:</Text>
							<Text style={m.taskDetailValue}>{commission.commission_type || "N/A"}</Text>
						</View>

						<View style={m.taskDetailRow}>
							<Text style={m.taskDetailLabel}>Meetup Location:</Text>
							<Text style={m.taskDetailValue}>—</Text>
						</View>

						<View style={m.taskDetailRow}>
							<Text style={m.taskDetailLabel}>Due At:</Text>
							<Text style={m.taskDetailValue}>
								{commission.due_at ? new Date(commission.due_at).toLocaleString() : "N/A"}
							</Text>
						</View>

						<View style={m.taskDetailDivider} />

						<View style={m.taskDetailRow}>
							<Text style={m.taskDetailLabel}>Commission Description:</Text>
							<Text style={m.taskDetailValue}>{commission.description || "No description provided"}</Text>
						</View>

						{/* Invoice Breakdown Section */}
						{invoiceAmount !== null && (
							<>
								<View style={m.taskDetailDivider} />
								<View style={m.invoiceBreakdownSection}>
									<Text style={m.invoiceBreakdownTitle}>Invoice Details:</Text>
									{(() => {
										// Reverse calculate subtotal from total
										// Total = Subtotal × 1.22 (where 1.22 = 1 + 0.12 VAT + 0.10 Service Fee)
										const total = invoiceAmount;
										const subtotal = total / 1.22;
										const vatDeduction = subtotal * 0.12;
										const serviceFee = subtotal * 0.10;
										const totalServiceFee = vatDeduction + serviceFee;
										
										return (
											<View style={m.invoiceBreakdownContainer}>
												<View style={m.invoiceBreakdownRow}>
													<Text style={m.invoiceBreakdownLabel}>Subtotal:</Text>
													<Text style={m.invoiceBreakdownValue}>₱{subtotal.toFixed(2)}</Text>
												</View>
												<View style={m.invoiceBreakdownRow}>
													<Text style={m.invoiceBreakdownLabel}>Service Fee:</Text>
													<Text style={m.invoiceBreakdownValue}>₱{totalServiceFee.toFixed(2)}</Text>
												</View>
												<View style={[m.invoiceBreakdownRow, m.invoiceBreakdownTotalRow]}>
													<Text style={m.invoiceBreakdownTotalLabel}>Total:</Text>
													<Text style={m.invoiceBreakdownTotalValue}>₱{total.toFixed(2)}</Text>
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
				<View style={m.uploadedFileCard}>
					<View style={m.uploadedFileHeader}>
						<Text style={m.uploadedFileTitle}>Uploaded Files:</Text>
					</View>
					{/* Show Original Files */}
					{uploadedFiles.length > 0 && (
						<View style={m.filesList}>
							<Text style={m.sectionSubtitle}>Original Files:</Text>
							{uploadedFiles.map((file, index) => (
								<TouchableOpacity 
									key={file.id} 
									style={[
										m.fileContainer,
										selectedFilesForRevision.includes(file.url) && m.selectedFileContainer
									]}
									onPress={() => handleViewFile(file.url)}
								>
									<View style={m.fileInfo}>
										<Ionicons 
											name={file.type === "link" ? "link" : "document"} 
											size={20} 
											color={selectedFilesForRevision.includes(file.url) ? "#fff" : colors.maroon} 
										/>
										<Text style={[
											m.fileName,
											selectedFilesForRevision.includes(file.url) && m.selectedFileName
										]} numberOfLines={1}>
											{file.name}
										</Text>
										{selectedFilesForRevision.includes(file.url) && (
											<View style={m.selectedIndicator}>
												<Ionicons name="checkmark-circle" size={16} color="#fff" />
												<Text style={m.selectedIndicatorText}>Selected for Revision</Text>
											</View>
										)}
									</View>
									<TouchableOpacity 
										style={[
											m.viewButton,
											selectedFilesForRevision.includes(file.url) && m.selectedViewButton
										]}
										onPress={() => handleViewFile(file.url)}
									>
										<Text style={[
											m.viewButtonText,
											selectedFilesForRevision.includes(file.url) && m.selectedViewButtonText
										]}>View</Text>
									</TouchableOpacity>
								</TouchableOpacity>
							))}
						</View>
					)}

					{/* Show Revised Files */}
					{revisedFiles.length > 0 && (
						<View style={m.filesList}>
							<Text style={[m.sectionSubtitle, m.revisedSectionSubtitle]}>Revised Files:</Text>
							{revisedFiles.map((file, index) => (
								<TouchableOpacity 
									key={file.id} 
									style={[m.fileContainer, m.revisedFileContainer]}
									onPress={() => handleViewFile(file.url)}
								>
									<View style={m.fileInfo}>
										<Ionicons 
											name={file.type === "link" ? "link" : "document"} 
											size={20} 
											color="#22c55e" 
										/>
										<View style={m.fileNameContainer}>
											<Text style={[m.fileName, m.revisedFileName]} numberOfLines={1}>
												{file.name}
											</Text>
											<View style={m.revisionFileBadge}>
												<Ionicons name="refresh" size={12} color="#22c55e" />
												<Text style={m.revisionFileBadgeText}>Revised</Text>
											</View>
										</View>
									</View>
									<TouchableOpacity 
										style={[m.viewButton, m.revisedViewButton]}
										onPress={() => handleViewFile(file.url)}
									>
										<Text style={[m.viewButtonText, m.revisedViewButtonText]}>View</Text>
									</TouchableOpacity>
								</TouchableOpacity>
							))}
						</View>
					)}


					{/* No Files Message */}
					{uploadedFiles.length === 0 && revisedFiles.length === 0 && (
						<View style={m.noFileContainer}>
							<Text style={m.noFileText}>No files uploaded yet</Text>
						</View>
					)}

					{/* Action Buttons */}
					<View style={m.buttonContainer}>
						<TouchableOpacity 
							style={[
								m.approveButton, 
								(approving || taskStatus === "completed" || (taskStatus === "revision" && revisedFiles.length === 0)) && m.approveButtonDisabled
							]} 
							onPress={handleApprove}
							disabled={approving || taskStatus === "completed" || (taskStatus === "revision" && revisedFiles.length === 0)}
						>
							<Text style={m.approveButtonText}>
								{approving ? "Approving..." : 
								 taskStatus === "completed" ? "Approved" : 
								 taskStatus === "revision" && revisedFiles.length === 0 ? "Revision Pending" : 
								 "Approve"}
							</Text>
						</TouchableOpacity>
						
						<TouchableOpacity 
							style={[
								m.commentButton, 
								((taskStatus === "revision" && !revisionCompletedAt) || taskStatus === "completed") && m.commentButtonDisabled
							]} 
							onPress={handleMakeComment}
							disabled={(taskStatus === "revision" && !revisionCompletedAt) || taskStatus === "completed"}
						>
							<Text style={[
								m.commentButtonText,
								((taskStatus === "revision" && !revisionCompletedAt) || taskStatus === "completed") && m.commentButtonTextDisabled
							]}>
								{taskStatus === "completed" ? "Task Completed" : 
								 taskStatus === "revision" && !revisionCompletedAt ? "Revision Pending" : "Make Changes"}
							</Text>
						</TouchableOpacity>
					</View>
				</View>
			</ScrollView>

			{/* Revision Request Modal */}
			<Modal
				visible={revisionModalVisible}
				transparent
				animationType="fade"
				onRequestClose={() => setRevisionModalVisible(false)}
			>
				<TouchableWithoutFeedback onPress={Keyboard.dismiss}>
					<View style={m.modalOverlay}>
						<View style={m.modalContainer}>
							<View style={m.modalHeader}>
								<Text style={m.modalTitle}>Request Revision</Text>
								<TouchableOpacity
									onPress={() => {
										setRevisionModalVisible(false);
										setSelectedFilesForRevision([]);
									}}
									style={m.closeButton}
								>
									<Ionicons name="close" size={24} color={colors.text} />
								</TouchableOpacity>
							</View>

							<TouchableWithoutFeedback onPress={Keyboard.dismiss}>
								<View style={m.modalContent}>
									<Text style={m.sectionLabel}>Select files for revision:</Text>
									<ScrollView style={m.fileSelectionContainer} showsVerticalScrollIndicator={false}>
										{uploadedFiles.map((file, index) => (
											<TouchableOpacity
												key={index}
												style={[
													m.fileSelectionItem,
													selectedFilesForRevision.includes(file.url) && m.fileSelectionItemSelected
												]}
												onPress={() => {
													Keyboard.dismiss();
													if (selectedFilesForRevision.includes(file.url)) {
														setSelectedFilesForRevision(prev => prev.filter(url => url !== file.url));
													} else {
														setSelectedFilesForRevision(prev => [...prev, file.url]);
													}
												}}
											>
												<Ionicons 
													name={file.type === "link" ? "link" : "document"} 
													size={20} 
													color={selectedFilesForRevision.includes(file.url) ? "#fff" : colors.maroon} 
												/>
												<Text style={[
													m.fileSelectionText,
													selectedFilesForRevision.includes(file.url) && m.fileSelectionTextSelected
												]}>
													{file.name}
												</Text>
												{selectedFilesForRevision.includes(file.url) && (
													<Ionicons name="checkmark" size={16} color="#fff" />
												)}
											</TouchableOpacity>
										))}
									</ScrollView>

									<Text style={m.sectionLabel}>Revision comments:</Text>
									<TextInput
										style={m.commentInput}
										placeholder="Describe what needs to be changed..."
										value={revisionComment}
										onChangeText={setRevisionComment}
										multiline
										numberOfLines={4}
										textAlignVertical="top"
										returnKeyType="done"
										onSubmitEditing={Keyboard.dismiss}
										blurOnSubmit={true}
									/>
								</View>
							</TouchableWithoutFeedback>

							<View style={m.modalActions}>
								<TouchableOpacity
									style={m.cancelButton}
									onPress={() => {
										Keyboard.dismiss();
										setRevisionModalVisible(false);
										setSelectedFilesForRevision([]);
									}}
								>
									<Text style={m.cancelButtonText}>Cancel</Text>
								</TouchableOpacity>
								<TouchableOpacity
									style={[m.submitButton, isUpdating && m.submitButtonDisabled]}
									onPress={() => {
										Keyboard.dismiss();
										handleSubmitRevision();
									}}
									disabled={isUpdating}
								>
									<Text style={m.submitButtonText}>
										{isUpdating ? "Submitting..." : "Submit Revision"}
									</Text>
								</TouchableOpacity>
							</View>
						</View>
					</View>
				</TouchableWithoutFeedback>
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
			<TaskApprovalConfirmationModal
				visible={approvalConfirmationVisible}
				onClose={() => setApprovalConfirmationVisible(false)}
				onConfirm={handleConfirmApproval}
				taskTitle={commission?.title || ""}
				isApproving={approving}
			/>

			{/* Rate and Feedback Modal */}
			<CallerRateAndFeedbackModal
				visible={ratingModalVisible}
				onClose={() => {
					setRatingModalVisible(false);
					router.replace("/buddycaller/home");
				}}
				onSubmit={() => {
					setRatingModalVisible(false);
					router.replace("/buddycaller/home");
				}}
				taskTitle={commission?.title || ""}
				runnerName={runner ? `${runner.first_name} ${runner.last_name}`.trim() : "Runner"}
				commissionId={commission?.id || 0}
				buddyrunnerId={runner?.id || ""}
			/>
		</SAView>
	);
}

/* ======================= STYLES ======================= */
const m = StyleSheet.create({
	profileCard: {
		backgroundColor: "#fff",
		borderRadius: 12,
		padding: 16,
		marginBottom: 16,
		borderWidth: 1,
		borderColor: colors.border,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 2,
		elevation: 2,
	},
	profileHeader: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 12,
	},
	profileImage: {
		width: 50,
		height: 50,
		borderRadius: 25,
		backgroundColor: colors.faint,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 12,
	},
	runnerInfo: {
		flex: 1,
	},
	runnerName: {
		fontSize: 16,
		fontWeight: "800",
		color: colors.text,
		marginBottom: 2,
	},
	runnerDetails: {
		fontSize: 12,
		color: colors.text,
		opacity: 0.7,
		marginBottom: 2,
	},
	runnerRole: {
		fontSize: 12,
		color: colors.text,
		opacity: 0.7,
	},
	chatButton: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: colors.faint,
		alignItems: "center",
		justifyContent: "center",
	},
	viewProfileButton: {
		backgroundColor: colors.maroon,
		paddingVertical: 8,
		paddingHorizontal: 16,
		borderRadius: 8,
		alignSelf: "flex-start",
	},
	viewProfileText: {
		color: "#fff",
		fontSize: 12,
		fontWeight: "600",
	},
	taskCard: {
		backgroundColor: "#fff",
		borderRadius: 12,
		padding: 16,
		borderWidth: 1,
		borderColor: colors.border,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	taskTitle: {
		fontSize: 16,
		fontWeight: "800",
		color: colors.text,
		marginBottom: 16,
	},
	updatingIndicator: {
		backgroundColor: "#E3F2FD",
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "#2196F3",
	},
	updatingText: {
		fontSize: 12,
		color: "#2196F3",
		fontWeight: "600",
	},
	refreshButton: {
		padding: 8,
		borderRadius: 20,
		backgroundColor: "#F5F5F5",
	},
	progressContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 8,
	},
	progressStep: {
		width: 24,
		height: 24,
		borderRadius: 12,
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
		width: 8,
		height: 8,
		borderRadius: 4,
		backgroundColor: "#fff",
	},
	progressLine: {
		flex: 1,
		height: 2,
		backgroundColor: "#D1D5DB",
		marginHorizontal: 8,
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
		marginBottom: 16,
	},
	progressLabel: {
		fontSize: 10,
		color: colors.text,
		textAlign: "center",
		flex: 1,
	},
	progressLabelLeft: {
		textAlign: "left",
		paddingLeft: 2,
	},
	progressLabelRight: {
		textAlign: "right",
		paddingRight: 2,
	},
	sectionTitle: {
		fontSize: 16,
		fontWeight: "900",
		color: colors.text,
		marginBottom: 12,
	},
	detailContainer: {
		marginBottom: 12,
	},
	detailLabel: {
		backgroundColor: colors.maroon,
		borderRadius: 4,
		paddingHorizontal: 8,
		paddingVertical: 4,
		alignSelf: "flex-start",
		marginBottom: 4,
	},
	detailLabelText: {
		color: "#fff",
		fontSize: 12,
		fontWeight: "700",
	},
	detailText: {
		fontSize: 14,
		color: colors.text,
		lineHeight: 20,
	},
	taskDetailsCard: {
		backgroundColor: "#fff",
		borderRadius: 12,
		padding: 16,
		marginTop: 16,
		marginBottom: 16,
		borderWidth: 1,
		borderColor: colors.border,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 2,
		elevation: 2,
	},
	taskDetailsHeader: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 16,
	},
	taskDetailsIcon: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: colors.faint,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 12,
	},
	taskDetailsTitle: {
		fontSize: 16,
		fontWeight: "800",
		color: colors.text,
		marginBottom: 12,
	},
	taskDetailsContent: {
		marginBottom: 0,
	},
	taskDetailRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 8,
	},
	taskDetailLabel: {
		fontSize: 14,
		fontWeight: "600",
		color: colors.maroon,
		flex: 1,
	},
	taskDetailValue: {
		fontSize: 14,
		color: colors.text,
		flex: 2,
		textAlign: "right",
	},
	invoiceBreakdownSection: {
		marginTop: 16,
	},
	invoiceBreakdownTitle: {
		fontSize: 14,
		fontWeight: "600",
		color: colors.maroon,
		marginBottom: 12,
	},
	invoiceBreakdownContainer: {
		backgroundColor: colors.faint,
		borderRadius: 8,
		padding: 12,
		borderWidth: 1,
		borderColor: colors.border,
	},
	invoiceBreakdownRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 8,
	},
	invoiceBreakdownLabel: {
		fontSize: 14,
		fontWeight: "500",
		color: colors.text,
		flex: 1,
	},
	invoiceBreakdownValue: {
		fontSize: 14,
		fontWeight: "600",
		color: colors.text,
		textAlign: "right",
	},
	invoiceBreakdownTotalRow: {
		borderTopWidth: 1,
		borderTopColor: colors.border,
		paddingTop: 8,
		marginTop: 4,
		marginBottom: 0,
	},
	invoiceBreakdownTotalLabel: {
		fontSize: 15,
		fontWeight: "700",
		color: colors.maroon,
		flex: 1,
	},
	invoiceBreakdownTotalValue: {
		fontSize: 15,
		fontWeight: "700",
		color: colors.maroon,
		textAlign: "right",
	},
	taskDetailDivider: {
		height: 1,
		backgroundColor: "#E0E0E0",
		marginVertical: 12,
		marginHorizontal: 0,
	},
	uploadedFileCard: {
		backgroundColor: "#fff",
		borderRadius: 12,
		padding: 16,
		marginBottom: 16,
		borderWidth: 1,
		borderColor: colors.border,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 2,
		elevation: 2,
	},
	uploadedFileTitle: {
		fontSize: 16,
		fontWeight: "800",
		color: colors.text,
		marginBottom: 12,
	},
	uploadedFileHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 12,
	},
	revisionIndicator: {
		flexDirection: "row",
		alignItems: "center",
		backgroundColor: "#dcfce7",
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 12,
		borderWidth: 1,
		borderColor: "#22c55e",
	},
	revisionIndicatorText: {
		fontSize: 12,
		fontWeight: "600",
		color: "#22c55e",
		marginLeft: 4,
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
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 8,
		marginLeft: 8,
	},
	revisionFileBadgeText: {
		fontSize: 10,
		fontWeight: "600",
		color: "#22c55e",
		marginLeft: 2,
	},
	revisedViewButton: {
		backgroundColor: "#22c55e",
	},
	revisedViewButtonText: {
		color: "#ffffff",
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
		padding: 12,
		backgroundColor: "#fff",
		marginBottom: 16,
	},
	fileInfo: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
	},
	fileName: {
		fontSize: 14,
		color: colors.text,
		marginLeft: 8,
		fontWeight: "600",
	},
	viewButton: {
		backgroundColor: colors.maroon,
		borderRadius: 4,
		paddingVertical: 6,
		paddingHorizontal: 12,
	},
	viewButtonText: {
		color: "#fff",
		fontSize: 12,
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
		marginTop: 4,
	},
	selectedIndicatorText: {
		color: "#fff",
		fontSize: 12,
		fontWeight: "600",
		marginLeft: 4,
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
		padding: 12,
		backgroundColor: "#F9FAFB",
		marginBottom: 16,
		alignItems: "center",
	},
	noFileText: {
		fontSize: 14,
		color: colors.text,
		opacity: 0.7,
	},
	buttonContainer: {
		flexDirection: "row",
		gap: 8,
		marginTop: 8,
	},
	approveButton: {
		backgroundColor: colors.maroon,
		borderRadius: 8,
		paddingVertical: 12,
		paddingHorizontal: 24,
		alignItems: "center",
		justifyContent: "center",
		flex: 1,
	},
	approveButtonDisabled: {
		backgroundColor: "#D1D5DB",
	},
	approveButtonText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "700",
	},
	commentButton: {
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: colors.maroon,
		borderRadius: 8,
		paddingVertical: 12,
		paddingHorizontal: 12,
		alignItems: "center",
		justifyContent: "center",
		flex: 1,
	},
	commentButtonText: {
		color: colors.maroon,
		fontSize: 14,
		fontWeight: "700",
		textAlign: "center",
		lineHeight: 16,
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
		flex: 1,
		backgroundColor: "rgba(0, 0, 0, 0.5)",
		justifyContent: "center",
		alignItems: "center",
		padding: 20,
	},
	modalContainer: {
		backgroundColor: "#fff",
		borderRadius: 12,
		width: "100%",
		maxWidth: 500,
		maxHeight: "80%",
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
		fontSize: 18,
		fontWeight: "700",
		color: colors.text,
	},
	closeButton: {
		padding: 4,
	},
	modalContent: {
		padding: 20,
	},
	sectionLabel: {
		fontSize: 16,
		fontWeight: "600",
		color: colors.text,
		marginBottom: 12,
		marginTop: 8,
	},
	fileSelectionContainer: {
		maxHeight: 150,
		marginBottom: 16,
	},
	fileSelectionItem: {
		flexDirection: "row",
		alignItems: "center",
		padding: 12,
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
		padding: 12,
		fontSize: 14,
		color: colors.text,
		minHeight: 100,
		textAlignVertical: "top",
	},
	modalActions: {
		flexDirection: "row",
		justifyContent: "space-between",
		padding: 20,
		borderTopWidth: 1,
		borderTopColor: colors.border,
		gap: 12,
	},
	cancelButton: {
		flex: 1,
		paddingVertical: 12,
		paddingHorizontal: 24,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: colors.border,
		alignItems: "center",
		justifyContent: "center",
	},
	cancelButtonText: {
		fontSize: 14,
		fontWeight: "600",
		color: colors.text,
	},
	submitButton: {
		flex: 1,
		paddingVertical: 12,
		paddingHorizontal: 24,
		borderRadius: 8,
		backgroundColor: colors.maroon,
		alignItems: "center",
		justifyContent: "center",
	},
	submitButtonDisabled: {
		opacity: 0.6,
	},
	submitButtonText: {
		fontSize: 14,
		fontWeight: "600",
		color: "#fff",
	},
});
