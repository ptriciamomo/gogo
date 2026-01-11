import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Platform, type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { responsive, rp, rf } from '../../utils/responsive';

interface ChatHeaderProps {
  contactProfile: any;
  contact: { name: string };
  isDateFiltered: boolean;
  onNavigateToProfile: () => void;
  onClearFilter: () => void;
  onOpenSettings: () => void;
  getUserInitialsFromProfile: (profile: any) => string;
  onBack?: () => void;
}

export default function ChatHeader({
  contactProfile,
  contact,
  isDateFiltered,
  onNavigateToProfile,
  onClearFilter,
  onOpenSettings,
  getUserInitialsFromProfile,
  onBack,
}: ChatHeaderProps) {
  const router = useRouter();

  const handleBack = onBack || (() => {
    // Validate role before navigating back
    supabase.auth.getUser().then(({ data: userRes }) => {
      if (userRes?.user) {
        supabase.from("users").select("role").eq("id", userRes.user.id).single().then(({ data: profile }) => {
          const userRole = profile?.role?.toLowerCase();
          if (userRole === 'buddycaller') {
            router.push('/buddycaller/messages_list');
          } else if (userRole === 'buddyrunner') {
            router.push('/buddyrunner/home');
          } else {
            router.push('/buddycaller/messages_list');
          }
        });
      } else {
        router.push('/buddycaller/messages_list');
      }
    });
  });

  return (
    <View style={styles.header as ViewStyle}>
      <View style={styles.headerContent as ViewStyle}>
        {Platform.OS !== 'web' ? (
          <TouchableOpacity onPress={handleBack} style={styles.backButton as ViewStyle}>
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

        {/* Date Filter Clear Button - Show when date filter is active */}
        {isDateFiltered && (
          <TouchableOpacity 
            onPress={onClearFilter} 
            style={styles.clearFilterButton as ViewStyle}
          >
            <Ionicons name="close-circle" size={20} color="#8B2323" />
          </TouchableOpacity>
        )}

        {/* Commission Settings Icon */}
        <TouchableOpacity 
          onPress={onOpenSettings} 
          style={styles.settingsButton as ViewStyle}
        >
          <Ionicons name="settings-outline" size={22} color="#8B2323" />
        </TouchableOpacity>
      </View>
      <View style={styles.headerDivider as ViewStyle} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: 'white',
    paddingTop: rp(4),
    paddingBottom: rp(8),
    paddingHorizontal: rp(16),
    ...(Platform.OS === 'web' && {
      position: 'sticky' as any,
      top: 0,
      zIndex: 1000,
      borderBottomWidth: 1,
      borderBottomColor: '#EEEEEE',
    }),
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: rp(4),
  },
  contactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: rp(12),
  },
  contactProfilePicture: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#C8C8C8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: rp(8),
  },
  profileInitials: {
    color: 'white',
    fontSize: rf(11),
    fontWeight: '600',
  },
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  contactNameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: rp(6),
  },
  contactName: {
    fontSize: Platform.OS === 'web' ? 16 : rf(18),
    fontWeight: '600',
    color: '#8B2323',
    marginRight: rp(8),
    flexShrink: 1,
  },
  clearFilterButton: {
    padding: 6,
    borderRadius: 16,
    backgroundColor: '#FFF5F5',
    marginLeft: 8,
    marginRight: 4,
  },
  settingsButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#FFF5F5',
    marginLeft: 8,
  },
  headerDivider: {
    height: 1,
    backgroundColor: '#EEEEEE',
    marginTop: rp(8),
    ...(Platform.OS === 'web' && {
      height: 0,
      marginTop: 0,
    }),
  },
});

