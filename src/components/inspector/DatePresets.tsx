import React from "react";
import { Pressable, Text, View } from "react-native";
import { duePresetLabel } from "../../dates";
import { appStyles as styles } from "../../styles/appStyles";

export function DatePresets({ value, onChange }: {
  value?: string;
  onChange: (value?: string) => void;
}) {
  const presets: Array<{ id: string; label: string; next?: string }> = [
    { id: "none", label: "None" },
    { id: "today", label: "Today", next: duePresetLabel("today") },
    { id: "tomorrow", label: "Tomorrow", next: duePresetLabel("tomorrow") },
    { id: "weekend", label: "Weekend", next: duePresetLabel("weekend") },
    { id: "next", label: "Next Week", next: duePresetLabel("nextWeek") },
  ];
  const selected = !value ? "none" : presets.find((item) => item.next && item.next === value)?.id;
  return (
    <View style={styles.datePresets}>
      {presets.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => onChange(item.next)}
          style={[styles.datePreset, selected === item.id && styles.datePresetSelected]}
        >
          <Text style={[styles.datePresetText, selected === item.id && styles.datePresetTextSelected]}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
