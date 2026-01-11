// app/buddycaller/messages.tsx
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    FlatList,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Image,
    Linking,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';

const MAROON = '#8B0000';

interface Message {
    id: string;
    message_text: string;
    sender_id: string;
    created_at: string;
    is_read: boolean;
    message_type?: string;
    file_url?: string;
    file_name?: string;
    file_size?: number;
    file_type?: string;
}

interface Conversation {
    id: string;
    user1_id: string;
    user2_id: string;
    last_message_at: string;
}

export default function MessagesScreen() {
  const router = useRouter();
    const { conversationId, contactId, contactName, otherUserId, otherUserName } = useLocalSearchParams();
    const [user, setUser] = useState<any>(null);
    const [otherUser, setOtherUser] = useState<any>(null);
    
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Get the actual conversation ID (either from conversationId or contactId)
    const actualConversationId = conversationId || contactId;

    // Get current user
    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            setUser(user);
        };
        getUser();
    }, []);

    // Get other user information
    useEffect(() => {
        console.log('otherUserId received:', otherUserId);
        console.log('contactName received:', contactName);
        console.log('otherUserName received:', otherUserName);
        if (otherUserId && otherUserId !== 'unknown' && otherUserId !== '') {
            fetchOtherUser();
        }
    }, [otherUserId]);

    const fetchOtherUser = async () => {
        try {
            console.log('Fetching user with ID:', otherUserId);
            
            // Don't fetch if otherUserId is 'unknown' or invalid
            if (!otherUserId || otherUserId === 'unknown' || otherUserId === '') {
                console.log('Skipping fetch - invalid otherUserId:', otherUserId);
                return;
            }
            
            const { data, error } = await supabase
                .from('users')
                .select('id, first_name, last_name, role')
                .eq('id', otherUserId)
                .single();

            if (error) {
                console.error('Database error:', error);
                throw error;
            }
            console.log('Fetched other user:', data);
            setOtherUser(data);
        } catch (error) {
            console.error('Error fetching other user:', error);
        }
    };

    // Load messages
    useEffect(() => {
        if (actualConversationId) {
            loadMessages();
        } else {
            // If no conversation ID, just show empty state
            setLoading(false);
        }
    }, [actualConversationId]);

    // Set up real-time subscription
    useEffect(() => {
        if (!actualConversationId) return;

        const subscription = supabase
            .channel('messages')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'messages',
                    filter: `conversation_id=eq.${actualConversationId}`,
                },
                (payload) => {
                    const newMessage = payload.new as Message;
                    setMessages(prev => [...prev, newMessage]);
                }
            )
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [actualConversationId]);

    const loadMessages = async () => {
        try {
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('conversation_id', actualConversationId)
                .order('created_at', { ascending: true });

            if (error) throw error;
            
            console.log('Raw messages from database:', data);
            
            // Process messages to ensure file fields are properly handled
            const processedMessages = (data || []).map(message => {
                console.log('Processing message:', {
                    id: message.id,
                    message_type: message.message_type,
                    file_name: message.file_name,
                    file_type: message.file_type,
                    file_size: message.file_size,
                    file_url: message.file_url
                });
                
                return {
                    ...message,
                    file_name: message.file_name || null,
                    file_type: message.file_type || null,
                    file_size: message.file_size || 0
                };
            });
            
            console.log('Processed messages:', processedMessages);
            
            
            setMessages(processedMessages);
        } catch (error) {
            console.error('Error loading messages:', error);
            Alert.alert('Error', 'Failed to load messages');
        } finally {
            setLoading(false);
        }
    };

    const sendMessage = async () => {
        if (!newMessage.trim() || !actualConversationId || !user) return;

        setSending(true);
        try {
            const { error } = await supabase
                .from('messages')
                .insert({
                    conversation_id: actualConversationId,
                    sender_id: user.id,
                    message_text: newMessage.trim(),
                    message_type: 'text'
                });

            if (error) throw error;
            setNewMessage('');
        } catch (error) {
            console.error('Error sending message:', error);
            Alert.alert('Error', 'Failed to send message');
        } finally {
            setSending(false);
        }
    };

    const uploadFile = async (fileUri: string, fileName: string, fileType: string, fileSize?: number) => {
        if (!user || !actualConversationId) return;

        setUploading(true);
        try {
            // Debug: Check authentication status
            const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
            console.log('Current user during upload:', currentUser);
            console.log('Auth error:', authError);
            
            if (authError || !currentUser) {
                throw new Error('User not authenticated');
            }

            // Use a more unique filename to avoid conflicts
            const timestamp = Date.now();
            const uniqueFileName = `${user.id}/chat_${timestamp}_${fileName}`;
            console.log('Uploading file with name:', uniqueFileName);

            // For React Native, use FormData approach
            const formData = new FormData();
            formData.append('file', {
                uri: fileUri,
                type: fileType,
                name: fileName,
            } as any);

            // Try uploading to chat-files bucket (better for chat files)
            console.log('Attempting upload to chat-files bucket...');
            let { data: uploadData, error: uploadError } = await supabase.storage
                .from('chat-files')
                .upload(uniqueFileName, formData, {
                    contentType: fileType,
                    upsert: true, // Allow overwriting existing files
                });

            if (uploadError) {
                console.error('Upload error with chat-files bucket:', uploadError);
                
                // If chat-files fails, try student-ids as fallback
                console.log('Trying fallback upload to student-ids bucket...');
                
                // Try uploading with a simpler filename to student-ids
                const simpleFileName = `chat_${timestamp}_${fileName}`;
                const { data: fallbackData, error: fallbackError } = await supabase.storage
                    .from('student-ids')
                    .upload(simpleFileName, formData, {
                        contentType: fileType,
                        upsert: true,
                    });
                
                if (fallbackError) {
                    console.error('Fallback upload also failed:', fallbackError);
                    throw fallbackError;
                }
                
                // Use fallback data
                uploadData = fallbackData;
                const finalFileName = simpleFileName;
            }

            // Get public URL
            const finalFileName = uploadError ? `chat_${timestamp}_${fileName}` : uniqueFileName;
            const bucketName = uploadError ? 'student-ids' : 'chat-files';
            const { data: urlData } = supabase.storage
                .from(bucketName)
                .getPublicUrl(finalFileName);

            console.log('Upload successful:', uploadData);
            console.log('Public URL:', urlData.publicUrl);

            // Determine message type based on file type
            const isImageFile = fileType.startsWith('image/') || 
                               fileName.toLowerCase().match(/\.(jpg|jpeg|png|gif|bmp|webp)$/);
            
            // Send message with file
            const { error: messageError } = await supabase
                .from('messages')
                .insert({
                    conversation_id: actualConversationId,
                    sender_id: user.id,
                    message_text: isImageFile ? `📷 ${fileName}` : `📎 ${fileName}`,
                    message_type: isImageFile ? 'image' : 'file',
                    file_url: urlData.publicUrl,
                    file_name: fileName,
                    file_type: fileType,
                    file_size: fileSize || 0
                });

            console.log('File message data being saved:', {
                conversation_id: actualConversationId,
                sender_id: user.id,
                message_text: isImageFile ? `📷 ${fileName}` : `📎 ${fileName}`,
                message_type: isImageFile ? 'image' : 'file',
                file_url: urlData.publicUrl,
                file_name: fileName,
                file_type: fileType,
                file_size: fileSize || 0
            });


            console.log('Original file data:', {
                fileUri,
                fileName,
                fileType,
                fileSize
            });


            if (messageError) {
                console.error('Message error:', messageError);
                throw messageError;
            }

            console.log('File message sent successfully');

        } catch (error) {
            console.error('Error uploading file:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            Alert.alert('Error', `Failed to upload file: ${errorMessage}`);
        } finally {
            setUploading(false);
        }
    };

    const pickFile = async () => {
        try {
            // Request permission to access media library
            const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
            
            if (permissionResult.granted === false) {
                Alert.alert('Permission Required', 'Permission to access files is required!');
                return;
            }

            // Show action sheet for file selection
            Alert.alert(
                'Select File',
                'Choose how you want to select a file',
                [
                    {
                        text: 'Camera',
                        onPress: () => openCamera(),
                    },
                    {
                        text: 'Photo Library',
                        onPress: () => openImageLibrary(),
                    },
                    {
                        text: 'Document Library',
                        onPress: () => openDocumentLibrary(),
                    },
                    {
                        text: 'Cancel',
                        style: 'cancel',
                    },
                ]
            );
        } catch (error) {
            console.error('Error picking file:', error);
            Alert.alert('Error', 'Failed to open file picker');
        }
    };

    const openCamera = async () => {
        try {
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.All,
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
                const asset = result.assets[0];
                await uploadFile(asset.uri, asset.fileName || 'image.jpg', asset.type || 'image/jpeg');
            }
        } catch (error) {
            console.error('Error opening camera:', error);
            Alert.alert('Error', 'Failed to open camera');
        }
    };

    const openImageLibrary = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.All,
                allowsEditing: true,
                aspect: [4, 3],
                quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
                const asset = result.assets[0];
                await uploadFile(asset.uri, asset.fileName || 'image.jpg', asset.type || 'image/jpeg');
            }
        } catch (error) {
            console.error('Error opening image library:', error);
            Alert.alert('Error', 'Failed to open image library');
        }
    };

    const openDocumentLibrary = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({
                type: '*/*', // Allow all file types
                copyToCacheDirectory: true,
            });

            if (!result.canceled && result.assets[0]) {
                const asset = result.assets[0];
                const fileName = asset.name || 'document';
                const fileType = asset.mimeType || 'application/octet-stream';
                const fileUri = asset.uri;
                
                console.log('Document selected:', {
                    name: fileName,
                    type: fileType,
                    uri: fileUri,
                    size: asset.size
                });
                
                await uploadFile(fileUri, fileName, fileType, asset.size);
            }
        } catch (error) {
            console.error('Error opening document library:', error);
            Alert.alert('Error', 'Failed to open document library');
        }
    };

    const saveImageToGallery = async (imageUrl: string) => {
        try {
            // For development, we'll use a simpler approach
            // In production, you can use expo-media-library
            Alert.alert(
                'Save Image',
                'To save this image to your gallery, please:\n\n1. Tap "View" to open the image\n2. Long press on the image\n3. Select "Save to Photos" or "Download"',
                [
                    { text: 'View Image', onPress: () => Linking.openURL(imageUrl) },
                    { text: 'Cancel', style: 'cancel' }
                ]
            );
            
        } catch (error) {
            console.error('Error with image save option:', error);
            Alert.alert('Error', 'Failed to open image save options');
        }
    };

    const getFileIcon = (fileType: string, fileName: string) => {
        const iconColor = '#fff';
        const iconSize = 28;
        
        // Check file extension first
        const extension = fileName.toLowerCase().split('.').pop();
        
        if (fileType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension || '')) {
            return <Ionicons name="image" size={iconSize} color={iconColor} />;
        } else if (fileType.includes('pdf') || extension === 'pdf') {
            return <Ionicons name="document-text" size={iconSize} color={iconColor} />;
        } else if (fileType.includes('word') || extension === 'doc' || extension === 'docx') {
            return <Ionicons name="document-text" size={iconSize} color={iconColor} />;
        } else if (fileType.includes('excel') || extension === 'xls' || extension === 'xlsx') {
            return <Ionicons name="grid" size={iconSize} color={iconColor} />;
        } else if (fileType.includes('powerpoint') || extension === 'ppt' || extension === 'pptx') {
            return <Ionicons name="easel" size={iconSize} color={iconColor} />;
        } else if (fileType.includes('text') || extension === 'txt') {
            return <Ionicons name="document-text" size={iconSize} color={iconColor} />;
        } else if (fileType.includes('zip') || extension === 'zip' || extension === 'rar') {
            return <Ionicons name="archive" size={iconSize} color={iconColor} />;
        } else if (fileType.includes('video') || ['mp4', 'avi', 'mov', 'wmv'].includes(extension || '')) {
            return <Ionicons name="videocam" size={iconSize} color={iconColor} />;
        } else if (fileType.includes('audio') || ['mp3', 'wav', 'aac'].includes(extension || '')) {
            return <Ionicons name="musical-notes" size={iconSize} color={iconColor} />;
        } else {
            return <Ionicons name="document" size={iconSize} color={iconColor} />;
        }
    };

    const getFileIconColor = (fileType: string, fileName: string) => {
        // Check file extension first
        const extension = fileName.toLowerCase().split('.').pop();
        
        if (fileType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension || '')) {
            return '#4CAF50'; // Green for images
        } else if (fileType.includes('pdf') || extension === 'pdf') {
            return '#F44336'; // Red for PDFs
        } else if (fileType.includes('word') || extension === 'doc' || extension === 'docx') {
            return '#2196F3'; // Blue for Word docs
        } else if (fileType.includes('excel') || extension === 'xls' || extension === 'xlsx') {
            return '#4CAF50'; // Green for Excel
        } else if (fileType.includes('powerpoint') || extension === 'ppt' || extension === 'pptx') {
            return '#FF9800'; // Orange for PowerPoint
        } else if (fileType.includes('text') || extension === 'txt') {
            return '#9C27B0'; // Purple for text files
        } else if (fileType.includes('zip') || extension === 'zip' || extension === 'rar') {
            return '#795548'; // Brown for archives
        } else if (fileType.includes('video') || ['mp4', 'avi', 'mov', 'wmv'].includes(extension || '')) {
            return '#E91E63'; // Pink for videos
        } else if (fileType.includes('audio') || ['mp3', 'wav', 'aac'].includes(extension || '')) {
            return '#607D8B'; // Blue grey for audio
        } else {
            return '#9E9E9E'; // Grey for unknown files
        }
    };

    const getFileTypeLabel = (fileType: string, fileName: string) => {
        // Check file extension first
        const extension = fileName.toLowerCase().split('.').pop();
        
        if (fileType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'].includes(extension || '')) {
            return 'Image';
        } else if (fileType.includes('pdf') || extension === 'pdf') {
            return 'PDF Document';
        } else if (fileType.includes('word') || extension === 'doc' || extension === 'docx') {
            return 'Word Document';
        } else if (fileType.includes('excel') || extension === 'xls' || extension === 'xlsx') {
            return 'Excel Spreadsheet';
        } else if (fileType.includes('powerpoint') || extension === 'ppt' || extension === 'pptx') {
            return 'PowerPoint Presentation';
        } else if (fileType.includes('text') || extension === 'txt') {
            return 'Text File';
        } else if (fileType.includes('zip') || extension === 'zip' || extension === 'rar') {
            return 'Archive File';
        } else if (fileType.includes('video') || ['mp4', 'avi', 'mov', 'wmv'].includes(extension || '')) {
            return 'Video File';
        } else if (fileType.includes('audio') || ['mp3', 'wav', 'aac'].includes(extension || '')) {
            return 'Audio File';
        } else {
            return 'Document';
        }
    };

        const renderMessage = ({ item }: { item: Message }) => {
            const isMyMessage = item.sender_id === user?.id;
            const isImage = item.message_type === 'image';
            const isFile = item.message_type === 'file';
            
            // Debug logging for file names
            if (isFile) {
                console.log('File message details:', {
                    id: item.id,
                    file_name: item.file_name,
                    message_text: item.message_text,
                    file_type: item.file_type,
                    display_name: item.file_name || 'Unknown File'
                });
            }
        
        return (
            <View style={[
                styles.messageContainer,
                isMyMessage ? styles.myMessage : styles.otherMessage
            ]}>
                {!isMyMessage && otherUser && (
                    <Text style={styles.senderName}>
                        {otherUser.first_name} {otherUser.last_name}
                    </Text>
                )}
                
                    {isImage && item.file_url ? (
                        <TouchableOpacity 
                            style={styles.imageContainer}
                            onPress={() => {
                                Alert.alert(
                                    'Image Options',
                                    'What would you like to do with this image?',
                                    [
                                        { text: 'View', onPress: () => Linking.openURL(item.file_url!) },
                                        { text: 'Save to Gallery', onPress: () => saveImageToGallery(item.file_url!) },
                                        { text: 'Cancel', style: 'cancel' },
                                    ]
                                );
                            }}
                        >
                            <Image 
                                source={{ uri: item.file_url }} 
                                style={styles.messageImage}
                                resizeMode="cover"
                                onError={(error) => {
                                    console.error('Image load error:', error);
                                    console.log('Failed URL:', item.file_url);
                                }}
                            />
                        </TouchableOpacity>
                    ) : isFile && item.file_url ? (
                    <TouchableOpacity 
                        style={[
                            styles.fileContainer,
                            isMyMessage ? styles.myFileContainer : styles.otherFileContainer
                        ]}
                        onPress={() => Linking.openURL(item.file_url!)}
                    >
                        <View style={[
                            styles.fileIconContainer,
                            { backgroundColor: getFileIconColor(item.file_type || '', item.file_name || '') }
                        ]}>
                            {getFileIcon(item.file_type || '', item.file_name || '')}
                        </View>
                        <View style={styles.fileInfo}>
                            <Text 
                                style={[
                                    styles.fileName,
                                    isMyMessage ? styles.myFileText : styles.otherFileText
                                ]}
                            >
                                {item.file_name || 'Unknown File'}
                            </Text>
                            <View style={styles.fileTypeContainer}>
                                <Text style={[
                                    styles.fileType,
                                    isMyMessage ? styles.myFileType : styles.otherFileType
                                ]}>
                                    {getFileTypeLabel(item.file_type || '', item.file_name || '')}
                                </Text>
                                <Text style={[
                                    styles.fileSize,
                                    isMyMessage ? styles.myFileSize : styles.otherFileSize
                                ]}>
                                    {item.file_size ? `${(item.file_size / 1024).toFixed(1)} KB` : 'File'}
                                </Text>
                            </View>
                        </View>
                    </TouchableOpacity>
                ) : (
                    <Text style={[
                        styles.messageText,
                        isMyMessage ? styles.myMessageText : styles.otherMessageText
                    ]}>
                        {item.message_text}
                    </Text>
                )}
                
                <Text style={[
                    styles.messageTime,
                    isMyMessage ? styles.myMessageTime : styles.otherMessageTime
                ]}>
                    {new Date(item.created_at).toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                    })}
                </Text>
            </View>
        );
    };

    if (loading) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={24} color={MAROON} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Loading...</Text>
                </View>
            </SafeAreaView>
        );
    }

  return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                {Platform.OS !== 'web' ? (
                    <TouchableOpacity onPress={() => router.back()}>
                        <Ionicons name="arrow-back" size={24} color={MAROON} />
                    </TouchableOpacity>
                ) : (
                    <View style={{ width: 24 }} />
                )}
                <Text style={styles.headerTitle}>
                    {otherUser ? `${otherUser.first_name} ${otherUser.last_name}` : contactName || otherUserName || 'Unknown User'}
                </Text>
                <View style={styles.placeholder} />
            </View>

            <KeyboardAvoidingView 
                style={styles.chatContainer}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <FlatList
                    data={messages}
                    renderItem={renderMessage}
                    keyExtractor={(item) => item.id}
                    style={styles.messagesList}
                    contentContainerStyle={styles.messagesContent}
                />

                <View style={styles.inputContainer}>
            <TouchableOpacity
                style={styles.attachButton}
                onPress={pickFile}
                disabled={uploading}
            >
                        <Ionicons 
                            name="attach" 
                            size={24} 
                            color={uploading ? '#999' : MAROON} 
                        />
                    </TouchableOpacity>
                    <TextInput
                        style={styles.textInput}
                        value={newMessage}
                        onChangeText={setNewMessage}
                        placeholder="Type a message..."
                        multiline
                        maxLength={500}
                    />
                    <TouchableOpacity
                        style={[
                            styles.sendButton,
                            (!newMessage.trim() || sending || uploading) && styles.sendButtonDisabled
                        ]}
                        onPress={sendMessage}
                        disabled={!newMessage.trim() || sending || uploading}
                    >
                        <Ionicons 
                            name="send" 
                            size={20} 
                            color={newMessage.trim() ? '#fff' : '#999'} 
                        />
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fff',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
    },
    headerTitle: {
        flex: 1,
        fontSize: 18,
        fontWeight: '600',
        color: MAROON,
        textAlign: 'center',
    },
    placeholder: {
        width: 24,
    },
    chatContainer: {
        flex: 1,
    },
    messagesList: {
        flex: 1,
    },
    messagesContent: {
        padding: 16,
    },
    messageContainer: {
        marginVertical: 4,
        maxWidth: '80%',
        padding: 12,
        borderRadius: 16,
    },
    senderName: {
        fontSize: 12,
        fontWeight: '600',
        color: '#666',
        marginBottom: 2,
    },
    myMessage: {
        alignSelf: 'flex-end',
        backgroundColor: MAROON,
        borderBottomRightRadius: 4,
    },
    otherMessage: {
        alignSelf: 'flex-start',
        backgroundColor: '#f0f0f0',
        borderBottomLeftRadius: 4,
    },
    messageText: {
        fontSize: 16,
        lineHeight: 20,
    },
    myMessageText: {
        color: '#fff',
    },
    otherMessageText: {
        color: '#000',
    },
    messageTime: {
        fontSize: 12,
        marginTop: 4,
    },
    myMessageTime: {
        color: '#fff',
        opacity: 0.7,
    },
    otherMessageTime: {
        color: '#666',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
        backgroundColor: '#fff',
    },
    attachButton: {
        padding: 8,
        marginRight: 8,
    },
    textInput: {
        flex: 1,
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingVertical: 10,
        marginRight: 12,
        maxHeight: 100,
        fontSize: 16,
    },
    sendButton: {
        backgroundColor: MAROON,
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    sendButtonDisabled: {
        backgroundColor: '#ccc',
    },
    imageContainer: {
        marginVertical: 4,
        borderRadius: 12,
        overflow: 'hidden',
        backgroundColor: 'rgba(0,0,0,0.1)',
    },
    messageImage: {
        width: 200,
        height: 200,
        borderRadius: 12,
    },
    fileContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 12,
        marginVertical: 4,
        minHeight: 60,
        maxWidth: '95%',
        minWidth: 200,
    },
    fileIconContainer: {
        width: 50,
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    fileInfo: {
        flex: 1,
        justifyContent: 'center',
    },
    fileTypeContainer: {
        flexDirection: 'column',
        alignItems: 'flex-start',
        marginTop: 4,
    },
    fileType: {
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 2,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    fileName: {
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 2,
        flex: 1,
        flexWrap: 'wrap',
    },
    fileSize: {
        fontSize: 12,
        opacity: 0.7,
    },
    // File display styles for consistent formatting
    myFileContainer: {
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    otherFileContainer: {
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    myFileText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    otherFileText: {
        color: '#000000',
        fontSize: 14,
        fontWeight: '600',
    },
    myFileType: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
        fontWeight: '600',
    },
    otherFileType: {
        color: 'rgba(0,0,0,0.7)',
        fontSize: 12,
        fontWeight: '600',
    },
    myFileSize: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 12,
        opacity: 0.7,
    },
    otherFileSize: {
        color: 'rgba(0,0,0,0.7)',
        fontSize: 12,
        opacity: 0.7,
    },
});