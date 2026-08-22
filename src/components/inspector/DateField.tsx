import React, { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import {
  applyDueTimePreset,
  calendarMonth,
  dayKey,
  duePresetLabel,
  dueTimePreset,
  parseDueLabel,
  setCalendarDate,
  todayKey,
} from "../../dates";
import { palette, type DueTimePreset } from "../../model";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon } from "../ui/Icon";
import { DatePresets } from "./DatePresets";
import { FieldLabel } from "./FieldLabel";

const weekdayHeaders = ["S", "M", "T", "W", "T", "F", "S"];
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function DateField({ value, onChange, compact = false }: {
  value?: string;
  onChange: (value?: string) => void;
  compact?: boolean;
}) {
  const selected = parseDueLabel(value);
  const initial = selected ?? new Date();
  const [cursor, setCursor] = useState(() => ({ year: initial.getFullYear(), month: initial.getMonth() }));
  const cells = useMemo(() => calendarMonth(cursor.year, cursor.month), [cursor.month, cursor.year]);
  const selectedKey = selected ? dayKey(selected) : null;
  const today = todayKey();
  const timeKind = dueTimePreset(value);
  const timePresets: Array<{ id: DueTimePreset; label: string }> = [
    { id: "none", label: "None" },
    { id: "morning", label: "Morning" },
    { id: "afternoon", label: "Afternoon" },
    { id: "evening", label: "Evening" },
  ];
  const shiftMonth = (delta: number) => {
    setCursor((current) => {
      const date = new Date(current.year, current.month + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  };

  return (
    <View>
      <DatePresets value={value} onChange={onChange} />
      <View style={styles.calendarCard}>
        <View style={styles.calendarHeader}>
          <Pressable accessibilityLabel="Previous month" onPress={() => shiftMonth(-1)} hitSlop={8} style={styles.calendarNav}>
            <Icon name="chevron-left" size={18} color="#5f5c63" />
          </Pressable>
          <Text style={styles.calendarTitle}>{monthNames[cursor.month]} {cursor.year}</Text>
          <Pressable accessibilityLabel="Next month" onPress={() => shiftMonth(1)} hitSlop={8} style={styles.calendarNav}>
            <Icon name="chevron-right" size={18} color="#5f5c63" />
          </Pressable>
        </View>
        <View style={styles.calendarWeekRow}>
          {weekdayHeaders.map((day, index) => (
            <Text key={`${day}-${index}`} style={styles.calendarWeekday}>{day}</Text>
          ))}
        </View>
        <View style={styles.calendarGrid}>
          {cells.map((cell) => {
            const selectedDay = cell.key === selectedKey;
            const isToday = cell.key === today;
            return (
              <Pressable
                key={cell.key}
                onPress={() => onChange(setCalendarDate(value, cell.date))}
                style={[
                  styles.calendarDay,
                  !cell.inMonth && styles.calendarDayMuted,
                  selectedDay && styles.calendarDaySelected,
                  isToday && !selectedDay && styles.calendarDayToday,
                ]}
              >
                <Text style={[styles.calendarDayText, selectedDay && styles.calendarDayTextSelected, !cell.inMonth && styles.calendarDayTextMuted]}>{cell.day}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <FieldLabel>Time</FieldLabel>
      <View style={styles.datePresets}>
        {timePresets.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => onChange(value ? applyDueTimePreset(value, item.id) : applyDueTimePreset(duePresetLabel("today"), item.id))}
            style={[styles.datePreset, timeKind === item.id && styles.datePresetSelected]}
          >
            <Text style={[styles.datePresetText, timeKind === item.id && styles.datePresetTextSelected]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      {!compact && (
        <TextInput
          value={value ?? ""}
          onChangeText={(next) => onChange(next.trim() ? next : undefined)}
          placeholder="None"
          style={styles.fieldInput}
          accessibilityLabel="Date"
        />
      )}
      {timeKind === "custom" && !!value && (
        <TextInput
          value={value}
          onChangeText={(next) => onChange(next.trim() ? next : undefined)}
          placeholder="Today, 4:30 PM"
          style={[styles.fieldInput, { marginTop: 6 }]}
          accessibilityLabel="Custom time"
        />
      )}
      {!!value && (
        <Pressable onPress={() => onChange(undefined)} style={styles.calendarClear}>
          <Text style={[styles.datePresetText, { color: palette.purpleDark }]}>Clear Date</Text>
        </Pressable>
      )}
    </View>
  );
}
