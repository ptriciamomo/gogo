import React, { useRef, useEffect, useState } from "react";
import { View, Text, Animated, PanResponder, ActivityIndicator, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface SlideButtonProps {
	text: string;
	onConfirm: () => void;
	isConfirming: boolean;
	color?: string;
}

/**
 * Reusable sliding button component that requires drag gesture to complete.
 * Works on both mobile (touch) and web (mouse drag).
 */
export default function SlideButton({
	text,
	onConfirm,
	isConfirming,
	color = "#7E1B16",
}: SlideButtonProps) {
	const slideAnim = useRef(new Animated.Value(0)).current;
	const startX = useRef(0);
	const isDragging = useRef(false);
	const containerRef = useRef<View>(null);
	const thumbDivRef = useRef<HTMLDivElement | null>(null);
	const [thumbTransform, setThumbTransform] = useState(0);
	
	const panResponder = useRef(
		PanResponder.create({
			onStartShouldSetPanResponder: () => true,
			onMoveShouldSetPanResponder: () => true,
			onPanResponderGrant: () => {
				slideAnim.stopAnimation((value) => {
					startX.current = value;
					slideAnim.setOffset(value);
					slideAnim.setValue(0);
				});
			},
			onPanResponderMove: (_, gestureState) => {
				const maxSlide = 280;
				const newValue = Math.max(0, Math.min(startX.current + gestureState.dx, maxSlide));
				slideAnim.setValue(newValue - startX.current);
			},
			onPanResponderRelease: (_, gestureState) => {
				slideAnim.flattenOffset();
				const currentValue = startX.current + gestureState.dx;
				const threshold = 240; // 85% of maxSlide
				if (currentValue >= threshold && !isConfirming) {
					// Animate to completion
					Animated.spring(slideAnim, {
						toValue: 280,
						useNativeDriver: false,
						tension: 50,
						friction: 7,
					}).start(() => {
						onConfirm();
						// Reset after a delay
						setTimeout(() => {
							Animated.spring(slideAnim, {
								toValue: 0,
								useNativeDriver: false,
								tension: 50,
								friction: 7,
							}).start();
						}, 1000);
					});
				} else {
					// Snap back if not far enough
					Animated.spring(slideAnim, {
						toValue: 0,
						useNativeDriver: false,
						tension: 50,
						friction: 7,
					}).start();
				}
			},
		})
	).current;

	// Sync animated value to DOM transform for web
	useEffect(() => {
		if (Platform.OS !== "web") return;
		const listenerId = slideAnim.addListener(({ value }) => {
			setThumbTransform(value);
		});
		return () => {
			slideAnim.removeListener(listenerId);
		};
	}, [slideAnim]);

	// Web-specific mouse event handlers - attach mousemove/mouseup to document
	useEffect(() => {
		if (Platform.OS !== "web" || typeof document === "undefined") return;

		const handleMouseMove = (e: MouseEvent) => {
			if (!isDragging.current || !containerRef.current) return;
			e.preventDefault();
			const containerElement = containerRef.current as any;
			if (!containerElement) return;
			const maxSlide = 280;
			const rect = containerElement.getBoundingClientRect();
			const clientX = e.clientX;
			const relativeX = clientX - rect.left - 21; // 21 = half of thumb width (42/2)
			const newValue = Math.max(0, Math.min(startX.current + relativeX, maxSlide));
			slideAnim.setValue(newValue - startX.current);
		};

		const handleMouseUp = (e: MouseEvent) => {
			if (!isDragging.current || !containerRef.current) return;
			e.preventDefault();
			isDragging.current = false;
			const containerElement = containerRef.current as any;
			if (!containerElement) return;
			slideAnim.flattenOffset();
			const rect = containerElement.getBoundingClientRect();
			const clientX = e.clientX;
			const relativeX = clientX - rect.left - 21;
			const currentValue = startX.current + relativeX;
			const threshold = 240;
			if (currentValue >= threshold && !isConfirming) {
				Animated.spring(slideAnim, {
					toValue: 280,
					useNativeDriver: false,
					tension: 50,
					friction: 7,
				}).start(() => {
					onConfirm();
					setTimeout(() => {
						Animated.spring(slideAnim, {
							toValue: 0,
							useNativeDriver: false,
							tension: 50,
							friction: 7,
						}).start();
					}, 1000);
				});
			} else {
				Animated.spring(slideAnim, {
					toValue: 0,
					useNativeDriver: false,
					tension: 50,
					friction: 7,
				}).start();
			}
		};

		document.addEventListener("mousemove", handleMouseMove);
		document.addEventListener("mouseup", handleMouseUp);

		return () => {
			document.removeEventListener("mousemove", handleMouseMove);
			document.removeEventListener("mouseup", handleMouseUp);
		};
	}, [slideAnim, isConfirming, onConfirm]);

	// Web-specific mouse down handler
	const handleMouseDown = Platform.OS === "web" ? (e: any) => {
		e.preventDefault();
		isDragging.current = true;
		slideAnim.stopAnimation((value) => {
			startX.current = value;
			slideAnim.setOffset(value);
			slideAnim.setValue(0);
		});
	} : undefined;

	// Web: Use DOM divs for mouse events; Mobile: Use regular Views
	if (Platform.OS === "web") {
		return (
			<div
				ref={containerRef as any}
				style={{
					width: "100%",
					height: 50,
					borderRadius: 12,
					overflow: "hidden",
					backgroundColor: color,
					userSelect: "none",
				}}
			>
				<div style={{
					width: "100%",
					height: 50,
					backgroundColor: "rgba(255, 255, 255, 0.2)",
					borderRadius: 12,
					position: "relative",
					overflow: "hidden",
				}}>
					<Animated.View
						style={[
							styles.fill,
							{
								width: slideAnim.interpolate({
									inputRange: [0, 280],
									outputRange: ["0%", "100%"],
								}),
							},
						]}
					/>
					<div
						ref={thumbDivRef}
						{...panResponder.panHandlers}
						onMouseDown={handleMouseDown}
						style={{
							position: "absolute",
							left: 4,
							top: 4,
							width: 42,
							height: 42,
							borderRadius: 21,
							backgroundColor: "#fff",
							display: "flex",
							justifyContent: "center",
							alignItems: "center",
							boxShadow: "0 2px 4px rgba(0,0,0,0.25)",
							zIndex: 10,
							cursor: "grab",
							transform: `translateX(${thumbTransform}px)`,
						} as any}
					>
						{isConfirming ? (
							<ActivityIndicator color={color} size="small" />
						) : (
							<Ionicons name="arrow-forward" size={20} color={color} />
						)}
					</div>
					<View style={styles.textContainer}>
						<Text style={styles.text}>
							{isConfirming ? "Confirming..." : text}
						</Text>
					</View>
				</div>
			</div>
		);
	}

	// Mobile: Use regular Views with PanResponder
	return (
		<View ref={containerRef} style={[styles.container, { backgroundColor: color }]}>
			<View style={styles.track}>
				<Animated.View
					style={[
						styles.fill,
						{
							width: slideAnim.interpolate({
								inputRange: [0, 280],
								outputRange: ["0%", "100%"],
							}),
						},
					]}
				/>
				<Animated.View
					{...panResponder.panHandlers}
					style={[
						styles.thumb,
						{
							transform: [{ translateX: slideAnim }],
						},
					]}
				>
					{isConfirming ? (
						<ActivityIndicator color={color} size="small" />
					) : (
						<Ionicons name="arrow-forward" size={20} color={color} />
					)}
				</Animated.View>
				<View style={styles.textContainer}>
					<Text style={styles.text}>
						{isConfirming ? "Confirming..." : text}
					</Text>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		width: "100%",
		height: 50,
		borderRadius: 12,
		overflow: "hidden",
	},
	track: {
		width: "100%",
		height: 50,
		backgroundColor: "rgba(255, 255, 255, 0.2)",
		borderRadius: 12,
		position: "relative",
		overflow: "hidden",
	},
	fill: {
		position: "absolute",
		left: 0,
		top: 0,
		height: "100%",
		backgroundColor: "rgba(255, 255, 255, 0.3)",
		borderRadius: 12,
	},
	thumb: {
		position: "absolute",
		left: 4,
		top: 4,
		width: 42,
		height: 42,
		borderRadius: 21,
		backgroundColor: "#fff",
		justifyContent: "center",
		alignItems: "center",
		elevation: 3,
		shadowColor: "#000",
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.25,
		shadowRadius: 3.84,
		zIndex: 10,
	},
	textContainer: {
		position: "absolute",
		width: "100%",
		height: "100%",
		justifyContent: "center",
		alignItems: "center",
		paddingLeft: 50,
		paddingRight: 20,
	},
	text: {
		color: "#fff",
		fontSize: 14,
		fontWeight: "600",
		textAlign: "center",
	},
});

