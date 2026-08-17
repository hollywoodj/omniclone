import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { dueUrgency, inspectorTimestamp } from "../../dates";
import { palette, type Project, type Task } from "../../model";
import { projectDisplayName } from "../../outline";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon } from "../ui/Icon";
import { StatusRing } from "../ui/StatusRing";
import { DatePresets } from "./DatePresets";
import { FieldLabel } from "./FieldLabel";

export function Inspector({ task, projects, onChange, onToggle, onDelete, onClose, modal = false }: {
  task: Task;
  projects: Project[];
  onChange: (patch: Partial<Task>) => void;
  onToggle: () => void;
  onDelete: () => void;
  onClose?: () => void;
  modal?: boolean;
}) {
  const [tagDraft, setTagDraft] = useState("");
  const [tab, setTab] = useState<"action" | "notes" | "attachments">("action");

  useEffect(() => setTagDraft(""), [task.id]);
  useEffect(() => setTab("action"), [task.id]);

  const commitTags = () => {
    const added = tagDraft.split(",").map((tag) => tag.trim()).filter(Boolean);
    if (!added.length) return;
    onChange({ tags: [...new Set([...task.tags, ...added])] });
    setTagDraft("");
  };

  const tabs: Array<{ id: "action" | "notes" | "attachments"; label: string }> = [
    { id: "action", label: "Action" },
    { id: "notes", label: "Notes" },
    { id: "attachments", label: "Attachments" },
  ];

  return (
    <View style={[styles.inspector, modal && styles.inspectorModal]}>
      <View style={styles.inspectorTabs}>
        {modal && <Pressable onPress={onClose} style={styles.modalClose}><Icon name="chevron-left" size={24} color={palette.purpleDark} /></Pressable>}
        <View style={styles.inspectorTabBar}>
          {tabs.map((item) => (
            <Pressable key={item.id} onPress={() => setTab(item.id)} style={tab === item.id ? styles.inspectorTabSelected : styles.inspectorTab}>
              <Text style={[styles.inspectorTabText, tab === item.id && styles.inspectorTabTextSelected]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {tab === "notes" && (
        <View style={styles.inspectorNotePane}>
          <TextInput
            value={task.note ?? ""}
            onChangeText={(note) => onChange({ note })}
            placeholder="Write a note…"
            multiline
            textAlignVertical="top"
            style={styles.inspectorNoteEditor}
            accessibilityLabel="Action note"
          />
        </View>
      )}
      {tab === "attachments" && (
        <View style={styles.attachmentEmpty}>
          <View style={styles.attachmentIcon}><Icon name="paperclip" size={26} color="#aaa7ad" /></View>
          <Text style={styles.attachmentTitle}>No Attachments</Text>
          <Text style={styles.attachmentText}>OmniFocus stores files on the Notes tab. OmniClone keeps notes with the action; file attachments are not imported from CSV.</Text>
        </View>
      )}
      {tab === "action" && (
      <ScrollView style={styles.inspectorScroll} keyboardShouldPersistTaps="handled">
        <View style={styles.inspectorTitleRow}>
          <StatusRing
            completed={task.completed}
            flagged={task.flagged}
            urgency={dueUrgency(task.due)}
            blocked={false}
            hold={(task.status ?? "active") === "onHold"}
            dropped={(task.status ?? "active") === "dropped"}
            onPress={onToggle}
          />
          <TextInput value={task.title} onChangeText={(title) => onChange({ title })} multiline style={styles.inspectorTitleInput} accessibilityLabel="Action title" />
          <Pressable onPress={() => onChange({ flagged: !task.flagged })} hitSlop={8}><Icon name={task.flagged ? "flag" : "flag-outline"} size={20} color={task.flagged ? palette.flag : "#aaa7ad"} /></Pressable>
        </View>

        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>STATUS</Text>
          <View style={styles.datePresets}>
            {([{ id: "active", label: "Active" }, { id: "onHold", label: "On Hold" }, { id: "dropped", label: "Dropped" }] as const).map((item) => (
              <Pressable key={item.id} onPress={() => onChange({ status: item.id, completed: item.id === "dropped" ? task.completed : task.completed })} style={[styles.datePreset, (task.status ?? "active") === item.id && styles.datePresetSelected]}>
                <Text style={[styles.datePresetText, (task.status ?? "active") === item.id && styles.datePresetTextSelected]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>ORGANIZATION</Text>
          <FieldLabel>Project</FieldLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
            <Pressable onPress={() => onChange({ projectId: null })} style={[styles.choiceChip, task.projectId === null && styles.choiceChipSelected]}><Text style={[styles.choiceText, task.projectId === null && styles.choiceTextSelected]}>Inbox</Text></Pressable>
            {projects.map((project) => <Pressable key={project.id} onPress={() => onChange({ projectId: project.id })} style={[styles.choiceChip, task.projectId === project.id && styles.choiceChipSelected]}><Text numberOfLines={1} style={[styles.choiceText, task.projectId === project.id && styles.choiceTextSelected]}>{projectDisplayName(project)}</Text></Pressable>)}
          </ScrollView>
          <FieldLabel>Tags</FieldLabel>
          <View style={styles.tagTokenRow}>
            {task.tags.map((tag) => (
              <Pressable key={tag} onPress={() => onChange({ tags: task.tags.filter((item) => item !== tag) })} style={styles.tagToken}>
                <Text style={styles.tagTokenText}>{tag}</Text>
                <Icon name="close" size={12} color="#8b888f" />
              </Pressable>
            ))}
          </View>
          <TextInput value={tagDraft} onChangeText={setTagDraft} onBlur={commitTags} onSubmitEditing={commitTags} placeholder="Add a tag" style={styles.fieldInput} />
        </View>

        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>DATES</Text>
          <FieldLabel>Defer Until</FieldLabel>
          <DatePresets value={task.defer} onChange={(defer) => onChange({ defer })} />
          <TextInput value={task.defer ?? ""} onChangeText={(defer) => onChange({ defer })} placeholder="None" style={styles.fieldInput} />
          <FieldLabel>Due</FieldLabel>
          <DatePresets value={task.due} onChange={(due) => onChange({ due })} />
          <TextInput value={task.due ?? ""} onChangeText={(due) => onChange({ due })} placeholder="None" style={styles.fieldInput} />
          <FieldLabel>Repeat</FieldLabel>
          <View style={styles.datePresets}>
            {(["none", "daily", "weekly", "monthly"] as const).map((repeat) => (
              <Pressable key={repeat} onPress={() => onChange({ repeat })} style={[styles.datePreset, (task.repeat ?? "none") === repeat && styles.datePresetSelected]}>
                <Text style={[styles.datePresetText, (task.repeat ?? "none") === repeat && styles.datePresetTextSelected]}>{repeat === "none" ? "None" : repeat === "daily" ? "Daily" : repeat === "weekly" ? "Weekly" : "Monthly"}</Text>
              </Pressable>
            ))}
          </View>
          <FieldLabel>Estimated Duration</FieldLabel>
          <View style={styles.datePresets}>
            {[{ label: "None", minutes: undefined }, { label: "5m", minutes: 5 }, { label: "15m", minutes: 15 }, { label: "30m", minutes: 30 }, { label: "1h", minutes: 60 }].map((item) => (
              <Pressable key={item.label} onPress={() => onChange({ estimatedMinutes: item.minutes })} style={[styles.datePreset, (task.estimatedMinutes ?? undefined) === item.minutes && styles.datePresetSelected]}>
                <Text style={[styles.datePresetText, (task.estimatedMinutes ?? undefined) === item.minutes && styles.datePresetTextSelected]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {!!task.note && (
          <Pressable onPress={() => setTab("notes")} style={styles.inspectorSection}>
            <Text style={styles.inspectorSectionTitle}>NOTE</Text>
            <Text numberOfLines={3} style={styles.notePreview}>{task.note}</Text>
          </Pressable>
        )}

        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>INFO</Text>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Added</Text><Text style={styles.infoValue}>{inspectorTimestamp(task.createdAt) ?? "—"}</Text></View>
          <View style={styles.infoRow}><Text style={styles.infoLabel}>Completed</Text><Text style={styles.infoValue}>{task.completed ? inspectorTimestamp(task.completedAt) ?? "Now" : "—"}</Text></View>
        </View>

        <View style={styles.inspectorSection}>
          <View style={styles.savedRow}><Icon name="cloud-check-outline" size={16} color="#6f9d70" /><Text style={styles.savedText}>Saved on this device</Text></View>
          <Pressable onPress={onDelete} style={styles.deleteButton}><Icon name="trash-can-outline" size={17} color={palette.danger} /><Text style={styles.deleteButtonText}>Delete Action</Text></Pressable>
        </View>
      </ScrollView>
      )}
    </View>
  );
}
