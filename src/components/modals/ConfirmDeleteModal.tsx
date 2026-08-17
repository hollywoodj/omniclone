import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { palette } from "../../model";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon } from "../ui/Icon";

export function ConfirmDeleteModal({ visible, title, message, onCancel, onConfirm }: {
  visible: boolean;
  title: string;
  message?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.confirmBackdrop}>
        <Pressable style={styles.confirmDismissLayer} onPress={onCancel} accessibilityLabel="Cancel delete" />
        <View style={styles.confirmCard}>
          <View style={styles.confirmIcon}><Icon name="trash-can-outline" size={23} color={palette.danger} /></View>
          <Text style={styles.confirmTitle}>Delete “{title}”?</Text>
          <Text style={styles.confirmText}>{message ?? "This action will be permanently removed from your local database."}</Text>
          <View style={styles.confirmActions}>
            <Pressable onPress={onCancel} style={styles.cancelButton}><Text style={styles.cancelButtonText}>Cancel</Text></Pressable>
            <Pressable onPress={onConfirm} style={styles.confirmDeleteButton}><Text style={styles.confirmDeleteText}>Delete</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
