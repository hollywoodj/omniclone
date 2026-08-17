import React from "react";
import { Pressable, Text, View } from "react-native";
import { palette } from "../../model";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon } from "../ui/Icon";

export function MobileHeader({
  title,
  onViewOptions,
  onSettings,
  onToggleSearch,
  onNewAction,
}: {
  title: string;
  onViewOptions: () => void;
  onSettings: () => void;
  onToggleSearch: () => void;
  onNewAction: () => void;
}) {
  return (
    <View style={styles.mobileHeader}>
      <View>
        <Text style={styles.mobileEyebrow}>OMNIFOCUS</Text>
        <Text numberOfLines={1} style={styles.mobileTitle}>{title}</Text>
      </View>
      <View style={styles.mobileHeaderActions}>
        <Pressable accessibilityLabel="View Options" onPress={onViewOptions} style={styles.mobileCircleButton}><Icon name="eye-outline" size={18} color={palette.purpleDark} /></Pressable>
        <Pressable accessibilityLabel="More and settings" onPress={onSettings} style={styles.mobileCircleButton}><Icon name="dots-horizontal" size={20} color={palette.purpleDark} /></Pressable>
        <Pressable onPress={onToggleSearch} style={styles.mobileCircleButton}><Icon name="magnify" size={21} color={palette.purpleDark} /></Pressable>
        <Pressable onPress={onNewAction} style={styles.mobileAddButton}><Icon name="plus" size={24} color="#fff" /></Pressable>
      </View>
    </View>
  );
}
