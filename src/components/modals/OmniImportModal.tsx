import React, { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import type { ImportMode, OmniImportData } from "../../importOmniFocus";
import { palette } from "../../model";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon } from "../ui/Icon";

export function OmniImportModal({ data, error, summary, guide, onClose, onApply, onChooseFile }: {
  data: OmniImportData | null;
  error: string | null;
  summary: string | null;
  guide: boolean;
  onClose: () => void;
  onApply: (mode: ImportMode) => void;
  onChooseFile: () => void;
}) {
  const [replaceArmed, setReplaceArmed] = useState(false);
  useEffect(() => setReplaceArmed(false), [data]);
  const visible = guide || !!data || !!error || !!summary;
  const completed = data?.tasks.filter((task) => task.completed).length ?? 0;
  const inboxCount = data?.tasks.filter((task) => !task.projectId).length ?? 0;
  const tagCount = data ? new Set(data.tasks.flatMap((task) => task.tags)).size : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.importBackdrop}>
        <View style={styles.importCard}>
          <View style={styles.importHeader}>
            <View style={styles.importHeaderTitle}><Icon name="database-import-outline" size={20} color={palette.purpleDark} /><Text style={styles.importTitle}>{guide ? "Migrate OmniFocus Data" : "Import OmniFocus Records"}</Text></View>
            <Pressable accessibilityLabel="Close import" onPress={onClose} style={styles.iconButton}><Icon name="close" size={20} color={palette.muted} /></Pressable>
          </View>

          {data ? (
            <ScrollView contentContainerStyle={styles.importContent}>
              <View style={styles.importSourceRow}><View style={styles.importFileIcon}><Icon name="file-document-outline" size={25} color={palette.purpleDark} /></View><View style={styles.importSourceCopy}><Text numberOfLines={1} style={styles.importFileName}>{data.sourceName}</Text><Text style={styles.importFormat}>{data.format}</Text></View><Icon name="check-circle" size={23} color="#57965b" /></View>
              <Text style={styles.importSectionTitle}>READY TO IMPORT</Text>
              <View style={styles.importStats}>
                <View style={styles.importStat}><Text style={styles.importStatValue}>{data.projects.length}</Text><Text style={styles.importStatLabel}>Projects</Text></View>
                <View style={styles.importStat}><Text style={styles.importStatValue}>{data.tasks.length}</Text><Text style={styles.importStatLabel}>Actions</Text></View>
                <View style={styles.importStat}><Text style={styles.importStatValue}>{inboxCount}</Text><Text style={styles.importStatLabel}>Inbox</Text></View>
                <View style={styles.importStat}><Text style={styles.importStatValue}>{completed}</Text><Text style={styles.importStatLabel}>Completed</Text></View>
                <View style={styles.importStat}><Text style={styles.importStatValue}>{tagCount}</Text><Text style={styles.importStatLabel}>Tags</Text></View>
              </View>
              {!!data.projects.length && <><Text style={styles.importSectionTitle}>PROJECTS FOUND</Text><View style={styles.importProjectList}>{data.projects.slice(0, 6).map((project) => <View key={project.id} style={styles.importProjectRow}><View style={[styles.miniDot, { backgroundColor: project.color }]} /><Text numberOfLines={1} style={styles.importProjectName}>{project.name}</Text><Text style={styles.importProjectCount}>{data.tasks.filter((task) => task.projectId === project.id).length}</Text></View>)}{data.projects.length > 6 && <Text style={styles.importMore}>+ {data.projects.length - 6} more projects</Text>}</View></>}
              {(!!data.skipped || !!data.warnings.length) && <View style={styles.importWarning}><Icon name="information-outline" size={18} color="#9b6c24" /><Text style={styles.importWarningText}>{[data.skipped ? `${data.skipped} unsupported or empty row${data.skipped === 1 ? " was" : "s were"} skipped.` : "", ...data.warnings].filter(Boolean).join(" ")}</Text></View>}
              <Text style={styles.importHelp}>Merge adds new records and ignores duplicates. Replace removes the current projects and actions, but keeps your custom perspectives.</Text>
              {replaceArmed && <View style={styles.replaceConfirm}><Text style={styles.replaceConfirmTitle}>Replace the current database?</Text><Text style={styles.replaceConfirmText}>Your current {data.tasks.length ? "projects and actions" : "records"} will be replaced by this import.</Text><View style={styles.replaceConfirmActions}><Pressable onPress={() => setReplaceArmed(false)} style={styles.cancelButton}><Text style={styles.cancelButtonText}>Cancel</Text></Pressable><Pressable onPress={() => onApply("replace")} style={styles.replaceButton}><Text style={styles.replaceButtonText}>Confirm Replace</Text></Pressable></View></View>}
            </ScrollView>
          ) : guide ? (
            <ScrollView contentContainerStyle={styles.importContent}>
              <Text style={styles.importLead}>OmniFocus does not offer a third-party API. CSV is the official portable export on iPhone, iPad, and Mac, and is the most complete way to move a live database here.</Text>
              <View style={styles.exportInstructions}>
                <Text style={styles.exportInstructionsTitle}>iPhone, iPad, or Vision Pro</Text>
                <Text style={styles.exportInstruction}>1. Open OmniFocus Settings</Text>
                <Text style={styles.exportInstruction}>2. Database → Export to CSV</Text>
                <Text style={styles.exportInstruction}>3. Share or save the file, then choose it below</Text>
              </View>
              <View style={styles.exportInstructions}>
                <Text style={styles.exportInstructionsTitle}>Mac</Text>
                <Text style={styles.exportInstruction}>1. File → Export…</Text>
                <Text style={styles.exportInstruction}>2. Choose CSV (or CSV UTF-16 if you use non-English characters)</Text>
                <Text style={styles.exportInstruction}>3. TaskPaper / Plain Text also works if you already have one</Text>
              </View>
              <View style={styles.importWarning}><Icon name="information-outline" size={18} color="#9b6c24" /><Text style={styles.importWarningText}>Skip .ofocus and .ofocus-backup files. Those packages are OmniFocus’s private transaction log, not a portable export.</Text></View>
            </ScrollView>
          ) : (
            <View style={styles.importMessageContent}>
              <View style={[styles.importMessageIcon, summary ? styles.importMessageIconSuccess : styles.importMessageIconError]}><Icon name={summary ? "check" : "file-alert-outline"} size={31} color={summary ? "#4f8b54" : palette.danger} /></View>
              <Text style={styles.importMessageTitle}>{summary ? "Import Complete" : "This file can’t be imported"}</Text>
              <Text style={styles.importMessageText}>{summary ?? error}</Text>
              {!summary && <View style={styles.exportInstructions}><Text style={styles.exportInstructionsTitle}>From OmniFocus</Text><Text style={styles.exportInstruction}>• iPhone or iPad: Settings → Database → Export to CSV</Text><Text style={styles.exportInstruction}>• Mac: File → Export → CSV or Plain Text (TaskPaper)</Text></View>}
            </View>
          )}

          <View style={styles.importFooter}>
            <Pressable onPress={onClose} style={styles.cancelButton}><Text style={styles.cancelButtonText}>{data || guide ? "Cancel" : "Done"}</Text></Pressable>
            {guide && !data && <Pressable onPress={onChooseFile} style={styles.importMergeButton}><Icon name="file-document-outline" size={16} color="#fff" /><Text style={styles.importMergeText}>Choose CSV or TaskPaper</Text></Pressable>}
            {data && !replaceArmed && <><Pressable onPress={() => setReplaceArmed(true)} style={styles.importReplaceButton}><Text style={styles.importReplaceText}>Replace</Text></Pressable><Pressable onPress={() => onApply("merge")} style={styles.importMergeButton}><Icon name="call-merge" size={16} color="#fff" /><Text style={styles.importMergeText}>Merge Records</Text></Pressable></>}
            {!data && !guide && error && <Pressable onPress={onChooseFile} style={styles.importMergeButton}><Text style={styles.importMergeText}>Choose Another File</Text></Pressable>}
          </View>
        </View>
      </View>
    </Modal>
  );
}
