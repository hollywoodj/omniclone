import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { palette } from "../../model";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon } from "../ui/Icon";

export function TagInspector({ tag, count, onRename, onClose, modal = false }: {
  tag: string;
  count: number;
  onRename: (name: string) => void;
  onClose?: () => void;
  modal?: boolean;
}) {
  const [name, setName] = useState(tag);
  useEffect(() => setName(tag), [tag]);
  return (
    <View style={[styles.inspector, modal && styles.inspectorModal]}>
      <View style={styles.inspectorTabs}>
        {modal && <Pressable onPress={onClose} style={styles.modalClose}><Icon name="chevron-left" size={24} color={palette.purpleDark} /></Pressable>}
        <View style={styles.inspectorTabBar}>
          <View style={styles.inspectorTabSelected}><Text style={styles.inspectorTabTextSelected}>Tag</Text></View>
        </View>
      </View>
      <ScrollView style={styles.inspectorScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.inspectorTitleRow}>
          <Icon name="pound" size={22} color={palette.purpleDark} />
          <TextInput value={name} onChangeText={setName} onBlur={() => { if (name.trim()) onRename(name.trim()); }} onSubmitEditing={() => { if (name.trim()) onRename(name.trim()); }} style={styles.inspectorTitleInput} accessibilityLabel="Tag name" />
        </View>
        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>INFO</Text>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Remaining</Text><Text style={styles.infoValue}>{count}</Text></View>
          <Text style={[styles.projectHeadingNote, { marginTop: 8 }]}>Renaming updates every action that uses this tag.</Text>
        </View>
      </ScrollView>
    </View>
  );
}
