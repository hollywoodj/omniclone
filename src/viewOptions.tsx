import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import {
  palette,
  perspectiveColorChoices,
  perspectiveIconChoices,
  perspectives,
  type ActivePerspective,
  type CustomPerspective,
  type PerspectiveAvailability,
  type PerspectiveCombinator,
  type PerspectiveGroupBy,
  type PerspectiveOrganizeBy,
  type PerspectiveRule,
  type PerspectiveRuleKind,
  type PerspectiveSortBy,
  type PerspectiveStructure,
  type Project,
} from "./model";
import { addableRuleKinds, createRule, describeRule, ruleKindLabels } from "./perspectiveRules";

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];

function Icon({ name, size = 18, color = palette.text }: { name: IconName; size?: number; color?: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

function Segmented<T extends string>({ value, options, onChange }: {
  value: T;
  options: Array<{ label: string; value: T }>;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable key={option.value} onPress={() => onChange(option.value)} style={[styles.segment, selected && styles.segmentSelected]}>
            <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PopupSelect<T extends string>({ value, options, onChange }: {
  value: T;
  options: Array<{ label: string; value: T }>;
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <View>
      <Pressable onPress={() => setOpen((current) => !current)} style={styles.popupButton}>
        <Text style={styles.popupButtonText}>{selected?.label ?? "Choose"}</Text>
        <Icon name="chevron-down" size={16} color="#6e6b72" />
      </Pressable>
      {open && (
        <View style={styles.popupMenu}>
          {options.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
              style={[styles.popupItem, option.value === value && styles.popupItemSelected]}
            >
              <Text style={[styles.popupItemText, option.value === value && styles.popupItemTextSelected]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export function ViewOptionsPanel({
  compact,
  perspective,
  custom,
  projects,
  tags,
  availability,
  onChangeAvailability,
  showNotes,
  onChangeShowNotes,
  onChangeCustom,
  onClose,
}: {
  compact: boolean;
  perspective: ActivePerspective;
  custom?: CustomPerspective | null;
  projects: Project[];
  tags: string[];
  availability: PerspectiveAvailability;
  onChangeAvailability: (value: PerspectiveAvailability) => void;
  showNotes: boolean;
  onChangeShowNotes: (value: boolean) => void;
  onChangeCustom: (patch: Partial<CustomPerspective>) => void;
  onClose: () => void;
}) {
  const [iconPicker, setIconPicker] = useState(false);
  const [colorPicker, setColorPicker] = useState(false);
  const [addRuleOpen, setAddRuleOpen] = useState(false);
  const title = custom?.name ?? perspectives.find((item) => item.id === perspective)?.label ?? "Perspective";

  const updateRule = (id: string, patch: Partial<PerspectiveRule>) => {
    if (!custom) return;
    onChangeCustom({ rules: custom.rules.map((rule) => rule.id === id ? { ...rule, ...patch } : rule) });
  };

  const removeRule = (id: string) => {
    if (!custom || custom.rules.length <= 1) return;
    onChangeCustom({ rules: custom.rules.filter((rule) => rule.id !== id) });
  };

  const addRule = (kind: PerspectiveRuleKind) => {
    if (!custom) return;
    onChangeCustom({ rules: [...custom.rules, createRule(kind)] });
    setAddRuleOpen(false);
  };

  const body = (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {custom ? (
        <>
          <View style={styles.identity}>
            <Pressable onPress={() => { setIconPicker((value) => !value); setColorPicker(false); }} style={[styles.iconButton, { backgroundColor: `${custom.color}22` }]}>
              <Icon name={custom.icon as IconName} size={28} color={custom.color} />
            </Pressable>
            <TextInput
              value={custom.name}
              onChangeText={(name) => onChangeCustom({ name })}
              placeholder="Perspective"
              style={styles.titleInput}
            />
            <Pressable onPress={() => { setColorPicker((value) => !value); setIconPicker(false); }} style={[styles.colorSwatch, { backgroundColor: custom.color }]} />
          </View>
          {iconPicker && (
            <View style={styles.pickerCard}>
              <Text style={styles.pickerLabel}>ICON</Text>
              <View style={styles.iconGrid}>
                {perspectiveIconChoices.map((icon) => (
                  <Pressable key={icon} onPress={() => { onChangeCustom({ icon }); setIconPicker(false); }} style={[styles.iconCell, custom.icon === icon && { borderColor: custom.color, backgroundColor: `${custom.color}18` }]}>
                    <Icon name={icon as IconName} size={20} color={custom.icon === icon ? custom.color : "#5c5960"} />
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          {colorPicker && (
            <View style={styles.pickerCard}>
              <Text style={styles.pickerLabel}>COLOR</Text>
              <View style={styles.colorGrid}>
                {perspectiveColorChoices.map((color) => (
                  <Pressable key={color} onPress={() => { onChangeCustom({ color }); setColorPicker(false); }} style={[styles.colorCell, { backgroundColor: color }, custom.color === color && styles.colorCellSelected]}>
                    {custom.color === color && <Icon name="check" size={14} color="#fff" />}
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          <Text style={styles.sectionLabel}>CONTENTS</Text>
          <View style={styles.ruleTree}>
            <PopupSelect
              value={custom.combinator}
              onChange={(combinator) => onChangeCustom({ combinator: combinator as PerspectiveCombinator })}
              options={[
                { label: "All of the following:", value: "all" },
                { label: "Any of the following:", value: "any" },
                { label: "None of the following:", value: "none" },
              ]}
            />
            <View style={styles.ruleChildren}>
              {custom.rules.map((rule) => (
                <View key={rule.id} style={styles.ruleBlock}>
                  <View style={styles.ruleRow}>
                    {rule.kind === "availability" ? (
                      <View style={styles.rulePopupGrow}>
                        <PopupSelect
                          value={rule.availability ?? "remaining"}
                          onChange={(availability) => updateRule(rule.id, { availability: availability as PerspectiveAvailability })}
                          options={[
                            { label: "Availability: First Available", value: "firstAvailable" },
                            { label: "Availability: Available", value: "available" },
                            { label: "Availability: Remaining", value: "remaining" },
                            { label: "Availability: Completed", value: "completed" },
                            { label: "Availability: All", value: "all" },
                          ]}
                        />
                      </View>
                    ) : (
                      <Text style={styles.ruleText}>{describeRule(rule)}</Text>
                    )}
                    <Pressable accessibilityLabel="Delete rule" onPress={() => removeRule(rule.id)} style={styles.ruleRemove}>
                      <Icon name="minus-circle-outline" size={18} color="#8b888f" />
                    </Pressable>
                  </View>
                  {(rule.kind === "taggedAny" || rule.kind === "taggedAll") && (
                    <View style={styles.chipWrap}>
                      {tags.map((tag) => {
                        const selected = rule.tags?.some((item) => item.toLowerCase() === tag.toLowerCase());
                        return (
                          <Pressable
                            key={tag}
                            onPress={() => {
                              const current = rule.tags ?? [];
                              updateRule(rule.id, { tags: selected ? current.filter((item) => item.toLowerCase() !== tag.toLowerCase()) : [...current, tag] });
                            }}
                            style={[styles.chip, selected && { borderColor: custom.color, backgroundColor: `${custom.color}18` }]}
                          >
                            <Text style={[styles.chipText, selected && { color: custom.color, fontWeight: "700" }]}>{tag}</Text>
                          </Pressable>
                        );
                      })}
                      {!tags.length && <Text style={styles.hint}>No tags in the database yet.</Text>}
                    </View>
                  )}
                  {rule.kind === "containedIn" && (
                    <View style={styles.chipWrap}>
                      {projects.map((project) => {
                        const selected = rule.projectIds?.includes(project.id);
                        return (
                          <Pressable
                            key={project.id}
                            onPress={() => {
                              const current = rule.projectIds ?? [];
                              updateRule(rule.id, { projectIds: selected ? current.filter((id) => id !== project.id) : [...current, project.id] });
                            }}
                            style={[styles.chip, selected && { borderColor: project.color, backgroundColor: `${project.color}18` }]}
                          >
                            <View style={[styles.dot, { backgroundColor: project.color }]} />
                            <Text style={[styles.chipText, selected && { color: project.color, fontWeight: "700" }]}>{project.name}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                  {rule.kind === "matchesSearch" && (
                    <TextInput
                      value={rule.search ?? ""}
                      onChangeText={(search) => updateRule(rule.id, { search })}
                      placeholder="Search terms"
                      style={styles.field}
                    />
                  )}
                </View>
              ))}
              <View>
                <Pressable onPress={() => setAddRuleOpen((value) => !value)} style={styles.addRule}>
                  <Icon name="plus" size={16} color={palette.purpleDark} />
                  <Text style={styles.addRuleText}>Add a new rule</Text>
                </Pressable>
                {addRuleOpen && (
                  <View style={styles.addMenu}>
                    {addableRuleKinds.map((kind) => (
                      <Pressable key={kind} onPress={() => addRule(kind)} style={styles.addMenuItem}>
                        <Text style={styles.addMenuText}>{ruleKindLabels[kind]}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </View>
          </View>

          <Text style={styles.sectionLabel}>STRUCTURE</Text>
          <Segmented
            value={custom.structure}
            onChange={(structure) => onChangeCustom({ structure: structure as PerspectiveStructure, groupBy: structure === "flexible" ? "none" : custom.groupBy })}
            options={[{ label: "Flexible", value: "flexible" }, { label: "Organized", value: "organized" }]}
          />
          {custom.structure === "organized" && (
            <View style={styles.stack}>
              <Text style={styles.fieldLabel}>Organize</Text>
              <Segmented
                value={custom.organizeBy}
                onChange={(organizeBy) => onChangeCustom({ organizeBy: organizeBy as PerspectiveOrganizeBy })}
                options={[{ label: "Individual Actions", value: "actions" }, { label: "Entire Projects", value: "projects" }]}
              />
              <Text style={styles.fieldLabel}>{custom.organizeBy === "projects" ? "Group projects by" : "Group actions by"}</Text>
              <PopupSelect
                value={custom.groupBy}
                onChange={(groupBy) => onChangeCustom({ groupBy: groupBy as PerspectiveGroupBy })}
                options={[
                  { label: "Ungrouped", value: "none" },
                  { label: "Project", value: "project" },
                  { label: "Tag", value: "tag" },
                  { label: "Flagged", value: "flagged" },
                  { label: "Due Date", value: "due" },
                ]}
              />
              <Text style={styles.fieldLabel}>{custom.organizeBy === "projects" ? "Sort projects by" : "Sort actions by"}</Text>
              <PopupSelect
                value={custom.sortBy}
                onChange={(sortBy) => onChangeCustom({ sortBy: sortBy as PerspectiveSortBy })}
                options={[
                  { label: "Projects Order", value: "projects" },
                  { label: "Title", value: "title" },
                  { label: "Due Date", value: "due" },
                  { label: "Flagged", value: "flagged" },
                  { label: "Added Date", value: "added" },
                  { label: "Defer Date", value: "defer" },
                ]}
              />
            </View>
          )}
          {custom.structure === "flexible" && (
            <View style={styles.stack}>
              <Text style={styles.fieldLabel}>Initial order</Text>
              <PopupSelect
                value={custom.sortBy}
                onChange={(sortBy) => onChangeCustom({ sortBy: sortBy as PerspectiveSortBy })}
                options={[
                  { label: "Projects Order", value: "projects" },
                  { label: "Title", value: "title" },
                  { label: "Due Date", value: "due" },
                  { label: "Flagged", value: "flagged" },
                  { label: "Added Date", value: "added" },
                  { label: "Defer Date", value: "defer" },
                ]}
              />
            </View>
          )}

          <Text style={styles.sectionLabel}>LAYOUT</Text>
          <View style={styles.layoutRow}>
            <Text style={styles.layoutText}>Keep Sidebar Hidden</Text>
            <Switch value={custom.keepSidebarHidden} onValueChange={(keepSidebarHidden) => onChangeCustom({ keepSidebarHidden })} trackColor={{ true: custom.color }} />
          </View>
          <View style={styles.layoutRow}>
            <Text style={styles.layoutText}>Show notes in outline</Text>
            <Switch value={showNotes} onValueChange={onChangeShowNotes} trackColor={{ true: custom.color }} />
          </View>
        </>
      ) : (
        <>
          <Text style={styles.standardTitle}>In {title}, show</Text>
          <PopupSelect
            value={availability}
            onChange={onChangeAvailability}
            options={[
              { label: "First Available", value: "firstAvailable" },
              { label: "Available", value: "available" },
              { label: "Remaining", value: "remaining" },
              { label: "Completed", value: "completed" },
              { label: "All", value: "all" },
            ]}
          />
          <Text style={styles.sectionLabel}>LAYOUT</Text>
          <View style={styles.layoutRow}>
            <Text style={styles.layoutText}>Show notes in outline</Text>
            <Switch value={showNotes} onValueChange={onChangeShowNotes} trackColor={{ true: palette.purple }} />
          </View>
          <Text style={styles.hint}>Availability settings have global scope, matching OmniFocus View Options.</Text>
        </>
      )}
    </ScrollView>
  );

  if (compact) {
    return (
      <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <View style={styles.sheetRoot}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>View Options</Text>
              <Pressable onPress={onClose}><Text style={styles.done}>Done</Text></Pressable>
            </View>
            {body}
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <View style={styles.popover} pointerEvents="box-none">
      <View style={styles.popoverCard}>
        <View style={styles.popoverHeader}>
          <Text style={styles.popoverTitle}>View Options</Text>
        </View>
        {body}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  popover: {
    position: "absolute",
    top: 88,
    left: 118,
    zIndex: 80,
  },
  popoverCard: {
    width: 372,
    maxHeight: 620,
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#b7b4ba",
    backgroundColor: "#f4f3f5",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 32,
    elevation: 20,
  },
  popoverHeader: {
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#d5d2d7",
    backgroundColor: "#ecebed",
  },
  popoverTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#3a373d",
  },
  sheetRoot: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(20,18,22,.32)",
  },
  sheet: {
    maxHeight: "92%",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: "#f4f3f5",
    overflow: "hidden",
  },
  sheetHeader: {
    height: 48,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.line,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  done: {
    fontSize: 15,
    fontWeight: "600",
    color: palette.purpleDark,
  },
  scroll: {
    flexGrow: 0,
  },
  content: {
    padding: 14,
    paddingBottom: 22,
    gap: 8,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  titleInput: {
    flex: 1,
    height: 40,
    fontSize: 20,
    fontWeight: "700",
    color: palette.text,
    padding: 0,
  },
  colorSwatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  pickerCard: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d8d5da",
  },
  pickerLabel: {
    marginBottom: 8,
    fontSize: 9,
    letterSpacing: 0.8,
    fontWeight: "700",
    color: "#817d85",
  },
  iconGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  iconCell: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d4d1d6",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f7f6f8",
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  colorCell: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  colorCellSelected: {
    borderWidth: 2,
    borderColor: "#fff",
  },
  sectionLabel: {
    marginTop: 10,
    marginBottom: 4,
    fontSize: 10,
    letterSpacing: 0.7,
    fontWeight: "700",
    color: "#817d85",
  },
  ruleTree: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d8d5da",
    gap: 8,
  },
  ruleChildren: {
    marginLeft: 8,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: "#e4e1e6",
    gap: 8,
  },
  ruleBlock: {
    gap: 6,
  },
  ruleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  rulePopupGrow: {
    flex: 1,
  },
  ruleText: {
    flex: 1,
    fontSize: 12,
    color: "#3a373d",
  },
  ruleRemove: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  addRule: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  addRuleText: {
    fontSize: 12,
    color: palette.purpleDark,
    fontWeight: "600",
  },
  addMenu: {
    overflow: "hidden",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d0cdd3",
    backgroundColor: "#fbfafc",
  },
  addMenuItem: {
    minHeight: 30,
    paddingHorizontal: 10,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eceaed",
  },
  addMenuText: {
    fontSize: 12,
    color: "#3a373d",
  },
  segmented: {
    flexDirection: "row",
    padding: 2,
    borderRadius: 8,
    backgroundColor: "#e4e2e6",
  },
  segment: {
    flex: 1,
    minHeight: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    paddingHorizontal: 4,
  },
  segmentSelected: {
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentText: {
    fontSize: 11,
    color: "#5c5960",
    textAlign: "center",
  },
  segmentTextSelected: {
    color: palette.text,
    fontWeight: "700",
  },
  popupButton: {
    minHeight: 30,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#cfcdd2",
    backgroundColor: "#f7f6f8",
  },
  popupButtonText: {
    fontSize: 12,
    color: "#3a373d",
  },
  popupMenu: {
    marginTop: 4,
    overflow: "hidden",
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d0cdd3",
    backgroundColor: "#fff",
  },
  popupItem: {
    minHeight: 30,
    paddingHorizontal: 10,
    justifyContent: "center",
  },
  popupItemSelected: {
    backgroundColor: palette.purpleSoft,
  },
  popupItemText: {
    fontSize: 12,
    color: "#3a373d",
  },
  popupItemTextSelected: {
    color: palette.purpleDark,
    fontWeight: "700",
  },
  stack: {
    gap: 6,
  },
  fieldLabel: {
    marginTop: 4,
    fontSize: 11,
    color: "#6e6b72",
  },
  field: {
    minHeight: 32,
    paddingHorizontal: 8,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#cfcdd2",
    backgroundColor: "#fff",
    fontSize: 12,
    color: palette.text,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    minHeight: 26,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d0cdd3",
    backgroundColor: "#f7f6f8",
  },
  chipText: {
    fontSize: 11,
    color: "#5c5960",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  layoutRow: {
    minHeight: 38,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 10,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d8d5da",
  },
  layoutText: {
    fontSize: 12,
    color: "#3a373d",
  },
  standardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: palette.text,
  },
  hint: {
    fontSize: 11,
    lineHeight: 15,
    color: palette.muted,
  },
});
