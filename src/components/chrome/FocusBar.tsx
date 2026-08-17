import React from "react";
import { Pressable, Text, View } from "react-native";
import { palette } from "../../model";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon } from "../ui/Icon";

export function FocusBar({ name, onUnfocus }: { name: string; onUnfocus: () => void }) {
  return (
    <View style={styles.focusBar}>
      <Icon name="bullseye-arrow" size={16} color={palette.purpleDark} />
      <Text numberOfLines={1} style={styles.focusBarText}>Focusing on {name}</Text>
      <Pressable accessibilityLabel="Unfocus" onPress={onUnfocus} style={styles.unfocusButton}>
        <Text style={styles.unfocusButtonText}>Unfocus</Text>
      </Pressable>
    </View>
  );
}
