import React from "react";
import { Text } from "react-native";
import { appStyles as styles } from "../../styles/appStyles";

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.fieldLabel}>{children}</Text>;
}
