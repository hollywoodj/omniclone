import React from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { reviewStatusText } from "../../dates";
import { palette, type Project } from "../../model";
import { projectColors } from "../../perspectives/rail";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon } from "../ui/Icon";
import { FieldLabel } from "./FieldLabel";

export function ProjectInspector({ project, remainingCount, stalled, onChange, onReview, onSkip, onDelete, onFocus, onClose, modal = false }: {
  project: Project;
  remainingCount: number;
  stalled?: boolean;
  onChange: (patch: Partial<Project>) => void;
  onReview: () => void;
  onSkip: () => void;
  onDelete: () => void;
  onFocus: () => void;
  onClose?: () => void;
  modal?: boolean;
}) {
  const intervals = [
    { label: "Daily", days: 1 },
    { label: "Weekly", days: 7 },
    { label: "Two Weeks", days: 14 },
    { label: "Monthly", days: 30 },
  ];
  return (
    <View style={[styles.inspector, modal && styles.inspectorModal]}>
      <View style={styles.inspectorTabs}>
        {modal && <Pressable onPress={onClose} style={styles.modalClose}><Icon name="chevron-left" size={24} color={palette.purpleDark} /></Pressable>}
        <View style={styles.inspectorTabBar}>
          <View style={styles.inspectorTabSelected}><Text style={styles.inspectorTabTextSelected}>Project</Text></View>
        </View>
      </View>
      <ScrollView style={styles.inspectorScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.inspectorTitleRow}>
          <View style={[styles.projectHeadingRing, { borderColor: project.color, marginTop: 4 }]} />
          <TextInput value={project.name} onChangeText={(name) => onChange({ name })} multiline style={styles.inspectorTitleInput} accessibilityLabel="Project name" />
        </View>
        {!!project.folder && <Text style={[styles.projectHeadingNote, { paddingHorizontal: 13 }]}>{project.folder}</Text>}
        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>COLOR</Text>
          <View style={styles.colorChoiceRow}>
            {projectColors.map((color) => (
              <Pressable key={color} onPress={() => onChange({ color })} style={[styles.inspectorColor, { backgroundColor: color }, project.color === color && styles.inspectorColorSelected]} />
            ))}
          </View>
        </View>
        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>STATUS</Text>
          <FieldLabel>Type</FieldLabel>
          <View style={styles.datePresets}>
            {([{ id: "parallel", label: "Parallel" }, { id: "sequential", label: "Sequential" }, { id: "singleActions", label: "Single Actions" }] as const).map((item) => (
              <Pressable key={item.id} onPress={() => onChange({ type: item.id })} style={[styles.datePreset, (project.type ?? "parallel") === item.id && styles.datePresetSelected]}>
                <Text style={[styles.datePresetText, (project.type ?? "parallel") === item.id && styles.datePresetTextSelected]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          <FieldLabel>Status</FieldLabel>
          <View style={styles.datePresets}>
            {([{ id: "active", label: "Active" }, { id: "onHold", label: "On Hold" }, { id: "dropped", label: "Dropped" }] as const).map((item) => (
              <Pressable key={item.id} onPress={() => onChange({ status: item.id })} style={[styles.datePreset, (project.status ?? "active") === item.id && styles.datePresetSelected]}>
                <Text style={[styles.datePresetText, (project.status ?? "active") === item.id && styles.datePresetTextSelected]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>NOTE</Text>
          <TextInput value={project.note} onChangeText={(note) => onChange({ note })} placeholder="Add a project note…" multiline textAlignVertical="top" style={[styles.fieldInput, styles.noteInput]} />
        </View>
        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>REVIEW</Text>
          <FieldLabel>Repeat</FieldLabel>
          <View style={styles.datePresets}>
            {intervals.map((item) => (
              <Pressable key={item.days} onPress={() => onChange({ reviewIntervalDays: item.days })} style={[styles.datePreset, project.reviewIntervalDays === item.days && styles.datePresetSelected]}>
                <Text style={[styles.datePresetText, project.reviewIntervalDays === item.days && styles.datePresetTextSelected]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.projectHeadingNote}>{reviewStatusText(project)}</Text>
          <Text style={[styles.projectHeadingNote, { marginTop: 4 }]}>{stalled ? "Stalled · " : ""}{remainingCount} remaining action{remainingCount === 1 ? "" : "s"}</Text>
          <View style={styles.reviewActionRow}>
            <Pressable onPress={onSkip} style={styles.skipButton}>
              <Text style={styles.skipButtonText}>Skip</Text>
            </Pressable>
            <Pressable onPress={onReview} style={styles.reviewButton}>
              <Icon name="check" size={15} color="#fff" />
              <Text style={styles.reviewButtonText}>Mark Reviewed</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.inspectorSection}>
          <Pressable onPress={onFocus} style={styles.multiSelectButton}>
            <Icon name="bullseye-arrow" size={17} color={palette.purpleDark} />
            <Text style={styles.multiSelectButtonText}>Focus Project</Text>
          </Pressable>
          <Pressable onPress={onDelete} style={styles.deleteButton}>
            <Icon name="trash-can-outline" size={17} color={palette.danger} />
            <Text style={styles.deleteButtonText}>Delete Project</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
