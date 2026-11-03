import { Pressable, StyleSheet } from "react-native";

import { choose } from "@/lib/dialogs";
import { NW_SORTS } from "@/lib/sort";
import { useColors } from "@/theme";

import { Icon } from "./icon";
import type { SortButtonProps } from "./sort-button.types";

/** Android and web: the same small icon, picking from a list of choices. */
export function SortButton({ value, onChange }: SortButtonProps) {
  const c = useColors();
  const pick = async () => {
    const i = await choose({
      title: "Sort By",
      options: NW_SORTS.map((o) => ({
        label: o.key === value ? `✓ ${o.title}` : o.title,
      })),
    });
    if (i != null) onChange(NW_SORTS[i].key);
  };
  return (
    <Pressable
      onPress={pick}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel="Sort By"
      style={({ pressed }) => [styles.button, pressed && { opacity: 0.5 }]}
    >
      <Icon name="arrow.up.arrow.down" size={13} color={c.secondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { paddingLeft: 10, alignSelf: "center" },
});
