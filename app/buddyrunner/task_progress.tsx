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
	TextInput,
	ActivityIndicator,
	KeyboardAvoidingView,
	Platform,
} from "react-native";
import { SafeAreaView as SAView, useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import * as DocumentPicker from "expo-document-picker";
import * as Linking from "expo-linking";

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

/* ===================== MAIN COMPONENT ===================== */
export default function TaskProgressMobile() {
	const router = useRouter();
	const { id } = useLocalSearchParams<{ id?: string }>();
	const insets = useSafeAreaInsets();
	
	// Debug: Log URL parameters
	console.log("=== URL PARAMS DEBUG ===");
	console.log("Raw id from useLocalSearchParams:", id);
	console.log("ID type:", typeof id);
	console.log("ID includes comma:", id?.includes(','));
	console.log("Parsed numeric ID:", Number(id));
	console.log("Is NaN:", isNaN(Number(id)));
	console.log("Is finite:", isFinite(Number(id)));
	console.log("All search params:", useLocalSearchParams());
	console.log("=== END URL PARAMS DEBUG ===");
	
	// Monitor ID changes
	useEffect(() => {
		console.log("=== ID CHANGE MONITOR ===");
		console.log("ID changed to:", id);
		console.log("ID type:", typeof id);
		console.log("ID length:", id?.toString().length);
		console.log("=== END ID CHANGE MONITOR ===");
	}, [id]);

	// Get current user ID
	useEffect(() => {
		const getCurrentUser = async () => {
			try {
				const { data: { user } } = await supabase.auth.getUser();
				if (user) {
					setCurrentUserId(user.id);
					console.log("Current user ID:", user.id);
				}
			} catch (error) {
				console.error("Error getting current user:", error);
			}
		};
		getCurrentUser();
	}, []);
	
	const [loading, setLoading] = useState(true);
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
	const [selectedFile, setSelectedFile] = useState<any>(null);
	const [selectedFiles, setSelectedFiles] = useState<any[]>([]);
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
	const linkInputRef = React.useRef<TextInput>(null);
	const [invoiceAmount, setInvoiceAmount] = useState<number | null>(null);

	// Debug logging for UI rendering
	useEffect(() => {
		console.log("=== UI RENDERING DEBUG ===");
		console.log("taskStatus:", taskStatus);
		console.log("revisedFiles.length:", revisedFiles.length);
		console.log("uploadedFiles.length:", uploadedFiles.length);
		console.log("=== END UI RENDERING DEBUG ===");
	}, [taskStatus, revisedFiles.length, uploadedFiles.length]);

	const handleTextboxPress = async () => {
		if (!id) {
			Alert.alert("Error", "Commission ID is missing.");
			return;
		}

		// Show upload type selection
		Alert.alert(
			"Upload Type",
			"Choose how you want to upload your work:",
			[
				{
					text: "Upload Files",
					onPress: () => {
						setUploadType('file');
						handleFileSelection();
					}
				},
				{
					text: "Upload Link",
					onPress: () => {
						setUploadType('link');
					}
				},
				{
					text: "Cancel",
					style: "cancel"
				}
			]
		);
	};

	const handleFileSelection = async () => {
		try {
			const result = await DocumentPicker.getDocumentAsync({
				type: "*/*", // Allow any file type including images, videos, documents, etc.
				copyToCacheDirectory: true,
				multiple: true, // Allow multiple file selection
			});

			console.log("=== DOCUMENT PICKER RESULT DEBUG ===");
			console.log("Document picker result:", result);
			console.log("Canceled:", result.canceled);
			if (result.assets) {
				console.log("Assets count:", result.assets.length);
				result.assets.forEach((asset, index) => {
					console.log(`Asset ${index}:`, {
						uri: asset.uri,
						name: asset.name,
						size: asset.size,
						mimeType: asset.mimeType,
					});
				});
			}
			console.log("=== END DOCUMENT PICKER RESULT DEBUG ===");

			if (result.canceled) {
				console.log("File selection cancelled.");
				return;
			}

			const files = result.assets;
			if (!files || files.length === 0) {
				Alert.alert("Error", "No files selected.");
				return;
			}

			// Store all selected files
			setSelectedFiles(files);
		} catch (error: any) {
			console.error("Error selecting files:", error);
			Alert.alert("Error", "Failed to select files");
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
		};

		// Add to selected files
		setSelectedFiles([linkObject]);
		setUploadType(null); // Reset upload type
		setLinkInput(""); // Clear link input
	};

	const handleLinkInputChange = (text: string) => {
		setLinkInput(text);
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
		console.log("=== HANDLE UPLOAD FILE DEBUG ===");
		console.log("Current id value:", id);
		console.log("ID type:", typeof id);
		console.log("Selected files count:", selectedFiles.length);
		console.log("=== END HANDLE UPLOAD FILE DEBUG ===");
		
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

	const handleFileUpload = async (file: any) => {
		try {
			setIsUploading(true);
			
			// Debug: Log the ID to see what we're getting
			console.log("=== SINGLE FILE UPLOAD DEBUG START ===");
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
			
			// Handle UUID case - if it's a UUID, we need to find the actual commission ID
			let numericId: number;
			
			if (idToUse.includes('-') && idToUse.length > 10) {
				// This is a UUID, we need to find the commission ID from the database
				console.log("UUID detected in single file upload, finding commission ID from database:", idToUse);
				
				// Try to find commission ID from task_progress table
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
				throw new Error(`Invalid commission ID format: ${idToUse} (original: ${id})`);
				}
				console.log("Using numeric commission ID:", numericId);
			}
			
			console.log("Final commission ID for single file upload:", numericId);
			console.log("=== SINGLE FILE UPLOAD DEBUG END ===");

			// Upload the file with a simple, clean filename
			const fileExtension = file.name.split(".").pop() || "unknown";
			const timestamp = Date.now();
			const randomId = Math.random().toString(36).substr(2, 9);
			const fileName = `${timestamp}-${randomId}.${fileExtension}`;
			const userId = currentUserId || 'anonymous';
			const filePath = `${userId}/${fileName}`;

			// Use the correct content type for the file
			// For mobile, MIME type might not be reliable, so we'll use a fallback
			const getContentType = (fileName: string, mimeType?: string) => {
				const ext = fileName.split('.').pop()?.toLowerCase();
				const mimeMap: { [key: string]: string } = {
					'jpg': 'image/jpeg',
					'jpeg': 'image/jpeg',
					'png': 'image/png',
					'gif': 'image/gif',
					'pdf': 'application/pdf',
					'doc': 'application/msword',
					'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
					'xls': 'application/vnd.ms-excel',
					'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
					'ppt': 'application/vnd.ms-powerpoint',
					'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
					'txt': 'text/plain',
				};
				return mimeType || mimeMap[ext || ''] || 'application/octet-stream';
			};
			
			const contentType = getContentType(file.name, file.mimeType);

			console.log("=== UPLOAD DEBUG ===");
			console.log("Uploading to path:", filePath);
			console.log("Content type:", contentType);
			console.log("File object:", file);
			console.log("File URI:", file.uri);
			console.log("File MIME type:", file.mimeType);
			console.log("File name:", file.name);
			console.log("=== END UPLOAD DEBUG ===");

			// For React Native, we need to use FormData for proper file upload
			// This ensures proper file handling and web accessibility
			console.log("=== MOBILE FILE UPLOAD DEBUG ===");
			console.log("File URI:", file.uri);
			console.log("File name:", file.name);
			console.log("File size:", file.size);
			console.log("File mimeType:", file.mimeType);
			console.log("Content type:", contentType);
			console.log("=== END MOBILE FILE UPLOAD DEBUG ===");

			// Create FormData for React Native file upload
			const formData = new FormData();
			formData.append('file', {
				uri: file.uri,
				type: contentType,
				name: file.name,
			} as any);

			console.log("=== FORMDATA DEBUG ===");
			console.log("FormData created for file:", file.name);
			console.log("=== END FORMDATA DEBUG ===");

			const { data: uploadData, error: uploadError } = await supabase.storage
				.from("task-uploads")
				.upload(filePath, formData, {
					cacheControl: "3600",
					upsert: false,
					contentType: contentType,
				});

			if (uploadError) {
				console.error("Upload error:", uploadError);
				console.error("Upload error details:", {
					message: uploadError.message,
				});
				throw uploadError;
			}

			console.log("Upload successful, data:", uploadData);

			const { data: publicUrlData } = supabase.storage
				.from("task-uploads")
				.getPublicUrl(filePath);

			const publicUrl = publicUrlData.publicUrl;
			
			console.log("=== PUBLIC URL DEBUG ===");
			console.log("Generated public URL:", publicUrl);
			console.log("=== END PUBLIC URL DEBUG ===");

			// Create new file entry
			// Get file size properly
			const fileSize = file.size || 0;
			console.log("=== FILE SIZE DEBUG ===");
			console.log("Original file.size:", file.size);
			console.log("Processed fileSize:", fileSize);
			console.log("File size type:", typeof fileSize);
			console.log("=== END FILE SIZE DEBUG ===");

			// Get file type from extension (more reliable than MIME type for mobile)
			const fileType = file.name.split('.').pop()?.toLowerCase() || "unknown";

			const newFile = {
				id: `${numericId}-${timestamp}-${randomId}`,
				url: publicUrl,
				name: file.name,
				type: fileType,
				size: fileSize,
				uploadedAt: new Date().toISOString(),
			};

		// Check if this is a revision upload
		const isRevisionUpload = taskStatus === 'revision';
		
		console.log("=== SINGLE FILE REVISION UPLOAD DEBUG ===");
		console.log("taskStatus:", taskStatus);
		console.log("isRevisionUpload:", isRevisionUpload);
		console.log("uploadedFiles.length:", uploadedFiles.length);
		console.log("revisedFiles.length:", revisedFiles.length);
		console.log("Original file name:", file.name);
		console.log("File name length:", file.name.length);
		console.log("=== END SINGLE FILE REVISION UPLOAD DEBUG ===");
		
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

			// Update the task_progress table with all file information
			console.log("=== DATABASE UPDATE DEBUG (SINGLE FILE) ===");
			console.log("Updating task_progress with commission_id:", numericId);
			console.log("Commission ID type:", typeof numericId);
			console.log("File URLs:", fileUrls);
			console.log("File Types:", fileTypes);
			console.log("File Sizes:", fileSizes);
			console.log("Uploaded At:", uploadedAt);
			console.log("=== END DATABASE UPDATE DEBUG (SINGLE FILE) ===");
			
			// Force the commission_id to be treated as a string for RPC function
			const commissionIdForQuery = numericId.toString();
			console.log("=== FORCING STRING TYPE (SINGLE FILE) ===");
			console.log("Original numericId:", numericId, typeof numericId);
			console.log("Forced to String:", commissionIdForQuery, typeof commissionIdForQuery);
			console.log("=== END FORCING STRING TYPE (SINGLE FILE) ===");
			
			// Try using RPC function first
			console.log("=== RPC CALL DEBUG (SINGLE FILE) ===");
			console.log("RPC parameters:", {
				p_commission_id: commissionIdForQuery,
				p_file_url: fileUrls,
				p_file_type: fileTypes,
				p_file_size: fileSizes,
				p_file_name: fileNames,
				p_uploaded_at: uploadedAt
			});
			console.log("=== END RPC CALL DEBUG (SINGLE FILE) ===");
			
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

			// Use insert or update instead of upsert to avoid constraint issues
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
				.from('task_progress')
				.update(updateData)
				.eq('commission_id', numericId)
				.select();

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
					.from('task_progress')
					.insert(insertData);
				
				if (insertError) {
					console.error("Database insert error:", insertError);
					throw insertError;
				}
				console.log("Successfully inserted new task progress record with IDs");
			} else {
				console.log("Successfully updated existing task progress record with IDs");
			}

			// Update state with new file
			if (isRevisionUpload) {
				setRevisedFiles(currentFiles);
			} else {
			setUploadedFiles(currentFiles);
			}
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
		}
	};

	const handleMultipleFileUpload = async (files: any[]) => {
		try {
			setIsUploading(true);
			
			// Debug: Log the ID to see what we're getting
			console.log("=== UPLOAD DEBUG START ===");
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
			
			// Handle UUID case - if it's a UUID, we need to find the actual commission ID
			let finalNumericId: number;
			
			if (idToUse.includes('-') && idToUse.length > 10) {
				// This is a UUID, we need to find the commission ID from the database
				console.log("UUID detected, finding commission ID from database:", idToUse);
				
				// Try to find commission ID from task_progress table
				const { data: taskProgressData } = await supabase
					.from('task_progress')
					.select('commission_id')
					.eq('id', idToUse)
					.single();
				
				if (taskProgressData?.commission_id) {
					finalNumericId = taskProgressData.commission_id;
					console.log("Found commission ID from task_progress:", finalNumericId);
				} else {
					// Try to find from commission table using user IDs
					const { data: commissionData } = await supabase
						.from('commission')
						.select('id')
						.or(`runner_id.eq.${idToUse},buddycaller_id.eq.${idToUse}`)
						.single();
					
					if (commissionData?.id) {
						finalNumericId = commissionData.id;
						console.log("Found commission ID from commission table:", finalNumericId);
					} else {
						throw new Error(`Could not find commission ID for UUID: ${idToUse}`);
					}
				}
			} else {
				// This is a numeric ID
				finalNumericId = parseInt(idToUse.toString(), 10);
			if (isNaN(finalNumericId) || finalNumericId <= 0) {
					throw new Error(`Invalid commission ID format: ${idToUse} (original: ${id})`);
				}
				console.log("Using numeric commission ID:", finalNumericId);
			}
			
			console.log("Final commission ID for upload:", finalNumericId);
			console.log("=== UPLOAD DEBUG END ===");

			// Upload all files
			const uploadPromises = files.map(async (file) => {
				// Handle links differently from files
				if (file.type === "link") {
					// For links, we don't need to upload to storage, just use the URL directly
					return {
						id: `${finalNumericId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
						url: file.uri,
						name: file.name,
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
				// For mobile, MIME type might not be reliable, so we'll use a fallback
				const getContentType = (fileName: string, mimeType?: string) => {
					const ext = fileName.split('.').pop()?.toLowerCase();
					const mimeMap: { [key: string]: string } = {
						'jpg': 'image/jpeg',
						'jpeg': 'image/jpeg',
						'png': 'image/png',
						'gif': 'image/gif',
						'pdf': 'application/pdf',
						'doc': 'application/msword',
						'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
						'xls': 'application/vnd.ms-excel',
						'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
						'ppt': 'application/vnd.ms-powerpoint',
						'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
						'txt': 'text/plain',
					};
					return mimeType || mimeMap[ext || ''] || 'application/octet-stream';
				};
				
				const contentType = getContentType(file.name, file.mimeType);

				// For React Native, use FormData for proper file upload
				console.log("=== MULTIPLE FILE UPLOAD DEBUG ===");
				console.log("File URI:", file.uri);
				console.log("File name:", file.name);
				console.log("File size:", file.size);
				console.log("File mimeType:", file.mimeType);
				console.log("Content type:", contentType);
				console.log("=== END MULTIPLE FILE UPLOAD DEBUG ===");

				// Create FormData for React Native file upload
				const formData = new FormData();
				formData.append('file', {
					uri: file.uri,
					type: contentType,
					name: file.name,
				} as any);

				console.log("=== MULTIPLE FILE FORMDATA DEBUG ===");
				console.log("FormData created for file:", file.name);
				console.log("=== END MULTIPLE FILE FORMDATA DEBUG ===");

				const { data, error: uploadError } = await supabase.storage
					.from("task-uploads")
					.upload(filePath, formData, {
						cacheControl: "3600",
						upsert: false,
						contentType: contentType,
					});

				if (uploadError) {
					console.error("Multiple file upload error:", uploadError);
					console.error("Multiple file upload error details:", {
						message: uploadError.message,
					});
					throw uploadError;
				}

				const { data: publicUrlData } = supabase.storage
					.from("task-uploads")
					.getPublicUrl(filePath);

				// Get file size properly
				const fileSize = file.size || 0;
				console.log("=== MULTIPLE FILE SIZE DEBUG ===");
				console.log("Original file.size:", file.size);
				console.log("Processed fileSize:", fileSize);
				console.log("File size type:", typeof fileSize);
				console.log("=== END MULTIPLE FILE SIZE DEBUG ===");

				// Get file type from extension (more reliable than MIME type for mobile)
				const fileType = file.name.split('.').pop()?.toLowerCase() || "unknown";

				return {
					id: `${finalNumericId}-${timestamp}-${randomId}`,
					url: publicUrlData.publicUrl,
					name: file.name,
					type: fileType,
					size: fileSize,
					uploadedAt: new Date().toISOString(),
				};
			});

			// Wait for all uploads to complete
			const newFiles = await Promise.all(uploadPromises);

		// Check if this is a revision upload
		const isRevisionUpload = taskStatus === 'revision';
		
		console.log("=== MULTIPLE FILE REVISION UPLOAD DEBUG ===");
		console.log("taskStatus:", taskStatus);
		console.log("isRevisionUpload:", isRevisionUpload);
		console.log("uploadedFiles.length:", uploadedFiles.length);
		console.log("revisedFiles.length:", revisedFiles.length);
		console.log("=== END MULTIPLE FILE REVISION UPLOAD DEBUG ===");
		
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
			
			console.log("=== FILE DATA DEBUG ===");
			console.log("Current files:", currentFiles);
			console.log("File URLs:", fileUrls);
			console.log("File Types:", fileTypes);
			console.log("File Sizes:", fileSizes);
			console.log("File Names:", fileNames);
			console.log("=== END FILE DATA DEBUG ===");

			// Update the task_progress table with all file information
			console.log("=== DATABASE UPDATE DEBUG (MULTIPLE FILES) ===");
			console.log("Updating task_progress with commission_id:", finalNumericId);
			console.log("Commission ID type:", typeof finalNumericId);
			console.log("File URLs:", fileUrls);
			console.log("File Types:", fileTypes);
			console.log("File Sizes:", fileSizes);
			console.log("File Names:", fileNames);
			console.log("Uploaded At:", uploadedAt);
			console.log("=== END DATABASE UPDATE DEBUG (MULTIPLE FILES) ===");
			
			// Create the update object to debug
			const updateObject = { 
				file_url: fileUrls,
				file_type: fileTypes,
				file_size: fileSizes,
				uploaded_at: uploadedAt
			};
			
			console.log("=== FINAL DATABASE QUERY DEBUG (MULTIPLE FILES) ===");
			console.log("Update data:", updateObject);
			console.log("Commission ID for .eq():", finalNumericId);
			console.log("Commission ID type:", typeof finalNumericId);
			console.log("Commission ID stringified:", JSON.stringify(finalNumericId));
			console.log("=== END FINAL DATABASE QUERY DEBUG (MULTIPLE FILES) ===");
			
			// Force the commission_id to be treated as a string for RPC function
			const commissionIdForQuery = finalNumericId.toString();
			console.log("=== FORCING STRING TYPE (MULTIPLE FILES) ===");
			console.log("Original finalNumericId:", finalNumericId, typeof finalNumericId);
			console.log("Forced to String:", commissionIdForQuery, typeof commissionIdForQuery);
			console.log("=== END FORCING STRING TYPE (MULTIPLE FILES) ===");
			
			// Try using raw SQL to bypass any client-side issues
			console.log("=== RPC CALL DEBUG ===");
			console.log("RPC parameters:", {
				p_commission_id: commissionIdForQuery,
				p_file_url: fileUrls,
				p_file_type: fileTypes,
				p_file_size: fileSizes,
				p_file_name: fileNames,
				p_uploaded_at: uploadedAt
			});
			console.log("=== END RPC CALL DEBUG ===");
			
			// Get runner_id and caller_id from commission data
			let runnerId: string | null = null;
			let callerId: string | null = null;
			
			try {
				const { data: commissionData } = await supabase
					.from('commission')
					.select('runner_id, buddycaller_id')
					.eq('id', finalNumericId)
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
			console.log("=== MULTIPLE FILE UPLOAD DEBUG ===");
			console.log("Commission ID:", finalNumericId);
			console.log("File URLs:", fileUrls);
			console.log("File Types:", fileTypes);
			console.log("File Sizes:", fileSizes);
			console.log("File Names:", fileNames);
			console.log("Runner ID:", runnerId);
			console.log("Caller ID:", callerId);
			console.log("=== END MULTIPLE FILE UPLOAD DEBUG ===");

			// Use insert or update instead of upsert to avoid constraint issues
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
				.from('task_progress')
				.update(updateData)
				.eq('commission_id', finalNumericId)
				.select();

			console.log("Update result:", { updateData, updateError });

			// If no rows were updated (empty array), insert a new record
			if (updateError) {
				console.error("Database update error:", updateError);
				throw updateError;
			} else if (!updateResult || updateResult.length === 0) {
				console.log("No existing record found, inserting new record");
				const insertData = isRevisionUpload ? {
					commission_id: finalNumericId,
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
					commission_id: finalNumericId,
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
					.from('task_progress')
					.insert(insertData);
				
				console.log("Insert result:", { insertError });
				
				if (insertError) {
					console.error("Database insert error:", insertError);
					throw insertError;
				}
				console.log("Successfully inserted new task progress record with IDs");
			} else {
				console.log("Successfully updated existing task progress record with IDs");
				console.log("Updated record:", updateResult[0]);
			}

			// Update state with new files
			if (isRevisionUpload) {
				setRevisedFiles(currentFiles);
			} else {
			setUploadedFiles(currentFiles);
			}
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
			const uploadedAt = new Date().toISOString();

			// Update the task_progress table with all file information
			const { error: updateError } = await supabase
				.from("task_progress")
				.update({ 
					file_url: fileUrls,
					file_type: fileTypes,
					file_size: fileSizes,
					uploaded_at: uploadedAt
				})
				.eq("commission_id", numericId);

			if (updateError) {
				throw updateError;
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


	const handleViewFile = async (fileUrl: string) => {
		try {
			// Find the file info to get the proper filename
			const fileInfo = uploadedFiles.find(f => f.url === fileUrl);
			const fileName = fileInfo?.name || 'download';
			
			console.log("=== BUDDYRUNNER FILE VIEW DEBUG ===");
			console.log("File URL:", fileUrl);
			console.log("Found fileInfo:", fileInfo);
			console.log("File name:", fileName);
			console.log("=== END BUDDYRUNNER FILE VIEW DEBUG ===");
			
			// Check if it's a PDF
			const isPdf = fileName.toLowerCase().endsWith('.pdf');
			
			if (isPdf) {
				// COPY EXACT LOGIC FROM WORKING DOCX FILES
				console.log("=== BUDDYRUNNER PDF DOWNLOAD - COPY DOCX LOGIC ===");
				console.log("PDF detected, using same logic as working DOCX files");
				
				// For PDFs, use the same approach as DOCX files that work
				const encodedFileName = encodeURIComponent(fileName);
				const downloadUrl = fileUrl + (fileUrl.includes('?') ? '&' : '?') + 
					`download=${encodedFileName}&filename=${encodedFileName}`;
				
				console.log("PDF download URL (copied from DOCX logic):", downloadUrl);
				console.log("Original filename being used:", fileName);
				console.log("Encoded filename:", encodedFileName);
				await Linking.openURL(downloadUrl);
			} else {
				// For non-PDF files, use direct URL approach
				console.log("=== BUDDYRUNNER NON-PDF DOWNLOAD ===");
				console.log("Non-PDF file, using direct URL approach");
				
				const encodedFileName = encodeURIComponent(fileName);
				const downloadUrl = fileUrl + (fileUrl.includes('?') ? '&' : '?') + 
					`download=${encodedFileName}&filename=${encodedFileName}`;
				
				console.log("Non-PDF download URL:", downloadUrl);
				await Linking.openURL(downloadUrl);
			}
		} catch (error) {
			console.error("Failed to open URL:", error);
			// Fallback to simple URL opening
			Linking.openURL(fileUrl).catch((err) =>
				console.error("Failed to open fallback URL:", err)
			);
		}
	};

	const handleRemoveFile = async (fileId: string) => {
		Alert.alert(
			"Remove File",
			"Are you sure you want to remove this file?",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Remove",
					style: "destructive",
					onPress: async () => {
						try {
							setIsUpdating(true);
							
							// Filter out the file to be removed
							const fileToRemove = uploadedFiles.find(f => f.id === fileId);
							const updatedFiles = uploadedFiles.filter(f => f.id !== fileId);
							
							// Update local state immediately for better UX
							setUploadedFiles(updatedFiles);
							
							// Update database
							if (id) {
								// Handle different types of ID input
								let numericId: number;
								let commissionIdForQuery: string;
								
								if (typeof id === 'string' && id.includes('-')) {
									// This is a UUID, pass it directly to the RPC function
									// The RPC function will handle UUID resolution
									commissionIdForQuery = id;
									numericId = 0; // Will be resolved by RPC function
									console.log("Using UUID directly for RPC function:", id);
								} else {
									// This is a numeric ID
									numericId = parseInt(id, 10);
									commissionIdForQuery = id.toString();
									console.log("Using numeric ID directly:", numericId);
								}
								
								if (!commissionIdForQuery) {
									console.error("Could not determine commission ID from:", id);
									Alert.alert("Error", "Invalid commission ID format");
									setUploadedFiles(uploadedFiles);
									return;
								}
								
								if (updatedFiles.length === 0) {
									// If no files left, clear the task progress file fields
									// Use direct database query instead of RPC function
									const { error } = await supabase
										.from('task_progress')
										.update({
											file_url: null,
											file_type: null,
											file_size: null,
											file_name: null,
											uploaded_at: null,
										status: 'in_progress',
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
									// Update with remaining files
									const fileUrls = updatedFiles.map(f => f.url).join(',');
									const fileTypes = updatedFiles.map(f => f.type).join(',');
									const fileSizes = updatedFiles.map(f => f.size || 0).join(',');
									const fileNames = updatedFiles.map(f => f.name).join(',');
									const uploadedAt = new Date().toISOString();

									// Use direct database query instead of RPC function
									const { error } = await supabase
										.from('task_progress')
										.update({
											file_url: fileUrls,
											file_type: fileTypes,
											file_size: fileSizes,
											file_name: fileNames,
											uploaded_at: uploadedAt,
											status: 'file_uploaded'
										})
										.or(`id.eq.${commissionIdForQuery},commission_id.eq.${numericId || 0}`);
									
									if (error) {
										console.error('Error updating task progress:', error);
										Alert.alert("Error", "Failed to remove file from database");
										// Revert local state on error
										setUploadedFiles(uploadedFiles);
										return;
									}
								}
								
								// Also try to delete from Supabase Storage if it's a storage file
								if (fileToRemove && fileToRemove.url && fileToRemove.url.includes('storage.googleapis.com')) {
									try {
										// Extract file path from URL
										const urlParts = fileToRemove.url.split('/');
										const filePath = urlParts.slice(-2).join('/'); // Get last two parts (folder/filename)
										
										const { error: storageError } = await supabase.storage
											.from('task-uploads')
											.remove([filePath]);
										
										if (storageError) {
											console.warn('Warning: Could not delete file from storage:', storageError);
											// Don't show error to user as the database update succeeded
										}
									} catch (storageErr) {
										console.warn('Warning: Could not delete file from storage:', storageErr);
									}
								}
								
								Alert.alert("Success", "File removed successfully");
							}
						} catch (error) {
							console.error('Error removing file:', error);
							Alert.alert("Error", "Failed to remove file");
							// Revert local state on error
							setUploadedFiles(uploadedFiles);
						} finally {
							setIsUpdating(false);
						}
					}
				}
			]
		);
	};

	const fetchData = useCallback(async () => {
		if (!id) return;
		
		setLoading(true);
		try {
			// Debug: Log the raw ID
			console.log("Task Progress Runner: Raw ID received:", id, "Type:", typeof id);
			
			// Handle comma-separated IDs by taking the first one
			let idToUse = id;
			if (typeof id === 'string' && id.includes(',')) {
				idToUse = id.split(',')[0].trim();
				console.log("Task Progress Runner: Extracted ID from comma-separated string:", idToUse);
			}
			
			// Handle UUID case - if it's a UUID, we need to find the actual commission ID
			let numericId: number;
			
			if (idToUse.includes('-') && idToUse.length > 10) {
				// This is a UUID, we need to find the commission ID from the database
				console.log("UUID detected in fetchData, finding commission ID from database:", idToUse);
				
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

			console.log("Task Progress Runner: Using final numeric ID for fetchData:", numericId);

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
				
				console.log("=== FETCH DATA DEBUG ===");
				console.log("taskProgressData.status:", taskProgressData.status);
				console.log("taskProgressData.revised_file_url:", taskProgressData.revised_file_url);
				console.log("taskProgressData.revised_file_type:", taskProgressData.revised_file_type);
				console.log("taskProgressData.revised_file_name:", taskProgressData.revised_file_name);
				console.log("taskProgressData.revised_file_size:", taskProgressData.revised_file_size);
				console.log("=== END FETCH DATA DEBUG ===");
				
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
				
				// Check if this is a revision upload (status is revision and files exist)
				setIsRevisionUpload(taskProgressData.status === 'revision' && !!taskProgressData.file_url);
				
				// Set file upload status using new schema
				if (taskProgressData.file_url && taskProgressData.file_url.trim()) {
					try {
						// Parse multiple files from comma-separated values
						console.log("Task Progress Runner: Parsing files - file_url:", taskProgressData.file_url);
						console.log("Task Progress Runner: Parsing files - file_type:", taskProgressData.file_type);
						console.log("Task Progress Runner: Parsing files - file_size:", taskProgressData.file_size);
						console.log("Task Progress Runner: Parsing files - file_name:", taskProgressData.file_name);
						console.log("Task Progress Runner: file_uploaded flag:", taskProgressData.file_uploaded);
						
						const fileUrls = (taskProgressData.file_url || '').split(',').filter((url: string) => url.trim());
						const fileTypes = taskProgressData.file_type ? (taskProgressData.file_type || '').split(',').filter((type: string) => type.trim()) : [];
						const fileSizes = taskProgressData.file_size && typeof taskProgressData.file_size === 'string' && taskProgressData.file_size.trim() 
							? taskProgressData.file_size.split(',').map((s: string) => parseInt(s.trim()) || 0) 
							: [];
						const fileNames = taskProgressData.file_name ? (taskProgressData.file_name || '').split(',').filter((name: string) => name.trim()) : [];
						const uploadedAt = taskProgressData.uploaded_at || new Date().toISOString();
					
						const files = fileUrls.map((url: string, index: number) => {
							// Prioritize original filename from database
							let fileName = "Unknown file";
							
							if (fileTypes[index] === "link") {
								fileName = url.trim();
							} else if (fileNames[index] && fileNames[index].trim()) {
								// Use the original filename from database (this is what we want for mobile)
								fileName = fileNames[index].trim();
							} else {
								// Fallback to extracting from URL only if database name is not available
								fileName = url.split("/").pop()?.split("?")[0] || "Unknown file";
							}
							
							console.log(`=== BUDDYRUNNER FILE NAME ASSIGNMENT DEBUG (File ${index}) ===`);
							console.log("File URL:", url);
							console.log("File type:", fileTypes[index]);
							console.log("Original filename from database:", fileNames[index]);
							console.log("Final assigned filename:", fileName);
							console.log("=== END BUDDYRUNNER FILE NAME ASSIGNMENT DEBUG ===");
							
							return {
								id: `${numericId}-${index}-${Date.now()}`,
								url: url.trim(),
								name: fileName,
								type: fileTypes[index] || "unknown",
								size: fileSizes[index] || 0,
								uploadedAt: uploadedAt,
							};
						});
						
						console.log("Task Progress Runner: Successfully parsed and set files:", files);
						setUploadedFiles(files);
					} catch (parseError) {
						console.error("Task Progress Runner: Error parsing files:", parseError);
						console.log("Task Progress Runner: Fallback - treating as single file");
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
					console.log("Task Progress Runner: No files found - file_url:", taskProgressData.file_url, "file_uploaded:", taskProgressData.file_uploaded);
					setUploadedFiles([]);
				}
				
				// Load revised files if they exist
				if (taskProgressData.revised_file_url && taskProgressData.revised_file_url.trim()) {
					try {
						console.log("Task Progress Runner: Parsing revised files - revised_file_url:", taskProgressData.revised_file_url);
						console.log("Task Progress Runner: Parsing revised files - revised_file_type:", taskProgressData.revised_file_type);
						console.log("Task Progress Runner: Parsing revised files - revised_file_size:", taskProgressData.revised_file_size);
						console.log("Task Progress Runner: Parsing revised files - revised_file_name:", taskProgressData.revised_file_name);
						
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
						console.log("Task Progress Runner: Revised files parsed and set:", revisedFiles);
					} catch (error) {
						console.error("Task Progress Runner: Error parsing revised files:", error);
						setRevisedFiles([]);
				}
			} else {
					console.log("Task Progress Runner: No revised files found");
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
			setLoading(false);
		}
	}, [id]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	// Real-time subscription for task progress updates
	useEffect(() => {
		if (!id) return;

		const channel = supabase
			.channel(`task_progress_runner_${id}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'task_progress',
					filter: `commission_id=eq.${parseInt(id?.toString() || '0', 10)}`
				},
				async (payload) => {
					console.log('Task Progress Runner: Task progress update received:', payload);
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

	const scrollBottomPad = (insets.bottom || 0) + 100;

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

	if (!commission) {
		return (
			<SAView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: "#fff" }}>
				<Stack.Screen options={{ animation: "none" }} />
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
			</SAView>
		);
	}

	if (!caller) {
		return (
			<SAView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: "#fff" }}>
				<Stack.Screen options={{ animation: "none" }} />
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
			</SAView>
		);
	}

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
					<TouchableOpacity onPress={() => router.push("/buddyrunner/notification")} activeOpacity={0.9}>
						<Ionicons name="notifications-outline" size={24} color={colors.text} />
					</TouchableOpacity>
				</View>
			</View>

			<Text style={{ paddingHorizontal: 16, color: colors.text, fontWeight: "800", fontSize: 16, marginBottom: 6 }}>
				Task Progress
			</Text>

			<KeyboardAvoidingView 
				style={{ flex: 1 }} 
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
				keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
			>
				<ScrollView 
					contentContainerStyle={{ padding: 16, paddingBottom: scrollBottomPad }}
					keyboardShouldPersistTaps="handled"
					showsVerticalScrollIndicator={true}
				>
				{/* Caller Information Card */}
				<View style={m.callerCard}>
					<View style={m.callerHeader}>
						<View style={m.callerAvatar}>
							{caller.profile_picture_url ? (
								<Image source={{ uri: caller.profile_picture_url }} style={m.avatarImage} />
							) : (
								<Ionicons name="person" size={24} color={colors.maroon} />
							)}
						</View>
						<View style={m.callerInfo}>
							<Text style={m.callerName}>
								{caller.first_name} {caller.last_name}
							</Text>
							<Text style={m.callerId}>Student ID: {caller.student_id_number || "N/A"}</Text>
							<Text style={m.callerCourse}>{caller.course || "N/A"}</Text>
						</View>
						<TouchableOpacity 
							style={m.chatButton}
							onPress={() => router.push({
								pathname: "/buddyrunner/start_conversation",
								params: { otherUserId: caller.id }
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
								userId: caller.id,
								isViewingOtherUser: 'true',
								returnTo: 'BuddyRunnerTaskProgress'
							}
						})}
					>
						<Text style={m.viewProfileText}>View Profile</Text>
					</TouchableOpacity>
				</View>

				{/* Revision Request Section */}
				{revisionNotes && (
					<View style={[
						m.revisionCard, 
						{
							backgroundColor: taskStatus === 'completed' ? '#f0fdf4' : '#fff',
							borderColor: taskStatus === 'completed' ? '#22c55e' : '#f59e0b'
						}
					]}>
						<View style={m.revisionHeader}>
							<Ionicons 
								name={taskStatus === 'completed' ? "checkmark-circle" : "alert-circle"} 
								size={24} 
								color={taskStatus === 'completed' ? "#22c55e" : "#eab308"} 
							/>
							<Text style={[m.revisionTitle, { color: taskStatus === 'completed' ? "#22c55e" : "#eab308" }]}>
								{taskStatus === 'completed' ? "Revision Completed" : "Revision Required"}
							</Text>
						</View>
						<Text style={m.revisionMessage}>
							The caller has requested revisions to your work. Please review the feedback below and upload revised files.
						</Text>
						<View style={[
							m.revisionDetails,
							{
								backgroundColor: taskStatus === 'completed' ? '#dcfce7' : '#fef3c7'
							}
						]}>
							<Text style={[
								m.revisionLabel,
								{ color: taskStatus === 'completed' ? '#22c55e' : colors.text }
							]}>Revision Comments:</Text>
							<Text style={[
								m.revisionComments,
								{ color: taskStatus === 'completed' ? '#22c55e' : colors.text }
							]}>{revisionNotes}</Text>
						</View>
						
						{/* Selected Files for Revision */}
						{selectedFilesForRevision.length > 0 && (
							<View style={m.selectedFilesContainer}>
								<Text style={m.selectedFilesLabel}>Files to Revise:</Text>
								<View style={m.selectedFilesList}>
								{selectedFilesForRevision.map((file, index) => (
									<View key={index} style={m.selectedFileItem}>
										<Ionicons name="document" size={16} color={colors.maroon} />
										<Text style={m.selectedFileName}>{file.name}</Text>
									</View>
								))}
								</View>
							</View>
						)}
						
						{revisionRequestedAt && (
							<Text style={m.revisionDate}>
								Requested: {new Date(revisionRequestedAt).toLocaleDateString()} at {new Date(revisionRequestedAt).toLocaleTimeString()}
							</Text>
						)}
						{revisionCount > 0 && (
							<Text style={[
								m.revisionCount,
								{ color: taskStatus === 'completed' ? '#22c55e' : '#f59e0b' }
							]}>
								Revision #{revisionCount}
							</Text>
						)}
					</View>
				)}

				{/* Revision Completed Section */}
				{revisionCompletedAt && (
					<View style={[m.revisionCard, { backgroundColor: '#f0fdf4', borderColor: '#22c55e' }]}>
						<View style={m.revisionHeader}>
							<Ionicons name="checkmark-circle" size={24} color="#22c55e" />
							<Text style={[m.revisionTitle, { color: '#22c55e' }]}>Revision Completed</Text>
						</View>
						<Text style={m.revisionMessage}>
							You have successfully uploaded revised files. The caller will be notified to review your changes.
						</Text>
						<Text style={m.revisionDate}>
							Completed: {new Date(revisionCompletedAt).toLocaleDateString()} at {new Date(revisionCompletedAt).toLocaleTimeString()}
						</Text>
						{revisionCount > 0 && (
							<Text style={m.revisionCount}>
								Revision #{revisionCount}
							</Text>
						)}
					</View>
				)}

				{/* Commission Details Card */}
				<View style={m.commissionCard}>
					<View style={m.commissionHeader}>
						<View style={m.commissionIcon}>
							<Ionicons name="briefcase" size={24} color={colors.maroon} />
						</View>
						<View style={[
							m.statusBadge, 
							{ 
								backgroundColor: taskStatus === "completed" ? "#22c55e" : 
												taskStatus === "revision" ? "#eab308" : "#3B82F6"
							}
						]}>
							<Text style={m.statusText}>
								{taskStatus === "revision" ? "Revision" : 
								 taskStatus === "completed" ? "Completed" :
								 taskStatus === "file_uploaded" ? "In Progress" : "In Progress"}
							</Text>
						</View>
					</View>

					<Text style={m.taskDetailsTitle}>Task Details</Text>

					<View style={m.commissionDetails}>
						<View style={m.detailRow}>
							<Text style={m.detailLabel}>Commission Title:</Text>
							<Text style={m.detailValue}>{commission.title || "N/A"}</Text>
						</View>
						<View style={m.detailRow}>
							<Text style={m.detailLabel}>Type:</Text>
							<Text style={m.detailValue}>{commission.commission_type || "N/A"}</Text>
						</View>
						<View style={m.detailRow}>
							<Text style={m.detailLabel}>Meetup Location:</Text>
							<Text style={m.detailValue}>{commission.meetup_location || "—"}</Text>
						</View>
						<View style={m.detailRow}>
							<Text style={m.detailLabel}>Due At:</Text>
							<Text style={m.detailValue}>
								{commission.due_at ? new Date(commission.due_at).toLocaleString() : "N/A"}
							</Text>
						</View>
					</View>

					<View style={m.descriptionSection}>
						<Text style={m.descriptionLabel}>Commission Description:</Text>
						<Text style={m.descriptionText}>{commission.description || "No description provided"}</Text>
					</View>

					{/* Invoice Breakdown Section */}
					{invoiceAmount !== null && (
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
					)}
				</View>

				{/* Upload File Card */}
				<View style={m.uploadedFileCard}>
					<View style={m.uploadedFileHeader}>
						<Text style={m.uploadedFileTitle}>Upload Files:</Text>
					</View>
					
					{/* Original Files List */}
					{uploadedFiles.length > 0 && (
						<View style={m.filesList}>
							<Text style={m.sectionSubtitle}>Original Files:</Text>
							{uploadedFiles.map((file, index) => (
								<View key={file.id} style={m.fileListItem}>
									<View style={m.fileItemContent}>
										<Ionicons 
											name={file.type === "link" ? "link" : file.type === "text" ? "chatbubble" : "document"} 
											size={20} 
											color={colors.maroon} 
										/>
										<Text style={m.fileItemName} numberOfLines={1}>
											{file.name}
										</Text>
									</View>
								</View>
							))}
						</View>
					)}

					{/* Revised Files List - Only show when revision is requested */}
					{revisionNotes && (
						<View style={m.filesList}>
							<Text style={[m.sectionSubtitle, { color: revisionCompletedAt ? "#22c55e" : undefined }]}>
								{revisionCompletedAt ? "Completed Files:" : "Revised Files:"}
							</Text>
							{revisedFiles.length > 0 ? (
								revisedFiles.map((file, index) => (
									<View key={file.id} style={m.fileContainer}>
										<View style={m.fileInfo}>
											<Ionicons 
												name={file.type === "link" ? "link" : "document"} 
												size={20} 
												color={colors.maroon} 
											/>
											<Text style={m.fileName} numberOfLines={1}>
											{file.name}
										</Text>
									</View>
									<TouchableOpacity 
											style={m.viewButton}
											onPress={() => Linking.openURL(file.url)}
									>
											<Text style={m.viewButtonText}>View</Text>
									</TouchableOpacity>
								</View>
								))
							) : (
								<View style={m.fileContainer}>
									<View style={m.fileInfo}>
										<Ionicons 
											name="document-outline" 
											size={20} 
											color="#999" 
										/>
										<Text style={[m.fileName, { color: "#999", fontStyle: "italic" }]}>
											No revised files uploaded yet
										</Text>
									</View>
								</View>
							)}
						</View>
					)}

					{/* Add File Button */}
					{uploadType !== 'link' && (
						<TouchableOpacity 
							style={[
								m.addFileButton,
								taskStatus === "completed" && m.addFileButtonDisabled
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
								m.addFileButtonText,
								taskStatus === "completed" && m.addFileButtonTextDisabled
							]}>
								{taskStatus === "completed" ? "Task Completed" : "Add Files"}
							</Text>
						</TouchableOpacity>
					)}

					{/* Link Input - Show when link upload is selected */}
					{uploadType === 'link' && (
						<View style={m.linkInputContainer}>
							<Text style={m.linkInputLabel}>Enter Link:</Text>
							<TextInput
								ref={linkInputRef}
								style={m.linkInput}
								value={linkInput}
								onChangeText={handleLinkInputChange}
								placeholder="https://example.com"
								placeholderTextColor="#999"
								keyboardType="url"
								autoCapitalize="none"
								autoCorrect={false}
								onFocus={() => {
									// The KeyboardAvoidingView and ScrollView will handle the scrolling
									// No additional action needed here
								}}
							/>
							<View style={m.linkButtonContainer}>
								<TouchableOpacity 
									style={m.linkCancelButton}
									onPress={() => {
										setUploadType(null);
										setLinkInput("");
									}}
								>
									<Text style={m.linkCancelButtonText}>Cancel</Text>
								</TouchableOpacity>
								<TouchableOpacity 
									style={m.linkSubmitButton}
									onPress={handleLinkUpload}
									disabled={!linkInput.trim()}
								>
									<Text style={m.linkSubmitButtonText}>Add Link</Text>
								</TouchableOpacity>
							</View>
						</View>
					)}

					{/* Selected Files Display */}
					{selectedFiles.length > 0 && (
						<View style={m.selectedFilesContainer}>
							<Text style={m.selectedFilesTitle}>
								Selected Files ({selectedFiles.length}):
							</Text>
							{selectedFiles.map((file, index) => (
								<View key={index} style={m.selectedFileItem}>
									<View style={m.selectedFileInfo}>
										<Ionicons 
											name={file.type === "link" ? "link" : "document"} 
											size={20} 
											color={colors.maroon} 
										/>
										<Text style={m.selectedFileName} numberOfLines={1}>
											{file.name}
										</Text>
									</View>
									<TouchableOpacity 
										style={m.removeSelectedFileButton}
										onPress={() => handleRemoveSelectedFile(index)}
										disabled={isUploading}
									>
										<Ionicons name="close" size={16} color="#dc3545" />
									</TouchableOpacity>
								</View>
							))}
						</View>
					)}

					{/* Upload Button - only show when files are selected */}
					{selectedFiles.length > 0 && (
						<View style={m.uploadButtonContainer}>
							<TouchableOpacity 
								style={[
									m.uploadButton, 
									(isUploading || taskStatus === "completed") && m.uploadButtonDisabled
								]} 
								onPress={handleUploadFile}
								disabled={isUploading || taskStatus === "completed"}
							>
								{isUploading ? (
									<ActivityIndicator color="#fff" size="small" />
								) : taskStatus === "completed" ? (
									<Text style={m.uploadButtonText}>Task Completed</Text>
								) : (
									<Text style={m.uploadButtonText}>Upload</Text>
								)}
							</TouchableOpacity>
						</View>
					)}
				</View>

				</ScrollView>
			</KeyboardAvoidingView>

			{/* Bottom Navigation */}
			<MobileBottomBar
				onHome={() => router.replace("/buddyrunner/home")}
				onMessages={() => router.replace("/buddyrunner/messages_list")}
				onProfile={() => router.replace("/buddyrunner/profile")}
			/>
		</SAView>
	);
}

/* ---- Mobile bottom nav ---- */
function MobileBottomBar({
	onHome,
	onMessages,
	onProfile,
}: {
	onHome: () => void;
	onMessages: () => void;
	onProfile: () => void;
}) {
	const insets = useSafeAreaInsets();
	return (
		<View style={[m.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
			<TouchableOpacity style={m.bottomItem} onPress={onHome} activeOpacity={0.9}>
				<Ionicons name="home" size={22} color="#fff" />
				<Text style={m.bottomText}>Home</Text>
			</TouchableOpacity>
			<TouchableOpacity style={m.bottomItem} onPress={onMessages} activeOpacity={0.9}>
				<Ionicons name="chatbubbles" size={22} color="#fff" />
				<Text style={m.bottomText}>Messages</Text>
			</TouchableOpacity>
			<TouchableOpacity style={m.bottomItem} onPress={onProfile} activeOpacity={0.9}>
				<Ionicons name="person" size={22} color="#fff" />
				<Text style={m.bottomText}>Profile</Text>
			</TouchableOpacity>
			<SAView edges={["bottom"]} style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: colors.maroon }} />
		</View>
	);
}

/* ======================= STYLES (MOBILE) ======================= */
const m = StyleSheet.create({
	callerCard: {
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
	callerHeader: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 12,
	},
	callerAvatar: {
		width: 50,
		height: 50,
		borderRadius: 25,
		backgroundColor: colors.faint,
		alignItems: "center",
		justifyContent: "center",
		marginRight: 12,
	},
	avatarImage: {
		width: 50,
		height: 50,
		borderRadius: 25,
	},
	callerInfo: {
		flex: 1,
	},
	callerName: {
		fontSize: 16,
		fontWeight: "800",
		color: colors.text,
		marginBottom: 2,
	},
	callerId: {
		fontSize: 12,
		color: colors.text,
		opacity: 0.7,
		marginBottom: 2,
	},
	callerCourse: {
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

	commissionCard: {
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
	commissionHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 16,
	},
	taskDetailsTitle: {
		fontSize: 16,
		fontWeight: "800",
		color: colors.text,
		marginBottom: 12,
	},
	commissionIcon: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: colors.faint,
		alignItems: "center",
		justifyContent: "center",
	},
	statusBadge: {
		backgroundColor: "#3B82F6",
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 12,
	},
	statusText: {
		color: "#fff",
		fontSize: 12,
		fontWeight: "700",
	},
	commissionDetails: {
		marginBottom: 16,
	},
	detailRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		marginBottom: 8,
	},
	detailLabel: {
		fontSize: 14,
		fontWeight: "600",
		color: colors.maroon,
		flex: 1,
	},
	detailValue: {
		fontSize: 14,
		color: colors.text,
		flex: 2,
		textAlign: "right",
	},
	descriptionSection: {
		borderTopWidth: 1,
		borderTopColor: colors.border,
		paddingTop: 16,
	},
	descriptionLabel: {
		fontSize: 14,
		fontWeight: "600",
		color: colors.maroon,
		marginBottom: 8,
	},
	descriptionText: {
		fontSize: 14,
		color: colors.text,
		lineHeight: 20,
	},
	invoiceBreakdownSection: {
		borderTopWidth: 1,
		borderTopColor: colors.border,
		paddingTop: 16,
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

	statusCard: {
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
	statusCardTitle: {
		fontSize: 16,
		fontWeight: "800",
		color: colors.text,
		marginBottom: 12,
	},
	statusIndicator: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 8,
	},
	statusDot: {
		width: 12,
		height: 12,
		borderRadius: 6,
		marginRight: 8,
	},
	statusDescription: {
		fontSize: 14,
		color: colors.text,
		opacity: 0.8,
		lineHeight: 20,
	},

	fileCard: {
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
	fileTitle: {
		fontSize: 16,
		fontWeight: "800",
		color: colors.text,
		marginBottom: 12,
	},
	fileItem: {
		flexDirection: "row",
		alignItems: "center",
	},
	fileItemName: {
		fontSize: 14,
		color: colors.text,
		marginLeft: 8,
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
	sectionSubtitle: {
		fontSize: 14,
		fontWeight: "600",
		color: colors.text,
		marginBottom: 8,
		marginTop: 8,
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
	revisedFileRemove: {
		backgroundColor: "#dcfce7",
	},
	textInputWrapper: {
		position: "relative",
		marginBottom: 12,
	},
	textInput: {
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: 8,
		padding: 12,
		paddingRight: 50, // Make room for the embedded icon
		fontSize: 14,
		color: colors.text,
		backgroundColor: "#fff",
		minHeight: 80,
		textAlignVertical: "top",
	},
	embeddedFileIcon: {
		position: "absolute",
		right: 12,
		top: 12,
		padding: 8,
		backgroundColor: "#f5f5f5",
		borderRadius: 6,
		justifyContent: "center",
		alignItems: "center",
	},
	fileContainer: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: 8,
		padding: 12,
		marginBottom: 12,
		backgroundColor: colors.faint,
	},
	fileInfo: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
	},
	fileInfoName: {
		fontSize: 14,
		color: colors.text,
		marginLeft: 8,
	},
	fileListItem: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		backgroundColor: "#f8f9fa",
		borderRadius: 8,
		padding: 12,
		marginBottom: 8,
		borderWidth: 1,
		borderColor: "#dee2e6",
	},
	fileItemContent: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
	},
	fileItemContentName: {
		fontSize: 14,
		color: colors.text,
		marginLeft: 8,
		flex: 1,
	},
	fileItemActions: {
		flexDirection: "row",
		alignItems: "center",
	},
	fileItemDownload: {
		padding: 6,
		marginRight: 8,
		borderRadius: 4,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: colors.border,
	},
	fileItemRemove: {
		padding: 6,
		borderRadius: 4,
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
		padding: 12,
		marginTop: 8,
		borderWidth: 1,
		borderColor: "#dee2e6",
	},
	addFileButtonDisabled: {
		backgroundColor: "#f5f5f5",
		borderColor: "#ccc",
		opacity: 0.6,
	},
	addFileButtonText: {
		fontSize: 14,
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
		padding: 12,
		marginTop: 8,
		borderWidth: 1,
		borderColor: "#dee2e6",
	},
	selectedFileInfo: {
		flexDirection: "row",
		alignItems: "center",
		flex: 1,
	},
	selectedFileName: {
		fontSize: 14,
		color: colors.text,
		marginLeft: 8,
		flex: 1,
	},
	clearFileButton: {
		padding: 6,
		borderRadius: 4,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#dc3545",
	},
	selectedFilesContainer: {
		backgroundColor: "#f8f9fa",
		borderRadius: 8,
		padding: 12,
		marginTop: 8,
		borderWidth: 1,
		borderColor: "#dee2e6",
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
		paddingVertical: 4,
	},
	removeSelectedFileButton: {
		padding: 4,
		borderRadius: 4,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#dc3545",
		marginLeft: 8,
	},
	clearFilesButton: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "center",
		padding: 8,
		marginTop: 8,
		borderRadius: 4,
		backgroundColor: "#fff",
		borderWidth: 1,
		borderColor: "#dc3545",
	},
	clearFilesButtonText: {
		fontSize: 12,
		color: "#dc3545",
		marginLeft: 4,
		fontWeight: "600",
	},
	downloadButton: {
		padding: 8,
		borderRadius: 4,
		marginRight: 8,
		backgroundColor: "#f8f9fa",
		borderWidth: 1,
		borderColor: colors.border,
	},
	viewButton: {
		backgroundColor: colors.maroon,
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 6,
	},
	viewButtonText: {
		color: "#fff",
		fontSize: 12,
		fontWeight: "600",
	},
	noFileContainer: {
		borderWidth: 1,
		borderColor: colors.border,
		borderRadius: 8,
		padding: 12,
		marginBottom: 12,
		backgroundColor: colors.faint,
		alignItems: "center",
	},
	noFileText: {
		fontSize: 14,
		color: colors.text,
		opacity: 0.7,
	},
	uploadButton: {
		backgroundColor: colors.maroon,
		paddingVertical: 12,
		paddingHorizontal: 24,
		borderRadius: 8,
		alignItems: "center",
	},
	uploadButtonText: {
		color: "#fff",
		fontSize: 14,
		fontWeight: "600",
	},
	buttonContainer: {
		flexDirection: "row",
		justifyContent: "space-between",
		gap: 10,
	},
	uploadButtonContainer: {
		alignItems: "center",
		marginTop: 16,
		marginBottom: 8,
	},
	uploadButtonDisabled: {
		opacity: 0.6,
	},
	filesList: {
		marginBottom: 16,
	},
	fileActions: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	removeButton: {
		backgroundColor: "#ff4444",
		paddingHorizontal: 12,
		paddingVertical: 6,
		borderRadius: 6,
	},
	removeButtonText: {
		color: "#fff",
		fontSize: 12,
		fontWeight: "600",
	},

	bottomBar: {
		position: "absolute",
		left: 0,
		right: 0,
		bottom: 0,
		backgroundColor: colors.maroon,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-around",
		paddingHorizontal: 16,
		paddingTop: 10,
	},
	bottomItem: { alignItems: "center", justifyContent: "center" },
	bottomText: { color: "#fff", fontSize: 12, marginTop: 4 },
	// Revision Section Styles
	revisionCard: {
		backgroundColor: "#fff",
		borderRadius: 12,
		padding: 16,
		marginBottom: 16,
		borderWidth: 1,
		borderColor: "#f59e0b",
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 2,
		elevation: 2,
	},
	revisionHeader: {
		flexDirection: "row",
		alignItems: "center",
		marginBottom: 12,
	},
	revisionTitle: {
		fontSize: 18,
		fontWeight: "700",
		color: "#f59e0b",
		marginLeft: 8,
	},
	revisionMessage: {
		fontSize: 14,
		color: colors.text,
		lineHeight: 20,
		marginBottom: 16,
	},
	revisionDetails: {
		backgroundColor: "#fef3c7",
		borderRadius: 8,
		padding: 12,
		marginBottom: 12,
	},
	revisionLabel: {
		fontSize: 14,
		fontWeight: "600",
		color: colors.text,
		marginBottom: 4,
	},
	revisionComments: {
		fontSize: 14,
		color: colors.text,
		lineHeight: 20,
	},
	revisionDate: {
		fontSize: 12,
		color: colors.text,
		opacity: 0.7,
		marginBottom: 4,
	},
	revisionCount: {
		fontSize: 12,
		fontWeight: "600",
		color: "#f59e0b",
	},
	selectedFilesLabel: {
		fontSize: 14,
		fontWeight: "600",
		color: colors.maroon,
		marginBottom: 8,
	},
	selectedFilesList: {
		flexDirection: "column",
		gap: 6,
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
		marginBottom: 20,
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
		borderWidth: 2,
		borderColor: colors.maroon,
		borderRadius: 8,
		paddingHorizontal: 16,
		paddingVertical: 14,
		fontSize: 16,
		color: colors.text,
		backgroundColor: "#fff",
		marginBottom: 16,
		minHeight: 50,
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
});
