import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { dueUrgency, inspectorTimestamp } from "../../dates";
import { makeId, palette, type NotificationWhen, type Project, type RepeatFrom, type RepeatUnit, type Task } from "../../model";
import { attachmentLabelFromUrl, normalizeAttachmentUrl } from "../../links";
import { projectDisplayName, resolvedRepeatRule, simpleFromRepeatRule, simpleRepeatRule } from "../../outline";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon } from "../ui/Icon";
import { StatusRing } from "../ui/StatusRing";
import { DateField } from "./DateField";
import { FieldLabel } from "./FieldLabel";

const notificationOptions: Array<{ id: NotificationWhen; label: string }> = [
  { id: "atEvent", label: "At due / defer" },
  { id: "15m", label: "15 minutes before" },
  { id: "1h", label: "1 hour before" },
  { id: "1d", label: "1 day before" },
  { id: "2d", label: "2 days before" },
  { id: "1w", label: "1 week before" },
  { id: "startOfDay", label: "Start of day" },
];

function toggleNotification(current: NotificationWhen[] | undefined, id: NotificationWhen): NotificationWhen[] {
  const list = current ?? [];
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

function useDebouncedTaskField(taskId: string, value: string, commit: (value: string) => void, delay: number) {
  const [draft, setDraft] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackRef = useRef({ taskId, commit, value });
  if (trackRef.current.taskId === taskId) trackRef.current.commit = commit;

  useEffect(() => {
    if (trackRef.current.taskId !== taskId) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        trackRef.current.commit(trackRef.current.value);
      }
      trackRef.current = { taskId, commit, value };
      setDraft(value);
    } else if (!timerRef.current && value !== trackRef.current.value) {
      trackRef.current.value = value;
      setDraft(value);
    }
  }, [taskId, value, commit]);

  useEffect(() => () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      trackRef.current.commit(trackRef.current.value);
    }
  }, []);

  const onChangeText = (next: string) => {
    setDraft(next);
    trackRef.current.value = next;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      trackRef.current.commit(next);
    }, delay);
  };

  const flush = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      trackRef.current.commit(trackRef.current.value);
    }
  };

  return { draft, onChangeText, onBlur: flush };
}

function RepeatToggle({ value, onChange, label }: { value: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <Pressable onPress={() => onChange(!value)} style={styles.toggleRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <View style={[styles.toggleTrack, value && styles.toggleTrackOn]}>
        <View style={[styles.toggleThumb, value && styles.toggleThumbOn]} />
      </View>
    </Pressable>
  );
}

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
  const [attachmentDraft, setAttachmentDraft] = useState("");
  const [tab, setTab] = useState<"action" | "notes" | "notify" | "attachments">("action");
  const rule = resolvedRepeatRule(task);
  const simple = simpleFromRepeatRule(rule);
  const titleField = useDebouncedTaskField(task.id, task.title, (title) => onChange({ title }), 250);
  const noteField = useDebouncedTaskField(task.id, task.note ?? "", (note) => onChange({ note }), 250);

  useEffect(() => setTagDraft(""), [task.id]);
  useEffect(() => setAttachmentDraft(""), [task.id]);
  useEffect(() => setTab("action"), [task.id]);

  const commitTags = () => {
    const added = tagDraft.split(",").map((tag) => tag.trim()).filter(Boolean);
    if (!added.length) return;
    onChange({ tags: [...new Set([...task.tags, ...added])] });
    setTagDraft("");
  };

  const setRepeat = (patch: Partial<NonNullable<Task["repeatRule"]>> | null) => {
    if (!patch) {
      onChange({ repeat: "none", repeatRule: undefined });
      return;
    }
    const next = {
      every: patch.every ?? rule?.every ?? 1,
      unit: patch.unit ?? rule?.unit ?? "day",
      from: patch.from ?? rule?.from ?? "dueDate",
      deferAnother: patch.deferAnother ?? rule?.deferAnother ?? true,
    };
    onChange({ repeatRule: next, repeat: simpleFromRepeatRule(next) });
  };

  const tabs: Array<{ id: "action" | "notes" | "notify" | "attachments"; label: string }> = [
    { id: "action", label: "Action" },
    { id: "notes", label: "Notes" },
    { id: "notify", label: "Notify" },
    { id: "attachments", label: "Files" },
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
            value={noteField.draft}
            onChangeText={noteField.onChangeText}
            onBlur={noteField.onBlur}
            placeholder="Write a note…"
            multiline
            textAlignVertical="top"
            style={styles.inspectorNoteEditor}
            accessibilityLabel="Action note"
          />
        </View>
      )}
      {tab === "attachments" && (
        <ScrollView style={styles.inspectorScroll} contentContainerStyle={styles.attachmentEmpty} keyboardShouldPersistTaps="handled">
          {(task.attachments ?? []).length ? (
            <View style={styles.attachmentList}>
              {(task.attachments ?? []).map((item) => (
                <View key={item.id} style={styles.attachmentRow}>
                  <Icon name="paperclip" size={16} color={palette.purpleDark} />
                  <Pressable
                    style={styles.attachmentRowCopy}
                    onPress={() => {
                      if (typeof window !== "undefined") window.open(item.url, "_blank", "noopener");
                    }}
                  >
                    <Text numberOfLines={1} style={styles.attachmentName}>{item.label}</Text>
                    <Text numberOfLines={1} style={styles.attachmentUrl}>{item.url}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Remove attachment"
                    onPress={() => onChange({ attachments: (task.attachments ?? []).filter((file) => file.id !== item.id) })}
                    hitSlop={8}
                  >
                    <Icon name="close" size={16} color={palette.muted} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <>
              <View style={styles.attachmentIcon}><Icon name="paperclip" size={26} color="#aaa7ad" /></View>
              <Text style={styles.attachmentTitle}>No Attachments</Text>
              <Text style={styles.attachmentText}>Add a URL or file link. OmniFocus file blobs are not imported from CSV.</Text>
            </>
          )}
          <View style={styles.attachmentAddRow}>
            <TextInput
              value={attachmentDraft}
              onChangeText={setAttachmentDraft}
              placeholder="https:// or file path"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.attachmentInput}
              onSubmitEditing={() => {
                const url = normalizeAttachmentUrl(attachmentDraft);
                if (!url) return;
                onChange({ attachments: [...(task.attachments ?? []), { id: makeId("file"), label: attachmentLabelFromUrl(url), url }] });
                setAttachmentDraft("");
              }}
            />
            <Pressable
              onPress={() => {
                const url = normalizeAttachmentUrl(attachmentDraft);
                if (!url) return;
                onChange({ attachments: [...(task.attachments ?? []), { id: makeId("file"), label: attachmentLabelFromUrl(url), url }] });
                setAttachmentDraft("");
              }}
              style={styles.datePreset}
            >
              <Text style={styles.datePresetText}>Add</Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
      {tab === "notify" && (
        <ScrollView style={styles.inspectorScroll} keyboardShouldPersistTaps="handled">
          <View style={styles.inspectorSection}>
            <Text style={styles.inspectorSectionTitle}>DUE</Text>
            {notificationOptions.map((item) => {
              const selected = (task.notifications?.due ?? []).includes(item.id);
              return (
                <Pressable key={`due-${item.id}`} onPress={() => onChange({ notifications: { due: toggleNotification(task.notifications?.due, item.id), defer: task.notifications?.defer ?? [] } })} style={styles.toggleRow}>
                  <Text style={styles.infoLabel}>{item.label.replace("due / defer", "due date")}</Text>
                  <View style={[styles.toggleTrack, selected && styles.toggleTrackOn]}><View style={[styles.toggleThumb, selected && styles.toggleThumbOn]} /></View>
                </Pressable>
              );
            })}
            {!task.due && <Text style={styles.notificationHint}>Set a due date on the Action tab to use these reminders.</Text>}
          </View>
          <View style={styles.inspectorSection}>
            <Text style={styles.inspectorSectionTitle}>DEFER UNTIL</Text>
            {([{ id: "atEvent" as const, label: "At defer date" }, { id: "startOfDay" as const, label: "Start of day" }]).map((item) => {
              const selected = (task.notifications?.defer ?? []).includes(item.id);
              return (
                <Pressable key={`defer-${item.id}`} onPress={() => onChange({ notifications: { due: task.notifications?.due ?? [], defer: toggleNotification(task.notifications?.defer, item.id) } })} style={styles.toggleRow}>
                  <Text style={styles.infoLabel}>{item.label}</Text>
                  <View style={[styles.toggleTrack, selected && styles.toggleTrackOn]}><View style={[styles.toggleThumb, selected && styles.toggleThumbOn]} /></View>
                </Pressable>
              );
            })}
            {!task.defer && <Text style={styles.notificationHint}>Set a defer date on the Action tab to use these reminders.</Text>}
            <Text style={styles.notificationHint}>Reminders are stored with the action. This Mac build keeps a local reminder list; system banners can follow later.</Text>
          </View>
        </ScrollView>
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
          <TextInput value={titleField.draft} onChangeText={titleField.onChangeText} onBlur={titleField.onBlur} multiline style={styles.inspectorTitleInput} accessibilityLabel="Action title" />
          <Pressable onPress={() => onChange({ flagged: !task.flagged })} hitSlop={8}><Icon name={task.flagged ? "flag" : "flag-outline"} size={20} color={task.flagged ? palette.flag : "#aaa7ad"} /></Pressable>
        </View>

        <View style={styles.inspectorSection}>
          <Text style={styles.inspectorSectionTitle}>STATUS</Text>
          <View style={styles.datePresets}>
            {([{ id: "active", label: "Active" }, { id: "onHold", label: "On Hold" }, { id: "dropped", label: "Dropped" }] as const).map((item) => (
              <Pressable key={item.id} onPress={() => onChange({ status: item.id })} style={[styles.datePreset, (task.status ?? "active") === item.id && styles.datePresetSelected]}>
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
          <DateField value={task.defer} onChange={(defer) => onChange({ defer })} />
          <FieldLabel>Due</FieldLabel>
          <DateField value={task.due} onChange={(due) => onChange({ due })} />
          <FieldLabel>Repeat</FieldLabel>
          <View style={styles.datePresets}>
            {(["none", "daily", "weekly", "monthly"] as const).map((repeat) => (
              <Pressable key={repeat} onPress={() => onChange({ repeat, repeatRule: simpleRepeatRule(repeat, rule?.from) })} style={[styles.datePreset, simple === repeat && styles.datePresetSelected]}>
                <Text style={[styles.datePresetText, simple === repeat && styles.datePresetTextSelected]}>{repeat === "none" ? "None" : repeat === "daily" ? "Daily" : repeat === "weekly" ? "Weekly" : "Monthly"}</Text>
              </Pressable>
            ))}
          </View>
          {simple !== "none" && (
            <>
              <FieldLabel>Every</FieldLabel>
              <View style={styles.repeatEveryRow}>
                <TextInput
                  value={String(rule?.every ?? 1)}
                  keyboardType="number-pad"
                  onChangeText={(raw) => {
                    const every = Math.max(1, Number(raw.replace(/[^\d]/g, "")) || 1);
                    setRepeat({ every });
                  }}
                  style={styles.repeatEveryInput}
                  accessibilityLabel="Repeat every"
                />
                {([{ id: "day", label: "Days" }, { id: "week", label: "Weeks" }, { id: "month", label: "Months" }, { id: "year", label: "Years" }] as Array<{ id: RepeatUnit; label: string }>).map((item) => (
                  <Pressable key={item.id} onPress={() => setRepeat({ unit: item.id })} style={[styles.datePreset, (rule?.unit ?? "day") === item.id && styles.datePresetSelected]}>
                    <Text style={[styles.datePresetText, (rule?.unit ?? "day") === item.id && styles.datePresetTextSelected]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
              <FieldLabel>From</FieldLabel>
              <View style={styles.datePresets}>
                {([{ id: "dueDate", label: "Assigned Dates" }, { id: "completionDate", label: "Completion Date" }] as Array<{ id: RepeatFrom; label: string }>).map((item) => (
                  <Pressable key={item.id} onPress={() => setRepeat({ from: item.id })} style={[styles.datePreset, (rule?.from ?? "dueDate") === item.id && styles.datePresetSelected]}>
                    <Text style={[styles.datePresetText, (rule?.from ?? "dueDate") === item.id && styles.datePresetTextSelected]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
              <RepeatToggle label="Defer Another" value={rule?.deferAnother !== false} onChange={(deferAnother) => setRepeat({ deferAnother })} />
            </>
          )}
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
