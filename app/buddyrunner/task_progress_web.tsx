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
	View,
	Alert,
	TextInput,
	ActivityIndicator,
	useWindowDimensions,
} from "react-native";
import * as Linking from "expo-linking";
import { supabase } from "../../lib/supabase";

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
	meetup_location: string | null;
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
function titleCase(s?: string | null) {
	if (!s) return "";
	return s
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : w))
		.join(" ");
}

type ProfileRow = { id: string; role: string | null; first_name: string | null; last_name: string | null; is_blocked?: boolean | null; is_settlement_blocked?: boolean | null };

function useAuthProfile() {
	const router = useRouter();
	const [loading, setLoading] = React.useState(true);
	const [fullName, setFullName] = React.useState<string>("");
	const [roleLabel, setRoleLabel] = React.useState<string>("");
	const [profilePictureUrl, setProfilePictureUrl] = React.useState<string | null>(null);

	const fetchProfile = React.useCallback(async () => {
		try {
			const { data: userRes } = await supabase.auth.getUser();
			const user = userRes?.user;
			if (!user) { setLoading(false); return; }
			const { data: row } = await supabase
				.from("users")
				.select("id, role, first_name, last_name, is_blocked, is_settlement_blocked, created_at, profile_picture_url")
				.eq("id", user.id)
				.single<ProfileRow & { created_at: string; profile_picture_url: string | null; is_blocked?: boolean | null; is_settlement_blocked?: boolean | null }>();

			// Check if user is blocked (disciplinary or settlement-based)
			if (row?.is_blocked || row?.is_settlement_blocked) {
				console.log('User is blocked, logging out...');
				await supabase.auth.signOut();
				router.replace('/login');
				return;
			}

			// Check for unpaid system fees for BuddyRunners (every 6 days from registration)
			const role = (row?.role || '').trim().toLowerCase();
			
			if (role === 'buddyrunner' && row?.created_at) {
				const registrationDate = new Date(row.created_at);
				const today = new Date();
				const daysSinceRegistration = Math.floor((today.getTime() - registrationDate.getTime()) / (1000 * 60 * 60 * 24));
				
				// Check if 6 days or more have passed since registration
				if (daysSinceRegistration >= 6) {
					// Check for unpaid settlements (case-insensitive status check)
					// Order by updated_at descending to get the most recent data first
					// Include transactions and earnings to filter out empty settlements
					const { data: allSettlements, error: settlementError } = await supabase
						.from('settlements')
						.select('id, status, updated_at, paid_at, total_transactions, total_earnings, period_start_date, period_end_date')
						.eq('user_id', user.id)
						.order('updated_at', { ascending: false })
						.limit(100);
					
					if (settlementError) {
						console.error('Error checking settlements:', settlementError);
					} else {
						// CRITICAL: Only block access if:
						// 1. Status is 'overdue' (period_end_date has passed) - block immediately
						// 2. OR status is 'pending' AND period_end_date was more than 6 days ago (grace period)
						// 3. AND it has transactions > 0 OR earnings > 0 (actual work was done)
						const unpaidSettlements = (allSettlements || []).filter(s => {
							if (!s.status) return false;
							const normalizedStatus = s.status.toLowerCase().trim();
							
							// Check if this settlement has actual work
							const transactions = s.total_transactions || 0;
							const earnings = parseFloat(s.total_earnings?.toString() || '0');
							
							// Only consider it unpaid if there was actual work
							// Settlements with 0 transactions and 0 earnings shouldn't block access
							if (transactions === 0 && earnings === 0) {
								console.log('⚠️ Ignoring empty settlement (0 transactions, 0 earnings):', {
									id: s.id,
									status: s.status,
									transactions,
									earnings
								});
								return false;
							}
							
							// If status is 'overdue', block immediately (period_end_date has passed)
							if (normalizedStatus === 'overdue') {
								return true;
							}
							
							// If status is 'pending', check if it's past the 6-day grace period
							if (normalizedStatus === 'pending') {
								if (s.period_end_date) {
									const periodEndDate = new Date(s.period_end_date);
									const today = new Date();
									const daysSincePeriodEnd = Math.floor((today.getTime() - periodEndDate.getTime()) / (1000 * 60 * 60 * 24));
									
									// Only block if period ended 6+ days ago
									if (daysSincePeriodEnd >= 6) {
										return true;
									} else {
										console.log('✅ Settlement is pending but not yet overdue (within 6-day grace period):', {
											id: s.id,
											period: `${s.period_start_date} - ${s.period_end_date}`,
											daysSincePeriodEnd: daysSincePeriodEnd,
											status: s.status
										});
										return false;
									}
								}
							}
							
							return false;
						});
					
						// If there are unpaid settlements, block access
						if (unpaidSettlements.length > 0) {
							console.log('Unpaid system fees detected, logging out...', {
								userId: user.id,
								unpaidCount: unpaidSettlements.length
							});
							await supabase.auth.signOut();
							router.replace('/login');
							return;
						}
					}
				}
			}
			const f = titleCase(row?.first_name || "");
			const l = titleCase(row?.last_name || "");
			const finalFull = (f && l ? `${f} ${l}` : "").trim() || "User";
			setFullName(finalFull);
			const roleRaw = (row?.role || "").toString().toLowerCase();
			setRoleLabel(roleRaw === "buddyrunner" ? "BuddyRunner" : roleRaw === "buddycaller" ? "BuddyCaller" : "");
			setProfilePictureUrl(row?.profile_picture_url || null);
		} finally { setLoading(false); }
	}, [router]);

	React.useEffect(() => {
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
	const { loading, fullName, roleLabel, profilePictureUrl } = useAuthProfile();
	const { width } = useWindowDimensions();

	// Responsive sidebar: hide completely on small screens (< 1024px), show on larger screens
	const isSmallScreen = width < 1024;
	const [open, setOpen] = useState(!isSmallScreen);
	
	// On small screens, start with sidebar closed (hidden)
	// On larger screens, start with sidebar open
	useEffect(() => {
		if (isSmallScreen) {
			setOpen(false);
		} else {
			setOpen(true);
		}
	}, [isSmallScreen]);
	
	// Debug: Log URL parameters
	console.log("=== URL PARAMS DEBUG (WEB) ===");
	console.log("Raw id from useLocalSearchParams:", id);
	console.log("ID type:", typeof id);
	console.log("ID includes comma:", id?.includes(','));
	console.log("Parsed numeric ID:", Number(id));
	console.log("Is NaN:", isNaN(Number(id)));
	console.log("Is finite:", isFinite(Number(id)));
	console.log("All search params:", useLocalSearchParams());
	console.log("=== END URL PARAMS DEBUG (WEB) ===");
	
	// Monitor ID changes
	useEffect(() => {
		console.log("=== ID CHANGE MONITOR (WEB) ===");
		console.log("ID changed to:", id);
		console.log("ID type:", typeof id);
		console.log("ID length:", id?.toString().length);
		console.log("=== END ID CHANGE MONITOR (WEB) ===");
	}, [id]);

	// Get current user ID
	useEffect(() => {
		const getCurrentUser = async () => {
			try {
				const { data: { user } } = await supabase.auth.getUser();
				if (user) {
					setCurrentUserId(user.id);
					console.log("Current user ID (WEB):", user.id);
				}
			} catch (error) {
				console.error("Error getting current user (WEB):", error);
			}
		};
		getCurrentUser();
	}, []);
	
	const [dataLoading, setDataLoading] = useState(true);
	const [commission, setCommission] = useState<Commission | null>(null);
	const [caller, setCaller] = useState<User | null>(null);
	const [taskStatus, setTaskStatus] = useState<TaskStatus>("requested");
	const [uploadedFiles, setUploadedFiles] = useState<Array<{
		id: string;
		url: string;
		name: string;
		type: string;
		size?: number;
		uploadedAt: string;
	}>>([]);
	const [textInput, setTextInput] = useState<string>("");
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
	const [isUpdating, setIsUpdating] = useState(false);
	const [isUploading, setIsUploading] = useState(false);
	const [currentUserId, setCurrentUserId] = useState<string | null>(null);
	const [revisionNotes, setRevisionNotes] = useState<string | null>(null);
	const [revisionRequestedAt, setRevisionRequestedAt] = useState<string | null>(null);
	const [revisionCount, setRevisionCount] = useState<number>(0);
	const [revisionCompletedAt, setRevisionCompletedAt] = useState<string | null>(null);
	const [isRevisionUpload, setIsRevisionUpload] = useState(false);
	const [selectedFilesForRevision, setSelectedFilesForRevision] = useState<Array<{url: string, name: string}>>([]);
	const [revisedFiles, setRevisedFiles] = useState<Array<{
		id: string;
		url: string;
		name: string;
		type: string;
		size?: number;
		uploadedAt: string;
	}>>([]);
	const [uploadType, setUploadType] = useState<'file' | 'link' | null>(null);
	const [linkInput, setLinkInput] = useState<string>("");
	const [showUploadTypeModal, setShowUploadTypeModal] = useState<boolean>(false);
	const [invoiceAmount, setInvoiceAmount] = useState<number | null>(null);

	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleTextboxPress = () => {
		if (!id) {
			Alert.alert("Error", "Commission ID is missing.");
			return;
		}

		// Show upload type selection modal
		setShowUploadTypeModal(true);
	};

	const handleFileSelection = () => {
		// If there's already a selected file, don't allow changing it
		if (selectedFile) {
			Alert.alert("File Selected", "A file has already been selected. Clear the textbox first if you want to select a different file.");
			return;
		}

		// Trigger file selection for any file type
		if (fileInputRef.current) {
			fileInputRef.current.accept = "*/*"; // Allow any file type
			fileInputRef.current.multiple = false;
			fileInputRef.current.click();
		}
	};

	const handleTextChange = (text: string) => {
		// Always allow text editing, even when file is selected
		setTextInput(text);
	};

	const handleLinkUpload = async () => {
		if (!linkInput.trim()) {
			Alert.alert("Error", "Please enter a valid link.");
			return;
		}

		// Validate URL format
		try {
			new URL(linkInput);
		} catch {
			Alert.alert("Error", "Please enter a valid URL (e.g., https://example.com).");
			return;
		}

		// Create a link object similar to file objects
		const linkObject = {
			uri: linkInput,
			name: linkInput,
			type: "link",
			size: 0,
		} as any;

		// Add to selected files
		setSelectedFiles([linkObject]);
		setUploadType(null); // Reset upload type
		setLinkInput(""); // Clear link input
	};

	const handleLinkInputChange = (text: string) => {
		setLinkInput(text);
	};

	const handleUploadTypeSelection = (type: 'file' | 'link') => {
		setUploadType(type);
		setShowUploadTypeModal(false);
		
		if (type === 'file') {
			handleFileSelection();
		}
	};

	const handleCloseUploadTypeModal = () => {
		setShowUploadTypeModal(false);
	};

	const handleClearInput = () => {
		setTextInput("");
		setSelectedFile(null);
		setSelectedFiles([]);
	};

	const handleRemoveSelectedFile = (indexToRemove: number) => {
		setSelectedFiles(prevFiles => 
			prevFiles.filter((_, index) => index !== indexToRemove)
		);
	};

	const handleUploadFile = async () => {
		console.log("=== HANDLE UPLOAD FILE DEBUG (WEB) ===");
		console.log("Current id value:", id);
		console.log("ID type:", typeof id);
		console.log("Selected files count:", selectedFiles.length);
		console.log("=== END HANDLE UPLOAD FILE DEBUG (WEB) ===");
		
		if (!id) {
			Alert.alert("Error", "Commission ID is missing.");
			return;
		}

		if (selectedFiles.length === 0) {
			Alert.alert("Error", "Please select files first.");
			return;
		}

		// Handle multiple file upload
		await handleMultipleFileUpload(selectedFiles);
	};

	const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
		const files = event.target.files;
		if (!files || files.length === 0) {
			console.log("No files selected.");
			return;
		}

		// Convert FileList to Array
		const fileArray = Array.from(files);
		setSelectedFiles(fileArray);
	};

	const handleFileUpload = async (file: File) => {
		try {
			setIsUploading(true);
			
			// Debug: Log the ID to see what we're getting
			console.log("Commission ID received:", id, "Type:", typeof id);
			
			// Ensure we have a valid commission ID
			if (!id) {
				throw new Error("Commission ID is missing");
			}
			
			// Handle comma-separated IDs by taking the first one
			let idToUse = id;
			if (typeof id === 'string' && id.includes(',')) {
				idToUse = id.split(',')[0].trim();
				console.log("Extracted ID from comma-separated string:", idToUse);
			}
			
			// Convert to number and validate
			const numericId = parseInt(idToUse.toString(), 10);
			if (isNaN(numericId)) {
				throw new Error(`Invalid commission ID format: ${idToUse}`);
			}
			
			console.log("Using numeric ID:", numericId);

			// Upload the file
			const fileExtension = file.name.split(".").pop() || "unknown";
			const timestamp = Date.now();
			const randomId = Math.random().toString(36).substr(2, 9);
			const fileName = `${timestamp}-${randomId}.${fileExtension}`;
			const userId = currentUserId || 'anonymous';
			const filePath = `${userId}/${fileName}`;

			// Use the correct content type for the file
			let contentType = file.type || "application/octet-stream";
			let fileToUpload: File | Blob = file;

			// Optimize image files for WEB (only if it's an image)
			if (file.type && file.type.startsWith('image/')) {
				try {
					const blob = await file.arrayBuffer().then(buf => new Blob([buf], { type: file.type }));
					console.log('Task file image fetched, original size:', blob.size, 'bytes');

					const { optimizeImageForUpload } = await import('../../utils/imageOptimization.web');
					const optimizedBlob = await optimizeImageForUpload(blob);
					console.log('Task file image optimized, new size:', optimizedBlob.size, 'bytes');

					// Convert optimized blob back to File
					fileToUpload = new File([optimizedBlob], file.name, {
						type: optimizedBlob.type || file.type,
					});
					contentType = optimizedBlob.type || file.type;
				} catch (optimizeError) {
					console.warn('Task file image optimization failed, using original:', optimizeError);
					// Continue with original file if optimization fails
				}
			}

			const { data, error: uploadError } = await supabase.storage
				.from("task-uploads")
				.upload(filePath, fileToUpload, {
					cacheControl: "3600",
					upsert: false,
					contentType: contentType,
				});

			if (uploadError) {
				throw uploadError;
			}

			const { data: publicUrlData } = supabase.storage
				.from("task-uploads")
				.getPublicUrl(filePath);

			const publicUrl = publicUrlData.publicUrl;

			// Create new file entry
			// Get file size properly (use optimized file size if it was optimized)
			const fileSize = (fileToUpload instanceof File ? fileToUpload.size : (fileToUpload as Blob).size) || file.size || 0;
			console.log("=== FILE SIZE DEBUG (WEB) ===");
			console.log("Original file.size:", file.size);
			console.log("Processed fileSize:", fileSize);
			console.log("File size type:", typeof fileSize);
			console.log("=== END FILE SIZE DEBUG (WEB) ===");

			const newFile = {
				id: `${numericId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
				url: publicUrl,
				name: file.name,
				type: file.name.split('.').pop()?.toLowerCase() || "unknown",
				size: fileSize,
				uploadedAt: new Date().toISOString(),
			};

		// Check if this is a revision upload
		const isRevisionUpload = taskStatus === 'revision';
		
		console.log("=== WEB SINGLE FILE REVISION UPLOAD DEBUG ===");
		console.log("taskStatus:", taskStatus);
		console.log("isRevisionUpload:", isRevisionUpload);
		console.log("uploadedFiles.length:", uploadedFiles.length);
		console.log("revisedFiles.length:", revisedFiles.length);
		console.log("Original file name:", file.name);
		console.log("File name length:", file.name.length);
		console.log("=== END WEB SINGLE FILE REVISION UPLOAD DEBUG ===");
		
		let currentFiles, fileUrls, fileTypes, fileSizes, fileNames, uploadedAt;
			
			if (isRevisionUpload) {
				// For revision uploads, use revised files
				const currentRevisedFiles = [...revisedFiles, newFile];
				fileUrls = currentRevisedFiles.map(f => f.url).join(',');
				fileTypes = currentRevisedFiles.map(f => f.type).join(',');
				fileSizes = currentRevisedFiles.map(f => f.size || 0).join(',');
				fileNames = currentRevisedFiles.map(f => f.name).join(',');
				uploadedAt = new Date().toISOString();
				currentFiles = currentRevisedFiles;
			} else {
				// For original uploads, use uploaded files
				const currentUploadedFiles = [...uploadedFiles, newFile];
				fileUrls = currentUploadedFiles.map(f => f.url).join(',');
				fileTypes = currentUploadedFiles.map(f => f.type).join(',');
				fileSizes = currentUploadedFiles.map(f => f.size || 0).join(',');
				fileNames = currentUploadedFiles.map(f => f.name).join(',');
				uploadedAt = new Date().toISOString();
				currentFiles = currentUploadedFiles;
			}

			// Get runner_id and caller_id from commission data
			let runnerId: string | null = null;
			let callerId: string | null = null;
			
			try {
				const { data: commissionData } = await supabase
					.from('commission')
					.select('runner_id, buddycaller_id')
					.eq('id', numericId)
					.single();
				
				if (commissionData) {
					runnerId = commissionData.runner_id;
					callerId = commissionData.buddycaller_id;
					console.log("Found runner_id:", runnerId, "and caller_id:", callerId);
				}
			} catch (error) {
				console.error("Error fetching commission data for IDs:", error);
			}

			// Debug: Log the data being sent to database
			console.log("=== MULTIPLE FILE UPLOAD DEBUG (WEB) ===");
			console.log("Commission ID:", numericId);
			console.log("File URLs:", fileUrls);
			console.log("File Types:", fileTypes);
			console.log("File Sizes:", fileSizes);
			console.log("File Names:", fileNames);
			console.log("Runner ID:", runnerId);
			console.log("Caller ID:", callerId);
			console.log("=== END MULTIPLE FILE UPLOAD DEBUG (WEB) ===");

			// Update the task_progress table with all file information
			// First try to update existing record
			const updateData = isRevisionUpload ? {
				revised_file_url: fileUrls,
				revised_file_type: fileTypes,
				revised_file_size: fileSizes,
				revised_file_name: fileNames,
				revised_uploaded_at: uploadedAt,
				status: 'revision',
				file_uploaded: true,
				runner_id: runnerId,
				caller_id: callerId
			} : {
					file_url: fileUrls,
					file_type: fileTypes,
					file_size: fileSizes,
				file_name: fileNames,
				uploaded_at: uploadedAt,
				status: 'file_uploaded',
				file_uploaded: true,
				runner_id: runnerId,
				caller_id: callerId
			};
			
			const { data: updateResult, error: updateError } = await supabase
				.from("task_progress")
				.update(updateData)
				.eq("commission_id", numericId)
				.select();

			console.log("Update result (WEB):", { updateData, updateError });

			// If no rows were updated (empty array), insert a new record
			if (updateError) {
				console.error("Database update error:", updateError);
				throw updateError;
			} else if (!updateResult || updateResult.length === 0) {
				console.log("No existing record found, inserting new record");
				const insertData = isRevisionUpload ? {
					commission_id: numericId,
					revised_file_url: fileUrls,
					revised_file_type: fileTypes,
					revised_file_size: fileSizes,
					revised_file_name: fileNames,
					revised_uploaded_at: uploadedAt,
					status: 'revision',
					file_uploaded: true,
					runner_id: runnerId,
					caller_id: callerId
				} : {
					commission_id: numericId,
					file_url: fileUrls,
					file_type: fileTypes,
					file_size: fileSizes,
					file_name: fileNames,
					uploaded_at: uploadedAt,
					status: 'file_uploaded',
					file_uploaded: true,
					runner_id: runnerId,
					caller_id: callerId
				};
				
				const { error: insertError } = await supabase
					.from("task_progress")
					.insert(insertData);
				
				console.log("Insert result (WEB):", { insertError });
				
				if (insertError) {
					console.error("Database insert error:", insertError);
					throw insertError;
				}
				console.log("Successfully inserted new task progress record with IDs");
			} else {
				console.log("Successfully updated existing task progress record with IDs");
				console.log("Updated record (WEB):", updateResult[0]);
			}

			// Update state with new file
			setUploadedFiles(currentFiles);
			setTextInput(""); // Clear the input
			setSelectedFile(null); // Clear selected file
			Alert.alert("Success", "File uploaded successfully!");
		} catch (error: any) {
			console.error("Error uploading file:", error);
			let errorMessage = "Failed to upload file";
			
			if (error.message) {
				if (error.message.includes("Bucket not found")) {
					errorMessage = "Storage bucket not configured. Please contact support or check the setup instructions.";
				} else if (error.message.includes("mime type") && error.message.includes("not supported")) {
					errorMessage = "File type not supported. Please try a different file or contact support.";
				} else {
					errorMessage += `: ${error.message}`;
				}
			} else if (error.error) {
				errorMessage += `: ${error.error}`;
			} else {
				errorMessage += ": Unknown error occurred";
			}
			
			Alert.alert("Error", errorMessage);
		} finally {
			setIsUploading(false);
			// Clear the file input value to allow re-uploading the same file
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		}
	};

	const handleMultipleFileUpload = async (files: File[]) => {
		try {
			setIsUploading(true);
			
			// Debug: Log the ID to see what we're getting
			console.log("=== UPLOAD DEBUG START (WEB) ===");
			console.log("Commission ID received:", id, "Type:", typeof id);
			console.log("ID length:", id?.toString().length);
			console.log("ID includes comma:", id?.toString().includes(','));
			
			// Ensure we have a valid commission ID
			if (!id) {
				throw new Error("Commission ID is missing");
			}
			
			// Handle comma-separated IDs by taking the first one
			let idToUse = id;
			if (typeof id === 'string' && id.includes(',')) {
				const parts = id.split(',');
				console.log("Comma-separated parts:", parts);
				idToUse = parts[0].trim();
				console.log("Extracted ID from comma-separated string:", idToUse);
			}
			
			// Convert to number and validate
			const numericId = parseInt(idToUse.toString(), 10);
			console.log("Parsed numeric ID:", numericId);
			console.log("Is NaN:", isNaN(numericId));
			console.log("Is finite:", Number.isFinite(numericId));
			
			if (isNaN(numericId) || numericId <= 0) {
				throw new Error(`Invalid commission ID format: ${idToUse} (original: ${id})`);
			}
			
			console.log("Final numeric ID for upload:", numericId);
			console.log("=== UPLOAD DEBUG END (WEB) ===");

			// Upload all files
			const uploadPromises = files.map(async (file) => {
				// Handle links differently from files
				if ((file as any).type === "link") {
					// For links, we don't need to upload to storage, just use the URL directly
					return {
						id: `${numericId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
						url: (file as any).uri,
						name: (file as any).name,
						type: "link",
						size: 0,
						uploadedAt: new Date().toISOString(),
					};
				}

				const fileExtension = file.name.split(".").pop() || "unknown";
				const timestamp = Date.now();
				const randomId = Math.random().toString(36).substr(2, 9);
				const fileName = `${timestamp}-${randomId}.${fileExtension}`;
				const userId = currentUserId || 'anonymous';
				const filePath = `${userId}/${fileName}`;

				// Use the correct content type for the file
				const contentType = file.type || "application/octet-stream";

				const { data, error: uploadError } = await supabase.storage
					.from("task-uploads")
					.upload(filePath, file, {
						cacheControl: "3600",
						upsert: false,
						contentType: contentType,
					});

				if (uploadError) {
					throw uploadError;
				}

				const { data: publicUrlData } = supabase.storage
					.from("task-uploads")
					.getPublicUrl(filePath);

				// Get file size properly
				const fileSize = file.size || 0;
				console.log("=== MULTIPLE FILE SIZE DEBUG (WEB) ===");
				console.log("Original file.size:", file.size);
				console.log("Processed fileSize:", fileSize);
				console.log("File size type:", typeof fileSize);
				console.log("=== END MULTIPLE FILE SIZE DEBUG (WEB) ===");

				return {
					id: `${numericId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
					url: publicUrlData.publicUrl,
					name: file.name,
					type: file.name.split('.').pop()?.toLowerCase() || "unknown",
					size: fileSize,
					uploadedAt: new Date().toISOString(),
				};
			});

			// Wait for all uploads to complete
			const newFiles = await Promise.all(uploadPromises);

			// Check if this is a revision upload
			const isRevisionUpload = taskStatus === 'revision';
			
			console.log("=== WEB MULTIPLE FILE REVISION UPLOAD DEBUG ===");
			console.log("taskStatus:", taskStatus);
			console.log("isRevisionUpload:", isRevisionUpload);
			console.log("uploadedFiles.length:", uploadedFiles.length);
			console.log("revisedFiles.length:", revisedFiles.length);
			console.log("=== END WEB MULTIPLE FILE REVISION UPLOAD DEBUG ===");
			
			let currentFiles, fileUrls, fileTypes, fileSizes, fileNames, uploadedAt;
			
			if (isRevisionUpload) {
				// For revision uploads, use revised files
				const currentRevisedFiles = [...revisedFiles, ...newFiles];
				fileUrls = currentRevisedFiles.map(f => f.url).join(',');
				fileTypes = currentRevisedFiles.map(f => f.type).join(',');
				fileSizes = currentRevisedFiles.map(f => f.size || 0).join(',');
				fileNames = currentRevisedFiles.map(f => f.name).join(',');
				uploadedAt = new Date().toISOString();
				currentFiles = currentRevisedFiles;
			} else {
				// For original uploads, use uploaded files
				const currentUploadedFiles = [...uploadedFiles, ...newFiles];
				fileUrls = currentUploadedFiles.map(f => f.url).join(',');
				fileTypes = currentUploadedFiles.map(f => f.type).join(',');
				fileSizes = currentUploadedFiles.map(f => f.size || 0).join(',');
				fileNames = currentUploadedFiles.map(f => f.name).join(',');
				uploadedAt = new Date().toISOString();
				currentFiles = currentUploadedFiles;
			}

			// Get runner_id and caller_id from commission data
			let runnerId: string | null = null;
			let callerId: string | null = null;
			
			try {
				const { data: commissionData } = await supabase
					.from('commission')
					.select('runner_id, buddycaller_id')
					.eq('id', numericId)
					.single();
				
				if (commissionData) {
					runnerId = commissionData.runner_id;
					callerId = commissionData.buddycaller_id;
					console.log("Found runner_id:", runnerId, "and caller_id:", callerId);
				}
			} catch (error) {
				console.error("Error fetching commission data for IDs:", error);
			}

			// Debug: Log the data being sent to database
			console.log("=== MULTIPLE FILE UPLOAD DEBUG (WEB) ===");
			console.log("Commission ID:", numericId);
			console.log("File URLs:", fileUrls);
			console.log("File Types:", fileTypes);
			console.log("File Sizes:", fileSizes);
			console.log("File Names:", fileNames);
			console.log("Runner ID:", runnerId);
			console.log("Caller ID:", callerId);
			console.log("=== END MULTIPLE FILE UPLOAD DEBUG (WEB) ===");

			// Update the task_progress table with all file information
			// First try to update existing record
			const updateData = isRevisionUpload ? {
				revised_file_url: fileUrls,
				revised_file_type: fileTypes,
				revised_file_size: fileSizes,
				revised_file_name: fileNames,
				revised_uploaded_at: uploadedAt,
				status: 'revision',
				file_uploaded: true,
				runner_id: runnerId,
				caller_id: callerId
			} : {
					file_url: fileUrls,
					file_type: fileTypes,
					file_size: fileSizes,
				file_name: fileNames,
				uploaded_at: uploadedAt,
				status: 'file_uploaded',
				file_uploaded: true,
				runner_id: runnerId,
				caller_id: callerId
			};
			
			const { data: updateResult, error: updateError } = await supabase
				.from("task_progress")
				.update(updateData)
				.eq("commission_id", numericId)
				.select();

			console.log("Update result (WEB):", { updateData, updateError });

			// If no rows were updated (empty array), insert a new record
			if (updateError) {
				console.error("Database update error:", updateError);
				throw updateError;
			} else if (!updateResult || updateResult.length === 0) {
				console.log("No existing record found, inserting new record");
				const insertData = isRevisionUpload ? {
					commission_id: numericId,
					revised_file_url: fileUrls,
					revised_file_type: fileTypes,
					revised_file_size: fileSizes,
					revised_file_name: fileNames,
					revised_uploaded_at: uploadedAt,
					status: 'revision',
					file_uploaded: true,
					runner_id: runnerId,
					caller_id: callerId
				} : {
					commission_id: numericId,
					file_url: fileUrls,
					file_type: fileTypes,
					file_size: fileSizes,
					file_name: fileNames,
					uploaded_at: uploadedAt,
					status: 'file_uploaded',
					file_uploaded: true,
					runner_id: runnerId,
					caller_id: callerId
				};
				
				const { error: insertError } = await supabase
					.from("task_progress")
					.insert(insertData);
				
				console.log("Insert result (WEB):", { insertError });
				
				if (insertError) {
					console.error("Database insert error:", insertError);
					throw insertError;
				}
				console.log("Successfully inserted new task progress record with IDs");
			} else {
				console.log("Successfully updated existing task progress record with IDs");
				console.log("Updated record (WEB):", updateResult[0]);
			}

			// Update state with new files
			setUploadedFiles(currentFiles);
			setSelectedFiles([]); // Clear selected files
			Alert.alert("Success", `${files.length} file(s) uploaded successfully!`);
		} catch (error: any) {
			console.error("Error uploading files:", error);
			let errorMessage = "Failed to upload files";
			
			if (error.message) {
				if (error.message.includes("Bucket not found")) {
					errorMessage = "Storage bucket not configured. Please contact support or check the setup instructions.";
				} else if (error.message.includes("mime type") && error.message.includes("not supported")) {
					errorMessage = "File type not supported. Please try a different file or contact support.";
				} else {
					errorMessage += `: ${error.message}`;
				}
			} else if (error.error) {
				errorMessage += `: ${error.error}`;
			} else {
				errorMessage += ": Unknown error occurred";
			}
			
			Alert.alert("Error", errorMessage);
		} finally {
			setIsUploading(false);
			// Clear the file input value to allow re-uploading the same file
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		}
	};


	const handleTextUpload = async () => {
		if (!id) {
			Alert.alert("Error", "Commission ID is missing.");
			return;
		}
		if (!textInput.trim()) {
			Alert.alert("Error", "Please enter some text or select a file.");
			return;
		}

		try {
			setIsUploading(true);
			const numericId = Number(id);

			// Check if it's a revision upload
			const isRevisionUpload = taskStatus === 'revision';

			// Check if it's a URL
			const urlRegex = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;
			const isUrl = urlRegex.test(textInput.trim());

			// Create new text/link entry
			const newEntry = {
				id: `${numericId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
				url: textInput.trim(),
				name: isUrl ? textInput.trim() : `Text: ${textInput.trim().substring(0, 50)}${textInput.trim().length > 50 ? '...' : ''}`,
				type: isUrl ? "link" : "text",
				size: 0,
				uploadedAt: new Date().toISOString(),
			};

			// Get current files and add new entry
			const currentFiles = [...uploadedFiles, newEntry];
			const fileUrls = currentFiles.map(f => f.url).join(',');
			const fileTypes = currentFiles.map(f => f.type).join(',');
			const fileSizes = currentFiles.map(f => f.size || 0).join(',');
			const fileNames = currentFiles.map(f => f.name).join(',');
			const uploadedAt = new Date().toISOString();

			// Get runner_id and caller_id from commission data
			let runnerId: string | null = null;
			let callerId: string | null = null;
			
			try {
				const { data: commissionData } = await supabase
					.from('commission')
					.select('runner_id, buddycaller_id')
					.eq('id', numericId)
					.single();
				
				if (commissionData) {
					runnerId = commissionData.runner_id;
					callerId = commissionData.buddycaller_id;
					console.log("Found runner_id:", runnerId, "and caller_id:", callerId);
				}
			} catch (error) {
				console.error("Error fetching commission data for IDs:", error);
			}

			// Debug: Log the data being sent to database
			console.log("=== MULTIPLE FILE UPLOAD DEBUG (WEB) ===");
			console.log("Commission ID:", numericId);
			console.log("File URLs:", fileUrls);
			console.log("File Types:", fileTypes);
			console.log("File Sizes:", fileSizes);
			console.log("File Names:", fileNames);
			console.log("Runner ID:", runnerId);
			console.log("Caller ID:", callerId);
			console.log("=== END MULTIPLE FILE UPLOAD DEBUG (WEB) ===");

			// Update the task_progress table with all file information
			// First try to update existing record
			const updateData = isRevisionUpload ? {
				revised_file_url: fileUrls,
				revised_file_type: fileTypes,
				revised_file_size: fileSizes,
				revised_file_name: fileNames,
				revised_uploaded_at: uploadedAt,
				status: 'revision',
				file_uploaded: true,
				runner_id: runnerId,
				caller_id: callerId
			} : {
					file_url: fileUrls,
					file_type: fileTypes,
					file_size: fileSizes,
				file_name: fileNames,
				uploaded_at: uploadedAt,
				status: 'file_uploaded',
				file_uploaded: true,
				runner_id: runnerId,
				caller_id: callerId
			};
			
			const { data: updateResult, error: updateError } = await supabase
				.from("task_progress")
				.update(updateData)
				.eq("commission_id", numericId)
				.select();

			console.log("Update result (WEB):", { updateData, updateError });

			// If no rows were updated (empty array), insert a new record
			if (updateError) {
				console.error("Database update error:", updateError);
				throw updateError;
			} else if (!updateResult || updateResult.length === 0) {
				console.log("No existing record found, inserting new record");
				const insertData = isRevisionUpload ? {
					commission_id: numericId,
					revised_file_url: fileUrls,
					revised_file_type: fileTypes,
					revised_file_size: fileSizes,
					revised_file_name: fileNames,
					revised_uploaded_at: uploadedAt,
					status: 'revision',
					file_uploaded: true,
					runner_id: runnerId,
					caller_id: callerId
				} : {
					commission_id: numericId,
					file_url: fileUrls,
					file_type: fileTypes,
					file_size: fileSizes,
					file_name: fileNames,
					uploaded_at: uploadedAt,
					status: 'file_uploaded',
					file_uploaded: true,
					runner_id: runnerId,
					caller_id: callerId
				};
				
				const { error: insertError } = await supabase
					.from("task_progress")
					.insert(insertData);
				
				console.log("Insert result (WEB):", { insertError });
				
				if (insertError) {
					console.error("Database insert error:", insertError);
					throw insertError;
				}
				console.log("Successfully inserted new task progress record with IDs");
			} else {
				console.log("Successfully updated existing task progress record with IDs");
				console.log("Updated record (WEB):", updateResult[0]);
			}

			// Update state with new entry
			setUploadedFiles(currentFiles);
			setTextInput(""); // Clear the input
			Alert.alert("Success", isUrl ? "Link uploaded successfully!" : "Text message uploaded successfully!");
		} catch (error: any) {
			console.error("Error uploading text:", error);
			Alert.alert("Error", `Failed to upload text: ${error.message}`);
		} finally {
			setIsUploading(false);
		}
	};

	const handleViewFile = (fileUrl: string) => {
		window.open(fileUrl, "_blank");
	};

	const handleRemoveFile = async (fileId: string) => {
		console.log("=== WEB HANDLE REMOVE FILE DEBUG ===");
		console.log("*** FUNCTION CALLED *** - handleRemoveFile triggered!");
		console.log("File ID to remove:", fileId);
		console.log("Current uploaded files:", uploadedFiles);
		console.log("Commission ID:", id);
		
		if (!id) {
			console.error("Commission ID is missing");
			Alert.alert("Error", "Commission ID is missing.");
			return;
		}

						try {
							setIsUploading(true);
							
			// Handle different types of ID input (same as mobile version)
							let numericId: number;
			let commissionIdForQuery: string;
			
							if (typeof id === 'string' && id.includes('-')) {
				// This is a UUID, pass it directly to the query
				commissionIdForQuery = id;
				numericId = 0; // Will be handled by .or() query
				console.log("Using UUID directly for query:", id);
							} else {
				// This is a numeric ID
								numericId = parseInt(id, 10);
				commissionIdForQuery = id.toString();
								console.log("Using numeric ID directly:", numericId);
							}
							
			if (!commissionIdForQuery) {
				console.error("Could not determine commission ID from:", id);
								Alert.alert("Error", "Invalid commission ID format");
								return;
							}

							// Filter out the file to be removed
							const fileToRemove = uploadedFiles.find(f => f.id === fileId);
							const updatedFiles = uploadedFiles.filter(f => f.id !== fileId);
			
			console.log("File to remove:", fileToRemove);
			console.log("Updated files after removal:", updatedFiles);
			console.log("Number of remaining files:", updatedFiles.length);
							
							// Update local state immediately for better UX
							setUploadedFiles(updatedFiles);

							if (updatedFiles.length === 0) {
								// If no files left, clear the task progress file fields
				console.log("Clearing all files from database");
				console.log("Query parameters:", `id.eq.${commissionIdForQuery},commission_id.eq.${numericId || 0}`);
				
								const { error } = await supabase
									.from('task_progress')
									.update({
										file_url: null,
										file_type: null,
										file_size: null,
										file_name: null,
										uploaded_at: null,
						status: 'in_progress', // Reset to in_progress if no files
						file_uploaded: false
									})
					.or(`id.eq.${commissionIdForQuery},commission_id.eq.${numericId || 0}`);
								
								if (error) {
									console.error('Error clearing task progress files:', error);
									Alert.alert("Error", "Failed to remove file from database");
									// Revert local state on error
									setUploadedFiles(uploadedFiles);
									return;
								}
							} else {
				// Update with remaining files using direct database query
				console.log("Updating database with remaining files");
								const fileUrls = updatedFiles.map(f => f.url).join(',');
								const fileTypes = updatedFiles.map(f => f.type).join(',');
								const fileSizes = updatedFiles.map(f => f.size || 0).join(',');
								const fileNames = updatedFiles.map(f => f.name).join(',');
								const uploadedAt = new Date().toISOString();

				console.log("File URLs:", fileUrls);
				console.log("File Types:", fileTypes);
				console.log("File Sizes:", fileSizes);
				console.log("File Names:", fileNames);
				console.log("Query parameters:", `id.eq.${commissionIdForQuery},commission_id.eq.${numericId || 0}`);

				const { error } = await supabase
					.from('task_progress')
					.update({
						file_url: fileUrls,
						file_type: fileTypes,
						file_size: fileSizes,
						file_name: fileNames,
						uploaded_at: uploadedAt,
						status: 'file_uploaded',
						file_uploaded: true
					})
					.or(`id.eq.${commissionIdForQuery},commission_id.eq.${numericId || 0}`);
								
								if (error) {
									console.error('Error updating task progress:', error);
									Alert.alert("Error", "Failed to remove file from database");
									// Revert local state on error
									setUploadedFiles(uploadedFiles);
									return;
				} else {
					console.log("Database update successful");
								}
							}
							
							// Also try to delete from Supabase Storage if it's a storage file
							if (fileToRemove && fileToRemove.url && fileToRemove.url.includes('storage.googleapis.com')) {
				console.log("Attempting to delete file from storage:", fileToRemove.url);
								try {
									// Extract file path from URL
									const urlParts = fileToRemove.url.split('/');
									const filePath = urlParts.slice(-2).join('/'); // Get last two parts (folder/filename)
					
					console.log("File path for storage deletion:", filePath);
									
									const { error: storageError } = await supabase.storage
										.from('task-uploads')
										.remove([filePath]);
									
									if (storageError) {
										console.warn('Warning: Could not delete file from storage:', storageError);
										// Don't show error to user as the database update succeeded
					} else {
						console.log("File deleted from storage successfully");
									}
								} catch (storageErr) {
									console.warn('Warning: Could not delete file from storage:', storageErr);
								}
							}
							
			console.log("File removal completed successfully");
						} catch (error: any) {
							console.error("Error removing file:", error);
							Alert.alert("Error", `Failed to remove file: ${error.message}`);
							// Revert local state on error
							setUploadedFiles(uploadedFiles);
						} finally {
							setIsUploading(false);
						}
	};

	const fetchData = useCallback(async () => {
		if (!id) return;
		
		setDataLoading(true);
		try {
			// Debug: Log the raw ID
			console.log("Task Progress Runner Web: Raw ID received:", id, "Type:", typeof id);
			
			// Handle comma-separated IDs by taking the first one
			let idToUse = id;
			if (typeof id === 'string' && id.includes(',')) {
				idToUse = id.split(',')[0].trim();
				console.log("Task Progress Runner Web: Extracted ID from comma-separated string:", idToUse);
			}
			
			// Handle UUID case - if it's a UUID, we need to find the actual commission ID
			let numericId: number;
			
			if (idToUse.includes('-') && idToUse.length > 10) {
				// This is a UUID, we need to find the commission ID from the database
				console.log("UUID detected in fetchData (web), finding commission ID from database:", idToUse);
				
				// Try to find commission ID from task_progress table first
				const { data: taskProgressData } = await supabase
					.from('task_progress')
					.select('commission_id')
					.eq('id', idToUse)
					.single();
				
				if (taskProgressData?.commission_id) {
					numericId = taskProgressData.commission_id;
					console.log("Found commission ID from task_progress:", numericId);
				} else {
					// Try to find from commission table using user IDs
					const { data: commissionData } = await supabase
						.from('commission')
						.select('id')
						.or(`runner_id.eq.${idToUse},buddycaller_id.eq.${idToUse}`)
						.single();
					
					if (commissionData?.id) {
						numericId = commissionData.id;
						console.log("Found commission ID from commission table:", numericId);
					} else {
						throw new Error(`Could not find commission ID for UUID: ${idToUse}`);
					}
				}
			} else {
				// This is a numeric ID
				numericId = parseInt(idToUse.toString(), 10);
			if (isNaN(numericId) || numericId <= 0) {
				throw new Error(`Invalid commission id: ${idToUse} (original: ${id})`);
				}
				console.log("Using numeric commission ID:", numericId);
			}

			console.log("Task Progress Runner Web: Using final numeric ID for fetchData:", numericId);

			// Get current user to verify access
			const { data: { user } } = await supabase.auth.getUser();
			if (!user) {
				setCommission(null);
				setCaller(null);
				return;
			}

			// Fetch commission data
			const { data: cm, error: cmError } = await supabase
				.from("commission")
				.select("*")
				.eq("id", numericId)
				.single();
			
			if (cmError) {
				if (cmError.code === 'PGRST116') {
					// Commission not found
					setCommission(null);
					setCaller(null);
					return;
				}
				throw cmError;
			}

			// Verify the current user is the runner for this commission
			if (cm.runner_id !== user.id) {
				console.error("Task Progress Runner Web: Access denied - user is not the runner for this commission");
				setCommission(null);
				setCaller(null);
				return;
			}

			setCommission(cm as Commission);

			// Fetch caller data
			if (cm.buddycaller_id) {
				const { data: callerData, error: callerError } = await supabase
					.from("users")
					.select("*")
					.eq("id", cm.buddycaller_id)
					.single();
				
				if (callerError) throw callerError;
				setCaller(callerData as User);
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

			// Fetch task progress data
			const { data: taskProgressData, error: taskProgressError } = await supabase
				.from("task_progress")
				.select("*")
				.eq("commission_id", numericId)
				.single();

			if (taskProgressError && taskProgressError.code !== 'PGRST116') {
				throw taskProgressError;
			}

			if (taskProgressData) {
				setTaskStatus(taskProgressData.status as TaskStatus);
				
				console.log("=== WEB FETCH DATA DEBUG ===");
				console.log("taskProgressData.status:", taskProgressData.status);
				console.log("taskProgressData.revised_file_url:", taskProgressData.revised_file_url);
				console.log("taskProgressData.revised_file_type:", taskProgressData.revised_file_type);
				console.log("taskProgressData.revised_file_name:", taskProgressData.revised_file_name);
				console.log("taskProgressData.revised_file_size:", taskProgressData.revised_file_size);
				console.log("=== END WEB FETCH DATA DEBUG ===");
				
				// Load revision data
				setRevisionNotes(taskProgressData.revision_notes || null);
				setRevisionRequestedAt(taskProgressData.revision_requested_at || null);
				setRevisionCount(taskProgressData.revision_count || 0);
				setRevisionCompletedAt(taskProgressData.revision_completed_at || null);
				
				// Load selected files for revision
				if (taskProgressData.selected_files_for_revision) {
					try {
						// Try to parse as JSON first (new format)
						const selectedFilesData = JSON.parse(taskProgressData.selected_files_for_revision);
						if (Array.isArray(selectedFilesData)) {
							setSelectedFilesForRevision(selectedFilesData);
						} else {
							setSelectedFilesForRevision([]);
						}
					} catch (error) {
						// Fallback to old format (comma-separated URLs)
						const selectedFiles = taskProgressData.selected_files_for_revision.split(',').filter(Boolean);
						setSelectedFilesForRevision(selectedFiles.map((url: string) => ({ url, name: url.split('/').pop()?.split('?')[0] || 'Unknown file' })));
					}
				} else {
					setSelectedFilesForRevision([]);
				}
				
				// Check if this is a revision upload (status is revision)
				setIsRevisionUpload(taskProgressData.status === 'revision');
				
				// Set file upload status using new schema
				if (taskProgressData.file_url && taskProgressData.file_url.trim()) {
					try {
						// Parse multiple files from comma-separated values
						console.log("Task Progress Runner Web: Parsing files - file_url:", taskProgressData.file_url);
						console.log("Task Progress Runner Web: Parsing files - file_type:", taskProgressData.file_type);
						console.log("Task Progress Runner Web: Parsing files - file_size:", taskProgressData.file_size);
						console.log("Task Progress Runner Web: Parsing files - file_name:", taskProgressData.file_name);
						console.log("Task Progress Runner Web: file_uploaded flag:", taskProgressData.file_uploaded);
						
						const fileUrls = (taskProgressData.file_url || '').split(',').filter((url: string) => url.trim());
						const fileTypes = taskProgressData.file_type ? (taskProgressData.file_type || '').split(',').filter((type: string) => type.trim()) : [];
						const fileSizes = taskProgressData.file_size && typeof taskProgressData.file_size === 'string' && taskProgressData.file_size.trim() 
							? taskProgressData.file_size.split(',').map((s: string) => parseInt(s.trim()) || 0) 
							: [];
						const fileNames = taskProgressData.file_name ? (taskProgressData.file_name || '').split(',').filter((name: string) => name.trim()) : [];
						const uploadedAt = taskProgressData.uploaded_at || new Date().toISOString();
						
						const files = fileUrls.map((url: string, index: number) => ({
							id: `${numericId}-${index}-${Date.now()}`,
							url: url.trim(),
							name: fileTypes[index] === "link" ? url.trim() : (fileNames[index] && fileNames[index].trim()) || url.split("/").pop()?.split("?")[0] || "Unknown file",
							type: fileTypes[index] || "unknown",
							size: fileSizes[index] || 0,
							uploadedAt: uploadedAt,
						}));
						
						console.log("Task Progress Runner Web: Successfully parsed and set files:", files);
						setUploadedFiles(files);
					} catch (parseError) {
						console.error("Task Progress Runner Web: Error parsing files:", parseError);
						console.log("Task Progress Runner Web: Fallback - treating as single file");
						// Fallback: treat as single file
						setUploadedFiles([{
							id: `${numericId}-0-${Date.now()}`,
							url: taskProgressData.file_url,
							name: taskProgressData.file_type === "link" 
								? taskProgressData.file_url 
								: (taskProgressData.file_name && taskProgressData.file_name.trim()) || taskProgressData.file_url.split("/").pop()?.split("?")[0] || "Unknown file",
							type: taskProgressData.file_type || "unknown",
							size: 0,
							uploadedAt: taskProgressData.uploaded_at || new Date().toISOString(),
						}]);
					}
				} else {
					console.log("Task Progress Runner Web: No files found - file_url:", taskProgressData.file_url, "file_uploaded:", taskProgressData.file_uploaded);
					setUploadedFiles([]);
				}
				
				// Load revised files if they exist
				if (taskProgressData.revised_file_url && taskProgressData.revised_file_url.trim()) {
					try {
						console.log("Task Progress Runner Web: Parsing revised files - revised_file_url:", taskProgressData.revised_file_url);
						console.log("Task Progress Runner Web: Parsing revised files - revised_file_type:", taskProgressData.revised_file_type);
						console.log("Task Progress Runner Web: Parsing revised files - revised_file_size:", taskProgressData.revised_file_size);
						console.log("Task Progress Runner Web: Parsing revised files - revised_file_name:", taskProgressData.revised_file_name);
						
						const revisedFileUrls = (taskProgressData.revised_file_url || '').split(',').filter((url: string) => url.trim());
						const revisedFileTypes = taskProgressData.revised_file_type ? (taskProgressData.revised_file_type || '').split(',').filter((type: string) => type.trim()) : [];
						const revisedFileSizes = taskProgressData.revised_file_size && typeof taskProgressData.revised_file_size === 'string' && taskProgressData.revised_file_size.trim() 
							? taskProgressData.revised_file_size.split(',').map((s: string) => parseInt(s.trim()) || 0) 
							: [];
						const revisedFileNames = taskProgressData.revised_file_name ? (taskProgressData.revised_file_name || '').split(',').filter((name: string) => name.trim()) : [];
						const revisedUploadedAt = taskProgressData.revised_uploaded_at || new Date().toISOString();
					
						const revisedFiles = revisedFileUrls.map((url: string, index: number) => ({
							id: `revised-${numericId}-${index}-${Date.now()}`,
							url: url.trim(),
							name: revisedFileTypes[index] === "link" 
								? url.trim() 
								: (revisedFileNames[index] && revisedFileNames[index].trim()) || url.split("/").pop()?.split("?")[0] || "Unknown file",
							type: revisedFileTypes[index] || "unknown",
							size: revisedFileSizes[index] || 0,
							uploadedAt: revisedUploadedAt,
						}));

						setRevisedFiles(revisedFiles);
						console.log("Task Progress Runner Web: Revised files parsed and set:", revisedFiles);
					} catch (error) {
						console.error("Task Progress Runner Web: Error parsing revised files:", error);
						setRevisedFiles([]);
				}
			} else {
					console.log("Task Progress Runner Web: No revised files found");
					setRevisedFiles([]);
				}
			}
			
			if (!taskProgressData) {
				// No task progress data found, set defaults
				setTaskStatus("requested");
				setUploadedFiles([]);
				setRevisedFiles([]);
			}

		} catch (err: any) {
			console.error("Task progress fetch error:", err);
			Alert.alert("Error", "Failed to load task progress");
		} finally {
			setDataLoading(false);
		}
	}, [id]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	// Add global function for HTML onclick to call
	useEffect(() => {
		(window as any).removeFile = (fileId: string) => {
			console.log("*** GLOBAL REMOVE FILE CALLED ***");
			console.log("File ID:", fileId);
			handleRemoveFile(fileId);
		};
		
		return () => {
			delete (window as any).removeFile;
		};
	}, []);

	// Real-time subscription for task progress updates
	useEffect(() => {
		if (!id) return;

		const channel = supabase
			.channel(`task_progress_runner_web_${id}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'task_progress',
					filter: `commission_id=eq.${parseInt(id?.toString() || '0', 10)}`
				},
				async (payload) => {
					console.log('Task Progress Runner Web: Task progress update received:', payload);
					setIsUpdating(true);
					await fetchData();
					setTimeout(() => setIsUpdating(false), 500);
				}
			)
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	}, [id, fetchData]);

	if (dataLoading) {
		return (
			<SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
				<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
					<Text style={{ color: colors.text, fontSize: 16 }}>Loading...</Text>
				</View>
			</SafeAreaView>
		);
	}

	if (!commission) {
		return (
			<SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
				<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
					<Text style={{ color: colors.text, fontSize: 16, textAlign: "center", marginHorizontal: 20 }}>
						Commission not found or you don't have access to this task.
					</Text>
					<TouchableOpacity 
						style={{ marginTop: 20, padding: 12, backgroundColor: colors.maroon, borderRadius: 8 }}
						onPress={() => router.back()}
					>
						<Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Go Back</Text>
					</TouchableOpacity>
				</View>
			</SafeAreaView>
		);
	}

	if (!caller) {
		return (
			<SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
				<View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
					<Text style={{ color: colors.text, fontSize: 16, textAlign: "center", marginHorizontal: 20 }}>
						Caller information not found.
					</Text>
					<TouchableOpacity 
						style={{ marginTop: 20, padding: 12, backgroundColor: colors.maroon, borderRadius: 8 }}
						onPress={() => router.back()}
					>
						<Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Go Back</Text>
					</TouchableOpacity>
				</View>
			</SafeAreaView>
		);
	}

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
					userRole={roleLabel}
					profilePictureUrl={profilePictureUrl}
				/>

				<View style={web.mainArea}>
					<View style={[web.topBar, isSmallScreen && web.topBarSmall]}>
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
									<TouchableOpacity onPress={() => router.push("/buddyrunner/accepted_tasks_web?type=commissions")} style={[web.backButton, web.backButtonSmall]}>
										<Ionicons name="arrow-back" size={18} color={colors.text} />
									</TouchableOpacity>
								</View>
								{/* Center: Task Progress text */}
								<Text style={[web.welcome, web.welcomeSmall, web.welcomeCentered]}>{loading ? "Loading…" : "Task Progress"}</Text>
								{/* Right side: Notification icon */}
								<TouchableOpacity
									onPress={() => router.push("/buddyrunner/notification")}
									style={web.notificationIcon}
									activeOpacity={0.7}
								>
									<Ionicons name="notifications-outline" size={20} color={colors.text} />
								</TouchableOpacity>
							</>
						) : (
							<>
								<TouchableOpacity onPress={() => router.push("/buddyrunner/accepted_tasks_web?type=commissions")} style={web.backButton}>
							<Ionicons name="arrow-back" size={20} color={colors.text} />
							<Text style={web.backText}>Back</Text>
						</TouchableOpacity>
						<Text style={web.welcome}>{loading ? "Loading…" : "Task Progress"}</Text>
						<TouchableOpacity
							onPress={() => router.push("/buddyrunner/notification")}
							style={web.notificationIcon}
							activeOpacity={0.7}
						>
							<Ionicons name="notifications-outline" size={24} color={colors.text} />
						</TouchableOpacity>
							</>
						)}
					</View>

					<ScrollView contentContainerStyle={{ paddingVertical: 24 }}>
						<View style={[web.container, { maxWidth: 980 }]}>
							{/* Caller Information Card */}
							<View style={web.callerCard}>
								<View style={web.callerHeader}>
									<View style={web.callerAvatar}>
										{caller.profile_picture_url ? (
											<Image source={{ uri: caller.profile_picture_url }} style={web.avatarImage} />
										) : (
											<Ionicons name="person" size={24} color={colors.maroon} />
										)}
									</View>
									<View style={web.callerInfo}>
										<Text style={web.callerName}>
											{caller.first_name} {caller.last_name}
										</Text>
										<Text style={web.callerId}>Student ID: {caller.student_id_number || "N/A"}</Text>
										<Text style={web.callerCourse}>{caller.course || "N/A"}</Text>
									</View>
									<TouchableOpacity 
										style={web.chatButton}
										onPress={() => router.push({
											pathname: "/buddyrunner/start_conversation",
											params: { otherUserId: caller.id }
										})}
									>
										<Ionicons name="chatbubbles" size={20} color={colors.maroon} />
									</TouchableOpacity>
								</View>
								<TouchableOpacity
									style={web.viewProfileButton}
									onPress={() => router.push({
										pathname: "/buddyrunner/profile",
										params: { 
											userId: caller.id,
											isViewingOtherUser: 'true',
											returnTo: 'BuddyRunnerTaskProgress'
										}
									})}
								>
									<Text style={web.viewProfileText}>View Profile</Text>
								</TouchableOpacity>
							</View>

							{/* Revision Request Section */}
							{revisionNotes && (
								<View style={[
									web.revisionCard, 
									{
										backgroundColor: taskStatus === 'completed' ? '#f0fdf4' : '#fff',
										borderColor: taskStatus === 'completed' ? '#22c55e' : '#f59e0b'
									}
								]}>
									<View style={web.revisionHeader}>
										<Ionicons 
											name={taskStatus === 'completed' ? "checkmark-circle" : "alert-circle"} 
											size={24} 
											color={taskStatus === 'completed' ? "#22c55e" : "#eab308"} 
										/>
										<Text style={[web.revisionTitle, { color: taskStatus === 'completed' ? "#22c55e" : "#eab308" }]}>
											{taskStatus === 'completed' ? "Revision Completed" : "Revision Required"}
										</Text>
									</View>
									<Text style={web.revisionMessage}>
										The caller has requested revisions to your work. Please review the feedback below and upload revised files.
									</Text>
									<View style={[
										web.revisionDetails,
										{
											backgroundColor: taskStatus === 'completed' ? '#dcfce7' : '#fef3c7'
										}
									]}>
										<Text style={[
											web.revisionLabel,
											{ color: taskStatus === 'completed' ? '#22c55e' : colors.text }
										]}>Revision Comments:</Text>
										<Text style={[
											web.revisionComments,
											{ color: taskStatus === 'completed' ? '#22c55e' : colors.text }
										]}>{revisionNotes}</Text>
									</View>
									
									{/* Selected Files for Revision */}
									{selectedFilesForRevision.length > 0 && (
										<View style={web.selectedFilesContainer}>
											<Text style={web.selectedFilesLabel}>Files to Revise:</Text>
											<View style={web.selectedFilesList}>
											{selectedFilesForRevision.map((file, index) => (
												<View key={index} style={web.selectedFileItem}>
													<Ionicons name="document" size={16} color={colors.maroon} />
													<Text style={web.selectedFileName}>{file.name}</Text>
												</View>
											))}
											</View>
										</View>
									)}
									
									{revisionRequestedAt && (
										<Text style={web.revisionDate}>
											Requested: {new Date(revisionRequestedAt).toLocaleDateString()} at {new Date(revisionRequestedAt).toLocaleTimeString()}
										</Text>
									)}
									{revisionCount > 0 && (
										<Text style={[
											web.revisionCount,
											{ color: taskStatus === 'completed' ? '#22c55e' : '#f59e0b' }
										]}>
											Revision #{revisionCount}
										</Text>
									)}
								</View>
							)}

							{/* Revision Completed Section */}
							{revisionCompletedAt && (
								<View style={[web.revisionCard, { backgroundColor: '#f0fdf4', borderColor: '#22c55e' }]}>
									<View style={web.revisionHeader}>
										<Ionicons name="checkmark-circle" size={24} color="#22c55e" />
										<Text style={[web.revisionTitle, { color: '#22c55e' }]}>Revision Completed</Text>
									</View>
									<Text style={web.revisionMessage}>
										You have successfully uploaded revised files. The caller will be notified to review your changes.
									</Text>
									<Text style={web.revisionDate}>
										Completed: {new Date(revisionCompletedAt).toLocaleDateString()} at {new Date(revisionCompletedAt).toLocaleTimeString()}
									</Text>
									{revisionCount > 0 && (
										<Text style={web.revisionCount}>
											Revision #{revisionCount}
										</Text>
									)}
								</View>
							)}

							{/* Commission Details Card */}
							<View style={web.commissionCard}>
								<View style={web.commissionHeader}>
									<View style={web.commissionIcon}>
										<Ionicons name="briefcase" size={24} color={colors.maroon} />
									</View>
								<View style={[
									web.statusBadge, 
									{ 
										backgroundColor: taskStatus === "completed" ? "#22c55e" : 
														taskStatus === "revision" ? "#eab308" : "#3B82F6"
									}
								]}>
										<Text style={web.statusText}>
											{taskStatus === "revision" ? "Revision" : 
											 taskStatus === "completed" ? "Completed" :
											 taskStatus === "file_uploaded" ? "In Progress" : "In Progress"}
										</Text>
									</View>
								</View>

								<Text style={web.taskDetailsTitle}>Task Details</Text>

								<View style={web.commissionDetails}>
									<View style={web.detailRow}>
										<Text style={web.detailLabel}>Commission Title:</Text>
										<Text style={web.detailValue}>{commission.title || "N/A"}</Text>
									</View>
									<View style={web.detailRow}>
										<Text style={web.detailLabel}>Type:</Text>
										<Text style={web.detailValue}>{commission.commission_type || "N/A"}</Text>
									</View>
									<View style={web.detailRow}>
										<Text style={web.detailLabel}>Meetup Location:</Text>
										<Text style={web.detailValue}>{commission.meetup_location || "—"}</Text>
									</View>
									<View style={web.detailRow}>
										<Text style={web.detailLabel}>Due At:</Text>
										<Text style={web.detailValue}>
											{commission.due_at ? new Date(commission.due_at).toLocaleString() : "N/A"}
										</Text>
									</View>
								</View>

								<View style={web.descriptionSection}>
									<Text style={web.descriptionLabel}>Commission Description:</Text>
									<Text style={web.descriptionText}>{commission.description || "No description provided"}</Text>
								</View>

								{/* Invoice Breakdown Section */}
							{invoiceAmount !== null && (
								<View style={web.invoiceBreakdownSection}>
									<Text style={web.invoiceBreakdownTitle}>Invoice Details:</Text>
									{(() => {
										// Reverse calculate subtotal from total
										// Total = Subtotal + (5 + 0.12 × Subtotal) = Subtotal × 1.12 + 5
										// Subtotal = (Total - 5) / 1.12
										const total = invoiceAmount;
										const subtotal = (total - 5) / 1.12;
										let totalServiceFee = 0;
										if (subtotal > 0) {
											const baseFee = 5;
											const vatAmount = subtotal * 0.12;
											totalServiceFee = baseFee + vatAmount;
										}
										
										return (
											<View style={web.invoiceBreakdownContainer}>
												<View style={web.invoiceBreakdownRow}>
													<Text style={web.invoiceBreakdownLabel}>Subtotal:</Text>
													<Text style={web.invoiceBreakdownValue}>₱{subtotal.toFixed(2)}</Text>
												</View>
													<View style={web.invoiceBreakdownRow}>
														<Text style={web.invoiceBreakdownLabel}>System Fee (incl. VAT):</Text>
														<Text style={web.invoiceBreakdownValue}>₱{totalServiceFee.toFixed(2)}</Text>
													</View>
													<View style={[web.invoiceBreakdownRow, web.invoiceBreakdownTotalRow]}>
														<Text style={web.invoiceBreakdownTotalLabel}>Total:</Text>
														<Text style={web.invoiceBreakdownTotalValue}>₱{total.toFixed(2)}</Text>
													</View>
												</View>
											);
										})()}
									</View>
								)}
							</View>

							{/* Upload File Card */}
							<View style={web.uploadedFileCard}>
								<View style={web.uploadedFileHeader}>
									<Text style={web.uploadedFileTitle}>Upload Files:</Text>
								</View>
								
								{/* Uploaded Files List */}
								{uploadedFiles.length > 0 && (
									<View style={web.filesList}>
										{uploadedFiles.map((file, index) => (
											<View key={file.id} style={web.fileListItem}>
												<View style={web.fileItemContent}>
													<Ionicons 
														name={file.type === "link" ? "link" : file.type === "text" ? "chatbubble" : "document"} 
														size={24} 
														color={colors.maroon} 
													/>
													<Text style={web.fileItemName} numberOfLines={1}>
														{file.name}
													</Text>
												</View>
											</View>
										))}
									</View>
								)}

							{/* Revised Files List - Only show when revision is requested */}
							{revisionNotes && (
								<View style={web.filesList}>
									<Text style={[web.sectionSubtitle, { color: revisionCompletedAt ? "#22c55e" : undefined }]}>
										{revisionCompletedAt ? "Completed Files:" : "Revised Files:"}
									</Text>
										{revisedFiles.length > 0 ? (
											revisedFiles.map((file, index) => (
												<View key={file.id} style={web.fileContainer}>
													<View style={web.fileInfo}>
														<Ionicons 
															name={file.type === "link" ? "link" : "document"} 
															size={24} 
															color={colors.maroon} 
														/>
														<Text style={web.fileName} numberOfLines={1}>
														{file.name}
													</Text>
												</View>
												<TouchableOpacity 
														style={web.viewButton}
														onPress={() => Linking.openURL(file.url)}
												>
														<Text style={web.viewButtonText}>View</Text>
												</TouchableOpacity>
											</View>
											))
										) : (
											<View style={web.fileContainer}>
												<View style={web.fileInfo}>
													<Ionicons 
														name="document-outline" 
														size={24} 
														color="#999" 
													/>
													<Text style={[web.fileName, { color: "#999", fontStyle: "italic" }]}>
														No revised files uploaded yet
													</Text>
												</View>
											</View>
										)}
									</View>
								)}

								{/* Hidden file input for web */}
								<input
									type="file"
									ref={fileInputRef}
									onChange={handleFileChange}
									style={{ display: "none" }}
									accept="*/*" // Allow all file types including images and videos
									multiple // Allow multiple file selection
								/>

								{/* Add File Button */}
								{uploadType !== 'link' && (
									<TouchableOpacity 
										style={[
											web.addFileButton,
											taskStatus === "completed" && web.addFileButtonDisabled
										]} 
										onPress={handleTextboxPress}
										disabled={isUploading || taskStatus === "completed"}
									>
										<Ionicons 
											name="add" 
											size={20} 
											color={taskStatus === "completed" ? "#999" : colors.maroon} 
										/>
										<Text style={[
											web.addFileButtonText,
											taskStatus === "completed" && web.addFileButtonTextDisabled
										]}>
											{taskStatus === "completed" ? "Task Completed" : "Add Files"}
										</Text>
									</TouchableOpacity>
								)}

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
												<Text style={web.linkSubmitButtonText}>Add Link</Text>
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
														opacity: isUploading ? 0.5 : 1
													}}
													onClick={(e) => {
														if (isUploading) return;
														e.preventDefault();
														e.stopPropagation();
														console.log("*** SELECTED FILE TRASH ICON CLICKED ***");
														console.log("Index:", index);
														console.log("Event:", e);
														handleRemoveSelectedFile(index);
													}}
													onMouseDown={(e) => {
														e.preventDefault();
														console.log("*** SELECTED FILE TRASH ICON MOUSE DOWN ***");
													}}
													onMouseUp={(e) => {
														e.preventDefault();
														console.log("*** SELECTED FILE TRASH ICON MOUSE UP ***");
													}}
												>
													<Ionicons name="close" size={18} color="#dc3545" />
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
												(isUploading || taskStatus === "completed") && web.uploadButtonDisabled
											]} 
											onPress={handleUploadFile}
											disabled={isUploading || taskStatus === "completed"}
										>
											{isUploading ? (
												<ActivityIndicator color="#fff" size="small" />
											) : taskStatus === "completed" ? (
												<Text style={web.uploadButtonText}>Task Completed</Text>
											) : (
												<Text style={web.uploadButtonText}>Upload</Text>
											)}
										</TouchableOpacity>
									</View>
								)}
							</View>

						</View>

					</ScrollView>
				</View>

			</View>

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
					<SideItem label="Home" icon="home-outline" open={open} active onPress={() => router.push("/buddyrunner/home")} />
					<Separator />
					<SideItem label="Messages" icon="chatbubbles-outline" open={open} onPress={() => router.push("/buddyrunner/messages_hub")} />
					<SideItem label="Profile" icon="person-outline" open={open} onPress={() => router.push("/buddyrunner/profile")} />
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

	callerCard: {
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
	callerHeader: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 16,
	},
	callerAvatar: {
		width: 60,
		height: 60,
		borderRadius: 30,
		backgroundColor: colors.faint,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 16,
	},
	avatarImage: {
		width: 60,
		height: 60,
		borderRadius: 30,
	},
	callerInfo: {
		flex: 1,
	},
	callerName: {
		fontSize: 18,
		fontWeight: "800",
		color: colors.text,
		marginBottom: 4,
	},
	callerId: {
		fontSize: 14,
		color: colors.text,
		opacity: 0.7,
		marginBottom: 4,
	},
	callerCourse: {
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

	commissionCard: {
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
	commissionHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 20,
	},
	taskDetailsTitle: {
		fontSize: 18,
		fontWeight: "800",
		color: colors.text,
		marginBottom: 16,
	},
	commissionIcon: {
		width: 48,
		height: 48,
		borderRadius: 24,
		backgroundColor: colors.faint,
		alignItems: "center",
		justifyContent: "center",
	},
	statusBadge: {
		backgroundColor: "#3B82F6",
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 16,
	},
	statusText: {
		color: "#fff",
		fontSize: 14,
		fontWeight: "700",
	},
	commissionDetails: {
		marginBottom: 20,
	},
	detailRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 12,
	},
	detailLabel: {
		fontSize: 16,
		fontWeight: "600",
		color: colors.maroon,
		flex: 1,
	},
	detailValue: {
		fontSize: 16,
		color: colors.text,
		flex: 2,
		textAlign: "right",
	},
	descriptionSection: {
		borderTopWidth: 1,
		borderTopColor: colors.border,
		paddingTop: 20,
	},
	descriptionLabel: {
		fontSize: 16,
		fontWeight: "600",
		color: colors.maroon,
		marginBottom: 12,
	},
	descriptionText: {
		fontSize: 16,
		color: colors.text,
		lineHeight: 24,
	},
	invoiceBreakdownSection: {
		borderTopWidth: 1,
		borderTopColor: colors.border,
		paddingTop: 20,
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

	statusCard: {
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
	statusCardTitle: {
		fontSize: 18,
		fontWeight: "800",
		color: colors.text,
		marginBottom: 16,
	},
	statusIndicator: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 12,
	},
	statusDot: {
		width: 14,
		height: 14,
		borderRadius: 7,
		marginRight: 12,
	},
	statusDescription: {
		fontSize: 16,
		color: colors.text,
		opacity: 0.8,
		lineHeight: 24,
	},

	fileCard: {
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
	fileTitle: {
		fontSize: 18,
		fontWeight: "800",
		color: colors.text,
		marginBottom: 16,
	},
	fileItem: {
		flexDirection: "row",
		alignItems: "center",
	},
	fileItemName: {
		fontSize: 16,
		color: colors.text,
		marginLeft: 12,
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
	revisedFileItem: {
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
	revisedFileRemove: {
		backgroundColor: "#dcfce7",
	},
	textInputWrapper: {
		position: "relative",
		marginBottom: 16,
	},
	textInput: {
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: 8,
		padding: 16,
		paddingRight: 60, // Make room for the embedded icon
		fontSize: 16,
		color: colors.text,
		backgroundColor: "#fff",
		minHeight: 100,
		textAlignVertical: "top",
	},
	embeddedFileIcon: {
		position: "absolute",
		right: 16,
		top: 16,
		padding: 12,
		backgroundColor: "#f5f5f5",
		borderRadius: 6,
		justifyContent: "center",
		alignItems: "center",
	},
	filesList: {
		marginBottom: 16,
	},
	fileContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: 8,
		padding: 16,
		marginBottom: 16,
		backgroundColor: colors.faint,
	},
	fileInfo: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
	},
	fileInfoName: {
		fontSize: 16,
		color: colors.text,
		marginLeft: 12,
	},
	fileListItem: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		backgroundColor: "#f8f9fa",
		borderRadius: 8,
		padding: 16,
		marginBottom: 12,
		borderWidth: 1,
		borderColor: "#dee2e6",
	},
	fileItemContent: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
	},
	fileItemContentName: {
		fontSize: 16,
		color: colors.text,
		marginLeft: 12,
		flex: 1,
	},
	fileItemActions: {
		flexDirection: "row",
		alignItems: "center",
	},
	fileItemDownload: {
		padding: 8,
		marginRight: 12,
		borderRadius: 6,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: colors.border,
	},
	fileItemRemove: {
		padding: 8,
		borderRadius: 6,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#dc3545",
	},
	addFileButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#f8f9fa",
		borderRadius: 8,
		padding: 16,
		marginTop: 12,
		borderWidth: 1,
		borderColor: "#dee2e6",
	},
	addFileButtonDisabled: {
		backgroundColor: "#f5f5f5",
		borderColor: "#ccc",
		opacity: 0.6,
	},
	addFileButtonText: {
		fontSize: 16,
		color: colors.maroon,
		marginLeft: 8,
		fontWeight: "600",
	},
	addFileButtonTextDisabled: {
		color: "#999",
	},
	selectedFileContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		backgroundColor: "#f8f9fa",
		borderRadius: 8,
		padding: 16,
		marginTop: 12,
		borderWidth: 1,
		borderColor: "#dee2e6",
	},
	selectedFileInfo: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
	},
	selectedFileName: {
		fontSize: 16,
		color: colors.text,
		marginLeft: 12,
		flex: 1,
	},
	clearFileButton: {
		padding: 8,
		borderRadius: 6,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#dc3545",
	},
	selectedFilesContainer: {
		backgroundColor: "#f8f9fa",
		borderRadius: 8,
		padding: 16,
		marginTop: 12,
		borderWidth: 1,
		borderColor: "#dee2e6",
	},
	selectedFilesTitle: {
		fontSize: 16,
		fontWeight: "600",
		color: colors.text,
		marginBottom: 12,
	},
	selectedFileItem: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		paddingVertical: 6,
	},
	removeSelectedFileButton: {
		padding: 6,
		borderRadius: 4,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#dc3545",
		marginLeft: 12,
	},
	clearFilesButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		padding: 10,
		marginTop: 12,
		borderRadius: 6,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#dc3545",
	},
	clearFilesButtonText: {
		fontSize: 14,
		color: "#dc3545",
		marginLeft: 6,
		fontWeight: "600",
	},
	fileActions: {
		flexDirection: "row",
		alignItems: "center",
	},
	downloadButton: {
		padding: 10,
		borderRadius: 6,
		marginRight: 8,
		backgroundColor: "#f8f9fa",
		borderWidth: 1,
		borderColor: colors.border,
	},
	removeButton: {
		padding: 10,
		borderRadius: 6,
		backgroundColor: "#ffebee",
		borderWidth: 1,
		borderColor: "#dc3545",
	},
	viewButton: {
		backgroundColor: colors.maroon,
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 8,
	},
	viewButtonText: {
		color: "#fff",
		fontSize: 14,
		fontWeight: "600",
	},
	noFileContainer: {
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: 8,
		padding: 16,
		marginBottom: 16,
		backgroundColor: colors.faint,
		alignItems: "center",
	},
	noFileText: {
		fontSize: 16,
		color: colors.text,
		opacity: 0.7,
	},
	uploadButton: {
		backgroundColor: colors.maroon,
		paddingVertical: 14,
		paddingHorizontal: 28,
		borderRadius: 8,
		alignItems: "center",
	},
	uploadButtonText: {
		color: "#fff",
		fontSize: 16,
		fontWeight: "600",
	},
	buttonContainer: {
		flexDirection: "row",
		justifyContent: "space-between",
		gap: 15,
	},
	uploadButtonContainer: {
		alignItems: "center",
		marginTop: 20,
		marginBottom: 12,
	},
	uploadButtonDisabled: {
		opacity: 0.6,
	},
	// Revision Section Styles
	revisionCard: {
		backgroundColor: "#fff",
		borderRadius: 12,
		padding: 20,
		marginBottom: 20,
		borderWidth: 1,
		borderColor: "#f59e0b",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 3,
	},
	revisionHeader: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 16,
	},
	revisionTitle: {
		fontSize: 20,
		fontWeight: "700",
		color: "#f59e0b",
		marginLeft: 12,
	},
	revisionMessage: {
		fontSize: 16,
		color: colors.text,
		lineHeight: 24,
		marginBottom: 20,
	},
	revisionDetails: {
		backgroundColor: "#fef3c7",
		borderRadius: 8,
		padding: 16,
		marginBottom: 16,
	},
	revisionLabel: {
		fontSize: 16,
		fontWeight: "600",
		color: colors.text,
		marginBottom: 8,
	},
	revisionComments: {
		fontSize: 16,
		color: colors.text,
		lineHeight: 24,
	},
	revisionDate: {
		fontSize: 14,
		color: colors.text,
		opacity: 0.7,
		marginBottom: 8,
	},
	revisionCount: {
		fontSize: 14,
		fontWeight: "600",
		color: "#f59e0b",
	},
	selectedFilesLabel: {
		fontSize: 16,
		fontWeight: "600",
		color: colors.maroon,
		marginBottom: 12,
	},
	selectedFilesList: {
		flexDirection: "column",
		gap: 8,
	},
	sectionSubtitle: {
		fontSize: 14,
		fontWeight: "600",
		color: colors.maroon,
		marginBottom: 8,
	},
	fileName: {
		fontSize: 14,
		color: colors.text,
		marginLeft: 8,
		flex: 1,
	},
	linkInputContainer: {
		backgroundColor: "#f8f9fa",
		borderRadius: 8,
		padding: 16,
		marginTop: 8,
		borderWidth: 1,
		borderColor: "#dee2e6",
	},
	linkInputLabel: {
		fontSize: 14,
		fontWeight: "600",
		color: colors.text,
		marginBottom: 8,
	},
	linkInput: {
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: 6,
		paddingHorizontal: 12,
		paddingVertical: 10,
		fontSize: 14,
		color: colors.text,
		backgroundColor: "#fff",
		marginBottom: 12,
	},
	linkButtonContainer: {
		flexDirection: "row",
		justifyContent: "space-between",
		gap: 12,
	},
	linkCancelButton: {
		flex: 1,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#dc3545",
		paddingVertical: 10,
		borderRadius: 6,
		alignItems: "center",
	},
	linkCancelButtonText: {
		color: "#dc3545",
		fontSize: 14,
		fontWeight: "600",
	},
	linkSubmitButton: {
		flex: 1,
		backgroundColor: colors.maroon,
		paddingVertical: 10,
		borderRadius: 6,
		alignItems: "center",
	},
	linkSubmitButtonText: {
		color: "#fff",
		fontSize: 14,
		fontWeight: "600",
	},
	modalOverlay: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: "rgba(0, 0, 0, 0.5)",
		zIndex: 9999,
		justifyContent: "center",
		alignItems: "center",
	},
	modalContainer: {
		backgroundColor: "white",
		borderRadius: 12,
		padding: 24,
		maxWidth: 400,
		width: "90%",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 10 },
		shadowOpacity: 0.2,
		shadowRadius: 25,
		elevation: 10,
	},
	modalTitle: {
		fontSize: 18,
		fontWeight: "600",
		color: colors.text,
		marginBottom: 8,
		textAlign: "center",
	},
	modalSubtitle: {
		fontSize: 14,
		color: colors.text,
		marginBottom: 24,
		textAlign: "center",
		opacity: 0.8,
	},
	modalOptions: {
		flexDirection: "column",
		gap: 12,
	},
	modalOption: {
		flexDirection: "row",
		alignItems: "center",
		padding: 16,
		borderWidth: 2,
		borderColor: colors.maroon,
		borderRadius: 8,
		backgroundColor: "white",
	},
	modalOptionContent: {
		marginLeft: 12,
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
		color: colors.text,
		opacity: 0.7,
	},
	modalFooter: {
		marginTop: 24,
		alignItems: "center",
	},
	modalCancelButton: {
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderWidth: 1,
		borderColor: "#dc3545",
		borderRadius: 6,
		backgroundColor: "white",
	},
	modalCancelButtonText: {
		color: "#dc3545",
		fontSize: 14,
		fontWeight: "600",
	},
});
