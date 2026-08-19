import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { palette, type Project } from "../../model";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon } from "../ui/Icon";
import { DatePresets } from "../inspector/DatePresets";
import { FieldLabel } from "../inspector/FieldLabel";

export type QuickEntryPayload = {
  title: string;
  projectId: string | null;
  flagged?: boolean;
  due?: string;
  defer?: string;
  note?: string;
  tags?: string[];
  estimatedMinutes?: number;
};

export function QuickEntryModal({ visible, kind, projects, defaultProjectId, initial, onClose, onSave }: {
  visible: boolean;
  kind: "task" | "project" | "folder";
  projects: Project[];
  defaultProjectId: string | null;
  initial?: QuickEntryPayload | null;
  onClose: () => void;
  onSave: (payload: QuickEntryPayload) => void;
}) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId);
  const [flagged, setFlagged] = useState(false);
  const [due, setDue] = useState<string | undefined>();
  const [defer, setDefer] = useState<string | undefined>();
  const [note, setNote] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | undefined>();

  useEffect(() => {
    if (visible) {
      setTitle(initial?.title ?? "");
      setProjectId(initial?.projectId ?? defaultProjectId);
      setFlagged(initial?.flagged ?? false);
      setDue(initial?.due);
      setDefer(initial?.defer);
      setNote(initial?.note ?? "");
      setTagDraft((initial?.tags ?? []).join(", "));
      setEstimatedMinutes(initial?.estimatedMinutes);
    }
  }, [visible, defaultProjectId, initial]);

  const save = () => {
    if (!title.trim()) return;
    onSave({
      title: title.trim(),
      projectId,
      flagged,
      due,
      defer,
      note: note.trim() || undefined,
      tags: tagDraft.split(",").map((tag) => tag.trim()).filter(Boolean),
      estimatedMinutes,
    });
    setTitle("");
    setFlagged(false);
    setDue(undefined);
    setDefer(undefined);
    setNote("");
    setTagDraft("");
    setEstimatedMinutes(undefined);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.quickEntryCard}>
          <View style={styles.quickEntryHeader}><Text style={styles.quickEntryHeaderText}>{kind === "task" ? "Quick Entry" : kind === "folder" ? "New Folder" : "New Project"}</Text><Pressable onPress={onClose}><Icon name="close" size={20} color="#77747b" /></Pressable></View>
          <View style={styles.quickInputRow}>
            {kind === "folder" ? <Icon name="folder-plus-outline" size={22} color={palette.purpleDark} /> : <View style={styles.quickRing} />}
            <TextInput autoFocus value={title} onChangeText={setTitle} onSubmitEditing={save} returnKeyType="done" placeholder={kind === "task" ? "What do you want to do?" : kind === "folder" ? "Folder name" : "Project name"} style={styles.quickInput} />
            {kind === "task" && (
              <Pressable accessibilityLabel={flagged ? "Remove flag" : "Flag"} onPress={() => setFlagged((value) => !value)} hitSlop={8}>
                <Icon name={flagged ? "flag" : "flag-outline"} size={21} color={flagged ? palette.flag : "#aaa7ad"} />
              </Pressable>
            )}
          </View>
          {kind === "task" && (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickProjectRow}>
                <Pressable onPress={() => setProjectId(null)} style={[styles.quickProjectChip, projectId === null && styles.quickProjectChipSelected]}><Icon name="inbox-arrow-down-outline" size={14} color={projectId === null ? palette.purpleDark : "#6c6970"} /><Text style={styles.quickProjectText}>Inbox</Text></Pressable>
                {projects.map((project) => <Pressable key={project.id} onPress={() => setProjectId(project.id)} style={[styles.quickProjectChip, projectId === project.id && styles.quickProjectChipSelected]}><View style={[styles.miniDot, { backgroundColor: project.color }]} /><Text numberOfLines={1} style={styles.quickProjectText}>{project.name}</Text></Pressable>)}
              </ScrollView>
              <View style={styles.quickMeta}>
                <FieldLabel>Due</FieldLabel>
                <DatePresets value={due} onChange={setDue} />
                <FieldLabel>Defer</FieldLabel>
                <DatePresets value={defer} onChange={setDefer} />
                <FieldLabel>Tags</FieldLabel>
                <TextInput value={tagDraft} onChangeText={setTagDraft} placeholder="errands, phone" style={styles.fieldInput} />
                <FieldLabel>Note</FieldLabel>
                <TextInput value={note} onChangeText={setNote} placeholder="Optional note" multiline style={styles.fieldInput} />
              </View>
            </>
          )}
          <View style={styles.quickFooter}><Text style={styles.quickHint}>Saved locally and available offline</Text><Pressable onPress={onClose} style={styles.cancelButton}><Text style={styles.cancelButtonText}>Cancel</Text></Pressable><Pressable disabled={!title.trim()} onPress={save} style={[styles.saveButton, !title.trim() && styles.disabled]}><Text style={styles.saveButtonText}>Save</Text></Pressable></View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
