import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { responsive, rp, webResponsive } from '../utils/responsive';
import ReviewCard from './ReviewCard.web';
import { Ionicons } from '@expo/vector-icons';

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

interface ReviewsSectionProps {
    reviews: Review[];
    loading: boolean;
}

const ReviewsSection: React.FC<ReviewsSectionProps> = ({ reviews, loading }) => {
    const [showAllReviews, setShowAllReviews] = useState(false);
    const REVIEW_LIMIT = 5;
    const hasMoreReviews = reviews.length > REVIEW_LIMIT;
    const displayedReviews = showAllReviews ? reviews : reviews.slice(0, REVIEW_LIMIT);

    return (
        <View style={styles.reviewsSection}>
            <Text style={styles.sectionTitle}>Reviews</Text>
            {loading ? (
                <Text style={styles.loadingText}>Loading reviews...</Text>
            ) : reviews.length > 0 ? (
                <>
                    {displayedReviews.map((review) => (
                        <ReviewCard key={review.id} review={review} />
                    ))}
                    {hasMoreReviews && (
                        <TouchableOpacity 
                            style={styles.seeMoreButton} 
                            onPress={() => setShowAllReviews(!showAllReviews)}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.seeMoreText}>
                                {showAllReviews ? 'Show fewer reviews' : 'See more reviews'}
                            </Text>
                            <Ionicons 
                                name={showAllReviews ? "chevron-up" : "chevron-down"} 
                                size={16} 
                                color={colors.text} 
                                style={{ opacity: 0.6 }} 
                            />
                        </TouchableOpacity>
                    )}
                </>
            ) : (
                <Text style={styles.noReviewsText}>No reviews yet</Text>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    reviewsSection: {
        backgroundColor: colors.white,
        marginHorizontal: rp(15),
        marginTop: rp(15),
        borderRadius: webResponsive.borderRadius(12),
        padding: rp(20),
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 2,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: colors.text,
        marginBottom: rp(16),
    },
    loadingText: {
        color: colors.gray,
        fontSize: 14,
        textAlign: 'center',
        paddingVertical: rp(20),
    },
    noReviewsText: {
        textAlign: 'center',
        color: colors.gray,
        fontSize: 14,
        fontStyle: 'italic',
        paddingVertical: rp(20),
    },
    seeMoreButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: rp(8),
        paddingVertical: rp(12),
        gap: 6,
    },
    seeMoreText: {
        color: colors.text,
        fontSize: 14,
        fontWeight: '500',
        opacity: 0.7,
    },
});

export default ReviewsSection;
