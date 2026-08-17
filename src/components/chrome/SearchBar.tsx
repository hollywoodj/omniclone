import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { appStyles as styles } from "../../styles/appStyles";
import { Icon } from "../ui/Icon";

export function SearchBar({
  query,
  resultCount,
  onChangeQuery,
  onClose,
}: {
  query: string;
  resultCount: number;
  onChangeQuery: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.searchBar}>
      <Icon name="magnify" size={18} color="#77747b" />
      <TextInput autoFocus value={query} onChangeText={onChangeQuery} placeholder="Search Remaining" style={styles.searchInput} />
      {!!query.trim() && <Text style={styles.searchCount}>{resultCount}</Text>}
      <Pressable onPress={onClose}><Text style={styles.searchDone}>Done</Text></Pressable>
    </View>
  );
}
