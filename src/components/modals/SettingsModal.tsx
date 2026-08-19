import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { defaultToolbarButtons, outlineColumnLabels, outlineColumnOrder, palette, perspectives, toolbarButtonLabels, type AppSettings, type PerspectiveId } from "../../model";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon, type IconName } from "../ui/Icon";
import { TrafficLights } from "../ui/TrafficLights";
import { shortcutLabel } from "../../shortcuts.ts";

type SettingsSection = "general" | "appearance" | "data";

function RuleChoices({ value, options, onChange }: {
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.ruleChoices}>
      {options.map((option) => (
        <Pressable key={option.value} onPress={() => onChange(option.value)} style={[styles.ruleChoice, value === option.value && styles.ruleChoiceSelected]}>
          <Text style={[styles.ruleChoiceText, value === option.value && styles.ruleChoiceTextSelected]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function SettingsRow({ title, detail, children }: {
  title: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.settingsRow}>
      <View style={styles.settingsRowCopy}>
        <Text style={styles.settingsRowTitle}>{title}</Text>
        {!!detail && <Text style={styles.settingsRowDetail}>{detail}</Text>}
      </View>
      <View style={styles.settingsRowControl}>{children}</View>
    </View>
  );
}

export function SettingsModal({
  settings,
  projectCount,
  taskCount,
  compact,
  onChange,
  onClose,
  onImport,
  onReset,
}: {
  settings: AppSettings;
  projectCount: number;
  taskCount: number;
  compact: boolean;
  onChange: (patch: Partial<AppSettings>) => void;
  onClose: () => void;
  onImport: () => void;
  onReset: () => void;
}) {
  const [section, setSection] = useState<SettingsSection>("general");
  const sections: Array<{ id: SettingsSection; label: string; icon: IconName }> = [
    { id: "general", label: "General", icon: "tune" },
    { id: "appearance", label: "Appearance", icon: "format-paint" },
    { id: "data", label: "Data", icon: "database-outline" },
  ];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.settingsBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.settingsWindow, compact && styles.settingsWindowCompact]}>
          <View style={styles.settingsTitlebar}>
            {!compact && <View style={styles.settingsTrafficLights}><TrafficLights onClose={onClose} /></View>}
            <Text style={styles.settingsTitle}>Settings</Text>
            <Pressable onPress={onClose} style={styles.settingsDoneButton}><Text style={styles.settingsDoneText}>Done</Text></Pressable>
          </View>
          <View style={[styles.settingsBody, compact && styles.settingsBodyCompact]}>
            <View style={[styles.settingsSidebar, compact && styles.settingsSidebarCompact]}>
              {sections.map((item) => {
                const selected = section === item.id;
                return (
                  <Pressable key={item.id} onPress={() => setSection(item.id)} style={[styles.settingsNavItem, compact && styles.settingsNavItemCompact, selected && styles.settingsNavItemSelected]}>
                    <View style={[styles.settingsNavIcon, selected && styles.settingsNavIconSelected]}><Icon name={item.icon} size={17} color={selected ? "#fff" : "#66626a"} /></View>
                    <Text style={[styles.settingsNavText, selected && styles.settingsNavTextSelected]}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <ScrollView style={styles.settingsContent} contentContainerStyle={[styles.settingsContentInner, compact && styles.settingsContentInnerCompact]}>
              {section === "general" && (
                <>
                  <Text style={styles.settingsPageTitle}>General</Text>
                  <Text style={styles.settingsPageIntro}>Choose how OmniClone behaves when you open and organize your tasks.</Text>
                  <View style={styles.settingsGroup}>
                    <View style={styles.settingsStackedRow}>
                      <Text style={styles.settingsRowTitle}>Default perspective</Text>
                      <Text style={styles.settingsRowDetail}>The perspective shown when the app opens.</Text>
                      <RuleChoices
                        value={settings.defaultPerspective}
                        onChange={(defaultPerspective) => onChange({ defaultPerspective: defaultPerspective as PerspectiveId })}
                        options={perspectives.map((item) => ({ label: item.label, value: item.id }))}
                      />
                    </View>
                    <SettingsRow title="Show completed actions" detail="Include resolved actions in built-in perspectives.">
                      <Switch value={settings.showCompleted} onValueChange={(showCompleted) => onChange({
                        showCompleted,
                        standardAvailability: Object.fromEntries(Object.keys(settings.standardAvailability).map((id) => [id, showCompleted ? "all" : "remaining"])) as AppSettings["standardAvailability"],
                      })} trackColor={{ true: palette.purple }} />
                    </SettingsRow>
                    <SettingsRow title="Open Inspector on selection" detail="Reveal action details when you select an item.">
                      <Switch value={settings.openInspectorOnSelection} onValueChange={(openInspectorOnSelection) => onChange({ openInspectorOnSelection })} trackColor={{ true: palette.purple }} />
                    </SettingsRow>
                    <SettingsRow title="Confirm before deleting" detail="Ask before removing actions from the database.">
                      <Switch value={settings.confirmBeforeDelete} onValueChange={(confirmBeforeDelete) => onChange({ confirmBeforeDelete })} trackColor={{ true: palette.purple }} />
                    </SettingsRow>
                    <SettingsRow title="Clean up immediately" detail={`Hide completed and filed inbox items as soon as they change. Turn off to keep them until ${shortcutLabel("⌘K")}.`}>
                      <Switch value={settings.cleanUpImmediately} onValueChange={(cleanUpImmediately) => onChange({ cleanUpImmediately })} trackColor={{ true: palette.purple }} />
                    </SettingsRow>
                  </View>
                </>
              )}

              {section === "appearance" && (
                <>
                  <Text style={styles.settingsPageTitle}>Appearance</Text>
                  <Text style={styles.settingsPageIntro}>Tune outline density, typography, and the information shown in each view.</Text>
                  <Text style={styles.settingsGroupLabel}>OUTLINE</Text>
                  <View style={styles.settingsGroup}>
                    <View style={styles.settingsStackedRow}>
                      <Text style={styles.settingsRowTitle}>Font size</Text>
                      <RuleChoices value={settings.textSize} onChange={(textSize) => onChange({ textSize: textSize as AppSettings["textSize"] })} options={[{ label: "Small", value: "small" }, { label: "Medium", value: "medium" }, { label: "Large", value: "large" }]} />
                    </View>
                    <View style={styles.settingsStackedRow}>
                      <Text style={styles.settingsRowTitle}>Row spacing</Text>
                      <RuleChoices value={settings.rowDensity} onChange={(rowDensity) => onChange({ rowDensity: rowDensity as AppSettings["rowDensity"] })} options={[{ label: "Compact", value: "compact" }, { label: "Comfortable", value: "comfortable" }]} />
                    </View>
                    <SettingsRow title="Color text for due items">
                      <Switch value={settings.colorDueItems} onValueChange={(colorDueItems) => onChange({ colorDueItems })} trackColor={{ true: palette.purple }} />
                    </SettingsRow>
                    <SettingsRow title="Strike resolved items">
                      <Switch value={settings.strikeResolvedItems} onValueChange={(strikeResolvedItems) => onChange({ strikeResolvedItems })} trackColor={{ true: palette.purple }} />
                    </SettingsRow>
                    <SettingsRow title="Show notes in outline" detail="Display action notes under titles, matching OmniFocus View Options.">
                      <Switch value={settings.showNotesInOutline} onValueChange={(showNotesInOutline) => onChange({ showNotesInOutline })} trackColor={{ true: palette.purple }} />
                    </SettingsRow>
                  </View>
                  <Text style={styles.settingsGroupLabel}>THEME</Text>
                  <View style={styles.settingsGroup}>
                    <View style={styles.settingsStackedRow}>
                      <Text style={styles.settingsRowTitle}>Appearance</Text>
                      <Text style={styles.settingsRowDetail}>Match OmniFocus 4 light, dark, or system appearance.</Text>
                      <RuleChoices
                        value={settings.appearance}
                        onChange={(appearance) => onChange({ appearance: appearance as AppSettings["appearance"] })}
                        options={[{ label: "System", value: "system" }, { label: "Light", value: "light" }, { label: "Dark", value: "dark" }]}
                      />
                    </View>
                  </View>
                  <Text style={styles.settingsGroupLabel}>OUTLINE COLUMNS</Text>
                  <View style={styles.settingsGroup}>
                    {outlineColumnOrder.map((column) => {
                      const enabled = settings.outlineColumns.includes(column);
                      return (
                        <SettingsRow key={column} title={outlineColumnLabels[column]} detail={column === "project" ? "Hidden when the outline is grouped by project." : undefined}>
                          <Switch
                            value={enabled}
                            onValueChange={(value) => onChange({
                              outlineColumns: value
                                ? outlineColumnOrder.filter((item) => item === column || settings.outlineColumns.includes(item))
                                : settings.outlineColumns.filter((item) => item !== column),
                            })}
                            trackColor={{ true: palette.purple }}
                          />
                        </SettingsRow>
                      );
                    })}
                  </View>
                  <Text style={styles.settingsGroupLabel}>TOOLBAR</Text>
                  <View style={styles.settingsGroup}>
                    {defaultToolbarButtons.map((button) => {
                      const enabled = settings.toolbarButtons.includes(button);
                      return (
                        <SettingsRow key={button} title={toolbarButtonLabels[button]}>
                          <Switch
                            value={enabled}
                            onValueChange={(value) => {
                              const next = value
                                ? defaultToolbarButtons.filter((item) => item === button || settings.toolbarButtons.includes(item))
                                : settings.toolbarButtons.filter((item) => item !== button);
                              onChange({ toolbarButtons: next.length ? next : defaultToolbarButtons });
                            }}
                            trackColor={{ true: palette.purple }}
                          />
                        </SettingsRow>
                      );
                    })}
                  </View>
                  <Text style={styles.settingsGroupLabel}>COMPLETE</Text>
                  <View style={styles.settingsGroup}>
                    <View style={styles.settingsStackedRow}>
                      <Text style={styles.settingsRowTitle}>Await reply interval</Text>
                      <Text style={styles.settingsRowDetail}>Days to defer the follow-up when an action has no last interval.</Text>
                      <RuleChoices
                        value={String(settings.awaitReplyDays)}
                        onChange={(value) => onChange({ awaitReplyDays: Number(value) })}
                        options={[{ label: "1 day", value: "1" }, { label: "3 days", value: "3" }, { label: "7 days", value: "7" }]}
                      />
                    </View>
                  </View>
                  <Text style={styles.settingsGroupLabel}>SIDEBAR</Text>
                  <View style={styles.settingsGroup}>
                    <SettingsRow title="Show Perspectives Bar">
                      <Switch value={settings.perspectiveBarVisible} onValueChange={(perspectiveBarVisible) => onChange({ perspectiveBarVisible })} trackColor={{ true: palette.purple }} />
                    </SettingsRow>
                    <SettingsRow title="Perspectives bar shows titles">
                      <Switch value={settings.perspectiveBarShowsTitles} onValueChange={(perspectiveBarShowsTitles) => onChange({ perspectiveBarShowsTitles })} trackColor={{ true: palette.purple }} />
                    </SettingsRow>
                    <SettingsRow title="Show item counts">
                      <Switch value={settings.showSidebarCounts} onValueChange={(showSidebarCounts) => onChange({ showSidebarCounts })} trackColor={{ true: palette.purple }} />
                    </SettingsRow>
                  </View>
                </>
              )}

              {section === "data" && (
                <>
                  <Text style={styles.settingsPageTitle}>Data</Text>
                  <Text style={styles.settingsPageIntro}>Your database stays on this device and remains available offline.</Text>
                  <View style={styles.databaseCard}>
                    <View style={styles.databaseIcon}><Icon name="database-check-outline" size={28} color={palette.purpleDark} /></View>
                    <View style={styles.databaseCopy}>
                      <Text style={styles.databaseTitle}>Local database</Text>
                      <Text style={styles.databaseDetail}>{projectCount} projects · {taskCount} actions</Text>
                    </View>
                    <View style={styles.databaseStatus}><View style={styles.databaseStatusDot} /><Text style={styles.databaseStatusText}>Saved</Text></View>
                  </View>
                  <View style={styles.settingsGroup}>
                    <SettingsRow title="Import from OmniFocus" detail="Recommended: CSV from Database Settings. TaskPaper also works. Duplicate-safe merge or replace.">
                      <Pressable onPress={onImport} style={styles.settingsActionButton}><Icon name="database-import-outline" size={16} color={palette.purpleDark} /><Text style={styles.settingsActionText}>Import…</Text></Pressable>
                    </SettingsRow>
                  </View>
                  <Pressable onPress={onReset} style={styles.resetSettingsButton}><Icon name="restore" size={16} color={palette.danger} /><Text style={styles.resetSettingsText}>Restore Default Settings</Text></Pressable>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}
