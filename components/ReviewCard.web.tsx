import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { responsive, rp, webResponsive } from '../utils/responsive';

/* ================= COLORS ================= */
const colors = {
    maroon: "#8B0000",
    light: "#FAF6F5",
    border: "#E5C8C5",
    text: "#531010",
    pillText: "#FFFFFF",
    pillTextActive: "#1e293b",
    faint: "#F7F1F0",
    white: "#FFFFFF",
    black: "#000000",
    gray: "#666666",
    lightGray: "#CCCCCC",
    yellow: "#FFD700",
};

/* ================ TYPES ================== */
type Review = {
    id: string;
    reviewerName: string;
    reviewerInitials: string;
    reviewerProfilePictureUrl: string | null;
    rating: number;
    comment: string;
    date: string;
};

interface ReviewCardProps {
    review: Review;
}

const ReviewCard: React.FC<ReviewCardProps> = ({ review }) => {
    const renderStars = (rating: number) => {
        return Array.from({ length: 5 }, (_, index) => (
            <Ionicons
                key={index}
                name={index < rating ? "star" : "star-outline"}
                size={16}
                color={colors.yellow}
            />
        ));
    };

    const hasComment = review.comment && review.comment.trim().length > 0;

    return (
        <View style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
                <View style={styles.reviewerInfo}>
                    <View style={styles.reviewerInitials}>
                        {review.reviewerProfilePictureUrl ? (
                            <Image 
                                source={{ uri: review.reviewerProfilePictureUrl }} 
                                style={styles.reviewerProfileImage}
                            />
                        ) : (
                            <Text style={styles.reviewerInitialsText}>{review.reviewerInitials}</Text>
                        )}
                    </View>
                    <View style={styles.reviewerDetails}>
                        <View style={styles.nameAndStarsRow}>
                            <Text style={styles.reviewerName}>{review.reviewerName}</Text>
                            <View style={styles.starsContainer}>
                                {renderStars(review.rating)}
                            </View>
                        </View>
                    </View>
                </View>
                <Text style={styles.reviewDate}>{review.date}</Text>
            </View>
            {hasComment ? (
                <Text style={styles.reviewComment}>"{review.comment}"</Text>
            ) : (
                <Text style={styles.emptyComment}>No written feedback provided</Text>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    reviewCard: {
        backgroundColor: colors.faint,
        borderRadius: webResponsive.borderRadius(8),
        padding: rp(10),
        marginBottom: rp(10),
    },
    reviewHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: rp(6),
    },
    reviewerInfo: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        flex: 1,
    },
    reviewerDetails: {
        flex: 1,
        marginLeft: rp(8),
    },
    nameAndStarsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: rp(8),
        flexWrap: 'wrap',
    },
    reviewerInitials: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.maroon,
        justifyContent: 'center',
        alignItems: 'center',
    },
    reviewerInitialsText: {
        color: colors.white,
        fontWeight: 'bold',
        fontSize: 14,
    },
    reviewerProfileImage: {
        width: 32,
        height: 32,
        borderRadius: 16,
    },
    reviewerName: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.text,
    },
    starsContainer: {
        flexDirection: 'row',
        gap: 2,
    },
    reviewDate: {
        fontSize: 11,
        color: colors.gray,
        opacity: 0.7,
        marginLeft: rp(8),
    },
    reviewComment: {
        fontSize: 13,
        color: colors.text,
        lineHeight: 18,
    },
    emptyComment: {
        fontSize: 13,
        color: colors.gray,
        fontStyle: 'italic',
        opacity: 0.6,
    },
});

export default ReviewCard;
