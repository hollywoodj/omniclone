import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { defaultTagColor, palette, perspectiveColorChoices, type TagRecord, type TagStatus } from "../../model";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon } from "../ui/Icon";
import { FieldLabel } from "./FieldLabel";

export function TagInspector({ tag, record, count, tags, onRename, onChange, onClose, modal = false }: {
  tag: string;
  record?: TagRecord;
  count: number;
  tags: TagRecord[];
  onRename: (name: string) => void;
  onChange: (patch: Partial<TagRecord>) => void;
  onClose?: () => void;
  modal?: boolean;
}) {
  const [name, setName] = useState(tag);
  useEffect(() => setName(tag), [tag]);
  const status = record?.status ?? "active";
  const color = record?.color ?? defaultTagColor;
  const parent = record?.parent;
  const parents = tags.filter((item) => item.name.toLowerCase() !== tag.toLowerCase());
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
          <Icon name="pound" size={22} color={color} />
          <TextInput value={name} onChangeText={setName} onBlur={() => { if (name.trim()) onRename(name.trim()); }} onSubmitEditing={() => { if (name.trim()) onRename(name.trim()); }} style={styles.inspectorTitleInput} accessibilityLabel="Tag name" />
        </View>
        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>STATUS</Text>
          <View style={styles.datePresets}>
            {([{ id: "active", label: "Active" }, { id: "onHold", label: "On Hold" }, { id: "dropped", label: "Dropped" }] as Array<{ id: TagStatus; label: string }>).map((item) => (
              <Pressable key={item.id} onPress={() => onChange({ status: item.id })} style={[styles.datePreset, status === item.id && styles.datePresetSelected]}>
                <Text style={[styles.datePresetText, status === item.id && styles.datePresetTextSelected]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.projectHeadingNote, { marginTop: 8 }]}>On Hold tags keep tagged actions out of Available. Dropped tags stay in the sidebar with a dropped badge.</Text>
        </View>
        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>COLOR</Text>
          <View style={styles.colorChoiceRow}>
            {perspectiveColorChoices.map((item) => (
              <Pressable key={item} onPress={() => onChange({ color: item })} style={[styles.inspectorColor, { backgroundColor: item }, color === item && styles.inspectorColorSelected]} />
            ))}
          </View>
        </View>
        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>NESTING</Text>
          <FieldLabel>Parent Tag</FieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
            <Pressable onPress={() => onChange({ parent: undefined })} style={[styles.choiceChip, !parent && styles.choiceChipSelected]}><Text style={[styles.choiceText, !parent && styles.choiceTextSelected]}>None</Text></Pressable>
            {parents.map((item) => (
              <Pressable key={item.name} onPress={() => onChange({ parent: item.name })} style={[styles.choiceChip, parent === item.name && styles.choiceChipSelected]}>
                <Text numberOfLines={1} style={[styles.choiceText, parent === item.name && styles.choiceTextSelected]}>{item.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
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