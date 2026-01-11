import React from 'react';
import { View, Text, TouchableOpacity, Image, Platform, type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface RunnerChatHeaderProps {
  styles: any;
  contactProfile: any;
  contact: { name: string };
  onBack: () => void;
  onNavigateToProfile: () => void;
  onOpenSettings: () => void;
  getUserInitialsFromProfile: (profile: any) => string;
}

export function RunnerChatHeader({
  styles,
  contactProfile,
  contact,
  onBack,
  onNavigateToProfile,
  onOpenSettings,
  getUserInitialsFromProfile,
}: RunnerChatHeaderProps) {
  return (
    <View style={styles.header as ViewStyle}>
      <View style={styles.headerContent as ViewStyle}>
        {Platform.OS !== 'web' ? (
          <TouchableOpacity onPress={onBack} style={styles.backButton as ViewStyle}>
            <Ionicons name="chevron-back" size={24} color="#8B2323" />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 24 }} />
        )}

        <TouchableOpacity
          style={styles.contactInfo as ViewStyle}
          onPress={onNavigateToProfile}
          activeOpacity={0.7}
        >
          <View style={styles.contactProfilePicture as ViewStyle}>
            {contactProfile?.profile_picture_url ? (
              <Image
                source={{ uri: contactProfile.profile_picture_url }}
                style={styles.profileImage as ImageStyle}
                resizeMode="cover"
              />
            ) : (
              <Text style={styles.profileInitials as TextStyle}>
                {getUserInitialsFromProfile(contactProfile)}
              </Text>
            )}
          </View>
          <View style={styles.contactNameContainer as ViewStyle}>
            <Text style={styles.contactName as TextStyle}>
              {contactProfile ? `${contactProfile.first_name || ''} ${contactProfile.last_name || ''}`.trim() : contact.name}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#B04A4A" />
        </TouchableOpacity>

        {/* Commission Settings Icon */}
        <TouchableOpacity 
          onPress={onOpenSettings} 
          style={styles.settingsButton as ViewStyle}
          {...(Platform.OS === 'web' ? { onClick: onOpenSettings } as any : {})}
        >
          <Ionicons name="settings-outline" size={22} color="#8B2323" />
        </TouchableOpacity>
      </View>
      <View style={styles.headerDivider as ViewStyle} />
    </View>
  );
}


